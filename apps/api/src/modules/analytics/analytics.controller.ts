import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  AnalyticsService,
  DashboardOverview,
  UnifiedDashboardData,
  RevenueAnalytics,
  NetworkAnalytics,
} from './analytics.service';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('analytics')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({
    summary: 'Get unified operational dashboard KPIs, top profiles, and recent sales',
  })
  @ApiResponse({ status: 200, description: 'Unified dashboard KPIs' })
  async getDashboardData(
    @TenantId() headerTenantId?: string,
    @CurrentUser('tenantId') userTenantId?: string,
  ): Promise<UnifiedDashboardData> {
    const tenantId = headerTenantId || userTenantId || '';
    return this.analyticsService.getDashboardData(tenantId);
  }

  @Get('overview')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({
    summary: 'Get executive dashboard overview metrics (revenue, inventory, devices, recent sales)',
  })
  @ApiResponse({ status: 200, description: 'Dashboard overview KPIs' })
  async getDashboardOverview(
    @TenantId() headerTenantId?: string,
    @CurrentUser('tenantId') userTenantId?: string,
  ): Promise<DashboardOverview> {
    const tenantId = headerTenantId || userTenantId || '';
    return this.analyticsService.getDashboardOverview(tenantId);
  }

  @Get('revenue')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({
    summary: 'Get revenue time-series and breakdown by profile, payment method, and router',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  @ApiQuery({ name: 'deviceId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Revenue analytics breakdown' })
  async getRevenueAnalytics(
    @TenantId() headerTenantId?: string,
    @CurrentUser('tenantId') userTenantId?: string,
    @Query('days') days?: number,
    @Query('deviceId') deviceId?: string,
  ): Promise<RevenueAnalytics> {
    const tenantId = headerTenantId || userTenantId || '';
    const numDays = days ? Number(days) : 30;
    return this.analyticsService.getRevenueAnalytics(tenantId, numDays, deviceId);
  }

  @Get('network')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({
    summary: 'Get network traffic telemetry, top consumers, and peak hours distribution',
  })
  @ApiQuery({ name: 'deviceId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Network usage analytics' })
  async getNetworkAnalytics(
    @TenantId() headerTenantId?: string,
    @CurrentUser('tenantId') userTenantId?: string,
    @Query('deviceId') deviceId?: string,
  ): Promise<NetworkAnalytics> {
    const tenantId = headerTenantId || userTenantId || '';
    return this.analyticsService.getNetworkAnalytics(tenantId, deviceId);
  }

  @Get('financial-report')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({
    summary: 'Get comprehensive financial report, revenue history, profit margin and 7/30-day forecast',
  })
  @ApiResponse({ status: 200, description: 'Comprehensive financial report' })
  async getFinancialReport(
    @TenantId() headerTenantId?: string,
    @CurrentUser('tenantId') userTenantId?: string,
  ) {
    const tenantId = headerTenantId || userTenantId || '';
    return this.analyticsService.getFinancialReport(tenantId);
  }
}

