import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  SyncService,
  SyncPullResponse,
  MutationResult,
  ReservedCardPayload,
} from '../services/sync.service';
import { SyncPushDto } from '../dto/sync-push.dto';
import { SyncPullQueryDto } from '../dto/sync-pull-query.dto';
import { ReserveCardsDto } from '../dto/reserve-cards.dto';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { TenantId } from '../../../core/decorators/tenant-id.decorator';
import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('sync')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({
    summary: 'Push offline sales, mutations, and print jobs to reconcile with the central server',
  })
  @ApiResponse({ status: 200, description: 'Reconciliation results and conflict report' })
  async pushMutations(
    @TenantId() tenantId: string,
    @CurrentUser('id') cashierId: string,
    @Body() dto: SyncPushDto,
  ): Promise<{ processedMutations: MutationResult[]; serverTimestamp: string }> {
    return this.syncService.pushMutations(tenantId, cashierId, dto);
  }

  @Get('pull')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({
    summary: 'Pull incremental delta updates (profiles, devices, active batches) since timestamp',
  })
  @ApiResponse({ status: 200, description: 'Incremental delta state' })
  async pullUpdates(
    @TenantId() tenantId: string,
    @Query() query: SyncPullQueryDto,
  ): Promise<SyncPullResponse> {
    return this.syncService.pullUpdates(tenantId, query);
  }

  @Post('reserve-cards')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({
    summary: 'Reserve a batch of available cards for mobile local encrypted offline wallet',
  })
  @ApiResponse({
    status: 200,
    description: 'Allocated cards with decrypted credentials and QR payload',
  })
  async reserveCards(
    @TenantId() tenantId: string,
    @CurrentUser('id') cashierId: string,
    @Body() dto: ReserveCardsDto,
  ): Promise<ReservedCardPayload[]> {
    return this.syncService.reserveCards(tenantId, cashierId, dto);
  }
}
