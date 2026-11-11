import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RoleName } from '@mikrotik-saas/shared-types';
import { CurrentUser, RequestUser } from '../../core/decorators/current-user.decorator';
import { RequirePermissions } from '../../core/decorators/permissions.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import {
  AutoProvisionConfigDto,
  CreateProvisionBackupDto,
  RestoreProvisionBackupDto,
  StartAutoProvisioningDto,
} from './dto/auto-provisioning.dto';
import { MikrotikProvisioningService } from './mikrotik-provisioning.service';

@ApiTags('mikrotik-provisioning')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
@Controller('mikrotik-provisioning')
export class MikrotikProvisioningController {
  constructor(private readonly provisioningService: MikrotikProvisioningService) {}

  @Post('devices/:deviceId/discover')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Discover live RouterOS hardware, packages, interfaces, topology, and roles',
  })
  @ApiResponse({ status: 200, description: 'Full router discovery report and capability matrix' })
  async discover(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Query('refresh') refresh?: string,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.discoverDevice(
      tenantId,
      deviceId,
      currentUser,
      refresh === 'true',
    );
  }

  @Get('devices/:deviceId/capabilities')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @ApiOperation({
    summary: 'Get detected RouterOS capabilities, adapter metadata, and wireless/NTP stacks',
  })
  async capabilities(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Query('refresh') refresh?: string,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.getDeviceCapabilities(
      tenantId,
      deviceId,
      currentUser,
      refresh === 'true',
    );
  }

  @Post('devices/:deviceId/plan')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Generate a full 12-stage signed Auto Provisioning execution plan',
  })
  async buildPlan(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: AutoProvisionConfigDto,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.buildPlan(tenantId, deviceId, dto, currentUser);
  }

  @Post('devices/:deviceId/preview')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Preview current vs proposed diff, risk warnings, and RouterOS commands without mutating',
  })
  async preview(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: AutoProvisionConfigDto,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.buildPreview(tenantId, deviceId, dto, currentUser);
  }

  @Post('devices/:deviceId/backup')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:sync')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ global: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Create encrypted binary (.backup) + redacted (.rsc) backups and archive in private storage',
  })
  async createBackup(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: CreateProvisionBackupDto,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.createBackup(tenantId, deviceId, dto, currentUser);
  }

  @Get('devices/:deviceId/backups')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @ApiOperation({ summary: 'List archived provisioning backups for a router' })
  async listBackups(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.listBackups(tenantId, deviceId, currentUser);
  }

  @Get('backups/:backupId/download')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @ApiOperation({ summary: 'Download a provisioning backup (.backup or .rsc) through backend authorization' })
  async downloadBackup(
    @TenantId() tenantId: string,
    @Param('backupId') backupId: string,
    @CurrentUser() currentUser: RequestUser,
    @Res() res: Response,
  ) {
    const file = await this.provisioningService.downloadBackup(tenantId, backupId, currentUser);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Content-Length': file.size.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    });
    res.end(file.buffer);
  }

  @Post('devices/:deviceId/restore')
  @Roles(RoleName.SUPER_ADMIN, RoleName.OWNER, RoleName.TENANT_ADMIN, RoleName.ADMIN)
  @RequirePermissions('devices:update')
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Restore a binary router backup with model/OS compatibility guard and multi-step confirmation',
  })
  async restoreBackup(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: RestoreProvisionBackupDto,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.restoreBackup(tenantId, deviceId, dto, currentUser);
  }

  @Post('devices/:deviceId/apply')
  @Roles(RoleName.SUPER_ADMIN, RoleName.OWNER, RoleName.TENANT_ADMIN, RoleName.ADMIN)
  @RequirePermissions('devices:update')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ global: { limit: 6, ttl: 60000 } })
  @ApiOperation({
    summary: 'Apply confirmed Auto Provisioning Plan with Stage 0 check, Pre-Backup, sequential execution, rollback, and verification',
  })
  async apply(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: StartAutoProvisioningDto,
    @Query('sync') sync?: string,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.applyProvisioning(tenantId, deviceId, dto, currentUser, {
      asyncExecution: sync !== 'true',
    });
  }

  @Get('devices/:deviceId/operations')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @ApiOperation({ summary: 'List Auto Provisioning execution history for a router' })
  async listOperations(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.listOperations(tenantId, deviceId, currentUser);
  }

  @Get('operations/:operationId')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @ApiOperation({ summary: 'Get live status, progress, steps, and backups of an Auto Provisioning operation' })
  async getOperation(
    @TenantId() tenantId: string,
    @Param('operationId') operationId: string,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.getOperationDetails(tenantId, operationId, currentUser);
  }

  @Post('operations/:operationId/cancel')
  @Roles(RoleName.SUPER_ADMIN, RoleName.OWNER, RoleName.TENANT_ADMIN, RoleName.ADMIN)
  @RequirePermissions('devices:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Safely cancel a running Auto Provisioning operation and trigger tracked rollback' })
  async cancelOperation(
    @TenantId() tenantId: string,
    @Param('operationId') operationId: string,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.cancelOperation(tenantId, operationId, currentUser);
  }

  @Get('operations/:operationId/commands')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @ApiOperation({ summary: 'Get executed RouterOS command list (secrets redacted) for an operation' })
  async getCommands(
    @TenantId() tenantId: string,
    @Param('operationId') operationId: string,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.getOperationCommands(tenantId, operationId, currentUser);
  }

  @Get('operations/:operationId/logs')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @RequirePermissions('devices:read')
  @ApiOperation({ summary: 'Get full structured stage & command logs for an operation' })
  async getLogs(
    @TenantId() tenantId: string,
    @Param('operationId') operationId: string,
    @CurrentUser() currentUser?: RequestUser,
  ) {
    return this.provisioningService.getOperationLogs(tenantId, operationId, currentUser);
  }
}
