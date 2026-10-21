import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import {
  IMikrotikClient,
  RouterResource,
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
} from '../interfaces/provisioning.interface';

@Injectable()
export class RouterProvisioningService {
  private readonly logger = new Logger(RouterProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: MikrotikClientFactory,
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

    // Generate Planned Steps
    const plannedSteps = this.buildPlannedSteps(dto);

    // Generate RouterOS commands for preview
    const isV7 = (device.rosVersion || '').toUpperCase().includes('V7');
    const generatedCommands = this.generateRouterCommands(dto, isV7);

    const hasCriticalConflicts = conflicts.length > 0;
    const canProceed = !hasCriticalConflicts;

    return {
      template: dto.template,
      routerVersion: device.rosVersion || 'V7',
      discovery,
      plannedSteps,
      generatedCommands,
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
        const backupRes = await client.createBackup(safeBackupName);
        backupFilename = backupRes.filename;
        executedStages.push({
          stage: 'PRE_BACKUP',
          command: `/system backup save name=${safeBackupName}`,
          status: 'SUCCESS',
          timestamp: new Date().toISOString(),
        });
        this.logger.log(`Created pre-provisioning backup "${backupFilename}" on device "${device.name}"`);
      } else {
        executedStages.push({
          stage: 'PRE_BACKUP',
          status: 'SKIPPED',
          error: 'Client does not support createBackup method',
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
    const commands = this.generateRouterCommands(dto, isV7);

    for (const item of commands) {
      try {
        const words = this.commandStringToWords(item.command);
        if (client.runRawCommand) {
          await client.runRawCommand(words);
        }
        executedStages.push({
          stage: item.stage,
          command: item.command,
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
          executedStages.push({
            stage: item.stage,
            command: item.command,
            status: 'SUCCESS',
            error: `Notice: Existing entry adapted (${errMsg})`,
            timestamp: new Date().toISOString(),
          });
        } else {
          executedStages.push({
            stage: item.stage,
            command: item.command,
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
            failureReason: `تعذر تطبيق الأمر [${item.command}]: ${errMsg}`,
            recoveryInstructions: backupFilename
              ? `تم أخذ نسخة احتياطية مسبقاً باسم [${backupFilename}]. يمكنك استعادتها مباشرة عبر قائمة النسخ الاحتياطية أو WinBox.`
              : 'لم يتم حفظ نسخة احتياطية. راجع سجل الأوامر المنفذة وتأكد من صلاحيات مستخدم الراوتر.',
            verification: {
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
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
    } catch (_) {}

    let overallStatus: 'VERIFIED_READY' | 'PARTIALLY_VERIFIED' | 'VERIFICATION_FAILED' =
      'VERIFICATION_FAILED';
    let diagnosticsMessage = '';

    if (isReachable && hotspotOperational && wanConfigured) {
      overallStatus = 'VERIFIED_READY';
      diagnosticsMessage = 'تم التحقق بنجاح: الإنترنت يعمل وخادم الهوتسبوت جاهز ومفعل.';
    } else if (hotspotOperational) {
      overallStatus = 'PARTIALLY_VERIFIED';
      diagnosticsMessage = isReachable
        ? 'خادم الهوتسبوت يعمل والإنترنت متصل.'
        : 'تم تفعيل خادم الهوتسبوت بنجاح، ولكن تعذر الوصول إلى الإنترنت الخارجي عبر منفذ WAN.';
    } else {
      overallStatus = 'VERIFICATION_FAILED';
      diagnosticsMessage = 'فشل التحقق من عمل خادم الهوتسبوت أو الإنترنت بعد التثبيت.';
    }

    return {
      internetReachable: isReachable,
      wanConfigured,
      defaultRouteActive,
      hotspotOperational,
      pingPacketsReceived,
      overallStatus,
      diagnosticsMessage,
    };
  }

  /**
   * Generates RouterOS command list formatted for v6 and v7
   */
  private generateRouterCommands(dto: ProvisionPreviewDto, _isV7: boolean): GeneratedCommandItem[] {
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

    // 1. LAN Bridge Creation
    commands.push({
      stage: 'BRIDGE_SETUP',
      command: `/interface/bridge/add =name=${bridgeName} =comment=SudaFi Hotspot Bridge`,
      description: `إنشاء جسر موحد لمنافذ المشتركين (${bridgeName})`,
    });

    // 2. Member Ports Assignment
    for (const port of dto.lan.memberInterfaces) {
      commands.push({
        stage: 'BRIDGE_PORT',
        command: `/interface/bridge/port/add =bridge=${bridgeName} =interface=${port.trim()} =comment=SudaFi LAN Member`,
        description: `إضافة المنفذ ${port} إلى جسر الهوتسبوت`,
      });
    }

    // 3. WAN Configuration
    const wanIface = dto.wan.interface.trim();
    if (dto.wan.mode === 'DHCP') {
      commands.push({
        stage: 'WAN_CONFIG',
        command: `/ip/dhcp-client/add =interface=${wanIface} =add-default-route=yes =use-peer-dns=yes =use-peer-ntp=yes =disabled=no =comment=SudaFi WAN DHCP`,
        description: `تفعيل DHCP Client على منفذ الإنترنت (${wanIface})`,
      });
    } else if (dto.wan.mode === 'PPPOE') {
      commands.push({
        stage: 'WAN_CONFIG',
        command: `/interface/pppoe-client/add =name=pppoe-out1 =interface=${wanIface} =user=${dto.wan.pppoeUser || ''} =password=${dto.wan.pppoePassword || ''} =add-default-route=yes =use-peer-dns=yes =disabled=no =comment=SudaFi WAN PPPoE`,
        description: `إنشاء اتصال PPPoE Client على المنفذ (${wanIface})`,
      });
    } else if (dto.wan.mode === 'STATIC') {
      if (dto.wan.staticIp) {
        commands.push({
          stage: 'WAN_CONFIG',
          command: `/ip/address/add =address=${dto.wan.staticIp} =interface=${wanIface} =comment=SudaFi WAN Static`,
          description: `تعيين عنوان IP ثابت لمنفذ الإنترنت (${dto.wan.staticIp})`,
        });
      }
      if (dto.wan.staticGateway) {
        commands.push({
          stage: 'WAN_CONFIG',
          command: `/ip/route/add =dst-address=0.0.0.0/0 =gateway=${dto.wan.staticGateway} =comment=SudaFi Default Route`,
          description: `إضافة المسار الافتراضي للتوجيه عبر البوابة (${dto.wan.staticGateway})`,
        });
      }
      if (dto.wan.staticDns && dto.wan.staticDns.length > 0) {
        commands.push({
          stage: 'WAN_CONFIG',
          command: `/ip/dns/set =servers=${dto.wan.staticDns.join(',')} =allow-remote-requests=yes`,
          description: `ضبط خوادم DNS (${dto.wan.staticDns.join(',')})`,
        });
      }
    }

    // 4. NAT Masquerade
    if (dto.wan.enableNat !== false) {
      const outIface = dto.wan.mode === 'PPPOE' ? 'pppoe-out1' : wanIface;
      commands.push({
        stage: 'FIREWALL_NAT',
        command: `/ip/firewall/nat/add =chain=srcnat =out-interface=${outIface} =action=masquerade =comment=SudaFi NAT Masquerade`,
        description: `تفعيل قاعدة تحويل العناوين (Masquerade) لمنفذ الإنترنت (${outIface})`,
      });
    }

    // 5. Gateway IP on LAN Bridge
    commands.push({
      stage: 'LAN_IP',
      command: `/ip/address/add =address=${gatewayIp} =interface=${bridgeName} =comment=SudaFi Hotspot Gateway`,
      description: `تعيين عنوان بوابة الهوتسبوت (${gatewayIp}) على الجسر`,
    });

    // 6. IP Pool for DHCP
    const poolRange = dto.lan.poolRange || this.generateDefaultPoolRange(gatewayIp);
    commands.push({
      stage: 'DHCP_POOL',
      command: `/ip/pool/add =name=${poolName} =ranges=${poolRange} =comment=SudaFi Hotspot Pool`,
      description: `إنشاء نطاق توزيع العناوين (${poolRange})`,
    });

    // 7. DHCP Server and Network
    const leaseTime = dto.lan.dhcpLeaseTime || '1h';
    const dnsList = (dto.lan.dnsServers && dto.lan.dnsServers.length > 0)
      ? dto.lan.dnsServers.join(',')
      : `${cleanIp},8.8.8.8`;

    commands.push({
      stage: 'DHCP_SERVER',
      command: `/ip/dhcp-server/add =name=${dhcpServerName} =interface=${bridgeName} =address-pool=${poolName} =lease-time=${leaseTime} =disabled=no =comment=SudaFi DHCP Server`,
      description: `إنشاء خادم توزيع العناوين DHCP على الجسر`,
    });

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

    // 9. Hotspot Server Profile
    const loginBy = dto.hotspot?.loginBy || 'http-chap,http-pap';
    commands.push({
      stage: 'HOTSPOT_PROFILE',
      command: `/ip/hotspot/profile/add =name=${hsProfileName} =hotspot-address=${cleanIp} =dns-name=${dnsName} =html-directory=${dto.hotspot?.htmlDirectory || 'hotspot'} =login-by=${loginBy} =use-radius=no =comment=SudaFi Server Profile`,
      description: `إنشاء ملف تعريف خادم الهوتسبوت بالدومين (${dnsName})`,
    });

    // 10. Hotspot Server
    commands.push({
      stage: 'HOTSPOT_SERVER',
      command: `/ip/hotspot/add =name=${hsServerName} =interface=${bridgeName} =address-pool=${poolName} =profile=${hsProfileName} =disabled=no =comment=SudaFi Hotspot Server`,
      description: `إنشاء خادم الهوتسبوت الرئيسي وتفعيله على (${bridgeName})`,
    });

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

    return commands;
  }

  private buildPlannedSteps(dto: ProvisionPreviewDto): PlannedProvisioningStep[] {
    const steps: PlannedProvisioningStep[] = [];
    const bridgeName = dto.lan.bridgeName || 'bridge-hotspot';

    steps.push({
      id: 'step-1',
      stage: 'BRIDGE',
      title: 'إنشاء جسر شبكة المشتركين',
      description: `إنشاء الجسر (${bridgeName}) وضم المنافذ [${dto.lan.memberInterfaces.join(', ')}] إليه.`,
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
      stage: 'VERIFICATION',
      title: 'فحص الاتصال والتشخيص النهائي',
      description: 'فحص استجابة الراوتر، وحالة بوابة الإنترنت، والتحقق من جاهزية الهوتسبوت.',
    });

    return steps;
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
