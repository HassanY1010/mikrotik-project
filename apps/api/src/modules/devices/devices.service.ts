import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadGatewayException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { TestDeviceConnectionDto } from './dto/test-device-connection.dto';
import { ReportLocalTelemetryDto } from './dto/report-local-telemetry.dto';
import { DeviceStatus, RouterOsVersion, MikroTikDevice, Prisma } from '@prisma/client';
import {
  RouterResource,
  RouterBackupItem,
  ConnectedDeviceItem,
} from '../../core/mikrotik/interfaces/mikrotik-client.interface';
import { RoleName } from '@mikrotik-saas/shared-types';
import type { RequestUser } from '../../core/decorators/current-user.decorator';

export type ChannelConnectivityStatus = 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN';
export type CloudConnectivityStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'ERROR'
  | 'UNREACHABLE_PRIVATE_LAN'
  | 'UNKNOWN';
export type EffectiveConnectivityState = 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN';
export type VerificationSource = 'LOCAL_LAN' | 'CLOUD_API' | 'CLOUD_REST' | 'PROVISIONING';

interface DeviceChannelSnapshot {
  localStatus: ChannelConnectivityStatus;
  localCheckedAt: Date | null;
  cloudStatus: CloudConnectivityStatus;
  cloudCheckedAt: Date | null;
  lastVerifiedSource: VerificationSource | null;
  lastVerifiedAt: Date | null;
  activeHotspotSessions: number | null;
}

export interface DeviceResponse {
  id: string;
  tenantId: string;
  name: string;
  host: string;
  port?: number;
  connectionType?: string;
  apiPort: number;
  restPort: number;
  useSsl: boolean;
  username: string;
  rosVersion: RouterOsVersion;
  isOnline: boolean;
  status: DeviceStatus;
  connectivityState: EffectiveConnectivityState;
  isPrivateLan: boolean;
  localStatus: ChannelConnectivityStatus;
  cloudStatus: CloudConnectivityStatus;
  lastVerifiedSource: VerificationSource | null;
  lastVerifiedAt: Date | null;
  localCheckedAt: Date | null;
  cloudCheckedAt: Date | null;
  activeHotspotSessions: number | null;
  lastSyncAt: Date | null;
  lastSeenAt?: Date | null;
  lastError: string | null;
  cpuLoad: number | null;
  memoryFree: number | null;
  memoryTotal: number | null;
  diskFree: number | null;
  diskTotal: number | null;
  uptime: string | null;
  modelName: string | null;
  isLocked: boolean;
  antiTetheringEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);
  private readonly activeDeviceCreationLocks = new Set<string>();
  public static readonly activeDeviceOperations = new Set<string>();
  private static readonly deviceChannelStates = new Map<string, DeviceChannelSnapshot>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
  ) {}

  public static updateChannelState(
    deviceId: string,
    patch: Partial<DeviceChannelSnapshot>,
  ): DeviceChannelSnapshot {
    const existing = DevicesService.deviceChannelStates.get(deviceId) ?? {
      localStatus: 'UNKNOWN',
      localCheckedAt: null,
      cloudStatus: 'UNKNOWN',
      cloudCheckedAt: null,
      lastVerifiedSource: null,
      lastVerifiedAt: null,
      activeHotspotSessions: null,
    };
    const next = { ...existing, ...patch };
    DevicesService.deviceChannelStates.set(deviceId, next);
    return next;
  }

  public static clearChannelState(deviceId: string): void {
    DevicesService.deviceChannelStates.delete(deviceId);
  }

  public static isLocalOnlyPrivateLan(deviceId: string): boolean {
    const channel = DevicesService.deviceChannelStates.get(deviceId);
    if (!channel) return false;
    return channel.localStatus === 'ONLINE' && channel.cloudStatus !== 'ONLINE';
  }

  private resolveEffectiveConnectivityState(device: MikroTikDevice): EffectiveConnectivityState {
    if (device.isOnline || device.status === DeviceStatus.ONLINE) {
      return 'ONLINE';
    }
    if (device.status === DeviceStatus.ERROR) {
      return 'ERROR';
    }
    if (device.lastSyncAt == null && !device.lastError) {
      return 'UNKNOWN';
    }
    return 'OFFLINE';
  }

  private transformDevice(device: MikroTikDevice): DeviceResponse {
    const isPrivateLan = this.isPrivateHost(device.host || '');
    const effectiveState = this.resolveEffectiveConnectivityState(device);
    const channel = DevicesService.deviceChannelStates.get(device.id);

    const cloudStatus: CloudConnectivityStatus =
      channel?.cloudStatus ??
      (isPrivateLan
        ? 'UNKNOWN'
        : effectiveState === 'ONLINE'
          ? 'ONLINE'
          : effectiveState);

    const localStatus: ChannelConnectivityStatus =
      channel?.localStatus ??
      (isPrivateLan && effectiveState === 'ONLINE' ? 'ONLINE' : 'UNKNOWN');

    const lastVerifiedSource: VerificationSource | null =
      channel?.lastVerifiedSource ??
      (effectiveState === 'ONLINE'
        ? isPrivateLan
          ? 'LOCAL_LAN'
          : device.restPort === 80 || device.restPort === 443
            ? 'CLOUD_REST'
            : 'CLOUD_API'
        : null);

    return {
      id: device.id,
      tenantId: device.tenantId,
      name: device.name,
      host: device.host,
      port: device.apiPort || device.restPort || 8728,
      connectionType: device.useSsl ? 'API-SSL' : 'API_SOCKET',
      apiPort: device.apiPort,
      restPort: device.restPort,
      useSsl: device.useSsl,
      username: device.username,
      rosVersion: device.rosVersion,
      isOnline: device.isOnline,
      status: device.status,
      connectivityState: effectiveState,
      isPrivateLan,
      localStatus,
      cloudStatus,
      lastVerifiedSource,
      lastVerifiedAt: channel?.lastVerifiedAt ?? (device.isOnline ? device.lastSyncAt : null),
      localCheckedAt: channel?.localCheckedAt ?? null,
      cloudCheckedAt: channel?.cloudCheckedAt ?? null,
      activeHotspotSessions: channel?.activeHotspotSessions ?? null,
      lastSyncAt: device.lastSyncAt,
      lastSeenAt: device.lastSyncAt,
      lastError: device.lastError,
      cpuLoad: device.cpuLoad,
      memoryFree: device.memoryFree !== null ? Number(device.memoryFree) : null,
      memoryTotal: device.memoryTotal !== null ? Number(device.memoryTotal) : null,
      diskFree: device.diskFree !== null ? Number(device.diskFree) : null,
      diskTotal: device.diskTotal !== null ? Number(device.diskTotal) : null,
      uptime: device.uptime,
      modelName: device.modelName ?? null,
      isLocked: device.isLocked ?? false,
      antiTetheringEnabled: device.antiTetheringEnabled ?? false,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }

  private isPrivateHost(host: string): boolean {
    const clean = host.trim().toLowerCase();
    return (
      clean === 'localhost' ||
      /^(127\.|192\.168\.|10\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1|fc|fd)/.test(clean)
    );
  }

  private isArchivedHost(host: string): boolean {
    return /__deleted_[a-zA-Z0-9_-]+$/.test(host);
  }

  private buildArchivedHost(host: string, id: string): string {
    return this.isArchivedHost(host) ? host : `${host}__deleted_${id}`;
  }

  /**
   * Renames soft-deleted device hosts holding the same (tenantId, host, apiPort)
   * so historical FK-linked records remain intact while the endpoint can be reused.
   */
  private async releaseSoftDeletedEndpoint(
    tx: Prisma.TransactionClient,
    tenantId: string,
    host: string,
    apiPort: number,
    excludeDeviceId?: string,
  ): Promise<void> {
    const softDeletedMatches = await tx.mikroTikDevice.findMany({
      where: {
        tenantId,
        host,
        apiPort,
        deletedAt: { not: null },
        ...(excludeDeviceId ? { id: { not: excludeDeviceId } } : {}),
      },
    });

    if (!Array.isArray(softDeletedMatches) || softDeletedMatches.length === 0) {
      return;
    }

    for (const deletedDevice of softDeletedMatches) {
      if (this.isArchivedHost(deletedDevice.host)) {
        continue;
      }
      await tx.mikroTikDevice.update({
        where: { id: deletedDevice.id },
        data: {
          host: this.buildArchivedHost(deletedDevice.host, deletedDevice.id),
        },
      });
    }
  }

  async create(tenantId: string, dto: CreateDeviceDto): Promise<DeviceResponse> {
    if (this.activeDeviceCreationLocks.has(tenantId)) {
      throw new ConflictException({
        code: 'CONCURRENT_DEVICE_CREATION',
        message: 'توجد عملية إضافة راوتر جارية حالياً لهذه الشبكة، يرجى الانتظار حتى اكتمالها',
      });
    }

    const cleanName = dto.name?.trim() ?? '';
    const cleanHost = dto.host?.trim() ?? '';
    const cleanUsername = dto.username?.trim() ?? '';

    if (!cleanName || !cleanHost || !cleanUsername) {
      throw new BadRequestException({
        code: 'INVALID_DEVICE_FIELDS',
        message: 'اسم الراوتر وعنوان IP واسم المستخدم مطلوبة ولا يمكن أن تكون فارغة',
      });
    }

    this.activeDeviceCreationLocks.add(tenantId);

    try {
      const isRest = dto.connectionType === 'REST';
      const resolvedApiPort = dto.apiPort ?? (isRest ? 8728 : (dto.port ?? 8728));
      const resolvedRestPort = dto.restPort ?? (isRest && dto.port ? dto.port : 443);
      const resolvedUseSsl = dto.useSsl ?? dto.useTls ?? false;

      // Encrypt password at rest before transaction
      const { ciphertext, iv, authTag } = this.encryptionService.encrypt(dto.password);

      // Atomically verify subscription, quota limit, duplicate host, and create device inside transaction
      const device = await this.prisma.$transaction(async (tx) => {
        let effectiveTenantId = tenantId;
        if (!effectiveTenantId) {
          const defaultTenant = await tx.tenant.findFirst({
            include: {
              subscriptions: {
                where: { status: { in: ['ACTIVE', 'TRIAL'] } },
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { createdAt: 'asc' },
          });
          if (defaultTenant) {
            effectiveTenantId = defaultTenant.id;
          }
        }

        // 1. Verify active subscription and router limit
        const subscription = await tx.subscription.findFirst({
          where: {
            tenantId: effectiveTenantId,
            status: { in: ['ACTIVE', 'TRIAL'] },
          },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        });

        if (!subscription) {
          const expiredSub = await tx.subscription.findFirst({
            where: { tenantId: effectiveTenantId },
            orderBy: { expiresAt: 'desc' },
          });
          if (
            expiredSub &&
            (expiredSub.status === 'EXPIRED' ||
              new Date(expiredSub.expiresAt).getTime() <= Date.now())
          ) {
            throw new ForbiddenException({
              code: 'SUBSCRIPTION_EXPIRED',
              message: 'انتهت صلاحية اشتراك الشبكة. يرجى تجديد الباقة لإضافة أجهزة راوتر جديدة.',
            });
          }
          throw new ForbiddenException({
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'يلزم وجود اشتراك نشط أو فترة تجريبية لإضافة راوترات جديدة.',
          });
        }

        if (new Date(subscription.expiresAt).getTime() <= Date.now()) {
          throw new ForbiddenException({
            code: 'SUBSCRIPTION_EXPIRED',
            message: 'انتهت صلاحية اشتراك الشبكة. يرجى تجديد الباقة لإضافة أجهزة راوتر جديدة.',
          });
        }

        const currentDeviceCount = await tx.mikroTikDevice.count({
          where: {
            tenantId: effectiveTenantId,
            deletedAt: null,
          },
        });

        const maxAllowed = subscription.maxRouters ?? subscription.plan.maxRouters;

        if (currentDeviceCount >= maxAllowed) {
          throw new ForbiddenException({
            code: 'ROUTER_LIMIT_EXCEEDED',
            message: `تم الوصول للحد الأقصى للراوترات في باقتك (${subscription.plan.name}). الحد الأقصى المسموح: ${maxAllowed} راوتر.`,
          });
        }

        // 2. Check duplicate active host + port and free any soft-deleted collision
        const existing = await tx.mikroTikDevice.findFirst({
          where: {
            tenantId: effectiveTenantId,
            host: cleanHost,
            apiPort: resolvedApiPort,
            deletedAt: null,
          },
        });

        if (existing) {
          throw new ConflictException({
            code: 'DEVICE_EXISTS',
            message: `الراوتر بالعنوان ${cleanHost} والمنفذ ${resolvedApiPort} مسجل مسبقاً لهذا الحساب`,
          });
        }

        await this.releaseSoftDeletedEndpoint(tx, effectiveTenantId, cleanHost, resolvedApiPort);

        return tx.mikroTikDevice.create({
          data: {
            tenantId: effectiveTenantId,
            name: cleanName,
            host: cleanHost,
            apiPort: resolvedApiPort,
            restPort: resolvedRestPort,
            useSsl: resolvedUseSsl,
            username: cleanUsername,
            passwordEncrypted: ciphertext,
            iv,
            authTag,
            rosVersion: dto.rosVersion ?? RouterOsVersion.V7,
            status: DeviceStatus.OFFLINE,
            isOnline: false,
          },
        });
      });

    // 5. Attempt initial live handshake check (skip private LAN IPs unreachable from cloud API)
    try {
      if (
        device &&
        !this.isPrivateHost(device.host) &&
        typeof this.mikrotikClientFactory?.createDirectClient === 'function'
      ) {
        const { client } = this.mikrotikClientFactory.createDirectClient({
          host: device.host,
          apiPort: device.apiPort,
          restPort: device.restPort,
          username: device.username,
          password: dto.password,
          useSsl: device.useSsl,
          rosVersion: device.rosVersion,
          timeoutMs: 2500,
        });

        if (client) {
          await client.connect();
          const resource = await client.getSystemResource();
          await client.disconnect();

          const updated = await this.prisma.mikroTikDevice.update({
            where: { id: device.id },
            data: {
              isOnline: true,
              status: DeviceStatus.ONLINE,
              cpuLoad: resource.cpuLoad,
              memoryFree: BigInt(resource.freeMemory),
              memoryTotal: BigInt(resource.totalMemory),
              diskFree: BigInt(resource.freeHdd),
              diskTotal: BigInt(resource.totalHdd),
              modelName: resource.boardName ?? null,
              uptime: resource.uptime,
              lastSyncAt: new Date(),
              lastError: null,
            },
          });

          this.logger.log(
            `Created and verified MikroTik device "${updated.name}" (${updated.id}) - ONLINE`,
          );
          DevicesService.updateChannelState(updated.id, {
            cloudStatus: 'ONLINE',
            cloudCheckedAt: new Date(),
            lastVerifiedSource:
              dto.rosVersion === RouterOsVersion.V7 && (device.restPort === 80 || device.restPort === 443)
                ? 'CLOUD_REST'
                : 'CLOUD_API',
            lastVerifiedAt: new Date(),
          });
          return this.transformDevice(updated);
        }
      }
    } catch (testErr) {
      this.logger.warn(
        `New MikroTik device "${device?.name ?? dto.name}" saved as UNKNOWN/OFFLINE (initial probe failed: ${testErr})`,
      );
    }

    if (device && this.isPrivateHost(device.host)) {
      DevicesService.updateChannelState(device.id, {
        localStatus: 'UNKNOWN',
        cloudStatus: 'UNKNOWN',
        lastVerifiedSource: null,
        lastVerifiedAt: null,
      });
    }

    this.logger.log(
      `Created MikroTik device "${device?.name ?? dto.name}" (${device?.id}) for tenant ${tenantId}`,
    );
    return this.transformDevice(device);
  } finally {
    this.activeDeviceCreationLocks.delete(tenantId);
  }
}

  async assertUserDeviceAccess(
    tenantId: string | undefined | null,
    deviceId: string,
    currentUser?: RequestUser,
  ): Promise<MikroTikDevice> {
    const where: Prisma.MikroTikDeviceWhereInput = {
      id: deviceId,
      deletedAt: null,
    };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const device = await this.prisma.mikroTikDevice.findFirst({ where });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${deviceId} was not found`,
      });
    }

    if (
      currentUser &&
      currentUser.role !== RoleName.SUPER_ADMIN &&
      currentUser.role !== RoleName.TENANT_ADMIN &&
      (currentUser.role as any) !== 'OWNER' &&
      (currentUser.role as any) !== 'ADMIN'
    ) {
      const access = await this.prisma.userDeviceAccess.findUnique({
        where: {
          userId_deviceId: {
            userId: currentUser.id,
            deviceId,
          },
        },
      });

      if (!access) {
        throw new ForbiddenException({
          code: 'DEVICE_ACCESS_DENIED',
          message: 'ليس لديك صلاحية للوصول إلى هذا الراوتر',
        });
      }
    }

    return device;
  }

  async findAll(tenantId?: string | null, currentUser?: RequestUser): Promise<DeviceResponse[]> {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId && (!currentUser || currentUser.role === RoleName.SUPER_ADMIN)) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (first) {
        resolvedTenantId = first.id;
      }
    } else if (!resolvedTenantId && currentUser?.tenantId) {
      resolvedTenantId = currentUser.tenantId;
    }

    const where: Prisma.MikroTikDeviceWhereInput = { deletedAt: null };
    if (resolvedTenantId) {
      where.tenantId = resolvedTenantId;
    }

    // Role-based device restriction for non-admin staff
    if (
      currentUser &&
      currentUser.role !== RoleName.SUPER_ADMIN &&
      currentUser.role !== RoleName.TENANT_ADMIN &&
      (currentUser.role as any) !== 'OWNER' &&
      (currentUser.role as any) !== 'ADMIN'
    ) {
      const assigned = await this.prisma.userDeviceAccess.findMany({
        where: { userId: currentUser.id },
        select: { deviceId: true },
      });

      const assignedIds = assigned.map((a) => a.deviceId);
      // Safe default: if no devices explicitly assigned, return empty list
      if (assignedIds.length === 0) {
        return [];
      }

      where.id = { in: assignedIds };
    }

    const devices = await this.prisma.mikroTikDevice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return devices.map((d) => this.transformDevice(d));
  }

  async findById(
    tenantId: string | undefined | null,
    id: string,
    currentUser?: RequestUser,
  ): Promise<DeviceResponse> {
    const device = await this.assertUserDeviceAccess(tenantId, id, currentUser);
    return this.transformDevice(device);
  }

  async update(
    tenantId: string | undefined | null,
    id: string,
    dto: UpdateDeviceDto,
  ): Promise<DeviceResponse> {
    const encryptedPassword = dto.password
      ? this.encryptionService.encrypt(dto.password)
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const whereClause: Prisma.MikroTikDeviceWhereInput = {
        id,
        deletedAt: null,
      };
      if (tenantId) {
        whereClause.tenantId = tenantId;
      }

      const existing = await tx.mikroTikDevice.findFirst({
        where: whereClause,
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'DEVICE_NOT_FOUND',
          message: `Device with ID ${id} was not found`,
        });
      }

      const isRest = dto.connectionType === 'REST';
      const data: Prisma.MikroTikDeviceUpdateInput = {};

      if (dto.name !== undefined) {
        const cleanName = dto.name.trim();
        if (!cleanName) {
          throw new BadRequestException({
            code: 'INVALID_NAME',
            message: 'اسم الراوتر لا يمكن أن يكون فارغاً',
          });
        }
        data.name = cleanName;
      }

      let targetHost = existing.host;
      if (dto.host !== undefined) {
        const cleanHost = dto.host.trim();
        if (!cleanHost) {
          throw new BadRequestException({
            code: 'INVALID_HOST',
            message: 'عنوان IP أو الدومين لا يمكن أن يكون فارغاً',
          });
        }
        data.host = cleanHost;
        targetHost = cleanHost;
      }

      let targetApiPort = existing.apiPort;
      if (dto.apiPort !== undefined) {
        data.apiPort = dto.apiPort;
        targetApiPort = dto.apiPort;
      } else if (dto.port !== undefined && !isRest) {
        data.apiPort = dto.port;
        targetApiPort = dto.port;
      }

      if (dto.restPort !== undefined) {
        data.restPort = dto.restPort;
      } else if (dto.port !== undefined && isRest) {
        data.restPort = dto.port;
      }

      if (dto.useSsl !== undefined) data.useSsl = dto.useSsl;
      else if (dto.useTls !== undefined) data.useSsl = dto.useTls;

      if (dto.username !== undefined) {
        const cleanUsername = dto.username.trim();
        if (!cleanUsername) {
          throw new BadRequestException({
            code: 'INVALID_USERNAME',
            message: 'اسم مستخدم الراوتر لا يمكن أن يكون فارغاً',
          });
        }
        data.username = cleanUsername;
      }

      if (dto.rosVersion !== undefined) data.rosVersion = dto.rosVersion;

      if (encryptedPassword) {
        data.passwordEncrypted = encryptedPassword.ciphertext;
        data.iv = encryptedPassword.iv;
        data.authTag = encryptedPassword.authTag;
      }

      if (targetHost !== existing.host || targetApiPort !== existing.apiPort) {
        const duplicateActive = await tx.mikroTikDevice.findFirst({
          where: {
            id: { not: id },
            tenantId: existing.tenantId,
            host: targetHost,
            apiPort: targetApiPort,
            deletedAt: null,
          },
        });

        if (duplicateActive) {
          throw new ConflictException({
            code: 'DEVICE_EXISTS',
            message: `الراوتر بالعنوان ${targetHost} والمنفذ ${targetApiPort} مسجل مسبقاً لهذا الحساب`,
          });
        }
      }

      await this.releaseSoftDeletedEndpoint(tx, existing.tenantId, targetHost, targetApiPort, id);

      const connectivityConfigChanged =
        dto.host !== undefined ||
        dto.apiPort !== undefined ||
        dto.restPort !== undefined ||
        dto.useSsl !== undefined ||
        dto.useTls !== undefined ||
        dto.username !== undefined ||
        Boolean(encryptedPassword) ||
        dto.rosVersion !== undefined;

      if (connectivityConfigChanged) {
        data.isOnline = false;
        data.status = DeviceStatus.OFFLINE;
        data.lastSyncAt = null;
        data.lastError = null;
      }

      return tx.mikroTikDevice.update({
        where: { id },
        data,
      });
    });

    await this.mikrotikClientFactory?.invalidateClient?.(id);
    if (
      dto.host !== undefined ||
      dto.apiPort !== undefined ||
      dto.restPort !== undefined ||
      dto.useSsl !== undefined ||
      dto.useTls !== undefined ||
      dto.username !== undefined ||
      Boolean(dto.password) ||
      dto.rosVersion !== undefined
    ) {
      DevicesService.clearChannelState(id);
    }

    return this.transformDevice(updated);
  }

  async remove(
    tenantId: string | undefined | null,
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    const whereClause: Prisma.MikroTikDeviceWhereInput = {
      id,
      deletedAt: null,
    };
    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    const existing = await this.prisma.mikroTikDevice.findFirst({
      where: whereClause,
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    await this.prisma.mikroTikDevice.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isOnline: false,
        status: DeviceStatus.OFFLINE,
        host: this.buildArchivedHost(existing.host, existing.id),
      },
    });

    await this.mikrotikClientFactory?.invalidateClient?.(id);
    DevicesService.clearChannelState(id);

    this.logger.log(`Soft deleted MikroTik device ${id} for tenant ${existing.tenantId}`);
    return { success: true, message: 'Device deleted successfully' };
  }

  async testDirectConnection(
    tenantId: string,
    dto: TestDeviceConnectionDto,
  ): Promise<{
    success: boolean;
    stage: 'VALIDATION' | 'NETWORK' | 'PORT' | 'TLS' | 'AUTH' | 'PROTOCOL' | 'CONNECTED';
    code: string;
    message: string;
    latencyMs?: number;
    resource?: RouterResource;
    routerInfo?: Record<string, unknown>;
    error?: string;
    isPrivateLan?: boolean;
    localPreserved?: boolean;
  }> {
    // 1. Validation Stage
    const host = dto.host?.trim();
    if (!host) {
      return {
        success: false,
        stage: 'VALIDATION',
        code: 'INVALID_HOST',
        message: 'عنوان IP أو الدومين مطلوب ولا يمكن أن يكون فارغاً',
      };
    }

    let password = dto.password;
    let targetDevice: MikroTikDevice | null = null;

    if (dto.id) {
      targetDevice = await this.prisma.mikroTikDevice.findFirst({
        where: { id: dto.id, tenantId, deletedAt: null },
      });
      if (!targetDevice) {
        return {
          success: false,
          stage: 'VALIDATION',
          code: 'DEVICE_NOT_FOUND',
          message: `لم يتم العثور على الراوتر المحدد بالمعرف ${dto.id}`,
        };
      }
      if (!password) {
        password = this.encryptionService.decrypt(
          targetDevice.passwordEncrypted,
          targetDevice.iv,
          targetDevice.authTag,
        );
      }
    }

    if (!dto.username?.trim()) {
      return {
        success: false,
        stage: 'VALIDATION',
        code: 'MISSING_USERNAME',
        message: 'اسم مستخدم API مطلوب',
      };
    }

    if (password === undefined || password === null) {
      return {
        success: false,
        stage: 'VALIDATION',
        code: 'MISSING_PASSWORD',
        message: 'كلمة مرور الراوتر مطلوبة لاختبار الاتصال والمصادقة',
      };
    }

    // Check private RFC1918 / local IP address
    const isPrivateIp = this.isPrivateHost(host);

    const startTime = Date.now();
    let targetPort: number | undefined;

    try {
      const directClient = this.mikrotikClientFactory.createDirectClient({
        host,
        apiPort: dto.apiPort,
        restPort: dto.restPort,
        username: dto.username.trim(),
        password,
        useSsl: dto.useSsl,
        rosVersion: dto.rosVersion,
        timeoutMs: 8000,
      });
      const { client, isRest } = directClient;
      targetPort = directClient.targetPort;

      // Probe connection & login
      await client.connect();

      // Probe live resources for verification
      const resource = await client.getSystemResource();
      const latencyMs = Date.now() - startTime;

      // Disconnect one-shot client
      try {
        await client.disconnect();
      } catch (_) {}

      // If testing an existing device, update its online state & cloud channel in DB
      const verifiedAt = new Date();
      if (targetDevice) {
        await this.prisma.mikroTikDevice.update({
          where: { id: targetDevice.id },
          data: {
            isOnline: true,
            status: DeviceStatus.ONLINE,
            cpuLoad: resource.cpuLoad,
            memoryFree: BigInt(resource.freeMemory),
            memoryTotal: BigInt(resource.totalMemory),
            diskFree: BigInt(resource.freeHdd),
            diskTotal: BigInt(resource.totalHdd),
            modelName: resource.boardName ?? null,
            uptime: resource.uptime,
            lastSyncAt: verifiedAt,
            lastError: null,
          },
        });
        DevicesService.updateChannelState(targetDevice.id, {
          cloudStatus: 'ONLINE',
          cloudCheckedAt: verifiedAt,
          lastVerifiedSource: isRest ? 'CLOUD_REST' : 'CLOUD_API',
          lastVerifiedAt: verifiedAt,
        });
      }

      const board = resource.boardName ?? 'MikroTik Router';
      const rosVer = resource.version ? `v${resource.version}` : '';

      return {
        success: true,
        stage: 'CONNECTED',
        code: 'CONNECTED_SUCCESS',
        latencyMs,
        resource,
        isPrivateLan: isPrivateIp,
        routerInfo: {
          model: board,
          version: resource.version,
          uptime: resource.uptime,
          cpuLoad: resource.cpuLoad,
          freeMemory: resource.freeMemory,
          totalMemory: resource.totalMemory,
          freeHdd: resource.freeHdd,
          totalHdd: resource.totalHdd,
          protocol: isRest ? 'REST API' : 'Socket API',
          port: targetPort,
        },
        message: `تم الاتصال والمصادقة بنجاح مع ${board} ${rosVer} (زمن الاستجابة: ${latencyMs}ms)`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const rawError = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Direct connection test failed for ${host}: ${rawError}`);

      if (targetDevice) {
        await this.mikrotikClientFactory?.invalidateClient?.(targetDevice.id);
      }

      let stage: 'NETWORK' | 'PORT' | 'TLS' | 'AUTH' | 'PROTOCOL' = 'NETWORK';
      let code = 'CONNECTION_FAILED';
      let message = rawError;

      const lower = rawError.toLowerCase();

      if (lower.includes('econnrefused')) {
        stage = 'PORT';
        code = 'PORT_CLOSED';
        message = `المنفذ مغلق أو الخدمة غير مفعّلة في الراوتر (Connection Refused). تأكد من تفعيل خدمة API أو WWW في IP > Services.`;
      } else if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('etimedout')) {
        stage = 'NETWORK';
        code = 'HOST_TIMEOUT';
        message = isPrivateIp
          ? `انتهت مهلة الاتصال بالراوتر (${host}) من الخادم السحابي. العنوان محلي (LAN) لا يمر عبر الإنترنت بدون VPN؛ افحص من نفس شبكة الواي فاي محلياً.`
          : `انتهت مهلة محاولة الاتصال بالراوتر (${host}). تأكد من إمكانية الوصول للعنوان وجدار الحماية (Firewall).`;
      } else if (lower.includes('ehostunreach') || lower.includes('enetunreach')) {
        stage = 'NETWORK';
        code = 'HOST_UNREACHABLE';
        message = isPrivateIp
          ? `العنوان المحلي (${host}) غير قابل للوصول من الخادم السحابي بدون وكيل/VPN.`
          : `المضيف غير قابل للوصول عبر الشبكة (Host Unreachable). تأكد من اتصال الراوتر وعنوان IP.`;
      } else if (lower.includes('enotfound') || lower.includes('eai_again')) {
        stage = 'NETWORK';
        code = 'DNS_FAILED';
        message = `تعذر حل اسم النطاق (DNS) للعنوان: ${host}`;
      } else if (
        lower.includes('invalid user name or password') ||
        lower.includes('cannot log in') ||
        lower.includes('401') ||
        lower.includes('unauthorized') ||
        lower.includes('login failed')
      ) {
        stage = 'AUTH';
        code = 'AUTH_FAILED';
        message = `فشلت المصادقة: اسم المستخدم أو كلمة المرور غير صحيحة، أو لا يملك المستخدم صلاحيات الاتصال في الراوتر.`;
      } else if (lower.includes('403') || lower.includes('forbidden') || lower.includes('permission denied')) {
        stage = 'AUTH';
        code = 'PERMISSION_DENIED';
        message = `تم رفض الوصول (403 Forbidden): المستخدم لا يملك الصلاحيات الكافية للوصول إلى واجهة API.`;
      } else if (lower.includes('tls') || lower.includes('cert') || lower.includes('ssl') || lower.includes('handshake')) {
        stage = 'TLS';
        code = 'TLS_ERROR';
        message = `خطأ في شهادة الأمان أو مصافحة SSL/TLS المشفرة مع الراوتر.`;
      } else if (lower.includes('404') || lower.includes('not found')) {
        stage = 'PROTOCOL';
        code = 'REST_NOT_SUPPORTED';
        message = `مسار REST API غير مدعوم على هذا الإصدار. يتطلب RouterOS v7.1 أو أحدث ومفعّل في Services.`;
      } else if (
        lower.includes('failed to reach mikrotik rest api') ||
        (lower.includes('rest api') && (lower.includes('failed') || lower.includes('unreachable')))
      ) {
        stage = 'PORT';
        code = 'REST_API_UNREACHABLE';
        if (isPrivateIp) {
          message = `تعذر الوصول لواجهة الراوتر (${host}${targetPort ? `:${targetPort}` : ''}) من الخادم السحابي. العنوان محلي (LAN)؛ يجب الفحص من الهاتف المتصل بنفس شبكة الواي فاي.`;
        } else if (dto.useSsl) {
          message = `تعذر الوصول لواجهة REST بالراوتر (${host}:443). خدمة SSL قد تكون معطلة في الراوتر، يرجى تعطيل خيار SSL واستخدام المنفذ 80 الافتراضي.`;
        } else {
          message = `تعذر الوصول لواجهة REST بالراوتر (${host}${targetPort ? `:${targetPort}` : ''}). إذا كان منفذ الويب مغلقاً في الراوتر، جرب التبديل إلى منفذ API (8728) عبر خيار RouterOS v6.`;
        }
      }

      const isCloudLanReachabilityOnly =
        isPrivateIp &&
        stage !== 'AUTH' &&
        stage !== 'TLS' &&
        (code === 'HOST_TIMEOUT' ||
          code === 'HOST_UNREACHABLE' ||
          code === 'REST_API_UNREACHABLE' ||
          code === 'PORT_CLOSED' ||
          code === 'CONNECTION_FAILED');

      let localPreserved = false;
      if (targetDevice) {
        const now = new Date();
        if (isCloudLanReachabilityOnly) {
          const existingChannel = DevicesService.deviceChannelStates.get(targetDevice.id);
          localPreserved =
            targetDevice.isOnline ||
            targetDevice.status === DeviceStatus.ONLINE ||
            existingChannel?.localStatus === 'ONLINE';

          DevicesService.updateChannelState(targetDevice.id, {
            cloudStatus: 'UNREACHABLE_PRIVATE_LAN',
            cloudCheckedAt: now,
          });
        } else {
          await this.prisma.mikroTikDevice.update({
            where: { id: targetDevice.id },
            data: {
              isOnline: false,
              status: DeviceStatus.ERROR,
              lastSyncAt: now,
              lastError: message,
            },
          });
          DevicesService.updateChannelState(targetDevice.id, {
            cloudStatus: 'ERROR',
            cloudCheckedAt: now,
          });
        }
      }

      return {
        success: false,
        stage,
        code: isCloudLanReachabilityOnly ? 'CLOUD_UNREACHABLE_PRIVATE_LAN' : code,
        message,
        latencyMs,
        error: rawError,
        isPrivateLan: isPrivateIp,
        localPreserved,
      };
    }
  }

  async testConnection(
    tenantId: string,
    id: string,
    currentUser?: RequestUser,
  ): Promise<{
    success: boolean;
    stage?: string;
    code?: string;
    message?: string;
    latencyMs?: number;
    resource?: RouterResource;
    routerInfo?: Record<string, unknown>;
    error?: string;
    isPrivateLan?: boolean;
    localPreserved?: boolean;
  }> {
    const device = currentUser
      ? await this.assertUserDeviceAccess(tenantId, id, currentUser)
      : await this.prisma.mikroTikDevice.findFirst({
          where: { id, tenantId, deletedAt: null },
        });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    const password = this.encryptionService.decrypt(
      device.passwordEncrypted,
      device.iv,
      device.authTag,
    );

    return this.testDirectConnection(tenantId, {
      id: device.id,
      host: device.host,
      apiPort: device.apiPort,
      restPort: device.restPort,
      useSsl: device.useSsl,
      username: device.username,
      password,
      rosVersion: device.rosVersion,
    });
  }

  async reportLocalTelemetry(
    tenantId: string | undefined | null,
    id: string,
    dto: ReportLocalTelemetryDto,
    currentUser?: RequestUser,
  ): Promise<DeviceResponse> {
    const device = await this.assertUserDeviceAccess(tenantId, id, currentUser);

    const now = new Date();
    let verifiedAt = now;
    if (dto.verifiedAt) {
      const parsed = new Date(dto.verifiedAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException({
          code: 'INVALID_TIMESTAMP',
          message: 'صيغة وقت الفحص المحلي (verifiedAt) غير صالحة.',
        });
      }
      if (parsed.getTime() - now.getTime() > 2 * 60 * 1000) {
        throw new BadRequestException({
          code: 'FUTURE_TIMESTAMP_REJECTED',
          message: 'تم رفض التقرير لأن توقيت الفحص في المستقبل.',
        });
      }
      if (now.getTime() - parsed.getTime() > 24 * 60 * 60 * 1000) {
        throw new BadRequestException({
          code: 'EXPIRED_TELEMETRY_REJECTED',
          message: 'تم رفض التقرير لأن صلاحية توقيت الفحص تجاوزت 24 ساعة.',
        });
      }
      verifiedAt = parsed;
    }

    if (dto.reportedHost && dto.reportedHost.trim() !== device.host.trim()) {
      throw new BadRequestException({
        code: 'HOST_MISMATCH',
        message: 'عنوان الراوتر في التقرير المحلي لا يطابق العنوان المسجل للجهاز.',
      });
    }

    if (
      dto.memoryFree !== undefined &&
      dto.memoryTotal !== undefined &&
      dto.memoryTotal > 0 &&
      dto.memoryFree > dto.memoryTotal
    ) {
      throw new BadRequestException({
        code: 'INVALID_TELEMETRY_BOUNDS',
        message: 'الذاكرة الحرة لا يمكن أن تتجاوز إجمالي الذاكرة.',
      });
    }

    if (
      dto.diskFree !== undefined &&
      dto.diskTotal !== undefined &&
      dto.diskTotal > 0 &&
      dto.diskFree > dto.diskTotal
    ) {
      throw new BadRequestException({
        code: 'INVALID_TELEMETRY_BOUNDS',
        message: 'مساحة القرص الحرة لا يمكن أن تتجاوز المساحة الإجمالية.',
      });
    }

    const existingChannel = DevicesService.deviceChannelStates.get(device.id);
    if (
      (device.lastSyncAt && verifiedAt.getTime() < device.lastSyncAt.getTime()) ||
      (existingChannel?.localCheckedAt &&
        verifiedAt.getTime() < existingChannel.localCheckedAt.getTime())
    ) {
      throw new ConflictException({
        code: 'STALE_TELEMETRY',
        message: 'تم رفض التقرير المحلي لوجود فحص أحدث مسجل للراوتر.',
      });
    }

    const nextStatus = dto.isOnline
      ? DeviceStatus.ONLINE
      : dto.status === 'ERROR' || dto.errorCode === 'AUTH_FAILED' || dto.errorCode === 'INVALID_CREDENTIALS'
        ? DeviceStatus.ERROR
        : DeviceStatus.OFFLINE;

    const updateData: Prisma.MikroTikDeviceUpdateInput = {
      isOnline: dto.isOnline,
      status: nextStatus,
      lastSyncAt: verifiedAt,
      lastError: dto.isOnline ? null : (dto.lastError?.trim() || 'تعذر الوصول للراوتر محلياً'),
    };

    if (dto.isOnline) {
      if (dto.cpuLoad !== undefined) updateData.cpuLoad = dto.cpuLoad;
      if (dto.memoryFree !== undefined) updateData.memoryFree = BigInt(Math.round(dto.memoryFree));
      if (dto.memoryTotal !== undefined) updateData.memoryTotal = BigInt(Math.round(dto.memoryTotal));
      if (dto.diskFree !== undefined) updateData.diskFree = BigInt(Math.round(dto.diskFree));
      if (dto.diskTotal !== undefined) updateData.diskTotal = BigInt(Math.round(dto.diskTotal));
      if (dto.uptime !== undefined && dto.uptime.trim().length > 0) updateData.uptime = dto.uptime.trim();
      if (dto.modelName !== undefined && dto.modelName.trim().length > 0) updateData.modelName = dto.modelName.trim();
      if (dto.rosVersion !== undefined) updateData.rosVersion = dto.rosVersion;
    } else {
      await this.mikrotikClientFactory?.invalidateClient?.(device.id);
    }

    const updated = await this.prisma.mikroTikDevice.update({
      where: { id: device.id },
      data: updateData,
    });

    DevicesService.updateChannelState(device.id, {
      localStatus: dto.isOnline ? 'ONLINE' : nextStatus === DeviceStatus.ERROR ? 'ERROR' : 'OFFLINE',
      localCheckedAt: verifiedAt,
      ...(dto.isOnline
        ? {
            lastVerifiedSource: 'LOCAL_LAN',
            lastVerifiedAt: verifiedAt,
            ...(dto.activeHotspotSessions !== undefined
              ? { activeHotspotSessions: dto.activeHotspotSessions }
              : {}),
          }
        : {}),
    });

    return this.transformDevice(updated);
  }

  async getSystemResource(tenantId: string, id: string): Promise<RouterResource> {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    try {
      const client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });

      const resource = await client.getSystemResource();
      const now = new Date();

      await this.prisma.mikroTikDevice.update({
        where: { id },
        data: {
          isOnline: true,
          status: DeviceStatus.ONLINE,
          cpuLoad: resource.cpuLoad,
          memoryFree: BigInt(resource.freeMemory),
          memoryTotal: BigInt(resource.totalMemory),
          diskFree: BigInt(resource.freeHdd),
          diskTotal: BigInt(resource.totalHdd),
          modelName: resource.boardName ?? null,
          uptime: resource.uptime,
          lastSyncAt: now,
          lastError: null,
        },
      });

      DevicesService.updateChannelState(device.id, {
        cloudStatus: 'ONLINE',
        cloudCheckedAt: now,
        lastVerifiedSource:
          device.rosVersion === RouterOsVersion.V7 &&
          (device.restPort === 80 || device.restPort === 443)
            ? 'CLOUD_REST'
            : 'CLOUD_API',
        lastVerifiedAt: now,
      });

      return resource;
    } catch (err) {
      await this.mikrotikClientFactory?.invalidateClient?.(device.id);
      if (!this.isPrivateHost(device.host)) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.prisma.mikroTikDevice.update({
          where: { id },
          data: {
            isOnline: false,
            status: DeviceStatus.ERROR,
            lastError: msg,
          },
        });
        DevicesService.updateChannelState(device.id, {
          cloudStatus: 'ERROR',
          cloudCheckedAt: new Date(),
        });
      } else {
        DevicesService.updateChannelState(device.id, {
          cloudStatus: 'UNREACHABLE_PRIVATE_LAN',
          cloudCheckedAt: new Date(),
        });
      }
      throw err;
    }
  }

  async getDiagnostics(
    tenantId: string,
    id: string,
  ): Promise<{
    isLive: boolean;
    connectivityState: EffectiveConnectivityState;
    cpuLoad: number | null;
    freeMemoryMb: number | null;
    totalMemoryMb: number | null;
    uptime: string | null;
    activeHotspotSessions: number;
    boardName: string | null;
    version?: string | null;
    lastError?: string | null;
    isPrivateLan?: boolean;
  }> {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    const activeSessions = await this.prisma.hotspotActiveSession.count({
      where: { tenantId, deviceId: id },
    });
    const isPrivateLan = this.isPrivateHost(device.host);

    try {
      const client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });

      const resource = await client.getSystemResource();
      const now = new Date();
      await this.prisma.mikroTikDevice.update({
        where: { id },
        data: {
          isOnline: true,
          status: DeviceStatus.ONLINE,
          cpuLoad: resource.cpuLoad,
          memoryFree: BigInt(resource.freeMemory),
          memoryTotal: BigInt(resource.totalMemory),
          diskFree: BigInt(resource.freeHdd),
          diskTotal: BigInt(resource.totalHdd),
          modelName: resource.boardName ?? null,
          uptime: resource.uptime,
          lastSyncAt: now,
          lastError: null,
        },
      });
      DevicesService.updateChannelState(device.id, {
        cloudStatus: 'ONLINE',
        cloudCheckedAt: now,
        lastVerifiedAt: now,
        lastVerifiedSource: 'CLOUD_API',
      });

      return {
        isLive: true,
        connectivityState: 'ONLINE',
        cpuLoad: resource.cpuLoad,
        freeMemoryMb: Math.round(resource.freeMemory / (1024 * 1024)),
        totalMemoryMb: Math.round(resource.totalMemory / (1024 * 1024)),
        uptime: resource.uptime,
        activeHotspotSessions: activeSessions,
        boardName: resource.boardName || device.modelName || null,
        version: resource.version || device.rosVersion,
        isPrivateLan,
      };
    } catch (err) {
      await this.mikrotikClientFactory?.invalidateClient?.(device.id);
      const errMsg = err instanceof Error ? err.message : String(err);

      if (isPrivateLan) {
        DevicesService.updateChannelState(device.id, {
          cloudStatus: 'UNREACHABLE_PRIVATE_LAN',
          cloudCheckedAt: new Date(),
        });
      } else {
        await this.prisma.mikroTikDevice.update({
          where: { id },
          data: {
            isOnline: false,
            status: DeviceStatus.ERROR,
            lastError: errMsg,
          },
        });
        DevicesService.updateChannelState(device.id, {
          cloudStatus: 'ERROR',
          cloudCheckedAt: new Date(),
        });
      }

      const channel = DevicesService.deviceChannelStates.get(device.id);
      return {
        isLive: false,
        connectivityState: this.resolveEffectiveConnectivityState(device),
        cpuLoad: device.cpuLoad ?? null,
        freeMemoryMb:
          device.memoryFree !== null && device.memoryFree !== undefined
            ? Math.round(Number(device.memoryFree) / (1024 * 1024))
            : null,
        totalMemoryMb:
          device.memoryTotal !== null && device.memoryTotal !== undefined
            ? Math.round(Number(device.memoryTotal) / (1024 * 1024))
            : null,
        uptime: device.uptime ?? null,
        activeHotspotSessions: channel?.activeHotspotSessions ?? activeSessions,
        boardName: device.modelName ?? null,
        version: device.rosVersion,
        lastError: isPrivateLan && device.isOnline ? device.lastError : errMsg,
        isPrivateLan,
      };
    }
  }

  async reboot(
    tenantId: string,
    id: string,
  ): Promise<{ success: boolean; code?: string; message: string }> {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    try {
      const client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });

      if (typeof client.reboot === 'function') {
        await client.reboot();
      }
      await this.mikrotikClientFactory?.invalidateClient?.(device.id);
      await this.prisma.mikroTikDevice.update({
        where: { id: device.id },
        data: {
          isOnline: false,
          status: DeviceStatus.OFFLINE,
          lastSyncAt: new Date(),
          lastError: null,
        },
      });
      DevicesService.updateChannelState(device.id, {
        localStatus: 'OFFLINE',
        cloudStatus: 'OFFLINE',
        cloudCheckedAt: new Date(),
      });
      return { success: true, message: 'تم إرسال أمر إعادة تشغيل الراوتر بنجاح' };
    } catch (err) {
      await this.mikrotikClientFactory?.invalidateClient?.(device.id);
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to issue reboot to router ${device.name}: ${errMsg}`);
      return {
        success: false,
        code: 'REBOOT_FAILED',
        message: `تعذر إرسال أمر إعادة التشغيل إلى الراوتر (${device.name}): ${errMsg}`,
      };
    }
  }

  async toggleEmergencyLock(
    tenantId: string,
    id: string,
    locked: boolean,
    userId?: string,
  ): Promise<{ success: boolean; isLocked: boolean; message: string }> {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    if (DevicesService.isLocalOnlyPrivateLan(device.id)) {
      await this.prisma.mikroTikDevice.update({
        where: { id },
        data: { isLocked: locked },
      });

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: userId ?? null,
          action: locked ? 'ROUTER_EMERGENCY_LOCK_ENABLED' : 'ROUTER_EMERGENCY_LOCK_DISABLED',
          entity: 'mikrotik_device',
          entityId: id,
          newValues: { isLocked: locked, deviceName: device.name, source: 'LOCAL_LAN' },
        },
      });

      return {
        success: true,
        isLocked: locked,
        message: locked
          ? 'تم تفعيل قفل الطوارئ في النظام (الراوتر محلي، يُطبق عبر الشبكة المحلية)'
          : 'تم إلغاء قفل الطوارئ في النظام',
      };
    }

    try {
      const client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });

      if (typeof client.setEmergencyLock === 'function') {
        await client.setEmergencyLock(locked);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not sync emergency lock directly to hardware router (${device.host}): ${errMsg}`);
      throw new BadGatewayException({
        code: 'ROUTER_SYNC_FAILED',
        message: `تعذر الاتصال بالراوتر (${device.name} - ${device.host}) لتطبيق قفل الطوارئ على جدار الحماية (Firewall). تحقق من اتصال الراوتر بالإنترنت والشبكة.`,
        error: errMsg,
      });
    }

    await this.prisma.mikroTikDevice.update({
      where: { id },
      data: { isLocked: locked },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId ?? null,
        action: locked ? 'ROUTER_EMERGENCY_LOCK_ENABLED' : 'ROUTER_EMERGENCY_LOCK_DISABLED',
        entity: 'mikrotik_device',
        entityId: id,
        newValues: { isLocked: locked, deviceName: device.name },
      },
    });

    return {
      success: true,
      isLocked: locked,
      message: locked
        ? 'تم تفعيل قفل الطوارئ وتجميد حركة المرور في الراوتر بنجاح'
        : 'تم إلغاء قفل الطوارئ واستئناف حركة المرور في الراوتر بنجاح',
    };
  }

  async toggleAntiTethering(
    tenantId: string,
    id: string,
    enabled: boolean,
    userId?: string,
  ): Promise<{ success: boolean; antiTetheringEnabled: boolean; message: string }> {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    if (DevicesService.isLocalOnlyPrivateLan(device.id)) {
      await this.prisma.mikroTikDevice.update({
        where: { id },
        data: { antiTetheringEnabled: enabled },
      });

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: userId ?? null,
          action: enabled ? 'ANTI_TETHERING_ENABLED' : 'ANTI_TETHERING_DISABLED',
          entity: 'mikrotik_device',
          entityId: id,
          newValues: { antiTetheringEnabled: enabled, deviceName: device.name, source: 'LOCAL_LAN' },
        },
      });

      return {
        success: true,
        antiTetheringEnabled: enabled,
        message: enabled
          ? 'تم تفعيل حظر البث (TTL) في النظام (الراوتر محلي، يُطبق عبر الشبكة المحلية)'
          : 'تم إلغاء حظر البث (TTL) في النظام',
      };
    }

    try {
      const client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });

      if (typeof client.setAntiTethering === 'function') {
        await client.setAntiTethering(enabled);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not sync anti-tethering directly to hardware router (${device.host}): ${errMsg}`);
      throw new BadGatewayException({
        code: 'ROUTER_SYNC_FAILED',
        message: `تعذر الاتصال بالراوتر (${device.name} - ${device.host}) لتطبيق قاعدة حظر البث (TTL). تحقق من اتصال الراوتر بالإنترنت والشبكة.`,
        error: errMsg,
      });
    }

    await this.prisma.mikroTikDevice.update({
      where: { id },
      data: { antiTetheringEnabled: enabled },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId ?? null,
        action: enabled ? 'ANTI_TETHERING_ENABLED' : 'ANTI_TETHERING_DISABLED',
        entity: 'mikrotik_device',
        entityId: id,
        newValues: { antiTetheringEnabled: enabled, deviceName: device.name },
      },
    });

    return {
      success: true,
      antiTetheringEnabled: enabled,
      message: enabled
        ? 'تم تفعيل قاعدة حظر البث ومشاركة الإنترنت (TTL=1) على الراوتر بنجاح'
        : 'تم إلغاء قاعدة حظر البث (TTL) بنجاح',
    };
  }

  /**
   * Securely derives a deterministic, strong encryption password for router backups
   * when no custom password is provided by the user.
   * Derived from HMAC-SHA256(deviceId + tenantId) using the server's master encryption key.
   */
  public deriveDefaultBackupPassword(tenantId: string, deviceId: string): string {
    return this.encryptionService.deriveDeterministicSecret(
      `sudafi-router-backup:${tenantId}:${deviceId}`,
      24,
    );
  }

  async createBackup(
    tenantId: string,
    id: string,
    backupName?: string,
    password?: string,
    userId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    backup: {
      filename: string;
      size?: number;
      creationTime?: string;
      deviceName: string;
      deviceHost: string;
      isEncrypted: boolean;
    };
  }> {
    if (DevicesService.activeDeviceOperations.has(id)) {
      throw new ConflictException({
        code: 'DEVICE_OPERATION_IN_PROGRESS',
        message: 'توجد عملية جارية حالياً (برمجة أو نسخ أو استعادة) على هذا الراوتر. يرجى الانتظار حتى اكتمالها.',
      });
    }

    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `لم يتم العثور على جهاز الراوتر المحدد (ID: ${id})`,
      });
    }

    if (DevicesService.isLocalOnlyPrivateLan(device.id)) {
      throw new BadRequestException({
        code: 'PRIVATE_LAN_ROUTER',
        message:
          'الراوتر متصل محلياً بعنوان LAN خاص؛ يجب إنشاء النسخة الاحتياطية مباشرة من الهاتف عبر الشبكة المحلية.',
        requiresLocalExecution: true,
      });
    }

    DevicesService.activeDeviceOperations.add(id);

    try {
      const client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });

      if (typeof client.createBackup !== 'function') {
        throw new Error('العميل البرمجي لـ MikroTik لا يدعم ميزة النسخ الاحتياطي التلقائي');
      }

      // Enforce strong encryption: use user password if provided, or secure derived password
      const effectivePassword =
        password && password.trim().length > 0
          ? password.trim()
          : this.deriveDefaultBackupPassword(tenantId, id);

      const backupResult = await client.createBackup(backupName, effectivePassword);

      // Audit log records that the backup is encrypted, but NEVER records the password!
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: userId ?? null,
          action: 'ROUTER_BACKUP_CREATED',
          entity: 'mikrotik_device',
          entityId: id,
          newValues: {
            backupFile: backupResult.filename,
            size: backupResult.size,
            deviceName: device.name,
            deviceHost: device.host,
            isEncrypted: true,
          },
        },
      });

      return {
        success: true,
        message: `تم إنشاء النسخة الاحتياطية المشفرة (${backupResult.filename}) بنجاح على جهاز الراوتر`,
        backup: {
          filename: backupResult.filename,
          size: backupResult.size,
          creationTime: backupResult.creationTime,
          deviceName: device.name,
          deviceHost: device.host,
          isEncrypted: true,
        },
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to create backup for router ${device.name} (${device.host}): ${errMsg}`,
      );
      throw new BadGatewayException({
        code: 'ROUTER_BACKUP_FAILED',
        message: `فشل إنشاء النسخة الاحتياطية للراوتر (${device.name} - ${device.host}). تأكد من اتصال الراوتر واستجابته.`,
        error: errMsg,
      });
    } finally {
      DevicesService.activeDeviceOperations.delete(id);
    }
  }

  async listBackups(tenantId: string, id: string): Promise<RouterBackupItem[]> {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `لم يتم العثور على جهاز الراوتر المحدد (ID: ${id})`,
      });
    }

    if (DevicesService.isLocalOnlyPrivateLan(device.id)) {
      return [];
    }

    try {
      const client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });

      if (typeof client.listBackups === 'function') {
        return await client.listBackups();
      }
      return [];
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to list backups for router ${device.name}: ${errMsg}`);
      throw new BadGatewayException({
        code: 'ROUTER_BACKUPS_FETCH_FAILED',
        message: `تعذر جلب قائمة النسخ الاحتياطية من الراوتر (${device.name})`,
        error: errMsg,
      });
    }
  }

  async recordLocalBackup(
    tenantId: string,
    id: string,
    payload: { name?: string; filename?: string; size?: number; encrypted?: boolean },
    userId?: string,
  ): Promise<{ success: boolean; backup: RouterBackupItem; message: string }> {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `لم يتم العثور على جهاز الراوتر المحدد (ID: ${id})`,
      });
    }

    const rawName = (payload.filename || payload.name || 'backup').trim();
    const backupName = rawName.endsWith('.backup') ? rawName : `${rawName}.backup`;
    const backupItem: RouterBackupItem = {
      name: backupName,
      size: payload.size ?? 0,
      type: 'backup',
      creationTime: new Date().toISOString(),
    };

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId ?? null,
        action: 'ROUTER_BACKUP_CREATED',
        entity: 'mikrotik_device',
        entityId: id,
        newValues: {
          backupName: backupItem.name,
          backupFile: backupItem.name,
          size: backupItem.size,
          encrypted: payload.encrypted ?? false,
          source: 'LOCAL_LAN',
        },
      },
    });

    return {
      success: true,
      backup: backupItem,
      message: 'تم تسجيل النسخة الاحتياطية المحلية في النظام بنجاح',
    };
  }

  async downloadBackup(
    tenantId: string,
    id: string,
    filename: string,
    userId?: string,
  ): Promise<{ buffer: Buffer; filename: string; size: number }> {
    const rawFilename = filename.trim();
    if (
      rawFilename.includes('..') ||
      rawFilename.includes('/') ||
      rawFilename.includes('\\') ||
      !rawFilename.toLowerCase().endsWith('.backup') ||
      !/^[a-zA-Z0-9_.-]+$/.test(rawFilename) ||
      rawFilename.length > 100
    ) {
      throw new BadRequestException({
        code: 'INVALID_FILENAME',
        message: 'اسم ملف النسخة الاحتياطية غير صالح أو يحتوي على مسارات غير مسموح بها',
      });
    }

    const safeFilename = path.basename(rawFilename);

    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `لم يتم العثور على جهاز الراوتر المحدد (ID: ${id})`,
      });
    }

    if (DevicesService.isLocalOnlyPrivateLan(device.id)) {
      throw new BadRequestException({
        code: 'PRIVATE_LAN_ROUTER',
        message: 'هذا الراوتر متصل على شبكة محلية خاصة؛ يرجى تنزيل ملف النسخ الاحتياطي عبر التطبيق المتصل بالشبكة المحلية.',
      });
    }

    try {
      const client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });

      if (typeof client.downloadBackup !== 'function') {
        throw new BadGatewayException({
          code: 'DOWNLOAD_NOT_SUPPORTED',
          message: `التنزيل المباشر غير مدعوم على نوع اتصال هذا الراوتر. الملف (${safeFilename}) محفوظ في قائمة Files على الراوتر.`,
        });
      }

      const buffer = await client.downloadBackup(safeFilename);

      if (!buffer || buffer.length === 0) {
        throw new BadGatewayException({
          code: 'EMPTY_BACKUP_FILE',
          message: 'ملف النسخة الاحتياطية الذي تم استلامه فارغ (0 بايت)',
        });
      }

      // Validate size integrity against router file catalog
      try {
        const backups =
          typeof client.listBackups === 'function' ? await client.listBackups() : [];
        const expected = backups.find(
          (b) => b.name === safeFilename || b.name.endsWith(`/${safeFilename}`),
        );
        if (expected?.size && expected.size > 0 && buffer.length !== expected.size) {
          throw new BadGatewayException({
            code: 'BACKUP_SIZE_MISMATCH',
            message: `حجم الملف المنقول (${buffer.length} بايت) لا يطابق حجم الملف على الراوتر (${expected.size} بايت). قد يكون النقل انقطع.`,
          });
        }
      } catch (validationErr) {
        if (validationErr instanceof BadGatewayException) {
          throw validationErr;
        }
      }

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: userId ?? null,
          action: 'ROUTER_BACKUP_DOWNLOADED',
          entity: 'mikrotik_device',
          entityId: id,
          newValues: {
            filename: safeFilename,
            sizeBytes: buffer.length,
            deviceName: device.name,
          },
        },
      });

      return {
        buffer,
        filename: safeFilename,
        size: buffer.length,
      };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof BadGatewayException
      ) {
        throw err;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to download backup ${safeFilename} for router ${device.name}: ${errMsg}`,
      );
      throw new BadGatewayException({
        code: 'ROUTER_BACKUP_DOWNLOAD_FAILED',
        message: `تعذر تنزيل ملف النسخة الاحتياطية من الراوتر (${device.name}): ${errMsg}`,
      });
    }
  }

  async restoreBackup(
    tenantId: string,
    id: string,
    filename: string,
    password?: string,
    confirmed?: boolean,
    userId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    rebootTriggered: boolean;
    restoredBackup: string;
    deviceName: string;
  }> {
    if (!confirmed) {
      throw new BadRequestException({
        code: 'RESTORE_NOT_CONFIRMED',
        message: 'يلزم التأكيد الصريح بأن استعادة النسخة الاحتياطية ستستبدل الإعدادات وتعيد تشغيل الراوتر فوراً.',
      });
    }

    const rawFilename = filename.trim();
    if (
      rawFilename.includes('..') ||
      rawFilename.includes('/') ||
      rawFilename.includes('\\') ||
      !rawFilename.toLowerCase().endsWith('.backup') ||
      !/^[a-zA-Z0-9_.-]+$/.test(rawFilename)
    ) {
      throw new BadRequestException({
        code: 'INVALID_FILENAME',
        message: 'اسم ملف النسخة الاحتياطية غير صالح.',
      });
    }

    const safeFilename = path.basename(rawFilename);

    if (DevicesService.activeDeviceOperations.has(id)) {
      throw new ConflictException({
        code: 'DEVICE_OPERATION_IN_PROGRESS',
        message: 'توجد عملية جارية حالياً (برمجة أو نسخ أو استعادة) على هذا الراوتر. يرجى الانتظار حتى اكتمالها.',
      });
    }

    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `لم يتم العثور على جهاز الراوتر المحدد (ID: ${id})`,
      });
    }

    if (DevicesService.isLocalOnlyPrivateLan(device.id)) {
      throw new BadRequestException({
        code: 'PRIVATE_LAN_ROUTER',
        message:
          'الراوتر متصل محلياً بعنوان LAN خاص؛ يجب استعادة النسخة الاحتياطية مباشرة من الهاتف عبر الشبكة المحلية.',
        requiresLocalExecution: true,
      });
    }

    DevicesService.activeDeviceOperations.add(id);

    try {
      const client: any = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });

      if (typeof client.restoreBackup !== 'function') {
        throw new BadGatewayException({
          code: 'RESTORE_NOT_SUPPORTED',
          message: 'عميل الاتصال الحالي لا يدعم تنفيذ الاستعادة الآلية عن بُعد.',
        });
      }

      const effectivePassword =
        password && password.trim().length > 0
          ? password.trim()
          : this.deriveDefaultBackupPassword(tenantId, id);

      const res = await client.restoreBackup(safeFilename, effectivePassword);

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: userId ?? null,
          action: 'ROUTER_BACKUP_RESTORED',
          entity: 'mikrotik_device',
          entityId: id,
          newValues: {
            filename: safeFilename,
            deviceName: device.name,
            deviceHost: device.host,
            rebootTriggered: res.rebootTriggered,
          },
        },
      });

      // Mark device temporarily offline as it reboots
      await this.mikrotikClientFactory?.invalidateClient?.(device.id);
      await this.prisma.mikroTikDevice.update({
        where: { id: device.id },
        data: {
          isOnline: false,
          status: DeviceStatus.OFFLINE,
          lastSyncAt: new Date(),
          lastError: null,
        },
      });
      DevicesService.updateChannelState(device.id, {
        localStatus: 'OFFLINE',
        cloudStatus: 'OFFLINE',
      });

      return {
        success: true,
        message: res.message,
        rebootTriggered: res.rebootTriggered,
        restoredBackup: safeFilename,
        deviceName: device.name,
      };
    } catch (err: any) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ConflictException ||
        err instanceof BadGatewayException
      ) {
        throw err;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to restore backup ${safeFilename} on router ${device.name}: ${errMsg}`);
      throw new BadGatewayException({
        code: 'ROUTER_BACKUP_RESTORE_FAILED',
        message: `تعذر إتمام استعادة النسخة الاحتياطية على الراوتر (${device.name}): ${errMsg}`,
      });
    } finally {
      DevicesService.activeDeviceOperations.delete(id);
    }
  }

  private normalizeMac(mac?: string): string {
    if (!mac) return '';
    return mac.toUpperCase().replace(/[^0-9A-F]/g, '');
  }

  private formatMac(mac?: string): string {
    if (!mac) return '';
    const clean = this.normalizeMac(mac);
    if (clean.length === 12) {
      return clean.match(/.{1,2}/g)?.join(':') ?? mac.toUpperCase();
    }
    return mac.toUpperCase();
  }

  private isRecentlySeen(lastSeen?: string, maxMinutes = 5): boolean {
    if (!lastSeen) return false;
    const clean = lastSeen.trim().toLowerCase();
    if (clean.includes('d') || clean.includes('w')) return false;
    let totalMinutes = 0;
    const hourMatch = clean.match(/(\d+)\s*h/);
    if (hourMatch) totalMinutes += parseInt(hourMatch[1], 10) * 60;
    const minMatch = clean.match(/(\d+)\s*m(?!s)/);
    if (minMatch) totalMinutes += parseInt(minMatch[1], 10);
    const secMatch = clean.match(/(\d+)\s*s/);
    if (secMatch && totalMinutes === 0) return true;
    return totalMinutes <= maxMinutes;
  }

  private classifyDeviceType(
    name: string,
    hostName?: string,
    identity?: string,
    platform?: string,
    board?: string,
  ): { type: 'ACCESS_POINT' | 'PHONE' | 'COMPUTER' | 'ROUTER' | 'UNKNOWN'; vendor?: string } {
    const rawTokens = [name, hostName, identity, platform, board]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // 1. Explicit exclusions from Access Point / Broadcasting equipment:
    // e.g. PlayStation, WorkStation, Smart TV, Printing station
    const isGamingConsole = /\b(playstation|ps[345]|xbox|nintendo|switch)\b/i.test(rawTokens);
    if (isGamingConsole) {
      return { type: 'UNKNOWN', vendor: rawTokens.includes('playstation') ? 'Sony' : undefined };
    }

    // 2. Ubiquiti outdoor antennas and APs
    if (
      /\b(ubnt|ubiquiti|unifi|nanostation|nanobeam|powerbeam|litebeam|airmax|airgrid|rocket|bullet|isostation|loco\s*m[25]|locom[25]|ns-m[25]|nsm[25])\b/i.test(
        rawTokens,
      )
    ) {
      return { type: 'ACCESS_POINT', vendor: 'Ubiquiti' };
    }

    // 3. MikroTik wireless AP / Sector / CPE boards
    if (
      /\b(sxt|lhg|omnitik|groove|netbox|netmetal|basebox|metal\s*52|wap\s*ac|wap\s*lte|cap\s*ac|cap\s*xl|qrt|dynadish|cube\s*60)\b/i.test(
        rawTokens,
      ) ||
      (rawTokens.includes('mikrotik') && /\b(wireless|antenna|sector)\b/i.test(rawTokens))
    ) {
      return { type: 'ACCESS_POINT', vendor: 'MikroTik' };
    }

    // 4. Dedicated wireless Outdoor APs / Antennas (TP-Link CPE, Cambium, Mimosa)
    if (/\b(cpe210|cpe220|cpe510|cpe610|cpe710|eap\d{3}|omada)\b/i.test(rawTokens)) {
      return { type: 'ACCESS_POINT', vendor: 'TP-Link' };
    }
    if (/\b(cambium|epmp|force\s*180|force\s*200|force\s*300)\b/i.test(rawTokens)) {
      return { type: 'ACCESS_POINT', vendor: 'Cambium' };
    }
    if (/\b(mimosa|b5|b11|b24|c5|c5c|c5x)\b/i.test(rawTokens)) {
      return { type: 'ACCESS_POINT', vendor: 'Mimosa' };
    }

    // 5. Generic explicit Access Point identifiers (excluding workstations)
    if (
      /\b(access\s*point|outdoor\s*ap|wifi\s*ap|repeater|extender|base\s*station)\b/i.test(rawTokens) &&
      !/\b(workstation|playstation)\b/i.test(rawTokens)
    ) {
      return { type: 'ACCESS_POINT' };
    }

    // 6. Router (MikroTik RouterOS/RouterBOARD or EdgeRouter)
    if (/\b(mikrotik|routeros|routerboard|rb\d{3,4}|ccr\d{4}|crs\d{3}|hex|edgerouter)\b/i.test(rawTokens)) {
      return { type: 'ROUTER', vendor: rawTokens.includes('edgerouter') ? 'Ubiquiti' : 'MikroTik' };
    }

    // 7. Phone / Tablet
    if (
      /\b(iphone|ipad|android|galaxy|samsung|huawei|honor|xiaomi|redmi|poco|oppo|vivo|realme|pixel|oneplus|tecno|infinix|itel|nokia|xperia|motorola)\b/i.test(
        rawTokens,
      )
    ) {
      let vendor: string | undefined;
      if (/\b(iphone|ipad)\b/i.test(rawTokens)) vendor = 'Apple';
      else if (/\b(galaxy|samsung)\b/i.test(rawTokens)) vendor = 'Samsung';
      else if (/\b(huawei)\b/i.test(rawTokens)) vendor = 'Huawei';
      else if (/\b(honor)\b/i.test(rawTokens)) vendor = 'Honor';
      else if (/\b(xiaomi|redmi|poco)\b/i.test(rawTokens)) vendor = 'Xiaomi';
      else if (/\b(oppo)\b/i.test(rawTokens)) vendor = 'Oppo';
      else if (/\b(vivo)\b/i.test(rawTokens)) vendor = 'Vivo';
      else if (/\b(realme)\b/i.test(rawTokens)) vendor = 'Realme';
      else if (/\b(pixel)\b/i.test(rawTokens)) vendor = 'Google';
      else if (/\b(oneplus)\b/i.test(rawTokens)) vendor = 'OnePlus';
      else if (/\b(tecno)\b/i.test(rawTokens)) vendor = 'Tecno';
      else if (/\b(infinix)\b/i.test(rawTokens)) vendor = 'Infinix';
      return { type: 'PHONE', vendor };
    }

    // 8. Computer / Laptop
    if (
      /\b(desktop|laptop|notebook|macbook|windows|linux|thinkpad|ideapad|latitude|optiplex|probook|elitebook|surface)\b/i.test(
        rawTokens,
      ) ||
      /\b(dell|lenovo|asus|acer|msi)\b/i.test(rawTokens)
    ) {
      let vendor: string | undefined;
      if (/\b(macbook)\b/i.test(rawTokens)) vendor = 'Apple';
      else if (/\b(dell|latitude|optiplex)\b/i.test(rawTokens)) vendor = 'Dell';
      else if (/\b(hp|probook|elitebook)\b/i.test(rawTokens)) vendor = 'HP';
      else if (/\b(lenovo|thinkpad|ideapad)\b/i.test(rawTokens)) vendor = 'Lenovo';
      else if (/\b(asus)\b/i.test(rawTokens)) vendor = 'Asus';
      else if (/\b(acer)\b/i.test(rawTokens)) vendor = 'Acer';
      return { type: 'COMPUTER', vendor };
    }

    return { type: 'UNKNOWN' };
  }

  async getConnectedDevices(
    tenantId: string | undefined | null,
    id: string,
    currentUser?: RequestUser,
  ): Promise<ConnectedDeviceItem[]> {
    const device = await this.assertUserDeviceAccess(tenantId, id, currentUser);

    let client;
    try {
      client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to connect to router ${device.name} (${id}) for connected devices: ${errMsg}`);
      throw new BadGatewayException({
        code: 'ROUTER_CONNECTION_FAILED',
        message: `تعذر الاتصال بالراوتر (${device.name}): يرجى التأكد من تشغيل الراوتر واتصاله بالشبكة`,
      });
    }

    // Query DHCP Leases, ARP Table, and Neighbors concurrently
    const [leasesRes, arpRes, neighborsRes] = await Promise.allSettled([
      client.listDhcpLeases ? client.listDhcpLeases() : Promise.resolve([]),
      client.listArpTable ? client.listArpTable() : Promise.resolve([]),
      client.listNeighbors ? client.listNeighbors() : Promise.resolve([]),
    ]);

    const leases = leasesRes.status === 'fulfilled' ? leasesRes.value : [];
    const arpItems = arpRes.status === 'fulfilled' ? arpRes.value : [];
    const neighbors = neighborsRes.status === 'fulfilled' ? neighborsRes.value : [];

    if (leasesRes.status === 'rejected') {
      this.logger.warn(`Could not fetch DHCP leases for router ${device.name}: ${leasesRes.reason}`);
    }
    if (arpRes.status === 'rejected') {
      this.logger.warn(`Could not fetch ARP table for router ${device.name}: ${arpRes.reason}`);
    }
    if (neighborsRes.status === 'rejected') {
      this.logger.warn(`Could not fetch neighbors for router ${device.name}: ${neighborsRes.reason}`);
    }

    if (
      leasesRes.status === 'rejected' &&
      arpRes.status === 'rejected' &&
      neighborsRes.status === 'rejected'
    ) {
      throw new BadGatewayException({
        code: 'ROUTER_QUERY_FAILED',
        message: `تعذر جلب الأجهزة المتصلة من الراوتر (${device.name}): فشل الاستعلام من RouterOS`,
      });
    }

    // Gather records into unified map by normalized MAC or IP fallback
    const unifiedMap = new Map<
      string,
      {
        key: string;
        mac: string;
        neighbor?: (typeof neighbors)[0];
        lease?: (typeof leases)[0];
        arp?: (typeof arpItems)[0];
        sources: Array<'DHCP' | 'ARP' | 'NEIGHBOR'>;
      }
    >();

    const getOrInit = (mac: string, ip: string, fallbackPrefix: string, fallbackId?: string) => {
      const normMac = this.normalizeMac(mac);
      const key = normMac || (ip ? `ip_${ip}` : `${fallbackPrefix}_${fallbackId ?? Math.random()}`);
      let entry = unifiedMap.get(key);
      if (!entry) {
        entry = {
          key,
          mac: this.formatMac(mac),
          sources: [],
        };
        unifiedMap.set(key, entry);
      }
      return entry;
    };

    // 1. Ingest Neighbors
    for (const nb of neighbors) {
      const mac = nb.macAddress ?? '';
      const ip = nb.address ?? '';
      const entry = getOrInit(mac, ip, 'nb', nb.id);
      entry.neighbor = nb;
      if (!entry.sources.includes('NEIGHBOR')) entry.sources.push('NEIGHBOR');
    }

    // 2. Ingest DHCP Leases
    for (const lease of leases) {
      const mac = lease.activeMacAddress || lease.macAddress || '';
      const ip = lease.activeAddress || lease.address || '';
      const entry = getOrInit(mac, ip, 'lease', lease.id);
      entry.lease = lease;
      if (!entry.sources.includes('DHCP')) entry.sources.push('DHCP');
    }

    // 3. Ingest ARP Table
    for (const arp of arpItems) {
      const mac = arp.macAddress ?? '';
      const ip = arp.address ?? '';
      const entry = getOrInit(mac, ip, 'arp', arp.id);
      entry.arp = arp;
      if (!entry.sources.includes('ARP')) entry.sources.push('ARP');
    }

    // Process each unified device and resolve identity, connection certainty, and classification
    const result: ConnectedDeviceItem[] = [];

    for (const item of unifiedMap.values()) {
      const mac = item.mac;
      const nb = item.neighbor;
      const lease = item.lease;
      const arp = item.arp;

      // 1. IP Address resolution: Prefer active ARP address, then DHCP active-address, then Neighbor
      const ipAddress =
        arp?.address ||
        lease?.activeAddress ||
        lease?.address ||
        nb?.address ||
        '';

      // 2. Physical / Network Interface
      const iface = arp?.interface || nb?.interface || lease?.server;

      // 3. Name & Hostname resolution
      const nbIdentity = nb?.identity?.trim();
      const leaseHostName = lease?.hostName?.trim();
      const leaseComment = lease?.comment?.trim();
      const arpComment = arp?.comment?.trim();
      const nbBoard = nb?.board?.trim();

      let name = '';
      if (nbIdentity && !nbIdentity.startsWith('MikroTik') && !nbIdentity.startsWith('RouterOS')) {
        name = nbIdentity;
      } else if (leaseHostName) {
        name = leaseHostName;
      } else if (leaseComment) {
        name = leaseComment;
      } else if (arpComment) {
        name = arpComment;
      } else if (nbBoard) {
        name = nbBoard;
      } else if (nbIdentity) {
        name = nbIdentity;
      } else {
        name = mac ? `جهاز (${mac})` : `جهاز (${ipAddress})`;
      }

      // 4. Device Classification
      const classification = this.classifyDeviceType(
        name,
        leaseHostName,
        nbIdentity,
        nb?.platform,
        nb?.board,
      );

      let deviceType: 'ACCESS_POINT' | 'PHONE' | 'COMPUTER' | 'ROUTER' | 'UNKNOWN' = classification.type;
      let vendor = classification.vendor || nb?.platform || nb?.board;

      // If neighbor exists with wireless hardware board, ensure ACCESS_POINT
      if (deviceType === 'UNKNOWN' && nb) {
        const nbTokens = `${nb.board ?? ''} ${nb.platform ?? ''} ${nb.identity ?? ''}`.toLowerCase();
        if (
          /\b(sxt|lhg|omnitik|cpe|nanostation|litebeam|powerbeam|airmax|bullet|groove|wap|cap)\b/i.test(
            nbTokens,
          )
        ) {
          deviceType = 'ACCESS_POINT';
        } else if (/\b(routerboard|routeros|ccr|crs|hex|rb)\b/i.test(nbTokens)) {
          deviceType = 'ROUTER';
          if (!vendor) vendor = 'MikroTik';
        }
      }

      // 5. Connection Certainty Evaluation
      const isArpActive = Boolean(arp && arp.complete !== false && !arp.disabled);
      const isNeighborRecent = Boolean(
        nb && (!nb.age || this.isRecentlySeen(nb.age, 5)),
      );
      const isLeaseRecent = Boolean(
        lease && this.isRecentlySeen(lease.lastSeen, 5),
      );
      const isDhcpBound = Boolean(
        lease &&
          (lease.status?.toLowerCase() === 'bound' || lease.activeAddress) &&
          !lease.disabled,
      );

      let connectionCertainty: 'CONFIRMED_ONLINE' | 'LEASE_ACTIVE' | 'OFFLINE';

      if (isArpActive || isNeighborRecent || isLeaseRecent) {
        // High confidence: active Layer-2 packets confirmed in ARP or MNDP or recent DHCP packet
        connectionCertainty = 'CONFIRMED_ONLINE';
      } else if (isDhcpBound) {
        // Medium confidence: DHCP lease is currently granted, but no active ARP traffic confirmed
        connectionCertainty = 'LEASE_ACTIVE';
      } else {
        // Static lease waiting, incomplete ARP, or disabled
        connectionCertainty = 'OFFLINE';
      }

      const isOnline = connectionCertainty === 'CONFIRMED_ONLINE';
      const status =
        connectionCertainty === 'CONFIRMED_ONLINE'
          ? 'active'
          : connectionCertainty === 'LEASE_ACTIVE'
            ? 'leased'
            : 'offline';

      // Primary source indicator
      const primarySource: 'DHCP' | 'ARP' | 'NEIGHBOR' = isArpActive
        ? 'ARP'
        : nb
          ? 'NEIGHBOR'
          : 'DHCP';

      result.push({
        id: item.key,
        name,
        ipAddress,
        macAddress: mac,
        interface: iface,
        status,
        isOnline,
        connectionCertainty,
        deviceType,
        hostName: leaseHostName || nbIdentity,
        vendor,
        uptime: nb?.uptime,
        expiresAfter: lease?.expiresAfter,
        lastSeen: lease?.lastSeen,
        age: nb?.age,
        source: primarySource,
        sources: item.sources,
      });
    }

    // Sort: Confirmed Online first, then Leased, then Offline, then Access Points first, then alphabetical
    return result.sort((a, b) => {
      const order = { CONFIRMED_ONLINE: 0, LEASE_ACTIVE: 1, OFFLINE: 2 };
      const diff = order[a.connectionCertainty] - order[b.connectionCertainty];
      if (diff !== 0) return diff;
      if (a.deviceType === 'ACCESS_POINT' && b.deviceType !== 'ACCESS_POINT') return -1;
      if (b.deviceType === 'ACCESS_POINT' && a.deviceType !== 'ACCESS_POINT') return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }

  /**
   * Fetch Hotspot users stored in MikroTik router memory (/ip/hotspot/user/print)
   */
  async getRouterHotspotUsers(
    tenantId: string | undefined | null,
    id: string,
    currentUser?: RequestUser,
  ): Promise<any[]> {
    const device = await this.assertUserDeviceAccess(tenantId, id, currentUser);

    if (this.isPrivateHost(device.host || '')) {
      // For private LAN routers, phone directly communicates over local network
      return [];
    }

    let client;
    try {
      client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });
    } catch (err) {
      throw new BadGatewayException({
        code: 'ROUTER_CONNECTION_FAILED',
        message: `تعذر الاتصال بالراوتر (${device.name}): يرجى التأكد من تشغيل الراوتر واتصاله بالشبكة`,
      });
    }

    try {
      const users = await client.listHotspotUsers();
      return users.map((u: any) => ({
        id: u.id,
        name: u.name,
        profile: u.profile,
        limitUptime: u.limitUptime,
        limitBytesTotal: u.limitBytesTotal,
        comment: u.comment,
        email: u.email,
        disabled: u.disabled === true || u.disabled === 'true',
      }));
    } catch (err) {
      this.logger.warn(`Failed to fetch hotspot users for router ${device.name}: ${err}`);
      throw new BadGatewayException({
        code: 'ROUTER_QUERY_FAILED',
        message: `تعذر جلب كروت الهوتسبوت من الراوتر (${device.name})`,
      });
    }
  }
}


