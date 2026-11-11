import { RouterCapabilityService } from './services/router-capability.service';
import { RouterCompatibilityService } from './services/router-compatibility.service';
import { ConfigurationPlannerService } from './services/configuration-planner.service';
import { ProvisioningValidatorService } from './services/provisioning-validator.service';
import { PlanSigningService } from '../../core/security/signing.service';
import type { AutoProvisionConfigDto } from './dto/auto-provisioning.dto';
import type { FullRouterDiscoveryReport } from './interfaces/auto-provisioning.interface';

function makeDiscoveryReport(overrides: {
  version: string;
  boardName: string;
  model: string;
  architecture?: string;
  packages: Array<{ name: string; disabled?: boolean }>;
  etherCount: number;
  sfpCount?: number;
  wirelessNames?: string[];
  wifiNames?: string[];
  hostIp?: string;
  existingBridge?: boolean;
  existingHotspot?: boolean;
  customFirewallCount?: number;
}): FullRouterDiscoveryReport {
  const capService = new RouterCapabilityService();
  const interfaces: any[] = [];
  for (let i = 1; i <= overrides.etherCount; i++) {
    interfaces.push({
      id: `*${i}`,
      name: `ether${i}`,
      type: 'ether',
      disabled: false,
      running: i <= 2,
    });
  }
  for (let i = 1; i <= (overrides.sfpCount || 0); i++) {
    interfaces.push({
      id: `*s${i}`,
      name: `sfp-sfpplus${i}`,
      type: 'ether',
      disabled: false,
      running: false,
    });
  }
  const wirelessInterfaces = (overrides.wirelessNames || []).map((name, idx) => {
    interfaces.push({ id: `*w${idx}`, name, type: 'wlan', disabled: false, running: false });
    return { id: `*w${idx}`, name, defaultName: name, ssid: 'MikroTik', disabled: false };
  });
  const wifiInterfaces = (overrides.wifiNames || []).map((name, idx) => {
    interfaces.push({ id: `*wf${idx}`, name, type: 'wifi', disabled: false, running: false });
    return { id: `*wf${idx}`, name, defaultName: name, ssid: 'MikroTik-WiFi', disabled: false };
  });

  const mgmtIp = overrides.hostIp || '192.168.88.1';
  const bridges: any[] = overrides.existingBridge
    ? [{ id: '*b1', name: 'bridge-hotspot', macAddress: 'AA:BB:CC:DD:EE:01' }]
    : [];
  const bridgePorts: any[] = overrides.existingBridge
    ? [{ id: '*bp1', bridge: 'bridge-hotspot', interface: 'ether2', disabled: false }]
    : [];
  const hotspotServers: any[] = overrides.existingHotspot
    ? [{ id: '*hs1', name: 'hs-sudafi', interface: 'bridge-hotspot', profile: 'hsprof1', disabled: false }]
    : [];
  const filterRules = Array.from({ length: overrides.customFirewallCount || 0 }, (_, idx) => ({
    id: `*fr${idx}`,
    chain: 'forward',
    action: 'accept',
    comment: 'Existing customer rule',
  }));

  const resource = {
    uptime: '1d2h',
    version: overrides.version,
    cpuLoad: 5,
    freeMemory: 128 * 1024 * 1024,
    totalMemory: 256 * 1024 * 1024,
    freeHdd: 16 * 1024 * 1024,
    totalHdd: 32 * 1024 * 1024,
    boardName: overrides.boardName,
    model: overrides.model,
    architectureName: overrides.architecture || 'arm',
    platform: 'MikroTik',
  };

  const capabilities = capService.detectCapabilities({
    resource,
    routerboard: { model: overrides.model, serialNumber: 'SN12345' },
    packages: overrides.packages.map((p) => ({ name: p.name, disabled: Boolean(p.disabled) })),
    interfaces,
    wirelessInterfaces,
    wifiInterfaces,
    queueTypes: [{ id: '*q1', name: 'default-small', kind: 'pfifo' }],
    connectionProtocol: 'API',
  });

  return {
    device: {
      deviceId: 'dev-matrix-1',
      deviceName: 'Lab Router',
      host: mgmtIp,
      boardName: overrides.boardName,
      model: overrides.model,
      version: overrides.version,
      majorVersion: capabilities.majorVersion,
      minorVersion: capabilities.minorVersion,
      osFamily: capabilities.osFamily,
      architecture: capabilities.architecture,
      platform: 'MikroTik',
      identity: 'MikroTik',
      uptime: '1d2h',
      cpuLoad: 5,
      freeMemoryBytes: 128 * 1024 * 1024,
      totalMemoryBytes: 256 * 1024 * 1024,
      freeHddBytes: 16 * 1024 * 1024,
      totalHddBytes: 32 * 1024 * 1024,
    },
    capabilities,
    interfacesAssessment: [],
    resource,
    routerboard: { model: overrides.model, serialNumber: 'SN12345' },
    packages: overrides.packages.map((p) => ({ name: p.name, disabled: Boolean(p.disabled) })),
    interfaces,
    bridges,
    bridgePorts,
    vlans: [],
    wirelessInterfaces,
    wifiInterfaces,
    ipAddresses: [{ id: '*ip-mgmt', address: `${mgmtIp}/24`, interface: 'ether5', disabled: false }],
    pools: [],
    dhcpClients: [{ id: '*dc1', interface: 'ether1', disabled: false, status: 'bound' }],
    dhcpServers: [],
    dhcpNetworks: [],
    dnsConfig: { servers: ['8.8.8.8'], allowRemoteRequests: true },
    natRules: [],
    mangleRules: [],
    filterRules,
    routes: [{ id: '*rt1', dstAddress: '0.0.0.0/0', gateway: '100.64.0.1', active: true, disabled: false }],
    hotspotServers,
    hotspotServerProfiles: [],
    hotspotUserProfiles: [],
    queueTypes: [{ id: '*q1', name: 'default-small', kind: 'pfifo' }],
    schedulers: [],
    existingBackups: [],
    wanRoleAmbiguous: false,
    suggestedWanInterface: 'ether1',
    suggestedLanInterfaces: ['ether2', 'ether3'],
    managementInterface: 'ether5',
    discoveredAt: new Date().toISOString(),
    snapshotHash: 'mock-snapshot-hash-1234',
  };
}

function makeBaseDto(overrides: Partial<AutoProvisionConfigDto> = {}): AutoProvisionConfigDto {
  return {
    template: 'CLEAN_SETUP',
    wan: { interface: 'ether1', mode: 'DHCP', enableNat: true },
    lan: {
      bridgeName: 'bridge-hotspot',
      memberInterfaces: ['ether2', 'ether3'],
      gatewayIp: '172.16.10.1/24',
      poolRange: '172.16.10.10-172.16.10.250',
      dhcpLeaseTime: '1h',
      dnsServers: ['172.16.10.1', '8.8.8.8'],
      autoMac: true,
    },
    dns: { servers: ['8.8.8.8', '1.1.1.1'], allowRemoteRequests: true },
    wireless: {
      enabled: true,
      ssid: 'SudaFi-Cafe',
      password: 'StrongPassword123',
      country: 'Sudan',
      disableWps: true,
    },
    hotspot: {
      serverName: 'hs-cafe',
      serverProfileName: 'hsprof-cafe',
      userProfileName: 'uprof-cafe',
      dnsName: 'login.cafe.sd',
      loginBy: 'http-chap,cookie,mac-cookie',
      cookieLifetime: '3d',
      defaultRateLimit: '4M/8M',
      sharedUsers: 1,
      enableLocalUsageScript: false,
    },
    queues: { enabled: true, applySfqToDefaults: false, customQueueName: 'sfq-cafe' },
    system: { identity: 'SudaFi-Cafe-Router', timezone: 'UTC', ntpEnabled: true, ntpServers: ['time.cloudflare.com'] },
    scheduler: { enableAutoBackupSchedule: true, autoBackupInterval: '12h', enableNetwatch: true },
    securityPolicies: {
      antiTethering: true,
      clientIsolation: true,
      protectManagementAccess: true,
      protectWanAccess: false,
      forceRouterDns: true,
      enforceSingleDevice: true,
      blockUnauthenticatedBypass: true,
    },
    ...overrides,
  };
}

describe('RouterCapabilityService & Compatibility Matrix (ROS6 / ROS7)', () => {
  let capService: RouterCapabilityService;
  let compatService: RouterCompatibilityService;
  let planner: ConfigurationPlannerService;

  beforeEach(() => {
    capService = new RouterCapabilityService();
    compatService = new RouterCompatibilityService();
    planner = new ConfigurationPlannerService(
      compatService,
      new ProvisioningValidatorService(),
      new PlanSigningService(),
    );
  });

  it('Matrix Case 1: RouterOS 6 + Ethernet + Legacy Wireless (hAP lite / RB951) uses SNTP primary-ntp & /interface/wireless', () => {
    const discovery = makeDiscoveryReport({
      version: '6.49.13 (long-term)',
      boardName: 'RB951Ui-2HnD',
      model: 'RB951Ui-2HnD',
      packages: [{ name: 'system' }, { name: 'hotspot' }, { name: 'wireless' }],
      etherCount: 5,
      wirelessNames: ['wlan1'],
    });

    expect(discovery.capabilities.osFamily).toBe('ROS6');
    expect(discovery.capabilities.wirelessStack).toBe('LEGACY_WIRELESS');
    expect(discovery.capabilities.ntpStack).toBe('SNTP_V6');
    expect(compatService.resolveAdapter(discovery.capabilities).family).toBe('ROS6');

    const plan = planner.buildPlan(makeBaseDto(), discovery, 'tenant-a');
    expect(plan.canProceed).toBe(true);
    const cmds = plan.stages.flatMap((s) => s.commands.map((c) => c.executionWords.join(' ')));
    expect(cmds.some((c) => c.includes('/interface/wireless/set'))).toBe(true);
    // SNTP v6 puts hostname servers into server-dns-names and IPv4 servers into primary-ntp
    expect(
      cmds.some((c) => c.includes('/system/ntp/client/set') && c.includes('=server-dns-names=time.cloudflare.com')),
    ).toBe(true);
    const ipv4NtpPlan = planner.buildPlan(
      makeBaseDto({ system: { identity: 'SudaFi-ROS6', ntpEnabled: true, ntpServers: ['216.239.35.0'] } }),
      discovery,
      'tenant-a',
    );
    const ipv4Cmds = ipv4NtpPlan.stages.flatMap((s) => s.commands.map((c) => c.executionWords.join(' ')));
    expect(ipv4Cmds.some((c) => c.includes('/system/ntp/client/set') && c.includes('=primary-ntp=216.239.35.0'))).toBe(true);
    expect(cmds.some((c) => c.includes('/interface/wifi'))).toBe(false);
    // Scheduled export on ROS6 must not use show-sensitive=no (not supported) and must never force dont-encrypt=yes
    expect(cmds.some((c) => c.includes('dont-encrypt=yes'))).toBe(false);
  });

  it('Matrix Case 2: RouterOS 7.15 + wifi-qcom uses /interface/wifi and /system/ntp/client/servers/add', () => {
    const discovery = makeDiscoveryReport({
      version: '7.15.2 (stable)',
      boardName: 'C52iG-5HaxD2HaxD',
      model: 'hAP ax2',
      packages: [{ name: 'routeros' }, { name: 'wifi-qcom' }],
      etherCount: 5,
      wifiNames: ['wifi1', 'wifi2'],
    });

    expect(discovery.capabilities.osFamily).toBe('ROS7');
    expect(discovery.capabilities.wirelessStack).toBe('WIFI_QCOM');
    expect(discovery.capabilities.ntpStack).toBe('NTP_V7');

    const plan = planner.buildPlan(makeBaseDto(), discovery, 'tenant-a');
    const cmds = plan.stages.flatMap((s) => s.commands.map((c) => c.executionWords.join(' ')));
    expect(cmds.some((c) => c.includes('/interface/wifi/set') && c.includes('=configuration.ssid=SudaFi-Cafe'))).toBe(true);
    expect(cmds.some((c) => c.includes('/system/ntp/client/servers/add'))).toBe(true);
    expect(cmds.some((c) => c.includes('/interface/wireless/'))).toBe(false);
  });

  it('Matrix Case 3: RouterOS 7.8 + wifiwave2 routes wireless stage strictly to /interface/wifiwave2', () => {
    const discovery = makeDiscoveryReport({
      version: '7.8 (stable)',
      boardName: 'RBD53iG-5HacD2HnD',
      model: 'hAP ac3',
      packages: [{ name: 'routeros' }, { name: 'wifiwave2' }],
      etherCount: 5,
      wifiNames: ['wifi1'],
    });

    expect(discovery.capabilities.wirelessStack).toBe('WIFIWAVE2');
    const plan = planner.buildPlan(makeBaseDto(), discovery, 'tenant-a');
    const cmds = plan.stages.flatMap((s) => s.commands.map((c) => c.executionWords.join(' ')));
    expect(cmds.some((c) => c.includes('/interface/wifiwave2/set'))).toBe(true);
  });

  it('Matrix Case 4: Wired-only Router (RB750Gr3 / hEX / CCR without wireless/wifi) cleanly skips WIRELESS_WIFI stage', () => {
    const discovery = makeDiscoveryReport({
      version: '7.14.1 (stable)',
      boardName: 'RB750Gr3',
      model: 'hEX',
      architecture: 'mmips',
      packages: [{ name: 'routeros' }],
      etherCount: 5,
    });

    expect(discovery.capabilities.wirelessStack).toBe('NONE');
    expect(discovery.capabilities.supportsWifi).toBe(false);
    expect(discovery.capabilities.supportsWireless).toBe(false);

    const plan = planner.buildPlan(makeBaseDto(), discovery, 'tenant-a');
    expect(plan.canProceed).toBe(true);
    const wifiStage = plan.stages.find((s) => s.stage === 'WIRELESS_WIFI');
    expect(wifiStage?.status).toBe('SKIPPED_UNSUPPORTED');
    expect(wifiStage?.commands).toHaveLength(0);
    const cmds = plan.stages.flatMap((s) => s.commands.map((c) => c.executionWords.join(' ')));
    expect(cmds.some((c) => c.includes('wireless') || c.includes('/interface/wifi'))).toBe(false);
  });

  it('Matrix Case 5 & 6: Varying port counts (10+SFP L009 & 16-port switch) work dynamically without hardcoding ether16', () => {
    const disc5Port = makeDiscoveryReport({
      version: '7.13 (stable)',
      boardName: 'hEX',
      model: 'RB750Gr3',
      packages: [{ name: 'routeros' }],
      etherCount: 5,
    });
    expect(disc5Port.capabilities.totalPhysicalPorts).toBe(5);
    const invalid16Dto = makeBaseDto({
      lan: {
        bridgeName: 'bridge-hotspot',
        memberInterfaces: ['ether2', 'ether16'],
        gatewayIp: '172.16.10.1/24',
      },
    });
    const blockedPlan = planner.buildPlan(invalid16Dto, disc5Port, 'tenant-a');
    expect(blockedPlan.canProceed).toBe(false);
    expect(blockedPlan.blockedReasons.some((r) => r.includes('ether16'))).toBe(true);

    const disc16Port = makeDiscoveryReport({
      version: '7.15 (stable)',
      boardName: 'CRS317',
      model: 'CCR2004-16G-2S+',
      packages: [{ name: 'routeros' }],
      etherCount: 16,
      sfpCount: 2,
    });
    expect(disc16Port.capabilities.totalPhysicalPorts).toBe(18);
    const valid16Dto = makeBaseDto({
      lan: {
        bridgeName: 'bridge-hotspot',
        memberInterfaces: ['ether2', 'ether16'],
        gatewayIp: '172.16.10.1/24',
      },
    });
    const okPlan = planner.buildPlan(valid16Dto, disc16Port, 'tenant-a');
    expect(okPlan.canProceed).toBe(true);
  });

  it('Matrix Case 7: Existing bridge, existing hotspot, and custom firewall avoid blind wipe under HOTSPOT_ON_EXISTING', () => {
    const discovery = makeDiscoveryReport({
      version: '7.15.2 (stable)',
      boardName: 'L009UiGS',
      model: 'L009UiGS-RM',
      packages: [{ name: 'routeros' }],
      etherCount: 8,
      sfpCount: 1,
      existingBridge: true,
      existingHotspot: true,
      customFirewallCount: 3,
    });

    const plan = planner.buildPlan(
      makeBaseDto({
        template: 'HOTSPOT_ON_EXISTING',
        hotspot: {
          serverName: 'hs-sudafi',
          dnsName: 'login.sudafi.sd',
          defaultRateLimit: '4M/8M',
        },
      }),
      discovery,
      'tenant-a',
    );
    expect(plan.canProceed).toBe(true);
    const allCmds = plan.stages.flatMap((s) => s.commands.map((c) => c.executionWords.join(' ')));
    expect(allCmds.some((c) => c.includes('[find'))).toBe(false);
    // Existing bridge-hotspot and hs-sudafi must NOT be recreated; only missing ether3 port is added
    expect(allCmds.some((c) => c.startsWith('/interface/bridge/add') && c.includes('=name=bridge-hotspot'))).toBe(false);
    expect(allCmds.some((c) => c.startsWith('/interface/bridge/port/add') && c.includes('=interface=ether3'))).toBe(true);
    expect(allCmds.some((c) => c.startsWith('/ip/hotspot/add') && c.includes('=name=hs-sudafi'))).toBe(false);
  });

  it('2-cookie-enabled.rsc Regression Audit: Eliminates all hardcoded/unsafe patterns in generated plans', () => {
    const discovery = makeDiscoveryReport({
      version: '6.49.13',
      boardName: 'RB750Gr3',
      model: 'RB750Gr3',
      packages: [{ name: 'system' }, { name: 'hotspot' }],
      etherCount: 5,
    });

    const plan = planner.buildPlan(makeBaseDto(), discovery, 'tenant-a');
    const serialized = JSON.stringify(plan);

    // Must not hardcode reference script subnet 10.0.0.1/22, static MAC E4:8D:8C, Japan regulatory domain, or Africa/Khartoum unless configured
    expect(serialized).not.toContain('10.0.0.1/22');
    expect(serialized).not.toContain('E4:8D:8C');
    expect(serialized).not.toContain('Japan');
    expect(serialized).not.toContain('Africa/Khartoum');
    expect(serialized).not.toContain('dont-encrypt=yes');
    expect(serialized).not.toContain('!mac-cookie-timeout');
    expect(serialized).not.toContain('remove [find');
  });

  it('Version parser handles ROS6, ROS7, and malformed UNKNOWN safely', () => {
    expect(capService.parseRouterOsVersion('6.49.10')).toEqual({ osFamily: 'ROS6', majorVersion: 6, minorVersion: 49 });
    expect(capService.parseRouterOsVersion('7.16beta1')).toEqual({ osFamily: 'ROS7', majorVersion: 7, minorVersion: 16 });
    expect(capService.parseRouterOsVersion('weird-string')).toEqual({ osFamily: 'UNKNOWN', majorVersion: 0, minorVersion: 0 });
  });
});
