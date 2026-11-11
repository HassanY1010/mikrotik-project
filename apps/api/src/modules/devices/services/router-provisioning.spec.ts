import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException, BadGatewayException } from '@nestjs/common';
import { RouterProvisioningService } from './router-provisioning.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { EncryptionService } from '../../../core/security/encryption.service';
import { PlanSigningService } from '../../../core/security/signing.service';
import { ProvisionPreviewDto } from '../dto/provision-preview.dto';
import { ProvisionApplyDto } from '../dto/provision-apply.dto';
import { isValidIpv4Cidr } from '../../../core/security/snapshot-integrity.util';

describe('RouterProvisioningService (MikroTik Provisioning Engine Phase 1)', () => {
  let service: RouterProvisioningService;

  const mockEncryptionService = {
    deriveDeterministicSecret: jest.fn().mockReturnValue('mock_prov_derived_secret'),
  };

  const mockMikrotikClient: any = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    getSystemResource: jest.fn().mockResolvedValue({
      uptime: '15d',
      version: '7.15.2',
      cpuLoad: 5,
      freeMemory: 120000000,
      totalMemory: 256000000,
      freeHdd: 30000000,
      totalHdd: 64000000,
    }),
    listInterfaces: jest.fn().mockResolvedValue([
      { name: 'ether1', type: 'ether', running: true, disabled: false },
      { name: 'ether2', type: 'ether', running: true, disabled: false },
      { name: 'ether3', type: 'ether', running: false, disabled: false },
      { name: 'ether4', type: 'ether', running: false, disabled: false },
      { name: 'ether5', type: 'ether', running: false, disabled: false },
    ]),
    listBridges: jest.fn().mockResolvedValue([]),
    listBridgePorts: jest.fn().mockResolvedValue([]),
    listIpAddresses: jest.fn().mockResolvedValue([
      { address: '192.168.88.1/24', interface: 'ether2', disabled: false },
    ]),
    listDhcpClients: jest.fn().mockResolvedValue([]),
    listDhcpServers: jest.fn().mockResolvedValue([]),
    listNatRules: jest.fn().mockResolvedValue([]),
    listRoutes: jest.fn().mockResolvedValue([
      {
        dstAddress: '0.0.0.0/0',
        gateway: '192.168.1.1',
        'gateway-status': '192.168.1.1 reachable via ether1',
        active: true,
        disabled: false,
      },
    ]),
    listHotspotServers: jest.fn().mockResolvedValue([]),
    createBackup: jest.fn().mockResolvedValue({
      filename: 'pre-sudafi-backup.backup',
      size: 52400,
      creationTime: '2026-10-20 12:00:00',
    }),
    runRawCommand: jest.fn().mockResolvedValue(undefined),
    pingHost: jest.fn().mockResolvedValue({
      host: '8.8.8.8',
      packetsSent: 3,
      packetsReceived: 3,
      packetLossPercent: 0,
      avgRttMs: 14.5,
      isReachable: true,
    }),
  };

  const mockClientFactory = {
    getClient: jest.fn().mockResolvedValue(mockMikrotikClient),
  };

  const sampleDevice = {
    id: 'dev-001',
    tenantId: 'tenant-001',
    name: 'Main Router CCR1009',
    host: '192.168.88.1',
    apiPort: 8728,
    restPort: 443,
    useSsl: false,
    username: 'admin',
    passwordEncrypted: 'enc-pass',
    iv: 'iv-sample',
    authTag: 'tag-sample',
    rosVersion: 'V7',
    deletedAt: null,
  };

  const mockPrisma: any = {
    mikroTikDevice: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'dev-001', isOnline: true }),
    },
    hotspotProfile: {
      upsert: jest.fn().mockResolvedValue({ id: 'prof-001', name: 'hsp-sudafi' }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockClientFactory.getClient = jest.fn().mockResolvedValue(mockMikrotikClient);
    mockMikrotikClient.runRawCommand = jest.fn().mockResolvedValue(undefined);
    mockMikrotikClient.createBackup = jest.fn().mockResolvedValue({
      filename: 'pre-sudafi-backup.backup',
      size: 52400,
      creationTime: '2026-10-20 12:00:00',
    });
    mockMikrotikClient.pingHost = jest.fn().mockResolvedValue({
      host: '8.8.8.8',
      packetsSent: 3,
      packetsReceived: 3,
      packetLossPercent: 0,
      avgRttMs: 14.5,
      isReachable: true,
    });
    mockMikrotikClient.listHotspotServers = jest.fn().mockResolvedValue([]);
    mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([]);
    mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
      { address: '192.168.88.1/24', interface: 'ether2', disabled: false },
    ]);
    mockMikrotikClient.listBridges = jest.fn().mockResolvedValue([]);
    mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue([
      {
        dstAddress: '0.0.0.0/0',
        gateway: '192.168.1.1',
        'gateway-status': '192.168.1.1 reachable via ether1',
        active: true,
        disabled: false,
      },
    ]);
    mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue([
      { name: 'ether1', type: 'ether', running: true, disabled: false },
      { name: 'ether2', type: 'ether', running: true, disabled: false },
      { name: 'ether3', type: 'ether', running: false, disabled: false },
      { name: 'ether4', type: 'ether', running: false, disabled: false },
      { name: 'ether5', type: 'ether', running: false, disabled: false },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouterProvisioningService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MikrotikClientFactory, useValue: mockClientFactory },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<RouterProvisioningService>(RouterProvisioningService);
  });

  describe('1. Discovery (استكشاف الشبكة والمنافذ)', () => {
    it('should query live interfaces, bridges, ips, and routes from router', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

      const snapshot = await service.discover('tenant-001', 'dev-001');

      expect(snapshot).toBeDefined();
      expect(snapshot.interfaces).toHaveLength(5);
      expect(snapshot.interfaces[0].name).toBe('ether1');
      expect(snapshot.ipAddresses).toHaveLength(1);
      expect(snapshot.resource.version).toBe('7.15.2');
      expect(mockMikrotikClient.listInterfaces).toHaveBeenCalled();
    });

    it('should throw NotFoundException if device does not exist or tenant mismatched', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      await expect(service.discover('tenant-001', 'non-existing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('2. Preview & Conflict Detection (المعاينة وفحص التعارضات)', () => {
    const validDto: ProvisionPreviewDto = {
      template: 'CLEAN_SETUP',
      wan: {
        interface: 'ether1',
        mode: 'DHCP',
        enableNat: true,
      },
      lan: {
        bridgeName: 'bridge-hotspot',
        memberInterfaces: ['ether3', 'ether4', 'ether5'],
        gatewayIp: '10.5.50.1/24',
        poolRange: '10.5.50.10-10.5.50.254',
      },
      hotspot: {
        serverName: 'hs-sudafi',
        profileName: 'hsp-sudafi',
        dnsName: 'login.sudafi.net',
      },
    };

    it('should generate planned steps and valid RouterOS commands', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

      const preview = await service.preview('tenant-001', 'dev-001', validDto);

      expect(preview.canProceed).toBe(true);
      expect(preview.plannedSteps.length).toBeGreaterThanOrEqual(4);
      expect(preview.generatedCommands.some((c) => c.stage === 'BRIDGE_SETUP')).toBe(true);
      expect(preview.generatedCommands.some((c) => c.stage === 'WAN_CONFIG')).toBe(true);
      expect(preview.generatedCommands.some((c) => c.stage === 'FIREWALL_NAT')).toBe(true);
      expect(preview.generatedCommands.some((c) => c.stage === 'HOTSPOT_SERVER')).toBe(true);
    });

    it('should detect WAN port already assigned to a Bridge', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listBridgePorts.mockResolvedValueOnce([
        { bridge: 'bridge-local', interface: 'ether1' },
      ]);

      const preview = await service.preview('tenant-001', 'dev-001', validDto);

      expect(preview.canProceed).toBe(false);
      expect(preview.conflicts.some((c) => c.resource === 'WAN_BRIDGE_CONFLICT')).toBe(true);
    });

    it('should detect overlap between WAN port and LAN member interfaces', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      const invalidOverlapDto = {
        ...validDto,
        lan: {
          ...validDto.lan,
          memberInterfaces: ['ether1', 'ether2'], // ether1 is WAN!
        },
      };

      const preview = await service.preview('tenant-001', 'dev-001', invalidOverlapDto);

      expect(preview.canProceed).toBe(false);
      expect(preview.conflicts.some((c) => c.resource === 'WAN_LAN_OVERLAP')).toBe(true);
    });

    it('should detect IP subnet overlap with existing interfaces', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      // Existing router has 10.5.50.1 on ether3
      mockMikrotikClient.listIpAddresses.mockResolvedValueOnce([
        { address: '10.5.50.1/24', interface: 'ether3', disabled: false },
      ]);

      const preview = await service.preview('tenant-001', 'dev-001', {
        ...validDto,
        template: 'CUSTOM',
      });

      expect(preview.canProceed).toBe(false);
      expect(preview.conflicts.some((c) => c.resource === 'IP_SUBNET_OVERLAP')).toBe(true);
    });

    it('should flag requiresCleanConfirmation when CLEAN_SETUP is chosen on in-use router', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      // Router has multiple IPs and bridges
      mockMikrotikClient.listBridges.mockResolvedValueOnce([{ name: 'bridge-lan' }]);

      const preview = await service.preview('tenant-001', 'dev-001', validDto);

      expect(preview.requiresCleanConfirmation).toBe(true);
      expect(preview.warnings.some((w) => w.type === 'CLEAN_SETUP_IN_USE_ROUTER')).toBe(true);
    });
  });

  describe('3. Apply Provisioning (التنفيذ الفعلي والأمان والنسخ الاحتياطي)', () => {
    const applyDto: ProvisionApplyDto = {
      template: 'CLEAN_SETUP',
      cleanSetupConfirmed: true,
      allowOverwrite: true,
      wan: {
        interface: 'ether1',
        mode: 'DHCP',
        enableNat: true,
      },
      lan: {
        bridgeName: 'bridge-hotspot',
        memberInterfaces: ['ether3', 'ether4'],
        gatewayIp: '10.5.50.1/24',
      },
      hotspot: {
        serverName: 'hs-sudafi',
        profileName: 'hsp-sudafi',
        dnsName: 'login.sudafi.net',
      },
    };

    it('should block execution if cleanSetupConfirmed is missing on in-use router', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listBridges.mockResolvedValueOnce([{ name: 'bridge-existing' }]);

      const unconfirmedDto: ProvisionApplyDto = {
        ...applyDto,
        cleanSetupConfirmed: false,
      };

      await expect(
        service.apply('tenant-001', 'dev-001', unconfirmedDto, 'user-01'),
      ).rejects.toThrow(ConflictException);

      expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
    });

    it('should block execution if conflicts exist and allowOverwrite is false', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listBridgePorts.mockResolvedValueOnce([
        { bridge: 'bridge-main', interface: 'ether1' },
      ]);

      const safeDto: ProvisionApplyDto = {
        ...applyDto,
        allowOverwrite: false,
      };

      await expect(service.apply('tenant-001', 'dev-001', safeDto, 'user-01')).rejects.toThrow(
        ConflictException,
      );

      expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
    });

    it('should create pre-backup, execute commands sequentially, verify and sync with DB', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listHotspotServers.mockResolvedValue([
        { name: 'hs-sudafi', interface: 'bridge-hotspot', disabled: false, invalid: false },
      ]);

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-01');

      expect(result.success).toBe(true);
      expect(result.backupFilename).toBe('pre-sudafi-backup.backup');
      expect(mockMikrotikClient.createBackup).toHaveBeenCalledWith(
        expect.any(String),
        'mock_prov_derived_secret',
      );
      const preBackupStage = result.executedStages.find((s) => s.stage === 'PRE_BACKUP');
      expect(preBackupStage?.command).toContain('password=******');
      expect(preBackupStage?.command).not.toContain('mock_prov_derived_secret');
      expect(mockMikrotikClient.runRawCommand).toHaveBeenCalled();
      expect(result.executedStages.some((s) => s.stage === 'PRE_BACKUP')).toBe(true);
      expect(result.executedStages.some((s) => s.stage === 'BRIDGE_SETUP')).toBe(true);
      expect(result.executedStages.some((s) => s.stage === 'HOTSPOT_SERVER')).toBe(true);
      expect(result.verification.overallStatus).toBe('VERIFIED_READY');
      expect(mockPrisma.hotspotProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId_deviceId_name: {
              tenantId: 'tenant-001',
              deviceId: 'dev-001',
              name: 'hsp-sudafi',
            },
          }),
        }),
      );
    });

    it('should abort safely if pre-backup fails (preventing unbacked changes)', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.createBackup.mockRejectedValueOnce(new Error('Out of disk space'));

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-01');

      expect(result.success).toBe(false);
      expect(result.failedStage).toBe('PRE_BACKUP');
      expect(result.failureReason).toContain('Out of disk space');
      expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
    });

    it('should halt on command failure and return explicit recovery instructions referencing backup', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      // Simulate failure during Hotspot profile creation
      mockMikrotikClient.runRawCommand.mockImplementation(async (words: string[]) => {
        if (words.some((w) => w.includes('hotspot/profile'))) {
          throw new Error('Profile quota syntax error');
        }
      });

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-01');

      expect(result.success).toBe(false);
      expect(result.failedStage).toBe('HOTSPOT_PROFILE');
      expect(result.recoveryInstructions).toContain('pre-sudafi-backup.backup');
    });

    it('should adapt idempotently if resources already exist', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      // Bridge already exists error from RouterOS
      mockMikrotikClient.runRawCommand.mockRejectedValueOnce(
        new Error('failure: already have bridge with this name'),
      );
      mockMikrotikClient.listHotspotServers.mockResolvedValue([
        { name: 'hs-sudafi', interface: 'bridge-hotspot', disabled: false, invalid: false },
      ]);

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-01');

      expect(result.success).toBe(true);
      const bridgeStage = result.executedStages.find((s) => s.stage === 'BRIDGE_SETUP');
      expect(bridgeStage?.status).toBe('SUCCESS');
      expect(bridgeStage?.error).toContain('Notice: Existing entry adapted');
    });
  });

  describe('4. Multi-Point Verification (التحقق المتعدد من الشبكة والإنترنت والهوتسبوت)', () => {
    it('should detect when Hotspot is operational but Internet is unreachable', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.pingHost.mockResolvedValue({
        host: '8.8.8.8',
        packetsSent: 3,
        packetsReceived: 0,
        packetLossPercent: 100,
        isReachable: false,
      });
      mockMikrotikClient.listHotspotServers.mockResolvedValue([
        { name: 'hs-sudafi', interface: 'bridge-hotspot', disabled: false, invalid: false },
      ]);

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        allowOverwrite: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-01');

      expect(result.verification.overallStatus).toBe('PARTIALLY_VERIFIED');
      expect(result.verification.internetReachable).toBe(false);
      expect(result.verification.hotspotOperational).toBe(true);
      expect(result.verification.diagnosticsMessage).toContain('تعذر الوصول إلى الإنترنت');
    });
  });

  describe('5. Critical Safety Guarantees (ضمانات الأمان الصارمة والنسخ الاحتياطي)', () => {
    it('should strictly block bridging direct management IP port even if allowOverwrite is true', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      const lockoutDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        allowOverwrite: true, // Attempt generic overwrite
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' }, // ether2 has 192.168.88.1 (host IP)
      };

      await expect(
        service.apply('tenant-001', 'dev-001', lockoutDto, 'user-01'),
      ).rejects.toThrow(ConflictException);

      expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
    });

    it('should halt safely without changes if client lacks createBackup method and skipBackupOnError is false', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      const clientWithoutBackup = { ...mockMikrotikClient, createBackup: undefined };
      mockClientFactory.getClient.mockResolvedValue(clientWithoutBackup);

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        allowOverwrite: true,
        skipBackupOnError: false,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-01');

      expect(result.success).toBe(false);
      expect(result.failedStage).toBe('PRE_BACKUP');
      expect(result.failureReason).toContain('لا يدعم إنشاء نسخة احتياطية آمنة');
      expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
    });

    it('should mask PPPoE passwords in preview commands and executed logs to prevent credential leakage', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: {
          interface: 'ether1',
          mode: 'PPPOE',
          pppoeUser: 'isp_user_test',
          pppoePassword: 'SuperSecretPassword123!',
        },
        lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);
      const wanCmd = preview.generatedCommands.find((c) => c.stage === 'WAN_CONFIG');

      expect(wanCmd).toBeDefined();
      expect(wanCmd!.command).toContain('=user=isp_user_test');
      expect(wanCmd!.command).toContain('=password=********');
      expect(wanCmd!.command).not.toContain('SuperSecretPassword123!');
    });

    it('should detect direct IP on member interface and flag critical conflict if it matches device.host', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice); // device.host is '192.168.88.1'
      mockMikrotikClient.listIpAddresses.mockResolvedValue([
        { address: '192.168.88.1/24', interface: 'ether2', disabled: false },
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      const lockoutConflict = preview.conflicts.find((c) => c.resource === 'MANAGEMENT_PORT_BRIDGED');
      expect(lockoutConflict).toBeDefined();
      expect(lockoutConflict!.details).toContain('فقدان الاتصال بالراوتر');

      const directIpWarning = preview.warnings.find((w) => w.type === 'PORT_DIRECT_IP_RISK');
      expect(directIpWarning).toBeDefined();
      expect(directIpWarning!.severity).toBe('CRITICAL');
    });

    it('should avoid generating duplicate Bridge, IP and NAT commands if already present in router discovery', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      // Simulate existing bridge, existing IP on bridge, and existing NAT
      mockMikrotikClient.listBridges.mockResolvedValue([{ name: 'bridge-hotspot' }]);
      mockMikrotikClient.listIpAddresses.mockResolvedValue([
        { address: '10.5.50.1/24', interface: 'bridge-hotspot', disabled: false },
      ]);
      mockMikrotikClient.listNatRules.mockResolvedValue([
        { chain: 'srcnat', action: 'masquerade', outInterface: 'ether1', disabled: false },
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      // Verify no duplicate BRIDGE_SETUP
      expect(preview.generatedCommands.some((c) => c.stage === 'BRIDGE_SETUP')).toBe(false);
      // Verify no duplicate LAN_IP
      expect(preview.generatedCommands.some((c) => c.stage === 'LAN_IP')).toBe(false);
      // Verify no duplicate FIREWALL_NAT
      expect(preview.generatedCommands.some((c) => c.stage === 'FIREWALL_NAT')).toBe(false);
      // Verify new port is still added
      expect(preview.generatedCommands.some((c) => c.stage === 'BRIDGE_PORT')).toBe(true);
    });
  });

  describe('6. Anti-Sharing & Security Policies (سياسات الحماية ومكافحة مشاركة الإنترنت)', () => {
    it('should include anti-tethering, client isolation, management drop and DNS redirect commands by default', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      // 1. Verify Anti-Tethering Mangle rule
      const antiTetheringCmd = preview.generatedCommands.find(
        (c) => c.stage === 'SECURITY_POLICIES' && c.command.includes('SudaFi_Anti_Tethering_TTL'),
      );
      expect(antiTetheringCmd).toBeDefined();
      expect(antiTetheringCmd!.command).toContain('=action=change-ttl =new-ttl=set:1');
      expect(antiTetheringCmd!.command).toContain('=out-interface=bridge-hotspot');

      // 2. Verify Client Isolation on bridge member port
      const bridgePortCmd = preview.generatedCommands.find(
        (c) => c.stage === 'BRIDGE_PORT' && c.command.includes('ether2'),
      );
      expect(bridgePortCmd).toBeDefined();
      expect(bridgePortCmd!.command).toContain('=horizon=1');

      // 3. Verify Management Access Drop
      const mgmtDropCmd = preview.generatedCommands.find(
        (c) => c.stage === 'SECURITY_POLICIES' && c.command.includes('SudaFi_Drop_Subscriber_Admin_Ports'),
      );
      expect(mgmtDropCmd).toBeDefined();
      expect(mgmtDropCmd!.command).toContain('=dst-port=22,23,8291,8728,8729 =action=drop');

      // 4. Verify DNS Redirection (UDP and TCP)
      const dnsUdpCmd = preview.generatedCommands.find(
        (c) => c.stage === 'SECURITY_POLICIES' && c.command.includes('SudaFi_Force_DNS_UDP'),
      );
      const dnsTcpCmd = preview.generatedCommands.find(
        (c) => c.stage === 'SECURITY_POLICIES' && c.command.includes('SudaFi_Force_DNS_TCP'),
      );
      expect(dnsUdpCmd).toBeDefined();
      expect(dnsTcpCmd).toBeDefined();

      // 5. Verify Security Report contains realistic effect and known limitations
      expect(preview.securityPoliciesReport).toBeDefined();
      expect(preview.securityPoliciesReport.length).toBeGreaterThanOrEqual(5);

      const antiTetheringReport = preview.securityPoliciesReport.find((r) => r.id === 'ANTI_TETHERING');
      expect(antiTetheringReport).toBeDefined();
      expect(antiTetheringReport!.realisticEffect).toContain('Mobile Hotspot');
      expect(antiTetheringReport!.knownLimitations).toContain('Rooted Android');
    });

    it('should respect independent toggles to disable specific security policies', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
        securityPolicies: {
          antiTethering: false,
          clientIsolation: false,
          protectManagementAccess: true,
          forceRouterDns: false,
        },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      // Verify Anti-Tethering is NOT generated
      expect(preview.generatedCommands.some((c) => c.command.includes('SudaFi_Anti_Tethering_TTL'))).toBe(false);

      // Verify Bridge port does NOT have horizon
      const bridgePortCmd = preview.generatedCommands.find((c) => c.stage === 'BRIDGE_PORT');
      expect(bridgePortCmd!.command).not.toContain('=horizon=1');

      // Verify DNS redirect is NOT generated
      expect(preview.generatedCommands.some((c) => c.command.includes('SudaFi_Force_DNS_UDP'))).toBe(false);

      // Verify Management drop is still generated
      expect(preview.generatedCommands.some((c) => c.command.includes('SudaFi_Drop_Subscriber_Admin_Ports'))).toBe(true);

      // Verify report statuses
      const tetheringReport = preview.securityPoliciesReport.find((r) => r.id === 'ANTI_TETHERING');
      expect(tetheringReport!.status).toBe('DISABLED');
      const mgmtReport = preview.securityPoliciesReport.find((r) => r.id === 'PROTECT_MANAGEMENT');
      expect(mgmtReport!.status).toBe('PROPOSED');
    });

    it('should verify security policies during apply and mark verification successful', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listMangleRules = jest.fn().mockResolvedValue([
        { chain: 'postrouting', action: 'change-ttl', comment: 'SudaFi_Anti_Tethering_TTL', disabled: false },
      ]);
      mockMikrotikClient.listFilterRules = jest.fn().mockResolvedValue([
        { chain: 'input', action: 'drop', comment: 'SudaFi_Drop_Subscriber_Admin_Ports', disabled: false },
      ]);

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        securityPolicies: {
          antiTethering: true,
          protectManagementAccess: true,
        },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-admin');

      expect(result.success).toBe(true);
      expect(result.verification.securityPoliciesVerified).toBe(true);
    });

    it('should mark securityPoliciesVerified as false if anti-tethering rule is missing on router during verification', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listMangleRules = jest.fn().mockResolvedValue([]);
      mockMikrotikClient.listFilterRules = jest.fn().mockResolvedValue([]);

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        securityPolicies: {
          antiTethering: true,
        },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-admin');

      expect(result.verification.securityPoliciesVerified).toBe(false);
    });

    it('should avoid duplicating mangle and filter rules if already present in router discovery snapshot', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listMangleRules = jest.fn().mockResolvedValue([
        { chain: 'postrouting', action: 'change-ttl', comment: 'SudaFi_Anti_Tethering_TTL', disabled: false },
      ]);
      mockMikrotikClient.listFilterRules = jest.fn().mockResolvedValue([
        { chain: 'input', action: 'drop', comment: 'SudaFi_Drop_Subscriber_Admin_Ports', disabled: false },
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
        securityPolicies: {
          antiTethering: true,
          protectManagementAccess: true,
        },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      // Verify that Mangle TTL and Filter Drop are not added again because they already exist on router
      expect(preview.generatedCommands.some((c) => c.command.includes('SudaFi_Anti_Tethering_TTL'))).toBe(false);
      expect(preview.generatedCommands.some((c) => c.command.includes('SudaFi_Drop_Subscriber_Admin_Ports'))).toBe(false);

      // And report reflects ACTIVE_ON_ROUTER
      const ttlReport = preview.securityPoliciesReport.find((r) => r.id === 'ANTI_TETHERING');
      expect(ttlReport!.status).toBe('ACTIVE_ON_ROUTER');
      const mgmtReport = preview.securityPoliciesReport.find((r) => r.id === 'PROTECT_MANAGEMENT');
      expect(mgmtReport!.status).toBe('ACTIVE_ON_ROUTER');
    });

    it('should generate both default user profile and named user profile matching cards service', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listHotspotProfiles = jest.fn().mockResolvedValue([
        { name: 'default', sharedUsers: 1 },
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
        hotspot: {
          profileName: 'hsp-sudafi',
          defaultRateLimit: '5M/10M',
          dnsName: 'login.sudafi.net',
        },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      // 1. Check default profile set command
      const defaultProfileCmd = preview.generatedCommands.find((c) =>
        c.command.includes('/ip/hotspot/user/profile/set =numbers=default'),
      );
      expect(defaultProfileCmd).toBeDefined();

      // 2. Check named user profile add command for cards
      const namedProfileCmd = preview.generatedCommands.find((c) =>
        c.command.includes('/ip/hotspot/user/profile/add =name=hsp-sudafi'),
      );
      expect(namedProfileCmd).toBeDefined();
      expect(namedProfileCmd!.command).toContain('=rate-limit=5M/10M');
      expect(namedProfileCmd!.command).toContain('=shared-users=1');
    });

    it('should set horizon=1 on existing bridge member port if horizon is not set', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listBridges = jest.fn().mockResolvedValue([
        { name: 'bridge-hotspot' },
      ]);
      mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([
        { bridge: 'bridge-hotspot', interface: 'ether3', horizon: 0 },
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        securityPolicies: {
          clientIsolation: true,
        },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      // Verify that bridge port add is not called, but set horizon=1 is called
      expect(preview.generatedCommands.some((c) => c.command.includes('/interface/bridge/port/add'))).toBe(false);
      const setHorizonCmd = preview.generatedCommands.find((c) =>
        c.command.includes('/interface/bridge/port/set =numbers=ether3') && c.command.includes('=horizon=1'),
      );
      expect(setHorizonCmd).toBeDefined();
    });

    it('should strictly downgrade overallStatus from VERIFIED_READY to PARTIALLY_VERIFIED if security policies are unverified', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      // Hotspot is operational, ping reachable, but mangle rules missing
      mockMikrotikClient.listHotspotServers = jest.fn().mockResolvedValue([
        { name: 'hs-sudafi', interface: 'bridge-hotspot', disabled: false },
      ]);
      mockMikrotikClient.listMangleRules = jest.fn().mockResolvedValue([]);
      mockMikrotikClient.listFilterRules = jest.fn().mockResolvedValue([]);

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        securityPolicies: {
          antiTethering: true,
        },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-admin');

      // Crucial requirement: NEVER VERIFIED_READY when essential security checks cannot be confirmed
      expect(result.verification.securityPoliciesVerified).toBe(false);
      expect(result.verification.overallStatus).toBe('PARTIALLY_VERIFIED');
      expect(result.verification.diagnosticsMessage).toContain('لم يتم التأكد من اكتمال تطبيق كافة سياسات الأمان');
    });

    it('should verify packet flow direction: anti-tethering matches only downstream bridge and leaves WAN upstream untouched', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
        securityPolicies: {
          antiTethering: true,
        },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);
      const ttlCommand = preview.generatedCommands.find((c) => c.command.includes('SudaFi_Anti_Tethering_TTL'));

      expect(ttlCommand).toBeDefined();
      // Packet Flow guarantees:
      // 1. Must be in postrouting
      expect(ttlCommand!.command).toContain('=chain=postrouting');
      // 2. Must target subscriber bridge interface
      expect(ttlCommand!.command).toContain('=out-interface=bridge-hotspot');
      // 3. Must NEVER target WAN interface (which would kill upstream normal internet traffic)
      expect(ttlCommand!.command).not.toContain('=out-interface=ether1');
      // 4. Must NEVER be in prerouting
      expect(ttlCommand!.command).not.toContain('=chain=prerouting');
    });

    it('should preserve custom user profiles created by the client and only touch default and named profile', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listHotspotProfiles = jest.fn().mockResolvedValue([
        { name: 'default', sharedUsers: 5 },
        { name: 'custom-vip-profile', sharedUsers: 3, rateLimit: '20M/20M' },
        { name: 'staff-profile', sharedUsers: 2, rateLimit: '10M/10M' },
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
        hotspot: {
          profileName: 'hsp-sudafi',
          defaultRateLimit: '2M/5M',
        },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      // Verify that commands touch default and add hsp-sudafi, but NEVER remove or alter custom-vip-profile or staff-profile
      const profileCommands = preview.generatedCommands.filter((c) => c.stage === 'HOTSPOT_PROFILE');
      for (const cmd of profileCommands) {
        expect(cmd.command).not.toContain('custom-vip-profile');
        expect(cmd.command).not.toContain('staff-profile');
      }
    });
  });

  describe('7. Direct IP & Out-of-Band Management Protection (حماية منافذ الإدارة المستقلة)', () => {
    it('should block execution with CRITICAL conflict DIRECT_IP_PORT_BRIDGED when member interface has IP different from device.host', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
        ...sampleDevice,
        host: '10.0.0.50', // Connected via WAN or tunnel
      });
      mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
        { address: '10.0.0.50/24', interface: 'ether1', disabled: false },
        { address: '192.168.99.1/24', interface: 'ether5', disabled: false }, // Out-of-band management port
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'STATIC', staticIp: '10.0.0.50/24', staticGateway: '10.0.0.1' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2', 'ether5'], gatewayIp: '10.5.50.1/24' },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      // Verify that canProceed is blocked
      expect(preview.canProceed).toBe(false);

      // Verify conflict details
      const oobConflict = preview.conflicts.find((c) => c.resource === 'DIRECT_IP_PORT_BRIDGED');
      expect(oobConflict).toBeDefined();
      expect(oobConflict?.existingValue).toContain('192.168.99.1/24');
      expect(oobConflict?.proposedValue).toContain('ether5');

      // Verify critical warning is emitted
      const oobWarning = preview.warnings.find((w) => w.type === 'PORT_DIRECT_IP_RISK');
      expect(oobWarning?.severity).toBe('CRITICAL');
      expect(oobWarning?.message).toContain('خارج النطاق');
    });
  });

  describe('8. HOTSPOT_PROFILE Idempotency, Differential Updates & already exists (إصلاح البروفايل الموجود مسبقاً)', () => {
    it('should NOT generate add or update command if existing profile properties match desired rateLimit', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listHotspotProfiles = jest.fn().mockResolvedValue([
        { name: 'default', sharedUsers: 1 },
        { name: 'hsp-sudafi', rateLimit: '2M/5M', sharedUsers: 1, id: '*P1' },
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
        hotspot: {
          profileName: 'hsp-sudafi',
          defaultRateLimit: '2M/5M',
        },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      // Neither add nor set should be generated for hsp-sudafi user profile since properties match
      const namedUserProfileCmds = preview.generatedCommands.filter(
        (c) => c.stage === 'HOTSPOT_PROFILE' && c.command.includes('/ip/hotspot/user/profile') && c.command.includes('hsp-sudafi'),
      );
      expect(namedUserProfileCmds.length).toBe(0);
    });

    it('should generate explicit set update command if existing profile has different rateLimit', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listHotspotProfiles = jest.fn().mockResolvedValue([
        { name: 'default', sharedUsers: 1 },
        { name: 'hsp-sudafi', rateLimit: '512k/1M', sharedUsers: 1, id: '*P1' }, // Slow speed
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        hotspot: {
          profileName: 'hsp-sudafi',
          defaultRateLimit: '4M/10M', // Desired speed
        },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      const updateCmd = preview.generatedCommands.find(
        (c) => c.stage === 'HOTSPOT_PROFILE' && c.command.includes('/ip/hotspot/user/profile/set') && c.command.includes('hsp-sudafi'),
      );
      expect(updateCmd).toBeDefined();
      expect(updateCmd?.command).toContain('=rate-limit=4M/10M');
      expect(updateCmd?.description).toContain('تحديث بروفايل مستخدمي الكروت');
    });

    it('should adapt and verify when already exists error occurs with matching rateLimit', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listHotspotProfiles = jest
        .fn()
        .mockResolvedValueOnce([]) // Profile not yet detected in initial preview
        .mockResolvedValue([{ name: 'hsp-sudafi', rateLimit: '2M/5M', sharedUsers: 1 }]); // Detected upon already exists
      mockMikrotikClient.runRawCommand.mockImplementation(async (words: string[]) => {
        if (words[0] === '/ip/hotspot/user/profile/add') {
          throw new Error('failure: already have user profile with this name');
        }
      });

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        hotspot: {
          profileName: 'hsp-sudafi',
          defaultRateLimit: '2M/5M',
        },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-admin');

      expect(result.success).toBe(true);
      const stageLog = result.executedStages.find(
        (s) => s.stage === 'HOTSPOT_PROFILE' && s.command?.includes('/user/profile') && s.command?.includes('hsp-sudafi'),
      );
      expect(stageLog?.status).toBe('SUCCESS');
      expect(stageLog?.error).toContain('تطابقت خصائصه وسرعته الفعلية');
    });

    it('should safely update existing profile when already exists error occurs with different rateLimit', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listHotspotProfiles = jest
        .fn()
        .mockResolvedValueOnce([]) // Not in initial discovery
        .mockResolvedValueOnce([{ name: 'hsp-sudafi', rateLimit: '512k/512k', sharedUsers: 1, id: '*P1' }]) // Found with old speed
        .mockResolvedValue([{ name: 'hsp-sudafi', rateLimit: '2M/5M', sharedUsers: 1, id: '*P1' }]); // Re-verified with new speed
      mockMikrotikClient.updateHotspotProfile = jest.fn().mockResolvedValue(undefined);
      mockMikrotikClient.runRawCommand.mockImplementation(async (words: string[]) => {
        if (words[0] === '/ip/hotspot/user/profile/add') {
          throw new Error('failure: already have user profile with this name');
        }
      });

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        hotspot: {
          profileName: 'hsp-sudafi',
          defaultRateLimit: '2M/5M',
        },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-admin');

      expect(result.success).toBe(true);
      expect(mockMikrotikClient.updateHotspotProfile).toHaveBeenCalledWith('hsp-sudafi', { rateLimit: '2M/5M' });
    });

    it('should halt provisioning and fail if already exists occurs and profile cannot be verified', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      // listHotspotProfiles returns empty (cannot verify existing profile)
      mockMikrotikClient.listHotspotProfiles = jest.fn().mockResolvedValue([]);
      mockMikrotikClient.runRawCommand.mockImplementation(async (words: string[]) => {
        if (words[0] === '/ip/hotspot/user/profile/add') {
          throw new Error('failure: already exists');
        }
      });

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-admin');

      expect(result.success).toBe(false);
      expect(result.failedStage).toBe('HOTSPOT_PROFILE');
      expect(result.failureReason).toContain('تعذر التحقق من خصائصه وسرعته الفعلية');
    });

    it('should downgrade overallStatus to PARTIALLY_VERIFIED if router profile rateLimit does not match requested rateLimit', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listHotspotServers = jest.fn().mockResolvedValue([
        { name: 'hs-sudafi', interface: 'bridge-hotspot', disabled: false, invalid: false },
      ]);
      mockMikrotikClient.listHotspotProfiles = jest.fn().mockResolvedValue([
        { name: 'hsp-sudafi', rateLimit: '1M/1M' }, // Does not match 2M/5M
      ]);

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        hotspot: {
          profileName: 'hsp-sudafi',
          defaultRateLimit: '2M/5M',
        },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-admin');

      expect(result.verification.profileSpeedVerified).toBe(false);
      expect(result.verification.overallStatus).toBe('PARTIALLY_VERIFIED');
      expect(result.verification.diagnosticsMessage).toContain('سرعة البروفايل على الراوتر لا تطابق');
    });
  });

  describe('9. WAN Security & Rule Ordering (أمان بطاقة الإنترنت وترتيب القواعد)', () => {
    it('should order established/related accept rule BEFORE WAN drop rule and prevent duplicates', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.listFilterRules = jest.fn().mockResolvedValue([]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        securityPolicies: {
          protectManagementAccess: true,
          protectWanAccess: true,
        } as any,
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      const filterCommands = preview.generatedCommands.filter(
        (c) => c.command.includes('/ip/firewall/filter/add'),
      );

      const acceptIndex = filterCommands.findIndex((c) => c.command.includes('SudaFi_Accept_Established_Related'));
      const wanDropIndex = filterCommands.findIndex((c) => c.command.includes('SudaFi_Drop_WAN_Admin_Ports'));

      expect(acceptIndex).toBeGreaterThanOrEqual(0);
      expect(wanDropIndex).toBeGreaterThan(acceptIndex); // Accept must strictly precede Drop
      expect(filterCommands[wanDropIndex].command).toContain('=in-interface=ether1');
    });

    it('should sanitize credentials in commands display and never leak passwords or secrets', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

      const previewDto: ProvisionPreviewDto = {
        template: 'CUSTOM',
        wan: { interface: 'ether1', mode: 'PPPOE', pppoeUser: 'secret-user', pppoePassword: 'UltraSecretPassword99!' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      for (const cmd of preview.generatedCommands) {
        expect(cmd.command).not.toContain('UltraSecretPassword99!');
        if (cmd.command.includes('password=')) {
          expect(cmd.command).toContain('password=********');
        }
      }
    });
  });

  describe('10. Captive Portal File Detection (التحقق من ملفات صفحة الدخول)', () => {
    it('should set portalFilesVerified to true when login.html is present in router filesystem', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.executeCommand = jest.fn().mockResolvedValue([
        { type: '!re', attributes: { name: 'hotspot/login.html', size: '4096' } },
        { type: '!re', attributes: { name: 'hotspot/alogin.html', size: '1024' } },
      ]);
      mockMikrotikClient.listHotspotProfiles = jest.fn().mockResolvedValue([
        { name: 'hsp-sudafi', rateLimit: '2M/5M' },
      ]);
      mockMikrotikClient.listHotspotServers = jest.fn().mockResolvedValue([
        { name: 'hs-sudafi', interface: 'bridge-hotspot', disabled: false, invalid: false },
      ]);

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        securityPolicies: {
          antiTethering: false,
          protectManagementAccess: false,
        },
        hotspot: {
          profileName: 'hsp-sudafi',
          defaultRateLimit: '2M/5M',
          htmlDirectory: 'hotspot',
        },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-admin');

      expect(result.verification.portalFilesVerified).toBe(true);
      expect(result.verification.overallStatus).toBe('VERIFIED_READY');
    });

    it('should warn and set portalFilesVerified to false if login.html is missing from router filesystem', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockMikrotikClient.executeCommand = jest.fn().mockResolvedValue([
        { type: '!re', attributes: { name: 'skins/default.png', size: '2048' } },
        // login.html is missing!
      ]);
      mockMikrotikClient.listHotspotProfiles = jest.fn().mockResolvedValue([
        { name: 'hsp-sudafi', rateLimit: '2M/5M' },
      ]);
      mockMikrotikClient.listHotspotServers = jest.fn().mockResolvedValue([
        { name: 'hs-sudafi', interface: 'bridge-hotspot', disabled: false, invalid: false },
      ]);

      const applyDto: ProvisionApplyDto = {
        template: 'CUSTOM',
        cleanSetupConfirmed: true,
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
        hotspot: {
          profileName: 'hsp-sudafi',
          defaultRateLimit: '2M/5M',
          htmlDirectory: 'hotspot',
        },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-admin');

      expect(result.verification.portalFilesVerified).toBe(false);
      expect(result.verification.overallStatus).toBe('PARTIALLY_VERIFIED');
      expect(result.verification.diagnosticsMessage).toContain('login.html / alogin.html');
    });
  });

  describe('11. RouterOS 7 Pre-Programmed Router Preview (L009UiGS Support)', () => {
    it('should generate non-zero planned steps and commands for pre-programmed RouterOS 7 router', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
        ...sampleDevice,
        name: 'L009UiGS-Sudafi',
        rosVersion: 'V7',
        host: '192.168.88.1',
      });

      // Pre-programmed router state with existing bridge, hotspot, dhcp, ip
      mockMikrotikClient.listBridges.mockResolvedValueOnce([{ id: '*1', name: 'bridge-hotspot', disabled: false }]);
      mockMikrotikClient.listHotspotServers.mockResolvedValueOnce([
        { id: '*1', name: 'hs-sudafi', interface: 'bridge-hotspot', disabled: false },
      ]);
      mockMikrotikClient.listDhcpServers.mockResolvedValueOnce([
        { id: '*1', name: 'dhcp-sudafi', interface: 'bridge-hotspot', disabled: false },
      ]);
      mockMikrotikClient.listIpAddresses.mockResolvedValueOnce([
        { id: '*1', address: '10.5.50.1/24', interface: 'bridge-hotspot', disabled: false },
        { id: '*2', address: '192.168.88.1/24', interface: 'ether1', disabled: false },
      ]);

      const previewDto: ProvisionPreviewDto = {
        template: 'CLEAN_SETUP',
        wan: { interface: 'ether1', mode: 'DHCP' },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2', 'ether3'], gatewayIp: '10.5.50.1/24' },
        hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
      };

      const preview = await service.preview('tenant-001', 'dev-001', previewDto);

      expect(preview.routerVersion).toContain('V7');
      expect(preview.plannedSteps.length).toBeGreaterThan(0);
      expect(preview.generatedCommands.length).toBeGreaterThan(0);
      expect(preview.requiresCleanConfirmation).toBe(true);

      // Verify that every command has non-empty command and description
      for (const cmd of preview.generatedCommands) {
        expect(cmd.command).toBeDefined();
        expect(cmd.command.length).toBeGreaterThan(0);
        expect(cmd.description).toBeDefined();
        expect(cmd.stage).toBeDefined();
      }
    });

    describe('12. Local Discovery & Execution Architecture (معمارية الاستكشاف والتنفيذ المحلي)', () => {
      it('should use client-provided snapshot in preview() without calling backend discover()', async () => {
        // Spy on discover method to ensure it is NEVER called when snapshot is provided
        const discoverSpy = jest.spyOn(service, 'discover');

        const clientSnapshot = {
          resource: {
            uptime: '5d12h',
            version: '7.16.2',
            cpuLoad: 5,
            freeMemory: 100000000,
            totalMemory: 256000000,
            freeHdd: 50000000,
            totalHdd: 128000000,
          },
          interfaces: [
            { name: 'ether1', type: 'ether', running: true, disabled: false },
            { name: 'ether2', type: 'ether', running: true, disabled: false },
          ],
          bridges: [{ name: 'bridge-local' }],
          bridgePorts: [{ interface: 'ether2', bridge: 'bridge-local' }],
          ipAddresses: [{ address: '192.168.88.1/24', interface: 'ether1' }],
          dhcpServers: [],
          dhcpClients: [],
          natRules: [],
          routes: [],
          hotspotServers: [],
        };

        const previewDto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          snapshot: clientSnapshot,
          snapshotHash: 'mock-hash-abcdef123456',
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', previewDto);

        expect(discoverSpy).not.toHaveBeenCalled();
        expect(preview.plannedSteps.length).toBeGreaterThan(0);
        expect(preview.generatedCommands.length).toBeGreaterThan(0);
        expect(preview.discovery.interfaces.length).toBe(2);

        discoverSpy.mockRestore();
      });

      it('should complete apply() in LOCAL execution mode without calling getConnectedClient()', async () => {
        const getConnectedClientSpy = jest.spyOn<any, any>(service as any, 'getConnectedClient');

        const applyDto: any = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          executionMode: 'LOCAL',
          snapshot: {
            resource: { version: '7.16.2', uptime: '1h' },
            interfaces: [{ name: 'ether1', type: 'ether' }, { name: 'ether2', type: 'ether' }],
            bridges: [],
            bridgePorts: [],
            ipAddresses: [{ id: '*1', address: '192.168.88.1/24', interface: 'ether1' }],
            hotspotServers: [],
          },
          discoveredAt: new Date().toISOString(),
          clientExecutionResult: {
            success: true,
            backupFilename: 'pre-sudafi-backup.backup',
            executedStages: [
              { stage: 'PRE_BACKUP', status: 'SUCCESS', timestamp: new Date().toISOString() },
              { stage: 'BRIDGE_SETUP', status: 'SUCCESS', timestamp: new Date().toISOString() },
            ],
            verification: {
              internetReachable: true,
              wanConfigured: true,
              defaultRouteActive: true,
              hotspotOperational: true,
              securityPoliciesVerified: true,
              pingPacketsReceived: 3,
              overallStatus: 'VERIFIED_READY',
              diagnosticsMessage: 'تم تطبيق وبرمجة الراوتر بنجاح والتحقق من حالته محلياً.',
            },
          },
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');

        expect(getConnectedClientSpy).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.backupFilename).toBe('pre-sudafi-backup.backup');
        expect(result.verification.overallStatus).toBe('VERIFIED_READY');

        getConnectedClientSpy.mockRestore();
      });

      const completeValidSnapshot = {
        resource: { version: '7.16.2', uptime: '1h' },
        interfaces: [{ name: 'ether1', type: 'ether' }, { name: 'ether2', type: 'ether' }],
        bridges: [],
        bridgePorts: [],
        ipAddresses: [{ id: '*1', address: '192.168.88.1/24', interface: 'ether1' }],
      };

      it('should reject preview with ConflictException if discoveredAt is older than 15 minutes (stale snapshot)', async () => {
        const staleDate = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 minutes ago
        const previewDto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          snapshot: completeValidSnapshot,
          discoveredAt: staleDate,
        };

        await expect(service.preview('tenant-001', 'dev-001', previewDto)).rejects.toThrow(ConflictException);
      });

      it('should generate an Ed25519 signed planToken binding tenantId, deviceId, commandsHash, and expiresAt', async () => {
        const previewDto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          snapshot: completeValidSnapshot,
          discoveredAt: new Date().toISOString(),
          sessionId: 'session-ed25519-test',
        };

        const preview = await service.preview('tenant-001', 'dev-001', previewDto);

        expect(preview.planToken).toBeDefined();
        expect(preview.planToken!.tenantId).toBe('tenant-001');
        expect(preview.planToken!.deviceId).toBe('dev-001');
        expect(preview.planToken!.sessionId).toBe('session-ed25519-test');
        expect(preview.planToken!.signature).toBeDefined();
        expect(preview.planToken!.signature.length).toBe(128); // 64-byte Ed25519 hex signature
        expect(preview.planToken!.publicKey).toBeDefined();
        expect(preview.planToken!.publicKey.length).toBe(64); // 32-byte Ed25519 raw pubkey hex
      });

      it('should reject apply in LOCAL mode if the same session is applied twice (replay attack)', async () => {
        const applyDto: any = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          executionMode: 'LOCAL',
          sessionId: 'session-replay-123',
          snapshot: completeValidSnapshot,
          discoveredAt: new Date().toISOString(),
          clientExecutionResult: {
            success: true,
            backupFilename: 'pre-sudafi.backup',
            executedStages: [],
            verification: {
              internetReachable: true,
              wanConfigured: true,
              defaultRouteActive: true,
              hotspotOperational: true,
              securityPoliciesVerified: true,
              pingPacketsReceived: 3,
              overallStatus: 'VERIFIED_READY',
              diagnosticsMessage: 'OK',
            },
          },
        };

        // First apply succeeds
        const res1 = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(res1.success).toBe(true);

        // Second apply with identical session MUST be rejected as replay attack
        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
      });

      it('should not promote isOnline to true if verification overallStatus is not VERIFIED_READY', async () => {
        const applyDto: any = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          executionMode: 'LOCAL',
          sessionId: 'session-unverified-456',
          snapshot: completeValidSnapshot,
          discoveredAt: new Date().toISOString(),
          clientExecutionResult: {
            success: false,
            executedStages: [],
            verification: {
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'VERIFICATION_FAILED',
              diagnosticsMessage: 'Unverified',
            },
          },
        };

        const res = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(res.success).toBe(false);
        // Expect update was NOT called with isOnline: true
        expect(mockPrisma.mikroTikDevice.update).not.toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isOnline: true }),
          }),
        );
      });

      it('should reject apply with ConflictException if client-provided planToken belongs to another tenant', async () => {
        const applyDto: any = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          executionMode: 'LOCAL',
          sessionId: 'session-tenant-spoof-1',
          snapshot: completeValidSnapshot,
          discoveredAt: new Date().toISOString(),
          planToken: {
            tenantId: 'tenant-attacker-999',
            deviceId: 'dev-001',
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
      });

      it('should reject apply with ConflictException if client-provided planToken belongs to another device', async () => {
        const applyDto: any = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          executionMode: 'LOCAL',
          sessionId: 'session-device-spoof-1',
          snapshot: completeValidSnapshot,
          discoveredAt: new Date().toISOString(),
          planToken: {
            tenantId: 'tenant-001',
            deviceId: 'dev-different-888',
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
      });

      it('should reject apply with ConflictException if client-provided planToken signature is tampered', async () => {
        const signService = new PlanSigningService();
        const payload = {
          tenantId: 'tenant-001',
          deviceId: 'dev-001',
          sessionId: 'session-tamper-test',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          commands: [{ stage: 'BRIDGE', command: '/interface bridge add name=legit' }],
        };
        const signResult = signService.signPlan(payload);

        const applyDto: any = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          executionMode: 'LOCAL',
          sessionId: 'session-tamper-test',
          snapshot: completeValidSnapshot,
          discoveredAt: new Date().toISOString(),
          planToken: {
            tenantId: 'tenant-001',
            deviceId: 'dev-001',
            expiresAt: payload.expiresAt,
            // Tampered canonical payload:
            canonicalPayload: signResult.canonicalPayload + '_TAMPERED',
            signature: signResult.signature,
            publicKey: signResult.publicKey,
          },
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
      });

      it('should reject apply with UNTRUSTED_PUBLIC_KEY if client substitutes public key with an attacker key', async () => {
        // Generate arbitrary attacker Ed25519 keypair
        const attackerKey = require('crypto').generateKeyPairSync('ed25519');
        const attackerPubKeyHex = attackerKey.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');

        const applyDto: any = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          snapshot: completeValidSnapshot,
          discoveredAt: new Date().toISOString(),
          executionMode: 'LOCAL',
          sessionId: 'session-attacker-key-1',
          planToken: {
            tenantId: 'tenant-001',
            deviceId: 'dev-001',
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            canonicalPayload: 'SUDAFI-PLAN-V1:tenant-001:dev-001',
            signature: 'aabbccdd',
            publicKey: attackerPubKeyHex, // Attacker's substituted public key!
          },
        };

        try {
          await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
          fail('Should have thrown ConflictException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(ConflictException);
          expect(err.getResponse().code).toBe('UNTRUSTED_PUBLIC_KEY');
        }
      });

      it('should reject apply with PLAN_PAYLOAD_MISMATCH if client modifies a command or passes untrusted canonical payload', async () => {
        const signService = new PlanSigningService();
        const trustedPubKey = signService.getPublicKeyHex();

        const applyDto: any = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          snapshot: completeValidSnapshot,
          discoveredAt: new Date().toISOString(),
          executionMode: 'LOCAL',
          sessionId: 'session-payload-tamper-1',
          planToken: {
            tenantId: 'tenant-001',
            deviceId: 'dev-001',
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            // Manipulated canonical payload with rogue command:
            canonicalPayload: 'SUDAFI-PLAN-V1:tenant-001:dev-001:ROGUE_COMMAND_HASH',
            signature: 'aabbccdd11223344',
            publicKey: trustedPubKey,
          },
        };

        try {
          await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
          fail('Should have thrown ConflictException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(ConflictException);
          expect(err.getResponse().code).toBe('PLAN_PAYLOAD_MISMATCH');
        }
      });

      it('should accept apply with valid Ed25519 signed planToken generated by backend preview', async () => {
        const previewDto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi', dnsName: 'login.sudafi.net' },
          snapshot: completeValidSnapshot,
          discoveredAt: new Date().toISOString(),
          sessionId: 'session-valid-token-1',
        };

        const previewRes = await service.preview('tenant-001', 'dev-001', previewDto);
        expect(previewRes.planToken).toBeDefined();

        const applyDto: any = {
          ...previewDto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'LOCAL',
          sessionId: 'session-valid-token-1',
          planToken: previewRes.planToken,
          clientExecutionResult: {
            success: true,
            executedStages: [],
            verification: {
              internetReachable: true,
              wanConfigured: true,
              defaultRouteActive: true,
              hotspotOperational: true,
              securityPoliciesVerified: true,
              pingPacketsReceived: 3,
              overallStatus: 'VERIFIED_READY',
            },
          },
        };

        const res = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(res.success).toBe(true);
      });
    });

    describe('13. L009 Clean Setup Remediation, Snapshot Integrity & Anti-Fallback Engine', () => {
      const l009Snapshot = {
        resource: { version: '7.16', uptime: '2d 4h', cpuLoad: 3 },
        interfaces: [
          { name: 'ether1', type: 'ether', running: true },
          { name: 'ether2', type: 'ether', running: true },
          { name: 'ether3', type: 'ether', running: true },
          { name: 'ether4', type: 'ether', running: false },
          { name: 'ether5', type: 'ether', running: false },
          { name: 'ether6', type: 'ether', running: true },
        ],
        bridges: [{ name: 'bridge' }],
        bridgePorts: [
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ],
        ipAddresses: [
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.1/24', interface: 'ether3' },
        ],
        hotspotServers: [{ name: 'hs-old' }],
      };

      it('should generate PRE_CLEANUP commands and permit canProceed=true for real L009 in CLEAN_SETUP', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
          rosVersion: 'V7',
        });

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether2', 'ether3', 'ether4', 'ether5'],
            gatewayIp: '10.5.50.1/24',
          },
          hotspot: {
            serverName: 'hs-sudafi',
            profileName: 'hsp-sudafi',
            dnsName: 'login.sudafi.net',
          },
          snapshot: l009Snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);

        // 1. Must produce genuine 6 planned steps (NOT 0)
        expect(preview.plannedSteps.length).toBe(6);

        // 2. Must produce valid commands including PRE_CLEANUP
        expect(preview.generatedCommands.length).toBeGreaterThan(0);
        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.length).toBeGreaterThanOrEqual(2);

        // 3. Must remove conflicting IP on member port ether3 and remove port from old bridge
        expect(cleanupCmds.some((c) => c.command.includes('/ip/address/remove'))).toBe(true);
        expect(cleanupCmds.some((c) => c.command.includes('/interface/bridge/port/remove'))).toBe(true);

        // 4. Must enforce clean confirmation and allow canProceed = true
        expect(preview.requiresCleanConfirmation).toBe(true);
        expect(preview.canProceed).toBe(true);

        // 5. Must contain authoritative snapshotHash
        expect(preview.planToken?.snapshotHash).toBeDefined();
        expect(preview.planToken?.snapshotHash?.length).toBe(64);
      });

      it('should strictly block canProceed=false if member port carries router management IP even in CLEAN_SETUP', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.5.50.1', // Management IP is 10.5.50.1 on ether3!
          rosVersion: 'V7',
        });

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'], // Bridging management port!
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: l009Snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);

        // Must strictly block management port bridging
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PORT_BRIDGED')).toBe(true);

        // Must NEVER generate cleanup command to remove management IP
        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('10.5.50.1'))).toBe(false);
      });

      it('should reject incomplete snapshot missing interfaces with BadRequestException', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

        const dto: any = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: {
            interfaces: [], // Empty interfaces
            ipAddresses: [],
          },
        };

        await expect(service.preview('tenant-001', 'dev-001', dto)).rejects.toThrow(BadRequestException);
      });

      it('should reject stale snapshot older than 15 minutes with ConflictException', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

        const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20m old
        const dto: any = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: l009Snapshot,
          discoveredAt: staleTime,
        };

        await expect(service.preview('tenant-001', 'dev-001', dto)).rejects.toThrow(ConflictException);
      });

      it('should throw BadGatewayException and NO fake fallback when direct discovery fails without snapshot', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          id: 'dev-discovery-fail',
          host: '192.168.88.1',
        });
        mockClientFactory.getClient.mockRejectedValueOnce(new Error('connect ETIMEDOUT 192.168.88.1:8728'));

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          // No snapshot provided
        };

        await expect(service.preview('tenant-001', 'dev-discovery-fail', dto)).rejects.toThrow(BadGatewayException);
      });
    });

    describe('14. Mandatory Security & Negative Verification Suite (Audit Requirements)', () => {
      const validL009Snapshot = {
        resource: { version: '7.16', uptime: '3d 12h', cpuLoad: 4 },
        interfaces: [
          { name: 'ether1', type: 'ether', running: true },
          { name: 'ether2', type: 'ether', running: true },
          { name: 'ether3', type: 'ether', running: true },
          { name: 'ether4', type: 'ether', running: false },
          { name: 'ether5', type: 'ether', running: false },
          { name: 'ether6', type: 'ether', running: true },
        ],
        bridges: [{ name: 'bridge' }],
        bridgePorts: [
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ],
        ipAddresses: [
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '172.16.1.1/24', interface: 'ether3' },
        ],
        hotspotServers: [],
      };

      // 1. Snapshot missing ipAddresses throws BadRequestException
      it('Negative 1: should reject snapshot missing ipAddresses with BadRequestException', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
        const badSnapshot: any = {
          interfaces: [{ name: 'ether1', type: 'ether' }, { name: 'ether2', type: 'ether' }],
          bridges: [{ name: 'bridge' }],
          bridgePorts: [{ id: '*1', interface: 'ether2', bridge: 'bridge' }],
          // missing ipAddresses!
        };
        const dto: any = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: badSnapshot,
        };
        await expect(service.preview('tenant-001', 'dev-001', dto)).rejects.toThrow(BadRequestException);
      });

      // 2. Snapshot missing bridgePorts throws BadRequestException
      it('Negative 2: should reject snapshot missing bridgePorts with BadRequestException', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
        const badSnapshot: any = {
          interfaces: [{ name: 'ether1', type: 'ether' }, { name: 'ether2', type: 'ether' }],
          bridges: [{ name: 'bridge' }],
          ipAddresses: [{ id: '*1', address: '192.168.88.1/24', interface: 'ether2' }],
          // missing bridgePorts!
        };
        const dto: any = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: badSnapshot,
        };
        await expect(service.preview('tenant-001', 'dev-001', dto)).rejects.toThrow(BadRequestException);
      });

      // 3. Management IP on Bridge where all member ports are stolen triggers MANAGEMENT_BRIDGE_DEPLETED and blocks canProceed: false
      it('Negative 3: should trigger MANAGEMENT_BRIDGE_DEPLETED and block canProceed=false when all bridge ports are stolen', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });
        const depletedSnapshot = {
          resource: { version: '7.16' },
          interfaces: [
            { name: 'ether1', type: 'ether' },
            { name: 'ether2', type: 'ether' },
            { name: 'ether3', type: 'ether' },
          ],
          bridges: [{ name: 'bridge' }],
          bridgePorts: [
            { id: '*1', interface: 'ether2', bridge: 'bridge' },
            { id: '*2', interface: 'ether3', bridge: 'bridge' },
          ],
          ipAddresses: [{ id: '*1', address: '192.168.88.1/24', interface: 'bridge' }],
        };
        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            // Stealing BOTH ether2 and ether3 from the management bridge!
            memberInterfaces: ['ether2', 'ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: depletedSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_BRIDGE_DEPLETED')).toBe(true);
      });

      // 4. Snapshot with WAN inside Bridge triggers WAN_BRIDGE_CONFLICT and blocks canProceed: false
      it('Negative 4: should detect WAN_BRIDGE_CONFLICT and block canProceed=false when WAN port is a member of a bridge', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });
        const wanBridgeSnapshot = {
          resource: { version: '7.16' },
          interfaces: [{ name: 'ether1', type: 'ether' }, { name: 'ether2', type: 'ether' }],
          bridges: [{ name: 'bridge' }],
          bridgePorts: [{ id: '*1', interface: 'ether1', bridge: 'bridge' }],
          ipAddresses: [{ id: '*1', address: '192.168.88.1/24', interface: 'ether2' }],
        };
        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: wanBridgeSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'WAN_BRIDGE_CONFLICT')).toBe(true);
      });

      // 5. Snapshot with invalid .id in ipAddresses or bridgePorts throws BadRequestException
      it('Negative 5: should reject snapshot with invalid/malicious .id format with BadRequestException', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
        const maliciousSnapshot = {
          interfaces: [{ name: 'ether1', type: 'ether' }, { name: 'ether2', type: 'ether' }],
          bridges: [{ name: 'bridge' }],
          bridgePorts: [{ id: '*1', interface: 'ether2', bridge: 'bridge' }],
          ipAddresses: [
            { id: '*bad!id;reboot;', address: '192.168.88.1/24', interface: 'ether2' },
          ],
        };
        const dto: any = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: maliciousSnapshot,
        };
        await expect(service.preview('tenant-001', 'dev-001', dto)).rejects.toThrow(BadRequestException);
      });

      it('should normalize dot-prefixed .id on bridgePorts and ipAddresses and emit PRE_CLEANUP commands', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
          rosVersion: 'V7',
        });

        const rawMobileSnapshot = {
          resource: { version: '7.23.8' },
          interfaces: [
            { name: 'ether1', type: 'ether', running: true },
            { name: 'ether2', type: 'ether', running: true },
            { name: 'ether3', type: 'ether', running: true },
          ],
          bridges: [{ name: 'LAN' }],
          bridgePorts: [
            { '.id': '*7', interface: 'ether2', bridge: 'LAN' },
            { '.id': '*8', interface: 'ether3', bridge: 'LAN' },
          ],
          ipAddresses: [
            { '.id': '*1', address: '192.168.88.1/24', interface: 'LAN' },
            { '.id': '*9', address: '10.5.50.1/24', interface: 'ether2' },
          ],
          hotspotServers: [{ name: 'hs-old' }],
        };

        const preview = await service.preview('tenant-001', 'dev-001', {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether2'],
            gatewayIp: '10.5.50.1/24',
          },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi' },
          snapshot: rawMobileSnapshot,
          discoveredAt: new Date().toISOString(),
        });

        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('/interface/bridge/port/remove =.id=*7'))).toBe(true);
        expect(cleanupCmds.some((c) => c.command.includes('/ip/address/remove =.id=*9'))).toBe(true);
        expect(preview.canProceed).toBe(true);
      });

      it('Negative 5b: should reject snapshot with invalid/malicious .id format on bridgePorts with BadRequestException', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
        const maliciousSnapshot = {
          interfaces: [{ name: 'ether1', type: 'ether' }, { name: 'ether2', type: 'ether' }],
          bridges: [{ name: 'LAN' }],
          bridgePorts: [{ '.id': '*bad!id;reboot', interface: 'ether2', bridge: 'LAN' }],
          ipAddresses: [{ address: '192.168.88.1/24', interface: 'LAN' }],
        };
        const dto: any = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: maliciousSnapshot,
          discoveredAt: new Date().toISOString(),
        };
        await expect(service.preview('tenant-001', 'dev-001', dto)).rejects.toThrow(BadRequestException);
      });

      it('should not re-emit bridge/port/add for ether2 already in bridge-hotspot on CLEAN_SETUP retry while still removing/re-adding ether3 from LAN', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
          rosVersion: 'V7',
        });

        const partialRetrySnapshot = {
          resource: { version: '7.23.8' },
          interfaces: [
            { name: 'ether1', type: 'ether', running: true },
            { name: 'ether2', type: 'ether', running: true },
            { name: 'ether3', type: 'ether', running: true },
            { name: 'ether4', type: 'ether', running: true },
          ],
          bridges: [{ name: 'LAN' }, { name: 'bridge-hotspot' }],
          bridgePorts: [
            { '.id': '*7', interface: 'ether2', bridge: 'bridge-hotspot', horizon: 1 },
            { '.id': '*8', interface: 'ether3', bridge: 'LAN' },
            { '.id': '*9', interface: 'ether4', bridge: 'LAN' },
          ],
          ipAddresses: [
            { '.id': '*1', address: '192.168.88.1/24', interface: 'LAN' },
            { '.id': '*2', address: '10.5.50.1/24', interface: 'bridge-hotspot' },
          ],
        };

        const preview = await service.preview('tenant-001', 'dev-001', {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether2', 'ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          hotspot: { serverName: 'hs-sudafi', profileName: 'hsp-sudafi' },
          snapshot: partialRetrySnapshot,
          discoveredAt: new Date().toISOString(),
        });

        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        const bridgePortAdds = preview.generatedCommands.filter(
          (c) => c.stage === 'BRIDGE_PORT' && c.command.includes('/interface/bridge/port/add'),
        );

        expect(cleanupCmds.some((c) => c.command.includes('/interface/bridge/port/remove =.id=*8'))).toBe(true);
        expect(cleanupCmds.some((c) => c.command.includes('*7'))).toBe(false);
        expect(bridgePortAdds.some((c) => c.command.includes('=interface=ether2'))).toBe(false);
        expect(bridgePortAdds.some((c) => c.command.includes('=interface=ether3'))).toBe(true);
        expect(preview.canProceed).toBe(true);
      });

      // 6. Dynamic IP conflict cannot be cleaned up and is NOT downgraded (blocks canProceed: false)
      it('Negative 6: should not remove dynamic IP via PRE_CLEANUP and must keep conflict hard-blocking (canProceed=false)', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });
        const dynamicIpSnapshot = {
          resource: { version: '7.16' },
          interfaces: [
            { name: 'ether1', type: 'ether' },
            { name: 'ether2', type: 'ether' },
            { name: 'ether3', type: 'ether' },
          ],
          bridges: [{ name: 'bridge' }],
          bridgePorts: [{ id: '*1', interface: 'ether2', bridge: 'bridge' }],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'ether2' },
            // ether3 has a dynamic IP (e.g. from DHCP client)
            { id: '*2', address: '10.5.50.1/24', interface: 'ether3', dynamic: true },
          ],
        };
        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'], // Bridging ether3 which has dynamic IP
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: dynamicIpSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        // Because dynamic IP cannot be removed by PRE_CLEANUP, DIRECT_IP_PORT_BRIDGED cannot be resolved
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'DIRECT_IP_PORT_BRIDGED')).toBe(true);
        // And no cleanup command was emitted for the dynamic IP
        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('/ip/address/remove'))).toBe(false);
      });

      // 7. Failure during PRE_CLEANUP execution in apply() halts immediately with failedStage: 'PRE_CLEANUP'
      it('Negative 7: should halt immediately with failedStage=PRE_CLEANUP when cleanup command fails in apply', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '172.16.1.1/24', interface: 'ether3' },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ]);
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(validL009Snapshot.interfaces);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(validL009Snapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue([]);
        mockMikrotikClient.runRawCommand.mockRejectedValueOnce(new Error('no such item (*2)'));

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: validL009Snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_CLEANUP');
      });

      // 8. Tampered snapshot between preview and apply throws PLAN_PAYLOAD_MISMATCH or PLAN_SIGNATURE_INVALID
      it('Negative 8: should reject tampered planToken or payload mismatch during apply with ConflictException', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const previewDto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: validL009Snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', previewDto);

        // Client attempts to apply with tampered canonicalPayload or altered signature
        const applyDto: ProvisionApplyDto = {
          ...previewDto,
          executionMode: 'LOCAL',
          cleanSetupConfirmed: true,
          planToken: {
            ...preview.planToken!,
            canonicalPayload: 'TAMPERED_PAYLOAD_DATA',
          },
          clientExecutionResult: {
            success: true,
            verification: {
              overallStatus: 'VERIFIED_READY',
              internetReachable: true,
              wanConfigured: true,
              defaultRouteActive: true,
              hotspotOperational: true,
              securityPoliciesVerified: true,
              pingPacketsReceived: 3,
              diagnosticsMessage: 'OK',
            },
          },
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(
          ConflictException,
        );
      });

      // 9. Snapshot with indeterminate management path triggers MANAGEMENT_PATH_INDETERMINATE and blocks canProceed: false
      it('Negative 9: should trigger MANAGEMENT_PATH_INDETERMINATE and block canProceed=false when device.host is missing from all interfaces', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.99.99.99', // Unknown host IP not present in any interface
        });

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: validL009Snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);
      });
    });

    describe('15. Advanced Pre-Execution Security, Mixed IP Roles & State Drift Guard Suite', () => {
      const baseValidSnapshot = {
        resource: { version: '7.16', uptime: '3d 12h', cpuLoad: 4 },
        interfaces: [
          { name: 'ether1', type: 'ether', running: true },
          { name: 'ether2', type: 'ether', running: true },
          { name: 'ether3', type: 'ether', running: true },
          { name: 'ether4', type: 'ether', running: false },
          { name: 'ether5', type: 'ether', running: false },
          { name: 'ether6', type: 'ether', running: true },
          { name: 'ether8', type: 'ether', running: false },
        ],
        bridges: [{ name: 'bridge' }],
        bridgePorts: [
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ],
        ipAddresses: [
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
        ],
        hotspotServers: [],
      };

      // 1. Mixed Static + Dynamic IPs on same port:
      it('Adv 1: should block canProceed=false and NOT resolve DIRECT_IP_PORT_BRIDGED when member port has both static and dynamic IPs', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const mixedSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            // ether3 has BOTH static IP (*2) and dynamic IP (*3)
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3', dynamic: false },
            { id: '*3', address: '10.5.50.100/24', interface: 'ether3', dynamic: true },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: mixedSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'DIRECT_IP_PORT_BRIDGED')).toBe(true);

        // Crucial: PRE_CLEANUP must NOT remove the static IP if the port cannot be fully cleared of dynamic IPs!
        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('/ip/address/remove'))).toBe(false);
      });

      // 2. WAN address within proposed Subnet:
      it('Adv 2: should block canProceed=false and NEVER delete WAN IP when WAN is within proposed subnet', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const wanOverlapSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            // WAN interface ether1 has IP in 10.5.50.0/24!
            { id: '*1a', address: '10.5.50.254/24', interface: 'ether1', dynamic: false },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: wanOverlapSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'WAN_LAN_OVERLAP')).toBe(true);

        // PRE_CLEANUP must NEVER delete WAN IP
        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('10.5.50.254'))).toBe(false);
      });

      // 3. Secondary management address (different from device.host):
      it('Adv 3: should block canProceed=false and NEVER delete secondary management IP', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const secMgmtSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            // Secondary management IP on ether5 with management comment
            { id: '*2b', address: '10.5.50.99/24', interface: 'ether5', comment: 'Management_OOB' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: secMgmtSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'IP_SUBNET_OVERLAP')).toBe(true);

        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('10.5.50.99'))).toBe(false);
      });

      // 4. Interface with unknown role:
      it('Adv 4: should block canProceed=false and NEVER delete IP on unknown/unmanaged interface', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const unknownRoleSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            // ether8 is unmanaged / unknown role
            { id: '*3c', address: '10.5.50.77/24', interface: 'ether8' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: unknownRoleSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'IP_SUBNET_OVERLAP')).toBe(true);

        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('10.5.50.77'))).toBe(false);
      });

      // 5. State Drift between Preview and Apply (Resource .id or value changed):
      it('Adv 5: should detect State Drift before Apply if targeted IP value changed on router and halt execution', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const previewSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        // Live router now has a DIFFERENT IP value on *2 (State Drift!)
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '172.16.99.1/24', interface: 'ether5' }, // Drifted!
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ]);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: previewSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('State Drift');
        // Precondition guarantee: runRawCommand must NEVER have been called!
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 6. Pre-removal verification failure (Target resource .id missing):
      it('Adv 6: should fail pre-verification and halt before Apply if target .id does not exist on router', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const previewSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        // Live router NO LONGER HAS *2 at all!
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([]);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: previewSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 7. Ensure NO commands executed if any protection precondition fails:
      it('Adv 7: should guarantee 0 commands executed when pre-verification detects failure', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });
        mockMikrotikClient.listIpAddresses = jest.fn().mockRejectedValueOnce(new Error('Connection dropped during pre-check'));

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: {
            ...baseValidSnapshot,
            ipAddresses: [
              { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
              { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
            ],
          },
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 8. WAN Membership Drift with targeted .id intact:
      it('Adv 8: should halt execution before any command when WAN membership drifts (e.g. ether1 added to bridge) even if target .id still exists', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const previewSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        // Targeted resource *2 still exists and matches on ether3!
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ]);

        // BUT WAN port (ether1) was added to a bridge between Preview and Apply!
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
          { id: '*99', interface: 'ether1', bridge: 'bridge-wan-drift' }, // WAN bridged!
        ]);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue([{ name: 'bridge' }, { name: 'bridge-wan-drift' }]);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: previewSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('WAN');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 9. Management Path Drift: host IP moved to a member port
      it('Adv 9: should halt execution before any command when management IP moves to member port between Preview and Apply', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const previewSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        // Live router now has 192.168.88.1 on ether3 (which is a memberInterface!)
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'ether3' }, // Moved to member port!
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
        ]);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue([{ name: 'bridge' }]);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: previewSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('مسار الإدارة');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 10. Secondary WAN address within proposed subnet:
      it('Adv 10: should block canProceed=false and NEVER delete secondary WAN IP on WAN interface within proposed subnet', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const multiWanSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            // ether1 has primary WAN IP and secondary WAN IP within proposed 10.5.50.0/24!
            { id: '*10a', address: '192.168.1.100/24', interface: 'ether1' },
            { id: '*10b', address: '10.5.50.200/24', interface: 'ether1' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'STATIC', staticIp: '192.168.1.100/24' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: multiWanSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'WAN_LAN_OVERLAP')).toBe(true);

        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('10.5.50.200'))).toBe(false);
        expect(cleanupCmds.some((c) => c.command.includes('192.168.1.100'))).toBe(false);
      });

      // 11. Unknown interface with IP in proposed subnet:
      it('Adv 11: should block canProceed=false and NEVER delete IP on unknown SFP interface (sfp-plus1) within proposed subnet', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const unknownSfpSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'sfp-plus1', type: 'sfp-plus', running: true },
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            // sfp-plus1 is unmanaged, has IP overlapping with 10.5.50.0/24
            { id: '*11a', address: '10.5.50.88/24', interface: 'sfp-plus1' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: unknownSfpSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'IP_SUBNET_OVERLAP')).toBe(true);

        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('10.5.50.88'))).toBe(false);
        expect(cleanupCmds.some((c) => c.command.includes('sfp-plus1'))).toBe(false);
      });
    });

    describe('16. Phase 2 Mandatory Pre-Execution Security Invariants & Negative Guard Suite', () => {
      const baseValidSnapshot = {
        resource: { version: '7.16', uptime: '3d 12h', cpuLoad: 4 },
        interfaces: [
          { name: 'ether1', type: 'ether', running: true },
          { name: 'ether2', type: 'ether', running: true },
          { name: 'ether3', type: 'ether', running: true },
          { name: 'ether4', type: 'ether', running: false },
          { name: 'ether5', type: 'ether', running: false },
          { name: 'ether6', type: 'ether', running: true },
        ],
        bridges: [{ name: 'bridge' }],
        bridgePorts: [
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ],
        ipAddresses: [
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ],
        routes: [{ dstAddress: '0.0.0.0/0', gateway: 'ether1' }],
        hotspotServers: [],
      };

      // 1. فقدان مسار الإدارة عبر VLAN
      it('Mandatory 1: should halt in PRE_VERIFICATION when management VLAN parent interface is bridged into subscriber LAN', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.10.10.1',
        });

        const vlanSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'vlan100', type: 'vlan', parentInterface: 'ether3' }, // parent is ether3!
          ],
          ipAddresses: [
            { id: '*1', address: '10.10.10.1/24', interface: 'vlan100' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue(vlanSnapshot.ipAddresses);
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(vlanSnapshot.interfaces);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'], // ether3 is subscriber member!
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: vlanSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        // In apply(), critical lockout conflict is detected, throwing ConflictException before any command
        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 2. وجود Bridge بلا منافذ يمكن إثباتها
      it('Mandatory 2: should halt in PRE_VERIFICATION when management bridge has 0 physical member ports', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        // bridge has NO member ports in bridgePorts list!
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether5' },
        ]);
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([]); // Zero ports!
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue([{ name: 'bridge' }]);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether5'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: {
            ...baseValidSnapshot,
            bridgePorts: [],
          },
          discoveredAt: new Date().toISOString(),
        };

        // Bridge with 0 physical ports blocks execution before any command via ConflictException
        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 3. تغير Default Route بعد المعاينة
      it('Mandatory 3: should halt in PRE_VERIFICATION when default route (0.0.0.0/0) vanishes after preview', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue(baseValidSnapshot.ipAddresses);
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);
        // Default route vanished from router!
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue([
          { dstAddress: '192.168.88.0/24', gateway: 'bridge' },
        ]);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: baseValidSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('المسار الافتراضي');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 4. ظهور Secondary WAN بعد المعاينة يتداخل مع Subnet المقترح
      it('Mandatory 4: should halt in PRE_VERIFICATION when a secondary WAN IP appears and overlaps with subscriber subnet', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        // Live router now has secondary WAN IP 10.5.50.250 on ether1!
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          { id: '*9a', address: '10.5.50.250/24', interface: 'ether1' }, // Drift secondary WAN!
        ]);
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: baseValidSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('WAN');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 5. تغير علاقة VLAN بالواجهة الأم بعد المعاينة
      it('Mandatory 5: should halt in PRE_VERIFICATION when management VLAN parent interface changes to member port', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.20.20.1',
        });

        const vlanSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'vlan-mgmt', type: 'vlan', parentInterface: 'ether5' }, // Originally on ether5 (safe)
          ],
          ipAddresses: [
            { id: '*1', address: '10.20.20.1/24', interface: 'vlan-mgmt' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        // Live state: vlan-mgmt parent drifted to ether3 (which is in memberInterfaces!)
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue([
          ...baseValidSnapshot.interfaces,
          { name: 'vlan-mgmt', type: 'vlan', parentInterface: 'ether3' }, // Drifted to ether3!
        ]);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue(vlanSnapshot.ipAddresses);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: vlanSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('مسار الإدارة');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 6. فقدان IP ID أو وجود ID غير صالح
      it('Mandatory 6: should refuse to generate removal command and keep canProceed=false when IP ID is missing or invalid', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const missingIdSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            // ether3 has IP without an internal ID!
            { address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: missingIdSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'DIRECT_IP_PORT_BRIDGED')).toBe(true);

        // Crucial: No /ip/address/remove command should be generated without a valid ID (no fallback)
        const cleanupCmds = preview.generatedCommands.filter((c) => c.stage === 'PRE_CLEANUP');
        expect(cleanupCmds.some((c) => c.command.includes('/ip/address/remove'))).toBe(false);
      });

      // 7. Snapshot بتاريخ غير صالح أو مفقود
      it('Mandatory 7: should throw BadRequestException when discoveredAt is missing or invalid date format', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

        const dtoMissingDate: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: baseValidSnapshot,
          // discoveredAt missing!
        };

        await expect(service.preview('tenant-001', 'dev-001', dtoMissingDate)).rejects.toThrow(BadRequestException);

        const dtoInvalidDate: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: baseValidSnapshot,
          discoveredAt: 'not-a-valid-timestamp',
        };

        await expect(service.preview('tenant-001', 'dev-001', dtoInvalidDate)).rejects.toThrow(BadRequestException);
      });

      // 8. نقص قسم أساسي من Snapshot
      it('Mandatory 8: should throw BadRequestException when essential snapshot section (e.g. interfaces) is missing', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

        const incompleteSnapshot: any = {
          resource: { version: '7.16' },
          // interfaces missing entirely!
          bridges: [],
          bridgePorts: [],
          ipAddresses: [],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: incompleteSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        await expect(service.preview('tenant-001', 'dev-001', dto)).rejects.toThrow(BadRequestException);
      });

      // 9. تحول واجهة الإدارة إلى واجهة تابعة لمنفذ المشتركين
      it('Mandatory 9: should halt in PRE_VERIFICATION when management interface becomes a slave port of a bridge', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        // In live router, ether2 carries 192.168.88.1, but ether2 is already enslaved to bridge!
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'ether2' }, // on physical ether2!
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ]);
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([
          { id: '*1', interface: 'ether2', bridge: 'bridge' }, // ether2 is slave!
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
        ]);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue([{ name: 'bridge' }]);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: baseValidSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('منفذ تابع');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 10. وجود WAN على Bond أو VLAN وتعارضه مع الجسر أو منافذ المشتركين
      it('Mandatory 10: should halt in PRE_VERIFICATION when WAN is on a Bond whose slave is in subscriber bridge', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        // WAN is on bond-wan whose slaves are ether1, ether3 (ether3 is memberInterface!)
        const bondSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'bond-wan', type: 'bonding', slaves: 'ether1,ether3' },
          ],
        };

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(bondSnapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'bond-wan', mode: 'DHCP' }, // WAN on bond!
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'], // ether3 is bond slave AND memberInterface!
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: bondSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('WAN');
        expect(result.failureReason).toContain('bond-wan');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
        expect(result.executedStages.length).toBe(0);
      });
    });

    describe('17. Recursive Topology & Stage 0 Hardening Invariant Tests', () => {
      const baseValidSnapshot: any = {
        resource: { version: '7.16' },
        interfaces: [
          { name: 'ether1', type: 'ether', running: true },
          { name: 'ether2', type: 'ether', running: true },
          { name: 'ether3', type: 'ether', running: true },
          { name: 'ether4', type: 'ether', running: true },
          { name: 'ether5', type: 'ether', running: true },
          { name: 'ether6', type: 'ether', running: true },
          { name: 'bridge', type: 'bridge', running: true },
        ],
        bridges: [{ name: 'bridge' }],
        bridgePorts: [
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ],
        ipAddresses: [
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ],
        routes: [{ dstAddress: '0.0.0.0/0', gateway: 'ether1' }],
        hotspotServers: [],
      };

      // 1. VLAN Management Parent غير معروف
      it('Security Gate 1: should reject preview and block apply when management VLAN parent interface is unknown/non-existent', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.50.50.1',
        });

        const vlanSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'vlan-mgmt', type: 'vlan', parentInterface: 'non-existent-ether' }, // Unknown parent!
          ],
          ipAddresses: [
            { id: '*1', address: '10.50.50.1/24', interface: 'vlan-mgmt' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: vlanSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 2. VLAN متداخلة بمسار غير مكتمل
      it('Security Gate 2: should reject nested VLAN (Q-in-Q) when parent chain is broken or terminates without physical port', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.60.60.1',
        });

        const nestedVlanSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'vlan-inner', type: 'vlan', parentInterface: 'vlan-outer' },
            { name: 'vlan-outer', type: 'vlan', parentInterface: 'broken-parent' }, // broken!
          ],
          ipAddresses: [
            { id: '*1', address: '10.60.60.1/24', interface: 'vlan-inner' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: nestedVlanSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 3. Bonding يحتوي Slaves غير معروفة
      it('Security Gate 3: should reject management path when Bonding interface contains unknown/non-existent slaves', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.70.70.1',
        });

        const bondSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'bond-mgmt', type: 'bonding', slaves: 'ether99,ether100' }, // Non-existent slaves!
          ],
          ipAddresses: [
            { id: '*1', address: '10.70.70.1/24', interface: 'bond-mgmt' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: bondSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 4. تغير WAN Parent بعد Preview
      it('Security Gate 4: should halt in PRE_VERIFICATION when WAN VLAN parent changes to subscriber member port after preview', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        // In preview: WAN is vlan-wan on ether1 (safe)
        const wanVlanSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'vlan-wan', type: 'vlan', parentInterface: 'ether1' },
          ],
        };

        // In live router: vlan-wan parent drifted to ether3 (which is in memberInterfaces!)
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue([
          ...baseValidSnapshot.interfaces,
          { name: 'vlan-wan', type: 'vlan', parentInterface: 'ether3' }, // Drifted to subscriber port!
        ]);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(baseValidSnapshot.routes);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'vlan-wan', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: wanVlanSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('WAN');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
        expect(result.executedStages.length).toBe(0);
      });

      // 5. تغير Bridge Membership بعد Preview
      it('Security Gate 5: should halt in PRE_VERIFICATION when a member port bridge membership changes after preview', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        // In preview, ether3 was in bridge 'bridge'
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ]);
        // In live router: ether3 joined 'bridge-foreign' after preview!
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge-foreign' }, // Drift!
        ]);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue([{ name: 'bridge' }, { name: 'bridge-foreign' }]);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(baseValidSnapshot.routes);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: baseValidSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('عضوية الجسور');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
        expect(result.executedStages.length).toBe(0);
      });

      // 6. تغير أو اختفاء Default Route بعد Preview
      it('Security Gate 6: should halt in PRE_VERIFICATION when default route gateway changes after preview', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);
        // Default route gateway changed from 192.168.1.1 to 10.99.99.1!
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue([
          { dstAddress: '0.0.0.0/0', gateway: '10.99.99.1' },
        ]);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: {
            ...baseValidSnapshot,
            routes: [{ dstAddress: '0.0.0.0/0', gateway: '192.168.1.1' }],
          },
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('بوابة المسار الافتراضي');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
        expect(result.executedStages.length).toBe(0);
      });

      // 7. نقص قسم حيوي من Snapshot أو بنية غير صالحة
      it('Security Gate 7: should throw BadRequestException when snapshot contains malformed IP address syntax', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);

        const malformedSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: 'not-a-valid-ip-or-cidr', interface: 'bridge' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: malformedSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        await expect(service.preview('tenant-001', 'dev-001', dto)).rejects.toThrow(BadRequestException);
      });

      // 8. فشل قراءة أي قسم مطلوب في Stage 0
      it('Security Gate 8: should halt in PRE_VERIFICATION with 0 commands executed when reading routes fails in Stage 0', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);
        // Stage 0 routes query fails due to socket drop!
        mockMikrotikClient.listRoutes = jest.fn().mockRejectedValue(new Error('ETIMEDOUT reading routes'));

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: baseValidSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('فشل التحقق من حالة الراوتر الحالية قبل البدء بالتنفيذ');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
        expect(result.executedStages.length).toBe(0);
      });

      // 9. Fail-Closed in Bridge Traversal: Bridge with known port and unknown port
      it('Security Gate 9: should reject bridge traversal fail-closed when bridge contains a valid port AND an unknown port', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const mixedBridgeSnapshot = {
          ...baseValidSnapshot,
          bridges: [{ name: 'bridge' }],
          bridgePorts: [
            { id: '*1', interface: 'ether2', bridge: 'bridge' },
            { id: '*99', interface: 'ghost-ether-99', bridge: 'bridge' }, // Unknown port!
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: mixedBridgeSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 10. Fail-Closed in Bridge Traversal: Bridge with cyclic port and valid port
      it('Security Gate 10: should reject bridge traversal fail-closed when bridge contains a cyclic port loop', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const cyclicBridgeSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'vlan-loop1', type: 'vlan', parentInterface: 'vlan-loop2' },
            { name: 'vlan-loop2', type: 'vlan', parentInterface: 'vlan-loop1' }, // Cycle!
          ],
          bridges: [{ name: 'bridge' }],
          bridgePorts: [
            { id: '*1', interface: 'ether2', bridge: 'bridge' },
            { id: '*2', interface: 'vlan-loop1', bridge: 'bridge' }, // Member port leads to cyclic loop!
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: cyclicBridgeSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 11. Interface without type
      it('Security Gate 11: should reject management interface when type attribute is missing', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.88.88.1',
        });

        const noTypeSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'ether-notype' }, // No type!
          ],
          ipAddresses: [
            { id: '*1', address: '10.88.88.1/24', interface: 'ether-notype' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: noTypeSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 12. Interface with unknown type
      it('Security Gate 12: should reject management interface when type is unknown or unsupported', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.89.89.1',
        });

        const unknownTypeSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'mysterious-iface', type: 'quantum-tunnel' },
          ],
          ipAddresses: [
            { id: '*1', address: '10.89.89.1/24', interface: 'mysterious-iface' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: unknownTypeSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // 13. VLAN on Bridge where Bridge contains an untraceable port
      it('Security Gate 13: should reject VLAN on bridge when the parent bridge has an unresolvable port', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.95.95.1',
        });

        const vlanOnBrokenBridgeSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'vlan-mgmt', type: 'vlan', parentInterface: 'bridge-broken' },
            { name: 'bridge-broken', type: 'bridge' },
          ],
          bridges: [{ name: 'bridge' }, { name: 'bridge-broken' }],
          bridgePorts: [
            { id: '*1', interface: 'ether2', bridge: 'bridge' },
            { id: '*2', interface: 'ether4', bridge: 'bridge-broken' }, // ether4 is valid
            { id: '*3', interface: 'ether-missing', bridge: 'bridge-broken' }, // ether-missing is not in interfaces!
          ],
          ipAddresses: [
            { id: '*1', address: '10.95.95.1/24', interface: 'vlan-mgmt' },
            { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: vlanOnBrokenBridgeSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });
    });

    describe('18. SudaFi Final Four Critical Security Corrections Suite', () => {
      const baseValidSnapshot = {
        resource: { version: '7.16', uptime: '3d 12h', cpuLoad: 4 },
        interfaces: [
          { name: 'ether1', type: 'ether', running: true },
          { name: 'ether2', type: 'ether', running: true },
          { name: 'ether3', type: 'ether', running: true },
          { name: 'ether4', type: 'ether', running: false },
          { name: 'ether5', type: 'ether', running: false },
          { name: 'ether6', type: 'ether', running: true },
        ],
        bridges: [{ name: 'bridge' }],
        bridgePorts: [
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ],
        ipAddresses: [
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3' },
        ],
        routes: [{ dstAddress: '0.0.0.0/0', gateway: 'ether1' }],
        hotspotServers: [],
      };

      // --- AREA 1: Management Bridge / Bonding Recursive Safety ---
      it('Area 1.1: Management Bridge -> Bonding -> ether2, with ether2 in memberPorts', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether' },
            { name: 'ether2', type: 'ether' },
            { name: 'bond1', type: 'bonding', slaves: 'ether2' },
            { name: 'bridge-mgmt', type: 'bridge' },
          ],
          bridges: [{ name: 'bridge-mgmt' }],
          bridgePorts: [
            { id: '*1', interface: 'bond1', bridge: 'bridge-mgmt' },
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge-mgmt' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_BRIDGE_DEPLETED' || c.resource === 'MANAGEMENT_PORT_BRIDGED')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      it('Area 1.2: Management VLAN -> Bridge -> Bonding -> ether2, with ether2 in memberPorts', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '10.10.10.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether' },
            { name: 'ether2', type: 'ether' },
            { name: 'bond1', type: 'bonding', slaves: 'ether2' },
            { name: 'bridge-mgmt', type: 'bridge' },
            { name: 'vlan-mgmt', type: 'vlan', parentInterface: 'bridge-mgmt' },
          ],
          bridges: [{ name: 'bridge-mgmt' }],
          bridgePorts: [
            { id: '*1', interface: 'bond1', bridge: 'bridge-mgmt' },
          ],
          ipAddresses: [
            { id: '*1', address: '10.10.10.1/24', interface: 'vlan-mgmt' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_BRIDGE_DEPLETED' || c.resource === 'MANAGEMENT_PORT_BRIDGED')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      it('Area 1.3: Management Bridge with known physical port and another unknown port', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether' },
            { name: 'ether2', type: 'ether' },
            { name: 'bridge-mgmt', type: 'bridge' },
          ],
          bridges: [{ name: 'bridge-mgmt' }],
          bridgePorts: [
            { id: '*1', interface: 'ether2', bridge: 'bridge-mgmt' },
            { id: '*2', interface: 'ghost-unknown-port', bridge: 'bridge-mgmt' },
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge-mgmt' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      it('Area 1.4: Management Bridge with overlapping WAN path', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether' },
            { name: 'ether2', type: 'ether' },
            { name: 'bridge-mgmt', type: 'bridge' },
          ],
          bridges: [{ name: 'bridge-mgmt' }],
          bridgePorts: [
            { id: '*1', interface: 'ether1', bridge: 'bridge-mgmt' },
            { id: '*2', interface: 'ether2', bridge: 'bridge-mgmt' },
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge-mgmt' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'WAN_MANAGEMENT_LOCKOUT' || c.resource === 'WAN_BRIDGE_CONFLICT')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // --- AREA 2: Default Route / WAN Egress Verification ---
      it('Area 2.1: Gateway IP routing through a member port', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
            { id: '*2', address: '192.168.5.50/24', interface: 'ether3' },
          ],
          routes: [
            { dstAddress: '0.0.0.0/0', gateway: '192.168.5.1', active: true, disabled: false },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'STATIC' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.warnings.some((w) => w.type === 'WAN_TOPOLOGY_INVALID')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      it('Area 2.2: Default Route inactive (active: false or disabled: true)', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          routes: [
            { dstAddress: '0.0.0.0/0', gateway: 'ether1', active: false, disabled: true },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.warnings.some((w) => w.type === 'WAN_TOPOLOGY_INVALID')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      it('Area 2.3: Gateway resolves to unknown path (scoped ghost interface)', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          routes: [
            { dstAddress: '0.0.0.0/0', gateway: '10.99.99.1%ghost-iface', active: true, disabled: false },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.warnings.some((w) => w.type === 'WAN_TOPOLOGY_INVALID')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      it('Area 2.4: WAN VLAN parent changes to unknown Bonding', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            ...baseValidSnapshot.interfaces,
            { name: 'vlan-wan', type: 'vlan', parentInterface: 'bond-unknown' },
          ],
          routes: [
            { dstAddress: '0.0.0.0/0', gateway: 'vlan-wan', active: true, disabled: false },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'vlan-wan', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.warnings.some((w) => w.type === 'WAN_TOPOLOGY_INVALID')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      it('Area 2.5: Default route exists without sufficient info to resolve egress interface', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          routes: [
            { dstAddress: '0.0.0.0/0', gateway: '10.77.77.1', active: true, disabled: false },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.warnings.some((w) => w.type === 'WAN_TOPOLOGY_INVALID')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // --- AREA 3: Strict PRE_CLEANUP Resource Identity in Stage 0 ---
      it('Area 3.1: Stage 0 halts when Bridge Port has same ID but different interface', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue(baseValidSnapshot.ipAddresses);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether4', bridge: 'bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ]);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(baseValidSnapshot.routes);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: baseValidSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('تغيرت واجهته');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
        expect(result.executedStages.length).toBe(0);
      });

      it('Area 3.2: Stage 0 halts when Bridge Port has same ID but different bridge', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue(baseValidSnapshot.ipAddresses);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue([
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether3', bridge: 'other-bridge' },
          { id: '*3', interface: 'ether6', bridge: 'bridge' },
        ]);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue([
          { name: 'bridge' },
          { name: 'other-bridge' },
        ]);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(baseValidSnapshot.routes);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: baseValidSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('تغير الجسر المرتبط به');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
        expect(result.executedStages.length).toBe(0);
      });

      it('Area 3.3: Stage 0 halts when IP has same ID but different IP address', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.99/24', interface: 'ether3' },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(baseValidSnapshot.routes);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: baseValidSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('تم تعديله');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
        expect(result.executedStages.length).toBe(0);
      });

      it('Area 3.4: Stage 0 halts when IP changed from static to dynamic on router', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(baseValidSnapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          { id: '*2', address: '10.5.50.2/24', interface: 'ether3', dynamic: true },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(baseValidSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(baseValidSnapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(baseValidSnapshot.routes);

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: baseValidSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('أصبح ديناميكياً');
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
        expect(result.executedStages.length).toBe(0);
      });

      // --- AREA 4: Strict Input Validation ---
      it('Area 4.1: isValidIpv4Cidr mathematical validation enforces octet 0-255, prefix 0-32 and rejects leading zeros', () => {
        expect(isValidIpv4Cidr('192.168.88.1')).toBe(true);
        expect(isValidIpv4Cidr('192.168.88.1/24')).toBe(true);
        expect(isValidIpv4Cidr('0.0.0.0/0')).toBe(true);
        expect(isValidIpv4Cidr('255.255.255.255/32')).toBe(true);

        // Invalid octet (> 255)
        expect(isValidIpv4Cidr('999.1.1.1')).toBe(false);
        expect(isValidIpv4Cidr('256.0.0.1')).toBe(false);

        // Invalid prefix (> 32)
        expect(isValidIpv4Cidr('192.168.1.1/33')).toBe(false);
        expect(isValidIpv4Cidr('192.168.1.1/99')).toBe(false);

        // Invalid leading zeros
        expect(isValidIpv4Cidr('01.2.3.4')).toBe(false);
        expect(isValidIpv4Cidr('192.168.01.1')).toBe(false);
        expect(isValidIpv4Cidr('192.168.1.1/024')).toBe(false);

        // Malformed strings
        expect(isValidIpv4Cidr('192.168.1')).toBe(false);
        expect(isValidIpv4Cidr('192.168.1.1.1')).toBe(false);
        expect(isValidIpv4Cidr('abc.def.ghi.jkl')).toBe(false);
        expect(isValidIpv4Cidr('')).toBe(false);
        expect(isValidIpv4Cidr(null)).toBe(false);
      });

      it('Area 4.2: handles Bonding slaves whether array, string, or unexpected type without throwing uncaught errors', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const arraySlavesSnapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether' },
            { name: 'ether2', type: 'ether' },
            { name: 'ether4', type: 'ether' },
            { name: 'bond-array', type: 'bonding', slaves: ['ether2', 'ether4'] },
            { name: 'bridge', type: 'bridge' },
          ],
          bridges: [{ name: 'bridge' }],
          bridgePorts: [
            { id: '*1', interface: 'bond-array', bridge: 'bridge' },
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether3'], gatewayIp: '10.5.50.1/24' },
          snapshot: arraySlavesSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview).toBeDefined();
        expect(preview.canProceed).toBe(true);
      });
    });

    describe('19. Authoritative SudaFi L009 Gate Negative Security Invariants', () => {
      const baseValidSnapshot: any = {
        resource: { version: '7.16', uptime: '3d 12h', cpuLoad: 4 },
        interfaces: [
          { name: 'ether1', type: 'ether', running: true, disabled: false },
          { name: 'ether2', type: 'ether', running: true, disabled: false },
          { name: 'ether3', type: 'ether', running: true, disabled: false },
          { name: 'ether4', type: 'ether', running: true, disabled: false },
          { name: 'bridge', type: 'bridge', running: true, disabled: false },
        ],
        bridges: [{ name: 'bridge' }],
        bridgePorts: [
          { id: '*1', interface: 'ether2', bridge: 'bridge' },
          { id: '*2', interface: 'ether4', bridge: 'bridge' },
        ],
        ipAddresses: [
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge', dynamic: false },
        ],
        routes: [
          { dstAddress: '0.0.0.0/0', gateway: '192.168.1.1', 'gateway-status': '192.168.1.1 reachable via ether1', active: true },
        ],
        hotspotServers: [],
      };

      beforeEach(() => {
        jest.clearAllMocks();
      });

      // Negative 1: إدارة على Bridge وWAN على PPPoE فوق نفس Ethernet
      it('Negative 1: should reject when management is on Bridge and WAN is on PPPoE over the same Ethernet port', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether', running: true, disabled: false },
            { name: 'ether2', type: 'ether', running: true, disabled: false },
            { name: 'bridge-mgmt', type: 'bridge', running: true, disabled: false },
            { name: 'pppoe-out1', type: 'pppoe-out', interface: 'ether1', running: true, disabled: false },
          ],
          bridges: [{ name: 'bridge-mgmt' }],
          bridgePorts: [
            { id: '*1', interface: 'ether1', bridge: 'bridge-mgmt' },
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge-mgmt', dynamic: false },
          ],
          routes: [
            { dstAddress: '0.0.0.0/0', gateway: 'pppoe-out1', active: true },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'pppoe-out1', mode: 'PPPOE', pppoeUser: 'user1', pppoePassword: 'pw1' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'WAN_MANAGEMENT_LOCKOUT')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // Negative 2: بقاء منفذ Bridge غير موصول لا يثبت سلامة الإدارة
      it('Negative 2: should reject when remaining bridge port is link down (running: false)', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether', running: true, disabled: false },
            { name: 'ether2', type: 'ether', running: true, disabled: false },
            { name: 'ether3', type: 'ether', running: false, disabled: false }, // link down!
            { name: 'bridge-mgmt', type: 'bridge', running: true, disabled: false },
          ],
          bridges: [{ name: 'bridge-mgmt' }],
          bridgePorts: [
            { id: '*1', interface: 'ether2', bridge: 'bridge-mgmt' },
            { id: '*2', interface: 'ether3', bridge: 'bridge-mgmt' },
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge-mgmt', dynamic: false },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether2'], // steals ether2! ether3 remains but has running: false
            gatewayIp: '10.5.50.1/24',
          },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_BRIDGE_DEPLETED')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // Negative 3: Default Route يخرج عبر ether3 بينما WAN المحدد ether1
      it('Negative 3: should reject when active default route exits via ether3 while WAN is ether1', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether', running: true, disabled: false },
            { name: 'ether2', type: 'ether', running: true, disabled: false },
            { name: 'ether3', type: 'ether', running: true, disabled: false },
            { name: 'ether4', type: 'ether', running: true, disabled: false },
            { name: 'bridge', type: 'bridge', running: true, disabled: false },
          ],
          routes: [
            { dstAddress: '0.0.0.0/0', gateway: '192.168.3.1', 'gateway-status': '192.168.3.1 reachable via ether3', active: true },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'WAN_BRIDGE_CONFLICT' || c.resource === 'WAN_LAN_OVERLAP')).toBe(true);

        // Pre-verification in Stage 0
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(snapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue(snapshot.ipAddresses);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(snapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(snapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(snapshot.routes);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('المسار الافتراضي');
        expect(result.executedStages.length).toBe(0);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // Negative 4: وجود أكثر من واجهة لها نفس الشبكة الفرعية دون gateway-status محددة
      it('Negative 4: should reject when multiple interfaces share the same subnet (ambiguous match) without gateway-status', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether', running: true, disabled: false },
            { name: 'ether2', type: 'ether', running: true, disabled: false },
            { name: 'ether4', type: 'ether', running: true, disabled: false },
            { name: 'bridge', type: 'bridge', running: true, disabled: false },
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge', dynamic: false },
            { id: '*2', address: '10.0.0.2/24', interface: 'ether1', dynamic: false },
            { id: '*3', address: '10.0.0.3/24', interface: 'ether4', dynamic: false }, // shared subnet 10.0.0.0/24!
          ],
          routes: [
            { dstAddress: '0.0.0.0/0', gateway: '10.0.0.1', active: true }, // ambiguous gateway without gateway-status!
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(snapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue(snapshot.ipAddresses);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(snapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(snapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(snapshot.routes);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('نطاق بوابة المسار الافتراضي');
        expect(result.executedStages.length).toBe(0);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // Negative 5: وجود Default Routes متعددة بمنافذ خروج مختلفة/متعارضة
      it('Negative 5: should reject when multiple default routes exist with conflicting egress interfaces', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether', running: true, disabled: false },
            { name: 'ether2', type: 'ether', running: true, disabled: false },
            { name: 'ether3', type: 'ether', running: true, disabled: false },
            { name: 'ether4', type: 'ether', running: true, disabled: false },
            { name: 'bridge', type: 'bridge', running: true, disabled: false },
          ],
          routes: [
            { dstAddress: '0.0.0.0/0', gateway: '192.168.1.1', 'gateway-status': '192.168.1.1 reachable via ether1', active: true },
            { dstAddress: '0.0.0.0/0', gateway: '192.168.3.1', 'gateway-status': '192.168.3.1 reachable via ether3', active: true },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(snapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue(snapshot.ipAddresses);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(snapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(snapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(snapshot.routes);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('المسار الافتراضي');
        expect(result.executedStages.length).toBe(0);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // Negative 6: immediate-gw يحدد واجهة تختلف عن الواجهة المستنتجة من gateway
      it('Negative 6: should reject when immediate-gw contradicts inferred gateway interface', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether', running: true, disabled: false },
            { name: 'ether2', type: 'ether', running: true, disabled: false },
            { name: 'ether3', type: 'ether', running: true, disabled: false },
            { name: 'ether4', type: 'ether', running: true, disabled: false },
            { name: 'bridge', type: 'bridge', running: true, disabled: false },
          ],
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge', dynamic: false },
            { id: '*2', address: '192.168.1.50/24', interface: 'ether1', dynamic: false },
          ],
          routes: [
            {
              dstAddress: '0.0.0.0/0',
              gateway: '192.168.1.1',
              'immediate-gw': '192.168.3.1%ether3', // points to ether3!
              'gateway-status': '192.168.1.1 recursive via 192.168.3.1 ether3',
              active: true,
            },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);

        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(snapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue(snapshot.ipAddresses);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(snapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(snapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(snapshot.routes);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.executedStages.length).toBe(0);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // Negative 7: غياب المورد الأصلي من snapshot المعاينة -> Stage 0 يتوقف مع failedStage: 'PRE_VERIFICATION'
      it('Negative 7: should halt in Stage 0 PRE_VERIFICATION when target PRE_CLEANUP resource was missing from preview snapshot', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const previewSnapshot = {
          ...baseValidSnapshot,
          ipAddresses: [
            { id: '*1', address: '192.168.88.1/24', interface: 'bridge', dynamic: false },
            // Note: *99 is completely missing from preview snapshot!
          ],
        };

        // Live router has *99
        mockMikrotikClient.listInterfaces = jest.fn().mockResolvedValue(previewSnapshot.interfaces);
        mockMikrotikClient.listIpAddresses = jest.fn().mockResolvedValue([
          { id: '*1', address: '192.168.88.1/24', interface: 'bridge', dynamic: false },
          { id: '*99', address: '10.5.50.99/24', interface: 'ether3', dynamic: false },
        ]);
        mockMikrotikClient.listBridgePorts = jest.fn().mockResolvedValue(previewSnapshot.bridgePorts);
        mockMikrotikClient.listBridges = jest.fn().mockResolvedValue(previewSnapshot.bridges);
        mockMikrotikClient.listRoutes = jest.fn().mockResolvedValue(previewSnapshot.routes);

        // Spy on generateRouterCommands to inject a PRE_CLEANUP command targeting *99
        const originalGen = (service as any).generateRouterCommands.bind(service);
        jest.spyOn(service as any, 'generateRouterCommands').mockImplementation((...args: any[]) => {
          const cmds = originalGen(...args);
          return [
            {
              stage: 'PRE_CLEANUP',
              command: '/ip/address/remove =.id=*99',
              description: 'Synthetic unauthorized cleanup command targeting un-previewed resource',
            },
            ...cmds,
          ];
        });

        const applyDto: ProvisionApplyDto = {
          template: 'CLEAN_SETUP',
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot: previewSnapshot,
          discoveredAt: new Date().toISOString(),
        };

        const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-001');
        expect(result.success).toBe(false);
        expect(result.failedStage).toBe('PRE_VERIFICATION');
        expect(result.failureReason).toContain('Pre-Cleanup Identity');
        expect(result.executedStages.length).toBe(0);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });

      // Negative 8: Bonding slaves من نوع Object مشوه -> rejected
      it('Negative 8: should reject fail-closed when Bonding slaves are malformed Object', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1',
        });

        const snapshot = {
          ...baseValidSnapshot,
          interfaces: [
            { name: 'ether1', type: 'ether', running: true, disabled: false },
            { name: 'ether2', type: 'ether', running: true, disabled: false },
            { name: 'bond-bad', type: 'bonding', slaves: { port1: 'ether1', port2: 'ether2' } as any },
            { name: 'bridge', type: 'bridge', running: true, disabled: false },
          ],
          bridgePorts: [
            { id: '*1', interface: 'bond-bad', bridge: 'bridge' },
          ],
        };

        const dto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP' },
          lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
          snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const preview = await service.preview('tenant-001', 'dev-001', dto);
        expect(preview.canProceed).toBe(false);
        expect(preview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(true);

        const applyDto: ProvisionApplyDto = {
          ...dto,
          cleanSetupConfirmed: true,
          allowOverwrite: true,
          executionMode: 'CLOUD',
        };

        await expect(service.apply('tenant-001', 'dev-001', applyDto, 'user-001')).rejects.toThrow(ConflictException);
        expect(mockMikrotikClient.runRawCommand).not.toHaveBeenCalled();
      });
    });

    describe('16. Connected Host Reconciliation, Resolution Options & Overridable Flags', () => {
      const programmedL009Snapshot = {
        resource: { version: '7.16', uptime: '5d 2h', cpuLoad: 2 },
        interfaces: [
          { name: 'ether1', type: 'ether', running: true, disabled: false },
          { name: 'ether2', type: 'ether', running: true, disabled: false },
          { name: 'ether3', type: 'ether', running: true, disabled: false },
          { name: 'sfp1', type: 'ether', running: false, disabled: false },
          { name: 'ether5', type: 'ether', running: false, disabled: false },
          { name: 'LAN', type: 'bridge', running: true, disabled: false },
        ],
        bridges: [{ name: 'LAN' }],
        bridgePorts: [
          { id: '*1', interface: 'ether2', bridge: 'LAN' },
          { id: '*2', interface: 'ether3', bridge: 'LAN' },
        ],
        ipAddresses: [
          { id: '*1', address: '10.0.0.1/22', interface: 'LAN', disabled: false },
          { id: '*2', address: '192.168.1.55/24', interface: 'ether1', disabled: false },
        ],
        routes: [{ 'dst-address': '0.0.0.0/0', gateway: '192.168.1.1', 'gateway-status': '192.168.1.1 reachable ether1' }],
        dhcpServers: [],
        natRules: [],
        hotspotServers: [{ name: 'Mikrotik', interface: 'LAN' }],
      };

      it('should reconcile stale DB host (192.168.88.1) when connectedHost (10.0.0.1) or confirmedManagementHost exists in discovery', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1', // Stale host saved in PostgreSQL
          rosVersion: 'V7',
        });

        // Pre-condition: without connectedHost, still triggers MANAGEMENT_PATH_INDETERMINATE with options & isOverridable=false
        const blockedDto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether2', 'ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          snapshot: programmedL009Snapshot,
          discoveredAt: new Date().toISOString(),
        };
        const blockedPreview = await service.preview('tenant-001', 'dev-001', blockedDto);
        expect(blockedPreview.canProceed).toBe(false);
        const mgmtConflict = blockedPreview.conflicts.find(
          (c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE',
        );
        expect(mgmtConflict).toBeDefined();
        expect(mgmtConflict?.isOverridable).toBe(false);
        expect(mgmtConflict?.resolutionOptions?.some((o) => o.type === 'SELECT_HOST' && o.host === '192.168.1.55')).toBe(true);
        expect(mgmtConflict?.resolutionOptions?.some((o) => o.type === 'SELECT_INTERFACE' && o.interfaceName === 'ether1')).toBe(true);
        expect(mgmtConflict?.existingValue).not.toContain('غير مسجل على أي واجهة');

        // With connectedHost from WAN IP (not depleted!) -> proves management path cleanly
        const reconciledDto: ProvisionPreviewDto = {
          ...blockedDto,
          connectedHost: '192.168.1.55',
        };
        const okPreview = await service.preview('tenant-001', 'dev-001', reconciledDto);
        expect(okPreview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(false);
        expect(okPreview.canProceed).toBe(true);
      });

      it('should allow explicitly confirmed indirect WAN/NAT management interface while still enforcing member-port lockout rules', async () => {
        mockPrisma.mikroTikDevice.findFirst.mockResolvedValue({
          ...sampleDevice,
          host: '192.168.88.1', // NAT / upstream IP not present verbatim in MikroTik /ip/address
          rosVersion: 'V7',
        });

        // Confirming WAN interface ether1 passes topology safely
        const natDto: ProvisionPreviewDto = {
          template: 'CLEAN_SETUP',
          wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
          lan: {
            bridgeName: 'bridge-hotspot',
            memberInterfaces: ['ether2', 'ether3'],
            gatewayIp: '10.5.50.1/24',
          },
          confirmedManagementInterface: 'ether1',
          snapshot: programmedL009Snapshot,
          discoveredAt: new Date().toISOString(),
        };

        const natPreview = await service.preview('tenant-001', 'dev-001', natDto);
        expect(natPreview.conflicts.some((c) => c.resource === 'MANAGEMENT_PATH_INDETERMINATE')).toBe(false);
        expect(natPreview.canProceed).toBe(true);

        // Security invariant: confirming an interface that IS in memberInterfaces must STILL block with MANAGEMENT_PORT_BRIDGED
        const unsafeDto: ProvisionPreviewDto = {
          ...natDto,
          confirmedManagementInterface: 'ether2',
        };
        const unsafePreview = await service.preview('tenant-001', 'dev-001', unsafeDto);
        expect(unsafePreview.canProceed).toBe(false);
        expect(unsafePreview.conflicts.some((c) => c.resource === 'MANAGEMENT_PORT_BRIDGED')).toBe(true);
      });
    });
  });
});


