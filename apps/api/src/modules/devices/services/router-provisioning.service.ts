import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  BadGatewayException,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  validateSnapshotIntegrity,
  computeAuthoritativeSnapshotHash,
  isValidRouterOsId,
  isValidIpv4Cidr,
} from '../../../core/security/snapshot-integrity.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { EncryptionService } from '../../../core/security/encryption.service';
import { PlanSigningService } from '../../../core/security/signing.service';
import {
  IMikrotikClient,
  RouterResource,
  HotspotProfileItem,
  RouterIpAddressItem,
  RouterBridgePortItem,
} from '../../../core/mikrotik/interfaces/mikrotik-client.interface';
import { ProvisionPreviewDto } from '../dto/provision-preview.dto';
import { ProvisionApplyDto } from '../dto/provision-apply.dto';
import {
  RouterDiscoverySnapshot,
  ProvisioningConflict,
  ProvisioningWarning,
  PlannedProvisioningStep,
  GeneratedCommandItem,
  ProvisioningPreviewResponse,
  ExecutedStageLog,
  ProvisioningVerificationResult,
  ProvisioningApplyResult,
  SecurityPolicyReportItem,
} from '../interfaces/provisioning.interface';
import { DevicesService } from '../devices.service';

@Injectable()
export class RouterProvisioningService {
  private readonly logger = new Logger(RouterProvisioningService.name);

  // In-memory cache for router discovery snapshots: key is `${tenantId}:${deviceId}`
  private readonly discoveryCache = new Map<
    string,
    { snapshot: RouterDiscoverySnapshot; cachedAt: number }
  >();

  // In-memory set of applied local session keys for replay attack prevention
  private readonly appliedLocalSessions = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: MikrotikClientFactory,
    private readonly encryptionService: EncryptionService,
    @Optional() private readonly planSigningService?: PlanSigningService,
  ) {}

  /**
   * Saves or synchronizes a client-discovered snapshot
   */
  async saveDiscoverySnapshot(
    tenantId: string,
    deviceId: string,
    snapshot: RouterDiscoverySnapshot,
  ): Promise<RouterDiscoverySnapshot> {
    await this.getValidDevice(tenantId, deviceId);
    this.discoveryCache.set(`${tenantId}:${deviceId}`, {
      snapshot,
      cachedAt: Date.now(),
    });
    this.logger.log(
      `Synchronized discovery snapshot for device ${deviceId} (${snapshot.interfaces?.length ?? 0} interfaces)`,
    );
    return snapshot;
  }

  private async getValidDevice(tenantId: string, deviceId: string) {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id: deviceId, tenantId, deletedAt: null },
    });
    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `MikroTik device with ID ${deviceId} not found for this tenant`,
      });
    }
    return device;
  }

  private async getConnectedClient(device: any): Promise<IMikrotikClient> {
    const client = await this.clientFactory.getClient({
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
    return client;
  }

  /**
   * Normalizes discovery snapshot ensuring all arrays and fields are non-null and safe
   */
  private normalizeSnapshot(raw: Partial<RouterDiscoverySnapshot> | any | undefined): RouterDiscoverySnapshot {
    return {
      resource: raw?.resource || {
        uptime: raw?.uptime || '0s',
        version: raw?.version || 'unknown',
        cpuLoad: typeof raw?.cpuLoad === 'number' ? raw.cpuLoad : 0,
        freeMemory: 0,
        totalMemory: 0,
        freeHdd: 0,
        totalHdd: 0,
      },
      interfaces: Array.isArray(raw?.interfaces) ? raw.interfaces.filter(Boolean) : [],
      bridges: Array.isArray(raw?.bridges)
        ? raw.bridges
            .map((b: any) => (typeof b === 'string' ? { name: b } : b))
            .filter(Boolean)
        : [],
      bridgePorts: Array.isArray(raw?.bridgePorts) ? raw.bridgePorts.filter(Boolean) : [],
      ipAddresses: Array.isArray(raw?.ipAddresses) ? raw.ipAddresses.filter(Boolean) : [],
      dhcpClients: Array.isArray(raw?.dhcpClients) ? raw.dhcpClients.filter(Boolean) : [],
      dhcpServers: Array.isArray(raw?.dhcpServers) ? raw.dhcpServers.filter(Boolean) : [],
      natRules: Array.isArray(raw?.natRules) ? raw.natRules.filter(Boolean) : [],
      routes: Array.isArray(raw?.routes) ? raw.routes.filter(Boolean) : [],
      hotspotServers: Array.isArray(raw?.hotspotServers)
        ? raw.hotspotServers
            .map((h: any) => (typeof h === 'string' ? { name: h } : h))
            .filter(Boolean)
        : [],
      mangleRules: Array.isArray(raw?.mangleRules) ? raw.mangleRules.filter(Boolean) : [],
      filterRules: Array.isArray(raw?.filterRules) ? raw.filterRules.filter(Boolean) : [],
      hotspotUserProfiles: Array.isArray(raw?.hotspotUserProfiles) ? raw.hotspotUserProfiles.filter(Boolean) : [],
    };
  }

  /**
   * Discovers the current network state of the router
   */
  async discover(
    tenantId: string,
    deviceId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<RouterDiscoverySnapshot> {
    const cacheKey = `${tenantId}:${deviceId}`;
    if (!options?.forceRefresh) {
      const cached = this.discoveryCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < 30 * 60 * 1000) {
        this.logger.log(
          `[Discovery Cache Hit] Using cached snapshot for device ${deviceId} (Age: ${Math.round((Date.now() - cached.cachedAt) / 1000)}s, Interfaces: ${cached.snapshot.interfaces?.length ?? 0})`,
        );
        return this.normalizeSnapshot(cached.snapshot);
      }
    }

    const device = await this.getValidDevice(tenantId, deviceId);

    let client: IMikrotikClient;
    try {
      client = await this.getConnectedClient(device);
    } catch (err: unknown) {
      // Check if we have a valid cached snapshot (e.g. from local discovery)
      const cached = this.discoveryCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < 30 * 60 * 1000) {
        this.logger.log(
          `Router direct connection failed, returning cached discovery snapshot for device ${deviceId}`,
        );
        return this.normalizeSnapshot(cached.snapshot);
      }

      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed router connection for discovery on ${device.host}: ${msg}`);
      throw new BadGatewayException({
        code: 'ROUTER_CONNECTION_FAILED',
        message: `تعذر الاتصال بالراوتر (${device.host}:${device.apiPort ?? device.restPort ?? 8728}): ${msg}`,
        host: device.host,
        port: device.apiPort ?? device.restPort,
      });
    }

    try {
      const safeQuery = async <T>(name: string, fn?: () => Promise<T>, fallback: T = [] as unknown as T, timeoutMs = 8000): Promise<T> => {
        if (!fn) return fallback;
        try {
          return await Promise.race([
            fn(),
            new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Query timeout (${timeoutMs}ms)`)), timeoutMs)),
          ]);
        } catch (queryErr) {
          const errMsg = queryErr instanceof Error ? queryErr.message : String(queryErr);
          this.logger.warn(`[Discovery Query Warn] Query "${name}" on ${device.host} (${device.rosVersion || 'ROS'}): ${errMsg}`);
          return fallback;
        }
      };

      const [
        resource,
        interfaces,
        bridges,
        bridgePorts,
        ipAddresses,
        dhcpClients,
        dhcpServers,
        natRules,
        routes,
        hotspotServers,
        mangleRules,
        filterRules,
        hotspotUserProfiles,
      ] = await Promise.all([
        safeQuery(
          'systemResource',
          () => client.getSystemResource(),
          {
            uptime: '0s',
            version: device.rosVersion || 'unknown',
            cpuLoad: 0,
            freeMemory: 0,
            totalMemory: 0,
            freeHdd: 0,
            totalHdd: 0,
          } as RouterResource,
          8000,
        ),
        safeQuery('interfaces', () => (client.listInterfaces ? client.listInterfaces() : Promise.resolve([])), []),
        safeQuery('bridges', () => (client.listBridges ? client.listBridges() : Promise.resolve([])), []),
        safeQuery('bridgePorts', () => (client.listBridgePorts ? client.listBridgePorts() : Promise.resolve([])), []),
        safeQuery('ipAddresses', () => (client.listIpAddresses ? client.listIpAddresses() : Promise.resolve([])), []),
        safeQuery('dhcpClients', () => (client.listDhcpClients ? client.listDhcpClients() : Promise.resolve([])), []),
        safeQuery('dhcpServers', () => (client.listDhcpServers ? client.listDhcpServers() : Promise.resolve([])), []),
        safeQuery('natRules', () => (client.listNatRules ? client.listNatRules() : Promise.resolve([])), []),
        safeQuery('routes', () => (client.listRoutes ? client.listRoutes() : Promise.resolve([])), []),
        safeQuery('hotspotServers', () => (client.listHotspotServers ? client.listHotspotServers() : Promise.resolve([])), []),
        safeQuery('mangleRules', () => (client.listMangleRules ? client.listMangleRules() : Promise.resolve([])), []),
        safeQuery('filterRules', () => (client.listFilterRules ? client.listFilterRules() : Promise.resolve([])), []),
        safeQuery('hotspotUserProfiles', () => (client.listHotspotProfiles ? client.listHotspotProfiles() : Promise.resolve([])), []),
      ]);

      const snapshot: RouterDiscoverySnapshot = this.normalizeSnapshot({
        resource,
        interfaces,
        bridges,
        bridgePorts,
        ipAddresses,
        dhcpClients,
        dhcpServers,
        natRules,
        routes,
        hotspotServers,
        mangleRules,
        filterRules,
        hotspotUserProfiles,
      });

      // Cache snapshot for future steps
      this.discoveryCache.set(cacheKey, {
        snapshot,
        cachedAt: Date.now(),
      });

      return snapshot;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException({
        code: 'ROUTER_DISCOVERY_QUERY_FAILED',
        message: `حدث خطأ أثناء قراءة منافذ وبيانات الراوتر (${device.host}): ${msg}`,
      });
    }
  }

  /**
   * Generates a preview with conflict detection, warnings, and exact commands.
   * Completely defensive: NEVER throws HTTP 500 under any circumstances.
   */
  async preview(
    tenantId: string,
    deviceId: string,
    dto: ProvisionPreviewDto,
  ): Promise<ProvisioningPreviewResponse> {
    const previewStartTime = Date.now();
    let device: any = null;

    try {
      device = await this.getValidDevice(tenantId, deviceId);
      this.logger.log(`[Preview Start] Generating preview for router "${device.name}" (${device.host}) [ID: ${deviceId}]`);

      const discoveryStartTime = Date.now();
      let rawDiscovery: RouterDiscoverySnapshot;
      let authoritativeSnapshotHash = '';

      // 1. If client sent a locally-discovered snapshot, prioritize it over cloud direct connection
      if (dto.snapshot && typeof dto.snapshot === 'object') {
        this.logger.log(
          `[Preview Discovery] Using client-discovered snapshot for router ${deviceId} (${Array.isArray(dto.snapshot.interfaces) ? dto.snapshot.interfaces.length : 0} interfaces)`,
        );

        // Authoritative Validation: Freshness, Structure, Completeness, and Cryptographic Hash
        const validation = validateSnapshotIntegrity(dto.snapshot, dto.discoveredAt, dto.snapshotHash);
        authoritativeSnapshotHash = validation.authoritativeHash;

        rawDiscovery = this.normalizeSnapshot(dto.snapshot);
        // Cache snapshot so any follow-up actions can utilize it
        this.discoveryCache.set(`${tenantId}:${deviceId}`, {
          snapshot: rawDiscovery,
          cachedAt: Date.now(),
        });
      } else {
        try {
          rawDiscovery = await this.discover(tenantId, deviceId, { forceRefresh: false });
          authoritativeSnapshotHash = computeAuthoritativeSnapshotHash(rawDiscovery);
        } catch (discErr) {
          const dMsg = discErr instanceof Error ? discErr.message : String(discErr);
          this.logger.error(
            `[Preview Discovery Error] Direct discovery failed for ${device.host}: ${dMsg}`,
          );
          throw new BadGatewayException({
            code: 'ROUTER_DISCOVERY_FAILED',
            message: `تعذر قراءة إعدادات الراوتر (${device.host}) من الخادم: ${dMsg}. يرجى فحص الراوتر من التطبيق أولاً.`,
          });
        }
      }

      const discovery = this.normalizeSnapshot(rawDiscovery);
      const discoveryDuration = Date.now() - discoveryStartTime;
      this.logger.log(
        `[Preview Discovery] Retrieved router state in ${discoveryDuration}ms (Interfaces: ${discovery.interfaces?.length ?? 0}, Bridges: ${discovery.bridges?.length ?? 0}, IPs: ${discovery.ipAddresses?.length ?? 0})`,
      );

      const mgmtCtx = this.resolveEffectiveManagementContext(device.host || '', discovery, dto);
      const effectiveHost = mgmtCtx.effectiveHost;
      const effectiveDevice = { ...device, host: effectiveHost };

      const conflicts: ProvisioningConflict[] = [];
      const warnings: ProvisioningWarning[] = [];
      let requiresCleanConfirmation = false;

      // 1. Validate WAN interface existence, topology, and conflicts
      try {
        const wanIfaceName = (dto.wan?.interface || 'ether1').trim();
        const rawMemberPorts = Array.isArray(dto.lan?.memberInterfaces) ? dto.lan.memberInterfaces : [];
        const memberPorts = rawMemberPorts.map((m: any) => (m ? String(m).trim() : '')).filter(Boolean);
        const proposedGateway = (dto.lan?.gatewayIp || '').trim();
        const proposedSubnet = this.extractSubnetBase(proposedGateway);

        const wanMode = dto.wan?.mode;
        const wanCheck = this.verifyWanTopology(discovery, wanIfaceName, memberPorts, proposedSubnet, wanMode);
        if (!wanCheck.isValid) {
          const isBridgeConflict = wanCheck.failureReason?.includes('مرتبط بالجسر');
          const isOverlap = wanCheck.failureReason?.includes('مشتركين (LAN)');
          conflicts.push({
            resource: isBridgeConflict ? 'WAN_BRIDGE_CONFLICT' : isOverlap ? 'WAN_LAN_OVERLAP' : 'WAN_BRIDGE_CONFLICT',
            existingValue: `منفذ الإنترنت (${wanIfaceName}) به تعارض طوبولوجي أو بنيوي`,
            proposedValue: `تعيين ${wanIfaceName} كمنفذ إنترنت مستقل وآمن`,
            details: wanCheck.failureReason || 'تعذر إثبات استقلالية وسلامة منفذ الإنترنت WAN.',
          });
          warnings.push({
            type: 'WAN_TOPOLOGY_INVALID',
            severity: 'CRITICAL',
            message: wanCheck.failureReason || `تعارض في مسار الإنترنت على المنفذ (${wanIfaceName}).`,
            suggestedAction: 'تأكد من اختيار منفذ WAN مستقل وغير مدمج في جسور محلية أو مرتبط بمنافذ المشتركين.',
          });
        }
      } catch (wanErr) {
        this.logger.warn(`[Preview Warning] Error during WAN conflict check: ${wanErr instanceof Error ? wanErr.message : String(wanErr)}`);
      }

      // 2. Validate LAN Member Ports
      try {
        const wanIfaceName = (dto.wan?.interface || 'ether1').trim();
        const rawMemberPorts = Array.isArray(dto.lan?.memberInterfaces) ? dto.lan.memberInterfaces : [];
        const memberPorts = rawMemberPorts.map((m: any) => (m ? String(m).trim() : '')).filter(Boolean);

        if (memberPorts.includes(wanIfaceName)) {
          conflicts.push({
            resource: 'WAN_LAN_OVERLAP',
            existingValue: `المنفذ ${wanIfaceName} تم اختياره للإنترنت (WAN)`,
            proposedValue: `إضافة ${wanIfaceName} إلى منافذ خروج المشتركين (LAN)`,
            details: 'لا يمكن لمنفذ واحد أن يعمل كمنفذ إنترنت خارجي ومنفذ مشتركين داخلي في آن واحد.',
          });
        }

        for (const port of memberPorts) {
          const existingBridgePort = discovery.bridgePorts.find((p) => p?.interface === port);
          if (existingBridgePort && existingBridgePort.bridge !== (dto.lan?.bridgeName || 'bridge-hotspot')) {
            warnings.push({
              type: 'PORT_IN_OTHER_BRIDGE',
              severity: 'WARNING',
              message: `المنفذ (${port}) موجود مسبقاً داخل الجسر [${existingBridgePort.bridge}].`,
              suggestedAction: 'سيتم نقله تلقائياً إلى جسر الهوتسبوت الجديد عند الموافقة.',
            });
          }

          // Check if port has direct IP assigned (classic RouterOS lockout risk)
          const portDirectIp = discovery.ipAddresses.find((ip) => ip?.interface === port);
          if (portDirectIp && portDirectIp.address) {
            const rawAddress = String(portDirectIp.address).trim();
            const ipClean = rawAddress.includes('/') ? rawAddress.split('/')[0] : rawAddress;
            const isManagementHost = ipClean === effectiveHost;
            warnings.push({
              type: 'PORT_DIRECT_IP_RISK',
              severity: 'CRITICAL',
              message: isManagementHost
                ? `المنفذ (${port}) يحمل عنوان IP الحالي للراوتر (${effectiveHost}) المستخدم للاتصال بالنظام. ضم هذا المنفذ إلى الجسر قد يسبب انقطاع الاتصال بالإدارة فوراً.`
                : `المنفذ (${port}) يحمل عنوان IP مباشر (${rawAddress}) قد يكون مخصصاً للإدارة الاحتياطية أو شبكة خارج النطاق. ضم هذا المنفذ إلى جسر المشتركين يجعله تابعاً (Slave) وقد يسبب انقطاع الوصول إليه وعزله (Client Isolation).`,
              suggestedAction: isManagementHost
                ? 'تأكد من إمكانية الوصول للراوتر عبر منفذ آخر أو استثنِ هذا المنفذ من منافذ المشتركين.'
                : 'استثنِ هذا المنفذ من قائمة منافذ الجسر للحفاظ على مسار الإدارة المستقل أو انقل العنوان إلى الجسر يدوياً.',
            });
            conflicts.push({
              resource: isManagementHost ? 'MANAGEMENT_PORT_BRIDGED' : 'DIRECT_IP_PORT_BRIDGED',
              existingValue: `${rawAddress} معين مباشرة على المنفذ ${port}`,
              proposedValue: `ضم المنفذ ${port} إلى الجسر ${dto.lan?.bridgeName || 'bridge-hotspot'}`,
              details: isManagementHost
                ? 'ضم منفذ الإدارة المباشر إلى جسر دون تحويل العنوان قد يؤدي لفقدان الاتصال بالراوتر فورياً.'
                : `المنفذ ${port} يحمل عنوان IP مستقل (${rawAddress}). ضم المنفذ إلى جسر المشتركين يهدد بفقدان مسار الإدارة الاحتياطي وعزل المنفذ عبر Horizon.`,
            });
          }
        }
      } catch (lanErr) {
        this.logger.warn(`[Preview Warning] Error during LAN ports conflict check: ${lanErr instanceof Error ? lanErr.message : String(lanErr)}`);
      }

      // 3. Subnet Overlap Detection
      try {
        const proposedGateway = (dto.lan?.gatewayIp || '').trim();
        const proposedSubnet = this.extractSubnetBase(proposedGateway);
        if (proposedSubnet) {
          for (const existingIp of discovery.ipAddresses) {
            if (!existingIp || !existingIp.address) continue;
            const existingSubnet = this.extractSubnetBase(existingIp.address);
            if (existingSubnet && proposedSubnet && existingSubnet === proposedSubnet) {
              if (existingIp.interface !== (dto.lan?.bridgeName || 'bridge-hotspot')) {
                const wanIfaceName = (dto.wan?.interface || 'ether1').trim();
                const isWan = existingIp.interface === wanIfaceName;
                const isMgmt = this.isManagementIpOrInterface(existingIp, discovery, effectiveHost);
                const rawMemberPorts = Array.isArray(dto.lan?.memberInterfaces) ? dto.lan.memberInterfaces : [];
                const memberPorts = rawMemberPorts.map((m: any) => (m ? String(m).trim() : '')).filter(Boolean);
                const isMember = memberPorts.includes(existingIp.interface);
                const isUnknownRole = !isWan && !isMgmt && !isMember;

                let roleDesc = '';
                if (isWan) roleDesc = ' (منفذ الإنترنت WAN)';
                else if (isMgmt) roleDesc = ' (واجهة إدارة الراوتر)';
                else if (isUnknownRole) roleDesc = ' (واجهة ذات دور غير محدد)';

                conflicts.push({
                  resource: isWan ? 'WAN_LAN_OVERLAP' : 'IP_SUBNET_OVERLAP',
                  existingValue: `${existingIp.address} على المنفذ [${existingIp.interface}]${roleDesc}`,
                  proposedValue: `${proposedGateway} على [${dto.lan?.bridgeName || 'bridge-hotspot'}]`,
                  details: isWan
                    ? `منفذ الإنترنت (${existingIp.interface}) يقع في نفس نطاق شبكة المشتركين (${proposedSubnet}). هذا تعارض حرج يمنع التوجيه وعزل الشبكات.`
                    : isMgmt
                    ? `عنوان إدارة الراوتر (${existingIp.address}) يقع ضمن نفس نطاق شبكة المشتركين المقترحة. هذا تعارض مانع يهدد أمان وعزل الإدارة.`
                    : isUnknownRole
                    ? `الواجهة [${existingIp.interface}] ذات دور غير معروف في النظام وتحمل عنواناً ضمن نطاق المشتركين المقترح. لا يمكن حذف العنوان أو تجاهله تلقائياً.`
                    : `الشبكة المقترحة (${proposedSubnet}) تتعارض مع عنوان IP مستخدم حالياً على منفذ آخر.`,
                });
              }
            }
          }
        }
      } catch (subnetErr) {
        this.logger.warn(`[Preview Warning] Error during subnet overlap check: ${subnetErr instanceof Error ? subnetErr.message : String(subnetErr)}`);
      }

      // 4. Hotspot Server Duplicate Check
      try {
        const proposedHsName = dto.hotspot?.serverName || 'hs-sudafi';
        const existingHs = discovery.hotspotServers.find(
          (h) => h?.name === proposedHsName || h?.interface === (dto.lan?.bridgeName || 'bridge-hotspot'),
        );
        if (existingHs) {
          if (dto.template === 'CLEAN_SETUP') {
            warnings.push({
              type: 'HOTSPOT_OVERWRITE_CLEAN',
              severity: 'WARNING',
              message: `يوجد خادم هوتسبوت قائم بالفعل باسم [${existingHs.name}] على الواجهة [${existingHs.interface}].`,
              suggestedAction: 'سيتم تحديثه وربطه بحزمة SudaFi.',
            });
          } else {
            warnings.push({
              type: 'HOTSPOT_ALREADY_EXISTS',
              severity: 'INFO',
              message: `تم اكتشاف خادم هوتسبوت سابق [${existingHs.name}]. يمكنك دمجه وربطه بالتطبيق.`,
            });
          }
        }
      } catch (hsErr) {
        this.logger.warn(`[Preview Warning] Error during hotspot duplicate check: ${hsErr instanceof Error ? hsErr.message : String(hsErr)}`);
      }

      // 5. Clean Setup Warning & Confirmation Requirement
      try {
        if (dto.template === 'CLEAN_SETUP') {
          const hasActiveConfig =
            discovery.ipAddresses.length > 1 ||
            discovery.bridges.length > 0 ||
            discovery.hotspotServers.length > 0;
          if (hasActiveConfig) {
            requiresCleanConfirmation = true;
            warnings.push({
              type: 'CLEAN_SETUP_IN_USE_ROUTER',
              severity: 'CRITICAL',
              message:
                'الراوتر يحتوي على إعدادات سابقة (عناوين IP أو خوادم شبكة). اختيار "Clean Setup" سيقوم بإعادة تشكيل البنية التحتية لشبكة المشتركين.',
              suggestedAction:
                'يجب تأكيد الموافقة الصريحة (cleanSetupConfirmed) قبل تنفيذ هذا القالب على راوتر مستخدم حالياً.',
            });
          }
        }
      } catch (cleanErr) {
        this.logger.warn(`[Preview Warning] Error during clean setup check: ${cleanErr instanceof Error ? cleanErr.message : String(cleanErr)}`);
      }

      // 6. Rigorous Multi-Layer Management Path Verification
      try {
        const currentHost = effectiveHost;
        const rawMemberPorts = Array.isArray(dto.lan?.memberInterfaces) ? dto.lan.memberInterfaces : [];
        const memberPorts = rawMemberPorts.map((m: any) => (m ? String(m).trim() : '')).filter(Boolean);
        const wanIfaceName = (dto.wan?.interface || 'ether1').trim();
        const protectWanAccess = !!(dto.securityPolicies as any)?.protectWanAccess;

        const mgmtTopo = this.resolveManagementTopology(
          discovery,
          currentHost,
          memberPorts,
          wanIfaceName,
          protectWanAccess,
          mgmtCtx.overrideMgmtInterface,
        );

        if (!mgmtTopo.isDetermined) {
          const resolutionOptions: Array<{
            type: 'SELECT_HOST' | 'SELECT_INTERFACE';
            label: string;
            host?: string;
            interfaceName?: string;
          }> = [];

          // Only offer path selection when failure is simply missing host IP (not malformed bridge/bonding)
          if (!mgmtTopo.mgmtInterface) {
            const seenHosts = new Set<string>();
            for (const ip of discovery.ipAddresses || []) {
              if (!ip?.address || ip.disabled === true || (ip.disabled as any) === 'true') continue;
              const cleanIp = String(ip.address).trim().split('/')[0];
              const ifaceName = String(ip.interface || '').trim();
              if (!cleanIp || seenHosts.has(cleanIp)) continue;
              if (ifaceName && memberPorts.includes(ifaceName)) continue;
              seenHosts.add(cleanIp);
              resolutionOptions.push({
                type: 'SELECT_HOST',
                label: `استخدام عنوان الراوتر ${cleanIp} (${ifaceName || 'غير محدد'})`,
                host: cleanIp,
                interfaceName: ifaceName || undefined,
              });
            }
            if (
              wanIfaceName &&
              !memberPorts.includes(wanIfaceName) &&
              !protectWanAccess &&
              (discovery.interfaces || []).some((i) => i?.name === wanIfaceName)
            ) {
              resolutionOptions.push({
                type: 'SELECT_INTERFACE',
                label: `الإدارة عبر منفذ الإنترنت / NAT (${wanIfaceName})`,
                interfaceName: wanIfaceName,
              });
            }
          }

          const ipsSummary = (discovery.ipAddresses || [])
            .filter((ip) => ip?.address)
            .map((ip) => `${ip.address} (${ip.interface || 'غير محدد'})`)
            .join('، ');

          conflicts.push({
            resource: 'MANAGEMENT_PATH_INDETERMINATE',
            existingValue: ipsSummary
              ? `العنوان المسجل: ${currentHost || 'غير محدد'} | عناوين الراوتر: ${ipsSummary}`
              : `العنوان المسجل: ${currentHost || 'غير محدد'}`,
            proposedValue: 'تحديد مسار الإدارة الصحيح للراوتر',
            details: mgmtTopo.errorMessage || 'تعذر تحديد مسار الإدارة بصورة موثوقة عبر واجهات الراوتر، مما يمنع ضمان استمرارية الاتصال.',
            ...(resolutionOptions.length > 0 ? { resolutionOptions } : {}),
          });
          warnings.push({
            type: 'MANAGEMENT_PATH_INDETERMINATE',
            severity: 'CRITICAL',
            message: `عنوان الراوتر المسجل (${currentHost}) غير موجود على أي واجهة من واجهات الراوتر الحالية. قد يؤدي الاستمرار لفقدان الاتصال بالراوتر تماماً.`,
            suggestedAction: 'تأكد من عنوان IP الفعلي للراوتر أو أعد فحص الراوتر من الواجهة الصحيحة.',
          });
        } else if (mgmtTopo.isSevered) {
          if (mgmtTopo.conflictType === 'MANAGEMENT_PORT_BRIDGED') {
            if (!conflicts.some((c) => c.resource === 'MANAGEMENT_PORT_BRIDGED')) {
              conflicts.push({
                resource: 'MANAGEMENT_PORT_BRIDGED',
                existingValue: `${currentHost} معين مباشرة على المنفذ ${mgmtTopo.mgmtInterface}`,
                proposedValue: `ضم المنفذ ${mgmtTopo.mgmtInterface} إلى جسر المشتركين`,
                details: mgmtTopo.errorMessage || `ضم منفذ الإدارة المباشر (${mgmtTopo.mgmtInterface}) إلى جسر المشتركين يؤدي لفقدان الاتصال بالراوتر فورياً.`,
              });
            }
          } else if (mgmtTopo.conflictType === 'WAN_MANAGEMENT_LOCKOUT') {
            conflicts.push({
              resource: 'WAN_MANAGEMENT_LOCKOUT',
              existingValue: `عنوان الإدارة (${currentHost}) يقع على منفذ الإنترنت (${wanIfaceName})`,
              proposedValue: `حظر منافذ الإدارة على WAN`,
              details: mgmtTopo.errorMessage || 'تفعيل حظر منافذ الإدارة على منفذ WAN سيعزل النظام عن الراوتر تماماً.',
            });
          } else if (mgmtTopo.conflictType === 'MANAGEMENT_BRIDGE_DEPLETED') {
            conflicts.push({
              resource: 'MANAGEMENT_BRIDGE_DEPLETED',
              existingValue: `الجسر (${mgmtTopo.mgmtInterface}) الحامل لعنوان الإدارة (${currentHost}) يضم المنافذ [${mgmtTopo.bridgePhysicalPorts?.join(', ')}]`,
              proposedValue: `سحب كافة منافذ الجسر (${mgmtTopo.stolenBridgePorts?.join(', ')}) لمنافذ المشتركين أو الإنترنت`,
              details: mgmtTopo.errorMessage || `سحب كافة منافذ جسر الإدارة يفرغ الجسر (${mgmtTopo.mgmtInterface}) من أي منفذ فيزيائي، مما يعزل الراوتر ويفقد الاتصال به تماماً.`,
            });
            warnings.push({
              type: 'MANAGEMENT_BRIDGE_DEPLETED',
              severity: 'CRITICAL',
              message: `سحب كافة منافذ جسر الإدارة (${mgmtTopo.mgmtInterface}) سيؤدي لفقدان الاتصال بالراوتر تماماً.`,
              suggestedAction: 'أبقِ على الأقل منفذاً فيزيائياً واحداً داخل جسر الإدارة أو استخدم منفذاً مخصصاً للإدارة.',
            });
          }
        } else if (mgmtTopo.stolenBridgePorts && mgmtTopo.stolenBridgePorts.length > 0) {
          warnings.push({
            type: 'MANAGEMENT_BRIDGE_PORT_REMOVAL',
            severity: 'CRITICAL',
            message: `المنافذ [${mgmtTopo.stolenBridgePorts.join(', ')}] سيتم سحبها من جسر الإدارة الحالي (${mgmtTopo.mgmtInterface}). إذا كان اتصالك بالراوتر يتم عبر أحد هذه المنافذ سينقطع الاتصال.`,
            suggestedAction: `تأكد من أنك متصل بالراوتر عبر منفذ آخر مثل [${mgmtTopo.bridgePhysicalPorts?.filter((p) => !mgmtTopo.stolenBridgePorts?.includes(p)).join(', ')}].`,
          });
        }
      } catch (mgmtErr) {
        this.logger.warn(`[Preview Warning] Error during management path analysis: ${mgmtErr instanceof Error ? mgmtErr.message : String(mgmtErr)}`);
      }

      // Generate Planned Steps
      let plannedSteps: PlannedProvisioningStep[] = [];
      try {
        plannedSteps = this.buildPlannedSteps(dto);
      } catch (stepErr) {
        this.logger.warn(`[Preview Warning] Error building planned steps: ${stepErr instanceof Error ? stepErr.message : String(stepErr)}`);
      }

      const isV7 = (device.rosVersion || '').toUpperCase().includes('V7');

      // Build Security Policies Report
      let securityPoliciesReport: SecurityPolicyReportItem[] = [];
      try {
        securityPoliciesReport = this.buildSecurityPoliciesReport(dto, isV7, discovery);
      } catch (secErr) {
        this.logger.warn(`[Preview Warning] Error building security policies report: ${secErr instanceof Error ? secErr.message : String(secErr)}`);
      }

      // Generate RouterOS commands for preview (with duplicate prevention based on discovery)
      let generatedCommands: GeneratedCommandItem[] = [];
      const resolvedConflictKeys = new Set<string>();
      try {
        generatedCommands = this.generateRouterCommands(dto, isV7, discovery, effectiveDevice, resolvedConflictKeys);
      } catch (cmdErr) {
        this.logger.error(`[Preview Error] Error generating router commands: ${cmdErr instanceof Error ? cmdErr.message : String(cmdErr)}`);
        warnings.push({
          type: 'COMMANDS_GENERATION_PARTIAL',
          severity: 'WARNING',
          message: 'حدث تعذر جزئي أثناء توليد بعض الأوامر المتوافقة مع إعدادات الراوتر القديمة.',
        });
      }

      // Mask passwords for preview to prevent credentials leakage
      const sanitizedCommands = (generatedCommands || []).map((c) => ({
        ...c,
        command: this.sanitizeCommandForDisplay(c.command || ''),
      }));

      // Check if router has existing data (programmed / in-use router)
      const hasProgrammedData =
        (discovery.bridges?.length ?? 0) > 0 ||
        (discovery.hotspotServers?.length ?? 0) > 0 ||
        (discovery.dhcpServers?.length ?? 0) > 0 ||
        (discovery.ipAddresses?.length ?? 0) > 1;

      const rosVersion = (device.rosVersion || 'V7').toUpperCase();
      const bridgesCount = discovery.bridges?.length ?? 0;
      const hsCount = discovery.hotspotServers?.length ?? 0;
      const dhcpCount = discovery.dhcpServers?.length ?? 0;
      const ipsCount = discovery.ipAddresses?.length ?? 0;
      const interfacesCount = discovery.interfaces?.length ?? 0;

      // Mandatory diagnostic log for RouterOS 7 and router state
      this.logger.log(
        `[Preview Diagnosis] Router: "${device.name}" (${device.host}) | ROS Version: ${rosVersion} | ` +
          `Discovered: Bridges=${bridgesCount}, Hotspots=${hsCount}, DHCP=${dhcpCount}, IPs=${ipsCount}, Interfaces=${interfacesCount} | ` +
          `Template: ${dto.template} | Generated Commands: ${sanitizedCommands.length} | Planned Steps: ${plannedSteps.length}`,
      );

      // Rule 1: If router has existing data and commands count is 0 => Log reason and ensure non-zero commands
      if (hasProgrammedData && sanitizedCommands.length === 0) {
        const zeroReason = 'قالب الإعداد الحالي وجد تطابقاً في بعض الموارد السابقة دون توليد أوامر تعديل جديدة على RouterOS 7';
        this.logger.warn(
          `[Preview Diagnosis Zero Commands] Router "${device.name}" has existing data but 0 commands were generated. Reason: ${zeroReason}. Applying guaranteed commands.`,
        );

        // Guarantee non-empty commands by generating baseline provisioning commands
        const baselineCommands = this.generateRouterCommands(dto, isV7, this.normalizeSnapshot(undefined), device);
        for (const cmd of baselineCommands) {
          sanitizedCommands.push({
            ...cmd,
            command: this.sanitizeCommandForDisplay(cmd.command || ''),
          });
        }
      }

      const HARD_BLOCKING_CONFLICTS = new Set([
        'MANAGEMENT_PORT_BRIDGED',
        'MANAGEMENT_BRIDGE_DEPLETED',
        'MANAGEMENT_PATH_INDETERMINATE',
        'WAN_MANAGEMENT_LOCKOUT',
        'WAN_LAN_OVERLAP',
        'WAN_BRIDGE_CONFLICT',
      ]);

      const activeHardConflicts = conflicts.filter((c) => {
        if (HARD_BLOCKING_CONFLICTS.has(c.resource)) return true;
        if (dto.template === 'CLEAN_SETUP') {
          // Under CLEAN_SETUP, non-management direct IPs and subnet overlaps are ONLY resolved
          // if an exact, verified PRE_CLEANUP command was generated for that specific resource.
          if (c.resource === 'DIRECT_IP_PORT_BRIDGED') {
            const match = c.existingValue.match(/على المنفذ\s+(\S+)/);
            const port = match ? match[1] : '';
            if (port && resolvedConflictKeys.has(`DIRECT_IP_PORT_BRIDGED:${port}`)) {
              return false; // Safely resolved by PRE_CLEANUP
            }
            return true; // Not resolved or dynamic/management -> REMAINS HARD BLOCKING!
          }
          if (c.resource === 'IP_SUBNET_OVERLAP') {
            const match = c.existingValue.match(/^(\S+)\s+على المنفذ\s+\[(.*?)\]/);
            if (match) {
              const addr = match[1];
              const iface = match[2];
              if (resolvedConflictKeys.has(`IP_SUBNET_OVERLAP:${iface}:${addr}`)) {
                return false; // Safely resolved by PRE_CLEANUP
              }
            }
            return true; // Not resolved or dynamic/management -> REMAINS HARD BLOCKING!
          }
        }
        return true;
      });

      const activeHardConflictSet = new Set(activeHardConflicts);
      const annotatedConflicts = conflicts.map((c) => ({
        ...c,
        isOverridable: !HARD_BLOCKING_CONFLICTS.has(c.resource) && !activeHardConflictSet.has(c),
      }));

      const canProceed =
        activeHardConflicts.length === 0 &&
        sanitizedCommands.length > 0 &&
        plannedSteps.length > 0;

      const totalDuration = Date.now() - previewStartTime;
      this.logger.log(
        `[Preview Complete] Router "${device.name}" (${device.host}) finished in ${totalDuration}ms: ` +
          `${sanitizedCommands.length} commands, ${conflicts.length} conflicts (${activeHardConflicts.length} hard), ${warnings.length} warnings (RequiresCleanConfirmation: ${requiresCleanConfirmation}, CanProceed: ${canProceed})`,
      );

      const signService = this.planSigningService || new PlanSigningService();
      const expiresAt =
        (dto as any).planToken?.expiresAt &&
        new Date((dto as any).planToken.expiresAt).getTime() > Date.now()
          ? (dto as any).planToken.expiresAt
          : new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const signPayload = {
        tenantId,
        deviceId,
        sessionId: dto.sessionId,
        nonce: dto.nonce,
        fencingToken: (dto as any).fencingToken,
        snapshotHash: authoritativeSnapshotHash || dto.snapshotHash || '',
        expiresAt,
        commands: sanitizedCommands.map((c) => ({ stage: c.stage, command: c.command })),
      };
      const signResult = signService.signPlan(signPayload);
      const { commandsHash } = signService.buildCanonicalPayload(signPayload);

      return {
        template: dto.template,
        routerVersion: device.rosVersion || 'V7',
        discovery,
        plannedSteps,
        securityPoliciesReport,
        generatedCommands: sanitizedCommands,
        warnings,
        conflicts: annotatedConflicts,
        canProceed,
        requiresCleanConfirmation,
        backupRecommended: true,
        planToken: {
          tenantId,
          deviceId,
          sessionId: dto.sessionId || 'session-default',
          snapshotHash: authoritativeSnapshotHash || dto.snapshotHash || '',
          commandsHash,
          expiresAt,
          canonicalPayload: signResult.canonicalPayload,
          signature: signResult.signature,
          publicKey: signResult.publicKey,
        },
      };
    } catch (topLevelErr: unknown) {
      if (
        topLevelErr instanceof ConflictException ||
        topLevelErr instanceof NotFoundException ||
        topLevelErr instanceof BadRequestException ||
        topLevelErr instanceof BadGatewayException
      ) {
        throw topLevelErr;
      }
      const error = topLevelErr instanceof Error ? topLevelErr : new Error(String(topLevelErr));
      this.logger.error(
        `[Preview Failure] Unexpected error while generating preview for device ${deviceId}: ${error.message}`,
        error.stack,
      );
      throw new BadGatewayException({
        code: 'PREVIEW_GENERATION_FAILED',
        message: `تعذر إتمام خطة المعاينة للراوتر: ${error.message}`,
      });
    }
  }


  /**
   * Applies the provisioning changes step-by-step with structured logs and verification
   */
  async apply(
    tenantId: string,
    deviceId: string,
    dto: ProvisionApplyDto,
    _userId: string,
  ): Promise<ProvisioningApplyResult> {
    if (DevicesService.activeDeviceOperations.has(deviceId)) {
      throw new ConflictException({
        code: 'DEVICE_OPERATION_IN_PROGRESS',
        message: 'توجد عملية جارية حالياً (برمجة أو نسخ أو استعادة) على هذا الراوتر. يرجى الانتظار حتى اكتمالها.',
      });
    }

    DevicesService.activeDeviceOperations.add(deviceId);
    try {
      const device = await this.getValidDevice(tenantId, deviceId);
      const previewRes = await this.preview(tenantId, deviceId, dto);

    // Enforce safety validations
    if (previewRes.requiresCleanConfirmation && dto.cleanSetupConfirmed !== true) {
      throw new ConflictException({
        code: 'CLEAN_CONFIRMATION_REQUIRED',
        message:
          'يتطلب تطبيق الإعداد الكامل (Clean Setup) تأكيداً صريحاً بأنك توافق على تعديل شبكة الراوتر الحالي.',
        warnings: previewRes.warnings,
      });
    }

    // Critical Management Conflicts: CANNOT be bypassed by generic allowOverwrite!
    const criticalLockoutConflict = previewRes.conflicts.find(
      (c) =>
        c.resource === 'MANAGEMENT_PORT_BRIDGED' ||
        c.resource === 'MANAGEMENT_BRIDGE_DEPLETED' ||
        c.resource === 'MANAGEMENT_PATH_INDETERMINATE' ||
        c.resource === 'WAN_LAN_OVERLAP' ||
        c.resource === 'WAN_MANAGEMENT_LOCKOUT',
    );
    if (criticalLockoutConflict) {
      throw new ConflictException({
        code: 'CRITICAL_MANAGEMENT_CONFLICT_BLOCKED',
        message: `تم منع التنفيذ لحماية مسار إدارة الراوتر ومنع الانقطاع (Lockout): ${criticalLockoutConflict.details} لا يمكن تجاوز هذا التعارض الحرج عبر السماح بالتجاوز العام (allowOverwrite). يرجى استثناء المنفذ المعني من منافذ المشتركين.`,
        conflicts: [criticalLockoutConflict],
      });
    }

    if (!previewRes.canProceed && !dto.allowOverwrite) {
      throw new ConflictException({
        code: 'PROVISIONING_CANNOT_PROCEED',
        message: 'لا يمكن متابعة تنفيذ الإعداد لوجود تعارضات مانعة غير محلولة في خطة المعاينة.',
        conflicts: previewRes.conflicts,
      });
    }

    const unresolvedConflicts = previewRes.conflicts.filter((c) => {
      if (dto.template === 'CLEAN_SETUP' && dto.cleanSetupConfirmed) {
        if (c.resource === 'DIRECT_IP_PORT_BRIDGED' || c.resource === 'IP_SUBNET_OVERLAP') {
          return false;
        }
      }
      return true;
    });

    if (unresolvedConflicts.length > 0 && !dto.allowOverwrite) {
      throw new ConflictException({
        code: 'PROVISIONING_CONFLICTS_DETECTED',
        message: 'تم اكتشاف تعارضات في إعدادات الراوتر تمنع التنفيذ التلقائي دون إذن صريح.',
        conflicts: unresolvedConflicts,
      });
    }

    // =========================================================================
    // LOCAL EXECUTION MODE: Executed by mobile client directly on LAN
    // Prevents Render from attempting connection to RFC1918 private IPs
    // =========================================================================
    if (dto.executionMode === 'LOCAL') {
      const sessionKey = `${tenantId}:${deviceId}:${dto.sessionId || 'session-default'}`;
      if (this.appliedLocalSessions.has(sessionKey)) {
        throw new ConflictException({
          code: 'SESSION_REPLAY_DETECTED',
          message: 'تم تطبيق نتيجة هذه الجلسة مسبقاً على الراوتر، ولا يمكن إعادة استخدامها (Replay Attack Prevention).',
        });
      }

      if (previewRes.planToken) {
        const exp = new Date(previewRes.planToken.expiresAt).getTime();
        if (Date.now() > exp) {
          throw new ConflictException({
            code: 'PLAN_EXPIRED',
            message: 'انتهت صلاحية خطة البرمجة الموقعة (تجاوزت 30 دقيقة). يرجى إعادة فحص المعاينة.',
          });
        }
      }

      // Cryptographic verification of client-submitted planToken upon Apply
      if (dto.planToken) {
        const token = dto.planToken;
        if (token.tenantId && token.tenantId !== tenantId) {
          throw new ConflictException({
            code: 'CROSS_TENANT_PLAN_REJECTED',
            message: 'الخطة المقدمة تابعة لمستأجر آخر ولا يمكن تطبيقها على هذا الحساب.',
          });
        }
        if (token.deviceId && token.deviceId !== deviceId) {
          throw new ConflictException({
            code: 'WRONG_DEVICE_PLAN_REJECTED',
            message: 'الخطة المقدمة تم توقيعها لجهاز راوتر آخر ولا يمكن تطبيقها على هذا الجهاز.',
          });
        }
        if (token.expiresAt) {
          const expTime = new Date(token.expiresAt).getTime();
          if (Date.now() > expTime) {
            throw new ConflictException({
              code: 'PLAN_EXPIRED',
              message: 'انتهت صلاحية خطة البرمجة الموقعة (تجاوزت 30 دقيقة). يرجى إعادة فحص المعاينة.',
            });
          }
        }
        const signService = this.planSigningService || new PlanSigningService();

        // 1. Enforce trusted backend public key: Strictly reject any client-substituted or foreign public key
        if (token.publicKey && token.publicKey.toLowerCase() !== signService.getPublicKeyHex().toLowerCase()) {
          throw new ConflictException({
            code: 'UNTRUSTED_PUBLIC_KEY',
            message: 'المفتاح العام المرفق مع الخطة غير موثوق ولا يطابق المفتاح الرسمي المعتمد لـ SudaFi.',
          });
        }

        // 2. Reject untrusted canonical payload text from client: Re-verify against authoritative server-computed canonical payload
        if (previewRes.planToken?.canonicalPayload && token.canonicalPayload) {
          if (token.canonicalPayload !== previewRes.planToken.canonicalPayload) {
            throw new ConflictException({
              code: 'PLAN_PAYLOAD_MISMATCH',
              message: 'نص الخطة المعياري (Canonical Payload) لا يطابق الخطة المحسوبة على الخادم لهذا الجهاز.',
            });
          }
        }

        // 2b. Re-verify snapshot hash: Ensure router state did not drift between preview and apply
        if (token.snapshotHash && previewRes.planToken?.snapshotHash) {
          if (token.snapshotHash !== previewRes.planToken.snapshotHash) {
            throw new ConflictException({
              code: 'ROUTER_STATE_DRIFT_DETECTED',
              message: 'هاش لقطة الراوتر في الخطة لا يطابق الهاش المعتمد من الخادم (State Drift Detected). يرجى إعادة فحص المعاينة.',
            });
          }
        }

        // 3. Cryptographically verify signature against authoritative server canonical payload using SudaFi trusted public key
        const authoritativePayload = previewRes.planToken?.canonicalPayload || token.canonicalPayload;
        if (authoritativePayload && token.signature) {
          const isSigValid = signService.verifyPlan(authoritativePayload, token.signature);
          if (!isSigValid) {
            throw new ConflictException({
              code: 'PLAN_SIGNATURE_INVALID',
              message: 'فشل التحقق التشفيري من توقيع الخطة (Ed25519 Signature Invalid). تم التلاعب بالخطة أو توقيعها بمفتاح غير مصرح.',
            });
          }
        }
      }

      const clientRes = dto.clientExecutionResult || {};
      const backupFilename = clientRes.backupFilename;
      const executedStages: ExecutedStageLog[] = clientRes.executedStages || [];
      const verification: ProvisioningVerificationResult = clientRes.verification || {
        internetReachable: false,
        wanConfigured: false,
        defaultRouteActive: false,
        hotspotOperational: false,
        securityPoliciesVerified: false,
        pingPacketsReceived: 0,
        overallStatus: 'VERIFICATION_FAILED',
        diagnosticsMessage: clientRes.failureReason || 'لم يتم استلام تقرير تحقق صالح من الراوتر.',
      };

      const isFullyVerified =
        clientRes.success === true &&
        verification.overallStatus === 'VERIFIED_READY' &&
        verification.internetReachable === true &&
        verification.wanConfigured === true;

      if (clientRes.success === true) {
        this.appliedLocalSessions.add(sessionKey);

        try {
          const profileName = dto.hotspot?.profileName || 'hsp-sudafi';
          const validityStr = dto.hotspot?.defaultSessionTimeout || '1d';

          await this.prisma.hotspotProfile.upsert({
            where: {
              tenantId_deviceId_name: {
                tenantId,
                deviceId: device.id,
                name: profileName,
              },
            },
            create: {
              tenantId,
              deviceId: device.id,
              name: profileName,
              rateLimit: dto.hotspot?.defaultRateLimit || '2M/5M',
              sessionTimeout: validityStr,
              sharedUsers: 1,
            },
            update: {
              rateLimit: dto.hotspot?.defaultRateLimit || '2M/5M',
              sessionTimeout: validityStr,
            },
          });

          // Strict online promotion: update isOnline ONLY if router was physically verified
          await this.prisma.mikroTikDevice.update({
            where: { id: device.id },
            data: {
              isOnline: isFullyVerified,
              lastSyncAt: new Date(),
              ...(dto.updateRouterHostIfChanged && dto.lan?.gatewayIp
                ? { host: dto.lan.gatewayIp.split('/')[0] }
                : {}),
            },
          });
        } catch (syncErr) {
          this.logger.warn(`Failed to synchronize platform DB after client provisioning: ${syncErr}`);
        }
      }

      return {
        success: isFullyVerified,
        deviceId: device.id,
        deviceName: device.name,
        backupFilename,
        executedStages,
        failedStage: isFullyVerified ? undefined : (clientRes.failedStage || 'ROUTER_VERIFICATION'),
        failureReason: isFullyVerified ? undefined : (clientRes.failureReason || 'فشل التحقق الفعلي من إمكانية الوصول إلى الإنترنت أو الهوتسبوت بعد البرمجة.'),
        recoveryInstructions: clientRes.recoveryInstructions,
        verification,
      };
    }

    const client = await this.getConnectedClient(device);
    const executedStages: ExecutedStageLog[] = [];
    let backupFilename: string | undefined;

    // =========================================================================
    // STAGE 0: Pre-Execution State Drift & Precondition Verification
    // Verifies that live router state has not drifted since preview before any changes
    // =========================================================================
    const isV7 = (device.rosVersion || '').toUpperCase().includes('V7');
    const applyMgmtCtx = this.resolveEffectiveManagementContext(device.host || '', previewRes.discovery, dto);
    const effectiveApplyDevice = { ...device, host: applyMgmtCtx.effectiveHost };
    const commands = this.generateRouterCommands(dto, isV7, previewRes.discovery, effectiveApplyDevice);
    const cleanupCommands = commands.filter((c) => c.stage === 'PRE_CLEANUP');

    let liveIps: RouterIpAddressItem[] = [];
    let liveBridgePorts: RouterBridgePortItem[] = [];
    let liveBridges: any[] = [];
    let liveInterfaces: any[] = [];
    let liveRoutes: any[] = [];
    let liveDhcpClients: any[] = [];
    try {
      if (
        !client.listIpAddresses ||
        !client.listBridgePorts ||
        !client.listBridges ||
        !client.listInterfaces ||
        !client.listRoutes
      ) {
        throw new Error('العميل المتصل بالراوتر لا يدعم جميع دوال الفحص الحيوية المطلوبة (IP, Bridge, Ports, Interfaces, Routes).');
      }
      liveIps = await client.listIpAddresses();
      liveBridgePorts = await client.listBridgePorts();
      liveBridges = await client.listBridges();
      liveInterfaces = await client.listInterfaces();
      liveRoutes = await client.listRoutes();
      if (client.listDhcpClients) {
        try {
          liveDhcpClients = await client.listDhcpClients();
        } catch (_) {}
      }

      if (
        !Array.isArray(liveIps) ||
        !Array.isArray(liveBridgePorts) ||
        !Array.isArray(liveBridges) ||
        !Array.isArray(liveInterfaces) ||
        !Array.isArray(liveRoutes)
      ) {
        throw new Error('أحد أقسام حالة الراوتر الحية غير متوفر أو ليس مصفوفة صالحة.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Pre-Verification Error] Failed to read current router state: ${msg}`);
      return {
        success: false,
        deviceId: device.id,
        deviceName: device.name,
        executedStages,
        failedStage: 'PRE_VERIFICATION',
        failureReason: `فشل التحقق من حالة الراوتر الحالية قبل البدء بالتنفيذ: ${msg}`,
        recoveryInstructions: 'تحقق من اتصال الراوتر وأعد المحاولة.',
        verification: {
          internetReachable: false,
          wanConfigured: false,
          defaultRouteActive: false,
          hotspotOperational: false,
          securityPoliciesVerified: false,
          pingPacketsReceived: 0,
          overallStatus: 'VERIFICATION_FAILED',
          diagnosticsMessage: 'توقفت العملية قبل إجراء أي تعديل على الراوتر.',
        },
      };
    }

    // 0A. Verify targeted PRE_CLEANUP resources still exist and match expected state
    for (const cmdItem of cleanupCommands) {
      const idMatch = cmdItem.command.match(/=\.id=(\S+)/);
      const targetId = idMatch ? idMatch[1] : undefined;

      if (cmdItem.command.includes('/ip/address/remove')) {
        const matchedLiveIp = liveIps.find((ip) => ip.id === targetId);
        if (!matchedLiveIp) {
          this.logger.warn(`[State Drift] Targeted IP id (${targetId}) not found in live router state`);
          return {
            success: false,
            deviceId: device.id,
            deviceName: device.name,
            executedStages,
            failedStage: 'PRE_VERIFICATION',
            failureReason: `اكتشاف تغير في حالة الراوتر (State Drift): عنوان IP المستهدف للحذف بالمعرف (${targetId || 'غير محدد'}) لم يعد موجوداً في الراوتر. تم إيقاف التنفيذ فوراً قبل إجراء أي تعديل.`,
            recoveryInstructions: 'أعد فحص المعاينة (Preview) لمزامنة أحدث حالة للراوتر.',
            verification: {
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'VERIFICATION_FAILED',
              diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب تغير حالة الراوتر.',
            },
          };
        }

        // Check if address, interface, or dynamic status changed
        const originalIp = previewRes.discovery.ipAddresses.find((ip) => ip.id === targetId);
        if (!originalIp) {
          this.logger.warn(`[State Drift] Targeted IP id (${targetId}) was not present in original preview snapshot`);
          return {
            success: false,
            deviceId: device.id,
            deviceName: device.name,
            executedStages,
            failedStage: 'PRE_VERIFICATION',
            failureReason: `اكتشاف خطأ في هوية المورد (Pre-Cleanup Identity): عنوان IP بالمعرف (${targetId}) غير موجود في لقطة المعاينة الأصلية (Preview Snapshot). تم إيقاف التنفيذ فوراً لحماية الراوتر من حذف موارد غير معتمدة.`,
            recoveryInstructions: 'أعد فحص المعاينة (Preview) لمزامنة أحدث حالة للراوتر.',
            verification: {
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'VERIFICATION_FAILED',
              diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب غياب المورد الأصلي من المعاينة.',
            },
          };
        }

        if (originalIp.address !== matchedLiveIp.address || originalIp.interface !== matchedLiveIp.interface) {
          this.logger.warn(`[State Drift] Targeted IP value changed: original=${originalIp.address}@${originalIp.interface}, live=${matchedLiveIp.address}@${matchedLiveIp.interface}`);
          return {
            success: false,
            deviceId: device.id,
            deviceName: device.name,
            executedStages,
            failedStage: 'PRE_VERIFICATION',
            failureReason: `اكتشاف تغير في إعدادات الراوتر (State Drift): عنوان IP بالمعرف (${targetId}) تم تعديله (كان ${originalIp.address} على ${originalIp.interface}، والآن ${matchedLiveIp.address} على ${matchedLiveIp.interface}). تم إيقاف التنفيذ فوراً لحماية الراوتر.`,
            recoveryInstructions: 'أعد فحص المعاينة (Preview) لمراجعة التغييرات الجديدة.',
            verification: {
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'VERIFICATION_FAILED',
              diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب عدم تطابق قيم المورد.',
            },
          };
        }

        // Strict dynamic state matching: PRE_CLEANUP must never remove dynamic addresses
        const isLiveDynamic = matchedLiveIp.dynamic === true || (matchedLiveIp as any).dynamic === 'true';
        const wasOriginalDynamic = originalIp.dynamic === true || (originalIp as any).dynamic === 'true';
        if (isLiveDynamic || wasOriginalDynamic !== isLiveDynamic) {
          this.logger.warn(`[State Drift] Targeted IP dynamic state changed: id=${targetId}, wasDynamic=${wasOriginalDynamic}, liveDynamic=${isLiveDynamic}`);
          return {
            success: false,
            deviceId: device.id,
            deviceName: device.name,
            executedStages,
            failedStage: 'PRE_VERIFICATION',
            failureReason: `اكتشاف تغير في حالة عنوان IP (State Drift): عنوان IP بالمعرف (${targetId}) أصبح ديناميكياً (Dynamic) في الراوتر ولا يمكن حذفه تلقائياً. تم إيقاف التنفيذ فوراً لحماية الراوتر.`,
            recoveryInstructions: 'أعد فحص المعاينة (Preview) لمزامنة أحدث حالة للراوتر.',
            verification: {
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'VERIFICATION_FAILED',
              diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب تحول العنوان إلى ديناميكي.',
            },
          };
        }
      } else if (cmdItem.command.includes('/interface/bridge/port/remove')) {
        const matchedPort = liveBridgePorts.find((bp) => bp.id === targetId);
        if (!matchedPort) {
          this.logger.warn(`[State Drift] Targeted bridge port id (${targetId}) not found in live router state`);
          return {
            success: false,
            deviceId: device.id,
            deviceName: device.name,
            executedStages,
            failedStage: 'PRE_VERIFICATION',
            failureReason: `اكتشاف تغير في حالة الراوتر (State Drift): منفذ الجسر (${targetId}) لم يعد موجوداً. تم إيقاف التنفيذ فوراً قبل إجراء أي تعديل.`,
            recoveryInstructions: 'أعد فحص المعاينة (Preview) لمزامنة أحدث حالة للراوتر.',
            verification: {
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'VERIFICATION_FAILED',
              diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب تغير منافذ الجسور.',
            },
          };
        }

        const originalBp = previewRes.discovery.bridgePorts.find((bp) => bp.id === targetId);
        if (!originalBp) {
          this.logger.warn(`[State Drift] Targeted bridge port id (${targetId}) was not present in original preview snapshot`);
          return {
            success: false,
            deviceId: device.id,
            deviceName: device.name,
            executedStages,
            failedStage: 'PRE_VERIFICATION',
            failureReason: `اكتشاف خطأ في هوية المورد (Pre-Cleanup Identity): منفذ الجسر بالمعرف (${targetId}) غير موجود في لقطة المعاينة الأصلية (Preview Snapshot). تم إيقاف التنفيذ فوراً لحماية الراوتر من حذف موارد غير معتمدة.`,
            recoveryInstructions: 'أعد فحص المعاينة (Preview) لمزامنة أحدث حالة للراوتر.',
            verification: {
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'VERIFICATION_FAILED',
              diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب غياب منفذ الجسر من المعاينة.',
            },
          };
        }
          if (originalBp.interface !== matchedPort.interface) {
            this.logger.warn(`[State Drift] Targeted bridge port interface changed: original=${originalBp.interface}, live=${matchedPort.interface}`);
            return {
              success: false,
              deviceId: device.id,
              deviceName: device.name,
              executedStages,
              failedStage: 'PRE_VERIFICATION',
              failureReason: `اكتشاف تغير في إعدادات منفذ الجسر (State Drift): منفذ الجسر بالمعرف (${targetId}) تغيرت واجهته (كانت ${originalBp.interface} والآن ${matchedPort.interface}). تم إيقاف التنفيذ فوراً لحماية الراوتر.`,
              recoveryInstructions: 'أعد فحص المعاينة (Preview) لمزامنة أحدث حالة للراوتر.',
              verification: {
                internetReachable: false,
                wanConfigured: false,
                defaultRouteActive: false,
                hotspotOperational: false,
                securityPoliciesVerified: false,
                pingPacketsReceived: 0,
                overallStatus: 'VERIFICATION_FAILED',
                diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب تغير واجهة منفذ الجسر.',
              },
            };
          }
          if (originalBp.bridge !== matchedPort.bridge) {
            this.logger.warn(`[State Drift] Targeted bridge port bridge changed: original=${originalBp.bridge}, live=${matchedPort.bridge}`);
            return {
              success: false,
              deviceId: device.id,
              deviceName: device.name,
              executedStages,
              failedStage: 'PRE_VERIFICATION',
              failureReason: `اكتشاف تغير في عضوية الجسور وإعدادات منفذ الجسر (Bridge Membership Drift): منفذ الجسر بالمعرف (${targetId}) تغير الجسر المرتبط به (كان ${originalBp.bridge} والآن ${matchedPort.bridge}). تم إيقاف التنفيذ فوراً لحماية الراوتر.`,
              recoveryInstructions: 'أعد فحص المعاينة (Preview) لمزامنة أحدث حالة للراوتر.',
              verification: {
                internetReachable: false,
                wanConfigured: false,
                defaultRouteActive: false,
                hotspotOperational: false,
                securityPoliciesVerified: false,
                pingPacketsReceived: 0,
                overallStatus: 'VERIFICATION_FAILED',
                diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب تغير الجسر التابع له المنفذ.',
              },
            };
          }
        }
      }

    // 0B. Holistic WAN Topology & Independence Invariant
    const wanIfaceName = (dto.wan?.interface || 'ether1').trim();
    const rawMemberPorts = Array.isArray(dto.lan?.memberInterfaces) ? dto.lan.memberInterfaces : [];
    const memberPorts = rawMemberPorts.map((m: any) => (m ? String(m).trim() : '')).filter(Boolean);
    const proposedGateway = (dto.lan?.gatewayIp || '').trim();
    const proposedSubnet = this.extractSubnetBase(proposedGateway);

    const liveWanCheck = this.verifyWanTopology(
      {
        interfaces: liveInterfaces,
        ipAddresses: liveIps,
        bridgePorts: liveBridgePorts,
        bridges: liveBridges,
        routes: liveRoutes,
        dhcpClients: liveDhcpClients,
      },
      wanIfaceName,
      memberPorts,
      proposedSubnet,
      dto.wan?.mode,
    );

    if (!liveWanCheck.isValid) {
      this.logger.warn(`[State Drift] Live WAN topology compromised: ${liveWanCheck.failureReason}`);
      return {
        success: false,
        deviceId: device.id,
        deviceName: device.name,
        executedStages,
        failedStage: 'PRE_VERIFICATION',
        failureReason: `اكتشاف تغير حرج في مسار الإنترنت WAN (State Drift): ${liveWanCheck.failureReason}. تم إيقاف التنفيذ فوراً قبل إجراء أي تعديل.`,
        recoveryInstructions: 'تحقق من إعدادات منفذ WAN واستقلاليته عن منافذ المشتركين وأعد طلب المعاينة Preview.',
        verification: {
          internetReachable: false,
          wanConfigured: false,
          defaultRouteActive: false,
          hotspotOperational: false,
          securityPoliciesVerified: false,
          pingPacketsReceived: 0,
          overallStatus: 'VERIFICATION_FAILED',
          diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب تغير بنية WAN.',
        },
      };
    }

    // 0C. Re-verify Management Topology on Live State: Management path must remain determined & unsevered
    const liveMgmtCtx = this.resolveEffectiveManagementContext(
      device.host || '',
      { ipAddresses: liveIps, interfaces: liveInterfaces },
      dto,
    );
    const currentHost = liveMgmtCtx.effectiveHost;
    const protectWanAccess = !!(dto.securityPolicies as any)?.protectWanAccess;

    const liveMgmtTopo = this.resolveManagementTopology(
      {
        ipAddresses: liveIps,
        bridgePorts: liveBridgePorts,
        bridges: liveBridges,
        interfaces: liveInterfaces,
      },
      currentHost,
      memberPorts,
      wanIfaceName,
      protectWanAccess,
      liveMgmtCtx.overrideMgmtInterface,
    );

    if (!liveMgmtTopo.isDetermined || liveMgmtTopo.isSevered) {
      this.logger.warn(`[State Drift] Live management path compromised: ${liveMgmtTopo.errorMessage}`);
      return {
        success: false,
        deviceId: device.id,
        deviceName: device.name,
        executedStages,
        failedStage: 'PRE_VERIFICATION',
        failureReason: `اكتشاف تغير حرج في مسار الإدارة (State Drift): ${liveMgmtTopo.errorMessage || 'تعذر إثبات مسار الإدارة في حالة الراوتر الحية'}. تم إيقاف التنفيذ فوراً لحماية الراوتر من الانعزال.`,
        recoveryInstructions: 'تحقق من مسار الإدارة النشط للراوتر وأعد طلب المعاينة Preview.',
        verification: {
          internetReachable: false,
          wanConfigured: false,
          defaultRouteActive: false,
          hotspotOperational: false,
          securityPoliciesVerified: false,
          pingPacketsReceived: 0,
          overallStatus: 'VERIFICATION_FAILED',
          diagnosticsMessage: 'توقف الإعداد لحماية مسار إدارة الراوتر من الانقطاع.',
        },
      };
    }

    // 0D. Default Route Invariant: If preview had default route, live router must still have it with matching gateway
    const previewRoutes = previewRes.discovery.routes || [];
    const previewDefaultRoute = previewRoutes.find(
      (r: any) => r?.dstAddress === '0.0.0.0/0' || r?.['dst-address'] === '0.0.0.0/0',
    );
    if (previewDefaultRoute) {
      const liveDefaultRoute = (liveRoutes || []).find(
        (r: any) => r?.dstAddress === '0.0.0.0/0' || r?.['dst-address'] === '0.0.0.0/0',
      );
      if (!liveDefaultRoute) {
        this.logger.warn('[State Drift] Default route (0.0.0.0/0) vanished in live router state!');
        return {
          success: false,
          deviceId: device.id,
          deviceName: device.name,
          executedStages,
          failedStage: 'PRE_VERIFICATION',
          failureReason: 'اكتشاف تغير في المسار الافتراضي (Default Route Drift): مسار الإنترنت 0.0.0.0/0 لم يعد موجوداً في الراوتر.',
          recoveryInstructions: 'تحقق من اتصال الإنترنت الافتراضي للراوتر وأعد طلب المعاينة Preview.',
          verification: {
            internetReachable: false,
            wanConfigured: false,
            defaultRouteActive: false,
            hotspotOperational: false,
            securityPoliciesVerified: false,
            pingPacketsReceived: 0,
            overallStatus: 'VERIFICATION_FAILED',
            diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب اختفاء المسار الافتراضي.',
          },
        };
      }

      const prevGw = (previewDefaultRoute.gateway || (previewDefaultRoute as any)['gateway-status'] || '').trim();
      const liveGw = (liveDefaultRoute.gateway || (liveDefaultRoute as any)['gateway-status'] || '').trim();
      if (prevGw && liveGw && prevGw !== liveGw) {
        this.logger.warn(`[State Drift] Default route gateway changed: prev=${prevGw}, live=${liveGw}`);
        return {
          success: false,
          deviceId: device.id,
          deviceName: device.name,
          executedStages,
          failedStage: 'PRE_VERIFICATION',
          failureReason: `اكتشاف تغير في بوابة المسار الافتراضي (Default Route Gateway Drift): البوابة كانت (${prevGw}) وتغيرت إلى (${liveGw}). تم إيقاف التنفيذ فوراً.`,
          recoveryInstructions: 'أعد فحص المعاينة (Preview) لمراجعة مسار الإنترنت.',
          verification: {
            internetReachable: false,
            wanConfigured: false,
            defaultRouteActive: false,
            hotspotOperational: false,
            securityPoliciesVerified: false,
            pingPacketsReceived: 0,
            overallStatus: 'VERIFICATION_FAILED',
            diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب تغير بوابة المسار الافتراضي.',
          },
        };
      }
    }

    // 0E. Bridge Membership Drift: Verify that no member port joined another bridge between preview and apply
    for (const port of memberPorts) {
      const previewBp = (previewRes.discovery.bridgePorts || []).find((bp) => bp?.interface === port);
      const liveBp = liveBridgePorts.find((bp) => bp?.interface === port);
      if (liveBp && (!previewBp || liveBp.bridge !== previewBp.bridge)) {
        this.logger.warn(
          `[State Drift] Port ${port} bridge membership changed: prev=${previewBp?.bridge || 'none'}, live=${liveBp.bridge}`,
        );
        return {
          success: false,
          deviceId: device.id,
          deviceName: device.name,
          executedStages,
          failedStage: 'PRE_VERIFICATION',
          failureReason: `اكتشاف تغير في عضوية الجسور (Bridge Membership Drift): المنفذ (${port}) تغيرت عضويته في الجسور بعد المعاينة (أصبح في الجسر [${liveBp.bridge}]). تم إيقاف التنفيذ فوراً لحماية الراوتر.`,
          recoveryInstructions: 'أعد فحص المعاينة (Preview) لمزامنة أحدث حالة للراوتر.',
          verification: {
            internetReachable: false,
            wanConfigured: false,
            defaultRouteActive: false,
            hotspotOperational: false,
            securityPoliciesVerified: false,
            pingPacketsReceived: 0,
            overallStatus: 'VERIFICATION_FAILED',
            diagnosticsMessage: 'توقف الإعداد قبل تنفيذ أي أمر بسبب تغير عضوية الجسور.',
          },
        };
      }
    }

    // =========================================================================
    // STAGE 1: Automatic Pre-Configuration Backup
    // =========================================================================
    const nowStr = new Date().toISOString().replace(/[:.]/g, '-');
    const safeBackupName = (dto.customBackupName || `pre-sudafi-${nowStr}`).substring(0, 30);

    try {
      if (client.createBackup) {
        const backupPassword =
          (dto as any).customBackupPassword ||
          this.encryptionService.deriveDeterministicSecret(
            `sudafi-router-backup:${tenantId}:${device.id}`,
            24,
          );
        const backupRes = await client.createBackup(safeBackupName, backupPassword);
        backupFilename = backupRes.filename;
        executedStages.push({
          stage: 'PRE_BACKUP',
          command: `/system backup save name=${safeBackupName} password=******`,
          status: 'SUCCESS',
          timestamp: new Date().toISOString(),
        });
        this.logger.log(`Created encrypted pre-provisioning backup "${backupFilename}" on device "${device.name}"`);
      } else if (!dto.skipBackupOnError) {
        throw new Error('العميل الحالي لا يدعم إنشاء نسخة احتياطية آمنة (createBackup method unavailable)');
      } else {
        executedStages.push({
          stage: 'PRE_BACKUP',
          status: 'SKIPPED',
          error: 'Client does not support createBackup method (skipped explicitly)',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (bErr) {
      const bMsg = bErr instanceof Error ? bErr.message : String(bErr);
      executedStages.push({
        stage: 'PRE_BACKUP',
        status: 'FAILED',
        error: bMsg,
        timestamp: new Date().toISOString(),
      });

      if (!dto.skipBackupOnError) {
        return {
          success: false,
          deviceId: device.id,
          deviceName: device.name,
          executedStages,
          failedStage: 'PRE_BACKUP',
          failureReason: `فشل أخذ نسخة احتياطية آمنة قبل تطبيق الإعدادات: ${bMsg}. تم إيقاف العملية تلقائياً لمنع أي أضرار بالراوتر.`,
          recoveryInstructions: 'تحقق من المساحة المتوفرة في ذاكرة الراوتر (Disk Space) أو فعّل تجاوز النسخ الاحتياطي بحذر.',
          verification: {
            internetReachable: false,
            wanConfigured: false,
            defaultRouteActive: false,
            hotspotOperational: false,
            securityPoliciesVerified: false,
            pingPacketsReceived: 0,
            overallStatus: 'VERIFICATION_FAILED',
            diagnosticsMessage: 'توقفت العملية قبل إجراء أي تعديل على الراوتر.',
          },
        };
      }
    }

    // =========================================================================
    // STAGE 2: Execute Commands Step-by-Step
    // =========================================================================
    for (const item of commands) {
      try {
        const words = this.commandStringToWords(item.command);
        if (client.runRawCommand) {
          await client.runRawCommand(words);
        }
        executedStages.push({
          stage: item.stage,
          command: this.sanitizeCommandForDisplay(item.command),
          status: 'SUCCESS',
          timestamp: new Date().toISOString(),
        });
      } catch (cmdErr: any) {
        const errMsg = cmdErr instanceof Error ? cmdErr.message : String(cmdErr);
        // Idempotent error handling: if resource already exists or identical, continue safely
        if (
          errMsg.includes('already exists') ||
          errMsg.includes('already have') ||
          errMsg.includes('failure: already')
        ) {
          // Special verification for HOTSPOT_PROFILE: Do NOT silently accept if speed differs or cannot be verified!
          if (item.stage === 'HOTSPOT_PROFILE' && item.command.includes('/ip/hotspot/user/profile/add')) {
            const hsProfileName = dto.hotspot?.profileName || 'hsp-sudafi';
            const desiredRateLimit = dto.hotspot?.defaultRateLimit || '2M/5M';
            let matchedProfile: HotspotProfileItem | undefined;
            if (client.listHotspotProfiles) {
              try {
                const profiles = await client.listHotspotProfiles();
                matchedProfile = profiles.find((p) => p.name === hsProfileName);
              } catch (_) {}
            }

            if (!matchedProfile) {
              executedStages.push({
                stage: item.stage,
                command: this.sanitizeCommandForDisplay(item.command),
                status: 'FAILED',
                error: `تعذر التحقق من خصائص البروفايل الموجود مسبقاً (${hsProfileName}) بعد ظهور خطأ already exists`,
                timestamp: new Date().toISOString(),
              });
              this.logger.error(`Provisioning halted: Profile ${hsProfileName} already exists but cannot be verified.`);
              return {
                success: false,
                deviceId: device.id,
                deviceName: device.name,
                backupFilename,
                executedStages,
                failedStage: item.stage,
                failureReason: `البروفايل (${hsProfileName}) موجود مسبقاً على الراوتر وتعذر التحقق من خصائصه وسرعته الفعلية.`,
                recoveryInstructions: backupFilename
                  ? `يمكنك استعادة النسخة الاحتياطية (${backupFilename}) أو مراجعة بروفايلات الهوتسبوت يدوياً.`
                  : 'راجع إعدادات الراوتر يدوياً.',
                verification: {
                  internetReachable: false,
                  wanConfigured: false,
                  defaultRouteActive: false,
                  hotspotOperational: false,
                  pingPacketsReceived: 0,
                  securityPoliciesVerified: false,
                  overallStatus: 'VERIFICATION_FAILED',
                  diagnosticsMessage: `توقف الإعداد عند مرحلة [${item.stage}].`,
                },
              };
            }

            const currentRate = matchedProfile.rateLimit ? matchedProfile.rateLimit.trim() : '';
            const rateMatches = currentRate === desiredRateLimit.trim();
            if (rateMatches) {
              executedStages.push({
                stage: item.stage,
                command: this.sanitizeCommandForDisplay(item.command),
                status: 'SUCCESS',
                error: `Notice: البروفايل (${hsProfileName}) موجود مسبقاً وتطابقت خصائصه وسرعته الفعلية (${desiredRateLimit})`,
                timestamp: new Date().toISOString(),
              });
            } else {
              // Attempt safe explicit update
              try {
                if (client.updateHotspotProfile) {
                  await client.updateHotspotProfile(hsProfileName, { rateLimit: desiredRateLimit });
                } else if (client.runRawCommand) {
                  const setWords = this.commandStringToWords(
                    `/ip/hotspot/user/profile/set =numbers=${hsProfileName}${matchedProfile.id ? ` =.id=${matchedProfile.id}` : ''} =rate-limit=${desiredRateLimit}`,
                  );
                  await client.runRawCommand(setWords);
                } else {
                  throw new Error('العميل لا يدعم تحديث بروفايل الهوتسبوت');
                }

                // Verify update took effect on router
                if (client.listHotspotProfiles) {
                  const recheckProfiles = await client.listHotspotProfiles();
                  const updatedProf = recheckProfiles.find((p) => p.name === hsProfileName);
                  if (updatedProf && updatedProf.rateLimit && updatedProf.rateLimit.trim() !== desiredRateLimit.trim()) {
                    throw new Error(`لم يقم الراوتر بتطبيق السرعة الجديدة (السرعة الحالية: ${updatedProf.rateLimit}، المطلوبة: ${desiredRateLimit})`);
                  }
                }

                executedStages.push({
                  stage: item.stage,
                  command: this.sanitizeCommandForDisplay(item.command),
                  status: 'SUCCESS',
                  error: `Notice: تم تحديث البروفايل الموجود مسبقاً بنجاح وتأكيد السرعة المطلوبة (${desiredRateLimit}) من الراوتر`,
                  timestamp: new Date().toISOString(),
                });
              } catch (updateErr: any) {
                const uMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);
                executedStages.push({
                  stage: item.stage,
                  command: this.sanitizeCommandForDisplay(item.command),
                  status: 'FAILED',
                  error: `فشل تحديث سرعة البروفايل الموجود مسبقاً (${hsProfileName}) من (${currentRate || 'افتراضية'}) إلى (${desiredRateLimit}): ${uMsg}`,
                  timestamp: new Date().toISOString(),
                });
                return {
                  success: false,
                  deviceId: device.id,
                  deviceName: device.name,
                  backupFilename,
                  executedStages,
                  failedStage: item.stage,
                  failureReason: `تعارض في سرعة البروفايل: البروفايل (${hsProfileName}) موجود مسبقاً بسرعة مختلفة وفشل تحديثه (${uMsg}).`,
                  recoveryInstructions: backupFilename
                    ? `يمكنك استعادة النسخة الاحتياطية (${backupFilename}).`
                    : 'راجع إعدادات الراوتر.',
                  verification: {
                    internetReachable: false,
                    wanConfigured: false,
                    defaultRouteActive: false,
                    hotspotOperational: false,
                    pingPacketsReceived: 0,
                    securityPoliciesVerified: false,
                    overallStatus: 'VERIFICATION_FAILED',
                    diagnosticsMessage: `توقف الإعداد عند مرحلة [${item.stage}]: فشل تحديث سرعة البروفايل.`,
                  },
                };
              }
            }
          } else {
            executedStages.push({
              stage: item.stage,
              command: this.sanitizeCommandForDisplay(item.command),
              status: 'SUCCESS',
              error: `Notice: Existing entry adapted (${errMsg})`,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          executedStages.push({
            stage: item.stage,
            command: this.sanitizeCommandForDisplay(item.command),
            status: 'FAILED',
            error: errMsg,
            timestamp: new Date().toISOString(),
          });

          this.logger.error(
            `Provisioning halted on device "${device.name}" during stage ${item.stage}: ${errMsg}`,
          );

          return {
            success: false,
            deviceId: device.id,
            deviceName: device.name,
            backupFilename,
            executedStages,
            failedStage: item.stage,
            failureReason: `تعذر تطبيق الأمر [${this.sanitizeCommandForDisplay(item.command)}]: ${errMsg}`,
            recoveryInstructions: backupFilename
              ? `تم أخذ نسخة احتياطية مسبقاً باسم [${backupFilename}]. يمكنك استعادتها مباشرة عبر قائمة النسخ الاحتياطية أو WinBox.`
              : 'لم يتم حفظ نسخة احتياطية. راجع سجل الأوامر المنفذة وتأكد من صلاحيات مستخدم الراوتر.',
            verification: {
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'PARTIALLY_VERIFIED',
              diagnosticsMessage: `توقف الإعداد عند مرحلة [${item.stage}].`,
            },
          };
        }
      }
    }

    // =========================================================================
    // STAGE 3: Multi-Point Verification
    // =========================================================================
    const verification = await this.verifyProvisioning(client, dto);

    // =========================================================================
    // STAGE 4: Platform & DB Synchronization
    // =========================================================================
    try {
      const profileName = dto.hotspot?.profileName || 'hsp-sudafi';
      const validityStr = dto.hotspot?.defaultSessionTimeout || '1d';

      // Upsert default profile in SudaFi so cards can be generated immediately
      await this.prisma.hotspotProfile.upsert({
        where: {
          tenantId_deviceId_name: {
            tenantId,
            deviceId: device.id,
            name: profileName,
          },
        },
        create: {
          tenantId,
          deviceId: device.id,
          name: profileName,
          rateLimit: dto.hotspot?.defaultRateLimit || '2M/5M',
          sessionTimeout: validityStr,
          sharedUsers: 1,
        },
        update: {
          rateLimit: dto.hotspot?.defaultRateLimit || '2M/5M',
          sessionTimeout: validityStr,
        },
      });

      // Update router last seen and online status
      await this.prisma.mikroTikDevice.update({
        where: { id: device.id },
        data: {
          isOnline: true,
          lastSyncAt: new Date(),
          ...(dto.updateRouterHostIfChanged && dto.lan.gatewayIp
            ? { host: dto.lan.gatewayIp.split('/')[0] }
            : {}),
        },
      });
    } catch (syncErr) {
      this.logger.warn(`Failed to synchronize platform DB after provisioning: ${syncErr}`);
    }

    return {
      success: true,
      deviceId: device.id,
      deviceName: device.name,
      backupFilename,
      executedStages,
      verification,
    };
    } finally {
      DevicesService.activeDeviceOperations.delete(deviceId);
    }
  }

  /**
   * Verifies multiple aspects: WAN, Default Route, Ping, and Hotspot operational state
   */
  private async verifyProvisioning(
    client: IMikrotikClient,
    dto: ProvisionPreviewDto,
  ): Promise<ProvisioningVerificationResult> {
    let wanConfigured = false;
    let defaultRouteActive = false;
    let hotspotOperational = false;
    let profileSpeedVerified = true;
    let pingPacketsReceived = 0;

    // 1. Verify WAN IP / Interface status
    try {
      if (client.listIpAddresses) {
        const ips = await client.listIpAddresses();
        const wanIp = ips.find((ip) => ip.interface === dto.wan.interface && !ip.disabled);
        if (wanIp || dto.wan.mode === 'DHCP') {
          wanConfigured = true;
        }
      }
      if (dto.wan.mode === 'DHCP' && client.listDhcpClients) {
        const dhcps = await client.listDhcpClients();
        const activeDhcp = dhcps.find((d) => d.interface === dto.wan.interface && !d.disabled);
        if (activeDhcp && (activeDhcp.status === 'bound' || activeDhcp.address)) {
          wanConfigured = true;
        }
      }
    } catch (_) {}

    // 2. Verify Default Route
    try {
      if (client.listRoutes) {
        const routes = await client.listRoutes();
        const defRoute = routes.find(
          (r) => (r.dstAddress === '0.0.0.0/0' || r.dstAddress === '0.0.0.0') && !r.disabled,
        );
        if (defRoute) {
          defaultRouteActive = true;
        }
      }
    } catch (_) {}

    // 3. Multi-destination Ping test (Google DNS & Cloudflare DNS)
    let isReachable = false;
    try {
      if (client.pingHost) {
        const pingRes = await client.pingHost('8.8.8.8', 3);
        pingPacketsReceived = pingRes.packetsReceived;
        isReachable = pingRes.isReachable;

        // Fallback to 1.1.1.1 if 8.8.8.8 had no replies
        if (!isReachable) {
          const pingBackup = await client.pingHost('1.1.1.1', 2);
          if (pingBackup.isReachable) {
            pingPacketsReceived += pingBackup.packetsReceived;
            isReachable = true;
          }
        }
      }
    } catch (_) {}

    // 4. Verify Hotspot Server is running and valid
    try {
      if (client.listHotspotServers) {
        const servers = await client.listHotspotServers();
        const hsServerName = dto.hotspot?.serverName || 'hs-sudafi';
        const targetServer = servers.find((s) => s.name === hsServerName || s.interface === (dto.lan.bridgeName || 'bridge-hotspot'));
        if (targetServer && !targetServer.disabled && !targetServer.invalid) {
          hotspotOperational = true;
        }
      }
      if (client.listHotspotProfiles) {
        const profiles = await client.listHotspotProfiles();
        const hsProfileName = dto.hotspot?.profileName || 'hsp-sudafi';
        const targetProf = profiles.find((p) => p.name === hsProfileName);
        const desiredRateLimit = dto.hotspot?.defaultRateLimit || '2M/5M';
        if (targetProf && targetProf.rateLimit && targetProf.rateLimit.trim() !== desiredRateLimit.trim()) {
          profileSpeedVerified = false;
        }
      }
    } catch (_) {}

    // 5. Verify Security Policies against actual router configuration
    let securityPoliciesVerified = true;
    try {
      if (dto.securityPolicies?.antiTethering !== false && client.listMangleRules) {
        const mangle = await client.listMangleRules();
        const hasTtlRule = mangle.some(
          (r) =>
            !r.disabled &&
            (r.comment === 'SudaFi_Anti_Tethering_TTL' ||
              (r.chain === 'postrouting' && r.action === 'change-ttl')),
        );
        if (!hasTtlRule) {
          securityPoliciesVerified = false;
        }
      }

      if (dto.securityPolicies?.protectManagementAccess !== false && client.listFilterRules) {
        const filters = await client.listFilterRules();
        const hasAdminDrop = filters.some(
          (r) =>
            !r.disabled &&
            (r.comment === 'SudaFi_Drop_Subscriber_Admin_Ports' ||
              (r.chain === 'input' && r.action === 'drop')),
        );
        if (!hasAdminDrop) {
          securityPoliciesVerified = false;
        }
      }
    } catch (_) {
      securityPoliciesVerified = false;
    }

    // 6. Verify Captive Portal Files presence (login.html and alogin.html)
    let portalFilesVerified = true;
    const htmlDir = dto.hotspot?.htmlDirectory || 'hotspot';
    try {
      if (typeof (client as any).executeCommand === 'function') {
        const fileRes = await (client as any).executeCommand(['/file/print']);
        const fileRecs = (fileRes || []).filter((r: any) => r.type === '!re');
        if (fileRecs.length > 0) {
          const names: string[] = fileRecs.map((r: any) => r.attributes?.['name'] ?? '');
          const hasLogin = names.some(
            (f) =>
              f === `${htmlDir}/login.html` ||
              f === `flash/${htmlDir}/login.html` ||
              f.endsWith(`/${htmlDir}/login.html`) ||
              f.endsWith('/login.html'),
          );
          const hasAlogin = names.some(
            (f) =>
              f === `${htmlDir}/alogin.html` ||
              f === `flash/${htmlDir}/alogin.html` ||
              f.endsWith(`/${htmlDir}/alogin.html`) ||
              f.endsWith('/alogin.html'),
          );
          if (!hasLogin || !hasAlogin) {
            portalFilesVerified = false;
          }
        }
      }
    } catch (_) {}

    let overallStatus: 'VERIFIED_READY' | 'PARTIALLY_VERIFIED' | 'VERIFICATION_FAILED' =
      'VERIFICATION_FAILED';
    let diagnosticsMessage = '';

    if (
      isReachable &&
      hotspotOperational &&
      wanConfigured &&
      defaultRouteActive &&
      securityPoliciesVerified &&
      profileSpeedVerified &&
      portalFilesVerified
    ) {
      overallStatus = 'VERIFIED_READY';
      diagnosticsMessage = 'تم التحقق بنجاح: الإنترنت يعمل وخادم الهوتسبوت جاهز ومفعل وملفات البوابة وسياسات الأمان مطبقة بالكامل.';
    } else if (hotspotOperational) {
      overallStatus = 'PARTIALLY_VERIFIED';
      if (!profileSpeedVerified) {
        diagnosticsMessage = `تم تفعيل خادم الهوتسبوت لكن سرعة البروفايل على الراوتر لا تطابق السرعة المطلوبة (${dto.hotspot?.defaultRateLimit || '2M/5M'}).`;
      } else if (!portalFilesVerified) {
        diagnosticsMessage = 'تم تفعيل خادم الهوتسبوت والإنترنت بنجاح، ولكن ملفات البوابة الأساسية (login.html / alogin.html) غير موجودة بالمجلد المحدد على الراوتر.';
      } else if (!securityPoliciesVerified) {
        diagnosticsMessage = 'تم تفعيل خادم الهوتسبوت والإنترنت، ولكن لم يتم التأكد من اكتمال تطبيق كافة سياسات الأمان على الراوتر.';
      } else if (isReachable) {
        diagnosticsMessage = 'خادم الهوتسبوت يعمل والإنترنت متصل.';
      } else {
        diagnosticsMessage = 'تم تفعيل خادم الهوتسبوت بنجاح، ولكن تعذر الوصول إلى الإنترنت الخارجي عبر منفذ WAN.';
      }
    } else {
      overallStatus = 'VERIFICATION_FAILED';
      diagnosticsMessage = 'فشل التحقق من عمل خادم الهوتسبوت أو الإنترنت بعد التثبيت.';
    }

    return {
      internetReachable: isReachable,
      wanConfigured,
      defaultRouteActive,
      hotspotOperational,
      securityPoliciesVerified,
      profileSpeedVerified,
      portalFilesVerified,
      pingPacketsReceived,
      overallStatus,
      diagnosticsMessage,
    };
  }

  /**
   * Recursively traces any interface (Bridge, VLAN, Bonding, Physical) down to its underlying physical Ethernet ports.
   * Rejects cycles, unknown interfaces, virtual interfaces without physical backing, and bridges with 0 ports.
   */
  private traceToPhysicalPorts(
    ifaceName: string,
    discovery: {
      interfaces?: any[];
      bridges?: any[];
      bridgePorts?: any[];
    },
    visited: Set<string> = new Set(),
    depth = 0,
  ): {
    success: boolean;
    physicalPorts: string[];
    chain: string[];
    failureReason?: string;
  } {
    const cleanName = (ifaceName || '').trim();
    if (!cleanName) {
      return { success: false, physicalPorts: [], chain: [], failureReason: 'اسم الواجهة فارغ أو غير محدد.' };
    }
    if (visited.has(cleanName)) {
      return {
        success: false,
        physicalPorts: [],
        chain: [cleanName],
        failureReason: `اكتشاف حلقة تكرار دائرية (Cyclic loop) في بنية الواجهات عند الواجهة (${cleanName}).`,
      };
    }
    if (depth > 8) {
      return {
        success: false,
        physicalPorts: [],
        chain: [cleanName],
        failureReason: `تجاوز الحد الأقصى لعمق الواجهات المتداخلة (Max depth exceeded) عند (${cleanName}).`,
      };
    }

    const nextVisited = new Set(visited);
    nextVisited.add(cleanName);

    const ifaceList = discovery.interfaces || [];
    const ifaceObj = ifaceList.find((i) => i?.name === cleanName);
    const ifaceType = ifaceObj?.type ? String(ifaceObj.type).toLowerCase() : undefined;

    // 1. Is it a Bridge?
    const isBridge = (discovery.bridges || []).some((b) => b?.name === cleanName) || ifaceType === 'bridge';
    if (isBridge) {
      const bridgePorts = (discovery.bridgePorts || [])
        .filter((bp) => bp?.bridge === cleanName)
        .map((bp) => (bp?.interface || '').trim())
        .filter(Boolean);

      if (bridgePorts.length === 0) {
        return {
          success: false,
          physicalPorts: [],
          chain: [cleanName],
          failureReason: `الجسر (${cleanName}) لا يحتوي على أي منافذ تابعة (Zero member ports)، مما يمنع إثبات الوصول الفيزيائي.`,
        };
      }

      const allPhysical: string[] = [];
      const subChains: string[] = [cleanName];

      for (const bp of bridgePorts) {
        const sub = this.traceToPhysicalPorts(bp, discovery, nextVisited, depth + 1);
        if (!sub.success || sub.physicalPorts.length === 0) {
          return {
            success: false,
            physicalPorts: [],
            chain: [cleanName, ...sub.chain],
            failureReason: `فشل تتبع المنفذ التابع (${bp}) للجسر (${cleanName}): ${sub.failureReason || 'منفذ مجهول أو غير فيزيائي'}`,
          };
        }
        allPhysical.push(...sub.physicalPorts);
        subChains.push(...sub.chain);
      }

      return {
        success: true,
        physicalPorts: Array.from(new Set(allPhysical)),
        chain: Array.from(new Set(subChains)),
      };
    }

    // 2. Is it a VLAN?
    const isVlan = ifaceType === 'vlan' || (ifaceObj && ('vlan-id' in ifaceObj || 'vlanId' in ifaceObj));
    if (isVlan) {
      const parentIface = (
        ifaceObj?.parentInterface ||
        (ifaceObj as any)?.interface ||
        (ifaceObj as any)?.['vlan-interface'] ||
        ''
      ).trim();

      if (!parentIface) {
        return {
          success: false,
          physicalPorts: [],
          chain: [cleanName],
          failureReason: `تعذر تحديد الواجهة الأم للـ VLAN (${cleanName}).`,
        };
      }

      const parentExists = ifaceList.some((i) => i?.name === parentIface) || (discovery.bridges || []).some((b) => b?.name === parentIface);
      if (!parentExists) {
        return {
          success: false,
          physicalPorts: [],
          chain: [cleanName, parentIface],
          failureReason: `الواجهة الأم (${parentIface}) للـ VLAN (${cleanName}) غير موجودة في واجهات الراوتر المستكشفة.`,
        };
      }

      const parentTrace = this.traceToPhysicalPorts(parentIface, discovery, nextVisited, depth + 1);
      if (!parentTrace.success) {
        return {
          success: false,
          physicalPorts: [],
          chain: [cleanName, ...parentTrace.chain],
          failureReason: `فشل تتبع الواجهة الأم (${parentIface}) للـ VLAN (${cleanName}): ${parentTrace.failureReason}`,
        };
      }

      return {
        success: true,
        physicalPorts: parentTrace.physicalPorts,
        chain: [cleanName, ...parentTrace.chain],
      };
    }

    // 3. Is it a Bonding interface?
    const isBonding = ifaceType === 'bonding';
    if (isBonding) {
      const rawSlaves = ifaceObj?.slaves ?? (ifaceObj as any)?.interfaces;
      let slaves: string[] = [];
      if (Array.isArray(rawSlaves)) {
        for (const item of rawSlaves) {
          if (typeof item !== 'string' || !item.trim()) {
            return {
              success: false,
              physicalPorts: [],
              chain: [cleanName],
              failureReason: `بيانات منافذ واجهة الربط Bonding (${cleanName}) غير صالحة: تحتوي على عناصر غير نصية أو فارغة.`,
            };
          }
          slaves.push(item.trim());
        }
      } else if (typeof rawSlaves === 'string') {
        slaves = rawSlaves.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        return {
          success: false,
          physicalPorts: [],
          chain: [cleanName],
          failureReason: `بيانات منافذ واجهة الربط Bonding (${cleanName}) ذات صيغة غير مدعومة أو غير صالحة (يجب أن تكون نصوصاً أو مصفوفة نصوص).`,
        };
      }

      if (slaves.length === 0) {
        return {
          success: false,
          physicalPorts: [],
          chain: [cleanName],
          failureReason: `واجهة الربط Bonding (${cleanName}) لا تحتوي على أي منافذ تابعة (Slaves).`,
        };
      }

      const allPhysical: string[] = [];
      const subChains: string[] = [cleanName];

      for (const slave of slaves) {
        const slaveExists = ifaceList.some((i) => i?.name === slave);
        if (!slaveExists) {
          return {
            success: false,
            physicalPorts: [],
            chain: [cleanName, slave],
            failureReason: `المنفذ التابع (${slave}) لواجهة Bonding (${cleanName}) غير مسجل في واجهات الراوتر.`,
          };
        }
        const slaveTrace = this.traceToPhysicalPorts(slave, discovery, nextVisited, depth + 1);
        if (!slaveTrace.success) {
          return {
            success: false,
            physicalPorts: [],
            chain: [cleanName, ...slaveTrace.chain],
            failureReason: `فشل تتبع المنفذ التابع (${slave}) لـ Bonding (${cleanName}): ${slaveTrace.failureReason}`,
          };
        }
        allPhysical.push(...slaveTrace.physicalPorts);
        subChains.push(...slaveTrace.chain);
      }

      return {
        success: true,
        physicalPorts: Array.from(new Set(allPhysical)),
        chain: Array.from(new Set(subChains)),
      };
    }

    // 3.5. Is it a PPPoE interface?
    const isPppoe = ifaceType === 'pppoe-out' || ifaceType === 'pppoe' || cleanName.toLowerCase().startsWith('pppoe-');
    if (isPppoe) {
      const parentIface = (
        ifaceObj?.parentInterface ||
        (ifaceObj as any)?.interface ||
        ''
      ).trim();

      if (!parentIface) {
        return {
          success: false,
          physicalPorts: [],
          chain: [cleanName],
          failureReason: `تعذر تحديد الواجهة الحاملة لاتصال PPPoE (${cleanName}).`,
        };
      }

      const parentTrace = this.traceToPhysicalPorts(parentIface, discovery, nextVisited, depth + 1);
      if (!parentTrace.success) {
        return {
          success: false,
          physicalPorts: [],
          chain: [cleanName, ...parentTrace.chain],
          failureReason: `فشل تتبع الواجهة الحاملة (${parentIface}) لاتصال PPPoE (${cleanName}): ${parentTrace.failureReason}`,
        };
      }

      return {
        success: true,
        physicalPorts: parentTrace.physicalPorts,
        chain: [cleanName, ...parentTrace.chain],
      };
    }

    // 4. Pure Virtual / Tunnel Interfaces with no physical layer
    const VIRTUAL_TYPES = new Set(['loopback', 'gre', 'ipip', 'eoip', 'wireguard', 'ovpn', 'pptp', 'sstp', 'virtual']);
    if (ifaceType && VIRTUAL_TYPES.has(ifaceType)) {
      return {
        success: false,
        physicalPorts: [],
        chain: [cleanName],
        failureReason: `واجهة افتراضية (${cleanName}) من نوع [${ifaceType}] بدون مسار فيزيائي مثبت.`,
      };
    }

    if (!ifaceObj) {
      return {
        success: false,
        physicalPorts: [],
        chain: [cleanName],
        failureReason: `الواجهة (${cleanName}) غير مسجلة في قائمة واجهات الراوتر المستكشفة.`,
      };
    }

    if (!ifaceType) {
      return {
        success: false,
        physicalPorts: [],
        chain: [cleanName],
        failureReason: `الواجهة (${cleanName}) لا تملك نوعاً محدداً (Missing interface type). لا يمكن افتراض أنها منفذ فيزيائي.`,
      };
    }

    // 5. Physical Ethernet / SFP interface (Strict whitelist)
    const KNOWN_PHYSICAL_TYPES = new Set(['ether', 'sfp', 'sfp-plus', 'sfp28', 'qsfp+', 'qsfp28']);
    if (KNOWN_PHYSICAL_TYPES.has(ifaceType)) {
      return {
        success: true,
        physicalPorts: [cleanName],
        chain: [cleanName],
      };
    }

    return {
      success: false,
      physicalPorts: [],
      chain: [cleanName],
      failureReason: `نوع الواجهة (${cleanName}) [${ifaceType}] مجهول أو غير معتمد كمنفذ فيزيائي.`,
    };
  }

  /**
   * Resolves the authoritative management host/interface for preview & apply.
   * Reconciles stale DB device.host against verified connectedHost / explicit operator selection.
   */
  private resolveEffectiveManagementContext(
    deviceHost: string,
    discovery: { ipAddresses?: any[]; interfaces?: any[] },
    dto: Pick<
      ProvisionPreviewDto,
      'connectedHost' | 'confirmedManagementHost' | 'confirmedManagementInterface'
    >,
  ): {
    effectiveHost: string;
    hostChangedFromDb: boolean;
    overrideMgmtInterface?: string;
  } {
    const normalizeIp = (val?: string | null) => String(val || '').trim().split('/')[0];
    const hasIpInDiscovery = (targetHost: string) =>
      !!targetHost &&
      (discovery.ipAddresses || []).some(
        (ip) => ip?.address && normalizeIp(ip.address) === targetHost,
      );

    const dbHost = normalizeIp(deviceHost);
    if (hasIpInDiscovery(dbHost)) {
      return { effectiveHost: dbHost, hostChangedFromDb: false };
    }

    const confirmedHost = normalizeIp(dto?.confirmedManagementHost);
    if (confirmedHost && hasIpInDiscovery(confirmedHost)) {
      return { effectiveHost: confirmedHost, hostChangedFromDb: true };
    }

    const connectedHost = normalizeIp(dto?.connectedHost);
    if (connectedHost && hasIpInDiscovery(connectedHost)) {
      return { effectiveHost: connectedHost, hostChangedFromDb: true };
    }

    const confirmedIface = String(dto?.confirmedManagementInterface || '').trim();
    const ifaceExists =
      !!confirmedIface &&
      (discovery.interfaces || []).some((i) => i?.name === confirmedIface);

    return {
      effectiveHost: dbHost || connectedHost,
      hostChangedFromDb: false,
      ...(ifaceExists ? { overrideMgmtInterface: confirmedIface } : {}),
    };
  }

  /**
   * Topologically proves the management path from device.host -> interface -> physical ports.
   * Does NOT rely on superficial comments or interface naming patterns.
   * Recursively traces Bridges, VLANs, Bonds, and physical interfaces.
   */
  private resolveManagementTopology(
    discovery: {
      ipAddresses?: any[];
      bridges?: any[];
      bridgePorts?: any[];
      interfaces?: any[];
    },
    deviceHost: string,
    memberPorts: string[],
    wanIfaceName: string,
    protectWanAccess?: boolean,
    overrideMgmtInterface?: string,
  ): {
    isDetermined: boolean;
    isSevered: boolean;
    mgmtInterface?: string;
    interfaceType?: 'physical' | 'bridge' | 'vlan' | 'bonding' | 'virtual' | 'unknown';
    bridgePhysicalPorts?: string[];
    stolenBridgePorts?: string[];
    vlanParentInterface?: string;
    conflictType?:
      | 'MANAGEMENT_PATH_INDETERMINATE'
      | 'MANAGEMENT_PORT_BRIDGED'
      | 'WAN_MANAGEMENT_LOCKOUT'
      | 'MANAGEMENT_BRIDGE_DEPLETED';
    errorMessage?: string;
  } {
    const hostClean = (deviceHost || '').trim().split('/')[0];
    const ipList = discovery.ipAddresses || [];
    const hostIpEntry = hostClean
      ? ipList.find((ip) => {
          if (!ip?.address) return false;
          const clean = String(ip.address).trim().split('/')[0];
          return clean === hostClean;
        })
      : undefined;

    let mgmtInterface = hostIpEntry ? (hostIpEntry.interface || '').trim() : '';

    if (!hostIpEntry) {
      const candidateOverride = (overrideMgmtInterface || '').trim();
      const overrideExists =
        candidateOverride.length > 0 &&
        (discovery.interfaces || []).some((i) => i?.name === candidateOverride);

      if (overrideExists) {
        mgmtInterface = candidateOverride;
      } else if (!hostClean) {
        return {
          isDetermined: false,
          isSevered: true,
          conflictType: 'MANAGEMENT_PATH_INDETERMINATE',
          errorMessage: 'عنوان اتصال الراوتر غير محدد في النظام.',
        };
      } else {
        return {
          isDetermined: false,
          isSevered: true,
          conflictType: 'MANAGEMENT_PATH_INDETERMINATE',
          errorMessage: `عنوان اتصال الراوتر (${hostClean}) غير مسجل على أي واجهة في قائمة عناوين الراوتر المستكشفة.`,
        };
      }
    }

    if (!mgmtInterface) {
      return {
        isDetermined: false,
        isSevered: true,
        conflictType: 'MANAGEMENT_PATH_INDETERMINATE',
        errorMessage: `واجهة الإدارة للعنوان (${hostClean}) غير معينة.`,
      };
    }

    // Direct check: if management interface is explicitly in memberPorts (subscriber bridge)
    if (memberPorts.includes(mgmtInterface)) {
      return {
        isDetermined: true,
        isSevered: true,
        mgmtInterface,
        interfaceType: 'physical',
        conflictType: 'MANAGEMENT_PORT_BRIDGED',
        errorMessage: `واجهة الإدارة المباشرة (${mgmtInterface}) مجدولة لضمها إلى جسر المشتركين، مما يسبب عزلها وفقدان الاتصال بالراوتر فورياً.`,
      };
    }

    // Direct check: if management interface is on WAN with WAN protection active
    if (mgmtInterface === wanIfaceName && protectWanAccess) {
      return {
        isDetermined: true,
        isSevered: true,
        mgmtInterface,
        conflictType: 'WAN_MANAGEMENT_LOCKOUT',
        errorMessage: `عنوان الإدارة (${hostClean}) يقع على منفذ الإنترنت (${wanIfaceName}) مع تفعيل حظر منافذ الإدارة على WAN.`,
      };
    }

    // Recursive physical reachability trace
    const trace = this.traceToPhysicalPorts(mgmtInterface, discovery);
    if (!trace.success || trace.physicalPorts.length === 0) {
      return {
        isDetermined: false,
        isSevered: true,
        mgmtInterface,
        conflictType: 'MANAGEMENT_PATH_INDETERMINATE',
        errorMessage: trace.failureReason || 'تعذر إثبات مسار فيزيائي لواجهة الإدارة.',
      };
    }

    const ifaceObj = (discovery.interfaces || []).find((i) => i?.name === mgmtInterface);
    const ifaceType = ifaceObj?.type ? String(ifaceObj.type).toLowerCase() : undefined;
    const isBridge = (discovery.bridges || []).some((b) => b?.name === mgmtInterface) || ifaceType === 'bridge';
    const isVlan = ifaceType === 'vlan' || (ifaceObj && ('vlan-id' in ifaceObj || 'vlanId' in ifaceObj));
    const isBonding = ifaceType === 'bonding';

    let isParentBridge = false;
    if (isVlan) {
      const parentIface = (
        ifaceObj?.parentInterface ||
        (ifaceObj as any)?.interface ||
        (ifaceObj as any)?.['vlan-interface'] ||
        ''
      ).trim();
      isParentBridge = (discovery.bridges || []).some((b) => b?.name === parentIface);
    }

    // Trace WAN physical path as well to compare actual physical ports
    const wanTrace = this.traceToPhysicalPorts(wanIfaceName, discovery);
    const wanPhysicalSet = new Set(wanTrace.physicalPorts);
    const sharedWithWan = trace.physicalPorts.filter(
      (p) => wanPhysicalSet.has(p) || p === wanIfaceName,
    );
    const directWanInManagementBridge =
      (isBridge || isParentBridge) &&
      (trace.chain.includes(wanIfaceName) ||
        trace.physicalPorts.includes(wanIfaceName) ||
        (discovery.bridgePorts || []).some(
          (bp) => bp?.bridge === mgmtInterface && bp?.interface === wanIfaceName,
        ));

    // 1. Recursive WAN Overlap Verification
    // Direct WAN inside management bridge, or management directly on WAN with protection,
    // or non-bridge topology sharing physical port with WAN:
    if (
      directWanInManagementBridge ||
      (mgmtInterface === wanIfaceName && protectWanAccess) ||
      (!isBridge && !isParentBridge && mgmtInterface !== wanIfaceName && (sharedWithWan.length > 0 || trace.chain.some((c) => wanTrace.chain.includes(c))))
    ) {
      return {
        isDetermined: true,
        isSevered: true,
        mgmtInterface,
        interfaceType: isBridge ? 'bridge' : isVlan ? 'vlan' : isBonding ? 'bonding' : 'physical',
        bridgePhysicalPorts: trace.physicalPorts,
        conflictType: 'WAN_MANAGEMENT_LOCKOUT',
        errorMessage: mgmtInterface === wanIfaceName
          ? `عنوان الإدارة (${hostClean}) يقع على منفذ الإنترنت (${wanIfaceName}) مع تفعيل حظر منافذ الإدارة على WAN.`
          : `مسار الإدارة (${mgmtInterface}) يشترك في المنفذ الفيزيائي أو الواجهة [${sharedWithWan.length > 0 ? sharedWithWan.join(', ') : wanIfaceName}] مع منفذ الإنترنت WAN (${wanIfaceName}). تداخل مسار الإدارة مع WAN يهدد بعزل الراوتر وانقطاع الاتصال.`,
      };
    }

    // 2. Multi-Port Bridge / VLAN over Bridge Handling
    // A bridge can host multiple physical ports. If some ports remain, management is not severed,
    // but if ALL physical ports reachable by the bridge are stolen, the bridge is depleted and severed.
    if (isBridge || isParentBridge) {
      const allBridgePhysical = trace.physicalPorts;
      const compromisedPorts = allBridgePhysical.filter(
        (p) => memberPorts.includes(p) || p === wanIfaceName || sharedWithWan.includes(p),
      );

      const remainingBridgePorts = allBridgePhysical.filter((p) => !compromisedPorts.includes(p));
      const operationalRemainingPorts = remainingBridgePorts.filter((p) => {
        const iface = (discovery.interfaces || []).find((i) => i?.name === p);
        if (!iface) return false;
        if (iface.disabled === true || iface.disabled === 'true') return false;
        if (iface.running === false || iface.running === 'false') return false;
        return true;
      });

      if (compromisedPorts.length >= allBridgePhysical.length && allBridgePhysical.length > 0) {
        return {
          isDetermined: true,
          isSevered: true,
          mgmtInterface,
          interfaceType: isBridge ? 'bridge' : 'vlan',
          bridgePhysicalPorts: allBridgePhysical,
          stolenBridgePorts: compromisedPorts,
          conflictType: sharedWithWan.length > 0 ? 'WAN_MANAGEMENT_LOCKOUT' : 'MANAGEMENT_BRIDGE_DEPLETED',
          errorMessage: `الجسر الحامل لمسار الإدارة (${mgmtInterface}) سيفقد كافة منافذه الفيزيائية [${compromisedPorts.join(', ')}] لصالح المشتركين أو WAN، مما يعزل الراوتر تماماً.`,
        };
      }

      if (remainingBridgePorts.length > 0 && operationalRemainingPorts.length === 0) {
        return {
          isDetermined: true,
          isSevered: true,
          mgmtInterface,
          interfaceType: isBridge ? 'bridge' : 'vlan',
          bridgePhysicalPorts: allBridgePhysical,
          stolenBridgePorts: compromisedPorts,
          conflictType: 'MANAGEMENT_BRIDGE_DEPLETED',
          errorMessage: `المنافذ الفيزيائية المتبقية [${remainingBridgePorts.join(', ')}] لجسر الإدارة (${mgmtInterface}) معطلة أو مفصولة (running: false / disabled: true). بقاء منفذ غير نشط لا يثبت استمرارية الإدارة.`,
        };
      }

      return {
        isDetermined: true,
        isSevered: false,
        mgmtInterface,
        interfaceType: isBridge ? 'bridge' : 'vlan',
        bridgePhysicalPorts: allBridgePhysical,
        stolenBridgePorts: compromisedPorts,
      };
    }

    // 3. Non-Bridge Topology (Dedicated Bonding, Dedicated VLAN, or Dedicated Physical Port)
    // In a non-bridge topology, any theft of an underlying physical port or intermediate component severs the path.
    const stolenNonBridgeComponent = [...trace.physicalPorts, ...trace.chain].find(
      (c) => memberPorts.includes(c),
    );
    if (stolenNonBridgeComponent) {
      return {
        isDetermined: true,
        isSevered: true,
        mgmtInterface,
        interfaceType: isVlan ? 'vlan' : isBonding ? 'bonding' : 'physical',
        bridgePhysicalPorts: trace.physicalPorts,
        conflictType: 'MANAGEMENT_PORT_BRIDGED',
        errorMessage: `المنفذ الفيزيائي أو الواجهة الوسيطة (${stolenNonBridgeComponent}) التابعة لمسار الإدارة (${mgmtInterface}) مجدولة للضم إلى جسر المشتركين.`,
      };
    }

    // 4. If mgmtInterface is a direct physical Ethernet port:
    if (!isBridge && !isVlan && !isBonding) {
      const existingBridgePort = (discovery.bridgePorts || []).find((bp) => bp?.interface === mgmtInterface);
      if (existingBridgePort) {
        return {
          isDetermined: true,
          isSevered: true,
          mgmtInterface,
          interfaceType: 'physical',
          conflictType: 'MANAGEMENT_PORT_BRIDGED',
          errorMessage: `منفذ الإدارة الفيزيائي (${mgmtInterface}) هو منفذ تابع (Slave) للجسر [${existingBridgePort.bridge}]. حمل عنوان IP على منفذ تابع يخالف معمارية RouterOS ويقطع الاتصال.`,
        };
      }
    }

    return {
      isDetermined: true,
      isSevered: false,
      mgmtInterface,
      interfaceType: isBridge ? 'bridge' : isVlan ? 'vlan' : isBonding ? 'bonding' : 'physical',
      bridgePhysicalPorts: trace.physicalPorts,
      stolenBridgePorts: [],
    };
  }

  /**
   * Topologically verifies the integrity and independence of WAN interface,
   * its recursive parent interfaces (if VLAN/Bond), secondary WAN IPs, and default route.
   */
  private verifyWanTopology(
    discovery: {
      interfaces?: any[];
      ipAddresses?: any[];
      bridgePorts?: any[];
      bridges?: any[];
      routes?: any[];
      dhcpClients?: any[];
    },
    wanIfaceName: string,
    memberPorts: string[],
    proposedSubnet?: string | null,
    wanMode?: string,
  ): {
    isValid: boolean;
    failureReason?: string;
  } {
    if (!wanIfaceName) {
      return { isValid: false, failureReason: 'اسم منفذ الإنترنت (WAN) غير محدد.' };
    }

    // 1. Presence in discovery.interfaces
    const ifaceList = discovery.interfaces || [];
    const wanIface = ifaceList.find((i) => i?.name === wanIfaceName);
    if (!wanIface) {
      return {
        isValid: false,
        failureReason: `منفذ الإنترنت WAN (${wanIfaceName}) غير موجود في قائمة واجهات الراوتر.`,
      };
    }

    if (wanIface.disabled === true || wanIface.disabled === 'true') {
      return {
        isValid: false,
        failureReason: `منفذ الإنترنت WAN (${wanIfaceName}) معطل (disabled) في الراوتر.`,
      };
    }

    // 2. Direct bridge membership check
    const bpList = discovery.bridgePorts || [];
    const wanInBridge = bpList.find((bp) => bp?.interface === wanIfaceName);
    if (wanInBridge) {
      return {
        isValid: false,
        failureReason: `منفذ الإنترنت WAN (${wanIfaceName}) مرتبط بالجسر [${wanInBridge.bridge}]. هذا يمنع عزل WAN واستقلاليته.`,
      };
    }

    // 3. Member ports overlap
    if (memberPorts.includes(wanIfaceName)) {
      return {
        isValid: false,
        failureReason: `منفذ الإنترنت WAN (${wanIfaceName}) تم اختياره أيضاً كمنفذ مشتركين (LAN).`,
      };
    }

    // 4. Recursive Physical Trace for WAN interface
    const wanTrace = this.traceToPhysicalPorts(wanIfaceName, discovery);
    if (!wanTrace.success || wanTrace.physicalPorts.length === 0) {
      return {
        isValid: false,
        failureReason: `تعذر إثبات مسار منفذ الإنترنت WAN (${wanIfaceName}) فيزيائياً: ${wanTrace.failureReason || 'مسار فيزيائي غير مكتمل'}`,
      };
    }

    // 5. Check if any interface in the WAN chain or physical ports is stolen by memberPorts
    const stolenWanComponent = [
      ...wanTrace.chain,
      ...wanTrace.physicalPorts,
    ].find((c) => memberPorts.includes(c));
    if (stolenWanComponent) {
      return {
        isValid: false,
        failureReason: `الواجهة أو المنفذ الفيزيائي (${stolenWanComponent}) التابع لمنفذ WAN (${wanIfaceName}) مجدول للضم إلى جسر المشتركين.`,
      };
    }

    // Check if any underlying interface (parent or slave) is in a local bridge
    const bridgedWanComponent = wanTrace.chain.find(
      (c) => c !== wanIfaceName && bpList.some((bp) => bp?.interface === c),
    );
    if (bridgedWanComponent) {
      const bp = bpList.find((b) => b?.interface === bridgedWanComponent);
      return {
        isValid: false,
        failureReason: `الواجهة التابعة (${bridgedWanComponent}) لمنفذ WAN (${wanIfaceName}) مرتبطة بالجسر [${bp?.bridge}].`,
      };
    }

    // 6. Secondary WAN & Subnet Overlap check across ALL interfaces in WAN chain
    const ipList = discovery.ipAddresses || [];
    const relevantWanInterfaces = new Set([wanIfaceName, ...wanTrace.chain]);
    const associatedWanIps = ipList.filter((ip) => relevantWanInterfaces.has(ip?.interface));

    if (proposedSubnet) {
      for (const wanIp of associatedWanIps) {
        if (!wanIp?.address) continue;
        const ipSubnet = this.extractSubnetBase(wanIp.address);
        if (ipSubnet && ipSubnet === proposedSubnet) {
          return {
            isValid: false,
            failureReason: `عنوان الإنترنت على WAN (${wanIp.address}) يتعارض مع نطاق شبكة المشتركين المقترحة (${proposedSubnet}).`,
          };
        }
      }
    }

    // 7. Authoritative Default route validation & clear operational policy
    const routes = discovery.routes || [];
    const defaultRoutes = routes.filter(
      (r) => r && (r.dstAddress === '0.0.0.0/0' || r['dst-address'] === '0.0.0.0/0'),
    );

    const authorizedWanTargets = new Set([wanIfaceName, ...wanTrace.chain, ...wanTrace.physicalPorts]);

    if (defaultRoutes.length === 0) {
      if (wanMode === 'DHCP') {
        const dhcpClients = discovery.dhcpClients || [];
        // Check if there is a conflicting foreign DHCP client on another interface adding default route
        const conflictingForeignDhcp = dhcpClients.find((dc: any) => {
          if (!dc) return false;
          const dcIface = (dc.interface || '').trim();
          if (authorizedWanTargets.has(dcIface)) return false;
          if (dc.disabled === true || dc.disabled === 'true') return false;
          const addGw = dc.addDefaultRoute ?? dc['add-default-route'];
          return addGw !== false && addGw !== 'no' && addGw !== 'false';
        });

        if (conflictingForeignDhcp) {
          return {
            isValid: false,
            failureReason: `تعارض في مسار الإنترنت التلقائي: يوجد عميل DHCP مفعل على واجهة غير تابعة للإنترنت (${conflictingForeignDhcp.interface}) يقوم بإضافة مسار افتراضي.`,
          };
        }

        // Operational policy proven: In DHCP mode, default route is dynamically obtained on WAN
        return { isValid: true };
      }

      return {
        isValid: false,
        failureReason:
          wanMode === 'STATIC'
            ? 'إعداد WAN بنمط عنوان ثابت (Static IP) يتطلب وجود المسار الافتراضي نشطاً (Default Route 0.0.0.0/0) للإنترنت.'
            : `لا يوجد المسار الافتراضي نشطاً (Default Route 0.0.0.0/0) ولا يوجد عميل DHCP مفعل مع إضافة مسار تلقائي على منفذ WAN (${wanIfaceName}).`,
      };
    }

    // Check active / disabled state of default routes
    const activeDefaultRoutes = defaultRoutes.filter((r) => {
      const isRouteDisabled = r.disabled === true || (r as any).disabled === 'true';
      const isRouteInactive =
        r.inactive === true ||
        (r as any).inactive === 'true' ||
        r.active === false ||
        (r as any).active === 'false';
      return !isRouteDisabled && !isRouteInactive;
    });

    if (activeDefaultRoutes.length === 0) {
      return {
        isValid: false,
        failureReason: 'المسار الافتراضي للإنترنت (Default Route 0.0.0.0/0) معطل (disabled) أو غير نشط (inactive) في الراوتر.',
      };
    }

    const seenEgressIfaces = new Set<string>();

    for (const defaultRoute of activeDefaultRoutes) {
      // Authoritative egress interface resolution
      let resolvedEgressIface: string | null = null;
      const gwStatus = String((defaultRoute as any)['gateway-status'] || '').trim();
      const rawGw = String(defaultRoute.gateway || '').trim();
      const immediateGw = String((defaultRoute as any)['immediate-gw'] || '').trim();

      // Step A: Parse immediate-gw if present
      let immediateIface: string | null = null;
      if (immediateGw) {
        if (immediateGw.includes('%')) {
          immediateIface = immediateGw.split('%')[1].trim();
        } else if ((discovery.interfaces || []).some((i) => i?.name === immediateGw)) {
          immediateIface = immediateGw;
        }
      }

      // Step B: Parse gateway-status if present
      let statusIface: string | null = null;
      if (gwStatus) {
        const viaMatch = gwStatus.match(/via\s+([^\s,]+)/i);
        if (viaMatch && viaMatch[1]) {
          statusIface = viaMatch[1].trim();
        } else {
          const firstWord = gwStatus.split(' ')[0].trim();
          if ((discovery.interfaces || []).some((i) => i?.name === firstWord)) {
            statusIface = firstWord;
          }
        }
      }

      // Step C: Parse gateway attribute
      let gwScopedIface: string | null = null;
      let gwDirectIface: string | null = null;
      let gwSubnetIface: string | null = null;

      if (rawGw) {
        if (rawGw.includes('%')) {
          gwScopedIface = rawGw.split('%')[1].trim();
        } else if ((discovery.interfaces || []).some((i) => i?.name === rawGw)) {
          gwDirectIface = rawGw;
        } else {
          // IP address: match against router IP subnets
          const gwCleanIp = rawGw.split(',')[0].trim();
          const gwSubnet = this.extractSubnetBase(gwCleanIp);
          if (gwSubnet) {
            const matchingIps = (discovery.ipAddresses || []).filter((ip) => {
              if (!ip?.address || !ip?.interface) return false;
              return this.extractSubnetBase(ip.address) === gwSubnet;
            });
            const candidateIfaces = Array.from(new Set(matchingIps.map((ip) => ip.interface.trim())));
            if (candidateIfaces.length > 1) {
              if (!statusIface && !immediateIface) {
                return {
                  isValid: false,
                  failureReason: `تعارض وتعدد في واجهات الراوتر التي تشارك نفس نطاق بوابة المسار الافتراضي (${gwCleanIp}): [${candidateIfaces.join(', ')}]. لا يمكن اعتماد واجهة خروج دون gateway-status محدد.`,
                };
              }
            } else if (candidateIfaces.length === 1) {
              gwSubnetIface = candidateIfaces[0];
            }
          }
        }
      }

      // Step D: Contradiction Check (immediate-gw vs gateway inference)
      const inferredGwIface = gwScopedIface || gwDirectIface || gwSubnetIface;
      if (immediateIface && inferredGwIface && immediateIface !== inferredGwIface) {
        return {
          isValid: false,
          failureReason: `تناقض في واجهة خروج المسار الافتراضي: immediate-gw يشير إلى (${immediateIface}) بينما البوابة gateway تشير إلى (${inferredGwIface}).`,
        };
      }
      if (statusIface && inferredGwIface && statusIface !== inferredGwIface) {
        return {
          isValid: false,
          failureReason: `تناقض في واجهة خروج المسار الافتراضي: gateway-status يشير إلى (${statusIface}) بينما البوابة gateway تشير إلى (${inferredGwIface}).`,
        };
      }

      // Authoritative egress for this route
      resolvedEgressIface = statusIface || immediateIface || inferredGwIface;
      if (!resolvedEgressIface) {
        return {
          isValid: false,
          failureReason: `تعذر تحديد واجهة الخروج الفعلية لبوابة المسار الافتراضي (${rawGw || immediateGw || '0.0.0.0/0'}) بصورة موثوقة.`,
        };
      }

      seenEgressIfaces.add(resolvedEgressIface);

      // Step E: Trace egress interface down to physical ports
      const egressTrace = this.traceToPhysicalPorts(resolvedEgressIface, discovery);
      if (!egressTrace.success || egressTrace.physicalPorts.length === 0) {
        return {
          isValid: false,
          failureReason: `فشل تتبع واجهة خروج المسار الافتراضي (${resolvedEgressIface}) فيزيائياً: ${egressTrace.failureReason || 'مسار فيزيائي غير مكتمل'}`,
        };
      }

      // Step F: Egress or its physical ports must NOT overlap with memberPorts (LAN)
      const conflictingMember = [resolvedEgressIface, ...egressTrace.chain, ...egressTrace.physicalPorts].find(
        (p) => memberPorts.includes(p),
      );
      if (conflictingMember) {
        return {
          isValid: false,
          failureReason: `المسار الافتراضي للإنترنت (Default Route) يوجه الحزم عبر الواجهة أو المنفذ الفيزيائي (${conflictingMember}) المخصص لمنافذ المشتركين (LAN).`,
        };
      }

      // Step G: Egress interface MUST connect to authorized WAN targets
      const isAssociatedWithWan =
        authorizedWanTargets.has(resolvedEgressIface) ||
        egressTrace.physicalPorts.some((p) => wanTrace.physicalPorts.includes(p));

      if (!isAssociatedWithWan) {
        return {
          isValid: false,
          failureReason: `المسار الافتراضي للإنترنت (Default Route) يوجه الحزم عبر الواجهة (${resolvedEgressIface}) وهي لا تطابق ولا ترتبط بمنفذ الإنترنت المحدد WAN (${wanIfaceName}).`,
        };
      }
    }

    // Step H: Multipath / ECMP consistency check
    if (seenEgressIfaces.size > 1) {
      return {
        isValid: false,
        failureReason: `تعدد وتعارض في مسارات الإنترنت الافتراضية (ECMP Conflict): تم اكتشاف مسارات افتراضية متعددة تخرج عبر واجهات مختلفة [${Array.from(seenEgressIfaces).join(', ')}].`,
      };
    }

    return { isValid: true };
  }

  /**
   * Helper to determine whether an IP or interface carries primary or secondary management access
   */
  private isManagementIpOrInterface(
    ipEntry: any,
    discovery?: RouterDiscoverySnapshot,
    deviceHost?: string,
  ): boolean {
    if (!ipEntry) return false;
    const rawAddress = String(ipEntry.address || '').trim();
    const cleanIp = rawAddress.includes('/') ? rawAddress.split('/')[0] : rawAddress;
    const hostClean = (deviceHost || '').trim().split('/')[0];

    // 1. Matches device.host exactly
    if (hostClean && cleanIp === hostClean) return true;

    // 2. Marked with management/admin/oob comments
    const comment = String(ipEntry.comment || '').toLowerCase();
    if (
      comment.includes('mgmt') ||
      comment.includes('management') ||
      comment.includes('admin') ||
      comment.includes('oob')
    ) {
      return true;
    }

    // 3. Interface name indicates management
    const ifaceName = String(ipEntry.interface || '').toLowerCase();
    if (
      ifaceName.includes('mgmt') ||
      ifaceName.includes('management') ||
      ifaceName.includes('admin') ||
      ifaceName.includes('oob')
    ) {
      return true;
    }

    // 4. IP is on the same bridge or interface that hosts device.host
    if (hostClean && discovery?.ipAddresses) {
      const hostIpEntry = discovery.ipAddresses.find((ip) => {
        const clean = String(ip?.address || '').trim().split('/')[0];
        return clean === hostClean;
      });
      if (hostIpEntry && hostIpEntry.interface && hostIpEntry.interface === ipEntry.interface) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generates RouterOS command list formatted for v6 and v7
   * Orders LAN_IP on bridge before adding member ports, and avoids duplicate rules when discovery is provided
   */
  private generateRouterCommands(
    dto: ProvisionPreviewDto,
    _isV7: boolean,
    discovery?: RouterDiscoverySnapshot,
    device?: { host?: string },
    resolvedConflictKeys?: Set<string>,
  ): GeneratedCommandItem[] {
    const commands: GeneratedCommandItem[] = [];
    const bridgeName = dto.lan?.bridgeName || 'bridge-hotspot';
    const poolName = 'hs-pool-sudafi';
    const dhcpServerName = 'dhcp-sudafi';
    const hsProfileName = dto.hotspot?.profileName || 'hsp-sudafi';
    const hsServerName = dto.hotspot?.serverName || 'hs-sudafi';
    const dnsName = dto.hotspot?.dnsName || 'login.sudafi.net';
    const gatewayIp = (dto.lan?.gatewayIp || '10.5.50.1/24').trim();
    const cleanIp = gatewayIp.includes('/') ? gatewayIp.split('/')[0] : gatewayIp;
    const networkBase = this.extractNetworkBase(gatewayIp);
    const security = dto.securityPolicies || {};

    const isClean = dto.template === 'CLEAN_SETUP';

    // 0. Pre-Cleanup for CLEAN_SETUP: safely remove conflicting IPs on member ports and overlapping subnets
    if (isClean && discovery) {
      const currentHost = (device?.host || '').trim();
      const rawMemberPorts = Array.isArray(dto.lan?.memberInterfaces) ? dto.lan.memberInterfaces : [];
      const memberPorts = rawMemberPorts.map((m: any) => (m ? String(m).trim() : '')).filter(Boolean);

      // 0a. Remove direct IP on member ports (excluding router management IP, dynamic IPs, and secondary mgmt)
      for (const port of memberPorts) {
        const portDirectIps = (discovery.ipAddresses || []).filter((ip) => ip?.interface === port);
        if (portDirectIps.length === 0) continue;

        // Strict Check: If the port contains ANY dynamic IP or ANY management IP (primary or secondary)
        // RouterOS forbids removing dynamic addresses, and management addresses cause immediate lockout.
        const hasDynamicIp = portDirectIps.some((ip) => ip.dynamic === true || ip.dynamic === 'true');
        const hasManagementIp = portDirectIps.some((ip) => {
          const raw = String(ip.address || '').trim();
          const clean = raw.includes('/') ? raw.split('/')[0] : raw;
          return clean === currentHost || this.isManagementIpOrInterface(ip, discovery, currentHost);
        });

        if (hasDynamicIp || hasManagementIp) {
          // Unsafe port! Do NOT claim resolution for DIRECT_IP_PORT_BRIDGED for this port!
          // We also do not delete other static IPs on this port to avoid leaving the port half-cleared.
          continue;
        }

        let allValid = true;
        for (const portDirectIp of portDirectIps) {
          if (!portDirectIp || !portDirectIp.address) continue;
          // Must have a valid hexadecimal RouterOS ID. Missing or non-hex ID strictly invalidates cleanup!
          if (!portDirectIp.id || !isValidRouterOsId(portDirectIp.id)) {
            allValid = false;
            break;
          }
        }
        if (!allValid) {
          // If any IP on this port lacks a valid ID, do not touch this port and do not claim resolution!
          continue;
        }

        for (const portDirectIp of portDirectIps) {
          if (!portDirectIp || !portDirectIp.address || !portDirectIp.id) continue;
          const rawAddress = String(portDirectIp.address).trim();
          commands.push({
            stage: 'PRE_CLEANUP',
            command: `/ip/address/remove =.id=${portDirectIp.id}`,
            description: `إزالة عنوان IP السابق (${rawAddress}) عن المنفذ (${port}) تمهيداً لضمه لجسر المشتركين`,
          });
          resolvedConflictKeys?.add(`IP_SUBNET_OVERLAP:${port}:${rawAddress}`);
        }

        // Only mark port conflict as resolved if all IPs on it were static, had valid IDs, and were scheduled for removal!
        resolvedConflictKeys?.add(`DIRECT_IP_PORT_BRIDGED:${port}`);
      }

      // 0b. Remove member port from existing other bridge
      for (const port of memberPorts) {
        const existingBridgePort = (discovery.bridgePorts || []).find((p) => p?.interface === port);
        if (existingBridgePort && existingBridgePort.bridge !== bridgeName) {
          // Reject removal if ID is missing or not a valid RouterOS ID (no fallback)
          if (!existingBridgePort.id || !isValidRouterOsId(existingBridgePort.id)) {
            continue;
          }
          commands.push({
            stage: 'PRE_CLEANUP',
            command: `/interface/bridge/port/remove =.id=${existingBridgePort.id}`,
            description: `إزالة المنفذ (${port}) من الجسر السابق [${existingBridgePort.bridge}] لنقله إلى جسر المشتركين`,
          });
        }
      }

      // 0c. Protection of non-member interfaces:
      // Non-member interfaces (WAN, secondary management, unknown roles) are strictly protected
      // and NEVER deleted via PRE_CLEANUP. Any subnet overlap on them remains an unresolvable hard conflict.
    }

    // 1. LAN Bridge Creation (only if not already created, or full clean template)
    const bridgeExists = !isClean && discovery?.bridges?.some((b) => b?.name === bridgeName);
    if (!bridgeExists) {
      commands.push({
        stage: 'BRIDGE_SETUP',
        command: `/interface/bridge/add =name=${bridgeName} =comment=SudaFi Hotspot Bridge`,
        description: `إنشاء جسر موحد لمنافذ المشتركين (${bridgeName})`,
      });
    }

    // 2. Gateway IP on LAN Bridge (Assigned FIRST to ensure bridge has IP before member ports join)
    const ipExistsOnBridge = !isClean && discovery?.ipAddresses?.some(
      (ip) => ip?.interface === bridgeName && ip?.address === gatewayIp,
    );
    if (!ipExistsOnBridge) {
      commands.push({
        stage: 'LAN_IP',
        command: `/ip/address/add =address=${gatewayIp} =interface=${bridgeName} =comment=SudaFi Hotspot Gateway`,
        description: `تعيين عنوان بوابة الهوتسبوت (${gatewayIp}) على الجسر`,
      });
    }

    // 3. Member Ports Assignment (only if port is not already member of this bridge)
    const rawMemberPorts = Array.isArray(dto.lan?.memberInterfaces) ? dto.lan.memberInterfaces : [];
    for (const port of rawMemberPorts) {
      if (!port) continue;
      const portName = String(port).trim();
      const existingBridgePort = !isClean
        ? discovery?.bridgePorts?.find((p) => p?.bridge === bridgeName && p?.interface === portName)
        : undefined;

      if (!existingBridgePort) {
        const horizonArg = security.clientIsolation !== false ? ' =horizon=1' : '';
        commands.push({
          stage: 'BRIDGE_PORT',
          command: `/interface/bridge/port/add =bridge=${bridgeName} =interface=${portName}${horizonArg} =comment=SudaFi LAN Member`,
          description: `إضافة المنفذ ${portName} إلى جسر الهوتسبوت${security.clientIsolation !== false ? ' مع تفعيل عزل المشتركين (Horizon=1)' : ''}`,
        });
      } else if (security.clientIsolation !== false && Number(existingBridgePort.horizon) !== 1) {
        const idArg = existingBridgePort.id ? ` =.id=${existingBridgePort.id}` : '';
        commands.push({
          stage: 'BRIDGE_PORT',
          command: `/interface/bridge/port/set =numbers=${portName}${idArg} =horizon=1`,
          description: `تفعيل عزل المشتركين (Horizon=1) على المنفذ القائم (${portName})`,
        });
      }
    }

    // 4. WAN Configuration
    const wanIface = (dto.wan?.interface || 'ether1').trim();
    if (dto.wan?.mode === 'DHCP') {
      const dhcpClientExists = !isClean && discovery?.dhcpClients?.some((c) => c?.interface === wanIface);
      if (!dhcpClientExists) {
        commands.push({
          stage: 'WAN_CONFIG',
          command: `/ip/dhcp-client/add =interface=${wanIface} =add-default-route=yes =use-peer-dns=yes =use-peer-ntp=yes =disabled=no =comment=SudaFi WAN DHCP`,
          description: `تفعيل DHCP Client على منفذ الإنترنت (${wanIface})`,
        });
      }
    } else if (dto.wan?.mode === 'PPPOE') {
      commands.push({
        stage: 'WAN_CONFIG',
        command: `/interface/pppoe-client/add =name=pppoe-out1 =interface=${wanIface} =user=${dto.wan?.pppoeUser || ''} =password=${dto.wan?.pppoePassword || ''} =add-default-route=yes =use-peer-dns=yes =disabled=no =comment=SudaFi WAN PPPoE`,
        description: `إنشاء اتصال PPPoE Client على المنفذ (${wanIface})`,
      });
    } else if (dto.wan?.mode === 'STATIC') {
      if (dto.wan?.staticIp) {
        const staticIpExists = !isClean && discovery?.ipAddresses?.some(
          (ip) => ip?.interface === wanIface && ip?.address === dto.wan?.staticIp,
        );
        if (!staticIpExists) {
          commands.push({
            stage: 'WAN_CONFIG',
            command: `/ip/address/add =address=${dto.wan.staticIp} =interface=${wanIface} =comment=SudaFi WAN Static`,
            description: `تعيين عنوان IP ثابت لمنفذ الإنترنت (${dto.wan.staticIp})`,
          });
        }
      }
      if (dto.wan?.staticGateway) {
        const routeExists = !isClean && discovery?.routes?.some(
          (r) =>
            (r?.dstAddress === '0.0.0.0/0' || r?.dstAddress === '0.0.0.0') &&
            r?.gateway === dto.wan?.staticGateway,
        );
        if (!routeExists) {
          commands.push({
            stage: 'WAN_CONFIG',
            command: `/ip/route/add =dst-address=0.0.0.0/0 =gateway=${dto.wan.staticGateway} =comment=SudaFi Default Route`,
            description: `إضافة المسار الافتراضي للتوجيه عبر البوابة (${dto.wan.staticGateway})`,
          });
        }
      }
      if (dto.wan?.staticDns && dto.wan.staticDns.length > 0) {
        commands.push({
          stage: 'WAN_CONFIG',
          command: `/ip/dns/set =servers=${dto.wan.staticDns.join(',')} =allow-remote-requests=yes`,
          description: `ضبط خوادم DNS (${dto.wan.staticDns.join(',')})`,
        });
      }
    }

    // 5. NAT Masquerade (only if matching rule does not exist)
    if (dto.wan?.enableNat !== false) {
      const outIface = dto.wan?.mode === 'PPPOE' ? 'pppoe-out1' : wanIface;
      const natExists = !isClean && discovery?.natRules?.some(
        (r) => r?.action === 'masquerade' && r?.outInterface === outIface,
      );
      if (!natExists) {
        commands.push({
          stage: 'FIREWALL_NAT',
          command: `/ip/firewall/nat/add =chain=srcnat =out-interface=${outIface} =action=masquerade =comment=SudaFi NAT Masquerade`,
          description: `تفعيل قاعدة تحويل العناوين (Masquerade) لمنفذ الإنترنت (${outIface})`,
        });
      }
    }

    // 6. IP Pool for DHCP
    const poolRange = dto.lan?.poolRange || this.generateDefaultPoolRange(gatewayIp);
    commands.push({
      stage: 'DHCP_POOL',
      command: `/ip/pool/add =name=${poolName} =ranges=${poolRange} =comment=SudaFi Hotspot Pool`,
      description: `إنشاء نطاق توزيع العناوين (${poolRange})`,
    });

    // 7. DHCP Server and Network
    const leaseTime = dto.lan?.dhcpLeaseTime || '1h';
    const dnsList =
      dto.lan?.dnsServers && dto.lan.dnsServers.length > 0
        ? dto.lan.dnsServers.join(',')
        : `${cleanIp},8.8.8.8`;

    const dhcpServerExists = !isClean && discovery?.dhcpServers?.some(
      (s) => s?.name === dhcpServerName && s?.interface === bridgeName,
    );
    if (!dhcpServerExists) {
      commands.push({
        stage: 'DHCP_SERVER',
        command: `/ip/dhcp-server/add =name=${dhcpServerName} =interface=${bridgeName} =address-pool=${poolName} =lease-time=${leaseTime} =disabled=no =comment=SudaFi DHCP Server`,
        description: `إنشاء خادم توزيع العناوين DHCP على الجسر`,
      });
    }

    commands.push({
      stage: 'DHCP_NETWORK',
      command: `/ip/dhcp-server/network/add =address=${networkBase} =gateway=${cleanIp} =dns-server=${dnsList} =comment=SudaFi DHCP Network`,
      description: `ضبط شبكة DHCP للبوابة (${cleanIp}) و DNS (${dnsList})`,
    });

    // 8. DNS Allow Remote Requests
    commands.push({
      stage: 'DNS_SERVICE',
      command: `/ip/dns/set =allow-remote-requests=yes =servers=8.8.8.8,1.1.1.1`,
      description: `السماح للراوتر بالاستجابة لطلبات DNS لخدمة صفحة الدخول`,
    });

    // 9. Hotspot Server Profile (with Single Device mac-cookie integration)
    const loginBy = dto.hotspot?.loginBy || 'http-chap,http-pap,mac-cookie';
    commands.push({
      stage: 'HOTSPOT_PROFILE',
      command: `/ip/hotspot/profile/add =name=${hsProfileName} =hotspot-address=${cleanIp} =dns-name=${dnsName} =html-directory=${dto.hotspot?.htmlDirectory || 'hotspot'} =login-by=${loginBy} =use-radius=no =comment=SudaFi Server Profile`,
      description: `إنشاء ملف تعريف خادم الهوتسبوت بالدومين (${dnsName})`,
    });

    // Hotspot User Profile (Enforce Single Device per Card & Keepalive on Default Profile)
    const sharedUsersCount = security.enforceSingleDevice !== false ? 1 : 1;
    commands.push({
      stage: 'HOTSPOT_PROFILE',
      command: `/ip/hotspot/user/profile/set =numbers=default =shared-users=${sharedUsersCount} =keepalive-timeout=2m =status-autorefresh=1m =transparent-proxy=no =mac-cookie-timeout=1d`,
      description: 'ضبط إعدادات بروفايل المستخدمين الافتراضي لمنع تعدد الأجهزة وتثبيت الجلسة',
    });

    // Create or update the specific Hotspot User Profile (matching cards.service.ts profile name)
    const existingProfile = !isClean
      ? discovery?.hotspotUserProfiles?.find((p) => p?.name === hsProfileName)
      : undefined;
    const desiredRateLimit = dto.hotspot?.defaultRateLimit || '2M/5M';

    if (!existingProfile) {
      commands.push({
        stage: 'HOTSPOT_PROFILE',
        command: `/ip/hotspot/user/profile/add =name=${hsProfileName} =rate-limit=${desiredRateLimit} =shared-users=${sharedUsersCount} =keepalive-timeout=2m =status-autorefresh=1m =transparent-proxy=no =mac-cookie-timeout=1d =comment=SudaFi Named User Profile`,
        description: `إنشاء بروفايل مستخدمي الكروت الفعلي (${hsProfileName}) وتطبيق قيود السرعة ومشاركة الأجهزة`,
      });
    } else {
      const rateLimitMatches = existingProfile.rateLimit
        ? String(existingProfile.rateLimit).trim() === desiredRateLimit.trim()
        : false;
      const sharedUsersMatches =
        existingProfile.sharedUsers !== undefined
          ? Number(existingProfile.sharedUsers) === sharedUsersCount
          : true;

      if (!rateLimitMatches || !sharedUsersMatches) {
        commands.push({
          stage: 'HOTSPOT_PROFILE',
          command: `/ip/hotspot/user/profile/set =numbers=${hsProfileName}${existingProfile.id ? ` =.id=${existingProfile.id}` : ''} =rate-limit=${desiredRateLimit} =shared-users=${sharedUsersCount} =keepalive-timeout=2m =status-autorefresh=1m =transparent-proxy=no =mac-cookie-timeout=1d =comment=SudaFi Named User Profile`,
          description: `تحديث بروفايل مستخدمي الكروت الموجود (${hsProfileName}) لتطبيق السرعة المطلوبة (${desiredRateLimit}) ومشاركة الأجهزة`,
        });
      }
    }

    // 10. Hotspot Server (only if not already running on bridge, or full clean template)
    const hsServerExists = !isClean && discovery?.hotspotServers?.some(
      (s) => s?.name === hsServerName && s?.interface === bridgeName,
    );
    if (!hsServerExists) {
      commands.push({
        stage: 'HOTSPOT_SERVER',
        command: `/ip/hotspot/add =name=${hsServerName} =interface=${bridgeName} =address-pool=${poolName} =profile=${hsProfileName} =disabled=no =comment=SudaFi Hotspot Server`,
        description: `إنشاء خادم الهوتسبوت الرئيسي وتفعيله على (${bridgeName})`,
      });
    }

    // 11. Walled Garden Rules for SudaFi Platform and Gateway
    commands.push({
      stage: 'WALLED_GARDEN',
      command: `/ip/hotspot/walled-garden/ip/add =dst-address=${cleanIp} =action=accept =comment=Allow Hotspot Gateway`,
      description: `السماح بالوصول لبوابة الهوتسبوت بدون مصادقة مسبقة`,
    });

    commands.push({
      stage: 'WALLED_GARDEN',
      command: `/ip/hotspot/walled-garden/add =dst-host=*sudafi* =action=allow =comment=Allow SudaFi Platform`,
      description: `السماح بالوصول لسحابة SudaFi بدون حجب`,
    });

    // 12. Security Policies (Anti-Tethering TTL Lock, Management Protection, DNS Redirection, WAN Security)
    if (security.antiTethering !== false) {
      const mangleExists = !isClean && discovery?.mangleRules?.some(
        (r) => r?.comment === 'SudaFi_Anti_Tethering_TTL' || (r?.chain === 'postrouting' && r?.action === 'change-ttl'),
      );
      if (!mangleExists) {
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/mangle/add =chain=postrouting =out-interface=${bridgeName} =action=change-ttl =new-ttl=set:1 =comment=SudaFi_Anti_Tethering_TTL`,
          description: 'تثبيت قيمة TTL=1 على الحزم المتجهة للمشتركين لمنع بث الهوتسبوت ومشاركة USB/Bluetooth',
        });
      }
    }

    if (security.protectManagementAccess !== false) {
      const filterExists = !isClean && discovery?.filterRules?.some(
        (r) => r?.comment === 'SudaFi_Drop_Subscriber_Admin_Ports' || (r?.chain === 'input' && r?.action === 'drop'),
      );
      if (!filterExists) {
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/filter/add =chain=input =in-interface=${bridgeName} =protocol=tcp =dst-port=22,23,8291,8728,8729 =action=drop =comment=SudaFi_Drop_Subscriber_Admin_Ports`,
          description: 'حجب منافذ إدارة الراوتر (WinBox, SSH, Telnet, API) عن شبكة المشتركين',
        });
      }
    }

    // Optional WAN Admin Protection: accepts established/related before applying drop
    if ((security as any).protectWanAccess) {
      const acceptEstExists = !isClean && discovery?.filterRules?.some(
        (r) => r?.comment === 'SudaFi_Accept_Established_Related' || (r?.chain === 'input' && r?.action === 'accept'),
      );
      if (!acceptEstExists) {
        const placeBeforeArg =
          discovery?.filterRules && discovery.filterRules.length > 0 && discovery.filterRules[0]?.id
            ? ` =place-before=${discovery.filterRules[0].id}`
            : '';
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/filter/add =chain=input =connection-state=established,related =action=accept${placeBeforeArg} =comment=SudaFi_Accept_Established_Related`,
          description: 'السماح للاتصالات القائمة والمترابطة في أعلى قائمة القواعد قبل حظر منافذ الإدارة عن بطاقة الإنترنت (WAN)',
        });
      }

      const wanDropExists = !isClean && discovery?.filterRules?.some(
        (r) => r?.comment === 'SudaFi_Drop_WAN_Admin_Ports' || (r?.chain === 'input' && r?.action === 'drop' && (r as any).inInterface === dto.wan?.interface),
      );
      if (!wanDropExists) {
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/filter/add =chain=input =in-interface=${dto.wan?.interface} =protocol=tcp =dst-port=22,23,8291,8728,8729 =action=drop =comment=SudaFi_Drop_WAN_Admin_Ports`,
          description: `حجب منافذ إدارة الراوتر عن بطاقة الإنترنت (${dto.wan?.interface})`,
        });
      }
    }

    if (security.forceRouterDns !== false) {
      const dnsUdpExists = !isClean && discovery?.natRules?.some((r) => r?.comment === 'SudaFi_Force_DNS_UDP');
      if (!dnsUdpExists) {
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/nat/add =chain=dstnat =in-interface=${bridgeName} =protocol=udp =dst-port=53 =action=redirect =comment=SudaFi_Force_DNS_UDP`,
          description: 'إعادة توجيه استعلامات DNS (UDP 53) إلى الراوتر لضمان عمل صفحة الدخول',
        });
      }
      const dnsTcpExists = !isClean && discovery?.natRules?.some((r) => r?.comment === 'SudaFi_Force_DNS_TCP');
      if (!dnsTcpExists) {
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/nat/add =chain=dstnat =in-interface=${bridgeName} =protocol=tcp =dst-port=53 =action=redirect =comment=SudaFi_Force_DNS_TCP`,
          description: 'إعادة توجيه استعلامات DNS (TCP 53) إلى الراوتر لمنع الالتفاف',
        });
      }
    }

    // Absolute safeguard: A provisioning preview on any router must never return 0 commands
    if (commands.length === 0) {
      commands.push({
        stage: 'HOTSPOT_PROFILE',
        command: `/ip/hotspot/profile/set =numbers=${hsProfileName} =hotspot-address=${cleanIp} =dns-name=${dnsName}`,
        description: `مزامنة وتأكيد ملف تعريف خادم الهوتسبوت (${hsProfileName})`,
      });
      commands.push({
        stage: 'DNS_SERVICE',
        command: `/ip/dns/set =allow-remote-requests=yes =servers=8.8.8.8,1.1.1.1`,
        description: 'مزامنة وتأكيد خدمة DNS للراوتر وصفحة الدخول',
      });
      commands.push({
        stage: 'SECURITY_POLICIES',
        command: `/ip/firewall/mangle/add =chain=postrouting =out-interface=${bridgeName} =action=change-ttl =new-ttl=set:1 =comment=SudaFi_Anti_Tethering_TTL`,
        description: 'تأكيد تفعيل سياسة منع مشاركة الإنترنت (Anti-Tethering)',
      });
    }

    return commands;
  }

  private sanitizeCommandForDisplay(cmd: string): string {
    return cmd
      .replace(/=password=[^ ]+/gi, '=password=********')
      .replace(/=secret=[^ ]+/gi, '=secret=********');
  }

  private buildPlannedSteps(dto: ProvisionPreviewDto): PlannedProvisioningStep[] {
    const steps: PlannedProvisioningStep[] = [];
    const bridgeName = dto.lan?.bridgeName || 'bridge-hotspot';
    const memberPortsStr = Array.isArray(dto.lan?.memberInterfaces)
      ? dto.lan.memberInterfaces.join(', ')
      : 'ether2-ether5';

    steps.push({
      id: 'step-1',
      stage: 'BRIDGE',
      title: 'إنشاء جسر شبكة المشتركين',
      description: `إنشاء الجسر (${bridgeName}) وتعيين البوابة وضم المنافذ [${memberPortsStr}] إليه.`,
    });

    steps.push({
      id: 'step-2',
      stage: 'WAN',
      title: `إعداد بطاقة الإنترنت (${dto.wan?.mode || 'DHCP'})`,
      description: `ربط المنفذ ${dto.wan?.interface || 'ether1'} بالإنترنت وتفعيل محول العناوين (Masquerade).`,
    });

    steps.push({
      id: 'step-3',
      stage: 'LAN_DHCP',
      title: 'إعداد توزيع العناوين التلقائي (DHCP)',
      description: `تعيين البوابة ${dto.lan?.gatewayIp || '10.5.50.1/24'} وإنشاء نطاق العناوين وخادم الـ DHCP.`,
    });

    steps.push({
      id: 'step-4',
      stage: 'HOTSPOT',
      title: 'برمجة وتشغيل خادم الهوتسبوت',
      description: `إنشاء خادم الهوتسبوت (${dto.hotspot?.serverName || 'hs-sudafi'}) مع دومين الدخول (${dto.hotspot?.dnsName || 'login.sudafi.net'}).`,
    });

    steps.push({
      id: 'step-5',
      stage: 'SECURITY',
      title: 'سياسات الحماية والحد من مشاركة الإنترنت',
      description: 'تطبيق تثبيت TTL=1 لمنع بث الهوتسبوت، وعزل المنافذ (Horizon)، وحماية منافذ الإدارة، وتوجيه DNS.',
    });

    steps.push({
      id: 'step-6',
      stage: 'VERIFICATION',
      title: 'فحص الاتصال والتشخيص النهائي',
      description: 'فحص استجابة الراوتر، وحالة بوابة الإنترنت، والتحقق من جاهزية الهوتسبوت وسياسات الأمان.',
    });

    return steps;
  }

  private buildSecurityPoliciesReport(
    dto: ProvisionPreviewDto,
    _isV7: boolean,
    discovery: RouterDiscoverySnapshot,
  ): SecurityPolicyReportItem[] {
    const policies = dto.securityPolicies || {};
    const reports: SecurityPolicyReportItem[] = [];

    // 1. Anti-Tethering (TTL Lock)
    const hasTetheringRule = discovery?.mangleRules?.some(
      (r) => r?.comment === 'SudaFi_Anti_Tethering_TTL' || (r?.chain === 'postrouting' && r?.action === 'change-ttl'),
    );
    const antiTetheringEnabled = policies.antiTethering !== false;
    reports.push({
      id: 'ANTI_TETHERING',
      name: 'الحد من مشاركة الاتصال وتمريره (Anti-Tethering / TTL Lock)',
      category: 'SHARING_PREVENTION',
      status: hasTetheringRule
        ? 'ACTIVE_ON_ROUTER'
        : antiTetheringEnabled
          ? 'PROPOSED'
          : 'DISABLED',
      isSupported: true,
      description:
        'تثبيت قيمة TTL=1 على الحزم المتجهة للمشتركين لمنع بث الهوتسبوت أو مشاركة الاتصال عبر USB أو Bluetooth.',
      realisticEffect:
        'يمنع بث الإنترنت عبر نقطة اتصال الهواتف (Mobile Hotspot) ومشاركة USB/Bluetooth لمعظم الهواتف العادية (غير المروتة)، حيث يسقط الهاتف الحزم عند محاولة إعادة توجيهها للأجهزة المتصلة به.',
      knownLimitations:
        'لا يمنع الأجهزة المروتة (Rooted Android) أو الحواسيب التي تتلاعب بقيم TTL محلياً، ولا يمنع تطبيقات البروكسي المحلية (Local Proxy Apps) إلا بدمجها مع عزل المنافذ (Client Isolation).',
    });

    // 2. Client Isolation (Bridge Horizon)
    const bridgeName = dto.lan?.bridgeName || 'bridge-hotspot';
    const hasClientIsolation = discovery?.bridgePorts?.some(
      (p) => p?.bridge === bridgeName && Number(p?.horizon) === 1,
    );
    const clientIsolationEnabled = policies.clientIsolation !== false;
    reports.push({
      id: 'CLIENT_ISOLATION',
      name: 'عزل أجهزة المشتركين ومنع المشاركة المباشرة (Client Port Isolation)',
      category: 'SHARING_PREVENTION',
      status: hasClientIsolation
        ? 'ACTIVE_ON_ROUTER'
        : clientIsolationEnabled
          ? 'PROPOSED'
          : 'DISABLED',
      isSupported: true,
      description:
        'تفعيل عزل الطبقة الثانية (Horizon=1) على منافذ جسر المشتركين لمنع الاتصال المباشر بين الأجهزة.',
      realisticEffect:
        'يمنع تبادل البيانات المباشر وتطبيقات البروكسي المحلية (مثل CCProxy / Every Proxy) وهجمات انتحال العناوين (ARP Spoofing) بين المشتركين على نفس الجسر.',
      knownLimitations:
        'يطبق على المنافذ الفيزيائية للجسر في الراوتر؛ وفي حال وجود أكسس بوينت خارجي (Access Point) يجب تفعيل ميزة Client Isolation أو منع Forwarding داخله أيضاً.',
    });

    // 3. Management Protection
    const hasMgmtDropRule = discovery?.filterRules?.some(
      (r) => r?.comment === 'SudaFi_Drop_Subscriber_Admin_Ports' || (r?.chain === 'input' && r?.action === 'drop'),
    );
    const protectMgmtEnabled = policies.protectManagementAccess !== false;
    reports.push({
      id: 'PROTECT_MANAGEMENT',
      name: 'حماية منافذ الإدارة وخدمات الراوتر (Management Protection)',
      category: 'ACCESS_CONTROL',
      status: hasMgmtDropRule
        ? 'ACTIVE_ON_ROUTER'
        : protectMgmtEnabled
          ? 'PROPOSED'
          : 'DISABLED',
      isSupported: true,
      description:
        'حظر وصول المشتركين إلى منافذ لوحة تحكم الراوتر (SSH 22, Telnet 23, WinBox 8291, API 8728/8729).',
      realisticEffect:
        'يمنع أي محاولة وصول غير مصرح بها لخدمات إدارة الراوتر من هواتف المشتركين، مع الإبقاء على منفذي صفحة الدخول (80/443).',
      knownLimitations:
        'يحمي الراوتر من منافذ الهوتسبوت فقط، ولا يحل محل تعيين كلمات مرور قوية لجميع المستخدمين.',
    });

    // 4. Force Router DNS
    const hasDnsRedirect = discovery?.natRules?.some(
      (r) => r?.comment === 'SudaFi_Force_DNS_UDP' || r?.comment === 'SudaFi_Force_DNS_TCP',
    );
    const forceDnsEnabled = policies.forceRouterDns !== false;
    reports.push({
      id: 'FORCE_ROUTER_DNS',
      name: 'منع التلاعب بـ DNS وإلزام كاش الراوتر (DNS Hijacking Prevention)',
      category: 'ACCESS_CONTROL',
      status: hasDnsRedirect
        ? 'ACTIVE_ON_ROUTER'
        : forceDnsEnabled
          ? 'PROPOSED'
          : 'DISABLED',
      isSupported: true,
      description:
        'إعادة توجيه كافة استعلامات DNS (منفذ 53) لكاش الراوتر لضمان عمل صفحة تسجيل الدخول ومنع الالتفاف.',
      realisticEffect:
        'يجبر الأجهزة التي تستخدم خوادم DNS مخصصة (مثل 8.8.8.8) على الرجوع لصفحة الهوتسبوت للتحقق من المصادقة.',
      knownLimitations:
        'لا يمنع بروتوكولات DNS المشفرة مسبقاً (DoH / DoT على منافذ 443 و 853) إذا كان للمستخدم وصول إنترنت نشط.',
    });

    // 5. Enforce Single Device
    const singleDeviceEnabled = policies.enforceSingleDevice !== false;
    reports.push({
      id: 'SINGLE_DEVICE_PER_CARD',
      name: 'قصر الكرت على جهاز واحد ومصادقة MAC (Single Device Enforcement)',
      category: 'ACCOUNTING_PROTECTION',
      status: singleDeviceEnabled ? 'PROPOSED' : 'DISABLED',
      isSupported: true,
      description:
        'منع استخدام الكرت الواحد على أكثر من جهاز في نفس اللحظة (shared-users=1) وحفظ الارتباط برمز MAC Cookie.',
      realisticEffect:
        'يضمن تطبيق قيود السرعة والحجم والمدة الزمنية على جهاز المشترك الفعلي ويمنع التشارك المتزامن بالكرت.',
      knownLimitations:
        'إذا سجل المشترك خروجه، يمكن استخدام الكرت على جهاز آخر طالما أن الحصة والصلاحية لم تنتهِ بعد.',
    });

    // 6. Block Unauthenticated Bypass
    const blockBypassEnabled = policies.blockUnauthenticatedBypass !== false;
    reports.push({
      id: 'BLOCK_BYPASS',
      name: 'حظر التجاوز غير المصرح به وتدقيق استثناءات Walled Garden',
      category: 'ACCOUNTING_PROTECTION',
      status: blockBypassEnabled ? 'PROPOSED' : 'DISABLED',
      isSupported: true,
      description:
        'التحقق من عدم وجود مسارات IP Binding عامة تتيح المرور للإنترنت بدون مصادقة محاسبية.',
      realisticEffect:
        'يضمن أن جميع حزم البيانات الصادرة تُحسب ضمن الرصيد المحدد للكروت والبروفايلات.',
      knownLimitations:
        'لا يمنع مشاركة الاتصال خارج الراوتر (مثل مشاركة كرت الشاشة أو راوتر ثانوي مسجل الدخول بالفعل).',
    });

    return reports;
  }

  private extractSubnetBase(ipWithCidr?: string | null): string | null {
    if (!ipWithCidr || typeof ipWithCidr !== 'string') return null;
    if (!isValidIpv4Cidr(ipWithCidr)) return null;
    const parts = ipWithCidr.split('/')[0].split('.');
    if (parts.length < 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  private extractNetworkBase(ipWithCidr?: string | null): string {
    if (!ipWithCidr || typeof ipWithCidr !== 'string') return '10.5.50.0/24';
    const base = this.extractSubnetBase(ipWithCidr);
    const cidr = ipWithCidr.includes('/') ? ipWithCidr.split('/')[1] : '24';
    return base ? `${base}.0/${cidr}` : '10.5.50.0/24';
  }

  private generateDefaultPoolRange(ipWithCidr?: string | null): string {
    const base = this.extractSubnetBase(ipWithCidr) || '10.5.50';
    return `${base}.10-${base}.254`;
  }

  private commandStringToWords(cmd: string): string[] {
    return (cmd || '').trim().split(/\s+/);
  }
}

