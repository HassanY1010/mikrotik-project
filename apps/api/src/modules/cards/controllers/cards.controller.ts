import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CardsService, CardBatchSummary, CardItemResponse } from '../services/cards.service';
import { CreateBatchDto } from '../dto/create-batch.dto';
import { UpdateCardStatusDto } from '../dto/update-card-status.dto';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { TenantId } from '../../../core/decorators/tenant-id.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('cards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post('batches')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate a new batch of prepaid Hotspot cards and provision on MikroTik',
  })
  @ApiResponse({ status: 201, description: 'Batch generated successfully' })
  async createBatch(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBatchDto,
  ) {
    return this.cardsService.createBatch(tenantId, userId, dto);
  }

  @Get('batches')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List all card batches for tenant' })
  @ApiQuery({ name: 'deviceId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of batches' })
  async listBatches(@TenantId() tenantId: string, @Query('deviceId') deviceId?: string) {
    return this.cardsService.listBatches(tenantId, deviceId);
  }

  @Get('batches/:id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'Get details and summary statistics of a specific card batch' })
  @ApiResponse({ status: 200, description: 'Batch statistics' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  async getBatchById(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<CardBatchSummary> {
    return this.cardsService.getBatchById(tenantId, id);
  }

  @Get('batches/:id/cards')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List paginated cards in a batch' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated card records' })
  async listCardsInBatch(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<{ data: CardItemResponse[]; total: number; page: number; limit: number }> {
    return this.cardsService.listCardsInBatch(tenantId, id, page, limit);
  }

  @Post('batches/:id/sync')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Re-sync all pending or failed cards in batch to the MikroTik router' })
  @ApiResponse({ status: 200, description: 'Sync completed' })
  async syncBatchToRouter(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.cardsService.syncBatchToRouter(tenantId, id);
  }

  @Patch(':id/status')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Update card status (e.g. DISABLE or RE-ENABLE) and sync to router' })
  @ApiResponse({ status: 200, description: 'Card status updated' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  async updateCardStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCardStatusDto,
  ): Promise<CardItemResponse> {
    return this.cardsService.updateCardStatus(tenantId, id, dto);
  }
}
