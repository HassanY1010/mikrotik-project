import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PlanSigningService } from '../../../core/security/signing.service';
import { resolveActiveDefaultRoutesEgress } from '../utils/topology-helpers.util';
import type { AutoProvisionConfigDto } from '../dto/auto-provisioning.dto';
import type {
  AutoProvisioningPlan,
  FullRouterDiscoveryReport,
  PlannedCommandSpec,
  PlannedProvisioningStage,
  ProvisioningStageId,
} from '../interfaces/auto-provisioning.interface';
import { RouterCompatibilityService } from './router-compatibility.service';
import { ProvisioningValidatorService } from './provisioning-validator.service';

@Injectable()
export class ConfigurationPlannerService {
  constructor(
    private readonly compatibilityService: RouterCompatibilityService,
    private readonly validatorService: ProvisioningValidatorService,
    private readonly planSigningService: PlanSigningService,
  ) {}

  /**
   * Builds the full 12-stage parameterized Auto Provisioning Plan matched strictly
   * to discovered device hardware, capabilities, and OS compatibility adapter.
   */
  buildPlan(
    config: AutoProvisionConfigDto,
    discovery: FullRouterDiscoveryReport,
    tenantId = 'tenant-default',
  ): AutoProvisioningPlan {
    const { capabilities } = discovery;
    const adapter = this.compatibilityService.resolveAdapter(capabilities);
    const validation = this.validatorService.validateAndSanitizeConfig(config, discovery);
    const managementSafety = this.validatorService.verifyManagementSafety(discovery, config);

    const wanConfirmationReasons: string[] = [];
    if (discovery.wanRoleAmbiguous && !config.confirmWanChange) {
      wanConfirmationReasons.push(
        `لم يتم الجزم آلياً بهوية منفذ WAN؛ يرجى تأكيد اختيار (${config.wan.interface}) كمنفذ إنترنت.`,
      );
    }
    const activeRouteEgress = resolveActiveDefaultRoutesEgress(
      discovery.routes,
      discovery.interfaces,
      discovery.ipAddresses,
    );
    const existingDefaultRoute = activeRouteEgress.activeDefaultRoutes[0];
    const selectedWan = config.wan.interface.trim();
    const wanTrace = this.validatorService.traceToPhysicalPorts(selectedWan, discovery);
    const selectedWanRelated = new Set<string>([
      selectedWan,
      ...(wanTrace.success ? wanTrace.ports : []),
    ]);
    const mismatchedRouteEgress = activeRouteEgress.egressInterfaces.filter(
      (egress) => !selectedWanRelated.has(egress) && egress !== config.wan.renameInterfaceTo?.trim(),
    );
    const existingWanDiffers =
      (Boolean(discovery.suggestedWanInterface) &&
        discovery.suggestedWanInterface !== selectedWan) ||
      mismatchedRouteEgress.length > 0;
    if (
      (existingWanDiffers ||
        (existingDefaultRoute &&
          (config.wan.mode === 'STATIC' ||
            activeRouteEgress.hasAmbiguousEgress ||
            activeRouteEgress.hasEcmp))) &&
      !config.confirmWanChange
    ) {
      const currentEgressDesc =
        mismatchedRouteEgress.length > 0
          ? mismatchedRouteEgress.join(', ')
          : discovery.suggestedWanInterface || existingDefaultRoute?.gateway || 'موجود';
      wanConfirmationReasons.push(
        `يوجد إعداد WAN/مسار افتراضي حالي (${currentEgressDesc}) يختلف عن الواجهة المحددة (${selectedWan}) أو متعدد المسارات؛ يرجى تأكيد تغيير WAN.`,
      );
    }

    const stages: PlannedProvisioningStage[] = [];
    let nextCmdOrder = 1;

    const pushStage = (params: {
      stepOrder: number;
      stage: ProvisioningStageId;
      title: string;
      description: string;
      dependsOn: ProvisioningStageId[];
      preconditions: string[];
      requiredCapabilities: string[];
      expectedResult: string;
      validationRule: string;
      rollbackAction: string;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      buildCmds: (startOrder: number) => PlannedCommandSpec[];
      currentItems?: string[];
      skipCondition?: { skip: boolean; reason: string; existing?: boolean };
    }) => {
      for (const reqCap of params.requiredCapabilities) {
        const capCheck = this.compatibilityService.checkRequiredCapability(reqCap, capabilities);
        if (!capCheck.satisfied) {
          stages.push({
            stepOrder: params.stepOrder,
            stage: params.stage,
            title: params.title,
            description: params.description,
            status: 'SKIPPED_UNSUPPORTED',
            skipReason: capCheck.reason,
            dependsOn: params.dependsOn,
            preconditions: params.preconditions,
            requiredCapabilities: params.requiredCapabilities,
            expectedResult: 'تخطي آمن دون التأثير على بقية المراحل.',
            validationRule: 'غير مطلوب لهذا الراوتر.',
            rollbackAction: 'لا يلزم تراجع.',
            riskLevel: 'LOW',
            diffSummary: {
              currentItems: params.currentItems || [],
              addedItems: [],
              changedItems: [],
              skippedItems: [capCheck.reason || params.title],
            },
            commands: [],
          });
          return;
        }
      }

      if (params.skipCondition?.skip) {
        stages.push({
          stepOrder: params.stepOrder,
          stage: params.stage,
          title: params.title,
          description: params.description,
          status: params.skipCondition.existing ? 'SKIPPED_EXISTING' : 'SKIPPED_UNSUPPORTED',
          skipReason: params.skipCondition.reason,
          dependsOn: params.dependsOn,
          preconditions: params.preconditions,
          requiredCapabilities: params.requiredCapabilities,
          expectedResult: 'مُحافظ على الإعداد القائم.',
          validationRule: 'لا يتطلب تعديلاً.',
          rollbackAction: 'لا يلزم تراجع.',
          riskLevel: 'LOW',
          diffSummary: {
            currentItems: params.currentItems || [],
            addedItems: [],
            changedItems: [],
            skippedItems: [params.skipCondition.reason],
          },
          commands: [],
        });
        return;
      }

      const cmds = params.buildCmds(nextCmdOrder);
      nextCmdOrder += cmds.length;

      stages.push({
        stepOrder: params.stepOrder,
        stage: params.stage,
        title: params.title,
        description: params.description,
        status: cmds.length > 0 ? 'PLANNED' : 'SKIPPED_EXISTING',
        skipReason: cmds.length === 0 ? 'الإعدادات متطابقة بالفعل على الراوتر.' : undefined,
        dependsOn: params.dependsOn,
        preconditions: params.preconditions,
        requiredCapabilities: params.requiredCapabilities,
        expectedResult: params.expectedResult,
        validationRule: params.validationRule,
        rollbackAction: params.rollbackAction,
        riskLevel: params.riskLevel,
        diffSummary: {
          currentItems: params.currentItems || [],
          addedItems: cmds
            .filter((c) => !c.executionWords[0]?.endsWith('/set'))
            .map((c) => c.description),
          changedItems: cmds
            .filter((c) => c.executionWords[0]?.endsWith('/set'))
            .map((c) => c.description),
          skippedItems: cmds.length === 0 ? ['الإعدادات موجودة ومتوافقة مسبقاً'] : [],
        },
        commands: cmds,
      });
    };

    const bridgeName = (config.lan.bridgeName || 'bridge-hotspot').trim();
    const adapterCtx = { config, discovery, capabilities, startOrder: nextCmdOrder };

    // 1. WAN
    pushStage({
      stepOrder: 1,
      stage: 'WAN',
      title: 'إعداد بوابة الإنترنت (WAN)',
      description: `تهيئة (${config.wan.interface}) بنظام (${config.wan.mode}).`,
      dependsOn: [],
      preconditions: ['وجود واجهة WAN مختارة وغير معزولة للإدارة'],
      requiredCapabilities: [],
      expectedResult: 'الحصول على اتصال WAN ومسار افتراضي 0.0.0.0/0 نشط.',
      validationRule: 'التحقق من IP أو حالة DHCP Bound / PPPoE Running ونجاح المسار الافتراضي.',
      rollbackAction: 'حذف عميل WAN المضاف أو استعادة اسم الواجهة الأصلي.',
      riskLevel: wanConfirmationReasons.length > 0 ? 'HIGH' : 'MEDIUM',
      currentItems: discovery.dhcpClients.map((d) => `DHCP Client: ${d.interface} (${d.status || 'unknown'})`),
      buildCmds: (o) => adapter.buildWanCommands({ ...adapterCtx, startOrder: o }),
    });

    // 2. LAN Bridge
    pushStage({
      stepOrder: 2,
      stage: 'LAN_BRIDGE',
      title: 'إنشاء وتجهيز جسر المشتركين (LAN Bridge)',
      description: `إنشاء الجسر (${bridgeName}) وضم المنافذ [${config.lan.memberInterfaces.join(', ')}] بأمان دون سحب منفذ الإدارة.`,
      dependsOn: ['WAN'],
      preconditions: ['مسار الإدارة السليم محقق (Management Safety)', 'خلو الجسر من منافذ WAN'],
      requiredCapabilities: [],
      expectedResult: `تفعيل الجسر ${bridgeName} مع عزل Horizon عند التفعيل.`,
      validationRule: `التحقق من وجود الجسر ${bridgeName} وعضوية المنافذ المطلوبة.`,
      rollbackAction: 'فك المنافذ المضافة وحذف الجسر الجديد المملوك لـ SudaFi.',
      riskLevel: 'HIGH',
      currentItems: discovery.bridges.map((b) => `Bridge: ${b.name}`),
      buildCmds: (o) => adapter.buildLanBridgeCommands({ ...adapterCtx, startOrder: o }),
    });

    // 3. IP Addressing
    pushStage({
      stepOrder: 3,
      stage: 'IP_ADDRESSING',
      title: 'تعيين عنونة الشبكة (IP Addressing)',
      description: `تعيين البوابة (${config.lan.gatewayIp}) على الجسر (${bridgeName}).`,
      dependsOn: ['LAN_BRIDGE'],
      preconditions: [`وجود الجسر (${bridgeName})`],
      requiredCapabilities: [],
      expectedResult: `توفر عنوان البوابة (${config.lan.gatewayIp}) نشطاً على ${bridgeName}.`,
      validationRule: `التحقق من ظهور العنوان ${config.lan.gatewayIp} في /ip/address.`,
      rollbackAction: 'حذف عنوان IP المضاف على الجسر.',
      riskLevel: 'MEDIUM',
      currentItems: discovery.ipAddresses.map((ip) => `${ip.address} -> ${ip.interface}`),
      buildCmds: (o) => adapter.buildIpAddressingCommands({ ...adapterCtx, startOrder: o }),
    });

    // 4. DHCP
    pushStage({
      stepOrder: 4,
      stage: 'DHCP',
      title: 'إعداد خادم توزيع العناوين (DHCP & Pool)',
      description: 'توليد Pool وتفعيل DHCP Server والشبكة ديناميكياً.',
      dependsOn: ['IP_ADDRESSING'],
      preconditions: ['تعين عنوان البوابة على الجسر'],
      requiredCapabilities: [],
      expectedResult: 'تشغيل خادم dhcp-sudafi بدون أخطاء.',
      validationRule: 'التحقق من حالة dhcp-sudafi مفعّل على الجسر.',
      rollbackAction: 'حذف الشبكة وخادم DHCP والـ Pool المنشأة.',
      riskLevel: 'LOW',
      currentItems: discovery.dhcpServers.map((s) => `DHCP Server: ${s.name}@${s.interface}`),
      buildCmds: (o) => adapter.buildDhcpCommands({ ...adapterCtx, startOrder: o }),
    });

    // 5. DNS
    pushStage({
      stepOrder: 5,
      stage: 'DNS',
      title: 'إعداد خدمة الأسماء (DNS)',
      description: 'ضبط خوادم DNS وتفعيل allow-remote-requests لعمل صفحة الدخول.',
      dependsOn: ['WAN'],
      preconditions: ['صلاحية كتابة إعدادات النظام'],
      requiredCapabilities: [],
      expectedResult: 'تفعيل الاستجابة لطلبات DNS المحلية.',
      validationRule: 'allow-remote-requests=yes في /ip/dns.',
      rollbackAction: 'استعادة قيم DNS السابقة من اللقطة الأولية.',
      riskLevel: 'LOW',
      currentItems: discovery.dnsConfig.servers?.length
        ? [`DNS: ${discovery.dnsConfig.servers.join(', ')}`]
        : ['DNS الافتراضي'],
      buildCmds: (o) => adapter.buildDnsCommands({ ...adapterCtx, startOrder: o }),
    });

    // 6. Firewall
    pushStage({
      stepOrder: 6,
      stage: 'FIREWALL',
      title: 'سياسات جدار الحماية ومكافحة التشارك (Firewall)',
      description: 'تثبيت TTL=1 وحماية منافذ الإدارة وقواعد الاتصالات القائمة.',
      dependsOn: ['LAN_BRIDGE', 'WAN'],
      preconditions: ['تحقق عدم حظر جلسة الإدارة الحالية'],
      requiredCapabilities: [],
      expectedResult: 'حماية منافذ الإدارة وتفعيل Anti-Tethering Mangle.',
      validationRule: 'وجود قواعد SudaFi_Anti_Tethering_TTL وSudaFi_Drop_Subscriber_Admin_Ports.',
      rollbackAction: 'إزالة قواعد Filter و Mangle التي أنشأتها العملية.',
      riskLevel: config.securityPolicies?.protectWanAccess ? 'HIGH' : 'MEDIUM',
      currentItems: discovery.mangleRules.map((m) => `Mangle: ${m.action} (${m.comment || 'no-comment'})`),
      buildCmds: (o) => adapter.buildFirewallCommands({ ...adapterCtx, startOrder: o }),
    });

    // 7. NAT
    pushStage({
      stepOrder: 7,
      stage: 'NAT',
      title: 'تحويل العناوين (NAT & DNS Redirect)',
      description: 'تفعيل Masquerade على WAN وإعادة توجيه استعلامات DNS.',
      dependsOn: ['WAN', 'DNS', 'IP_ADDRESSING'],
      preconditions: ['تحديد منفذ الخروج الفعلي'],
      requiredCapabilities: [],
      expectedResult: 'مرور إنترنت للمشتركين المصادقين وإلزام DNS الكاش.',
      validationRule: 'وجود قاعدة masquerade فعالة.',
      rollbackAction: 'إزالة قواعد NAT المضافة.',
      riskLevel: 'LOW',
      currentItems: discovery.natRules.map((n) => `NAT: ${n.chain}/${n.action}`),
      buildCmds: (o) => adapter.buildNatCommands({ ...adapterCtx, startOrder: o }),
    });

    // 8. Wireless / WiFi
    pushStage({
      stepOrder: 8,
      stage: 'WIRELESS_WIFI',
      title: 'الشبكة اللاسلكية (Wireless / WiFi)',
      description: `تهيئة البث اللاسلكي حسب الحزمة المكتشفة (${capabilities.wirelessStack}).`,
      dependsOn: ['LAN_BRIDGE'],
      preconditions: ['وجود واجهة وحزمة Wireless أو WiFi فعلية'],
      requiredCapabilities: config.wireless?.enabled ? ['WIRELESS_OR_WIFI'] : [],
      expectedResult: 'بث الشبكة اللاسلكية بالمعايير المحددة وتشفير WPA2/WPA3 عند إدخال كلمة مرور.',
      validationRule: 'تفعيل واجهة WiFi/Wireless بالاسم SSID المختار.',
      rollbackAction: 'إعادة تعطيل البث أو إزالة Security Profile المضاف.',
      riskLevel: 'LOW',
      skipCondition: !config.wireless?.enabled
        ? { skip: true, reason: 'تم اختيار عدم تفعيل الوايرلس في إعدادات المستخدم.' }
        : undefined,
      currentItems: [
        ...capabilities.wirelessInterfaces.map((w) => `WLAN: ${w.name} (${w.ssid || 'no-ssid'})`),
        ...capabilities.wifiInterfaces.map((w) => `WiFi: ${w.name} (${w.ssid || 'no-ssid'})`),
      ],
      buildCmds: (o) => adapter.buildWirelessCommands({ ...adapterCtx, startOrder: o }),
    });

    // 9. Hotspot Server & Server Profile
    pushStage({
      stepOrder: 9,
      stage: 'HOTSPOT',
      title: 'تشغيل خادم الهوتسبوت و Walled Garden',
      description: 'إنشاء Server Profile (Cookie + HTTP-CHAP) وربط خادم الهوتسبوت بـ SudaFi.',
      dependsOn: ['DHCP', 'DNS', 'NAT'],
      preconditions: ['وجود جسر LAN وPool وبوابة نشطة', 'توفر حزمة Hotspot'],
      requiredCapabilities: ['HOTSPOT'],
      expectedResult: 'عمل خادم الهوتسبوت بصورة نشطة دون حالة invalid.',
      validationRule: 'فحص /ip/hotspot عدم كونه disabled أو invalid.',
      rollbackAction: 'حذف خادم وبروفايل الهوتسبوت واستثناءات Walled Garden.',
      riskLevel: 'MEDIUM',
      currentItems: discovery.hotspotServers.map((s) => `Hotspot: ${s.name}@${s.interface}`),
      buildCmds: (o) => adapter.buildHotspotCommands({ ...adapterCtx, startOrder: o }),
    });

    // 10. User Profiles
    pushStage({
      stepOrder: 10,
      stage: 'USER_PROFILES',
      title: 'ملف تعريف المشتركين والكروت (User Profiles)',
      description: 'إعداد سرعات الكروت ومنع التشارك المتزامن (Shared Users=1).',
      dependsOn: ['HOTSPOT'],
      preconditions: ['وجود خادم هوتسبوت نشط'],
      requiredCapabilities: ['HOTSPOT'],
      expectedResult: 'تطابق ملف البروفايل والسرعة الافتراضية على الراوتر و SudaFi.',
      validationRule: 'مطابقة name و rate-limit في /ip/hotspot/user/profile.',
      rollbackAction: 'حذف أو استعادة إعدادات User Profile المضافة.',
      riskLevel: 'LOW',
      currentItems: discovery.hotspotUserProfiles.map((p) => `${p.name} (${p.rateLimit || 'unlimited'})`),
      buildCmds: (o) => adapter.buildUserProfileCommands({ ...adapterCtx, startOrder: o }),
    });

    // 11. Queues
    pushStage({
      stepOrder: 11,
      stage: 'QUEUES',
      title: 'إدارة العدالة والطوابير (SFQ Queues)',
      description: 'إعداد توزيع السرعة العادل SFQ دون تحطم على الموديلات مختلفة المعمارية.',
      dependsOn: ['IP_ADDRESSING'],
      preconditions: ['توفر Queue Types'],
      requiredCapabilities: config.queues?.enabled !== false ? ['QUEUES'] : [],
      expectedResult: 'تهيئة طابور SFQ فعال.',
      validationRule: 'وجود نوع SFQ المستهدف في /queue/type.',
      rollbackAction: 'حذف نوع الطابور المخصص أو استعادة نوع default السابق.',
      riskLevel: 'LOW',
      skipCondition:
        config.queues?.enabled === false
          ? { skip: true, reason: 'خيار الطوابير SFQ معطل في إعدادات العملية.' }
          : undefined,
      currentItems: discovery.queueTypes.slice(0, 6).map((q) => `${q.name}: ${q.kind}`),
      buildCmds: (o) => adapter.buildQueueCommands({ ...adapterCtx, startOrder: o }),
    });

    // 12. Scheduler, NTP, Timezone & Monitoring
    pushStage({
      stepOrder: 12,
      stage: 'SCHEDULER_MONITORING',
      title: 'الوقت والنسخ المجدول والمراقبة (Scheduler & Monitoring)',
      description: 'ضبط الهوية والمنطقة الزمنية وNTP وفق ROS6/ROS7 والمراقبة الدورية الاختيارية.',
      dependsOn: ['WAN', 'DNS'],
      preconditions: ['صلاحية إدارة النظام'],
      requiredCapabilities: config.scheduler?.enableAutoBackupSchedule ? ['SCHEDULER'] : [],
      expectedResult: 'تحديث بيانات التوقيت والجدولة والمراقبة بأوامر متوافقة خالية من الأخطاء.',
      validationRule: 'نجاح تنفيذ أوامر النظام المخططة.',
      rollbackAction: 'حذف المهام المجدولة / Netwatch المضافة بهذه العملية.',
      riskLevel: 'LOW',
      currentItems: discovery.schedulers.map((s) => `Scheduler: ${s.name} (${s.interval || '-'})`),
      buildCmds: (o) => adapter.buildSchedulerAndSystemCommands({ ...adapterCtx, startOrder: o }),
    });

    const blockedReasons = [...validation.errors, ...managementSafety.blockedReasons];
    const warnings = [...validation.warnings];
    for (const mw of managementSafety.warnings) {
      warnings.push({ code: 'MANAGEMENT_NOTICE', severity: 'WARNING', message: mw });
    }
    for (const cw of capabilities.warnings) {
      warnings.push({ code: 'CAPABILITY_NOTICE', severity: 'INFO', message: cw });
    }
    if (wanConfirmationReasons.length > 0) {
      warnings.push({
        code: 'WAN_CONFIRMATION_REQUIRED',
        severity: 'CRITICAL',
        message: wanConfirmationReasons.join(' '),
        suggestedAction: 'تأكد من واجهة الإنترنت الفعلية وفعّل تأكيد تغيير WAN قبل التنفيذ.',
      });
    }

    const totalPlannedCommands = stages.reduce((sum, st) => sum + st.commands.length, 0);
    const addedItems = stages.flatMap((s) => s.diffSummary.addedItems);
    const changedItems = stages.flatMap((s) => s.diffSummary.changedItems);
    const skippedItems = stages.flatMap((s) => s.diffSummary.skippedItems);
    const currentSettings = stages.flatMap((s) => s.diffSummary.currentItems);

    const flatCommands = stages.flatMap((s) =>
      s.commands.map((c) => ({ stage: s.stage, command: c.commandMasked })),
    );
    const planDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          tenantId,
          deviceId: discovery.device.deviceId,
          snapshotHash: discovery.snapshotHash,
          commands: flatCommands.map((c) => c.command),
        }),
      )
      .digest('hex');

    const now = new Date();
    const sessionId = `auto-prov-${uuidv4()}`;
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const signedToken = this.planSigningService.signPlan({
      tenantId,
      deviceId: discovery.device.deviceId,
      sessionId,
      nonce,
      snapshotHash: discovery.snapshotHash,
      expiresAt,
      commands: flatCommands,
    });

    return {
      planId: uuidv4(),
      planHash: planDigest,
      deviceId: discovery.device.deviceId,
      deviceName: discovery.device.deviceName,
      template: config.template || 'CLEAN_SETUP',
      rosVersion: discovery.device.version,
      osFamily: discovery.capabilities.osFamily,
      boardName: discovery.device.boardName,
      model: discovery.device.model,
      capabilities: discovery.capabilities,
      managementSafety,
      wanConfirmationRequired: wanConfirmationReasons.length > 0,
      wanConfirmationReasons,
      diffOverview: {
        currentSettings: Array.from(new Set(currentSettings)).slice(0, 20),
        newSettings: [...addedItems, ...changedItems].slice(0, 25),
        addedItems,
        changedItems,
        skippedItems,
        riskNotes: [
          ...managementSafety.blockedReasons,
          ...managementSafety.warnings,
          ...wanConfirmationReasons,
        ],
      },
      stages,
      totalPlannedCommands,
      canProceed: blockedReasons.length === 0 && totalPlannedCommands > 0,
      blockedReasons,
      warnings,
      requiresBackup: true,
      createdAt: now.toISOString(),
      planToken: {
        tenantId,
        deviceId: discovery.device.deviceId,
        sessionId,
        nonce,
        planHash: planDigest,
        snapshotHash: discovery.snapshotHash,
        issuedAt: now.toISOString(),
        expiresAt,
        canonicalPayload: signedToken.canonicalPayload,
        signature: signedToken.signature,
        publicKey: signedToken.publicKey,
      },
    };
  }
}
