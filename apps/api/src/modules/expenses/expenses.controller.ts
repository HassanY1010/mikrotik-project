import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { RequirePermissions } from '../../core/decorators/permissions.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('expenses')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @RequirePermissions('expenses:manage')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new operational network expense' })
  @ApiResponse({ status: 201, description: 'Expense recorded successfully' })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.create(tenantId, userId, dto);
  }

  @Get()
  @RequirePermissions('finance:view')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List operational expenses with pagination, search, and date filters' })
  @ApiResponse({ status: 200, description: 'Paginated expenses' })
  async findAll(@TenantId() tenantId: string, @Query() query: ExpenseQueryDto) {
    return this.expensesService.findAll(tenantId, query);
  }

  @Get('summary')
  @RequirePermissions('finance:view')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Get aggregated expenses summary categorized by operational purpose' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Aggregated expense metrics' })
  async getSummary(
    @TenantId() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.expensesService.getSummary(tenantId, startDate, endDate);
  }

  @Get(':id')
  @RequirePermissions('finance:view')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Get single expense details by ID' })
  @ApiResponse({ status: 200, description: 'Expense details' })
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.expensesService.findOne(tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('expenses:manage')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Update an existing operational expense' })
  @ApiResponse({ status: 200, description: 'Expense updated' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('expenses:manage')
  @Roles(RoleName.SUPER_ADMIN, 'OWNER' as any, RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete an operational expense record' })
  @ApiResponse({ status: 200, description: 'Expense deleted' })
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.expensesService.remove(tenantId, id);
  }
}
