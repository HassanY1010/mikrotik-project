import * as crypto from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { validateConfig } from '../../config/env.validation';
import { PlanSigningService } from '../../core/security/signing.service';
import { DevicesService } from '../devices/devices.service';
import type {
  AutoProvisionConfigDto,
  StartAutoProvisioningDto,
} from './dto/auto-provisioning.dto';
import { MikrotikProvisioningService } from './mikrotik-provisioning.service';
import { CommandExecutorService } from './services/command-executor.service';
import { ConfigurationPlannerService } from './services/configuration-planner.service';
import { ProvisioningBackupService } from './services/provisioning-backup.service';
import { ProvisioningLoggerService } from './services/provisioning-logger.service';
import { ProvisioningRecoveryService } from './services/provisioning-recovery.service';
import { ProvisioningValidatorService } from './services/provisioning-validator.service';
import { RouterCapabilityService } from './services/router-capability.service';
import { RouterCompatibilityService } from './services/router-compatibility.service';
import { RouterDiscoveryEngineService } from './services/router-discovery-engine.service';
import {
  maskExecutionWords,
  maskSecretsInText,
  sanitizeStructuredSecrets,
} from './utils/secret-redactor.util';

function parseWordsAttrs(words: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of words.slice(1)) {
    if (!w.startsWith('=')) continue;
    const idx = w.indexOf('=', 1);
    if (idx > 1) out[w.slice(1, idx)] = w.slice(idx + 1);
  }
  return out;
}

function createStatefulTestPrisma() {
  const operations = new Map<string, any>();
  const steps = new Map<string, any>();
  const commandLogs = new Map<string, any>();
  const backups = new Map<string, any>();
  const recoveries = new Map<string, any>();
  const deviceUpdateCalls: any[] = [];

  const db: any = {
    operations,
    steps,
    commandLogs,
    backups,
    recoveries,
    deviceUpdateCalls,
    withTenantRls: jest.fn((_tenantId: string, fn: (tx: any) => Promise<any>) => fn(db)),
    mikroTikDevice: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve({
          id: where.id,
          tenantId: where.tenantId,
          name: 'SudaFi-Lab',
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
        }),
      ),
      update: jest.fn(({ where, data }) => {
        deviceUpdateCalls.push({ where, data });
        return Promise.resolve({ id: where.id, ...data });
      }),
    },
    hotspotProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'hp-1' }),
    },
    provisioningConfiguration: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'cfg-1', ...data })),
    },
    provisioningOperation: {
      create: jest.fn(({ data }) => {
        const id = data.id || `op-${operations.size + 1}`;
        const row = { id, cancelRequested: false, createdAt: new Date(), updatedAt: new Date(), ...data };
        operations.set(id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }) => {
        const existing = operations.get(where.id) || {};
        const updated = { ...existing, ...data, updatedAt: new Date() };
        operations.set(where.id, updated);
        return Promise.resolve(updated);
      }),
      findFirst: jest.fn(({ where }) => {
        const matches = Array.from(operations.values()).filter((op) => {
          if (where.id && op.id !== where.id) return false;
          if (where.tenantId && op.tenantId !== where.tenantId) return false;
          if (where.deviceId && op.deviceId !== where.deviceId) return false;
          if (where.status?.in && !where.status.in.includes(op.status)) return false;
          return true;
        });
        return Promise.resolve(matches[0] || null);
      }),
      findMany: jest.fn(({ where }) => {
        const matches = Array.from(operations.values()).filter((op) => {
          if (where?.tenantId && op.tenantId !== where.tenantId) return false;
          if (where?.deviceId && op.deviceId !== where.deviceId) return false;
          if (where?.status?.in && !where.status.in.includes(op.status)) return false;
          return true;
        });
        return Promise.resolve(matches);
      }),
    },
    provisioningStep: {
      create: jest.fn(({ data }) => {
        const id = data.id || `step-${steps.size + 1}`;
        const row = { id, ...data };
        steps.set(id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }) => {
        const row = { ...steps.get(where.id), ...data };
        steps.set(where.id, row);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    provisioningCommandLog: {
      create: jest.fn(({ data }) => {
        const id = data.id || `cmd-${commandLogs.size + 1}`;
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
        const row = { id, ...data };
        backups.set(id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }) => {
        const row = { ...backups.get(where.id), ...data };
        backups.set(where.id, row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(({ where }) => {
        const item = backups.get(where.id);
        if (!item) return Promise.resolve(null);
        if (where.tenantId && item.tenantId !== where.tenantId) return Promise.resolve(null);
        if (where.deviceId && item.deviceId !== where.deviceId) return Promise.resolve(null);
        return Promise.resolve(item);
      }),
      findMany: jest.fn(() => Promise.resolve(Array.from(backups.values()))),
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
  };
  return db;
}

function createStatefulRouterClient(options?: {
  disconnectOnceOnAdd?: boolean;
  failRollbackRemove?: boolean;
  keepCreatedResourceOnPrintAfterRemove?: boolean;
  pingUnreachableAfterExecution?: boolean;
  routeEgressInterface?: string;
  omitFilterRules?: boolean;
  extraIpAddresses?: Array<{ id: string; address: string; interface: string; disabled: boolean }>;
  bondingInterfaces?: any[];
  pppoeClients?: any[];
  bridges?: any[];
  bridgePorts?: any[];
  vlans?: any[];
  interfaces?: any[];
}) {
  let idSeq = 200;
  let disconnectTriggered = false;
  let executionPhase = false;
  const executedWords: string[][] = [];
  const natRules: any[] = [];
  const mangleRules: any[] = [];
  const filterRules: any[] = [];
  const hotspots: any[] = [];
  const bridges: any[] = options?.bridges ? [...options.bridges] : [];
  const ipAddresses: any[] = options?.extraIpAddresses
    ? [...options.extraIpAddresses]
    : [
        { id: '*ip1', address: '192.168.88.1/24', interface: 'ether5', disabled: false },
        { id: '*ip2', address: '100.64.0.2/24', interface: 'ether1', disabled: false },
      ];
  let dnsServers = ['8.8.8.8'];
  let dnsAllowRemote = true;
  let identityName = 'Initial-Lab';
  const routerFiles: Array<{ name: string; size?: number; type?: string }> = [];
  const createdByPath = new Map<string, Array<Record<string, string>>>();

  const client: any = {
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue(true),
    pingHost: jest.fn().mockImplementation(() =>
      Promise.resolve(
        options?.pingUnreachableAfterExecution && executionPhase
          ? { isReachable: false, packetsReceived: 0, packetLoss: 100 }
          : { isReachable: true, packetsReceived: 3, packetLoss: 0 },
      ),
    ),
    getSystemResource: jest.fn().mockResolvedValue({
      uptime: '2h',
      version: '7.15.2 (stable)',
      cpuLoad: 5,
      freeMemory: 200 * 1024 * 1024,
      totalMemory: 256 * 1024 * 1024,
      freeHdd: 20 * 1024 * 1024,
      totalHdd: 32 * 1024 * 1024,
      boardName: 'hEX',
      model: 'RB750Gr3',
      architectureName: 'mmips',
      platform: 'MikroTik',
    }),
    getSystemIdentity: jest.fn().mockImplementation(() => Promise.resolve(identityName)),
    getRouterboardInfo: jest.fn().mockResolvedValue({ model: 'RB750Gr3', serialNumber: 'LAB-SEC' }),
    listPackages: jest.fn().mockResolvedValue([{ name: 'routeros', disabled: false }]),
    listInterfaces: jest.fn().mockResolvedValue(
      options?.interfaces ?? [
        { id: '*1', name: 'ether1', type: 'ether', disabled: false, running: true },
        { id: '*2', name: 'ether2', type: 'ether', disabled: false, running: true },
        { id: '*3', name: 'ether3', type: 'ether', disabled: false, running: true },
        { id: '*4', name: 'ether5', type: 'ether', disabled: false, running: true },
      ],
    ),
    listBridges: jest.fn().mockImplementation(() => Promise.resolve([...bridges])),
    listBridgePorts: jest.fn().mockResolvedValue(options?.bridgePorts ?? []),
    listVlans: jest.fn().mockResolvedValue(options?.vlans ?? []),
    listBondingInterfaces: jest.fn().mockResolvedValue(options?.bondingInterfaces ?? []),
    listPppoeClients: jest.fn().mockResolvedValue(options?.pppoeClients ?? []),
    listWirelessInterfaces: jest.fn().mockResolvedValue([]),
    listWifiInterfaces: jest.fn().mockResolvedValue([]),
    listIpAddresses: jest.fn().mockImplementation(() => Promise.resolve([...ipAddresses])),
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
    listFilterRules: jest.fn().mockImplementation(() =>
      Promise.resolve(options?.omitFilterRules ? [] : [...filterRules]),
    ),
    listRoutes: jest.fn().mockImplementation(() => {
      const egress = options?.routeEgressInterface || 'ether1';
      return Promise.resolve([
        {
          id: '*r1',
          dstAddress: '0.0.0.0/0',
          gateway: '100.64.0.1',
          gatewayStatus: `100.64.0.1 reachable via  ${egress}`,
          immediateGw: `100.64.0.1%${egress}`,
          active: true,
          disabled: false,
        },
      ]);
    }),
    listHotspotServers: jest.fn().mockImplementation(() =>
      Promise.resolve(
        hotspots.length > 0
          ? [...hotspots]
          : [{ id: '*hs1', name: 'hs-sudafi', interface: 'bridge-hotspot', profile: 'hsp-server-sudafi', disabled: false }],
      ),
    ),
    listHotspotServerProfiles: jest.fn().mockResolvedValue([]),
    listHotspotProfiles: jest.fn().mockResolvedValue([]),
    listQueueTypes: jest.fn().mockResolvedValue([]),
    listSchedulers: jest.fn().mockResolvedValue([]),
    listBackups: jest.fn().mockImplementation(() => Promise.resolve(routerFiles.filter((f) => f.name.endsWith('.backup')))),
    listFiles: jest.fn().mockImplementation(() => Promise.resolve([...routerFiles])),
    createBackup: jest.fn().mockImplementation((name: string) => {
      const filename = `${name}.backup`;
      routerFiles.push({ name: filename, size: 2048, type: 'backup' });
      return Promise.resolve({ filename, size: 2048 });
    }),
    createRscExport: jest.fn().mockImplementation((name: string) => {
      const filename = `${name}.rsc`;
      routerFiles.push({ name: filename, size: 512, type: 'script' });
      return Promise.resolve({ filename, size: 512 });
    }),
    downloadFile: jest.fn().mockImplementation((name: string) =>
      Promise.resolve(Buffer.from(name.endsWith('.rsc') ? '# rsc' : 'BIN-DATA')),
    ),
    fetchFileFromUrl: jest.fn().mockImplementation((_url: string, dstPath: string) => {
      routerFiles.push({ name: dstPath, size: 2048, type: 'backup' });
      return Promise.resolve(undefined);
    }),
    restoreBackup: jest.fn().mockResolvedValue({ success: true, rebootTriggered: true, message: 'ok' }),
    runRawCommand: jest.fn().mockImplementation((words: string[]) => {
      executedWords.push(words);
      executionPhase = true;
      const cmd = words[0] || '';
      const attrs = parseWordsAttrs(words);

      if (cmd.endsWith('/print')) {
        const basePath = cmd.replace(/\/print$/, '');
        if (basePath === '/ip/dns') {
          return Promise.resolve([{
            type: '!re',
            attributes: { servers: dnsServers.join(','), 'allow-remote-requests': dnsAllowRemote ? 'yes' : 'no' },
          }, { type: '!done', attributes: {} }]);
        }
        if (basePath === '/system/identity') {
          return Promise.resolve([{ type: '!re', attributes: { name: identityName } }, { type: '!done', attributes: {} }]);
        }
        const rows = createdByPath.get(basePath) || [];
        return Promise.resolve([
          ...rows.map((r) => ({ type: '!re', attributes: r })),
          { type: '!done', attributes: {} },
        ]);
      }

      if (cmd === '/ip/dns/set') {
        if (attrs.servers !== undefined) dnsServers = attrs.servers.split(',').filter(Boolean);
        if (attrs['allow-remote-requests'] !== undefined) dnsAllowRemote = attrs['allow-remote-requests'] === 'yes';
        return Promise.resolve([{ type: '!done', attributes: {} }]);
      }
      if (cmd === '/system/identity/set') {
        if (attrs.name) identityName = attrs.name;
        return Promise.resolve([{ type: '!done', attributes: {} }]);
      }

      if (cmd.endsWith('/add')) {
        const basePath = cmd.replace(/\/add$/, '');
        const ret = `*${idSeq++}`;
        const row = { '.id': ret, ...attrs };
        const arr = createdByPath.get(basePath) || [];
        arr.push(row);
        createdByPath.set(basePath, arr);

        if (basePath === '/interface/bridge') bridges.push({ id: ret, name: attrs.name, disabled: false });
        if (basePath === '/ip/address') ipAddresses.push({ id: ret, address: attrs.address, interface: attrs.interface, disabled: false });
        if (basePath === '/ip/hotspot') hotspots.push({ id: ret, name: attrs.name, interface: attrs.interface, profile: attrs.profile, disabled: false });
        if (basePath === '/ip/firewall/nat') {
          natRules.push({ id: ret, chain: attrs.chain, action: attrs.action, outInterface: attrs['out-interface'], srcAddress: attrs['src-address'], comment: attrs.comment, disabled: false });
        }
        if (basePath === '/ip/firewall/mangle') {
          mangleRules.push({ id: ret, chain: attrs.chain, action: attrs.action, comment: attrs.comment, disabled: false });
        }
        if (basePath === '/ip/firewall/filter') {
          filterRules.push({ id: ret, chain: attrs.chain, action: attrs.action, dstPort: attrs['dst-port'], comment: attrs.comment, disabled: false });
        }

        if (options?.disconnectOnceOnAdd && !disconnectTriggered && basePath === '/ip/pool') {
          disconnectTriggered = true;
          return Promise.reject(new Error('ETIMEDOUT socket closed mid-request'));
        }
        return Promise.resolve([{ type: '!done', attributes: { ret } }]);
      }

      if (cmd.endsWith('/remove')) {
        if (options?.failRollbackRemove) {
          return Promise.reject(new Error('Router unreachable during rollback'));
        }
        const basePath = cmd.replace(/\/remove$/, '');
        const rmId = attrs['.id'];
        if (!options?.keepCreatedResourceOnPrintAfterRemove) {
          const arr = createdByPath.get(basePath);
          if (arr) {
            const idx = arr.findIndex((r) => r['.id'] === rmId);
            if (idx >= 0) arr.splice(idx, 1);
          }
        }
        for (const store of [natRules, mangleRules, filterRules, hotspots, bridges, ipAddresses]) {
          const i = store.findIndex((r) => r.id === rmId);
          if (i >= 0) store.splice(i, 1);
        }
      }

      return Promise.resolve([{ type: '!done', attributes: {} }]);
    }),
  };

  return { client, executedWords, dnsServersRef: () => dnsServers };
}

function makePreviewDto(overrides?: Partial<AutoProvisionConfigDto>): AutoProvisionConfigDto {
  return {
    template: 'CLEAN_SETUP',
    wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
    lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '172.16.50.1/24' },
    hotspot: { serverName: 'hs-sudafi', dnsName: 'login.sudafi.net' },
    queues: { enabled: true },
    system: { identity: 'SudaFi-Prod-1', ntpEnabled: true },
    scheduler: { enableAutoBackupSchedule: false },
    confirmWanChange: true,
    ...overrides,
  };
}

function makeApplyDto(
  planToken: any,
  overrides?: Partial<StartAutoProvisioningDto>,
): StartAutoProvisioningDto {
  return {
    ...makePreviewDto(),
    confirmPlan: true,
    createPreBackup: true,
    executionMode: 'CLOUD',
    planToken,
    ...overrides,
  } as StartAutoProvisioningDto;
}

function makeHarness(routerOpts?: Parameters<typeof createStatefulRouterClient>[0], storageUploaded = true) {
  const prisma = createStatefulTestPrisma();
  const { client, executedWords } = createStatefulRouterClient(routerOpts);
  const clientFactory = { getClient: jest.fn().mockResolvedValue(client) } as any;
  const discoverySvc = new RouterDiscoveryEngineService(prisma, clientFactory, new RouterCapabilityService());
  const validator = new ProvisioningValidatorService();
  const signing = new PlanSigningService();
  const planner = new ConfigurationPlannerService(new RouterCompatibilityService(), validator, signing);
  const loggerSvc = new ProvisioningLoggerService(prisma);
  const uploadedPayloads = new Map<string, Buffer>();
  const storageSvc = {
    isConfigured: () => storageUploaded,
    uploadPrivateObject: jest.fn().mockImplementation(({ storagePath, buffer }: any) => {
      if (!storageUploaded) return Promise.resolve({ uploaded: false, bucket: 'router-backups', storagePath: '' });
      const key = storagePath || `tenant-1/dev-1/backup-${uploadedPayloads.size + 1}.backup`;
      if (buffer) uploadedPayloads.set(key, buffer);
      return Promise.resolve({ uploaded: true, bucket: 'router-backups', storagePath: key });
    }),
    downloadPrivateObject: jest.fn().mockImplementation(({ storagePath }: any) =>
      Promise.resolve(uploadedPayloads.get(storagePath) || Buffer.from('BIN-DATA')),
    ),
    createSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.supabase.example/private/bk.backup'),
  } as any;
  const backupSvc = new ProvisioningBackupService(
    prisma,
    clientFactory,
    { deriveDeterministicSecret: () => 'DerivedPass#1' } as any,
    storageSvc,
    { log: jest.fn() } as any,
  );
  const recoverySvc = new ProvisioningRecoveryService(
    prisma,
    clientFactory,
    { deriveDeterministicSecret: () => 'DerivedPass#1' } as any,
    { log: jest.fn() } as any,
    storageSvc,
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
  const devicesSvc = {
    assertUserDeviceAccess: jest.fn().mockResolvedValue({ id: 'dev-1', tenantId: 'tenant-1' }),
  } as any;
  const facade = new MikrotikProvisioningService(
    prisma,
    devicesSvc,
    discoverySvc,
    new RouterCompatibilityService(),
    planner,
    backupSvc,
    recoverySvc,
    loggerSvc,
    executor,
    signing,
    { log: jest.fn() } as any,
  );

  return { prisma, client, executedWords, discoverySvc, validator, signing, planner, backupSvc, recoverySvc, executor, facade, storageSvc };
}

describe('Remediation Regression Suite: Security, Rollback, Execution Locks, Backup/Recovery & Topology', () => {
  afterEach(() => {
    DevicesService.activeDeviceOperations.clear();
  });

  describe('C-1: Production Secrets Guard, Plan Integrity, Drift & Anti-Replay', () => {
    it('blocks NODE_ENV=production startup when required secrets are missing or use default dev keys', () => {
      expect(() => validateConfig({ NODE_ENV: 'production' })).toThrow(/Production security validation failed/);
      expect(() =>
        validateConfig({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://u:p@db:5432/prod',
          REDIS_URL: 'rediss://default:pwd@redis:6379',
          JWT_ACCESS_SECRET: 'development_jwt_access_secret_key_minimum_32_characters_long_12345',
          JWT_REFRESH_SECRET: 'strong_refresh_secret_value_at_least_32_chars_long',
          ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          AGENT_PAIRING_SECRET: 'strong_pairing_secret_value_at_least_32_chars_long',
          COOKIE_SECRET: 'strong_cookie_secret_value_at_least_32_chars_long',
          SUPABASE_URL: 'https://proj.supabase.co',
          SUPABASE_SECRET_KEY: 'service-role-key',
        }),
      ).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('rejects missing planToken, tampered command digest, expired token, wrong tenant, and router snapshotHash drift', async () => {
      const h = makeHarness();
      const user = { id: 'u1', email: 'a@b.c', role: 'TENANT_ADMIN', tenantId: 'tenant-1' } as any;
      const preview = await h.facade.buildPreview('tenant-1', 'dev-1', makePreviewDto(), user);

      // Missing planToken
      await expect(
        h.facade.applyProvisioning('tenant-1', 'dev-1', makeApplyDto(undefined), user, { asyncExecution: false }),
      ).rejects.toThrow(BadRequestException);

      // Tampered planHash
      await expect(
        h.facade.applyProvisioning(
          'tenant-1',
          'dev-1',
          makeApplyDto({ ...preview.planToken, planHash: 'f'.repeat(64) }),
          user,
          { asyncExecution: false },
        ),
      ).rejects.toThrow(BadRequestException);

      // Tampered Ed25519 signature
      await expect(
        h.facade.applyProvisioning(
          'tenant-1',
          'dev-1',
          makeApplyDto({ ...preview.planToken!, signature: '00' + preview.planToken!.signature.slice(2) }),
          user,
          { asyncExecution: false },
        ),
      ).rejects.toThrow(BadRequestException);

      // Config drift between preview and apply (changing identity)
      await expect(
        h.facade.applyProvisioning(
          'tenant-1',
          'dev-1',
          makeApplyDto(preview.planToken, { system: { identity: 'Tampered-Node', ntpEnabled: true } }),
          user,
          { asyncExecution: false },
        ),
      ).rejects.toThrow(BadRequestException);

      // Expired planToken
      await expect(
        h.facade.applyProvisioning(
          'tenant-1',
          'dev-1',
          makeApplyDto({ ...preview.planToken, expiresAt: new Date(Date.now() - 60_000).toISOString() }),
          user,
          { asyncExecution: false },
        ),
      ).rejects.toThrow(BadRequestException);

      // Wrong tenant bound inside planToken
      await expect(
        h.facade.applyProvisioning(
          'tenant-2',
          'dev-1',
          makeApplyDto(preview.planToken),
          { ...user, tenantId: 'tenant-2' },
          { asyncExecution: false },
        ),
      ).rejects.toThrow(BadRequestException);

      // Live router state drifted after preview -> snapshotHash mismatch
      h.client.listIpAddresses.mockResolvedValueOnce([
        { id: '*ip1', address: '192.168.88.1/24', interface: 'ether5', disabled: false },
        { id: '*ip2', address: '100.64.0.2/24', interface: 'ether1', disabled: false },
        { id: '*ip3', address: '10.99.99.1/24', interface: 'ether3', disabled: false },
      ]);
      await expect(
        h.facade.applyProvisioning(
          'tenant-1',
          'dev-1',
          makeApplyDto(preview.planToken),
          user,
          { asyncExecution: false },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('C-2 & C-5 & M-2: Rollback Fidelity, Off-Router Backup Gate, SHA-256 Tamper & Cloud Recovery Fallback', () => {
    it('fails CLEAN_SETUP before any mutation when mandatory off-router cloud backup cannot be stored', async () => {
      const h = makeHarness({}, false);
      const user = { id: 'u1', email: 'a@b.c', role: 'TENANT_ADMIN', tenantId: 'tenant-1' } as any;
      const preview = await h.facade.buildPreview('tenant-1', 'dev-1', makePreviewDto(), user);

      const op = await h.facade.applyProvisioning(
        'tenant-1',
        'dev-1',
        makeApplyDto(preview.planToken),
        user,
        { asyncExecution: false },
      );

      expect(op.status).toBe('FAILED');
      expect(op.failureReason).toMatch(/النسخ الاحتياطي السحابي|OFF_ROUTER|تخزين/i);
      expect(h.executedWords.filter((w) => !w[0].endsWith('/print'))).toHaveLength(0);
    });

    it('rejects tampered backup bytes via SHA-256 check on downloadBackupById and marks READY (not VERIFIED) when cloud unconfigured', async () => {
      const h = makeHarness({}, false);
      const bundle = await h.backupSvc.createBackupBundle({
        tenantId: 'tenant-1',
        deviceId: 'dev-1',
        userId: 'u1',
        includeRscExport: false,
      });
      expect(bundle.binaryBackup?.cloudStored).toBe(false);
      const row = h.prisma.backups.get(bundle.binaryBackup!.id);
      expect(row.status).toBe('READY');

      // Now tamper bytes on a verified cloud-stored backup
      const hCloud = makeHarness({}, true);
      const cloudBundle = await hCloud.backupSvc.createBackupBundle({
        tenantId: 'tenant-1',
        deviceId: 'dev-1',
        userId: 'u1',
        includeRscExport: false,
      });
      const storedRow = hCloud.prisma.backups.get(cloudBundle.binaryBackup!.id);
      expect(storedRow.status).toBe('VERIFIED');
      hCloud.storageSvc.downloadPrivateObject.mockResolvedValueOnce(Buffer.from('CORRUPTED-BYTES'));

      await expect(
        hCloud.backupSvc.downloadBackupById('tenant-1', cloudBundle.binaryBackup!.id),
      ).rejects.toThrow(BadGatewayException);
    });

    it('downloads & verifies cloud backup into router via /tool/fetch HTTPS fallback when file is missing locally, rejects path traversal, and marks RecoveryOperation FAILED on error', async () => {
      const h = makeHarness({}, true);
      const rawBytes = Buffer.from('VERIFIED-BACKUP-PAYLOAD');
      const sha = crypto.createHash('sha256').update(rawBytes).digest('hex');

      h.prisma.backups.set('bk-cloud', {
        id: 'bk-cloud',
        tenantId: 'tenant-1',
        deviceId: 'dev-1',
        routerFileName: 'cloud-recover.backup',
        type: 'BINARY_BACKUP',
        storagePath: 'tenant-1/dev-1/cloud-recover.backup',
        checksumSha256: sha,
        boardName: 'hEX',
        deviceModel: 'RB750Gr3',
        routerOsVersion: '7.15.2 (stable)',
        encryptionUsed: true,
        status: 'VERIFIED',
      });
      h.storageSvc.downloadPrivateObject.mockResolvedValueOnce(rawBytes);

      const okRes = await h.recoverySvc.restoreBackup('tenant-1', 'dev-1', {
        backupId: 'bk-cloud',
        confirmed: true,
        acknowledgeReboot: true,
        acknowledgeDisconnect: true,
      });
      expect(okRes.success).toBe(true);
      expect(h.client.fetchFileFromUrl).toHaveBeenCalledWith(
        'https://signed.supabase.example/private/bk.backup',
        'cloud-recover.backup',
      );

      // Path traversal must fail before recovery execution
      h.prisma.backups.set('bk-evil', {
        id: 'bk-evil',
        tenantId: 'tenant-1',
        deviceId: 'dev-1',
        routerFileName: '../../etc/passwd.backup',
        type: 'BINARY_BACKUP',
        deviceModel: 'RB750Gr3',
        routerOsVersion: '7.15.2 (stable)',
        encryptionUsed: true,
      });
      await expect(
        h.recoverySvc.restoreBackup('tenant-1', 'dev-1', {
          backupId: 'bk-evil',
          confirmed: true,
          acknowledgeReboot: true,
          acknowledgeDisconnect: true,
        }),
      ).rejects.toThrow(BadRequestException);

      // Runtime failure during restore must mark newly created RecoveryOperation FAILED
      h.storageSvc.downloadPrivateObject.mockResolvedValueOnce(rawBytes);
      h.client.restoreBackup.mockRejectedValueOnce(new Error('Restore execution failed on router'));
      await expect(
        h.recoverySvc.restoreBackup('tenant-1', 'dev-1', {
          backupId: 'bk-cloud',
          confirmed: true,
          acknowledgeReboot: true,
          acknowledgeDisconnect: true,
        }),
      ).rejects.toThrow();
      const latestRec = Array.from(h.prisma.recoveries.values()).pop() as any;
      expect(latestRec.status).toBe('FAILED');
    });

    it('marks status as FAILED (never ROLLED_BACK) if rollback removal fails post-verification', async () => {
      const h = makeHarness({ keepCreatedResourceOnPrintAfterRemove: true, pingUnreachableAfterExecution: false, routeEgressInterface: 'ether3' });
      const user = { id: 'u1', email: 'a@b.c', role: 'TENANT_ADMIN', tenantId: 'tenant-1' } as any;
      const preview = await h.facade.buildPreview('tenant-1', 'dev-1', makePreviewDto(), user);

      const op = await h.facade.applyProvisioning(
        'tenant-1',
        'dev-1',
        makeApplyDto(preview.planToken),
        user,
        { asyncExecution: false },
      );

      expect(op.status).toBe('FAILED');
      expect((op.verificationResult as any)?.rollbackReport?.verified).toBe(false);
    });
  });

  describe('C-4, H-1, H-3, H-5: Secret Redaction, DB Execution Locks, Orphan Recovery, Cancellation & Timeout Idempotency', () => {
    it('redacts passwords with spaces, passphrases, Bearer tokens, and JSON secrets while preserving _planNonceId', () => {
      const maskedWords = maskExecutionWords([
        '/interface/wireless/security-profiles/set',
        '=name=wifi-sec',
        '=wpa2-pre-shared-key=My Secret Pass 2026!',
        '=password=another pass with spaces',
      ]);
      expect(maskedWords.join(' ')).not.toContain('My Secret Pass 2026!');
      expect(maskedWords.join(' ')).not.toContain('another pass with spaces');

      const maskedText = maskSecretsInText(
        'Authorization: Bearer eyJhbGciOi.payload.sig {"password":"abc 123","apiKey":"key_999"}',
      );
      expect(maskedText).not.toContain('eyJhbGciOi');
      expect(maskedText).not.toContain('abc 123');
      expect(maskedText).not.toContain('key_999');

      const sanitized = sanitizeStructuredSecrets({
        _planNonceId: 'nonce-keep-me',
        planToken: { signature: 'sig-hide-me' },
        wifiPassphrase: 'wifi-hide-me',
      }) as Record<string, any>;
      expect(sanitized._planNonceId).toBe('nonce-keep-me');
      expect(sanitized.planToken).toBe('********');
      expect(sanitized.wifiPassphrase).toBe('********');
    });

    it('quarantines orphaned active DB operations on init and enforces DB-level concurrency lock', async () => {
      const h = makeHarness();
      h.prisma.operations.set('op-stale', {
        id: 'op-stale',
        tenantId: 'tenant-1',
        deviceId: 'dev-1',
        status: 'RUNNING',
        updatedAt: new Date(Date.now() - 20 * 60 * 1000),
      });
      const recovered = await h.executor.quarantineOrphanedOperations('dev-1');
      expect(recovered).toBe(1);
      expect(h.prisma.operations.get('op-stale').status).toBe('FAILED');

      // Fresh active operation blocks concurrent start even when in-memory Set is empty
      h.prisma.operations.set('op-live', {
        id: 'op-live',
        tenantId: 'tenant-1',
        deviceId: 'dev-1',
        status: 'RUNNING',
        updatedAt: new Date(),
      });
      const user = { id: 'u1', email: 'a@b.c', role: 'TENANT_ADMIN', tenantId: 'tenant-1' } as any;
      const preview = await h.facade.buildPreview('tenant-1', 'dev-1', makePreviewDto(), user);

      await expect(
        h.facade.applyProvisioning(
          'tenant-1',
          'dev-1',
          makeApplyDto(preview.planToken),
          user,
          { asyncExecution: false },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('recovers from /add socket drop without duplicate creation via verifyIfAddAlreadyApplied, and distinguishes DEGRADED vs PARTIALLY_VERIFIED vs VERIFICATION_FAILED', async () => {
      // Case 1: socket drop during /ip/pool/add after router already created it
      const hDup = makeHarness({ disconnectOnceOnAdd: true });
      const user = { id: 'u1', email: 'a@b.c', role: 'TENANT_ADMIN', tenantId: 'tenant-1' } as any;
      const previewDup = await hDup.facade.buildPreview('tenant-1', 'dev-1', makePreviewDto(), user);
      const opDup = await hDup.facade.applyProvisioning(
        'tenant-1',
        'dev-1',
        makeApplyDto(previewDup.planToken),
        user,
        { asyncExecution: false },
      );
      expect(opDup.status).toBe('COMPLETED');
      expect(hDup.executedWords.filter((w) => w[0] === '/ip/pool/add')).toHaveLength(1);

      // Case 2: ping unreachable -> DEGRADED & device isOnline NOT forced true
      const hDeg = makeHarness({ pingUnreachableAfterExecution: true });
      const prevDeg = await hDeg.facade.buildPreview('tenant-1', 'dev-1', makePreviewDto(), user);
      const opDeg = await hDeg.facade.applyProvisioning(
        'tenant-1',
        'dev-1',
        makeApplyDto(prevDeg.planToken),
        user,
        { asyncExecution: false },
      );
      expect((opDeg.verificationResult as any).overallStatus).toBe('DEGRADED');
      expect(hDeg.prisma.deviceUpdateCalls.some((c: any) => c.data?.isOnline === true)).toBe(false);

      // Case 3: filter rules missing -> PARTIALLY_VERIFIED
      const hPart = makeHarness({ omitFilterRules: true });
      const prevPart = await hPart.facade.buildPreview('tenant-1', 'dev-1', makePreviewDto(), user);
      const opPart = await hPart.facade.applyProvisioning(
        'tenant-1',
        'dev-1',
        makeApplyDto(prevPart.planToken),
        user,
        { asyncExecution: false },
      );
      expect((opPart.verificationResult as any).overallStatus).toBe('PARTIALLY_VERIFIED');
      expect((opPart.verificationResult as any).securityPoliciesVerified).toBe(false);

      // Case 4: default route egress points to ether3 instead of WAN ether1 -> VERIFICATION_FAILED + ROLLED_BACK
      const hBadRoute = makeHarness({ routeEgressInterface: 'ether3' });
      const prevBad = await hBadRoute.facade.buildPreview('tenant-1', 'dev-1', makePreviewDto(), user);
      const opBad = await hBadRoute.facade.applyProvisioning(
        'tenant-1',
        'dev-1',
        makeApplyDto(prevBad.planToken),
        user,
        { asyncExecution: false },
      );
      expect(opBad.status).toBe('ROLLED_BACK');
    });
  });

  describe('Topology Safety Negative Tests: Bonding, PPPoE/VLAN Overlap, Disconnected Surviving Port & Incomplete Discovery', () => {
    it('blocks WAN PPPoE on same physical ether1 as management IP, and blocks bridge LAN pull leaving only disconnected physical port', async () => {
      const h = makeHarness({
        extraIpAddresses: [
          { id: '*ipm', address: '192.168.88.1/24', interface: 'bridge-mgmt', disabled: false },
        ],
        bridges: [{ id: '*b1', name: 'bridge-mgmt', disabled: false }],
        bridgePorts: [
          { id: '*bp1', bridge: 'bridge-mgmt', interface: 'ether2', disabled: false },
          { id: '*bp2', bridge: 'bridge-mgmt', interface: 'ether3', disabled: false },
        ],
        interfaces: [
          { id: '*1', name: 'ether1', type: 'ether', disabled: false, running: true },
          { id: '*2', name: 'ether2', type: 'ether', disabled: false, running: true },
          { id: '*3', name: 'ether3', type: 'ether', disabled: false, running: false }, // unpulled sibling is DOWN!
        ],
        pppoeClients: [{ id: '*pp1', name: 'pppoe-out1', interface: 'ether1', disabled: false }],
      });
      const snap = await h.discoverySvc.discover('tenant-1', 'dev-1');

      // Trying to pull running ether2 leaves only link-down ether3 on bridge-mgmt -> must fail-closed!
      const dto = makePreviewDto({
        wan: { interface: 'ether1', mode: 'PPPOE', enableNat: true },
        lan: { bridgeName: 'bridge-hotspot', memberInterfaces: ['ether2'], gatewayIp: '172.16.50.1/24' },
      });
      const safety = h.validator.verifyManagementSafety(snap, dto);
      expect(safety.isSevered).toBe(true);

      // PPPoE over ether1 while management IP sits on ether1 -> plan blocks via overlap
      const hPpp = makeHarness({
        extraIpAddresses: [{ id: '*ipm', address: '192.168.88.1/24', interface: 'ether1', disabled: false }],
        pppoeClients: [{ id: '*pp1', name: 'pppoe-out1', interface: 'ether1', disabled: false }],
      });
      const snapPpp = await hPpp.discoverySvc.discover('tenant-1', 'dev-1');
      const safetyPpp = hPpp.validator.verifyManagementSafety(
        snapPpp,
        makePreviewDto({ wan: { interface: 'pppoe-out1', mode: 'PPPOE', enableNat: true } }),
      );
      expect(safetyPpp.isSevered).toBe(true);
    });

    it('rejects malformed non-string bonding slaves Object in ProvisioningValidatorService', async () => {
      const h = makeHarness({
        bondingInterfaces: [{ id: '*bo1', name: 'bond1', slaves: { bad: true } as any, mode: '802.3ad', disabled: false }],
        extraIpAddresses: [{ id: '*ip1', address: '192.168.88.1/24', interface: 'bond1', disabled: false }],
      });
      const snap = await h.discoverySvc.discover('tenant-1', 'dev-1');
      const safety = h.validator.verifyManagementSafety(snap, makePreviewDto());
      expect(safety.isSevered).toBe(true);
    });

    it('throws DISCOVERY_INCOMPLETE fail-closed when a core discovery table fails', async () => {
      const h = makeHarness();
      h.client.listBridgePorts.mockRejectedValueOnce(new Error('timeout fetching bridge ports'));
      await expect(h.discoverySvc.discover('tenant-1', 'dev-1')).rejects.toThrow(BadGatewayException);
    });
  });
});
