import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { AgentStatus, TenantStatus, AgentCommandStatus } from '@prisma/client';
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
  AgentCommandType,
  QueueCommandDto,
  SubmitCommandResultDto,
  CommandResponseDto,
} from './dto/command.dto';

@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentService.name);

  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
  private readonly MAX_CLIENT_ATTEMPTS = 5; // 5 failed attempts per client
  private readonly MAX_CODE_ATTEMPTS = 3; // 3 failed attempts per code
  private readonly CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes code validity
  public readonly HEARTBEAT_INTERVAL_MS = 25 * 1000; // 25 seconds
  public readonly HEARTBEAT_TIMEOUT_MS = 60 * 1000; // 60 seconds (offline threshold)
  public readonly DISPATCH_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes before unacknowledged dispatch retry
  public readonly MAX_COMMAND_ATTEMPTS = 3; // Maximum dispatch retries
  public readonly COMMAND_TTL_MS = 10 * 60 * 1000; // 10 minutes total command lifespan
  private sweepInterval: NodeJS.Timeout | null = null;
  private readonly serverSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {

    // 1. Strict secret validation: dedicated AGENT_PAIRING_SECRET is mandatory
    const secret = this.configService.get<string>('AGENT_PAIRING_SECRET');
    if (!secret || secret.trim().length < 32) {
      throw new Error(
        'FATAL: AGENT_PAIRING_SECRET environment variable is missing or shorter than 32 characters. Cannot start secure AgentService.',
      );
    }

    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production' && secret.toLowerCase().includes('development_')) {
      throw new Error(
        'FATAL: Insecure development placeholder detected for AGENT_PAIRING_SECRET in production mode. A dedicated strong 32+ character random secret is strictly required.',
      );
    }

    this.serverSecret = crypto
      .createHash('sha256')
      .update(`sudafi:agent:pairing:v1:${secret}`)
      .digest('hex');
  }

  onModuleInit() {
    // Non-blocking background sweeper for stale agent and command detection
    this.sweepInterval = setInterval(() => {
      this.markStaleAgentsOffline().catch((err) => {
        this.logger.debug(`Background stale agent sweep encountered non-critical error: ${err}`);
      });
      this.expireStaleCommands().catch((err) => {
        this.logger.debug(`Background command expiration sweep encountered non-critical error: ${err}`);
      });
    }, 30000);

    if (this.sweepInterval && (this.sweepInterval as any).unref) {
      (this.sweepInterval as any).unref();
    }
  }


  onModuleDestroy() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  /**
   * Generates a single-use 6-digit pairing code for a specific router device.
   * Enforces tenant ownership and creates a cryptographically salted HMAC hash
   * keyed with the private server secret.
   */
  async generatePairingCode(
    tenantId: string | undefined,
    deviceId: string,
    userId?: string,
  ): Promise<PairingCodeResponseDto> {
    // 1. Verify router existence and tenant ownership
    const device = await this.prisma.mikroTikDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, tenantId: true, name: true, deletedAt: true },
    });

    if (!device || device.deletedAt !== null) {
      throw new NotFoundException(`Router device [${deviceId}] not found`);
    }

    if (tenantId && device.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied: Device does not belong to authorized tenant');
    }

    // 2. Generate cryptographically secure 6-digit code in [100000, 1000000)
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString('hex');

    // HMAC uses the server secret as key and hashes (rawCode + salt)
    const codeHash = this.computeCodeHash(rawCode, salt);
    const expiresAt = new Date(Date.now() + this.CODE_TTL_MS);

    // 3. Invalidate any existing unconsumed pairing codes for this router
    await this.prisma.agentPairingCode.updateMany({
      where: {
        deviceId: device.id,
        isConsumed: false,
      },
      data: {
        isConsumed: true,
      },
    });

    // 4. Save new salted pairing code record
    await this.prisma.agentPairingCode.create({
      data: {
        tenantId: device.tenantId,
        deviceId: device.id,
        codeHash,
        salt,
        attempts: 0,
        maxAttempts: this.MAX_CODE_ATTEMPTS,
        isConsumed: false,
        expiresAt,
      },
    });

    // 5. Audit log (Zero raw code logging)
    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'AGENT_PAIRING_CODE_GENERATED',
        entity: 'device_agents',
        entityId: device.id,
        newValues: {
          deviceId: device.id,
          expiresAt,
        },
      },
    });

    this.logger.log(`Issued new agent pairing code for router [${device.id}]`);

    return {
      code: rawCode,
      expiresAt,
      expiresInSeconds: Math.floor(this.CODE_TTL_MS / 1000),
    };
  }

  /**
   * Consumes a 6-digit pairing code, issues an independent agent authentication token,
   * and associates the agent with the tenant and device.
   * Atomically protects against race conditions, reuse, partial failures, and brute-force guessing.
   */
  async pairAgent(
    dto: PairAgentDto,
    ipAddress: string,
    clientIdentifier?: string,
  ): Promise<AgentPairSuccessDto> {
    const clientKey = this.computeClientKey(ipAddress, clientIdentifier);

    // 1. Check persistent lockout state (survives restarts and shared across instances)
    await this.checkPersistentClientLockout(clientKey);

    // 2. Search for active, non-expired, non-consumed pairing codes
    const now = new Date();
    const candidateCodes = await this.prisma.agentPairingCode.findMany({
      where: {
        isConsumed: false,
        expiresAt: { gt: now },
      },
    });

    let matchedCodeRecord: (typeof candidateCodes)[0] | null = null;

    for (const record of candidateCodes) {
      if (record.attempts >= record.maxAttempts) {
        continue; // Code locked due to per-code threshold
      }

      const rawCode = dto.pairingCode || dto.code || '';
      const candidateHash = this.computeCodeHash(rawCode, record.salt);

      // Use constant-time comparison to prevent timing attacks
      if (
        Buffer.byteLength(candidateHash) === Buffer.byteLength(record.codeHash) &&
        crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(record.codeHash))
      ) {
        matchedCodeRecord = record;
        break;
      }
    }

    // 3. Handle invalid or non-matching code
    if (!matchedCodeRecord) {
      await this.recordPersistentFailedAttempt(clientKey);

      // Increment attempt counter on candidate codes to enforce per-code lockout threshold
      if (candidateCodes.length > 0) {
        await this.prisma.agentPairingCode.updateMany({
          where: {
            id: { in: candidateCodes.map((c) => c.id) },
            isConsumed: false,
          },
          data: {
            attempts: { increment: 1 },
          },
        });
      }

      throw new UnauthorizedException('Invalid or expired agent pairing code');
    }

    // 4. Generate independent cryptographic agent token (64 hex chars = 256 bits entropy)
    const rawAgentToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawAgentToken).digest('hex');

    // 5. ATOMIC TRANSACTION: Code consumption + Invalidation of old active agent + New agent creation
    // If any step fails, the entire transaction rolls back and the code is NOT burned!
    let createdAgent: { id: string; deviceId: string; tenantId: string };

    try {
      createdAgent = await this.prisma.$transaction(async (tx) => {
        // A) Atomic consumption: only 1 concurrent query succeeds
        const updateResult = await tx.agentPairingCode.updateMany({
          where: {
            id: matchedCodeRecord!.id,
            isConsumed: false,
            expiresAt: { gt: now },
            attempts: { lt: matchedCodeRecord!.maxAttempts },
          },
          data: {
            isConsumed: true,
            consumedAt: now,
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException('Pairing code has already been consumed or has expired');
        }

        // B) Acquire Row-Level Lock on target router in PostgreSQL
        // Strictly serializes concurrent pairing requests attempting to pair to the same router
        await tx.mikroTikDevice.update({
          where: { id: matchedCodeRecord!.deviceId },
          data: { updatedAt: now },
        });

        // C) Invalidate any previously active agent on this router (preserving audit trail)
        await tx.deviceAgent.updateMany({
          where: {
            deviceId: matchedCodeRecord!.deviceId,
            status: { not: AgentStatus.REVOKED },
          },
          data: {
            status: AgentStatus.REVOKED,
            revokedAt: now,
            tokenHash: crypto.randomBytes(32).toString('hex'), // scramble old token
          },
        });

        // C) Create new agent row
        const newAgent = await tx.deviceAgent.create({
          data: {
            tenantId: matchedCodeRecord!.tenantId,
            deviceId: matchedCodeRecord!.deviceId,
            name: dto.name,
            tokenHash,
            status: AgentStatus.OFFLINE,
            version: dto.version || '1.0.0',
            ipAddress,
            pairedAt: now,
          },
        });

        // D) Audit log
        await tx.auditLog.create({
          data: {
            tenantId: newAgent.tenantId,
            action: 'AGENT_PAIRED_SUCCESSFULLY',
            entity: 'device_agents',
            entityId: newAgent.id,
            newValues: {
              agentId: newAgent.id,
              deviceId: newAgent.deviceId,
              agentName: newAgent.name,
              version: newAgent.version,
              ipAddress,
            },
          },
        });

        return {
          id: newAgent.id,
          deviceId: newAgent.deviceId,
          tenantId: newAgent.tenantId,
        };
      });
    } catch (err) {
      if (err instanceof ConflictException) {
        await this.recordPersistentFailedAttempt(clientKey);
        throw err;
      }
      this.logger.error(`Failed atomic agent pairing transaction for router [${matchedCodeRecord.deviceId}]: ${err}`);
      throw err;
    }

    // Reset lockout tracker for this client upon successful pairing
    await this.resetClientLockout(clientKey);

    this.logger.log(`Successfully paired agent [${createdAgent.id}] for router [${createdAgent.deviceId}]`);

    return {
      success: true,
      agentId: createdAgent.id,
      agentToken: rawAgentToken,
      token: rawAgentToken,
      deviceId: createdAgent.deviceId,
      tenantId: createdAgent.tenantId,
    };
  }

  /**
   * Retrieves the current agent status and metadata for a specific router.
   * Returns the active agent if present, or the latest revoked agent.
   */
  async getAgentStatus(
    tenantId: string | undefined,
    deviceId: string,
  ): Promise<AgentStatusResponseDto | null> {
    const device = await this.prisma.mikroTikDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, tenantId: true, deletedAt: true },
    });

    if (!device || device.deletedAt !== null) {
      throw new NotFoundException(`Router device [${deviceId}] not found`);
    }

    if (tenantId && device.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied: Device does not belong to authorized tenant');
    }

    // First look for active (non-revoked) agent
    let agent = await this.prisma.deviceAgent.findFirst({
      where: {
        deviceId,
        status: { not: AgentStatus.REVOKED },
      },
      orderBy: { pairedAt: 'desc' },
    });

    // Stale Heartbeat Check: If agent was ONLINE but missed heartbeat past timeout threshold, mark OFFLINE
    if (agent && agent.status === AgentStatus.ONLINE && agent.lastPingAt) {
      const isStale = Date.now() - agent.lastPingAt.getTime() > this.HEARTBEAT_TIMEOUT_MS;
      if (isStale) {
        agent = await this.prisma.deviceAgent.update({
          where: { id: agent.id },
          data: { status: AgentStatus.OFFLINE },
        });
      }
    }

    // If no active agent, get the most recent agent (even if revoked)
    if (!agent) {
      agent = await this.prisma.deviceAgent.findFirst({
        where: { deviceId },
        orderBy: { pairedAt: 'desc' },
      });
    }

    if (!agent) {
      return null;
    }

    return {
      id: agent.id,
      tenantId: agent.tenantId,
      deviceId: agent.deviceId,
      name: agent.name,
      status: agent.status,
      version: agent.version,
      ipAddress: agent.ipAddress,
      lastPingAt: agent.lastPingAt,
      pairedAt: agent.pairedAt,
      revokedAt: agent.revokedAt,
    };
  }

  /**
   * Revokes an agent immediately. Invalidates token and marks status as REVOKED.
   * Preserves historical record in database.
   */
  async revokeAgent(
    tenantId: string | undefined,
    deviceId: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const device = await this.prisma.mikroTikDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, tenantId: true, deletedAt: true },
    });

    if (!device || device.deletedAt !== null) {
      throw new NotFoundException(`Router device [${deviceId}] not found`);
    }

    if (tenantId && device.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied: Device does not belong to authorized tenant');
    }

    const agent = await this.prisma.deviceAgent.findFirst({
      where: {
        deviceId,
        status: { not: AgentStatus.REVOKED },
      },
      orderBy: { pairedAt: 'desc' },
    });

    if (!agent) {
      throw new NotFoundException(`No active agent registered for router [${deviceId}]`);
    }

    // Invalidate the token hash permanently so old credentials cannot authenticate
    const scrambledHash = crypto.randomBytes(32).toString('hex');
    const now = new Date();

    await this.prisma.deviceAgent.update({
      where: { id: agent.id },
      data: {
        status: AgentStatus.REVOKED,
        revokedAt: now,
        tokenHash: scrambledHash,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: agent.tenantId,
        userId: userId ?? null,
        action: 'AGENT_REVOKED',
        entity: 'device_agents',
        entityId: agent.id,
        newValues: {
          deviceId: agent.deviceId,
          revokedAt: now,
        },
      },
    });

    this.logger.warn(`Revoked agent [${agent.id}] for router [${deviceId}] by user [${userId ?? 'SYSTEM'}]`);

    return {
      success: true,
      message: 'Agent credentials and access have been revoked successfully',
    };
  }

  /**
   * Validates an agent authentication token.
   * Ensures the agent is active, not revoked, and the associated tenant/device are active.
   */
  async validateAgentToken(rawToken: string): Promise<{
    valid: boolean;
    agent: {
      id: string;
      tenantId: string;
      deviceId: string;
      status: AgentStatus;
      name: string;
    };
  }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('Missing or invalid agent authentication token');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const agent = await this.prisma.deviceAgent.findUnique({
      where: { tokenHash },
      include: {
        tenant: { select: { id: true, status: true, deletedAt: true } },
        device: { select: { id: true, tenantId: true, deletedAt: true } },
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Invalid agent authentication token');
    }

    if (agent.status === AgentStatus.REVOKED) {
      throw new UnauthorizedException('Agent access has been revoked');
    }

    if (!agent.tenant || agent.tenant.deletedAt !== null) {
      throw new ForbiddenException('Associated tenant does not exist or has been deleted');
    }

    if (agent.tenant.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException('Associated tenant has been suspended');
    }

    if (!agent.device || agent.device.deletedAt !== null) {
      throw new NotFoundException('Associated router device no longer exists');
    }

    return {
      valid: true,
      agent: {
        id: agent.id,
        tenantId: agent.tenantId,
        deviceId: agent.deviceId,
        status: agent.status,
        name: agent.name,
      },
    };
  }

  // =========================================================================
  // STEP 2: HEARTBEAT & TYPED RPC COMMAND PROTOCOL
  // =========================================================================

  /**
   * Processes a periodic heartbeat from an authenticated LAN Agent.
   * Updates lastPingAt, IP address, version, marks status as ONLINE,
   * and returns any pending queued commands for this agent.
   */
  async processHeartbeat(
    rawToken: string,
    ipAddress: string,
    dto?: AgentHeartbeatDto,
  ): Promise<HeartbeatResponseDto> {
    const auth = await this.validateAgentToken(rawToken);
    const now = new Date();

    // 1. Update agent presence and status to ONLINE
    await this.prisma.deviceAgent.update({
      where: { id: auth.agent.id },
      data: {
        status: AgentStatus.ONLINE,
        lastPingAt: now,
        ipAddress,
        version: dto?.version ?? undefined,
      },
    });

    // 2. Fetch pending commands or unacknowledged timed-out dispatched commands
    const dispatchRetryThreshold = new Date(now.getTime() - this.DISPATCH_TIMEOUT_MS);
    const commandsToDispatch = await this.prisma.agentCommand.findMany({
      where: {
        agentId: auth.agent.id,
        expiresAt: { gt: now },
        OR: [
          { status: AgentCommandStatus.PENDING },
          {
            status: AgentCommandStatus.DISPATCHED,
            dispatchedAt: { lt: dispatchRetryThreshold },
            attempts: { lt: this.MAX_COMMAND_ATTEMPTS },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    // 3. Mark fetched commands as DISPATCHED with updated timestamp and incremented attempt
    if (commandsToDispatch.length > 0) {
      await this.prisma.agentCommand.updateMany({
        where: { id: { in: commandsToDispatch.map((c: any) => c.id) } },
        data: {
          status: AgentCommandStatus.DISPATCHED,
          dispatchedAt: now,
          attempts: { increment: 1 },
        },
      });
    }

    return {
      success: true,
      status: 'ACK',
      serverTime: now,
      heartbeatIntervalMs: this.HEARTBEAT_INTERVAL_MS,
      offlineThresholdMs: this.HEARTBEAT_TIMEOUT_MS,
      pendingCommands: commandsToDispatch.map((cmd: any) => ({
        id: cmd.id,
        operationId: cmd.operationId,
        type: cmd.type,
        payload: cmd.payload,
        createdAt: cmd.createdAt,
        expiresAt: cmd.expiresAt,
      })),
    };
  }

  /**
   * Scans all agents marked as ONLINE and transitions them to OFFLINE
   * if their lastPingAt exceeds the heartbeat timeout threshold.
   */
  async markStaleAgentsOffline(): Promise<number> {
    const threshold = new Date(Date.now() - this.HEARTBEAT_TIMEOUT_MS);
    const result = await this.prisma.deviceAgent.updateMany({
      where: {
        status: AgentStatus.ONLINE,
        lastPingAt: { lt: threshold },
      },
      data: {
        status: AgentStatus.OFFLINE,
      },
    });

    if (result.count > 0) {
      this.logger.debug(`Transitioned ${result.count} stale agent(s) to OFFLINE`);
    }

    return result.count;
  }

  /**
   * Scans all commands and transitions timed-out or unacknowledged commands to EXPIRED.
   */
  async expireStaleCommands(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.agentCommand.updateMany({
      where: {
        status: { in: [AgentCommandStatus.PENDING, AgentCommandStatus.DISPATCHED] },
        expiresAt: { lt: now },
      },
      data: {
        status: AgentCommandStatus.EXPIRED,
        errorMessage: 'Command expired before completion',
      },
    });

    if (result.count > 0) {
      this.logger.debug(`Expired ${result.count} stale command(s)`);
    }

    return result.count;
  }

  /**
   * Queues an authorized typed RPC command for a target router's active agent.
   * Enforces strict type whitelisting and UUID operationId idempotency.
   */
  async queueCommand(
    tenantId: string | undefined,
    deviceId: string,
    dto: QueueCommandDto,
    userId?: string,
  ): Promise<CommandResponseDto> {
    // 1. Verify router existence and tenant ownership
    const device = await this.prisma.mikroTikDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, tenantId: true, deletedAt: true },
    });

    if (!device || device.deletedAt !== null) {
      throw new NotFoundException(`Router device [${deviceId}] not found`);
    }

    if (tenantId && device.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied: Device does not belong to authorized tenant');
    }

    // 2. Strict whitelist check: Only defined AgentCommandType values permitted
    const allowedTypes = Object.values(AgentCommandType);
    if (!allowedTypes.includes(dto.type)) {
      throw new BadRequestException(
        `Unsupported command type: [${dto.type}]. Permitted types are: ${allowedTypes.join(', ')}`,
      );
    }

    // 3. Idempotency Check: prevent duplicate command queuing
    const existingCommand = await this.prisma.agentCommand.findUnique({
      where: { operationId: dto.operationId },
    });

    if (existingCommand) {
      if (existingCommand.deviceId === deviceId) {
        return this.mapToCommandDto(existingCommand);
      }
      throw new ConflictException('Operation ID is already in use for a different router device');
    }

    // 4. Locate active agent for this router
    let activeAgent: any = null;
    try {
      activeAgent = await this.prisma.deviceAgent.findFirst({
        where: {
          deviceId,
          status: { not: AgentStatus.REVOKED },
        },
        orderBy: { pairedAt: 'desc' },
      });
    } catch (err: any) {
      this.logger.warn(`Could not query deviceAgent table in queueCommand: ${err?.message}`);
    }

    if (!activeAgent) {
      throw new BadRequestException(`Cannot queue command: No active agent is paired with router [${deviceId}]`);
    }

    // 5. Create persistent command record
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.COMMAND_TTL_MS);

    try {
      const command = await this.prisma.agentCommand.create({
        data: {
          tenantId: device.tenantId,
          deviceId: device.id,
          agentId: activeAgent.id,
          operationId: dto.operationId,
          type: dto.type,
          payload: dto.payload,
          status: AgentCommandStatus.PENDING,
          expiresAt,
        },
      });

      this.logger.log(
        `Queued command [${command.id}] (${dto.type}) with operationId [${dto.operationId}] for router [${deviceId}] by user [${userId ?? 'SYSTEM'}]`,
      );

      return this.mapToCommandDto(command);
    } catch (err: any) {
      // Handle race condition on duplicate operationId (Prisma P2002 Unique Constraint Violation)
      if (err?.code === 'P2002' || err?.message?.includes('operationId')) {
        const concurrentCommand = await this.prisma.agentCommand.findUnique({
          where: { operationId: dto.operationId },
        });
        if (concurrentCommand && concurrentCommand.deviceId === deviceId) {
          return this.mapToCommandDto(concurrentCommand);
        }
        throw new ConflictException('Operation ID is already in use for a different router device');
      }
      if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
        throw new BadRequestException('Agent command service is currently synchronizing database schema. Please try again shortly.');
      }
      throw err;
    }
  }

  /**
   * Records the outcome of a dispatched command executed by the agent.
   * Enforces agent authorization and idempotency.
   */
  async submitCommandResult(
    rawToken: string,
    commandId: string,
    dto: SubmitCommandResultDto,
  ): Promise<{ success: boolean; message: string }> {
    const auth = await this.validateAgentToken(rawToken);

    const command = await this.prisma.agentCommand.findUnique({
      where: { id: commandId },
    });

    if (!command) {
      throw new NotFoundException(`Command [${commandId}] not found`);
    }

    if (command.agentId !== auth.agent.id) {
      throw new ForbiddenException('Access denied: Command was not dispatched to this agent');
    }

    if (command.operationId !== dto.operationId) {
      throw new BadRequestException('Operation ID mismatch for specified command');
    }

    // Idempotency check: if command is already finalized, return success safely
    if (
      command.status === AgentCommandStatus.COMPLETED ||
      command.status === AgentCommandStatus.FAILED
    ) {
      return {
        success: true,
        message: 'Command result already recorded (idempotent)',
      };
    }

    const now = new Date();
    const finalStatus =
      dto.status === 'COMPLETED' ? AgentCommandStatus.COMPLETED : AgentCommandStatus.FAILED;

    // Atomic update to avoid race conditions on concurrent result submissions
    const updateResult = await this.prisma.agentCommand.updateMany({
      where: {
        id: commandId,
        status: { notIn: [AgentCommandStatus.COMPLETED, AgentCommandStatus.FAILED] },
      },
      data: {
        status: finalStatus,
        completedAt: now,
        result: (dto.result as any) ?? undefined,
        errorMessage: dto.errorMessage ?? null,
      },
    });

    if (updateResult.count === 0) {
      return {
        success: true,
        message: 'Command result already recorded (idempotent)',
      };
    }

    this.logger.log(`Command [${commandId}] finalized with status [${finalStatus}] by agent [${auth.agent.id}]`);

    return {
      success: true,
      message: `Command result recorded as ${finalStatus}`,
    };
  }


  /**
   * Retrieves the current execution status of a command.
   */
  async getCommandStatus(
    tenantId: string | undefined,
    deviceId: string,
    commandId: string,
  ): Promise<CommandResponseDto> {
    const device = await this.prisma.mikroTikDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, tenantId: true, deletedAt: true },
    });

    if (!device || device.deletedAt !== null) {
      throw new NotFoundException(`Router device [${deviceId}] not found`);
    }

    if (tenantId && device.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied: Device does not belong to authorized tenant');
    }

    const command = await this.prisma.agentCommand.findUnique({
      where: { id: commandId },
    });

    if (!command || command.deviceId !== deviceId) {
      throw new NotFoundException(`Command [${commandId}] not found for router [${deviceId}]`);
    }

    return this.mapToCommandDto(command);
  }

  private mapToCommandDto(command: any): CommandResponseDto {
    return {
      id: command.id,
      operationId: command.operationId,
      deviceId: command.deviceId,
      agentId: command.agentId,
      type: command.type,
      status: command.status,
      payload: command.payload,
      result: command.result,
      errorMessage: command.errorMessage,
      createdAt: command.createdAt,
      dispatchedAt: command.dispatchedAt,
      completedAt: command.completedAt,
      expiresAt: command.expiresAt,
    };
  }

  // --- Cryptographic and Rate Limiting Helpers ---


  private computeCodeHash(code: string, salt: string): string {
    return crypto
      .createHmac('sha256', this.serverSecret)
      .update(`${code}:${salt}`)
      .digest('hex');
  }

  private computeClientKey(ip: string, clientIdentifier?: string): string {
    const raw = `${ip.trim()}:${clientIdentifier?.trim() || 'default'}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private async checkPersistentClientLockout(clientKey: string): Promise<void> {
    try {
      const record = await this.prisma.agentPairingAttempt.findUnique({
        where: { clientKey },
      });

      if (!record) return;

      if (record.lockedUntil && record.lockedUntil > new Date()) {
        const remainingSeconds = Math.ceil((record.lockedUntil.getTime() - Date.now()) / 1000);
        throw new HttpException(
          `Too many failed pairing attempts. Lockout active. Please retry in ${remainingSeconds} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // If table query fails unexpectedly, fail open or log warning
      this.logger.warn(`Could not verify persistent client lockout: ${err}`);
    }
  }

  private async recordPersistentFailedAttempt(clientKey: string): Promise<void> {
    const now = new Date();
    try {
      const record = await this.prisma.agentPairingAttempt.upsert({
        where: { clientKey },
        create: {
          clientKey,
          attempts: 1,
          lastAttemptAt: now,
        },
        update: {
          attempts: { increment: 1 },
          lastAttemptAt: now,
        },
      });

      if (record.attempts >= this.MAX_CLIENT_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION_MS);
        await this.prisma.agentPairingAttempt.update({
          where: { clientKey },
          data: { lockedUntil },
        });
        this.logger.warn(
          `Persistent rate limit triggered: ClientKey [${clientKey.substring(0, 8)}...] locked out for 15 minutes`,
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to record persistent pairing attempt: ${err}`);
    }
  }

  private async resetClientLockout(clientKey: string): Promise<void> {
    try {
      await this.prisma.agentPairingAttempt.deleteMany({
        where: { clientKey },
      });
    } catch (err) {
      this.logger.warn(`Failed to reset persistent client lockout: ${err}`);
    }
  }
}
