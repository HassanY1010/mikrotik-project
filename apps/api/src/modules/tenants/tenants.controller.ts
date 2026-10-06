import { Controller, Get, Patch, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { ApproveSubscriptionDto } from './dto/approve-subscription.dto';
import { UpdateCurrentTenantDto } from './dto/update-current-tenant.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('tenants')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
    RoleName.EMPLOYEE,
  )
  @ApiOperation({ summary: 'Get current tenant organization profile' })
  @ApiResponse({ status: 200, description: 'Current tenant profile' })
  async getCurrentTenant(
    @CurrentUser('tenantId') tenantId?: string,
  ): Promise<Record<string, unknown>> {
    return this.tenantsService.getCurrentTenant(tenantId);
  }

  @Patch('current')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Update current tenant settings' })
  @ApiResponse({ status: 200, description: 'Current tenant updated' })
  async updateCurrentTenant(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateCurrentTenantDto,
  ): Promise<Record<string, unknown>> {
    return this.tenantsService.updateCurrentTenant(tenantId, dto, userId);
  }

  @Get()
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all tenant organizations (Super Admin)' })
  @ApiResponse({ status: 200, description: 'List of tenants with subscription info' })
  async findAll(): Promise<Record<string, unknown>[]> {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get complete tenant details (Super Admin)' })
  @ApiResponse({ status: 200, description: 'Tenant details' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findById(@Param('id') id: string): Promise<Record<string, unknown>> {
    return this.tenantsService.findById(id);
  }

  @Patch(':id/status')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update tenant status (ACTIVE, SUSPENDED, EXPIRED)' })
  @ApiResponse({ status: 200, description: 'Tenant status updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
    @CurrentUser('id') superAdminId: string,
  ): Promise<Record<string, unknown>> {
    return this.tenantsService.updateStatus(id, dto, superAdminId);
  }

  @Post(':id/subscription/approve')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Manually activate, approve, or renew tenant subscription' })
  @ApiResponse({ status: 201, description: 'Subscription approved' })
  async approveSubscription(
    @Param('id') id: string,
    @Body() dto: ApproveSubscriptionDto,
    @CurrentUser('id') superAdminId: string,
  ): Promise<Record<string, unknown>> {
    return this.tenantsService.approveSubscription(id, dto, superAdminId);
  }
}
