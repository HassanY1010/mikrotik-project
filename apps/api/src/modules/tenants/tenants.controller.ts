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
  @Roles(RoleName.SUPER_ADMIN, RoleName.OWNER, RoleName.TENANT_ADMIN, RoleName.ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Manual top-up or recharge of cloud wallet' })
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
