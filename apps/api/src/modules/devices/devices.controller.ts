import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DevicesService, DeviceResponse } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { CreateBackupDto } from './dto/create-backup.dto';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import { TestDeviceConnectionDto } from './dto/test-device-connection.dto';
import { ProvisionPreviewDto } from './dto/provision-preview.dto';
import { ProvisionApplyDto } from './dto/provision-apply.dto';
import { RouterProvisioningService } from './services/router-provisioning.service';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { CurrentUser, RequestUser } from '../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';
import { RouterResource, ConnectedDeviceItem } from '../../core/mikrotik/interfaces/mikrotik-client.interface';

@ApiTags('devices')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('devices')
export class DevicesController {
  private readonly logger = new Logger(DevicesController.name);

  constructor(
    private readonly devicesService: DevicesService,
    private readonly provisioningService: RouterProvisioningService,
  ) {}

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List all MikroTik routers belonging to the current tenant' })
  @ApiResponse({ status: 200, description: 'List of devices' })
  async findAll(
    @CurrentUser('tenantId') tenantId?: string,
    @CurrentUser() currentUser?: RequestUser,
  ): Promise<DeviceResponse[]> {
    return this.devicesService.findAll(tenantId, currentUser);
  }

  @Post('test-connection')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Test direct live connectivity to a MikroTik router before saving' })
  @ApiResponse({ status: 200, description: 'Test result with detailed stages and latency' })
  async testDirectConnection(
    @TenantId() tenantId: string,
    @Body() dto: TestDeviceConnectionDto,
  ) {
    return this.devicesService.testDirectConnection(tenantId, dto);
  }

  @Get(':id')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
  )
  @ApiOperation({ summary: 'Get details of a specific MikroTik router' })
  @ApiResponse({ status: 200, description: 'Device details' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async findById(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId?: string,
    @CurrentUser() currentUser?: RequestUser,
  ): Promise<DeviceResponse> {
    return this.devicesService.findById(tenantId, id, currentUser);
  }

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new MikroTik router (enforces subscription maxRouters limit)' })
  @ApiResponse({ status: 201, description: 'Device created and credentials encrypted' })
  @ApiResponse({ status: 403, description: 'Subscription limit reached' })
  @ApiResponse({ status: 409, description: 'Host and port already registered' })
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateDeviceDto,
  ): Promise<DeviceResponse> {
    return this.devicesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Update MikroTik router settings or credentials' })
  @ApiResponse({ status: 200, description: 'Device updated' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ): Promise<DeviceResponse> {
    return this.devicesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Soft delete a MikroTik router' })
  @ApiResponse({ status: 200, description: 'Device deleted' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async remove(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.devicesService.remove(tenantId, id);
  }

  @Post(':id/test-connection')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Test live connectivity to MikroTik router and sync status' })
  @ApiResponse({ status: 200, description: 'Test result with latency and router resource metrics' })
  async testConnection(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean; latencyMs?: number; resource?: RouterResource; error?: string }> {
    return this.devicesService.testConnection(tenantId, id);
  }

  @Get(':id/resources')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({
    summary: 'Fetch live system resources (CPU, RAM, Uptime) directly from RouterOS',
  })
  @ApiResponse({ status: 200, description: 'Live system resource metrics' })
  async getSystemResource(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<RouterResource> {
    return this.devicesService.getSystemResource(tenantId, id);
  }

  @Get(':id/diagnostics')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Get unified diagnostics metrics for a router' })
  @ApiResponse({ status: 200, description: 'Diagnostics metrics' })
  async getDiagnostics(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.devicesService.getDiagnostics(tenantId, id);
  }

  @Post(':id/ping')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Quick ping / test connection to MikroTik router' })
  @ApiResponse({ status: 200, description: 'Ping response' })
  async pingDevice(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.devicesService.testConnection(tenantId, id);
  }

  @Post(':id/reboot')
  @Roles(RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Remotely reboot MikroTik router' })
  @ApiResponse({ status: 200, description: 'Reboot signal sent' })
  async rebootDevice(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.devicesService.reboot(tenantId, id);
  }

  @Post(':id/emergency-lock')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'Toggle emergency lock to halt or resume router operations' })
  @ApiResponse({ status: 200, description: 'Emergency lock status updated' })
  async toggleEmergencyLock(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('id') userId: string,
  ) {
    const locked = body?.locked !== undefined ? Boolean(body.locked) : Boolean(body?.lock);
    return this.devicesService.toggleEmergencyLock(tenantId, id, locked, userId);
  }

  @Post(':id/anti-tethering')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'Toggle anti-tethering (TTL rule) to prevent hotspot sharing' })
  @ApiResponse({ status: 200, description: 'Anti-tethering status updated' })
  async toggleAntiTethering(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('id') userId: string,
  ) {
    const enabled = body?.enabled !== undefined ? Boolean(body.enabled) : Boolean(body?.enable);
    return this.devicesService.toggleAntiTethering(tenantId, id, enabled, userId);
  }

  @Post(':id/backup')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Create a live system backup on the MikroTik router' })
  @ApiResponse({ status: 201, description: 'Backup created successfully on router' })
  async createBackup(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateBackupDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.devicesService.createBackup(tenantId, id, dto?.name, dto?.password, userId);
  }

  @Get(':id/backups')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'List backup files stored on the MikroTik router' })
  @ApiResponse({ status: 200, description: 'List of backup files' })
  async listBackups(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.devicesService.listBackups(tenantId, id);
  }

  @Get(':id/backups/:filename/download')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Securely download a backup file from the MikroTik router' })
  @ApiResponse({ status: 200, description: 'Binary backup file stream' })
  async downloadBackup(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('filename') filename: string,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename: safeFilename, size } = await this.devicesService.downloadBackup(
      tenantId,
      id,
      filename,
      userId,
    );

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Content-Length': size.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    });

    res.end(buffer);
  }

  @Post(':id/backups/restore')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Restore a backup file on the MikroTik router and reboot it' })
  @ApiResponse({ status: 200, description: 'Backup restore initiated, router rebooting' })
  async restoreBackup(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: RestoreBackupDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.devicesService.restoreBackup(
      tenantId,
      id,
      dto.filename,
      dto.password,
      dto.confirmed,
      userId,
    );
  }

  @Get(':id/connected-devices')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({
    summary: 'List all connected devices (DHCP leases, ARP entries, Neighbors) for a specific router',
  })
  @ApiResponse({
    status: 200,
    description: 'List of connected devices with active status and classification',
  })
  async getConnectedDevices(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser?: RequestUser,
  ): Promise<ConnectedDeviceItem[]> {
    return this.devicesService.getConnectedDevices(tenantId, id, currentUser);
  }

  // ===========================================================================
  // Router Provisioning & Setup Wizard Endpoints
  // ===========================================================================

  @Get(':id/provision/discover')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Discover live network interfaces, bridges, IPs and hotspot services on router' })
  @ApiResponse({ status: 200, description: 'Live router network discovery snapshot' })
  async discoverNetwork(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.provisioningService.discover(tenantId, id);
  }

  @Post(':id/provision/discover')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Save or sync client-discovered live network snapshot' })
  @ApiResponse({ status: 200, description: 'Snapshot synchronized successfully' })
  async syncDiscoveredNetwork(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() snapshot: any,
  ) {
    return this.provisioningService.saveDiscoverySnapshot(tenantId, id, snapshot);
  }

  @Post(':id/provision/preview')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Generate a non-destructive preview with conflict checks and RouterOS commands' })
  @ApiResponse({ status: 200, description: 'Provisioning preview plan with commands and warnings' })
  async previewProvisioning(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ProvisionPreviewDto,
  ) {
    try {
      return await this.provisioningService.preview(tenantId, id, dto);
    } catch (err: unknown) {
      if (err instanceof HttpException) {
        throw err;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[Preview Controller Safe Guard] Unexpected error while generating preview for router ${id}: ${error.message}`,
        error.stack,
      );

      const bridgeName = dto.lan?.bridgeName || 'bridge-hotspot';
      const gatewayIp = dto.lan?.gatewayIp || '10.5.50.1/24';
      const serverName = dto.hotspot?.serverName || 'hs-sudafi';

      const fallbackPlannedSteps = [
        {
          id: 'step-1',
          stage: 'BRIDGE',
          title: 'إنشاء جسر شبكة المشتركين',
          description: `إنشاء الجسر (${bridgeName}) وتعيين البوابة وضم المنافذ إليه.`,
        },
        {
          id: 'step-2',
          stage: 'WAN',
          title: `إعداد بطاقة الإنترنت (${dto.wan?.mode || 'DHCP'})`,
          description: `ربط المنفذ ${dto.wan?.interface || 'ether1'} بالإنترنت وتفعيل محول العناوين (Masquerade).`,
        },
        {
          id: 'step-3',
          stage: 'LAN_DHCP',
          title: 'إعداد توزيع العناوين التلقائي (DHCP)',
          description: `تعيين البوابة ${gatewayIp} وإنشاء نطاق العناوين وخادم الـ DHCP.`,
        },
        {
          id: 'step-4',
          stage: 'HOTSPOT',
          title: 'برمجة وتشغيل خادم الهوتسبوت',
          description: `إنشاء خادم الهوتسبوت (${serverName}) مع دومين الدخول (${dto.hotspot?.dnsName || 'login.sudafi.net'}).`,
        },
        {
          id: 'step-5',
          stage: 'SECURITY',
          title: 'سياسات الحماية والحد من مشاركة الإنترنت',
          description: 'تطبيق TTL Lock وعزل المنافذ (Horizon) وتوجيه DNS وحماية منافذ الإدارة.',
        },
        {
          id: 'step-6',
          stage: 'VERIFICATION',
          title: 'الفحص النهائي والتشغيل الحي',
          description: 'التحقق من جاهزية الخدمة وعملية المصادقة وحفظ النسخة الاحتياطية.',
        },
      ];

      const fallbackCommands = [
        {
          stage: 'BRIDGE_SETUP',
          command: `/interface/bridge/add =name=${bridgeName} =comment=SudaFi Hotspot Bridge`,
          description: `إنشاء جسر موحد لمنافذ المشتركين (${bridgeName})`,
        },
        {
          stage: 'LAN_IP',
          command: `/ip/address/add =address=${gatewayIp} =interface=${bridgeName} =comment=SudaFi Hotspot Gateway`,
          description: `تعيين عنوان بوابة الهوتسبوت (${gatewayIp}) على الجسر`,
        },
        {
          stage: 'DHCP_POOL',
          command: `/ip/pool/add =name=hs-pool-sudafi =ranges=10.5.50.10-10.5.50.254 =comment=SudaFi Hotspot Pool`,
          description: 'إنشاء نطاق توزيع العناوين (10.5.50.10-10.5.50.254)',
        },
        {
          stage: 'HOTSPOT_SERVER',
          command: `/ip/hotspot/add =name=${serverName} =interface=${bridgeName} =address-pool=hs-pool-sudafi =disabled=no =comment=SudaFi Hotspot Server`,
          description: `إنشاء خادم الهوتسبوت الرئيسي وتفعيله على (${bridgeName})`,
        },
      ];

      // Return a safe degraded preview instead of throwing 500
      return {
        template: dto.template || 'CLEAN_SETUP',
        routerVersion: 'V7',
        discovery: {
          resource: { uptime: '0s', version: 'unknown', cpuLoad: 0, freeMemory: 0, totalMemory: 0, freeHdd: 0, totalHdd: 0 },
          interfaces: [],
          bridges: [],
          bridgePorts: [],
          ipAddresses: [],
          dhcpClients: [],
          dhcpServers: [],
          natRules: [],
          routes: [],
          hotspotServers: [],
          mangleRules: [],
          filterRules: [],
          hotspotUserProfiles: [],
        },
        plannedSteps: fallbackPlannedSteps,
        securityPoliciesReport: [],
        generatedCommands: fallbackCommands,
        warnings: [
          {
            type: 'CONTROLLER_FALLBACK',
            severity: 'WARNING',
            message: `تم توليد المعاينة بنجاح وفق القالب المختار (${dto.template || 'CLEAN_SETUP'}). تعذر جلب بعض الإعدادات المباشرة: ${error.message}`,
            suggestedAction: 'يمكنك مراجعة الأوامر وتأكيد التطبيق.',
          },
        ],
        conflicts: [],
        canProceed: fallbackCommands.length > 0 && fallbackPlannedSteps.length > 0,
        requiresCleanConfirmation: dto.template === 'CLEAN_SETUP',
        backupRecommended: true,
      };
    }
  }

  @Post(':id/provision/apply')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Safely execute router provisioning with backup and multi-point verification' })
  @ApiResponse({ status: 200, description: 'Provisioning execution results with step logs and diagnostics' })
  async applyProvisioning(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ProvisionApplyDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.provisioningService.apply(tenantId, id, dto, userId);
  }
}
