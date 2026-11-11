import { Injectable } from '@nestjs/common';
import type {
  NtpStackType,
  RouterCapabilities,
  RouterOsMajorFamily,
  WirelessStackType,
} from '../interfaces/auto-provisioning.interface';
import type {
  RouterInterfaceItem,
  RouterPackageItem,
  RouterQueueTypeItem,
  RouterResource,
  RouterWifiInterfaceItem,
  RouterWirelessInterfaceItem,
  RouterboardInfo,
} from '../../../core/mikrotik/interfaces/mikrotik-client.interface';

export interface CapabilityDetectionInput {
  resource: RouterResource;
  routerboard?: RouterboardInfo;
  packages: RouterPackageItem[];
  interfaces: RouterInterfaceItem[];
  wirelessInterfaces: RouterWirelessInterfaceItem[];
  wifiInterfaces: RouterWifiInterfaceItem[];
  queueTypes: RouterQueueTypeItem[];
  connectionProtocol?: 'API' | 'API_SSL' | 'REST';
}

@Injectable()
export class RouterCapabilityService {
  /**
   * Parses version string (e.g. "7.15.2 (stable)", "6.49.13 (long-term)", "V7", "unknown").
   */
  parseRouterOsVersion(versionStr?: string): {
    osFamily: RouterOsMajorFamily;
    majorVersion: number;
    minorVersion: number;
  } {
    const raw = (versionStr || '').trim();
    const numericMatch = raw.match(/(\d+)\.(\d+)/);
    if (numericMatch) {
      const major = parseInt(numericMatch[1], 10);
      const minor = parseInt(numericMatch[2], 10);
      if (major >= 7) return { osFamily: 'ROS7', majorVersion: major, minorVersion: minor };
      if (major === 6) return { osFamily: 'ROS6', majorVersion: 6, minorVersion: minor };
    }
    if (/^v?7\b/i.test(raw)) return { osFamily: 'ROS7', majorVersion: 7, minorVersion: 0 };
    if (/^v?6\b/i.test(raw)) return { osFamily: 'ROS6', majorVersion: 6, minorVersion: 0 };
    return { osFamily: 'UNKNOWN', majorVersion: 0, minorVersion: 0 };
  }

  /**
   * Detects hardware & software capabilities through actual feature inspection
   * (packages, interface types, disk space, RouterOS branch) without hardcoded model guesses.
   */
  detectCapabilities(input: CapabilityDetectionInput): RouterCapabilities {
    const {
      resource,
      routerboard,
      packages,
      interfaces,
      wirelessInterfaces,
      wifiInterfaces,
      queueTypes,
      connectionProtocol = 'API',
    } = input;

    const { osFamily, majorVersion, minorVersion } = this.parseRouterOsVersion(resource.version);
    const activePkgNames = new Set(
      packages.filter((p) => !p.disabled).map((p) => (p.name || '').toLowerCase()),
    );
    // Built-in ROS bundle (e.g. "routeros" meta-package on 7.x includes hotspot/dhcp/routing)
    const hasCoreBundle =
      activePkgNames.has('routeros') ||
      activePkgNames.has('routeros-arm') ||
      activePkgNames.has('routeros-mipsbe') ||
      activePkgNames.has('routeros-mmips') ||
      activePkgNames.has('routeros-smips') ||
      activePkgNames.has('routeros-x86') ||
      activePkgNames.has('system') ||
      packages.length === 0;

    const supportsHotspot = activePkgNames.has('hotspot') || hasCoreBundle;

    // Feature Detection for Wireless vs WiFi
    const ifaceTypes = new Set(interfaces.map((i) => (i.type || '').toLowerCase()));
    const hasWifiQcomPkg =
      activePkgNames.has('wifi-qcom') ||
      activePkgNames.has('wifi-qcom-ac') ||
      activePkgNames.has('wifi');
    const hasWifiWave2Pkg = activePkgNames.has('wifiwave2');
    const hasLegacyWirelessPkg = activePkgNames.has('wireless');

    const detectedWifiCount =
      wifiInterfaces.length + interfaces.filter((i) => i.type === 'wifi').length;
    const detectedWlanCount =
      wirelessInterfaces.length + interfaces.filter((i) => i.type === 'wlan').length;

    let wirelessStack: WirelessStackType = 'NONE';
    if (osFamily === 'ROS7') {
      if (wifiInterfaces.length > 0 || hasWifiQcomPkg || ifaceTypes.has('wifi')) {
        wirelessStack = majorVersion === 7 && minorVersion < 13 && hasWifiWave2Pkg ? 'WIFIWAVE2' : 'WIFI_QCOM';
      } else if (hasWifiWave2Pkg) {
        wirelessStack = 'WIFIWAVE2';
      } else if (wirelessInterfaces.length > 0 || hasLegacyWirelessPkg || ifaceTypes.has('wlan')) {
        wirelessStack = 'LEGACY_WIRELESS';
      }
    } else if (osFamily === 'ROS6') {
      if (wirelessInterfaces.length > 0 || hasLegacyWirelessPkg || ifaceTypes.has('wlan')) {
        wirelessStack = 'LEGACY_WIRELESS';
      }
    } else {
      if (wifiInterfaces.length > 0) wirelessStack = 'WIFI_QCOM';
      else if (wirelessInterfaces.length > 0) wirelessStack = 'LEGACY_WIRELESS';
    }

    const supportsWifi =
      (wirelessStack === 'WIFI_QCOM' || wirelessStack === 'WIFIWAVE2') && detectedWifiCount > 0;
    const supportsWireless = wirelessStack === 'LEGACY_WIRELESS' && detectedWlanCount > 0;
    if (!supportsWifi && !supportsWireless) {
      wirelessStack = 'NONE';
    }

    // NTP Detection
    let ntpStack: NtpStackType = 'NONE';
    let supportsNtpServersTable = false;
    if (osFamily === 'ROS7') {
      ntpStack = 'NTP_V7';
      supportsNtpServersTable = true;
    } else if (osFamily === 'ROS6') {
      ntpStack = activePkgNames.has('ntp') ? 'NTP_PKG_V6' : 'SNTP_V6';
    }

    const ethernetPorts = interfaces
      .filter((i) => (i.type || '').toLowerCase() === 'ether')
      .map((i) => i.name);
    const sfpPorts = interfaces
      .filter((i) => (i.type || '').toLowerCase().includes('sfp'))
      .map((i) => i.name);

    const freeHddBytes = resource.freeHdd ?? 0;
    const hasEnoughDiskForBackup = freeHddBytes === 0 ? true : freeHddBytes >= 256 * 1024; // Warn only if explicitly reported < 256 KB

    const warnings: string[] = [];
    if (osFamily === 'UNKNOWN') {
      warnings.push(
        `إصدار RouterOS (${resource.version}) غير معروف بدقة؛ سيتم التحقق من الميزات قبل التنفيذ.`,
      );
    }
    if (!supportsWifi && !supportsWireless) {
      warnings.push('الجهاز لا يحتوي على واجهة أو حزمة WiFi/Wireless مفعلة — سيتم إخفاء وتخطي إعداد الشبكة اللاسلكية تلقائياً.');
    }
    if (!hasEnoughDiskForBackup) {
      warnings.push(
        `المساحة المتاحة على ذاكرة الراوتر منخفضة (${Math.round(freeHddBytes / 1024)} KB) وقد تعيق حفظ النسخ الاحتياطية.`,
      );
    }
    if (connectionProtocol === 'REST') {
      warnings.push(
        'اتصال REST (HTTP/S) لا يدعم جلسة CLI Safe Mode التفاعلية؛ يتم الاعتماد على النسخ الاحتياطي المسبق وحماية الإدارة وسجل التراجع المملوك.',
      );
    }

    const isCompatible = osFamily === 'ROS6' || osFamily === 'ROS7' || ethernetPorts.length > 0;
    const compatibilityStatus = !isCompatible
      ? 'INCOMPATIBLE'
      : warnings.length > 0
        ? 'COMPATIBLE_WITH_LIMITATIONS'
        : 'COMPATIBLE';

    const compatibilitySummary =
      compatibilityStatus === 'COMPATIBLE'
        ? `الراوتر متوافق بالكامل (${osFamily === 'ROS7' ? 'RouterOS 7' : 'RouterOS 6'} - ${ethernetPorts.length + sfpPorts.length} منافذ فيزيائية).`
        : compatibilityStatus === 'COMPATIBLE_WITH_LIMITATIONS'
          ? `الراوتر متوافق مع تكييف الميزات المتاحة (${ethernetPorts.length} منافذ، WiFi: ${wirelessStack}).`
          : 'الراوتر غير متوافق مع متطلبات البرمجة التلقائية الأساسية.';

    return {
      osFamily,
      version: resource.version || 'unknown',
      majorVersion,
      minorVersion,
      boardName: resource.boardName || routerboard?.model || 'Unknown Board',
      model: routerboard?.model || resource.model || resource.boardName || 'RouterBOARD',
      architecture: resource.architecture || 'unknown',
      supportsHotspot,
      wirelessStack,
      supportsWireless,
      supportsWifi,
      wirelessInterfaces: wirelessInterfaces.map((w) => ({
        name: w.name,
        defaultName: w.defaultName,
        ssid: w.ssid,
        disabled: Boolean(w.disabled),
      })),
      wifiInterfaces: wifiInterfaces.map((w) => ({
        name: w.name,
        defaultName: w.defaultName,
        ssid: w.ssid,
        disabled: Boolean(w.disabled),
      })),
      ntpStack,
      supportsNtpServersTable,
      supportsQueueTypes: queueTypes.length > 0 || hasCoreBundle,
      supportsScheduler: hasCoreBundle,
      supportsNetwatch: hasCoreBundle,
      supportsRscExport: true,
      supportsBinaryBackup: true,
      supportsRestApi: osFamily === 'ROS7',
      supportsSafeModeInCurrentSession: false, // Binary API & stateless REST must NEVER falsely claim console Safe Mode protection
      safeModeReason:
        connectionProtocol === 'REST'
          ? 'REST API عديم الحالة ولا يدعم Safe Mode التفاعلي؛ الحماية تتحقق بالنسخ الاحتياطي + قفل الإدارة + مكدس التراجع.'
          : 'واجهة API المبرمجة لا تضمن استبقاء Safe Mode كـ Terminal تفاعلي؛ يعتمد المحرك على التراجع الموجه وفحص مسار الإدارة.',
      hasEnoughDiskForBackup,
      freeHddBytes,
      ethernetPorts,
      sfpPorts,
      totalPhysicalPorts: ethernetPorts.length + sfpPorts.length,
      installedPackages: packages.map((p) => ({
        name: p.name,
        version: p.version,
        disabled: Boolean(p.disabled),
      })),
      isCompatible,
      compatibilityStatus,
      compatibilitySummary,
      warnings,
    };
  }
}
