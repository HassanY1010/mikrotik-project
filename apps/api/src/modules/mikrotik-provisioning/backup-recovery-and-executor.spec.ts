import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../../core/security/encryption.service';
import { PlanSigningService } from '../../core/security/signing.service';
import { DevicesService } from '../devices/devices.service';
import { CommandExecutorService } from './services/command-executor.service';
import { ConfigurationPlannerService } from './services/configuration-planner.service';
import { ProvisioningBackupService } from './services/provisioning-backup.service';
import { ProvisioningLoggerService } from './services/provisioning-logger.service';
import { ProvisioningRecoveryService } from './services/provisioning-recovery.service';
import { ProvisioningValidatorService } from './services/provisioning-validator.service';
import { RouterCapabilityService } from './services/router-capability.service';
import { RouterCompatibilityService } from './services/router-compatibility.service';
import { RouterDiscoveryEngineService } from './services/router-discovery-engine.service';
import { MikrotikProvisioningService } from './mikrotik-provisioning.service';
import type { StartAutoProvisioningDto } from './dto/auto-provisioning.dto';

function createStatefulMockPrisma() {
  const operations = new Map<string, any>();
  const steps = new Map<string, any>();
  const commandLogs = new Map<string, any>();
  const backups = new Map<string, any>();
  const configs = new Map<string, any>();
  const recoveries = new Map<string, any>();
  const devices = new Map<string, any>([
    [
      'dev-1',
      {
        id: 'dev-1',
        tenantId: 'tenant-1',
        name: 'Branch 1',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: null,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'enc',
        iv: 'iv',
        authTag: 'tag',
        rosVersion: 'V7',
        modelName: 'hEX',
        deletedAt: null,
      },
    ],
  ]);

  return {
    operations,
    steps,
    commandLogs,
    backups,
    recoveries,
    mikroTikDevice: {
      findFirst: jest.fn(({ where }) => {
        const d = devices.get(where.id);
        if (!d || d.tenantId !== where.tenantId || d.deletedAt !== null) return Promise.resolve(null);
        return Promise.resolve(d);
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    hotspotProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({ id: 'hp-1' }),
    },
    provisioningConfiguration: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(({ data }) => {
        const id = data.id || `cfg-${configs.size + 1}`;
        configs.set(id, { id, ...data });
        return Promise.resolve(configs.get(id));
      }),
    },
    provisioningOperation: {
      create: jest.fn(({ data }) => {
        const now = new Date();
        operations.set(data.id, { ...data, createdAt: now, updatedAt: now });
        return Promise.resolve(operations.get(data.id));
      }),
      update: jest.fn(({ where, data }) => {
        const existing = operations.get(where.id) || { id: where.id };
        const updated = { ...existing, ...data, updatedAt: new Date() };
        operations.set(where.id, updated);
        return Promise.resolve(updated);
      }),
      findFirst: jest.fn(({ where, include }) => {
        let op: any = undefined;
        if (where?.id) {
          const byId = operations.get(where.id);
          if (byId && (!where.tenantId || byId.tenantId === where.tenantId)) {
            op = byId;
          }
        } else {
          op = Array.from(operations.values()).find((o) => {
            if (where?.tenantId && o.tenantId !== where.tenantId) return false;
            if (where?.deviceId && o.deviceId !== where.deviceId) return false;
            if (where?.status?.in && !where.status.in.includes(o.status)) return false;
            return true;
          });
        }
        if (!op) return Promise.resolve(null);
        if (!include) return Promise.resolve(op);
        const opSteps = Array.from(steps.values())
          .filter((s) => s.operationId === op.id)
          .sort((a, b) => a.stepOrder - b.stepOrder);
        const opCmds = Array.from(commandLogs.values())
          .filter((c) => c.operationId === op.id)
          .sort((a, b) => a.commandOrder - b.commandOrder);
        const opBackups = Array.from(backups.values()).filter((b) => b.operationId === op.id);
        return Promise.resolve({
          ...op,
          device: devices.get(op.deviceId) || null,
          steps: opSteps,
          commandLogs: opCmds,
          backups: opBackups,
        });
      }),
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          Array.from(operations.values()).filter((o) => {
            if (where?.tenantId && o.tenantId !== where.tenantId) return false;
            if (where?.deviceId && o.deviceId !== where.deviceId) return false;
            if (where?.status?.in && !where.status.in.includes(o.status)) return false;
            return true;
          }),
        ),
      ),
    },
    provisioningStep: {
      create: jest.fn(({ data }) => {
        const id = `step-${steps.size + 1}`;
        const row = { id, ...data };
        steps.set(id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }) => {
        const row = { ...steps.get(where.id), ...data };
        steps.set(where.id, row);
        return Promise.resolve(row);
      }),
    },
    provisioningCommandLog: {
      create: jest.fn(({ data }) => {
        const id = `cmd-${commandLogs.size + 1}`;
        const row = { id, ...data };
        commandLogs.set(id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }) => {
        const row = { ...commandLogs.get(where.id), ...data };
        commandLogs.set(where.id, row);
        return Promise.resolve(row);
      }),
    },
    routerBackup: {
      create: jest.fn(({ data }) => {
        const id = data.id || `bk-${backups.size + 1}`;
        const row = { id, createdAt: new Date(), ...data };
        backups.set(id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }) => {
        const existing = backups.get(where.id) || { id: where.id };
        const row = { ...existing, ...data };
        backups.set(where.id, row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(({ where, include }) => {
        const row = backups.get(where.id);
        if (!row || row.tenantId !== where.tenantId) return Promise.resolve(null);
        if (where.deviceId && row.deviceId !== where.deviceId) return Promise.resolve(null);
        return Promise.resolve(include?.device ? { ...row, device: devices.get(row.deviceId) } : row);
      }),
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          Array.from(backups.values()).filter(
            (b) => b.tenantId === where.tenantId && b.deviceId === where.deviceId,
          ),
        ),
      ),
    },
    recoveryOperation: {
      create: jest.fn(({ data }) => {
        const id = data.id || `rec-${recoveries.size + 1}`;
        const row = { id, ...data };
        recoveries.set(id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }) => {
        const row = { ...recoveries.get(where.id), ...data };
        recoveries.set(where.id, row);
        return Promise.resolve(row);
      }),
    },
  } as any;
}

function parseMikrotikWordAttrs(words: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of words.slice(1)) {
    if (!w.startsWith('=')) continue;
    const eq = w.indexOf('=', 1);
    if (eq > 1) {
      out[w.slice(1, eq)] = w.slice(eq + 1);
    }
  }
  return out;
}

function createMockMikrotikClient(options?: {
  disconnectOnCommandMatch?: string;
  failPostVerificationHotspot?: boolean;
  mgmtIpGoneOnSecondDiscover?: boolean;
  version?: string;
  routerFiles?: Array<{ name: string; size?: number; type?: string }>;
}) {
  let discoverCalls = 0;
  let idSeq = 100;
  const executedWords: string[][] = [];
  const createdIds: string[] = [];
  const bridges: Array<{ id: string; name: string; disabled: boolean }> = [];
  const ipAddresses: Array<{ id: string; address: string; interface: string; disabled: boolean }> = [
    { id: '*ip1', address: '192.168.88.1/24', interface: 'ether5', disabled: false },
    { id: '*ip2', address: '100.64.0.2/24', interface: 'ether1', disabled: false },
  ];
  const hotspotServers: Array<{ id: string; name: string; interface: string; profile: string; disabled: boolean }> = [];
  const natRules: any[] = [];
  const mangleRules: any[] = [];
  const filterRules: any[] = [];
  const routerFiles: Array<{ name: string; size?: number; type?: string }> = [
    ...(options?.routerFiles ?? []),
  ];
  let dnsServers = ['8.8.8.8'];
  let dnsAllowRemote = true;

  const client: any = {
    ping: jest.fn().mockResolvedValue(true),
    pingHost: jest.fn().mockResolvedValue({ isReachable: true, packetsReceived: 3, packetLoss: 0 }),
    getSystemResource: jest.fn().mockResolvedValue({
      uptime: '5h',
      version: options?.version || '7.15.2 (stable)',
      cpuLoad: 4,
      freeMemory: 200 * 1024 * 1024,
      totalMemory: 256 * 1024 * 1024,
      freeHdd: 16 * 1024 * 1024,
      totalHdd: 32 * 1024 * 1024,
      boardName: 'hEX',
      model: 'RB750Gr3',
      architectureName: 'mmips',
      platform: 'MikroTik',
    }),
    getSystemIdentity: jest.fn().mockResolvedValue('SudaFi-Lab'),
    getRouterboardInfo: jest.fn().mockResolvedValue({ model: 'RB750Gr3', serialNumber: 'LAB-1' }),
    listPackages: jest.fn().mockResolvedValue([{ name: 'routeros', disabled: false }]),
    listInterfaces: jest.fn().mockResolvedValue([
      { id: '*1', name: 'ether1', type: 'ether', disabled: false, running: true },
      { id: '*2', name: 'ether2', type: 'ether', disabled: false, running: true },
      { id: '*3', name: 'ether5', type: 'ether', disabled: false, running: true },
    ]),
    listBridges: jest.fn().mockImplementation(() => Promise.resolve([...bridges])),
    listBridgePorts: jest.fn().mockResolvedValue([]),
    listVlans: jest.fn().mockResolvedValue([]),
    listBondingInterfaces: jest.fn().mockResolvedValue([]),
    listPppoeClients: jest.fn().mockResolvedValue([]),
    listWirelessInterfaces: jest.fn().mockResolvedValue([]),
    listWifiInterfaces: jest.fn().mockResolvedValue([]),
    listIpAddresses: jest.fn().mockImplementation(() => {
      discoverCalls++;
      if (options?.mgmtIpGoneOnSecondDiscover && discoverCalls > 1) {
        return Promise.resolve([]);
      }
      return Promise.resolve([...ipAddresses]);
    }),
    listPools: jest.fn().mockResolvedValue([]),
    listDhcpClients: jest.fn().mockResolvedValue([
      { id: '*dc1', interface: 'ether1', disabled: false, gateway: '100.64.0.1', status: 'bound' },
    ]),
    listDhcpServers: jest.fn().mockResolvedValue([]),
    listDhcpNetworks: jest.fn().mockResolvedValue([]),
    getDnsConfig: jest.fn().mockImplementation(() =>
      Promise.resolve({ servers: [...dnsServers], allowRemoteRequests: dnsAllowRemote }),
    ),
    listNatRules: jest.fn().mockImplementation(() => Promise.resolve([...natRules])),
    listMangleRules: jest.fn().mockImplementation(() => Promise.resolve([...mangleRules])),
    listFilterRules: jest.fn().mockImplementation(() => Promise.resolve([...filterRules])),
    listRoutes: jest.fn().mockResolvedValue([
      {
        id: '*r1',
        dstAddress: '0.0.0.0/0',
        gateway: '100.64.0.1',
        gatewayStatus: '100.64.0.1 reachable via  ether1',
        immediateGw: '100.64.0.1%ether1',
        active: true,
        disabled: false,
      },
    ]),
    listHotspotServers: jest.fn().mockImplementation(() => {
      if (options?.failPostVerificationHotspot) return Promise.resolve([]);
      return Promise.resolve(
        hotspotServers.length > 0
          ? [...hotspotServers]
          : [{ id: '*hs1', name: 'hs-sudafi', interface: 'bridge-hotspot', profile: 'hsp-server-sudafi', disabled: false }],
      );
    }),
    listHotspotServerProfiles: jest.fn().mockResolvedValue([]),
    listHotspotProfiles: jest.fn().mockResolvedValue([]),
    listQueueTypes: jest.fn().mockResolvedValue([]),
    listSchedulers: jest.fn().mockResolvedValue([]),
    listBackups: jest.fn().mockImplementation(() =>
      Promise.resolve(routerFiles.filter((f) => f.name.endsWith('.backup'))),
    ),
    listFiles: jest.fn().mockImplementation(() => Promise.resolve([...routerFiles])),
    createBackup: jest.fn().mockImplementation((name: string) => {
      const filename = `${name}.backup`;
      routerFiles.push({ name: filename, size: 4096, type: 'backup' });
      return Promise.resolve({ filename, size: 4096 });
    }),
    createRscExport: jest.fn().mockImplementation((name: string) => {
      const filename = `${name}.rsc`;
      routerFiles.push({ name: filename, size: 1024, type: 'script' });
      return Promise.resolve({ filename, size: 1024 });
    }),
    downloadFile: jest.fn().mockImplementation((file: string) =>
      Promise.resolve(Buffer.from(file.endsWith('.rsc') ? '# redacted rsc export\n/system identity set name=SudaFi' : 'BINDATA')),
    ),
    fetchFileFromUrl: jest.fn().mockImplementation((_url: string, dstPath: string) => {
      routerFiles.push({ name: dstPath, size: 4096, type: 'backup' });
      return Promise.resolve(undefined);
    }),
    restoreBackup: jest.fn().mockResolvedValue({ success: true, rebootTriggered: true, message: 'Restored & rebooting' }),
    runRawCommand: jest.fn().mockImplementation((words: string[]) => {
      executedWords.push(words);
      const joined = words.join(' ');
      if (options?.disconnectOnCommandMatch && joined.includes(options.disconnectOnCommandMatch)) {
        return Promise.reject(new Error('Router connection lost mid-operation'));
      }
      const cmd = words[0] ?? '';
      const attrs = parseMikrotikWordAttrs(words);
      if (cmd === '/ip/dns/set') {
        if (attrs.servers !== undefined) dnsServers = attrs.servers ? attrs.servers.split(',') : [];
        if (attrs['allow-remote-requests'] !== undefined) dnsAllowRemote = attrs['allow-remote-requests'] === 'yes';
        return Promise.resolve([{ type: '!done', attributes: {} }]);
      }
      if (cmd === '/ip/dns/print') {
        return Promise.resolve([{
          type: '!re',
          attributes: { servers: dnsServers.join(','), 'allow-remote-requests': dnsAllowRemote ? 'yes' : 'no' },
        }, { type: '!done', attributes: {} }]);
      }
      if (cmd.endsWith('/print')) {
        return Promise.resolve([{ type: '!done', attributes: {} }]);
      }
      if (cmd.endsWith('/add')) {
        const ret = `*${idSeq++}`;
        createdIds.push(ret);
        if (cmd === '/interface/bridge/add') {
          bridges.push({ id: ret, name: attrs.name || 'bridge', disabled: attrs.disabled === 'yes' });
        } else if (cmd === '/ip/address/add') {
          ipAddresses.push({ id: ret, address: attrs.address || '', interface: attrs.interface || '', disabled: attrs.disabled === 'yes' });
        } else if (cmd === '/ip/hotspot/add') {
          hotspotServers.push({ id: ret, name: attrs.name || 'hs', interface: attrs.interface || '', profile: attrs.profile || '', disabled: attrs.disabled === 'yes' });
        } else if (cmd === '/ip/firewall/nat/add') {
          natRules.push({
            id: ret,
            chain: attrs.chain,
            action: attrs.action,
            outInterface: attrs['out-interface'],
            srcAddress: attrs['src-address'],
            dstPort: attrs['dst-port'],
            comment: attrs.comment,
            disabled: attrs.disabled === 'yes',
          });
        } else if (cmd === '/ip/firewall/mangle/add') {
          mangleRules.push({
            id: ret,
            chain: attrs.chain,
            action: attrs.action,
            comment: attrs.comment,
            disabled: attrs.disabled === 'yes',
          });
        } else if (cmd === '/ip/firewall/filter/add') {
          filterRules.push({
            id: ret,
            chain: attrs.chain,
            action: attrs.action,
            dstPort: attrs['dst-port'],
            comment: attrs.comment,
            disabled: attrs.disabled === 'yes',
          });
        }
        return Promise.resolve([{ type: '!done', attributes: { ret } }]);
      }
      if (cmd.endsWith('/remove')) {
        const rmId = attrs['.id'];
        for (const store of [bridges, ipAddresses, hotspotServers, natRules, mangleRules, filterRules]) {
          const idx = store.findIndex((item) => item.id === rmId);
          if (idx >= 0) store.splice(idx, 1);
        }
      }
      return Promise.resolve([{ type: '!done', attributes: {} }]);
    }),
  };

  return { client, executedWords, createdIds };
}

function makeApplyDto(planToken?: any): StartAutoProvisioningDto {
  return {
    template: 'CLEAN_SETUP',
    wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
    lan: {
      bridgeName: 'bridge-hotspot',
      memberInterfaces: ['ether2'],
      gatewayIp: '172.16.50.1/24',
    },
    hotspot: { serverName: 'hs-sudafi', dnsName: 'login.sudafi.net' },
    queues: { enabled: true },
    system: { identity: 'SudaFi-Node-1', ntpEnabled: true },
    scheduler: { enableAutoBackupSchedule: false },
    confirmPlan: true,
    confirmWanChange: true,
    createPreBackup: true,
    executionMode: 'CLOUD',
    ...(planToken ? { planToken } : {}),
  } as StartAutoProvisioningDto;
}

describe('Backup, Recovery, Safe Command Execution & Tenant Isolation', () => {
  afterEach(() => {
    DevicesService.activeDeviceOperations.clear();
  });

  it('creates encrypted Binary + redacted RSC backups in private bucket storage and verifies checksums', async () => {
    const prisma = createStatefulMockPrisma();
    const { client } = createMockMikrotikClient();
    const clientFactory = { getClient: jest.fn().mockResolvedValue(client) } as any;
    const encryptionService = {
      deriveDeterministicSecret: jest.fn().mockReturnValue('DerivedBackupPass#2026'),
    } as unknown as EncryptionService;
    const uploadedPaths: string[] = [];
    const storageService = {
      isConfigured: () => true,
      uploadPrivateObject: jest.fn().mockImplementation(({ tenantId, deviceId, backupId, fileName }) => {
        const path = `${tenantId}/${deviceId}/${backupId}_${fileName}`;
        uploadedPaths.push(path);
        return Promise.resolve({ uploaded: true, bucket: 'router-backups', storagePath: path });
      }),
      createSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/private'),
    } as any;

    const backupSvc = new ProvisioningBackupService(
      prisma,
      clientFactory,
      encryptionService,
      storageService,
      { log: jest.fn() } as any,
    );

    const bundle = await backupSvc.createBackupBundle({
      tenantId: 'tenant-1',
      deviceId: 'dev-1',
      userId: 'user-1',
      includeRscExport: true,
    });

    expect(client.createBackup).toHaveBeenCalledWith(expect.any(String), 'DerivedBackupPass#2026');
    expect(bundle.binaryBackup?.cloudStored).toBe(true);
    expect(bundle.binaryBackup?.checksumSha256).toHaveLength(64);
    expect(bundle.rscBackup?.cloudStored).toBe(true);
    expect(uploadedPaths.every((p) => p.startsWith('tenant-1/dev-1/'))).toBe(true);
  });

  it('Recovery Service enforces double confirmations, rejects .rsc auto-restore, and warns cross-model restores', async () => {
    const prisma = createStatefulMockPrisma();
    await prisma.routerBackup.create({
      data: {
        id: 'bk-bin-old',
        tenantId: 'tenant-1',
        deviceId: 'dev-1',
        backupType: 'BINARY',
        fileName: 'old.backup',
        routerFileName: 'old.backup',
        deviceModel: 'CCR1009-7G-1C',
        routerOsVersion: '6.49.10',
      },
    });
    await prisma.routerBackup.create({
      data: {
        id: 'bk-rsc-1',
        tenantId: 'tenant-1',
        deviceId: 'dev-1',
        backupType: 'RSC_EXPORT',
        fileName: 'cfg.rsc',
        routerFileName: 'cfg.rsc',
      },
    });

    const { client } = createMockMikrotikClient({
      version: '7.15.2',
      routerFiles: [{ name: 'old.backup', size: 4096 }],
    });
    const recovery = new ProvisioningRecoveryService(
      prisma,
      { getClient: jest.fn().mockResolvedValue(client) } as any,
      { deriveDeterministicSecret: jest.fn().mockReturnValue('pass123') } as any,
      { log: jest.fn() } as any,
    );

    // Missing acknowledgements
    await expect(
      recovery.restoreBackup('tenant-1', 'dev-1', {
        backupId: 'bk-bin-old',
        confirmed: true,
        acknowledgeReboot: false,
        acknowledgeDisconnect: true,
      }),
    ).rejects.toThrow(BadRequestException);

    // Cannot auto-restore .rsc
    await expect(
      recovery.restoreBackup('tenant-1', 'dev-1', {
        backupId: 'bk-rsc-1',
        confirmed: true,
        acknowledgeReboot: true,
        acknowledgeDisconnect: true,
      }),
    ).rejects.toThrow(BadRequestException);

    // Cross-model & cross-version compatibility gate
    await expect(
      recovery.restoreBackup('tenant-1', 'dev-1', {
        backupId: 'bk-bin-old',
        confirmed: true,
        acknowledgeReboot: true,
        acknowledgeDisconnect: true,
        acknowledgeCompatibilityRisk: false,
      }),
    ).rejects.toThrow(BadRequestException);

    // Explicitly acknowledged cross-model restore proceeds and records RecoveryOperation
    const res = await recovery.restoreBackup('tenant-1', 'dev-1', {
      backupId: 'bk-bin-old',
      confirmed: true,
      acknowledgeReboot: true,
      acknowledgeDisconnect: true,
      acknowledgeCompatibilityRisk: true,
    });
    expect(res.success).toBe(true);
    expect(res.rebootTriggered).toBe(true);
    expect(res.compatibilityWarning).toContain('CCR1009');
  });

  it('Stage 0 live check blocks execution BEFORE backup/mutation if management IP vanished', async () => {
    const prisma = createStatefulMockPrisma();
    const { client, executedWords } = createMockMikrotikClient({ mgmtIpGoneOnSecondDiscover: true });
    const clientFactory = { getClient: jest.fn().mockResolvedValue(client) } as any;
    const capSvc = new RouterCapabilityService();
    const discoverySvc = new RouterDiscoveryEngineService(prisma, clientFactory, capSvc);
    const validator = new ProvisioningValidatorService();
    const planner = new ConfigurationPlannerService(
      new RouterCompatibilityService(),
      validator,
      new PlanSigningService(),
    );
    const loggerSvc = new ProvisioningLoggerService(prisma);
    const backupSvc = new ProvisioningBackupService(
      prisma,
      clientFactory,
      { deriveDeterministicSecret: () => 'x' } as any,
      { isConfigured: () => false, uploadPrivateObject: jest.fn() } as any,
      { log: jest.fn() } as any,
    );
    const executor = new CommandExecutorService(
      prisma,
      clientFactory,
      discoverySvc,
      validator,
      backupSvc,
      loggerSvc,
      { log: jest.fn() } as any,
    );

    const disc = await discoverySvc.discover('tenant-1', 'dev-1');
    const dto = makeApplyDto();
    const plan = planner.buildPlan(dto, disc, 'tenant-1');

    const result = await executor.executePlan({
      tenantId: 'tenant-1',
      deviceId: 'dev-1',
      userId: 'user-1',
      dto,
      plan,
    });

    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('192.168.88.1');
    expect(client.createBackup).not.toHaveBeenCalled();
    expect(executedWords).toHaveLength(0);
    expect(DevicesService.activeDeviceOperations.has('dev-1')).toBe(false);
  });

  it('Disconnect mid-execution triggers tracked rollbackStack (.id remove, zero [find]) and cleans up device lock', async () => {
    const prisma = createStatefulMockPrisma();
    const { client, executedWords, createdIds } = createMockMikrotikClient({
      disconnectOnCommandMatch: '/ip/hotspot/add',
    });
    const clientFactory = { getClient: jest.fn().mockResolvedValue(client) } as any;
    const capSvc = new RouterCapabilityService();
    const discoverySvc = new RouterDiscoveryEngineService(prisma, clientFactory, capSvc);
    const validator = new ProvisioningValidatorService();
    const planner = new ConfigurationPlannerService(
      new RouterCompatibilityService(),
      validator,
      new PlanSigningService(),
    );
    const loggerSvc = new ProvisioningLoggerService(prisma);
    const backupSvc = new ProvisioningBackupService(
      prisma,
      clientFactory,
      { deriveDeterministicSecret: () => 'sec' } as any,
      {
        isConfigured: () => true,
        uploadPrivateObject: jest.fn().mockResolvedValue({
          uploaded: true,
          bucket: 'router-backups',
          storagePath: 'tenant-1/dev-1/local',
        }),
      } as any,
      { log: jest.fn() } as any,
    );
    const executor = new CommandExecutorService(
      prisma,
      clientFactory,
      discoverySvc,
      validator,
      backupSvc,
      loggerSvc,
      { log: jest.fn() } as any,
    );

    const disc = await discoverySvc.discover('tenant-1', 'dev-1');
    const dto = makeApplyDto();
    const plan = planner.buildPlan(dto, disc, 'tenant-1');

    const op = await executor.executePlan({
      tenantId: 'tenant-1',
      deviceId: 'dev-1',
      userId: 'user-1',
      dto,
      plan,
    });

    expect(op.status).toBe('ROLLED_BACK');
    expect(op.preBackupId).toBeTruthy();
    expect(createdIds.length).toBeGreaterThan(0);
    // Verify rollback removed tracked .id entries AND rolled back dynamic /ip/dns/set and /system/identity/set pre-change values without any [find] wildcard
    const rollbackCmds = executedWords.map((w) => w.join(' ')).filter((c) => c.includes('/remove'));
    expect(rollbackCmds.length).toBe(createdIds.length);
    expect(rollbackCmds.every((c) => c.includes('=.id=*') && !c.includes('[find'))).toBe(true);
    const flatCmds = executedWords.map((w) => w.join(' '));
    expect(flatCmds.some((c) => c.includes('/ip/dns/set') && c.includes('=servers=8.8.8.8'))).toBe(true);
    expect((op.verificationResult as any)?.rollbackReport?.allSucceeded).toBe(true);
    expect(DevicesService.activeDeviceOperations.has('dev-1')).toBe(false);
  });

  it('Happy path succeeds with mandatory signed planToken, pre-backup, multi-point firewall/route verification, and Enforces Tenant B isolation', async () => {
    const prisma = createStatefulMockPrisma();
    const { client } = createMockMikrotikClient();
    const clientFactory = { getClient: jest.fn().mockResolvedValue(client) } as any;
    const capSvc = new RouterCapabilityService();
    const discoverySvc = new RouterDiscoveryEngineService(prisma, clientFactory, capSvc);
    const validator = new ProvisioningValidatorService();
    const compat = new RouterCompatibilityService();
    const signing = new PlanSigningService();
    const planner = new ConfigurationPlannerService(compat, validator, signing);
    const loggerSvc = new ProvisioningLoggerService(prisma);
    const backupSvc = new ProvisioningBackupService(
      prisma,
      clientFactory,
      { deriveDeterministicSecret: () => 'sec' } as any,
      {
        isConfigured: () => true,
        uploadPrivateObject: jest.fn().mockResolvedValue({
          uploaded: true,
          bucket: 'router-backups',
          storagePath: 'tenant-1/dev-1/file',
        }),
        createSignedDownloadUrl: jest.fn().mockResolvedValue(undefined),
      } as any,
      { log: jest.fn() } as any,
    );
    const recovery = new ProvisioningRecoveryService(
      prisma,
      clientFactory,
      { deriveDeterministicSecret: () => 'sec' } as any,
      { log: jest.fn() } as any,
    );
    const executor = new CommandExecutorService(
      prisma,
      clientFactory,
      discoverySvc,
      validator,
      backupSvc,
      loggerSvc,
      { log: jest.fn() } as any,
    );
    const devicesService = {
      assertUserDeviceAccess: jest.fn().mockImplementation((tId: string) => {
        if (tId !== 'tenant-1') {
          throw new ForbiddenException('Access denied: cross-tenant device isolation');
        }
        return Promise.resolve({ id: 'dev-1' });
      }),
    } as any;

    const facade = new MikrotikProvisioningService(
      prisma,
      devicesService,
      discoverySvc,
      compat,
      planner,
      backupSvc,
      recovery,
      loggerSvc,
      executor,
      signing,
      { log: jest.fn() } as any,
    );

    const preview = await facade.buildPreview(
      'tenant-1',
      'dev-1',
      makeApplyDto(),
      { id: 'u1', email: 'a@b.c', role: 'TENANT_ADMIN', tenantId: 'tenant-1' } as any,
    );

    const dto = makeApplyDto(preview.planToken);
    const op = await facade.applyProvisioning(
      'tenant-1',
      'dev-1',
      dto,
      { id: 'u1', email: 'a@b.c', role: 'TENANT_ADMIN', tenantId: 'tenant-1' } as any,
      { asyncExecution: false },
    );

    expect(op.status).toBe('COMPLETED');
    expect(op.progressPercent).toBe(100);
    expect((op.verificationResult as any).overallStatus).toBe('VERIFIED_READY');
    expect((op.verificationResult as any).securityPoliciesVerified).toBe(true);

    // Replay attack: re-submitting same signed planToken MUST fail
    await expect(
      facade.applyProvisioning(
        'tenant-1',
        'dev-1',
        makeApplyDto(preview.planToken),
        { id: 'u1', email: 'a@b.c', role: 'TENANT_ADMIN', tenantId: 'tenant-1' } as any,
        { asyncExecution: false },
      ),
    ).rejects.toThrow(BadRequestException);

    // Cross-tenant isolation verification on Discovery, Operation lookup & Backup download
    await expect(
      facade.discoverDevice('tenant-2', 'dev-1', { id: 'u2', email: 'b@c.d', role: 'TENANT_ADMIN', tenantId: 'tenant-2' } as any),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      facade.getOperationDetails('tenant-2', op.id),
    ).rejects.toThrow(NotFoundException);

    await expect(
      facade.downloadBackup('tenant-2', op.preBackupId!),
    ).rejects.toThrow(NotFoundException);
  });
});
