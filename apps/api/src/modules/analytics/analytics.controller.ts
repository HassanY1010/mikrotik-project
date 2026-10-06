import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  AnalyticsService,
  DashboardOverview,
  RevenueAnalytics,
  NetworkAnalytics,
} from './analytics.service';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('analytics')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({
    summary: 'Get executive dashboard overview metrics (revenue, inventory, devices, recent sales)',
  })
  @ApiResponse({ status: 200, description: 'Dashboard overview KPIs' })
  async getDashboardOverview(@TenantId() tenantId: string): Promise<DashboardOverview> {
    return this.analyticsService.getDashboardOverview(tenantId);
  }

  @Get('revenue')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({
    summary: 'Get revenue time-series and breakdown by profile, payment method, and router',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  @ApiQuery({ name: 'deviceId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Revenue analytics breakdown' })
  async getRevenueAnalytics(
    @TenantId() tenantId: string,
    @Query('days') days?: number,
    @Query('deviceId') deviceId?: string,
  ): Promise<RevenueAnalytics> {
    const numDays = days ? Number(days) : 30;
    return this.analyticsService.getRevenueAnalytics(tenantId, numDays, deviceId);
  }

  @Get('network')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({
    summary: 'Get network traffic telemetry, top consumers, and peak hours distribution',
  })
  @ApiQuery({ name: 'deviceId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Network usage analytics' })
  async getNetworkAnalytics(
    @TenantId() tenantId: string,
    @Query('deviceId') deviceId?: string,
  ): Promise<NetworkAnalytics> {
    return this.analyticsService.getNetworkAnalytics(tenantId, deviceId);
  }
}
