import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  SalesService,
  ThermalReceiptPayload,
  ShiftSummaryReport,
  DailySalesReport,
} from '../services/sales.service';
import { CheckoutSaleDto } from '../dto/checkout-sale.dto';
import { RefundSaleDto } from '../dto/refund-sale.dto';
import { SalesQueryDto } from '../dto/sales-query.dto';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { TenantId } from '../../../core/decorators/tenant-id.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('sales')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('checkout')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'POS fast card checkout: sells next available card and generates thermal receipt',
  })
  @ApiResponse({ status: 201, description: 'Sale processed and receipt ready' })
  @ApiResponse({ status: 400, description: 'Insufficient cards available' })
  async checkout(
    @TenantId() tenantId: string,
    @CurrentUser('id') cashierId: string,
    @Body() dto: CheckoutSaleDto,
  ) {
    return this.salesService.checkout(tenantId, cashierId, dto);
  }

  @Get('transactions')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List sales transactions with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Paginated transactions' })
  async listTransactions(@TenantId() tenantId: string, @Query() query: SalesQueryDto) {
    return this.salesService.listTransactions(tenantId, query);
  }

  @Get('transactions/:id/receipt')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'Get receipt payload and track reprint for a sale transaction' })
  @ApiResponse({ status: 200, description: 'Receipt data with QR code Data URL' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getReceipt(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<ThermalReceiptPayload> {
    return this.salesService.getReceipt(tenantId, id);
  }

  @Post('transactions/:id/refund')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({
    summary: 'Process refund for a sold card, disabling card and removing from router',
  })
  @ApiResponse({ status: 200, description: 'Refund processed' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async refund(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser('id') cashierId: string,
    @Body() dto: RefundSaleDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.salesService.refund(tenantId, id, cashierId, dto);
  }

  @Get('shift-summary')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'Get financial summary for the currently active cashier shift' })
  @ApiResponse({ status: 200, description: 'Shift revenue breakdown' })
  async getShiftSummary(
    @TenantId() tenantId: string,
    @CurrentUser('id') cashierId: string,
  ): Promise<ShiftSummaryReport> {
    return this.salesService.getShiftSummary(tenantId, cashierId);
  }

  @Post('close-shift')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close active cashier shift and seal financial metrics' })
  @ApiResponse({ status: 200, description: 'Shift sealed and closed successfully' })
  async closeShift(
    @TenantId() tenantId: string,
    @CurrentUser('id') cashierId: string,
  ): Promise<ShiftSummaryReport & { isClosed: boolean; closedAt: Date }> {
    return this.salesService.closeShift(tenantId, cashierId);
  }

  @Get('daily-report')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Get daily aggregate sales report across all devices and cashiers' })
  @ApiQuery({ name: 'date', required: false, type: String, example: '2026-10-04' })
  @ApiResponse({ status: 200, description: 'Daily sales metrics' })
  async getDailyReport(
    @TenantId() tenantId: string,
    @Query('date') date?: string,
  ): Promise<DailySalesReport> {
    return this.salesService.getDailyReport(tenantId, date);
  }
}
