import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import type {
  IMikrotikClient,
  RouterBridgePortItem,
  RouterDhcpClientItem,
  RouterInterfaceItem,
  RouterIpAddressItem,
  RouterRouteItem,
  RouterHotspotServerItem,
} from '../../../core/mikrotik/interfaces/mikrotik-client.interface';
import { computeAuthoritativeSnapshotHash } from '../../../core/security/snapshot-integrity.util';
import { resolveActiveDefaultRoutesEgress } from '../utils/topology-helpers.util';
import type {
  DiscoveredDeviceMetadata,
  FullRouterDiscoveryReport,
  InferredInterfaceRole,
  InterfaceRoleAssessment,
} from '../interfaces/auto-provisioning.interface';
import { RouterCapabilityService } from './router-capability.service';

@Injectable()
export class RouterDiscoveryEngineService {
  private readonly logger = new Logger(RouterDiscoveryEngineService.name);
  private readonly cache = new Map<
    string,
    { report: FullRouterDiscoveryReport; cachedAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: MikrotikClientFactory,
    private readonly capabilityService: RouterCapabilityService,
  ) {}

  clearCache(tenantId: string, deviceId: string): void {
    this.cache.delete(`${tenantId}:${deviceId}`);
  }

  /**
   * Connects using the existing MikrotikClientFactory and performs full multi-layer
   * hardware, software, package, interface, network, and role discovery.
   */
  async discover(
    tenantId: string,
    deviceId: string,
    options?: { forceRefresh?: boolean; clientSnapshot?: any },
  ): Promise<FullRouterDiscoveryReport> {
    const cacheKey = `${tenantId}:${deviceId}`;
    const hit = this.cache.get(cacheKey);

    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id: deviceId, tenantId, deletedAt: null },
    });
    if (!device) {
      throw new BadGatewayException({
        code: 'DEVICE_NOT_FOUND',
        message: `لم يتم العثور على جهاز الراوتر (${deviceId}) ضمن المستأجر الحالي.`,
      });
    }

    const isPrivate = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(device.host.trim());

    // 1. If client sent a locally-discovered snapshot (from phone on same LAN), build report directly
    if (options?.clientSnapshot && typeof options.clientSnapshot === 'object') {
      const report = this.buildReportFromSnapshot(options.clientSnapshot, {
        id: device.id,
        name: device.name,
        host: device.host,
        rosVersion: device.rosVersion,
        cacheKey,
      });
      this.cache.set(cacheKey, { report, cachedAt: Date.now() });
      return report;
    }

    // 2. Normal cache check if not forceRefresh
    if (!options?.forceRefresh) {
      // Keep discovery cache short (30s) so preview/execution never relies on stale router topology
      if (hit && Date.now() - hit.cachedAt < 30 * 1000) {
        return hit.report;
      }
    }

    let client: IMikrotikClient;
    try {
      client = await this.clientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });
    } catch (err) {
      // For private LAN routers: cloud cannot directly reach RFC 1918 IPs.
      // If a recent local discovery report exists (up to 15 minutes), reuse it safely
      // rather than throwing a false BadGatewayException when cloud connection fails.
      if (isPrivate && hit && Date.now() - hit.cachedAt < 15 * 60 * 1000) {
        return hit.report;
      }

      const msg = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException({
        code: isPrivate ? 'CLOUD_UNREACHABLE_PRIVATE_LAN' : 'ROUTER_CONNECTION_FAILED',
        message: isPrivate
          ? `الراوتر بعنوان شبكة محلية خاصة (${device.host}) لا يمكن للسيرفر السحابي الوصول إليه مباشرة. يرجى إتمام الاستكشاف محلياً عبر التطبيق من نفس شبكة الواي فاي.`
          : `تعذر الاتصال بالراوتر (${device.host}): ${msg}`,
      });
    }

    return this.discoverWithClient(client, {
      id: device.id,
      name: device.name,
      host: device.host,
      rosVersion: device.rosVersion,
      useRest: device.rosVersion === 'V7' && Boolean(device.restPort),
      cacheKey,
    });
  }

  /**
   * Reusable discovery pipeline accepting an already-connected IMikrotikClient
   * (used both by production discovery and isolated compatibility tests).
   */
  async discoverWithClient(
    client: IMikrotikClient,
    meta: {
      id: string;
      name: string;
      host: string;
      rosVersion?: string;
      useRest?: boolean;
      cacheKey?: string;
    },
  ): Promise<FullRouterDiscoveryReport> {
    const failedCoreQueries: string[] = [];
    const failedOptionalQueries: string[] = [];
    const completenessWarnings: string[] = [];

    const runTimedQuery = async <T>(
      queryName: string,
      fn: (() => Promise<T>) | undefined,
      fallback: T,
      critical: boolean,
      timeoutMs = 8000,
    ): Promise<T> => {
      if (!fn) {
        if (critical) {
          failedCoreQueries.push(queryName);
          completenessWarnings.push(`العميل الحالي لا يدعم استعلام الشبكة الأساسي (${queryName}).`);
        }
        return fallback;
      }
      try {
        return await Promise.race([
          fn(),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms)`)), timeoutMs),
          ),
        ]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[Discovery] ${critical ? 'CORE' : 'Optional'} query "${queryName}" failed: ${errMsg}`,
        );
        if (critical) {
          failedCoreQueries.push(queryName);
          completenessWarnings.push(`فشل استعلام الشبكة الأساسي (${queryName}): ${errMsg}`);
        } else {
          failedOptionalQueries.push(queryName);
          completenessWarnings.push(`تعذر جلب (${queryName}): ${errMsg}`);
        }
        return fallback;
      }
    };

    const [
      resource,
      identity,
      routerboard,
      packages,
      interfaces,
      bridges,
      bridgePorts,
      vlans,
      wirelessInterfaces,
      wifiInterfaces,
      ipAddresses,
      pools,
      dhcpClients,
      dhcpServers,
      dhcpNetworks,
      dnsConfig,
      natRules,
      mangleRules,
      filterRules,
      routes,
      bondingInterfaces,
      pppoeClients,
      hotspotServers,
      hotspotServerProfiles,
      hotspotUserProfiles,
      queueTypes,
      schedulers,
      existingBackups,
    ] = await Promise.all([
      runTimedQuery(
        'systemResource',
        () => client.getSystemResource(),
        {
          uptime: '0s',
          version: meta.rosVersion || 'unknown',
          cpuLoad: 0,
          freeMemory: 0,
          totalMemory: 0,
          freeHdd: 0,
          totalHdd: 0,
        },
        true,
      ),
      runTimedQuery('identity', client.getSystemIdentity ? () => client.getSystemIdentity!() : undefined, meta.name, false),
      runTimedQuery('routerboard', client.getRouterboardInfo ? () => client.getRouterboardInfo!() : undefined, {}, false),
      runTimedQuery('packages', client.listPackages ? () => client.listPackages!() : undefined, [], false),
      runTimedQuery('interfaces', client.listInterfaces ? () => client.listInterfaces!() : undefined, [], true),
      runTimedQuery('bridges', client.listBridges ? () => client.listBridges!() : undefined, [], true),
      runTimedQuery('bridgePorts', client.listBridgePorts ? () => client.listBridgePorts!() : undefined, [], true),
      runTimedQuery('vlans', client.listVlans ? () => client.listVlans!() : undefined, [], true),
      runTimedQuery('wirelessInterfaces', client.listWirelessInterfaces ? () => client.listWirelessInterfaces!() : undefined, [], false),
      runTimedQuery('wifiInterfaces', client.listWifiInterfaces ? () => client.listWifiInterfaces!() : undefined, [], false),
      runTimedQuery('ipAddresses', client.listIpAddresses ? () => client.listIpAddresses!() : undefined, [], true),
      runTimedQuery('pools', client.listPools ? () => client.listPools!() : undefined, [], false),
      runTimedQuery('dhcpClients', client.listDhcpClients ? () => client.listDhcpClients!() : undefined, [], true),
      runTimedQuery('dhcpServers', client.listDhcpServers ? () => client.listDhcpServers!() : undefined, [], false),
      runTimedQuery('dhcpNetworks', client.listDhcpNetworks ? () => client.listDhcpNetworks!() : undefined, [], false),
      runTimedQuery('dnsConfig', client.getDnsConfig ? () => client.getDnsConfig!() : undefined, {}, false),
      runTimedQuery('natRules', client.listNatRules ? () => client.listNatRules!() : undefined, [], false),
      runTimedQuery('mangleRules', client.listMangleRules ? () => client.listMangleRules!() : undefined, [], false),
      runTimedQuery('filterRules', client.listFilterRules ? () => client.listFilterRules!() : undefined, [], false),
      runTimedQuery('routes', client.listRoutes ? () => client.listRoutes!() : undefined, [], true),
      runTimedQuery('bondingInterfaces', client.listBondingInterfaces ? () => client.listBondingInterfaces!() : undefined, [], false),
      runTimedQuery('pppoeClients', client.listPppoeClients ? () => client.listPppoeClients!() : undefined, [], false),
      runTimedQuery('hotspotServers', client.listHotspotServers ? () => client.listHotspotServers!() : undefined, [], false),
      runTimedQuery(
        'hotspotServerProfiles',
        client.listHotspotServerProfiles ? () => client.listHotspotServerProfiles!() : undefined,
        [],
        false,
      ),
      runTimedQuery('hotspotUserProfiles', () => client.listHotspotProfiles(), [], false),
      runTimedQuery('queueTypes', client.listQueueTypes ? () => client.listQueueTypes!() : undefined, [], false),
      runTimedQuery('schedulers', client.listSchedulers ? () => client.listSchedulers!() : undefined, [], false),
      runTimedQuery('existingBackups', client.listBackups ? () => client.listBackups!() : undefined, [], false),
    ]);

    if (failedCoreQueries.length > 0) {
      throw new BadGatewayException({
        code: 'DISCOVERY_INCOMPLETE',
        message: `تعذر إكمال قراءة طوبولوجيا الشبكة الأساسية من الراوتر (${failedCoreQueries.join(', ')}) — تم إيقاف التحليل بأمان (Fail-Closed).`,
        failedCoreQueries,
        failedOptionalQueries,
      });
    }

    const { osFamily, majorVersion, minorVersion } = this.capabilityService.parseRouterOsVersion(
      resource.version,
    );

    const capabilities = this.capabilityService.detectCapabilities({
      resource,
      routerboard,
      packages,
      interfaces,
      wirelessInterfaces,
      wifiInterfaces,
      queueTypes,
      connectionProtocol: meta.useRest ? 'REST' : 'API',
    });

    const deviceMetadata: DiscoveredDeviceMetadata = {
      deviceId: meta.id,
      deviceName: meta.name,
      host: meta.host,
      boardName: resource.boardName || routerboard.model || 'Unknown Board',
      model: routerboard.model || resource.model || resource.boardName || 'RouterBOARD',
      version: resource.version || 'unknown',
      majorVersion,
      minorVersion,
      osFamily,
      architecture: resource.architecture || 'unknown',
      platform: resource.platform || 'MikroTik',
      identity: identity || meta.name,
      uptime: resource.uptime || '0s',
      cpuLoad: resource.cpuLoad ?? 0,
      freeMemoryBytes: resource.freeMemory ?? 0,
      totalMemoryBytes: resource.totalMemory ?? 0,
      freeHddBytes: resource.freeHdd ?? 0,
      totalHddBytes: resource.totalHdd ?? 0,
      serialNumber: routerboard.serialNumber,
      currentFirmware: routerboard.currentFirmware,
      factorySoftware: resource.factorySoftware,
    };

    const roleAnalysis = this.assessInterfaces({
      managementHost: meta.host,
      interfaces,
      bridgePorts,
      ipAddresses,
      dhcpClients,
      routes,
      hotspotServers,
    });

    const discoveredAt = new Date().toISOString();
    const baseReport: FullRouterDiscoveryReport = {
      device: deviceMetadata,
      capabilities,
      interfacesAssessment: roleAnalysis.assessments,
      resource,
      routerboard,
      packages,
      interfaces,
      bridges,
      bridgePorts,
      vlans,
      wirelessInterfaces,
      wifiInterfaces,
      ipAddresses,
      pools,
      dhcpClients,
      dhcpServers,
      dhcpNetworks,
      dnsConfig,
      natRules,
      mangleRules,
      filterRules,
      routes,
      bondingInterfaces,
      pppoeClients,
      hotspotServers,
      hotspotServerProfiles,
      hotspotUserProfiles,
      queueTypes,
      schedulers,
      existingBackups,
      discoveryCompleteness: {
        isComplete: failedCoreQueries.length === 0,
        failedCoreQueries,
        failedOptionalQueries,
        warnings: completenessWarnings,
      },
      wanRoleAmbiguous: roleAnalysis.wanRoleAmbiguous,
      suggestedWanInterface: roleAnalysis.suggestedWanInterface,
      suggestedLanInterfaces: roleAnalysis.suggestedLanInterfaces,
      managementInterface: roleAnalysis.managementInterface,
      discoveredAt,
      snapshotHash: '',
    };

    baseReport.snapshotHash = computeAuthoritativeSnapshotHash({
      interfaces,
      bridges,
      bridgePorts,
      ipAddresses,
      dhcpClients,
      dhcpServers,
      natRules,
      routes,
      hotspotServers,
    });

    if (meta.cacheKey) {
      this.cache.set(meta.cacheKey, { report: baseReport, cachedAt: Date.now() });
    }

    return baseReport;
  }

  buildReportFromSnapshot(
    snapshot: any,
    meta: {
      id: string;
      name: string;
      host: string;
      rosVersion?: string;
      cacheKey?: string;
    },
  ): FullRouterDiscoveryReport {
    const resource = snapshot.resource || {
      version: meta.rosVersion || '7.15',
      boardName: meta.name,
      uptime: '1h',
      cpuLoad: 3,
      freeMemory: 64 * 1024 * 1024,
      totalMemory: 128 * 1024 * 1024,
      freeHdd: 16 * 1024 * 1024,
      totalHdd: 32 * 1024 * 1024,
      architecture: 'arm',
      platform: 'MikroTik',
    };
    const routerboard = snapshot.routerboard || { model: resource.boardName || 'RouterBOARD' };
    const packages = Array.isArray(snapshot.packages) ? snapshot.packages : [];
    const interfaces = Array.isArray(snapshot.interfaces) ? snapshot.interfaces : [];
    const bridges = Array.isArray(snapshot.bridges) ? snapshot.bridges : [];
    const bridgePorts = Array.isArray(snapshot.bridgePorts) ? snapshot.bridgePorts : [];
    const vlans = Array.isArray(snapshot.vlans) ? snapshot.vlans : [];
    const wirelessInterfaces = Array.isArray(snapshot.wirelessInterfaces) ? snapshot.wirelessInterfaces : [];
    const wifiInterfaces = Array.isArray(snapshot.wifiInterfaces) ? snapshot.wifiInterfaces : [];
    const ipAddresses = Array.isArray(snapshot.ipAddresses) ? snapshot.ipAddresses : [];
    const pools = Array.isArray(snapshot.pools) ? snapshot.pools : [];
    const dhcpClients = Array.isArray(snapshot.dhcpClients) ? snapshot.dhcpClients : [];
    const dhcpServers = Array.isArray(snapshot.dhcpServers) ? snapshot.dhcpServers : [];
    const dhcpNetworks = Array.isArray(snapshot.dhcpNetworks) ? snapshot.dhcpNetworks : [];
    const dnsConfig = snapshot.dnsConfig || {};
    const natRules = Array.isArray(snapshot.natRules) ? snapshot.natRules : [];
    const mangleRules = Array.isArray(snapshot.mangleRules) ? snapshot.mangleRules : [];
    const filterRules = Array.isArray(snapshot.filterRules) ? snapshot.filterRules : [];
    const routes = Array.isArray(snapshot.routes) ? snapshot.routes : [];
    const bondingInterfaces = Array.isArray(snapshot.bondingInterfaces) ? snapshot.bondingInterfaces : [];
    const pppoeClients = Array.isArray(snapshot.pppoeClients) ? snapshot.pppoeClients : [];
    const hotspotServers = Array.isArray(snapshot.hotspotServers) ? snapshot.hotspotServers : [];
    const hotspotServerProfiles = Array.isArray(snapshot.hotspotServerProfiles) ? snapshot.hotspotServerProfiles : [];
    const hotspotUserProfiles = Array.isArray(snapshot.hotspotUserProfiles) ? snapshot.hotspotUserProfiles : [];
    const queueTypes = Array.isArray(snapshot.queueTypes) ? snapshot.queueTypes : [];
    const schedulers = Array.isArray(snapshot.schedulers) ? snapshot.schedulers : [];
    const existingBackups = Array.isArray(snapshot.existingBackups) ? snapshot.existingBackups : [];
    const identity = snapshot.identity || meta.name;

    const { osFamily, majorVersion, minorVersion } = this.capabilityService.parseRouterOsVersion(
      resource.version || meta.rosVersion || '7.15',
    );

    const capabilities = this.capabilityService.detectCapabilities({
      resource,
      routerboard,
      packages,
      interfaces,
      wirelessInterfaces,
      wifiInterfaces,
      queueTypes,
      connectionProtocol: 'API',
    });

    const deviceMetadata: DiscoveredDeviceMetadata = {
      deviceId: meta.id,
      deviceName: meta.name,
      host: meta.host,
      boardName: resource.boardName || routerboard.model || 'Unknown Board',
      model: routerboard.model || resource.model || resource.boardName || 'RouterBOARD',
      version: resource.version || 'unknown',
      majorVersion,
      minorVersion,
      osFamily,
      architecture: resource.architecture || 'unknown',
      platform: resource.platform || 'MikroTik',
      identity: identity || meta.name,
      uptime: resource.uptime || '0s',
      cpuLoad: resource.cpuLoad ?? 0,
      freeMemoryBytes: resource.freeMemory ?? 0,
      totalMemoryBytes: resource.totalMemory ?? 0,
      freeHddBytes: resource.freeHdd ?? 0,
      totalHddBytes: resource.totalHdd ?? 0,
      serialNumber: routerboard.serialNumber,
      currentFirmware: routerboard.currentFirmware,
      factorySoftware: resource.factorySoftware,
    };

    const roleAnalysis = this.assessInterfaces({
      managementHost: meta.host,
      interfaces,
      bridgePorts,
      ipAddresses,
      dhcpClients,
      routes,
      hotspotServers,
    });

    const discoveredAt = new Date().toISOString();
    const baseReport: FullRouterDiscoveryReport = {
      device: deviceMetadata,
      capabilities,
      interfacesAssessment: roleAnalysis.assessments,
      resource,
      routerboard,
      packages,
      interfaces,
      bridges,
      bridgePorts,
      vlans,
      wirelessInterfaces,
      wifiInterfaces,
      ipAddresses,
      pools,
      dhcpClients,
      dhcpServers,
      dhcpNetworks,
      dnsConfig,
      natRules,
      mangleRules,
      filterRules,
      routes,
      bondingInterfaces,
      pppoeClients,
      hotspotServers,
      hotspotServerProfiles,
      hotspotUserProfiles,
      queueTypes,
      schedulers,
      existingBackups,
      discoveryCompleteness: {
        isComplete: true,
        failedCoreQueries: [],
        failedOptionalQueries: [],
        warnings: [],
      },
      wanRoleAmbiguous: roleAnalysis.wanRoleAmbiguous,
      suggestedWanInterface: roleAnalysis.suggestedWanInterface,
      suggestedLanInterfaces: roleAnalysis.suggestedLanInterfaces,
      managementInterface: roleAnalysis.managementInterface,
      discoveredAt,
      snapshotHash: '',
    };

    baseReport.snapshotHash = computeAuthoritativeSnapshotHash({
      interfaces,
      bridges,
      bridgePorts,
      ipAddresses,
      dhcpClients,
      dhcpServers,
      natRules,
      routes,
      hotspotServers,
    });

    return baseReport;
  }

  /**
   * Infers interface roles strictly from live topology (default route egress,
   * DHCP clients, IP assignment, bridge membership, hotspot binding, management IP)
   * rather than assuming ether1 = WAN by port name alone.
   */
  assessInterfaces(input: {
    managementHost: string;
    interfaces: RouterInterfaceItem[];
    bridgePorts: RouterBridgePortItem[];
    ipAddresses: RouterIpAddressItem[];
    dhcpClients: RouterDhcpClientItem[];
    routes: RouterRouteItem[];
    hotspotServers: RouterHotspotServerItem[];
  }): {
    assessments: InterfaceRoleAssessment[];
    wanRoleAmbiguous: boolean;
    suggestedWanInterface?: string;
    suggestedLanInterfaces: string[];
    managementInterface?: string;
  } {
    const cleanHost = (input.managementHost || '').trim();
    const mgmtIpRecord = input.ipAddresses.find(
      (ip) => ip.address?.split('/')[0] === cleanHost && !ip.disabled,
    );
    const managementInterface = mgmtIpRecord?.interface;

    // Identify default route egress interfaces without trusting port names
    const routeEgressSummary = resolveActiveDefaultRoutesEgress(
      input.routes,
      input.interfaces,
      input.ipAddresses,
    );
    const routeEgressInterfaces = new Set<string>(routeEgressSummary.egressInterfaces);

    const activeDhcpClientIfaces = new Set(
      input.dhcpClients.filter((d) => !d.disabled && d.interface).map((d) => d.interface),
    );
    const hotspotIfaces = new Set(
      input.hotspotServers.filter((h) => !h.disabled).map((h) => h.interface),
    );

    const assessments: InterfaceRoleAssessment[] = [];
    const wanCandidates: string[] = [];

    for (const iface of input.interfaces) {
      const ifaceIps = input.ipAddresses.filter((ip) => ip.interface === iface.name && !ip.disabled);
      const bp = input.bridgePorts.find((p) => p.interface === iface.name && !p.disabled);
      const isMgmt =
        managementInterface === iface.name ||
        (Boolean(managementInterface) && bp?.bridge === managementInterface);

      const reasons: string[] = [];
      let isWanCandidate = false;
      let isLanCandidate = false;
      let role: InferredInterfaceRole = 'UNUSED';
      let confidence: 'CONFIRMED' | 'INFERRED' | 'AMBIGUOUS' = 'INFERRED';

      if (routeEgressInterfaces.has(iface.name)) {
        isWanCandidate = true;
        reasons.push('مخرج المسار الافتراضي النشط (0.0.0.0/0)');
      }
      if (activeDhcpClientIfaces.has(iface.name)) {
        isWanCandidate = true;
        reasons.push('مفعل عليه DHCP Client لاستقبال الإنترنت');
      }
      if (bp?.bridge) {
        isLanCandidate = true;
        reasons.push(`منضم إلى جسر (${bp.bridge})`);
      }
      if (hotspotIfaces.has(iface.name) || (bp?.bridge && hotspotIfaces.has(bp.bridge))) {
        isLanCandidate = true;
        reasons.push('مرتبط بخدمة Hotspot');
      }
      if (isMgmt) {
        reasons.push('يحمل عنوان أو مسار إدارة الاتصال الحالي');
      }

      if (isWanCandidate && !isLanCandidate) {
        role = 'WAN';
        confidence = routeEgressInterfaces.has(iface.name) ? 'CONFIRMED' : 'INFERRED';
        wanCandidates.push(iface.name);
      } else if (isMgmt && !isWanCandidate) {
        role = 'MANAGEMENT';
        confidence = 'CONFIRMED';
      } else if (isLanCandidate && !isWanCandidate) {
        role = 'LAN';
        confidence = 'CONFIRMED';
      } else if (isWanCandidate && isLanCandidate) {
        role = 'AMBIGUOUS';
        confidence = 'AMBIGUOUS';
        wanCandidates.push(iface.name);
        reasons.push('تضارب: يحمل إشارات WAN و LAN معاً ويتطلب تأكيد المستخدم');
      } else if (
        (iface.type === 'ether' || iface.type.includes('sfp')) &&
        !iface.disabled
      ) {
        if (ifaceIps.length > 0) {
          role = 'AMBIGUOUS';
          confidence = 'AMBIGUOUS';
          reasons.push('يحتوي على عنوان IP حالي دون انتماء واضح لـ WAN أو LAN');
        } else {
          role = 'UNUSED';
          confidence = iface.running ? 'INFERRED' : 'CONFIRMED';
        }
      }

      assessments.push({
        name: iface.name,
        type: iface.type,
        enabled: !iface.disabled,
        running: Boolean(iface.running),
        hasIp: ifaceIps.length > 0,
        ipAddresses: ifaceIps.map((ip) => ip.address),
        bridged: Boolean(bp),
        bridgeName: bp?.bridge,
        role,
        confidence,
        isWanCandidate,
        isLanCandidate,
        isManagementPath: isMgmt,
        hasExistingConfig: ifaceIps.length > 0 || Boolean(bp) || activeDhcpClientIfaces.has(iface.name),
        reasons,
      });
    }

    const wanRoleAmbiguous = wanCandidates.length !== 1;
    const suggestedWanInterface = wanCandidates.length === 1 ? wanCandidates[0] : undefined;
    const suggestedLanInterfaces = assessments
      .filter(
        (a) =>
          (a.type === 'ether' || a.type === 'wlan' || a.type === 'wifi') &&
          a.name !== suggestedWanInterface &&
          !a.isManagementPath,
      )
      .map((a) => a.name);

    return {
      assessments,
      wanRoleAmbiguous,
      suggestedWanInterface,
      suggestedLanInterfaces,
      managementInterface,
    };
  }
}
