import { BadRequestException, Injectable } from '@nestjs/common';
import type { AutoProvisionConfigDto } from '../dto/auto-provisioning.dto';
import type {
  FullRouterDiscoveryReport,
  ManagementSafetyReport,
} from '../interfaces/auto-provisioning.interface';
import { isValidIpv4Cidr } from '../../../core/security/snapshot-integrity.util';
import { resolveActiveDefaultRoutesEgress } from '../utils/topology-helpers.util';

const FORBIDDEN_TOKEN_REGEX = /(;\s*|&&|\|\||\$\(|`|[\r\n]|\[find\b|\/file\s+remove\b|remove\s+\[find)/i;

function isPhysicalInterfaceActive(ifaceName: string, discovery: FullRouterDiscoveryReport): boolean {
  const iface = discovery.interfaces.find((i) => i.name === ifaceName);
  if (!iface || iface.disabled) return false;
  return iface.running === true;
}

@Injectable()
export class ProvisioningValidatorService {
  /**
   * Validates parameters against injection payloads and network invariants.
   */
  validateAndSanitizeConfig(
    dto: AutoProvisionConfigDto,
    discovery: FullRouterDiscoveryReport,
  ): {
    errors: string[];
    warnings: Array<{ code: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; message: string; suggestedAction?: string }>;
  } {
    const errors: string[] = [];
    const warnings: Array<{ code: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; message: string; suggestedAction?: string }> = [];

    const checkNoInjection = (label: string, val?: string) => {
      if (!val) return;
      if (FORBIDDEN_TOKEN_REGEX.test(val)) {
        errors.push(`قيمة الحقل (${label}) تحتوي على رموز غير مسموح بها أو محاولة حقن أوامر.`);
      }
    };

    checkNoInjection('WAN interface', dto.wan?.interface);
    checkNoInjection('WAN PPPoE User', dto.wan?.pppoeUser);
    checkNoInjection('WAN PPPoE Password', dto.wan?.pppoePassword);
    checkNoInjection('WAN Rename', dto.wan?.renameInterfaceTo);
    checkNoInjection('Bridge Name', dto.lan?.bridgeName);
    checkNoInjection('WiFi SSID', dto.wireless?.ssid);
    checkNoInjection('Hotspot Server', dto.hotspot?.serverName);
    checkNoInjection('Hotspot DNS Name', dto.hotspot?.dnsName);
    checkNoInjection('Hotspot User Profile', dto.hotspot?.userProfileName);
    checkNoInjection('System Identity', dto.system?.identity);

    if (!isValidIpv4Cidr(dto.lan?.gatewayIp) || !dto.lan.gatewayIp.includes('/')) {
      errors.push('عنوان البوابة (LAN Gateway IP) يجب أن يكون بصيغة IPv4/CIDR صحيحة مثل 10.5.50.1/24.');
    }

    const wanIface = (dto.wan?.interface || '').trim();
    const discoveredNames = new Set(discovery.interfaces.map((i) => i.name));
    if (discoveredNames.size > 0 && wanIface && !discoveredNames.has(wanIface)) {
      errors.push(`منفذ الإنترنت المختار (${wanIface}) غير موجود ضمن واجهات هذا الراوتر.`);
    }

    const memberPorts = (dto.lan?.memberInterfaces || []).map((p) => p.trim()).filter(Boolean);
    if (memberPorts.length === 0) {
      errors.push('يجب اختيار منفذ واحد على الأقل لشبكة المشتركين (LAN).');
    }
    if (wanIface && memberPorts.includes(wanIface)) {
      errors.push(`تعارض خطير: منفذ الإنترنت WAN (${wanIface}) لا يمكن ضمه داخل جسر المشتركين LAN.`);
    }
    if (discoveredNames.size > 0) {
      for (const port of memberPorts) {
        if (!discoveredNames.has(port)) {
          errors.push(`المنفذ (${port}) غير موجود على هذا الراوتر (${discovery.device.model}).`);
        }
      }
    }

    if (dto.wan?.mode === 'PPPOE' && (!dto.wan.pppoeUser?.trim() || !dto.wan.pppoePassword?.trim())) {
      errors.push('وضع PPPoE يتطلب إدخال اسم المستخدم وكلمة المرور.');
    }
    if (dto.wan?.mode === 'STATIC') {
      if (!isValidIpv4Cidr(dto.wan.staticIp)) {
        errors.push('وضع Static WAN يتطلب عنوان IP/CIDR صالح.');
      }
      if (!isValidIpv4Cidr(dto.wan.staticGateway) || dto.wan.staticGateway?.includes('/')) {
        errors.push('وضع Static WAN يتطلب بوابة افتراضية (IPv4 دون قناع).');
      }
    }

    if (dto.wireless?.enabled && !discovery.capabilities.supportsWifi && !discovery.capabilities.supportsWireless) {
      warnings.push({
        code: 'WIFI_UNSUPPORTED_SKIPPED',
        severity: 'INFO',
        message: 'تم تخطي إعداد WiFi لأن هذا الموديل أو حزم RouterOS المثبتة لا تدعم الواجهة اللاسلكية.',
      });
    }

    return { errors, warnings };
  }

  /**
   * Traces management IP & interface through bridges, VLANs, bonding, and PPPoE,
   * failing CLOSED whenever management connectivity could be severed or is ambiguous.
   */
  verifyManagementSafety(
    discovery: FullRouterDiscoveryReport,
    dto: AutoProvisionConfigDto,
  ): ManagementSafetyReport {
    const cleanHost = (discovery.device.host || '').trim();
    const memberPorts = new Set((dto.lan?.memberInterfaces || []).map((p) => p.trim()).filter(Boolean));
    const wanIface = (dto.wan?.interface || '').trim();
    const bridgeName = (dto.lan?.bridgeName || 'bridge-hotspot').trim();
    const protectWan = Boolean(dto.securityPolicies?.protectWanAccess);
    const isClean = (dto.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';

    const blockedReasons: string[] = [];
    const warnings: string[] = [];

    if (discovery.discoveryCompleteness && !discovery.discoveryCompleteness.isComplete) {
      return {
        isDetermined: false,
        isSevered: true,
        mgmtIp: cleanHost,
        mgmtPhysicalPorts: [],
        conflictType: 'DISCOVERY_INCOMPLETE_BLOCK',
        blockedReasons: [
          `تعذر التحقق من سلامة مسار الإدارة بسبب نقص بيانات الشبكة الأساسية (${discovery.discoveryCompleteness.failedCoreQueries.join(', ')}).`,
        ],
        warnings: discovery.discoveryCompleteness.warnings,
      };
    }

    const mgmtIpRecord = discovery.ipAddresses.find(
      (ip) => !ip.disabled && ip.address?.split('/')[0] === cleanHost,
    );

    if (!mgmtIpRecord) {
      return {
        isDetermined: false,
        isSevered: true,
        mgmtIp: cleanHost,
        mgmtPhysicalPorts: [],
        conflictType: 'MANAGEMENT_PATH_INDETERMINATE',
        blockedReasons: [
          `عنوان اتصال الإدارة (${cleanHost}) غير ظاهر على أي واجهة في الراوتر — يتعذر ضمان عدم انقطاع الاتصال عند التعديل.`,
        ],
        warnings: ['أعد فحص الراوتر وتأكد من تطابق عنوان IP الفعلي للإدارة قبل تطبيق أي تغييرات.'],
      };
    }

    const mgmtIface = mgmtIpRecord.interface;
    const mgmtIfaceObj = discovery.interfaces.find((i) => i.name === mgmtIface);
    if (mgmtIfaceObj?.disabled) {
      blockedReasons.push(`واجهة الإدارة (${mgmtIface}) معطلة حالياً.`);
    }

    const traced = this.traceToPhysicalPorts(mgmtIface, discovery);
    const wanTraced = wanIface
      ? this.traceToPhysicalPorts(wanIface, discovery)
      : { success: false, ports: [] as string[], reason: 'لم يتم تحديد واجهة WAN' };

    if (!traced.success) {
      blockedReasons.push(
        `تعذر تتبع مسار الإدارة (${mgmtIface}) حتى المنافذ الفيزيائية (${traced.reason || 'طوبولوجيا غير مكتملة'}).`,
      );
    }

    if (wanIface && !wanTraced.success && discovery.interfaces.length > 0) {
      blockedReasons.push(
        `تعذر تتبع مسار WAN (${wanIface}) حتى منافذه الفيزيائية (${wanTraced.reason || 'طوبولوجيا غير مكتملة'}) للتحقق من عدم تداخله مع الإدارة.`,
      );
    }

    const wanPhysicalSet = new Set(wanTraced.success ? wanTraced.ports : [wanIface].filter(Boolean));

    // 1. Direct management interface cannot be swallowed into subscriber bridge
    if (memberPorts.has(mgmtIface)) {
      blockedReasons.push(
        `منفذ الإدارة المباشر (${mgmtIface}) مدرج ضمن منافذ شبكة المشتركين؛ ضمه للجسر سيعزل الجلسة فوراً.`,
      );
    }

    // 2. Recursive physical management path check (covers Bridge, VLAN-over-Bridge, Bonding, and PPPoE-over-Ethernet)
    if (traced.success) {
      const survivingNonLan = traced.ports.filter((p) => !memberPorts.has(p));
      const removedFromMgmt = traced.ports.filter((p) => memberPorts.has(p));
      const survivingNonWan = survivingNonLan.filter((p) => !wanPhysicalSet.has(p));
      const physicalOverlapWithWan = traced.ports.filter((p) => wanPhysicalSet.has(p));
      const survivingActiveNonLan = survivingNonLan.filter((p) =>
        isPhysicalInterfaceActive(p, discovery),
      );
      const survivingActiveNonWan = survivingNonWan.filter((p) =>
        isPhysicalInterfaceActive(p, discovery),
      );

      if (removedFromMgmt.length > 0 && survivingActiveNonLan.length === 0) {
        blockedReasons.push(
          `سحب المنافذ [${removedFromMgmt.join(', ')}] يعزل مسار الإدارة (${mgmtIface}) من أي منفذ فيزيائي نشط ومتصل ويقطع الاتصال فوراً.`,
        );
      } else if (removedFromMgmt.length > 0) {
        warnings.push(
          `سيتم نقل [${removedFromMgmt.join(', ')}] من مسار الإدارة (${mgmtIface})، مع بقاء [${survivingActiveNonLan.join(', ')}] نشطاً للإدارة.`,
        );
      }

      if (physicalOverlapWithWan.length > 0 && survivingActiveNonWan.length === 0) {
        blockedReasons.push(
          `تداخل فيزيائي بين مسار الإدارة (${mgmtIface}: [${traced.ports.join(', ')}]) ومسار WAN (${wanIface}: [${Array.from(wanPhysicalSet).join(', ')}]) عبر [${physicalOverlapWithWan.join(', ')}] دون أي مسار إدارة بديل نشط.`,
        );
      } else if (physicalOverlapWithWan.length > 0 && protectWan) {
        warnings.push(
          `يوجد منفذ مشترك [${physicalOverlapWithWan.join(', ')}] مع WAN، مع توفر منفذ إدارة بديل نشط [${survivingActiveNonWan.join(', ')}].`,
        );
      }
    }

    // 3. Cannot rename or overwrite management interface as WAN if WAN protection locks it
    if (
      (mgmtIface === wanIface || (wanTraced.success && wanTraced.ports.includes(mgmtIface))) &&
      protectWan &&
      !(traced.success && traced.ports.some((p) => !memberPorts.has(p) && !wanPhysicalSet.has(p) && isPhysicalInterfaceActive(p, discovery)))
    ) {
      blockedReasons.push(
        `مسار الإدارة يمر عبر واجهة WAN (${wanIface})؛ تفعيل حجب منافذ الإدارة على WAN سيغلق الاتصال عن SudaFi.`,
      );
    }

    // 4. Cannot rename management interface automatically without breaking current access
    if (dto.wan?.renameInterfaceTo && dto.wan.renameInterfaceTo.trim() !== wanIface && mgmtIface === wanIface) {
      blockedReasons.push(`لا يُسمح بإعادة تسمية واجهة WAN (${wanIface}) لأنها واجهة الإدارة الحالية.`);
    }

    // 5. Verify clean template doesn't collide management IP with subscriber gateway subnet unless bridge matches
    const gwIpClean = dto.lan.gatewayIp.split('/')[0];
    if (isClean && gwIpClean === cleanHost && mgmtIface !== bridgeName) {
      blockedReasons.push(
        `عنوان بوابة الهوتسبوت (${gwIpClean}) يطابق عنوان الإدارة الحالي على واجهة مختلفة (${mgmtIface}).`,
      );
    }

    // 6. Active default route egress must never be swallowed into subscriber LAN bridge ports
    const activeRouteSummary = resolveActiveDefaultRoutesEgress(
      discovery.routes,
      discovery.interfaces,
      discovery.ipAddresses,
    );
    for (const egressIface of activeRouteSummary.egressInterfaces) {
      const egressTrace = this.traceToPhysicalPorts(egressIface, discovery);
      const conflictPorts = egressTrace.success
        ? egressTrace.ports.filter((p) => memberPorts.has(p))
        : [];
      if (memberPorts.has(egressIface) || conflictPorts.length > 0) {
        blockedReasons.push(
          `منفذ خروج المسار الافتراضي النشط (${egressIface}${conflictPorts.length > 0 ? `: [${conflictPorts.join(', ')}]` : ''}) مدرج ضمن منافذ شبكة المشتركين (LAN Bridge)؛ ضمه للجسر سيعزل اتصال الإنترنت للراوتر.`,
        );
      }
    }

    return {
      isDetermined: true,
      isSevered: blockedReasons.length > 0,
      mgmtIp: cleanHost,
      mgmtInterface: mgmtIface,
      mgmtPhysicalPorts: traced.ports,
      conflictType: blockedReasons.length > 0 ? 'MANAGEMENT_SAFETY_BLOCK' : undefined,
      blockedReasons,
      warnings,
    };
  }

  /**
   * Fails CLOSED on cycles, unknown interface types, or unresolvable virtual ports.
   */
  traceToPhysicalPorts(
    ifaceName: string,
    discovery: FullRouterDiscoveryReport,
    visited = new Set<string>(),
    depth = 0,
  ): { success: boolean; ports: string[]; reason?: string } {
    if (!ifaceName || depth > 10 || visited.has(ifaceName)) {
      return { success: false, ports: [], reason: `مسار دائري أو غير صالح (${ifaceName})` };
    }
    const nextVisited = new Set(visited);
    nextVisited.add(ifaceName);

    const bridge = discovery.bridges.find((b) => b.name === ifaceName);
    if (bridge) {
      const bps = discovery.bridgePorts.filter((bp) => bp.bridge === ifaceName && !bp.disabled);
      if (bps.length === 0) {
        return { success: false, ports: [], reason: `الجسر (${ifaceName}) لا يضم أي منافذ نشطة` };
      }
      const ports: string[] = [];
      for (const bp of bps) {
        const sub = this.traceToPhysicalPorts(bp.interface, discovery, nextVisited, depth + 1);
        if (!sub.success) return sub; // Fail-Closed: one untraceable member port invalidates full safety proof
        ports.push(...sub.ports);
      }
      return { success: true, ports: Array.from(new Set(ports)) };
    }

    const vlan = discovery.vlans.find((v) => v.name === ifaceName && !v.disabled);
    if (vlan) {
      return this.traceToPhysicalPorts(vlan.interface, discovery, nextVisited, depth + 1);
    }

    const pppoe = discovery.pppoeClients?.find((p) => p.name === ifaceName && !p.disabled);
    if (pppoe) {
      if (!pppoe.interface) {
        return { success: false, ports: [], reason: `واجهة PPPoE (${ifaceName}) بدون واجهة أم محددة` };
      }
      return this.traceToPhysicalPorts(pppoe.interface, discovery, nextVisited, depth + 1);
    }

    const bonding = discovery.bondingInterfaces?.find((b) => b.name === ifaceName && !b.disabled);
    if (bonding) {
      if (
        !Array.isArray(bonding.slaves) ||
        bonding.slaves.length === 0 ||
        bonding.slaves.some((s) => typeof s !== 'string' || !s.trim())
      ) {
        return { success: false, ports: [], reason: `واجهة Bonding (${ifaceName}) لا تحتوي على منافذ slaves صالحة` };
      }
      const bondedPorts: string[] = [];
      for (const slave of bonding.slaves) {
        const sub = this.traceToPhysicalPorts(slave.trim(), discovery, nextVisited, depth + 1);
        if (!sub.success) return sub;
        bondedPorts.push(...sub.ports);
      }
      return { success: true, ports: Array.from(new Set(bondedPorts)) };
    }

    const ifaceObj = discovery.interfaces.find((i) => i.name === ifaceName);
    if (!ifaceObj || !ifaceObj.type || ifaceObj.type === 'unknown') {
      return { success: false, ports: [], reason: `نوع الواجهة (${ifaceName}) مجهول أو غير مكتشف` };
    }
    if (ifaceObj.disabled) {
      return { success: false, ports: [], reason: `الواجهة (${ifaceName}) معطلة` };
    }

    const t = ifaceObj.type.toLowerCase();
    if (t === 'ether' || t === 'wlan' || t === 'wifi' || t.includes('sfp')) {
      return { success: true, ports: [ifaceObj.name] };
    }

    return { success: false, ports: [], reason: `الواجهة (${ifaceName}) من النوع (${ifaceObj.type}) لا يمكن تتبعها كمنفذ فيزيائي` };
  }

  assertPlanValidOrThrow(errors: string[]): void {
    if (errors.length > 0) {
      throw new BadRequestException({
        code: 'PROVISIONING_VALIDATION_FAILED',
        message: errors[0],
        errors,
      });
    }
  }
}
