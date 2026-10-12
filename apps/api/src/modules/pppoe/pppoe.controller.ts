import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PppoeService } from './pppoe.service';
import { AgentService } from '../agent/agent.service';
import {
  CreatePppoeProfileDto,
  UpdatePppoeProfileDto,
  PppoeProfileResponseDto,
  CreatePppoeAccountDto,
  UpdatePppoeAccountDto,
  PppoeAccountResponseDto,
  QueryPppoeAccountsDto,
  DisconnectPppoeSessionDto,
  PppoeSessionResponseDto,
} from './dto';
import { CommandResponseDto } from '../agent/dto/command.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('pppoe')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('pppoe')
export class PppoeController {
  constructor(
    private readonly pppoeService: PppoeService,
    private readonly agentService: AgentService,
  ) {}

  // =========================================================================
  // PROFILES ENDPOINTS
  // =========================================================================

  @Get('devices/:deviceId/profiles')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
  )
  @ApiOperation({ summary: 'List all PPPoE profiles for a specific router device' })
  @ApiResponse({ status: 200, type: [PppoeProfileResponseDto] })
  async listProfiles(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<PppoeProfileResponseDto[]> {
    return this.pppoeService.listProfiles(tenantId, deviceId);
  }

  @Post('devices/:deviceId/profiles')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Create a new PPPoE profile and sync to router' })
  @ApiResponse({ status: 201, type: PppoeProfileResponseDto })
  async createProfile(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: CreatePppoeProfileDto,
    @CurrentUser('id') userId?: string,
  ): Promise<PppoeProfileResponseDto> {
    return this.pppoeService.createProfile(tenantId, deviceId, dto, userId);
  }

  @Get('devices/:deviceId/profiles/:id')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
  )
  @ApiOperation({ summary: 'Get PPPoE profile details' })
  @ApiResponse({ status: 200, type: PppoeProfileResponseDto })
  async getProfile(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('id') profileId: string,
  ): Promise<PppoeProfileResponseDto> {
    return this.pppoeService.getProfile(tenantId, deviceId, profileId);
  }

  @Patch('devices/:deviceId/profiles/:id')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Update a PPPoE profile and sync changes' })
  @ApiResponse({ status: 200, type: PppoeProfileResponseDto })
  async updateProfile(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('id') profileId: string,
    @Body() dto: UpdatePppoeProfileDto,
    @CurrentUser('id') userId?: string,
  ): Promise<PppoeProfileResponseDto> {
    return this.pppoeService.updateProfile(tenantId, deviceId, profileId, dto, userId);
  }

  @Delete('devices/:deviceId/profiles/:id')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Delete a PPPoE profile (blocked if assigned to accounts)' })
  @ApiResponse({ status: 200, description: 'Profile deleted' })
  async deleteProfile(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('id') profileId: string,
    @CurrentUser('id') userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.pppoeService.deleteProfile(tenantId, deviceId, profileId, userId);
  }

  @Post('devices/:deviceId/profiles/:id/sync')
  @HttpCode(HttpStatus.OK)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Force live synchronization of profile to the router' })
  @ApiResponse({ status: 200, description: 'Sync command queued' })
  async syncProfile(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('id') profileId: string,
    @CurrentUser('id') userId?: string,
  ): Promise<{ success: boolean; message: string; queuedCommandId: string }> {
    return this.pppoeService.syncProfileToRouter(tenantId, deviceId, profileId, userId);
  }

  // =========================================================================
  // ACCOUNTS ENDPOINTS
  // =========================================================================

  @Get('devices/:deviceId/accounts')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
  )
  @ApiOperation({ summary: 'List PPPoE subscriber accounts with pagination and filtering' })
  @ApiResponse({ status: 200 })
  async listAccounts(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Query() query: QueryPppoeAccountsDto,
  ) {
    return this.pppoeService.listAccounts(tenantId, deviceId, query);
  }

  @Post('devices/:deviceId/accounts')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Create a new subscriber account with encrypted secret' })
  @ApiResponse({ status: 201, type: PppoeAccountResponseDto })
  async createAccount(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: CreatePppoeAccountDto,
    @CurrentUser('id') userId?: string,
  ): Promise<PppoeAccountResponseDto> {
    return this.pppoeService.createAccount(tenantId, deviceId, dto, userId);
  }

  @Get('devices/:deviceId/accounts/:id')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
  )
  @ApiOperation({ summary: 'Get subscriber account details' })
  @ApiResponse({ status: 200, type: PppoeAccountResponseDto })
  async getAccount(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('id') accountId: string,
  ): Promise<PppoeAccountResponseDto> {
    return this.pppoeService.getAccount(tenantId, deviceId, accountId);
  }

  @Patch('devices/:deviceId/accounts/:id')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Update subscriber account details' })
  @ApiResponse({ status: 200, type: PppoeAccountResponseDto })
  async updateAccount(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('id') accountId: string,
    @Body() dto: UpdatePppoeAccountDto,
    @CurrentUser('id') userId?: string,
  ): Promise<PppoeAccountResponseDto> {
    return this.pppoeService.updateAccount(tenantId, deviceId, accountId, dto, userId);
  }

  @Post('devices/:deviceId/accounts/:id/disable')
  @HttpCode(HttpStatus.OK)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Disable account and terminate active connection' })
  @ApiResponse({ status: 200, type: PppoeAccountResponseDto })
  async disableAccount(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('id') accountId: string,
    @CurrentUser('id') userId?: string,
  ): Promise<PppoeAccountResponseDto> {
    return this.pppoeService.disableAccount(tenantId, deviceId, accountId, userId);
  }

  @Post('devices/:deviceId/accounts/:id/enable')
  @HttpCode(HttpStatus.OK)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Enable subscriber account' })
  @ApiResponse({ status: 200, type: PppoeAccountResponseDto })
  async enableAccount(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('id') accountId: string,
    @CurrentUser('id') userId?: string,
  ): Promise<PppoeAccountResponseDto> {
    return this.pppoeService.enableAccount(tenantId, deviceId, accountId, userId);
  }

  @Delete('devices/:deviceId/accounts/:id')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Delete subscriber account and remove secret from router' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  async deleteAccount(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('id') accountId: string,
    @CurrentUser('id') userId?: string,
  ): Promise<{ success: boolean; message: string; queuedCommandId: string | null }> {
    return this.pppoeService.deleteAccount(tenantId, deviceId, accountId, userId);
  }

  // =========================================================================
  // ACTIVE SESSIONS & DISCONNECT ENDPOINTS
  // =========================================================================

  @Get('devices/:deviceId/sessions')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
  )
  @ApiOperation({ summary: 'List active broadband sessions' })
  @ApiResponse({ status: 200, type: [PppoeSessionResponseDto] })
  async listSessions(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Query('sync') sync?: string,
    @CurrentUser('id') userId?: string,
  ) {
    const shouldSync = sync === 'true' || sync === '1';
    return this.pppoeService.listActiveSessions(tenantId, deviceId, shouldSync, userId);
  }

  @Post('devices/:deviceId/sessions/disconnect')
  @HttpCode(HttpStatus.OK)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Disconnect an active PPPoE broadband session' })
  @ApiResponse({ status: 200, description: 'Disconnect command queued' })
  async disconnectSession(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: DisconnectPppoeSessionDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.pppoeService.disconnectActiveSession(tenantId, deviceId, dto, userId);
  }

  // =========================================================================
  // AGENT COMMAND STATUS
  // =========================================================================

  @Get('devices/:deviceId/commands/:commandId')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
  )
  @ApiOperation({ summary: 'Get status and execution results of an agent command' })
  @ApiResponse({ status: 200, type: CommandResponseDto })
  async getCommandStatus(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('commandId') commandId: string,
  ): Promise<CommandResponseDto> {
    await this.pppoeService.assertDeviceOwnership(tenantId, deviceId);
    return this.agentService.getCommandStatus(tenantId, deviceId, commandId);
  }
}
