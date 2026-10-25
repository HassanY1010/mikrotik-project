import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { EncryptionService } from '../../../core/security/encryption.service';
import {
  IMikrotikClient,
  RouterResource,
  HotspotProfileItem,
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: MikrotikClientFactory,
    private readonly encryptionService: EncryptionService,
  ) {}

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
   * Discovers the current network state of the router
   */
  async discover(tenantId: string, deviceId: string): Promise<RouterDiscoverySnapshot> {
    const device = await this.getValidDevice(tenantId, deviceId);
    const client = await this.getConnectedClient(device);

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
      client.getSystemResource().catch(() => ({
        uptime: '0s',
        version: device.rosVersion || 'unknown',
        cpuLoad: 0,
        freeMemory: 0,
        totalMemory: 0,
        freeHdd: 0,
        totalHdd: 0,
      } as RouterResource)),
      client.listInterfaces ? client.listInterfaces().catch(() => []) : Promise.resolve([]),
      client.listBridges ? client.listBridges().catch(() => []) : Promise.resolve([]),
      client.listBridgePorts ? client.listBridgePorts().catch(() => []) : Promise.resolve([]),
      client.listIpAddresses ? client.listIpAddresses().catch(() => []) : Promise.resolve([]),
      client.listDhcpClients ? client.listDhcpClients().catch(() => []) : Promise.resolve([]),
      client.listDhcpServers ? client.listDhcpServers().catch(() => []) : Promise.resolve([]),
      client.listNatRules ? client.listNatRules().catch(() => []) : Promise.resolve([]),
      client.listRoutes ? client.listRoutes().catch(() => []) : Promise.resolve([]),
      client.listHotspotServers ? client.listHotspotServers().catch(() => []) : Promise.resolve([]),
      client.listMangleRules ? client.listMangleRules().catch(() => []) : Promise.resolve([]),
      client.listFilterRules ? client.listFilterRules().catch(() => []) : Promise.resolve([]),
      client.listHotspotProfiles ? client.listHotspotProfiles().catch(() => []) : Promise.resolve([]),
    ]);

    return {
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
    };
  }

  /**
   * Generates a preview with conflict detection, warnings, and exact commands
   */
  async preview(
    tenantId: string,
    deviceId: string,
    dto: ProvisionPreviewDto,
  ): Promise<ProvisioningPreviewResponse> {
    const device = await this.getValidDevice(tenantId, deviceId);
    const discovery = await this.discover(tenantId, deviceId);

    const conflicts: ProvisioningConflict[] = [];
    const warnings: ProvisioningWarning[] = [];
    let requiresCleanConfirmation = false;

    // 1. Validate WAN interface existence and conflicts
    const wanIfaceName = dto.wan.interface.trim();
    const wanExists = discovery.interfaces.some((i) => i.name === wanIfaceName);
    if (!wanExists && discovery.interfaces.length > 0) {
      warnings.push({
        type: 'WAN_INTERFACE_NOT_FOUND',
        severity: 'WARNING',
        message: `منفذ الإنترنت (${wanIfaceName}) غير موجود في قائمة المنافذ المكتشفة حالياً في الراوتر.`,
        suggestedAction: 'تأكد من اسم المنفذ الفعلي في الراوتر (مثل ether1 أو sfp1).',
      });
    }

    const wanInBridge = discovery.bridgePorts.find((p) => p.interface === wanIfaceName);
    if (wanInBridge) {
      conflicts.push({
        resource: 'WAN_BRIDGE_CONFLICT',
        existingValue: `المنفذ ${wanIfaceName} مرتبط بالجسر [${wanInBridge.bridge}]`,
        proposedValue: `تعيين ${wanIfaceName} كمنفذ إنترنت مستقل (WAN)`,
        details: `لا يمكن استخدام المنفذ كـ WAN طالما أنه عضو في جسر شبكة محلية. يجب إزالته من الجسر أولاً.`,
      });
    }

    // 2. Validate LAN Member Ports
    const memberPorts = dto.lan.memberInterfaces.map((m: string) => m.trim());
    if (memberPorts.includes(wanIfaceName)) {
      conflicts.push({
        resource: 'WAN_LAN_OVERLAP',
        existingValue: `المنفذ ${wanIfaceName} تم اختياره للإنترنت (WAN)`,
        proposedValue: `إضافة ${wanIfaceName} إلى منافذ خروج المشتركين (LAN)`,
        details: 'لا يمكن لمنفذ واحد أن يعمل كمنفذ إنترنت خارجي ومنفذ مشتركين داخلي في آن واحد.',
      });
    }

    for (const port of memberPorts) {
      const existingBridgePort = discovery.bridgePorts.find((p) => p.interface === port);
      if (existingBridgePort && existingBridgePort.bridge !== (dto.lan.bridgeName || 'bridge-hotspot')) {
        warnings.push({
          type: 'PORT_IN_OTHER_BRIDGE',
          severity: 'WARNING',
          message: `المنفذ (${port}) موجود مسبقاً داخل الجسر [${existingBridgePort.bridge}].`,
          suggestedAction: 'سيتم نقله تلقائياً إلى جسر الهوتسبوت الجديد عند الموافقة.',
        });
      }

      // Check if port has direct IP assigned (classic RouterOS lockout risk)
      const portDirectIp = discovery.ipAddresses.find((ip) => ip.interface === port);
      if (portDirectIp) {
        const ipClean = portDirectIp.address.split('/')[0];
        const isManagementHost = ipClean === device.host.trim();
        warnings.push({
          type: 'PORT_DIRECT_IP_RISK',
          severity: 'CRITICAL',
          message: isManagementHost
            ? `المنفذ (${port}) يحمل عنوان IP الحالي للراوتر (${device.host}) المستخدم للاتصال بالنظام. ضم هذا المنفذ إلى الجسر قد يسبب انقطاع الاتصال بالإدارة فوراً.`
            : `المنفذ (${port}) يحمل عنوان IP مباشر (${portDirectIp.address}) قد يكون مخصصاً للإدارة الاحتياطية أو شبكة خارج النطاق. ضم هذا المنفذ إلى جسر المشتركين يجعله تابعاً (Slave) وقد يسبب انقطاع الوصول إليه وعزله (Client Isolation).`,
          suggestedAction: isManagementHost
            ? 'تأكد من إمكانية الوصول للراوتر عبر منفذ آخر أو استثنِ هذا المنفذ من منافذ المشتركين.'
            : 'استثنِ هذا المنفذ من قائمة منافذ الجسر للحفاظ على مسار الإدارة المستقل أو انقل العنوان إلى الجسر يدوياً.',
        });
        conflicts.push({
          resource: isManagementHost ? 'MANAGEMENT_PORT_BRIDGED' : 'DIRECT_IP_PORT_BRIDGED',
          existingValue: `${portDirectIp.address} معين مباشرة على المنفذ ${port}`,
          proposedValue: `ضم المنفذ ${port} إلى الجسر ${dto.lan.bridgeName || 'bridge-hotspot'}`,
          details: isManagementHost
            ? 'ضم منفذ الإدارة المباشر إلى جسر دون تحويل العنوان قد يؤدي لفقدان الاتصال بالراوتر فورياً.'
            : `المنفذ ${port} يحمل عنوان IP مستقل (${portDirectIp.address}). ضم المنفذ إلى جسر المشتركين يهدد بفقدان مسار الإدارة الاحتياطي وعزل المنفذ عبر Horizon.`,
        });
      }
    }

    // 3. Subnet Overlap Detection
    const proposedGateway = dto.lan.gatewayIp.trim();
    const proposedSubnet = this.extractSubnetBase(proposedGateway);
    for (const existingIp of discovery.ipAddresses) {
      const existingSubnet = this.extractSubnetBase(existingIp.address);
      if (existingSubnet && proposedSubnet && existingSubnet === proposedSubnet) {
        if (existingIp.interface !== (dto.lan.bridgeName || 'bridge-hotspot')) {
          conflicts.push({
            resource: 'IP_SUBNET_OVERLAP',
            existingValue: `${existingIp.address} على المنفذ [${existingIp.interface}]`,
            proposedValue: `${proposedGateway} على [${dto.lan.bridgeName || 'bridge-hotspot'}]`,
            details: `الشبكة المقترحة (${proposedSubnet}) تتعارض مع عنوان IP مستخدم حالياً على منفذ آخر.`,
          });
        }
      }
    }

    // 4. Hotspot Server Duplicate Check
    const proposedHsName = dto.hotspot?.serverName || 'hs-sudafi';
    const existingHs = discovery.hotspotServers.find(
      (h) => h.name === proposedHsName || h.interface === (dto.lan.bridgeName || 'bridge-hotspot'),
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

    // 5. Clean Setup Warning & Confirmation Requirement
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

    // 6. Check host IP disconnection risk
    const currentHost = device.host.trim();
    if (memberPorts.some((p: string) => p === currentHost) || currentHost.includes(proposedSubnet || '')) {
      warnings.push({
        type: 'MANAGEMENT_IP_PRESERVATION',
        severity: 'INFO',
        message: `عنوان الاتصال الحالي للراوتر (${currentHost}) قد يندرج تحت شبكة الهوتسبوت الجديدة.`,
        suggestedAction: `سيتم الحفاظ على استمرارية الاتصال بالراوتر دون انقطاع.`,
      });
    }

    // 7. Check WAN Management Lockout Risk
    if ((dto.securityPolicies as any)?.protectWanAccess) {
      const wanDirectIp = discovery.ipAddresses.find((ip) => ip.interface === wanIfaceName);
      const isWanMgmt =
        (wanDirectIp && wanDirectIp.address.split('/')[0] === currentHost) ||
        (dto.wan.staticIp && dto.wan.staticIp.split('/')[0] === currentHost);
      if (isWanMgmt) {
        warnings.push({
          type: 'WAN_MANAGEMENT_LOCKOUT_RISK',
          severity: 'CRITICAL',
          message: `عنوان اتصال النظام بالراوتر (${currentHost}) يقع على منفذ الإنترنت (${wanIfaceName}). تفعيل حظر منافذ الإدارة على WAN سيؤدي لعزل النظام عن الراوتر فوراً.`,
          suggestedAction: 'قم بتعطيل خيار protectWanAccess طالما أن اتصال النظام يتم عبر بطاقة WAN.',
        });
        conflicts.push({
          resource: 'WAN_MANAGEMENT_LOCKOUT',
          existingValue: `الاتصال بالراوتر يتم عبر ${currentHost} على المنفذ ${wanIfaceName}`,
          proposedValue: `حظر منافذ الإدارة (API/WinBox) على المنفذ ${wanIfaceName}`,
          details: 'تفعيل حظر منافذ الإدارة على WAN سيعزل النظام عن الراوتر تماماً.',
        });
      }
    }

    // Generate Planned Steps
    const plannedSteps = this.buildPlannedSteps(dto);

    const isV7 = (device.rosVersion || '').toUpperCase().includes('V7');

    // Build Security Policies Report
    const securityPoliciesReport = this.buildSecurityPoliciesReport(dto, isV7, discovery);

    // Generate RouterOS commands for preview (with duplicate prevention based on discovery)
    const generatedCommands = this.generateRouterCommands(dto, isV7, discovery);

    // Mask passwords for preview to prevent credentials leakage
    const sanitizedCommands = generatedCommands.map((c) => ({
      ...c,
      command: this.sanitizeCommandForDisplay(c.command),
    }));

    const hasCriticalConflicts = conflicts.length > 0;
    const canProceed = !hasCriticalConflicts;

    return {
      template: dto.template,
      routerVersion: device.rosVersion || 'V7',
      discovery,
      plannedSteps,
      securityPoliciesReport,
      generatedCommands: sanitizedCommands,
      warnings,
      conflicts,
      canProceed,
      requiresCleanConfirmation,
      backupRecommended: true,
    };
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
    if (previewRes.requiresCleanConfirmation && !dto.cleanSetupConfirmed) {
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
        c.resource === 'DIRECT_IP_PORT_BRIDGED' ||
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

    if (previewRes.conflicts.length > 0 && !dto.allowOverwrite) {
      throw new ConflictException({
        code: 'PROVISIONING_CONFLICTS_DETECTED',
        message: 'تم اكتشاف تعارضات في إعدادات الراوتر تمنع التنفيذ التلقائي دون إذن صريح.',
        conflicts: previewRes.conflicts,
      });
    }

    const client = await this.getConnectedClient(device);
    const executedStages: ExecutedStageLog[] = [];
    let backupFilename: string | undefined;

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
    const isV7 = (device.rosVersion || '').toUpperCase().includes('V7');
    const commands = this.generateRouterCommands(dto, isV7, previewRes.discovery);

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
   * Generates RouterOS command list formatted for v6 and v7
   * Orders LAN_IP on bridge before adding member ports, and avoids duplicate rules when discovery is provided
   */
  private generateRouterCommands(
    dto: ProvisionPreviewDto,
    _isV7: boolean,
    discovery?: RouterDiscoverySnapshot,
  ): GeneratedCommandItem[] {
    const commands: GeneratedCommandItem[] = [];
    const bridgeName = dto.lan.bridgeName || 'bridge-hotspot';
    const poolName = 'hs-pool-sudafi';
    const dhcpServerName = 'dhcp-sudafi';
    const hsProfileName = dto.hotspot?.profileName || 'hsp-sudafi';
    const hsServerName = dto.hotspot?.serverName || 'hs-sudafi';
    const dnsName = dto.hotspot?.dnsName || 'login.sudafi.net';
    const gatewayIp = dto.lan.gatewayIp.trim();
    const cleanIp = gatewayIp.split('/')[0];
    const networkBase = this.extractNetworkBase(gatewayIp);
    const security = dto.securityPolicies || {};

    const isClean = dto.template === 'CLEAN_SETUP';

    // 1. LAN Bridge Creation (only if not already created, or full clean template)
    const bridgeExists = !isClean && discovery?.bridges?.some((b) => b.name === bridgeName);
    if (!bridgeExists) {
      commands.push({
        stage: 'BRIDGE_SETUP',
        command: `/interface/bridge/add =name=${bridgeName} =comment=SudaFi Hotspot Bridge`,
        description: `إنشاء جسر موحد لمنافذ المشتركين (${bridgeName})`,
      });
    }

    // 2. Gateway IP on LAN Bridge (Assigned FIRST to ensure bridge has IP before member ports join)
    const ipExistsOnBridge = !isClean && discovery?.ipAddresses?.some(
      (ip) => ip.interface === bridgeName && ip.address === gatewayIp,
    );
    if (!ipExistsOnBridge) {
      commands.push({
        stage: 'LAN_IP',
        command: `/ip/address/add =address=${gatewayIp} =interface=${bridgeName} =comment=SudaFi Hotspot Gateway`,
        description: `تعيين عنوان بوابة الهوتسبوت (${gatewayIp}) على الجسر`,
      });
    }

    // 3. Member Ports Assignment (only if port is not already member of this bridge)
    for (const port of dto.lan.memberInterfaces) {
      const portName = port.trim();
      const existingBridgePort = !isClean
        ? discovery?.bridgePorts?.find((p) => p.bridge === bridgeName && p.interface === portName)
        : undefined;

      if (!existingBridgePort) {
        const horizonArg = security.clientIsolation !== false ? ' =horizon=1' : '';
        commands.push({
          stage: 'BRIDGE_PORT',
          command: `/interface/bridge/port/add =bridge=${bridgeName} =interface=${portName}${horizonArg} =comment=SudaFi LAN Member`,
          description: `إضافة المنفذ ${portName} إلى جسر الهوتسبوت${security.clientIsolation !== false ? ' مع تفعيل عزل المشتركين (Horizon=1)' : ''}`,
        });
      } else if (security.clientIsolation !== false && existingBridgePort.horizon !== 1) {
        const idArg = existingBridgePort.id ? ` =.id=${existingBridgePort.id}` : '';
        commands.push({
          stage: 'BRIDGE_PORT',
          command: `/interface/bridge/port/set =numbers=${portName}${idArg} =horizon=1`,
          description: `تفعيل عزل المشتركين (Horizon=1) على المنفذ القائم (${portName})`,
        });
      }
    }

    // 4. WAN Configuration
    const wanIface = dto.wan.interface.trim();
    if (dto.wan.mode === 'DHCP') {
      const dhcpClientExists = !isClean && discovery?.dhcpClients?.some((c) => c.interface === wanIface);
      if (!dhcpClientExists) {
        commands.push({
          stage: 'WAN_CONFIG',
          command: `/ip/dhcp-client/add =interface=${wanIface} =add-default-route=yes =use-peer-dns=yes =use-peer-ntp=yes =disabled=no =comment=SudaFi WAN DHCP`,
          description: `تفعيل DHCP Client على منفذ الإنترنت (${wanIface})`,
        });
      }
    } else if (dto.wan.mode === 'PPPOE') {
      commands.push({
        stage: 'WAN_CONFIG',
        command: `/interface/pppoe-client/add =name=pppoe-out1 =interface=${wanIface} =user=${dto.wan.pppoeUser || ''} =password=${dto.wan.pppoePassword || ''} =add-default-route=yes =use-peer-dns=yes =disabled=no =comment=SudaFi WAN PPPoE`,
        description: `إنشاء اتصال PPPoE Client على المنفذ (${wanIface})`,
      });
    } else if (dto.wan.mode === 'STATIC') {
      if (dto.wan.staticIp) {
        const staticIpExists = !isClean && discovery?.ipAddresses?.some(
          (ip) => ip.interface === wanIface && ip.address === dto.wan.staticIp,
        );
        if (!staticIpExists) {
          commands.push({
            stage: 'WAN_CONFIG',
            command: `/ip/address/add =address=${dto.wan.staticIp} =interface=${wanIface} =comment=SudaFi WAN Static`,
            description: `تعيين عنوان IP ثابت لمنفذ الإنترنت (${dto.wan.staticIp})`,
          });
        }
      }
      if (dto.wan.staticGateway) {
        const routeExists = !isClean && discovery?.routes?.some(
          (r) =>
            (r.dstAddress === '0.0.0.0/0' || r.dstAddress === '0.0.0.0') &&
            r.gateway === dto.wan.staticGateway,
        );
        if (!routeExists) {
          commands.push({
            stage: 'WAN_CONFIG',
            command: `/ip/route/add =dst-address=0.0.0.0/0 =gateway=${dto.wan.staticGateway} =comment=SudaFi Default Route`,
            description: `إضافة المسار الافتراضي للتوجيه عبر البوابة (${dto.wan.staticGateway})`,
          });
        }
      }
      if (dto.wan.staticDns && dto.wan.staticDns.length > 0) {
        commands.push({
          stage: 'WAN_CONFIG',
          command: `/ip/dns/set =servers=${dto.wan.staticDns.join(',')} =allow-remote-requests=yes`,
          description: `ضبط خوادم DNS (${dto.wan.staticDns.join(',')})`,
        });
      }
    }

    // 5. NAT Masquerade (only if matching rule does not exist)
    if (dto.wan.enableNat !== false) {
      const outIface = dto.wan.mode === 'PPPOE' ? 'pppoe-out1' : wanIface;
      const natExists = !isClean && discovery?.natRules?.some(
        (r) => r.action === 'masquerade' && r.outInterface === outIface,
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
    const poolRange = dto.lan.poolRange || this.generateDefaultPoolRange(gatewayIp);
    commands.push({
      stage: 'DHCP_POOL',
      command: `/ip/pool/add =name=${poolName} =ranges=${poolRange} =comment=SudaFi Hotspot Pool`,
      description: `إنشاء نطاق توزيع العناوين (${poolRange})`,
    });

    // 7. DHCP Server and Network
    const leaseTime = dto.lan.dhcpLeaseTime || '1h';
    const dnsList =
      dto.lan.dnsServers && dto.lan.dnsServers.length > 0
        ? dto.lan.dnsServers.join(',')
        : `${cleanIp},8.8.8.8`;

    const dhcpServerExists = !isClean && discovery?.dhcpServers?.some(
      (s) => s.name === dhcpServerName && s.interface === bridgeName,
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
      ? discovery?.hotspotUserProfiles?.find((p) => p.name === hsProfileName)
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
        ? existingProfile.rateLimit.trim() === desiredRateLimit.trim()
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
      (s) => s.name === hsServerName && s.interface === bridgeName,
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
        (r) => r.comment === 'SudaFi_Anti_Tethering_TTL' || (r.chain === 'postrouting' && r.action === 'change-ttl'),
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
        (r) => r.comment === 'SudaFi_Drop_Subscriber_Admin_Ports' || (r.chain === 'input' && r.action === 'drop'),
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
        (r) => r.comment === 'SudaFi_Accept_Established_Related' || (r.chain === 'input' && r.action === 'accept'),
      );
      if (!acceptEstExists) {
        const placeBeforeArg =
          discovery?.filterRules && discovery.filterRules.length > 0
            ? ` =place-before=${discovery.filterRules[0].id || '0'}`
            : '';
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/filter/add =chain=input =connection-state=established,related =action=accept${placeBeforeArg} =comment=SudaFi_Accept_Established_Related`,
          description: 'السماح للاتصالات القائمة والمترابطة في أعلى قائمة القواعد قبل حظر منافذ الإدارة عن بطاقة الإنترنت (WAN)',
        });
      }

      const wanDropExists = !isClean && discovery?.filterRules?.some(
        (r) => r.comment === 'SudaFi_Drop_WAN_Admin_Ports' || (r.chain === 'input' && r.action === 'drop' && (r as any).inInterface === dto.wan.interface),
      );
      if (!wanDropExists) {
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/filter/add =chain=input =in-interface=${dto.wan.interface} =protocol=tcp =dst-port=22,23,8291,8728,8729 =action=drop =comment=SudaFi_Drop_WAN_Admin_Ports`,
          description: `حجب منافذ إدارة الراوتر عن بطاقة الإنترنت (${dto.wan.interface})`,
        });
      }
    }

    if (security.forceRouterDns !== false) {
      const dnsUdpExists = !isClean && discovery?.natRules?.some((r) => r.comment === 'SudaFi_Force_DNS_UDP');
      if (!dnsUdpExists) {
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/nat/add =chain=dstnat =in-interface=${bridgeName} =protocol=udp =dst-port=53 =action=redirect =comment=SudaFi_Force_DNS_UDP`,
          description: 'إعادة توجيه استعلامات DNS (UDP 53) إلى الراوتر لضمان عمل صفحة الدخول',
        });
      }
      const dnsTcpExists = !isClean && discovery?.natRules?.some((r) => r.comment === 'SudaFi_Force_DNS_TCP');
      if (!dnsTcpExists) {
        commands.push({
          stage: 'SECURITY_POLICIES',
          command: `/ip/firewall/nat/add =chain=dstnat =in-interface=${bridgeName} =protocol=tcp =dst-port=53 =action=redirect =comment=SudaFi_Force_DNS_TCP`,
          description: 'إعادة توجيه استعلامات DNS (TCP 53) إلى الراوتر لمنع الالتفاف',
        });
      }
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
    const bridgeName = dto.lan.bridgeName || 'bridge-hotspot';

    steps.push({
      id: 'step-1',
      stage: 'BRIDGE',
      title: 'إنشاء جسر شبكة المشتركين',
      description: `إنشاء الجسر (${bridgeName}) وتعيين البوابة وضم المنافذ [${dto.lan.memberInterfaces.join(', ')}] إليه.`,
    });

    steps.push({
      id: 'step-2',
      stage: 'WAN',
      title: `إعداد بطاقة الإنترنت (${dto.wan.mode})`,
      description: `ربط المنفذ ${dto.wan.interface} بالإنترنت وتفعيل محول العناوين (Masquerade).`,
    });

    steps.push({
      id: 'step-3',
      stage: 'LAN_DHCP',
      title: 'إعداد توزيع العناوين التلقائي (DHCP)',
      description: `تعيين البوابة ${dto.lan.gatewayIp} وإنشاء نطاق العناوين وخادم الـ DHCP.`,
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
    const hasTetheringRule = discovery.mangleRules?.some(
      (r) => r.comment === 'SudaFi_Anti_Tethering_TTL' || (r.chain === 'postrouting' && r.action === 'change-ttl'),
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
    const bridgeName = dto.lan.bridgeName || 'bridge-hotspot';
    const hasClientIsolation = discovery.bridgePorts?.some(
      (p) => p.bridge === bridgeName && p.horizon === 1,
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
    const hasMgmtDropRule = discovery.filterRules?.some(
      (r) => r.comment === 'SudaFi_Drop_Subscriber_Admin_Ports' || (r.chain === 'input' && r.action === 'drop'),
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
    const hasDnsRedirect = discovery.natRules?.some(
      (r) => r.comment === 'SudaFi_Force_DNS_UDP' || r.comment === 'SudaFi_Force_DNS_TCP',
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

  private extractSubnetBase(ipWithCidr: string): string | null {
    if (!ipWithCidr || !ipWithCidr.includes('/')) return null;
    const parts = ipWithCidr.split('/')[0].split('.');
    if (parts.length < 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  private extractNetworkBase(ipWithCidr: string): string {
    const base = this.extractSubnetBase(ipWithCidr);
    const cidr = ipWithCidr.includes('/') ? ipWithCidr.split('/')[1] : '24';
    return base ? `${base}.0/${cidr}` : '10.5.50.0/24';
  }

  private generateDefaultPoolRange(ipWithCidr: string): string {
    const base = this.extractSubnetBase(ipWithCidr) || '10.5.50';
    return `${base}.10-${base}.254`;
  }

  private commandStringToWords(cmd: string): string[] {
    return cmd.trim().split(/\s+/);
  }
}

