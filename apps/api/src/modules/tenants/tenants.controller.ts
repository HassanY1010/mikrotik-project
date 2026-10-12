import { Controller, Get, Patch, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
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
import { TenantStatus, SubscriptionStatus } from '@prisma/client';

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

  @Get('current/wallet')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
    RoleName.EMPLOYEE,
  )
  @ApiOperation({ summary: 'Get current tenant cloud wallet balance and points' })
  @ApiResponse({ status: 200, description: 'Tenant wallet data' })
  async getWallet(@CurrentUser('tenantId') tenantId?: string) {
    return this.tenantsService.getWallet(tenantId);
  }

  @Post('current/wallet/recharge')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Administrative manual top-up or recharge of cloud wallet' })
  @ApiResponse({ status: 200, description: 'Wallet recharged successfully' })
  async rechargeWallet(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body('amount') amount: number,
    @Body('notes') notes?: string,
    @Body('pointsDelta') pointsDelta?: number,
  ) {
    return this.tenantsService.rechargeWallet(tenantId, Number(amount), notes, Number(pointsDelta || 0), userId);
  }

  @Patch('current/wallet/settings')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Update cloud wallet settings (e.g. allowAdminCards)' })
  @ApiResponse({ status: 200, description: 'Wallet settings updated successfully' })
  async updateWalletSettings(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body('allowAdminCards') allowAdminCards: boolean,
  ) {
    return this.tenantsService.updateWalletSettings(tenantId, Boolean(allowAdminCards), userId);
  }

  @Post('current/wallet/redeem-points')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Redeem loyalty points for cloud wallet balance' })
  @ApiResponse({ status: 200, description: 'Points redeemed successfully' })
  async redeemLoyaltyPoints(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body('points') points: number,
  ) {
    return this.tenantsService.redeemLoyaltyPoints(tenantId, Number(points), userId);
  }

  @Get('current/wallet/transactions')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
    RoleName.EMPLOYEE,
  )
  @ApiOperation({ summary: 'List recent wallet transactions' })
  @ApiResponse({ status: 200, description: 'Wallet transaction history' })
  async getWalletTransactions(
    @CurrentUser('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? Math.min(100, Math.max(1, parseInt(limit, 10) || 5)) : 5;
    return this.tenantsService.getWalletTransactions(tenantId, take);
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

  @Get('admin/overview')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Platform-wide overview statistics for Super Admin' })
  @ApiResponse({ status: 200, description: 'Real-time overview metrics' })
  async getOverview() {
    return this.tenantsService.getPlatformOverview();
  }

  @Get('admin/subscriptions')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all tenant subscriptions with filters (Super Admin)' })
  @ApiResponse({ status: 200, description: 'Paginated list of subscriptions' })
  async listSubscriptions(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: SubscriptionStatus,
    @Query('planId') planId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tenantsService.listSubscriptions({
      tenantId,
      status,
      planId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Post('subscriptions/:id/renew')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Renew a subscription for a given number of months' })
  @ApiResponse({ status: 200, description: 'Subscription renewed successfully' })
  async renewSubscription(
    @Param('id') id: string,
    @Body('durationMonths') durationMonths: number,
    @Body('notes') notes: string,
    @CurrentUser('id') superAdminId: string,
  ) {
    return this.tenantsService.renewSubscription(id, Number(durationMonths || 1), superAdminId, notes);
  }

  @Patch('subscriptions/:id/status')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update subscription status (ACTIVE, SUSPENDED, CANCELLED)' })
  @ApiResponse({ status: 200, description: 'Subscription status updated' })
  async updateSubscriptionStatus(
    @Param('id') id: string,
    @Body('status') status: SubscriptionStatus,
    @Body('notes') notes: string,
    @CurrentUser('id') superAdminId: string,
  ) {
    return this.tenantsService.updateSubscriptionStatus(id, status, superAdminId, notes);
  }

  @Get()
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'List tenant organizations with optional pagination/search (Super Admin)' })
  @ApiResponse({ status: 200, description: 'List of tenants with subscription info' })
  async findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (search !== undefined || status !== undefined || page !== undefined || limit !== undefined) {
      return this.tenantsService.findPaginated({
        search,
        status: status as TenantStatus,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
      });
    }
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

  @Get(':id/audit-logs')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get audit logs for a specific tenant organization' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  async getTenantAuditLogs(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tenantsService.getTenantAuditLogs(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
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
