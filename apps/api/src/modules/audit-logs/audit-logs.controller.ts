import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AuditLogsService, AuditLogItemResponse } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('audit-logs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Query paginated tenant audit log trail' })
  @ApiResponse({ status: 200, description: 'Audit trail records' })
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: AuditLogQueryDto,
  ): Promise<{ data: AuditLogItemResponse[]; total: number; page: number; limit: number }> {
    return this.auditLogsService.findAll(tenantId, query);
  }

  @Get('export')
  @Roles(RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Export audit logs to Excel-compatible CSV' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportCsv(
    @TenantId() tenantId: string,
    @Query() query: AuditLogQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csvData = await this.auditLogsService.exportCsv(tenantId, query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);
    res.status(200).send(csvData);
  }
}
