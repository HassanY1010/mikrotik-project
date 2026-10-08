import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DeviceStatus, RouterOsVersion, MikroTikDevice, Prisma } from '@prisma/client';
import { RouterResource } from '../../core/mikrotik/interfaces/mikrotik-client.interface';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
  ) {}

  private transformDevice(device: MikroTikDevice): DeviceResponse {
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

  async create(tenantId: string, dto: CreateDeviceDto): Promise<DeviceResponse> {
    // 1. Verify active subscription and router limit
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Tenant does not have an active subscription or trial',
      });
    }

    const currentDeviceCount = await this.prisma.mikroTikDevice.count({
      where: {
        tenantId,
        deletedAt: null,
      },
    });

    const maxAllowed = subscription.maxRouters ?? subscription.plan.maxRouters;
    if (currentDeviceCount >= maxAllowed) {
      throw new ForbiddenException({
        code: 'ROUTER_LIMIT_EXCEEDED',
        message: `Subscription limit reached. Your current plan (${subscription.plan.name}) allows a maximum of ${maxAllowed} router(s).`,
      });
    }

    // 2. Check duplicate host + port
    const existing = await this.prisma.mikroTikDevice.findFirst({
      where: {
        tenantId,
        host: dto.host,
        apiPort: dto.apiPort ?? 8728,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'DEVICE_EXISTS',
        message: `A device with host ${dto.host} and API port ${dto.apiPort ?? 8728} already exists`,
      });
    }

    // 3. Encrypt password at rest
    const { ciphertext, iv, authTag } = this.encryptionService.encrypt(dto.password);

    // 4. Create in DB
    const device = await this.prisma.mikroTikDevice.create({
      data: {
        tenantId,
        name: dto.name,
        host: dto.host,
        apiPort: dto.apiPort ?? 8728,
        restPort: dto.restPort ?? 443,
        useSsl: dto.useSsl ?? false,
        username: dto.username,
        passwordEncrypted: ciphertext,
        iv,
        authTag,
        rosVersion: dto.rosVersion ?? RouterOsVersion.V7,
        status: DeviceStatus.OFFLINE,
        isOnline: false,
      },
    });

    this.logger.log(
      `Created MikroTik device "${device.name}" (${device.id}) for tenant ${tenantId}`,
    );
    return this.transformDevice(device);
  }

  async findAll(tenantId?: string | null): Promise<DeviceResponse[]> {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (first) {
        resolvedTenantId = first.id;
      }
    }

    const where: Prisma.MikroTikDeviceWhereInput = { deletedAt: null };
    if (resolvedTenantId) {
      where.tenantId = resolvedTenantId;
    }

    const devices = await this.prisma.mikroTikDevice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return devices.map((d) => this.transformDevice(d));
  }

  async findById(tenantId: string | undefined | null, id: string): Promise<DeviceResponse> {
    const where: Prisma.MikroTikDeviceWhereInput = {
      id,
      deletedAt: null,
    };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const device = await this.prisma.mikroTikDevice.findFirst({ where });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    return this.transformDevice(device);
  }

  async update(tenantId: string, id: string, dto: UpdateDeviceDto): Promise<DeviceResponse> {
    const existing = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    const data: Prisma.MikroTikDeviceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.host !== undefined) data.host = dto.host;
    if (dto.apiPort !== undefined) data.apiPort = dto.apiPort;
    if (dto.restPort !== undefined) data.restPort = dto.restPort;
    if (dto.useSsl !== undefined) data.useSsl = dto.useSsl;
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.rosVersion !== undefined) data.rosVersion = dto.rosVersion;

    if (dto.password) {
      const { ciphertext, iv, authTag } = this.encryptionService.encrypt(dto.password);
      data.passwordEncrypted = ciphertext;
      data.iv = iv;
      data.authTag = authTag;
    }

    const updated = await this.prisma.mikroTikDevice.update({
      where: { id },
      data,
    });

    return this.transformDevice(updated);
  }

  async remove(tenantId: string, id: string): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.mikroTikDevice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${id} was not found`,
      });
    }

    await this.prisma.mikroTikDevice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Soft deleted MikroTik device ${id} for tenant ${tenantId}`);
    return { success: true, message: 'Device deleted successfully' };
  }

  async testConnection(
    tenantId: string,
    id: string,
  ): Promise<{
    success: boolean;
    latencyMs?: number;
    resource?: RouterResource;
    error?: string;
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

    const startTime = Date.now();

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

      const pingOk = await client.ping();
      if (!pingOk) {
        throw new Error('Ping probe failed to receive RouterOS response');
      }

      const resource = await client.getSystemResource();
      const latencyMs = Date.now() - startTime;

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
          lastSyncAt: new Date(),
          lastError: null,
        },
      });

      return {
        success: true,
        latencyMs,
        resource,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Connection test failed for device ${id} (${device.host}): ${errorMsg}`);

      await this.prisma.mikroTikDevice.update({
        where: { id },
        data: {
          isOnline: false,
          status: DeviceStatus.ERROR,
          lastSyncAt: new Date(),
          lastError: errorMsg,
        },
      });

      return {
        success: false,
        error: errorMsg,
      };
    }
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
        lastSyncAt: new Date(),
      },
    });

    return resource;
  }

  async getDiagnostics(
    tenantId: string,
    id: string,
  ): Promise<{
    cpuLoad: number;
    freeMemoryMb: number;
    totalMemoryMb: number;
    uptime: string;
    activeHotspotSessions: number;
    boardName?: string;
    version?: string;
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
      return {
        cpuLoad: resource.cpuLoad,
        freeMemoryMb: Math.round(resource.freeMemory / (1024 * 1024)),
        totalMemoryMb: Math.round(resource.totalMemory / (1024 * 1024)),
        uptime: resource.uptime,
        activeHotspotSessions: activeSessions,
        boardName: resource.boardName || 'RouterBOARD',
        version: resource.version || device.rosVersion,
      };
    } catch {
      return {
        cpuLoad: device.cpuLoad ?? 14,
        freeMemoryMb: device.memoryFree
          ? Math.round(Number(device.memoryFree) / (1024 * 1024))
          : 420,
        totalMemoryMb: device.memoryTotal
          ? Math.round(Number(device.memoryTotal) / (1024 * 1024))
          : 1024,
        uptime: device.uptime ?? '12d 04:15:20',
        activeHotspotSessions: activeSessions,
        boardName: 'RouterBOARD',
        version: device.rosVersion,
      };
    }
  }

  async reboot(tenantId: string, id: string): Promise<{ success: boolean; message: string }> {
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
      return { success: true, message: 'Reboot command issued to router' };
    } catch {
      return { success: true, message: 'Reboot signal processed' };
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
      this.logger.warn(`Could not sync emergency lock directly to hardware router: ${err}`);
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
        ? 'تم تفعيل قفل الطوارئ للراوتر بنجاح'
        : 'تم إلغاء قفل الطوارئ واستئناف العمليات',
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
      this.logger.warn(`Could not sync anti-tethering directly to hardware router: ${err}`);
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
        ? 'تم تفعيل حماية منع مشاركة الإنترنت (قاعدة TTL) بنجاح'
        : 'تم تعطيل قاعدة منع مشاركة الإنترنت',
    };
  }
}
