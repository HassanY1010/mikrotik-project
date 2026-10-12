import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { AgentService } from './agent.service';
import { PairAgentDto } from './dto/pair-agent.dto';
import {
  PairingCodeResponseDto,
  AgentPairSuccessDto,
  AgentStatusResponseDto,
} from './dto/agent-response.dto';
import {
  AgentHeartbeatDto,
  HeartbeatResponseDto,
} from './dto/heartbeat.dto';
import {
  QueueCommandDto,
  SubmitCommandResultDto,
  CommandResponseDto,
} from './dto/command.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Public } from '../../core/decorators/public.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('agent')
@Controller()
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  // =========================================================================
  // ADMIN & TENANT MANAGEMENT ENDPOINTS (JWT + RBAC + TENANT ISOLATION)
  // =========================================================================

  @Post('devices/:id/agent/pairing-code')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a single-use 6-digit agent pairing code valid for 5 minutes' })
  @ApiResponse({ status: 201, type: PairingCodeResponseDto })
  @ApiResponse({ status: 403, description: 'Device does not belong to authorized tenant' })
  @ApiResponse({ status: 404, description: 'Router device not found' })
  async generatePairingCode(
    @Param('id') deviceId: string,
    @TenantId() tenantId?: string,
    @CurrentUser('id') userId?: string,
  ): Promise<PairingCodeResponseDto> {
    return this.agentService.generatePairingCode(tenantId, deviceId, userId);
  }

  @Get('devices/:id/agent')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.CASHIER,
  )
  @ApiOperation({ summary: 'Get current agent registration and connectivity status for a router' })
  @ApiResponse({ status: 200, type: AgentStatusResponseDto })
  @ApiResponse({ status: 403, description: 'Device does not belong to authorized tenant' })
  @ApiResponse({ status: 404, description: 'Router device not found' })
  async getAgentStatus(
    @Param('id') deviceId: string,
    @TenantId() tenantId?: string,
  ): Promise<AgentStatusResponseDto | null> {
    return this.agentService.getAgentStatus(tenantId, deviceId);
  }

  @Delete('devices/:id/agent')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke agent access and invalidate its credentials' })
  @ApiResponse({ status: 200, description: 'Agent revoked successfully' })
  @ApiResponse({ status: 403, description: 'Device does not belong to authorized tenant' })
  @ApiResponse({ status: 404, description: 'Router or agent not found' })
  async revokeAgent(
    @Param('id') deviceId: string,
    @TenantId() tenantId?: string,
    @CurrentUser('id') userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.agentService.revokeAgent(tenantId, deviceId, userId);
  }

  @Post('devices/:id/agent/revoke')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alternative POST endpoint to revoke agent credentials' })
  async revokeAgentPost(
    @Param('id') deviceId: string,
    @TenantId() tenantId?: string,
    @CurrentUser('id') userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.agentService.revokeAgent(tenantId, deviceId, userId);
  }

  @Post('devices/:id/agent/commands')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Queue an authorized typed command for execution on the router via LAN Agent' })
  @ApiResponse({ status: 201, type: CommandResponseDto })
  @ApiResponse({ status: 400, description: 'Unsupported command type or no active agent' })
  @ApiResponse({ status: 403, description: 'Access denied: Device belongs to another tenant' })
  @ApiResponse({ status: 404, description: 'Router not found' })
  @ApiResponse({ status: 409, description: 'Operation ID is already in use' })
  async queueCommand(
    @Param('id') deviceId: string,
    @Body() dto: QueueCommandDto,
    @TenantId() tenantId?: string,
    @CurrentUser('id') userId?: string,
  ): Promise<CommandResponseDto> {
    return this.agentService.queueCommand(tenantId, deviceId, dto, userId);
  }

  @Get('devices/:id/agent/commands/:commandId')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.OWNER,
    RoleName.TENANT_ADMIN,
    RoleName.ADMIN,
    RoleName.MANAGER,
  )
  @ApiOperation({ summary: 'Get current execution status and result of a queued agent command' })
  @ApiResponse({ status: 200, type: CommandResponseDto })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Command or router not found' })
  async getCommandStatus(
    @Param('id') deviceId: string,
    @Param('commandId') commandId: string,
    @TenantId() tenantId?: string,
  ): Promise<CommandResponseDto> {
    return this.agentService.getCommandStatus(tenantId, deviceId, commandId);
  }

  // =========================================================================
  // PUBLIC AGENT LIFECYCLE & RPC PROTOCOL ENDPOINTS (CALLED BY SUDAFI LAN AGENT)
  // =========================================================================

  @Public()
  @Post('agent/pair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Public agent pairing endpoint (consumes code, issues AgentAuthToken, protected by rate limiting)',
  })
  @ApiResponse({ status: 200, type: AgentPairSuccessDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired pairing code' })
  @ApiResponse({ status: 409, description: 'Pairing code already consumed' })
  @ApiResponse({ status: 429, description: 'Too many attempts. Lockout active' })
  async pairAgent(
    @Body() dto: PairAgentDto,
    @Req() req: Request,
  ): Promise<AgentPairSuccessDto> {
    // Rely strictly on Express-vetted req.ip (configured with trust proxy behind Render)
    const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'sudafi-agent';

    return this.agentService.pairAgent(dto, ipAddress, userAgent);
  }

  @Public()
  @Post('agent/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validates an agent token and returns associated metadata' })
  @ApiResponse({ status: 200, description: 'Token is valid' })
  @ApiResponse({ status: 401, description: 'Token is invalid or revoked' })
  async validateToken(@Body('token') token: string) {
    return this.agentService.validateAgentToken(token);
  }

  @Public()
  @Post('agent/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Public agent heartbeat keepalive (authenticates agent, updates presence, and retrieves pending commands)',
  })
  @ApiResponse({ status: 200, type: HeartbeatResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or revoked agent token' })
  async heartbeat(
    @Body() dto: AgentHeartbeatDto,
    @Req() req: Request,
  ): Promise<HeartbeatResponseDto> {
    const rawToken = this.extractAgentToken(req, (req.body as any)?.token);
    const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

    return this.agentService.processHeartbeat(rawToken, ipAddress, dto);
  }

  @Public()
  @Post('agent/commands/:id/result')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Public endpoint for agent to submit execution result of a dispatched command (idempotent)',
  })
  @ApiResponse({ status: 200, description: 'Command result recorded successfully' })
  @ApiResponse({ status: 400, description: 'Operation ID mismatch' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked agent token' })
  @ApiResponse({ status: 403, description: 'Command does not belong to this agent' })
  @ApiResponse({ status: 404, description: 'Command not found' })
  async submitCommandResult(
    @Param('id') commandId: string,
    @Body() dto: SubmitCommandResultDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    const rawToken = this.extractAgentToken(req, (req.body as any)?.token);

    return this.agentService.submitCommandResult(rawToken, commandId, dto);
  }

  // --- Private Helpers ---

  private extractAgentToken(req: Request, bodyToken?: string): string {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) return token;
    }

    const headerToken = req.headers['x-agent-token'];
    if (typeof headerToken === 'string' && headerToken.trim()) {
      return headerToken.trim();
    }

    if (bodyToken && typeof bodyToken === 'string' && bodyToken.trim()) {
      return bodyToken.trim();
    }

    throw new UnauthorizedException('Missing agent authentication token');
  }
}

