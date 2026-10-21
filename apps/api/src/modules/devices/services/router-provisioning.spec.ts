import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { RouterProvisioningService } from './router-provisioning.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { ProvisionPreviewDto } from '../dto/provision-preview.dto';
import { ProvisionApplyDto } from '../dto/provision-apply.dto';

describe('RouterProvisioningService (MikroTik Provisioning Engine Phase 1)', () => {
  let service: RouterProvisioningService;

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
        memberInterfaces: ['ether2', 'ether3', 'ether4', 'ether5'],
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
        memberInterfaces: ['ether2', 'ether3'],
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
      expect(mockMikrotikClient.createBackup).toHaveBeenCalled();
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
        lan: { memberInterfaces: ['ether2'], gatewayIp: '10.5.50.1/24' },
      };

      const result = await service.apply('tenant-001', 'dev-001', applyDto, 'user-01');

      expect(result.verification.overallStatus).toBe('PARTIALLY_VERIFIED');
      expect(result.verification.internetReachable).toBe(false);
      expect(result.verification.hotspotOperational).toBe(true);
      expect(result.verification.diagnosticsMessage).toContain('تعذر الوصول إلى الإنترنت');
    });
  });
});
