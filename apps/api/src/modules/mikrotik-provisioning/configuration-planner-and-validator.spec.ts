import { BadRequestException } from '@nestjs/common';
import { PlanSigningService } from '../../core/security/signing.service';
import { ConfigurationPlannerService } from './services/configuration-planner.service';
import { ProvisioningValidatorService } from './services/provisioning-validator.service';
import { RouterCapabilityService } from './services/router-capability.service';
import { RouterCompatibilityService } from './services/router-compatibility.service';
import { MikrotikProvisioningService } from './mikrotik-provisioning.service';
import type { AutoProvisionConfigDto, StartAutoProvisioningDto } from './dto/auto-provisioning.dto';
import type { FullRouterDiscoveryReport } from './interfaces/auto-provisioning.interface';

function buildDiscoveryFixture(overrides?: Partial<FullRouterDiscoveryReport>): FullRouterDiscoveryReport {
  const capService = new RouterCapabilityService();
  const baseInterfaces = [
    { id: '*1', name: 'ether1', type: 'ether', disabled: false, running: true },
    { id: '*2', name: 'ether2', type: 'ether', disabled: false, running: true },
    { id: '*3', name: 'ether3', type: 'ether', disabled: false, running: false },
    { id: '*4', name: 'ether4', type: 'ether', disabled: false, running: true },
    { id: '*5', name: 'wifi1', type: 'wifi', disabled: false, running: false },
  ];
  const resource = {
    uptime: '3h',
    version: '7.15.2 (stable)',
    cpuLoad: 3,
    freeMemory: 200 * 1024 * 1024,
    totalMemory: 512 * 1024 * 1024,
    freeHdd: 64 * 1024 * 1024,
    totalHdd: 128 * 1024 * 1024,
    boardName: 'hAP ax2',
    model: 'hAP ax2',
    architectureName: 'arm64',
    platform: 'MikroTik',
  };
  const capabilities = capService.detectCapabilities({
    resource,
    packages: [{ name: 'routeros', disabled: false }, { name: 'wifi-qcom', disabled: false }],
    interfaces: baseInterfaces,
    wirelessInterfaces: [],
    wifiInterfaces: [{ id: '*5', name: 'wifi1', defaultName: 'wifi1', ssid: 'SudaFi', disabled: false }],
    queueTypes: [{ id: '*q1', name: 'default-small', kind: 'pfifo' }],
  });

  return {
    device: {
      deviceId: 'dev-1',
      deviceName: 'Core Router',
      host: '192.168.50.1',
      boardName: 'hAP ax2',
      model: 'hAP ax2',
      version: '7.15.2',
      majorVersion: 7,
      minorVersion: 15,
      osFamily: 'ROS7',
      architecture: 'arm64',
      platform: 'MikroTik',
      identity: 'Core',
      uptime: '3h',
      cpuLoad: 3,
      freeMemoryBytes: 200 * 1024 * 1024,
      totalMemoryBytes: 512 * 1024 * 1024,
      freeHddBytes: 64 * 1024 * 1024,
      totalHddBytes: 128 * 1024 * 1024,
    },
    capabilities,
    interfacesAssessment: [],
    resource,
    routerboard: { model: 'hAP ax2', serialNumber: 'SN777' },
    packages: [{ name: 'routeros', disabled: false }, { name: 'wifi-qcom', disabled: false }],
    interfaces: baseInterfaces,
    bridges: [],
    bridgePorts: [],
    vlans: [],
    wirelessInterfaces: [],
    wifiInterfaces: [{ id: '*5', name: 'wifi1', defaultName: 'wifi1', ssid: 'SudaFi', disabled: false }],
    ipAddresses: [{ id: '*ip-mgmt', address: '192.168.50.1/24', interface: 'ether4', disabled: false }],
    pools: [],
    dhcpClients: [{ id: '*dc1', interface: 'ether1', disabled: false, status: 'bound' }],
    dhcpServers: [],
    dhcpNetworks: [],
    dnsConfig: { servers: ['1.1.1.1'], allowRemoteRequests: true },
    natRules: [],
    mangleRules: [],
    filterRules: [],
    routes: [{ id: '*rt1', dstAddress: '0.0.0.0/0', gateway: '10.99.0.1', active: true, disabled: false }],
    hotspotServers: [],
    hotspotServerProfiles: [],
    hotspotUserProfiles: [],
    queueTypes: [{ id: '*q1', name: 'default-small', kind: 'pfifo' }],
    schedulers: [],
    existingBackups: [],
    wanRoleAmbiguous: false,
    suggestedWanInterface: 'ether1',
    suggestedLanInterfaces: ['ether2', 'ether3'],
    managementInterface: 'ether4',
    discoveredAt: new Date().toISOString(),
    snapshotHash: 'hash-dev-1',
    ...overrides,
  };
}

function makeConfigDto(overrides: Partial<AutoProvisionConfigDto> = {}): AutoProvisionConfigDto {
  return {
    template: 'CLEAN_SETUP',
    wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
    lan: {
      bridgeName: 'bridge-hotspot',
      memberInterfaces: ['ether2', 'ether3'],
      gatewayIp: '10.10.20.1/24',
    },
    wireless: { enabled: true, ssid: 'SudaFi-Hot', password: 'Password123', country: 'Sudan' },
    hotspot: { serverName: 'hs-main', dnsName: 'login.sudafi.sd', defaultRateLimit: '5M/10M' },
    queues: { enabled: true },
    system: { identity: 'SudaFi-Main', ntpEnabled: true },
    scheduler: { enableAutoBackupSchedule: true, autoBackupInterval: '12h' },
    securityPolicies: {
      antiTethering: true,
      clientIsolation: true,
      protectManagementAccess: true,
      protectWanAccess: true,
      forceRouterDns: true,
      enforceSingleDevice: true,
      blockUnauthenticatedBypass: true,
    },
    ...overrides,
  };
}

describe('ConfigurationPlannerService & ProvisioningValidatorService', () => {
  let validator: ProvisioningValidatorService;
  let signingService: PlanSigningService;
  let planner: ConfigurationPlannerService;

  beforeEach(() => {
    validator = new ProvisioningValidatorService();
    signingService = new PlanSigningService();
    planner = new ConfigurationPlannerService(
      new RouterCompatibilityService(),
      validator,
      signingService,
    );
  });

  it('builds all 12 parameterized stages with dependencies and valid Ed25519 signature', () => {
    const discovery = buildDiscoveryFixture();
    const plan = planner.buildPlan(makeConfigDto(), discovery, 'tenant-x');

    expect(plan.canProceed).toBe(true);
    expect(plan.stages).toHaveLength(12);
    expect(plan.stages.map((s) => s.stage)).toEqual([
      'WAN',
      'LAN_BRIDGE',
      'IP_ADDRESSING',
      'DHCP',
      'DNS',
      'FIREWALL',
      'NAT',
      'WIRELESS_WIFI',
      'HOTSPOT',
      'USER_PROFILES',
      'QUEUES',
      'SCHEDULER_MONITORING',
    ]);

    const hsStage = plan.stages.find((s) => s.stage === 'HOTSPOT');
    expect(hsStage?.dependsOn).toEqual(['DHCP', 'DNS', 'NAT']);
    expect(hsStage?.expectedResult.length).toBeGreaterThan(5);
    expect(hsStage?.validationRule.length).toBeGreaterThan(5);
    expect(hsStage?.rollbackAction.length).toBeGreaterThan(5);

    const token = plan.planToken as Record<string, string>;
    expect(signingService.verifyPlan(token.canonicalPayload, token.signature, token.publicKey)).toBe(true);
    expect(token.canonicalPayload.startsWith('SUDAFI-PLAN-V1:tenant-x:dev-1:')).toBe(true);
  });

  it('rejects command injection tokens, malformed CIDRs, and WAN-in-LAN conflicts', () => {
    const discovery = buildDiscoveryFixture();
    const badDto = makeConfigDto({
      wan: { interface: 'ether1; /system reboot', mode: 'STATIC', staticIp: 'bad-cidr', staticGateway: '10.0.0.1/24' },
      lan: { bridgeName: 'bridge-hs', memberInterfaces: ['ether1'], gatewayIp: '999.999.1.1' },
      system: { identity: 'bad`$(whoami)`' },
    });

    const check = validator.validateAndSanitizeConfig(badDto, discovery);
    expect(check.errors.length).toBeGreaterThanOrEqual(4);
    const plan = planner.buildPlan(badDto, discovery, 'tenant-x');
    expect(plan.canProceed).toBe(false);
  });

  it('Management Safety Fail-Closed: blocks direct management port inside LAN memberInterfaces', () => {
    const discovery = buildDiscoveryFixture(); // management IP 192.168.50.1 on ether4
    const plan = planner.buildPlan(
      makeConfigDto({
        lan: { bridgeName: 'bridge-hs', memberInterfaces: ['ether2', 'ether4'], gatewayIp: '10.10.20.1/24' },
      }),
      discovery,
      'tenant-x',
    );

    expect(plan.managementSafety.isSevered).toBe(true);
    expect(plan.canProceed).toBe(false);
    expect(plan.blockedReasons.some((r) => r.includes('ether4'))).toBe(true);
  });

  it('Management Safety Fail-Closed: blocks depletion of Management Bridge & Management VLAN-over-Bridge', () => {
    const discVlanBridge = buildDiscoveryFixture({
      interfaces: [
        { id: '*1', name: 'ether1', type: 'ether', disabled: false, running: true },
        { id: '*2', name: 'ether2', type: 'ether', disabled: false, running: true },
        { id: '*b', name: 'bridge-mgmt', type: 'bridge', disabled: false, running: true },
        { id: '*v', name: 'vlan-mgmt', type: 'vlan', disabled: false, running: true },
      ],
      bridges: [{ id: '*b', name: 'bridge-mgmt' }],
      bridgePorts: [{ id: '*bp2', bridge: 'bridge-mgmt', interface: 'ether2', disabled: false }],
      vlans: [{ id: '*v', name: 'vlan-mgmt', interface: 'bridge-mgmt', vlanId: 100 }],
      ipAddresses: [{ id: '*ipm', address: '192.168.50.1/24', interface: 'vlan-mgmt', disabled: false }],
    });

    const safety = validator.verifyManagementSafety(
      discVlanBridge,
      makeConfigDto({ lan: { bridgeName: 'bridge-hs', memberInterfaces: ['ether2'], gatewayIp: '10.10.20.1/24' } }),
    );
    expect(safety.isDetermined).toBe(true);
    expect(safety.isSevered).toBe(true);
    expect(safety.mgmtPhysicalPorts).toEqual(['ether2']);
  });

  it('Management Safety Fail-Closed: blocks indeterminate path (missing mgmt IP or cyclic/unknown bridge member)', () => {
    const missingIpDisc = buildDiscoveryFixture({ ipAddresses: [] });
    const s1 = validator.verifyManagementSafety(missingIpDisc, makeConfigDto());
    expect(s1.isDetermined).toBe(false);
    expect(s1.isSevered).toBe(true);

    const unknownMemberDisc = buildDiscoveryFixture({
      interfaces: [
        { id: '*1', name: 'ether1', type: 'ether', disabled: false, running: true },
        { id: '*2', name: 'ether2', type: 'ether', disabled: false, running: true },
        { id: '*b', name: 'bridge-mgmt', type: 'bridge', disabled: false, running: true },
      ],
      bridges: [{ id: '*b', name: 'bridge-mgmt' }],
      bridgePorts: [
        { id: '*bp2', bridge: 'bridge-mgmt', interface: 'ether2', disabled: false },
        { id: '*bp3', bridge: 'bridge-mgmt', interface: 'ghost-iface', disabled: false },
      ],
      ipAddresses: [{ id: '*ipm', address: '192.168.50.1/24', interface: 'bridge-mgmt', disabled: false }],
    });
    const s2 = validator.verifyManagementSafety(unknownMemberDisc, makeConfigDto());
    expect(s2.isSevered).toBe(true);
    expect(s2.blockedReasons.some((r) => r.includes('تتبع مسار الإدارة'))).toBe(true);
  });

  it('requires explicit WAN confirmation when WAN role is ambiguous', () => {
    const ambiguousDisc = buildDiscoveryFixture({
      wanRoleAmbiguous: true,
      suggestedWanInterface: undefined,
    });
    const plan = planner.buildPlan(makeConfigDto({ confirmWanChange: false }), ambiguousDisc, 'tenant-x');
    expect(plan.wanConfirmationRequired).toBe(true);
    expect(plan.wanConfirmationReasons.length).toBeGreaterThan(0);

    const confirmedPlan = planner.buildPlan(makeConfigDto({ confirmWanChange: true }), ambiguousDisc, 'tenant-x');
    expect(confirmedPlan.wanConfirmationRequired).toBe(false);
  });

  it('rejects tampered or cross-tenant Ed25519 planToken inside applyProvisioning', async () => {
    const discovery = buildDiscoveryFixture();
    const plan = planner.buildPlan(makeConfigDto(), discovery, 'tenant-a');

    const mockPrisma = {
      mikroTikDevice: { findFirst: jest.fn().mockResolvedValue({ id: 'dev-1', tenantId: 'tenant-a' }) },
    } as any;
    const mockDevicesService = { assertUserDeviceAccess: jest.fn().mockResolvedValue({ id: 'dev-1' }) } as any;
    const mockDiscoverySvc = { discover: jest.fn().mockResolvedValue(discovery) } as any;
    const mockExecutor = { startPlanExecution: jest.fn() } as any;

    const svc = new MikrotikProvisioningService(
      mockPrisma,
      mockDevicesService,
      mockDiscoverySvc,
      new RouterCompatibilityService(),
      planner,
      {} as any,
      {} as any,
      {} as any,
      mockExecutor,
      signingService,
      { log: jest.fn() } as any,
    );

    const dtoWithTamperedToken: StartAutoProvisioningDto = {
      ...makeConfigDto(),
      confirmPlan: true,
      planToken: {
        ...(plan.planToken as Record<string, unknown>),
        signature: '00'.repeat(64),
      },
    };

    await expect(
      svc.applyProvisioning('tenant-a', 'dev-1', dtoWithTamperedToken, undefined, { asyncExecution: false }),
    ).rejects.toThrow(BadRequestException);
    expect(mockExecutor.startPlanExecution).not.toHaveBeenCalled();

    // Also reject planToken issued for another tenant
    const foreignTokenDto: StartAutoProvisioningDto = {
      ...makeConfigDto(),
      confirmPlan: true,
      planToken: plan.planToken as Record<string, unknown>,
    };
    await expect(
      svc.applyProvisioning('tenant-b', 'dev-1', foreignTokenDto, undefined, { asyncExecution: false }),
    ).rejects.toThrow(BadRequestException);
    expect(mockExecutor.startPlanExecution).not.toHaveBeenCalled();
  });
});
