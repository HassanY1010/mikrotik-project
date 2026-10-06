import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { SalesQueryDto } from '../sales/dto/sales-query.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales/csv')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Export sales transactions to Excel-compatible CSV with UTF-8 BOM' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportSalesCsv(
    @TenantId() tenantId: string,
    @Query() query: SalesQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reportsService.exportSalesCsv(tenantId, query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.csv`);
    res.status(200).send(csv);
  }

  @Get('cards/csv')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Export cards inventory to Excel-compatible CSV with UTF-8 BOM' })
  @ApiQuery({ name: 'batchId', required: false, type: String })
  @ApiQuery({ name: 'deviceId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportCardsCsv(
    @TenantId() tenantId: string,
    @Res() res: Response,
    @Query('batchId') batchId?: string,
    @Query('deviceId') deviceId?: string,
  ): Promise<void> {
    const csv = await this.reportsService.exportCardsCsv(tenantId, batchId, deviceId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=cards-report-${Date.now()}.csv`);
    res.status(200).send(csv);
  }
}
