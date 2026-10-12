import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { AgentService } from '../agent/agent.service';
import {
  AgentStatus,
  PppoeAccountStatus,
  SyncStatus,
  MikroTikDevice,
  PppoeProfile,
  PppoeAccount,
} from '@prisma/client';
import { AgentCommandType } from '../agent/dto/command.dto';
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

@Injectable()
export class PppoeService {
  private readonly logger = new Logger(PppoeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly agentService: AgentService,
  ) {}

  /**
   * Strictly asserts device existence and tenant authorization.
   * Prevents any horizontal privilege escalation across tenants or devices.
   */
  async assertDeviceOwnership(
    tenantId: string | undefined,
    deviceId: string,
  ): Promise<MikroTikDevice> {
    const device = await this.prisma.mikroTikDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device || device.deletedAt !== null) {
      throw new NotFoundException(`Router device [${deviceId}] not found or has been deleted`);
    }

    if (tenantId && device.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied: Router device does not belong to authorized tenant');
    }

    return device;
  }

  /**
   * Asserts that the tenant has an active, valid, unexpired subscription.
   * Super Admin platform operators (when tenantId is undefined) bypass this check.
   */
  async assertActiveSubscription(tenantId: string | undefined): Promise<void> {
    if (!tenantId) return;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });

    if (tenant?.status === 'SUSPENDED') {
      throw new ForbiddenException({
        code: 'TENANT_SUSPENDED',
        message: 'تم تعليق حساب المنشأة من قبل إدارة المنصة. يرجى التواصل مع الدعم الفني.',
      });
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'يلزم وجود اشتراك نشط أو فترة تجريبية لإدارة وإنشاء خدمات PPPoE.',
      });
    }

    if (new Date(subscription.expiresAt).getTime() <= Date.now()) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'انتهت صلاحية اشتراك الشبكة. يرجى تجديد الباقة للاستمرار في استخدام خدمات PPPoE.',
      });
    }
  }

  // =========================================================================
  // PPPoE PROFILES
  // =========================================================================

  /**
   * Lists all PPPoE profiles configured for a router device.
   */
  async listProfiles(
    tenantId: string | undefined,
    deviceId: string,
  ): Promise<PppoeProfileResponseDto[]> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);

    const profiles = await this.prisma.pppoeProfile.findMany({
      where: {
        deviceId: device.id,
        tenantId: device.tenantId,
      },
      include: {
        _count: {
          select: { accounts: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return profiles.map((p) => this.mapProfileToDto(p, p._count?.accounts));
  }

  /**
   * Retrieves a single PPPoE profile by ID.
   */
  async getProfile(
    tenantId: string | undefined,
    deviceId: string,
    profileId: string,
  ): Promise<PppoeProfileResponseDto> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);

    const profile = await this.prisma.pppoeProfile.findFirst({
      where: {
        id: profileId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
      include: {
        _count: {
          select: { accounts: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException(`PPPoE profile [${profileId}] not found on router [${deviceId}]`);
    }

    return this.mapProfileToDto(profile, profile._count?.accounts);
  }

  /**
   * Creates a new PPPoE profile and queues synchronization with the router.
   */
  async createProfile(
    tenantId: string | undefined,
    deviceId: string,
    dto: CreatePppoeProfileDto,
    userId?: string,
  ): Promise<PppoeProfileResponseDto> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);
    await this.assertActiveSubscription(tenantId);

    // 1. Conflict check for duplicate profile name on same router
    const existing = await this.prisma.pppoeProfile.findUnique({
      where: {
        tenantId_deviceId_name: {
          tenantId: device.tenantId,
          deviceId: device.id,
          name: dto.name.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `A PPPoE profile named "${dto.name}" already exists on router [${deviceId}]`,
      );
    }

    // 2. Persist profile record
    const profile = await this.prisma.pppoeProfile.create({
      data: {
        tenantId: device.tenantId,
        deviceId: device.id,
        name: dto.name.trim(),
        rateLimit: dto.rateLimit?.trim() || null,
        localAddress: dto.localAddress?.trim() || null,
        remoteAddress: dto.remoteAddress?.trim() || null,
        dnsServers: dto.dnsServers?.trim() || null,
        onlyOne: dto.onlyOne !== undefined ? dto.onlyOne : true,
        price: dto.price !== undefined ? dto.price : 0,
        description: dto.description?.trim() || null,
      },
    });

    // 3. Queue router sync command if agent is paired
    let queuedCommandId: string | null = null;
    const activeAgent = await this.prisma.deviceAgent.findFirst({
      where: { deviceId: device.id, status: { not: AgentStatus.REVOKED } },
    });

    if (activeAgent) {
      try {
        const cmd = await this.agentService.queueCommand(
          device.tenantId,
          device.id,
          {
            operationId: crypto.randomUUID(),
            type: AgentCommandType.PPPOE_PROFILE_SYNC,
            payload: {
              name: profile.name,
              rateLimit: profile.rateLimit ?? undefined,
              localAddress: profile.localAddress ?? undefined,
              remoteAddress: profile.remoteAddress ?? undefined,
              dnsServers: profile.dnsServers ?? undefined,
              onlyOne: profile.onlyOne,
            },
          },
          userId,
        );
        queuedCommandId = cmd.id;
      } catch (err) {
        this.logger.warn(`Could not queue profile sync command to agent: ${err}`);
      }
    }

    // 4. Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'PPPOE_PROFILE_CREATED',
        entity: 'pppoe_profiles',
        entityId: profile.id,
        newValues: {
          name: profile.name,
          rateLimit: profile.rateLimit,
          price: profile.price,
        },
      },
    });

    return this.mapProfileToDto(profile, 0, queuedCommandId);
  }

  /**
   * Updates an existing PPPoE profile and queues synchronization.
   */
  async updateProfile(
    tenantId: string | undefined,
    deviceId: string,
    profileId: string,
    dto: UpdatePppoeProfileDto,
    userId?: string,
  ): Promise<PppoeProfileResponseDto> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);
    await this.assertActiveSubscription(tenantId);

    const profile = await this.prisma.pppoeProfile.findFirst({
      where: {
        id: profileId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
    });

    if (!profile) {
      throw new NotFoundException(`PPPoE profile [${profileId}] not found on router [${deviceId}]`);
    }

    // Name conflict check if name is being changed
    if (dto.name && dto.name.trim() !== profile.name) {
      const duplicate = await this.prisma.pppoeProfile.findUnique({
        where: {
          tenantId_deviceId_name: {
            tenantId: device.tenantId,
            deviceId: device.id,
            name: dto.name.trim(),
          },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          `A PPPoE profile named "${dto.name}" already exists on router [${deviceId}]`,
        );
      }
    }

    const updated = await this.prisma.pppoeProfile.update({
      where: { id: profileId },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        rateLimit: dto.rateLimit !== undefined ? (dto.rateLimit?.trim() || null) : undefined,
        localAddress: dto.localAddress !== undefined ? (dto.localAddress?.trim() || null) : undefined,
        remoteAddress: dto.remoteAddress !== undefined ? (dto.remoteAddress?.trim() || null) : undefined,
        dnsServers: dto.dnsServers !== undefined ? (dto.dnsServers?.trim() || null) : undefined,
        onlyOne: dto.onlyOne !== undefined ? dto.onlyOne : undefined,
        price: dto.price !== undefined ? dto.price : undefined,
        description: dto.description !== undefined ? (dto.description?.trim() || null) : undefined,
      },
      include: {
        _count: {
          select: { accounts: true },
        },
      },
    });

    // Queue sync command to agent
    let queuedCommandId: string | null = null;
    const activeAgent = await this.prisma.deviceAgent.findFirst({
      where: { deviceId: device.id, status: { not: AgentStatus.REVOKED } },
    });

    if (activeAgent) {
      try {
        const cmd = await this.agentService.queueCommand(
          device.tenantId,
          device.id,
          {
            operationId: crypto.randomUUID(),
            type: AgentCommandType.PPPOE_PROFILE_SYNC,
            payload: {
              name: updated.name,
              rateLimit: updated.rateLimit ?? undefined,
              localAddress: updated.localAddress ?? undefined,
              remoteAddress: updated.remoteAddress ?? undefined,
              dnsServers: updated.dnsServers ?? undefined,
              onlyOne: updated.onlyOne,
            },
          },
          userId,
        );
        queuedCommandId = cmd.id;
      } catch (err) {
        this.logger.warn(`Could not queue profile update command to agent: ${err}`);
      }
    }

    // Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'PPPOE_PROFILE_UPDATED',
        entity: 'pppoe_profiles',
        entityId: updated.id,
        newValues: {
          name: updated.name,
          rateLimit: updated.rateLimit,
          price: updated.price,
        },
      },
    });

    return this.mapProfileToDto(updated, updated._count?.accounts, queuedCommandId);
  }

  /**
   * Deletes a PPPoE profile.
   * Strictly enforces that no subscriber accounts are assigned to it.
   */
  async deleteProfile(
    tenantId: string | undefined,
    deviceId: string,
    profileId: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);
    await this.assertActiveSubscription(tenantId);

    const profile = await this.prisma.pppoeProfile.findFirst({
      where: {
        id: profileId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
    });

    if (!profile) {
      throw new NotFoundException(`PPPoE profile [${profileId}] not found on router [${deviceId}]`);
    }

    // STRICT CHECK: Disallow deleting profiles with linked accounts
    const linkedAccountsCount = await this.prisma.pppoeAccount.count({
      where: { profileId },
    });

    if (linkedAccountsCount > 0) {
      throw new BadRequestException(
        `Cannot delete PPPoE profile "${profile.name}" because it is currently assigned to ${linkedAccountsCount} subscriber account(s). Please reassign or delete these accounts before removing the profile.`,
      );
    }

    await this.prisma.pppoeProfile.delete({
      where: { id: profileId },
    });

    // Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'PPPOE_PROFILE_DELETED',
        entity: 'pppoe_profiles',
        entityId: profileId,
        oldValues: {
          name: profile.name,
        },
      },
    });

    return {
      success: true,
      message: `PPPoE profile "${profile.name}" deleted successfully`,
    };
  }

  /**
   * Triggers an explicit live sync of a PPPoE profile to the router via agent.
   */
  async syncProfileToRouter(
    tenantId: string | undefined,
    deviceId: string,
    profileId: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string; queuedCommandId: string }> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);

    const profile = await this.prisma.pppoeProfile.findFirst({
      where: {
        id: profileId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
    });

    if (!profile) {
      throw new NotFoundException(`PPPoE profile [${profileId}] not found on router [${deviceId}]`);
    }

    const cmd = await this.agentService.queueCommand(
      device.tenantId,
      device.id,
      {
        operationId: crypto.randomUUID(),
        type: AgentCommandType.PPPOE_PROFILE_SYNC,
        payload: {
          name: profile.name,
          rateLimit: profile.rateLimit ?? undefined,
          localAddress: profile.localAddress ?? undefined,
          remoteAddress: profile.remoteAddress ?? undefined,
          dnsServers: profile.dnsServers ?? undefined,
          onlyOne: profile.onlyOne,
        },
      },
      userId,
    );

    return {
      success: true,
      message: `Synchronization command for profile "${profile.name}" queued successfully`,
      queuedCommandId: cmd.id,
    };
  }

  // =========================================================================
  // PPPoE SUBSCRIBER ACCOUNTS
  // =========================================================================

  /**
   * Lists PPPoE accounts with pagination and filtering.
   * STRICT SECURITY: Credentials/passwords are never returned.
   */
  async listAccounts(
    tenantId: string | undefined,
    deviceId: string,
    query: QueryPppoeAccountsDto,
  ): Promise<{
    data: PppoeAccountResponseDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      deviceId: device.id,
      tenantId: device.tenantId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.profileId) {
      where.profileId = query.profileId;
    }

    if (query.search && query.search.trim() !== '') {
      const s = query.search.trim();
      where.OR = [
        { username: { contains: s, mode: 'insensitive' } },
        { customerName: { contains: s, mode: 'insensitive' } },
        { customerPhone: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [total, accounts] = await Promise.all([
      this.prisma.pppoeAccount.count({ where }),
      this.prisma.pppoeAccount.findMany({
        where,
        include: {
          profile: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: accounts.map((a) => this.mapAccountToDto(a, a.profile?.name)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves a single PPPoE subscriber account by ID.
   */
  async getAccount(
    tenantId: string | undefined,
    deviceId: string,
    accountId: string,
  ): Promise<PppoeAccountResponseDto> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);

    const account = await this.prisma.pppoeAccount.findFirst({
      where: {
        id: accountId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
      include: {
        profile: {
          select: { name: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`PPPoE account [${accountId}] not found on router [${deviceId}]`);
    }

    return this.mapAccountToDto(account, account.profile?.name);
  }

  /**
   * Creates a new subscriber account.
   * Encrypts the password with AES-256-GCM before saving in database.
   * Queues an authorized PPPOE_SECRET_ADD command to the Windows Agent.
   */
  async createAccount(
    tenantId: string | undefined,
    deviceId: string,
    dto: CreatePppoeAccountDto,
    userId?: string,
  ): Promise<PppoeAccountResponseDto> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);
    await this.assertActiveSubscription(tenantId);

    // 1. Validate assigned profile existence on the same router & tenant
    const profile = await this.prisma.pppoeProfile.findFirst({
      where: {
        id: dto.profileId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
    });

    if (!profile) {
      throw new BadRequestException(
        `PPPoE profile [${dto.profileId}] not found on router [${deviceId}]`,
      );
    }

    // 2. Conflict check for duplicate username on the same router
    const existing = await this.prisma.pppoeAccount.findUnique({
      where: {
        tenantId_deviceId_username: {
          tenantId: device.tenantId,
          deviceId: device.id,
          username: dto.username.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `PPPoE username "${dto.username}" already exists on router [${deviceId}]`,
      );
    }

    // 3. Encrypt password with AES-256-GCM
    const encrypted = this.encryptionService.encrypt(dto.password);

    // 4. Determine price and expiration
    const price = dto.price !== undefined ? dto.price : Number(profile.price);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    // 5. Persist account record
    const account = await this.prisma.pppoeAccount.create({
      data: {
        tenantId: device.tenantId,
        deviceId: device.id,
        profileId: profile.id,
        username: dto.username.trim(),
        passwordEncrypted: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        status: PppoeAccountStatus.ACTIVE,
        callerId: dto.callerId?.trim() || null,
        staticIp: dto.staticIp?.trim() || null,
        customerName: dto.customerName?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || null,
        price,
        billingCycle: dto.billingCycle || 'MONTHLY',
        expiresAt,
        notes: dto.notes?.trim() || null,
        syncStatus: SyncStatus.PENDING,
      },
      include: {
        profile: {
          select: { name: true },
        },
      },
    });

    // 6. Queue command to agent with decrypted password for router provision
    let queuedCommandId: string | null = null;
    const activeAgent = await this.prisma.deviceAgent.findFirst({
      where: { deviceId: device.id, status: { not: AgentStatus.REVOKED } },
    });

    if (activeAgent) {
      try {
        const cmd = await this.agentService.queueCommand(
          device.tenantId,
          device.id,
          {
            operationId: crypto.randomUUID(),
            type: AgentCommandType.PPPOE_SECRET_ADD,
            payload: {
              username: account.username,
              password: dto.password, // Raw password transmitted only to agent in HTTPS payload
              profile: profile.name,
              callerId: account.callerId ?? undefined,
              remoteAddress: account.staticIp ?? undefined,
              comment: account.customerName ?? undefined,
              disabled: false,
            },
          },
          userId,
        );
        queuedCommandId = cmd.id;
      } catch (err: any) {
        this.logger.warn(`Could not queue secret addition to router: ${err?.message}`);
        await this.prisma.pppoeAccount.update({
          where: { id: account.id },
          data: {
            syncStatus: SyncStatus.PENDING,
            syncError: `Command queue delayed: ${err?.message}`,
          },
        });
      }
    } else {
      await this.prisma.pppoeAccount.update({
        where: { id: account.id },
        data: {
          syncStatus: SyncStatus.PENDING,
          syncError: 'No active Windows agent paired for this router',
        },
      });
    }

    // 7. Audit log
    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'PPPOE_ACCOUNT_CREATED',
        entity: 'pppoe_accounts',
        entityId: account.id,
        newValues: {
          username: account.username,
          profileId: account.profileId,
          price: account.price,
        },
      },
    });

    return this.mapAccountToDto(account, account.profile?.name, queuedCommandId);
  }

  /**
   * Updates an existing subscriber account.
   */
  async updateAccount(
    tenantId: string | undefined,
    deviceId: string,
    accountId: string,
    dto: UpdatePppoeAccountDto,
    userId?: string,
  ): Promise<PppoeAccountResponseDto> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);
    await this.assertActiveSubscription(tenantId);

    const account = await this.prisma.pppoeAccount.findFirst({
      where: {
        id: accountId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
      include: {
        profile: { select: { name: true } },
      },
    });

    if (!account) {
      throw new NotFoundException(`PPPoE account [${accountId}] not found on router [${deviceId}]`);
    }

    let targetProfile = account.profile;
    if (dto.profileId && dto.profileId !== account.profileId) {
      const newProfile = await this.prisma.pppoeProfile.findFirst({
        where: {
          id: dto.profileId,
          deviceId: device.id,
          tenantId: device.tenantId,
        },
      });
      if (!newProfile) {
        throw new BadRequestException(`New PPPoE profile [${dto.profileId}] not found on this router`);
      }
      targetProfile = newProfile;
    }

    // Update password encryption if provided
    let passwordEncrypted = account.passwordEncrypted;
    let iv = account.iv;
    let authTag = account.authTag;
    let rawPasswordToDispatch: string | undefined = undefined;

    if (dto.password) {
      const encrypted = this.encryptionService.encrypt(dto.password);
      passwordEncrypted = encrypted.ciphertext;
      iv = encrypted.iv;
      authTag = encrypted.authTag;
      rawPasswordToDispatch = dto.password;
    }

    const updated = await this.prisma.pppoeAccount.update({
      where: { id: accountId },
      data: {
        profileId: dto.profileId || undefined,
        passwordEncrypted,
        iv,
        authTag,
        status: dto.status || undefined,
        callerId: dto.callerId !== undefined ? (dto.callerId?.trim() || null) : undefined,
        staticIp: dto.staticIp !== undefined ? (dto.staticIp?.trim() || null) : undefined,
        customerName: dto.customerName !== undefined ? (dto.customerName?.trim() || null) : undefined,
        customerPhone: dto.customerPhone !== undefined ? (dto.customerPhone?.trim() || null) : undefined,
        price: dto.price !== undefined ? dto.price : undefined,
        billingCycle: dto.billingCycle || undefined,
        expiresAt: dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : undefined,
        notes: dto.notes !== undefined ? (dto.notes?.trim() || null) : undefined,
        syncStatus: SyncStatus.PENDING,
      },
      include: {
        profile: { select: { name: true } },
      },
    });

    // Queue update command to agent
    let queuedCommandId: string | null = null;
    const activeAgent = await this.prisma.deviceAgent.findFirst({
      where: { deviceId: device.id, status: { not: AgentStatus.REVOKED } },
    });

    if (activeAgent) {
      try {
        const cmd = await this.agentService.queueCommand(
          device.tenantId,
          device.id,
          {
            operationId: crypto.randomUUID(),
            type: AgentCommandType.PPPOE_SECRET_UPDATE,
            payload: {
              username: updated.username,
              password: rawPasswordToDispatch,
              profile: targetProfile?.name,
              callerId: updated.callerId ?? undefined,
              remoteAddress: updated.staticIp ?? undefined,
              comment: updated.customerName ?? undefined,
              disabled: updated.status === PppoeAccountStatus.DISABLED,
            },
          },
          userId,
        );
        queuedCommandId = cmd.id;
      } catch (err: any) {
        this.logger.warn(`Could not queue secret update to router: ${err?.message}`);
      }
    }

    // Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'PPPOE_ACCOUNT_UPDATED',
        entity: 'pppoe_accounts',
        entityId: updated.id,
        newValues: {
          username: updated.username,
          profileId: updated.profileId,
          status: updated.status,
        },
      },
    });

    return this.mapAccountToDto(updated, updated.profile?.name, queuedCommandId);
  }

  /**
   * Disables a subscriber account (sets disabled in router and cuts active session).
   */
  async disableAccount(
    tenantId: string | undefined,
    deviceId: string,
    accountId: string,
    userId?: string,
  ): Promise<PppoeAccountResponseDto> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);
    await this.assertActiveSubscription(tenantId);

    const account = await this.prisma.pppoeAccount.findFirst({
      where: {
        id: accountId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
      include: { profile: { select: { name: true } } },
    });

    if (!account) {
      throw new NotFoundException(`PPPoE account [${accountId}] not found on router [${deviceId}]`);
    }

    const updated = await this.prisma.pppoeAccount.update({
      where: { id: accountId },
      data: {
        status: PppoeAccountStatus.DISABLED,
        syncStatus: SyncStatus.PENDING,
      },
      include: { profile: { select: { name: true } } },
    });

    let queuedCommandId: string | null = null;
    const activeAgent = await this.prisma.deviceAgent.findFirst({
      where: { deviceId: device.id, status: { not: AgentStatus.REVOKED } },
    });

    if (activeAgent) {
      try {
        const cmd = await this.agentService.queueCommand(
          device.tenantId,
          device.id,
          {
            operationId: crypto.randomUUID(),
            type: AgentCommandType.PPPOE_SECRET_DISABLE,
            payload: {
              username: account.username,
              disconnectActive: true,
            },
          },
          userId,
        );
        queuedCommandId = cmd.id;
      } catch (err) {
        this.logger.warn(`Could not queue secret disable command: ${err}`);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'PPPOE_ACCOUNT_DISABLED',
        entity: 'pppoe_accounts',
        entityId: account.id,
      },
    });

    return this.mapAccountToDto(updated, updated.profile?.name, queuedCommandId);
  }

  /**
   * Enables a subscriber account.
   */
  async enableAccount(
    tenantId: string | undefined,
    deviceId: string,
    accountId: string,
    userId?: string,
  ): Promise<PppoeAccountResponseDto> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);
    await this.assertActiveSubscription(tenantId);

    const account = await this.prisma.pppoeAccount.findFirst({
      where: {
        id: accountId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
      include: { profile: { select: { name: true } } },
    });

    if (!account) {
      throw new NotFoundException(`PPPoE account [${accountId}] not found on router [${deviceId}]`);
    }

    const updated = await this.prisma.pppoeAccount.update({
      where: { id: accountId },
      data: {
        status: PppoeAccountStatus.ACTIVE,
        syncStatus: SyncStatus.PENDING,
      },
      include: { profile: { select: { name: true } } },
    });

    let queuedCommandId: string | null = null;
    const activeAgent = await this.prisma.deviceAgent.findFirst({
      where: { deviceId: device.id, status: { not: AgentStatus.REVOKED } },
    });

    if (activeAgent) {
      try {
        const cmd = await this.agentService.queueCommand(
          device.tenantId,
          device.id,
          {
            operationId: crypto.randomUUID(),
            type: AgentCommandType.PPPOE_SECRET_ENABLE,
            payload: {
              username: account.username,
            },
          },
          userId,
        );
        queuedCommandId = cmd.id;
      } catch (err) {
        this.logger.warn(`Could not queue secret enable command: ${err}`);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'PPPOE_ACCOUNT_ENABLED',
        entity: 'pppoe_accounts',
        entityId: account.id,
      },
    });

    return this.mapAccountToDto(updated, updated.profile?.name, queuedCommandId);
  }

  /**
   * Deletes a subscriber account and removes secret from the router.
   */
  async deleteAccount(
    tenantId: string | undefined,
    deviceId: string,
    accountId: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string; queuedCommandId: string | null }> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);
    await this.assertActiveSubscription(tenantId);

    const account = await this.prisma.pppoeAccount.findFirst({
      where: {
        id: accountId,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
    });

    if (!account) {
      throw new NotFoundException(`PPPoE account [${accountId}] not found on router [${deviceId}]`);
    }

    let queuedCommandId: string | null = null;
    const activeAgent = await this.prisma.deviceAgent.findFirst({
      where: { deviceId: device.id, status: { not: AgentStatus.REVOKED } },
    });

    if (activeAgent) {
      try {
        const cmd = await this.agentService.queueCommand(
          device.tenantId,
          device.id,
          {
            operationId: crypto.randomUUID(),
            type: AgentCommandType.PPPOE_SECRET_REMOVE,
            payload: {
              username: account.username,
              disconnectActive: true,
            },
          },
          userId,
        );
        queuedCommandId = cmd.id;
      } catch (err) {
        this.logger.warn(`Could not queue secret remove command: ${err}`);
      }
    }

    await this.prisma.pppoeAccount.delete({
      where: { id: accountId },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'PPPOE_ACCOUNT_DELETED',
        entity: 'pppoe_accounts',
        entityId: accountId,
        oldValues: {
          username: account.username,
        },
      },
    });

    return {
      success: true,
      message: `PPPoE subscriber account "${account.username}" deleted successfully`,
      queuedCommandId,
    };
  }

  // =========================================================================
  // ACTIVE SESSIONS & DISCONNECTION
  // =========================================================================

  /**
   * Lists active PPPoE broadband sessions for a router device.
   */
  async listActiveSessions(
    tenantId: string | undefined,
    deviceId: string,
    syncFromRouter?: boolean,
    userId?: string,
  ): Promise<{
    sessions: PppoeSessionResponseDto[];
    queuedCommandId: string | null;
  }> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);

    let queuedCommandId: string | null = null;
    if (syncFromRouter) {
      const activeAgent = await this.prisma.deviceAgent.findFirst({
        where: { deviceId: device.id, status: { not: AgentStatus.REVOKED } },
      });
      if (activeAgent) {
        try {
          const cmd = await this.agentService.queueCommand(
            device.tenantId,
            device.id,
            {
              operationId: crypto.randomUUID(),
              type: AgentCommandType.PPPOE_SESSION_LIST,
              payload: {},
            },
            userId,
          );
          queuedCommandId = cmd.id;
        } catch (err) {
          this.logger.warn(`Could not queue session list command: ${err}`);
        }
      }
    }

    const sessions = await this.prisma.pppoeActiveSession.findMany({
      where: {
        deviceId: device.id,
        tenantId: device.tenantId,
      },
      orderBy: { startedAt: 'desc' },
    });

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        tenantId: s.tenantId,
        deviceId: s.deviceId,
        accountId: s.accountId,
        username: s.username,
        ipAddress: s.ipAddress,
        macAddress: s.macAddress,
        uptimeSeconds: s.uptimeSeconds,
        bytesIn: Number(s.bytesIn),
        bytesOut: Number(s.bytesOut),
        sessionId: s.sessionId,
        startedAt: s.startedAt,
      })),
      queuedCommandId,
    };
  }

  /**
   * Disconnects an active broadband session.
   * Strictly enforces that the subscriber or session belongs to the specified router/tenant.
   */
  async disconnectActiveSession(
    tenantId: string | undefined,
    deviceId: string,
    dto: DisconnectPppoeSessionDto,
    userId?: string,
  ): Promise<{ success: boolean; message: string; queuedCommandId: string }> {
    const device = await this.assertDeviceOwnership(tenantId, deviceId);
    await this.assertActiveSubscription(tenantId);

    if (!dto.username && !dto.sessionId) {
      throw new BadRequestException('Either "username" or "sessionId" must be specified to disconnect a session');
    }

    // Verify username belongs to authorized device if username is supplied
    if (dto.username) {
      const accountOnDevice = await this.prisma.pppoeAccount.findUnique({
        where: {
          tenantId_deviceId_username: {
            tenantId: device.tenantId,
            deviceId: device.id,
            username: dto.username.trim(),
          },
        },
      });

      const sessionOnDevice = await this.prisma.pppoeActiveSession.findFirst({
        where: {
          deviceId: device.id,
          tenantId: device.tenantId,
          username: dto.username.trim(),
        },
      });

      if (!accountOnDevice && !sessionOnDevice) {
        throw new NotFoundException(
          `No subscriber or active session found for username "${dto.username}" on router [${deviceId}]`,
        );
      }
    }

    const cmd = await this.agentService.queueCommand(
      device.tenantId,
      device.id,
      {
        operationId: crypto.randomUUID(),
        type: AgentCommandType.PPPOE_SESSION_DISCONNECT,
        payload: {
          username: dto.username?.trim(),
          sessionId: dto.sessionId?.trim(),
        },
      },
      userId,
    );

    // Also remove from active sessions cache in DB if exists
    if (dto.username) {
      await this.prisma.pppoeActiveSession.deleteMany({
        where: {
          deviceId: device.id,
          tenantId: device.tenantId,
          username: dto.username.trim(),
        },
      });
    }

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        tenantId: device.tenantId,
        userId: userId ?? null,
        action: 'PPPOE_SESSION_DISCONNECTED',
        entity: 'pppoe_active_sessions',
        entityId: dto.username || dto.sessionId || 'session',
        newValues: {
          deviceId: device.id,
          username: dto.username,
          sessionId: dto.sessionId,
        },
      },
    });

    return {
      success: true,
      message: 'PPPoE session disconnection queued successfully',
      queuedCommandId: cmd.id,
    };
  }

  // =========================================================================
  // HELPER MAPPERS
  // =========================================================================

  private mapProfileToDto(
    p: PppoeProfile,
    accountsCount = 0,
    queuedCommandId?: string | null,
  ): PppoeProfileResponseDto {
    return {
      id: p.id,
      tenantId: p.tenantId,
      deviceId: p.deviceId,
      name: p.name,
      rateLimit: p.rateLimit,
      localAddress: p.localAddress,
      remoteAddress: p.remoteAddress,
      dnsServers: p.dnsServers,
      onlyOne: p.onlyOne,
      price: Number(p.price),
      description: p.description,
      accountsCount,
      queuedCommandId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private mapAccountToDto(
    a: PppoeAccount,
    profileName?: string,
    queuedCommandId?: string | null,
  ): PppoeAccountResponseDto {
    return {
      id: a.id,
      tenantId: a.tenantId,
      deviceId: a.deviceId,
      profileId: a.profileId,
      profileName,
      username: a.username,
      status: a.status,
      callerId: a.callerId,
      staticIp: a.staticIp,
      customerName: a.customerName,
      customerPhone: a.customerPhone,
      price: Number(a.price),
      billingCycle: a.billingCycle,
      expiresAt: a.expiresAt,
      notes: a.notes,
      syncStatus: a.syncStatus,
      syncError: a.syncError,
      queuedCommandId,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
