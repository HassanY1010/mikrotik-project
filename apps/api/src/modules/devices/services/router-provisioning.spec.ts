import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { RouterProvisioningService } from './router-provisioning.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { EncryptionService } from '../../../core/security/encryption.service';
import { ProvisionPreviewDto } from '../dto/provision-preview.dto';
import { ProvisionApplyDto } from '../dto/provision-apply.dto';

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
      { dstAddress: '0.0.0.0/0', gateway: '192.168.1.1', active: true, disabled: false },
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

      const preview = await service.preview('tenant-001', 'dev-001', validDto);

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
});


