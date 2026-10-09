import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DevicesService, DeviceResponse } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { TestDeviceConnectionDto } from './dto/test-device-connection.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';
import { RouterResource } from '../../core/mikrotik/interfaces/mikrotik-client.interface';

@ApiTags('devices')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
  )
  @ApiOperation({ summary: 'List all MikroTik routers belonging to the current tenant' })
  @ApiResponse({ status: 200, description: 'List of devices' })
  async findAll(@CurrentUser('tenantId') tenantId?: string): Promise<DeviceResponse[]> {
    return this.devicesService.findAll(tenantId);
  }

  @Post('test-connection')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
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
  async findById(@Param('id') id: string, @CurrentUser('tenantId') tenantId?: string): Promise<DeviceResponse> {
    return this.devicesService.findById(tenantId, id);
  }

  @Post()
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
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
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
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
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
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
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
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
}
