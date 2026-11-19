import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { DeviceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { MikrotikClientFactory, DeviceConnectionConfig } from '../../core/mikrotik/mikrotik-client.factory';
import { MikrotikOperationExecutorService } from '../../core/mikrotik/services/mikrotik-operation-executor.service';
import {
  OperationExecutionStatus,
  OperationFailurePhase,
} from '../../core/mikrotik/interfaces/mikrotik-operation.interface';
import { DevicesService } from '../devices/devices.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  HotspotActiveSessionItem,
  HotspotUserItem,
} from '../../core/mikrotik/interfaces/mikrotik-client.interface';
import {
  formatValidityDurationArabic,
  normalizeValidityDuration,
} from '../../common/utils/validity-duration.util';
import { RoleName } from '@mikrotik-saas/shared-types';
import type { RequestUser } from '../../core/decorators/current-user.decorator';
import {
  parseRateLimit,
  calculateConsumptionAndQuota,
  calculateValidityAndTime,
} from './utils/hotspot-parser.util';
import {
  EnrichedHotspotSessionDto,
  HotspotActiveSessionsResponseDto,
  RouterConnectionStatusDto,
} from './dto/enriched-hotspot-session.dto';

@Injectable()
export class HotspotService {
  private readonly logger = new Logger(HotspotService.name);

  private readonly executor: MikrotikOperationExecutorService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
    @Optional() executor?: MikrotikOperationExecutorService,
  ) {
    this.executor = executor || new MikrotikOperationExecutorService(mikrotikClientFactory);
  }

  private toDeviceConfig(device: any): DeviceConnectionConfig {
    return {
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
    };
  }

  private handleExecutorFailure(result: any, fallbackMessage: string): never {
    const errorArabic = result.errorArabic || result.error || fallbackMessage;
    const code =
      result.phase === OperationFailurePhase.CONNECTION
        ? 'ROUTER_CONNECTION_FAILED'
        : result.phase === OperationFailurePhase.PRE_VERIFICATION
          ? 'PROFILE_ALREADY_EXISTS_ON_ROUTER'
          : result.phase === OperationFailurePhase.COMMAND_EXECUTION
            ? 'ROUTER_PROVISIONING_FAILED'
            : result.phase === OperationFailurePhase.POST_VERIFICATION
              ? 'ROUTER_VERIFICATION_FAILED'
              : result.phase === OperationFailurePhase.PERSISTENCE
                ? 'PERSISTENCE_FAILED'
                : 'ROUTER_OPERATION_FAILED';

    if (result.phase === OperationFailurePhase.PRE_VERIFICATION && /already exists/i.test(result.error || '')) {
      throw new ConflictException({
        code: 'PROFILE_EXISTS',
        message: errorArabic,
        details: result.details,
      });
    }

    if (result.status === OperationExecutionStatus.UNKNOWN) {
      throw new BadGatewayException({
        code: 'ROUTER_STATE_UNKNOWN',
        message: errorArabic,
        details: {
          routerId: result.routerId,
          routerHost: result.routerHost,
          phase: result.phase,
          error: result.error,
        },
      });
    }

    if (result.phase === OperationFailurePhase.PERSISTENCE) {
      throw new BadGatewayException({
        code: 'PERSISTENCE_FAILED',
        message: errorArabic,
        details: {
          routerId: result.routerId,
          routerHost: result.routerHost,
          phase: result.phase,
          error: result.error,
        },
      });
    }

    throw new BadGatewayException({
      code,
      message: errorArabic,
      details: {
        routerId: result.routerId,
        routerHost: result.routerHost,
        phase: result.phase,
        error: result.error,
      },
    });
  }

  private async getValidDevice(
    tenantId: string | undefined,
    deviceId: string,
    currentUser?: RequestUser,
  ) {
    const where: any = { id: deviceId, deletedAt: null };
    if (tenantId) where.tenantId = tenantId;
    const device = await this.prisma.mikroTikDevice.findFirst({ where });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${deviceId} was not found for this tenant`,
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

  async listProfiles(tenantId: string, deviceId: string, currentUser?: RequestUser) {
    await this.getValidDevice(tenantId, deviceId, currentUser);

    const profiles = await this.prisma.hotspotProfile.findMany({
      where: { tenantId, deviceId },
      orderBy: { name: 'asc' },
    });

    return profiles.map((p) => ({
      ...p,
      price: p.price ? Number(p.price) : 0,
      displayName: p.displayName || p.name,
      dataLimitBytes: p.dataLimitBytes ? Number(p.dataLimitBytes) : null,
      dataLimitGb: p.dataLimitBytes
        ? Number((Number(p.dataLimitBytes) / (1024 * 1024 * 1024)).toFixed(2))
        : null,
    }));
  }

  async listAllProfiles(tenantId?: string | null, currentUser?: RequestUser) {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (first) resolvedTenantId = first.id;
    }

    const where: Prisma.HotspotProfileWhereInput = {};
    if (resolvedTenantId) {
      where.tenantId = resolvedTenantId;
    }

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
      if (assignedIds.length === 0) {
        return [];
      }
      where.deviceId = { in: assignedIds };
    }

    const profiles = await this.prisma.hotspotProfile.findMany({
      where,
      include: {
        device: { select: { id: true, name: true } },
        cardBatches: {
          select: { price: true, validityDays: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            cards: {
              where: { status: 'AVAILABLE' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return profiles.map((p) => {
      const price = p.price
        ? Number(p.price)
        : p.cardBatches[0]?.price
          ? Number(p.cardBatches[0].price)
          : 500;
      const rawVal =
        p.sessionTimeout ||
        (p.cardBatches[0]?.validityDays ? `${p.cardBatches[0].validityDays}d` : null);
      const validity = rawVal ? normalizeValidityDuration(rawVal) : null;
      let displayName = p.displayName || p.name;
      const lower = p.name.toLowerCase();
      if (lower === '1hour-unlimited') displayName = 'باقة 1 ساعة (إنترنت مفتوح)';
      else if (lower === '3hours-unlimited') displayName = 'باقة 3 ساعات (إنترنت مفتوح)';
      else if (lower === '1day-unlimited') displayName = 'باقة 1 يوم (إنترنت مفتوح)';
      else if (lower === '1week-unlimited') displayName = 'باقة 1 أسبوع (إنترنت مفتوح)';
      else if (lower === '1month-unlimited') displayName = 'باقة 1 شهر (إنترنت مفتوح)';
      else if (lower.includes('-unlimited')) {
        displayName = p.name.replace(/-unlimited/gi, ' (إنترنت مفتوح)');
      } else if (p.sessionTimeout) {
        displayName = `${p.name} (${formatValidityDurationArabic(p.sessionTimeout)})`;
      }

      const dataLimitBytesNum = p.dataLimitBytes ? Number(p.dataLimitBytes) : null;
      const dataLimitGb = dataLimitBytesNum ? Number((dataLimitBytesNum / (1024 * 1024 * 1024)).toFixed(2)) : null;

      return {
        id: p.id,
        name: p.name,
        displayName,
        price,
        validity,
        sessionTimeout: p.sessionTimeout,
        rateLimit: p.rateLimit || '2M/5M',
        sharedUsers: p.sharedUsers,
        deviceId: p.deviceId,
        device: p.device,
        availableCards: p._count.cards,
        dataLimitBytes: dataLimitBytesNum,
        dataLimitGb,
      };
    });
  }

  async syncProfiles(
    tenantId: string,
    deviceId: string,
    currentUser?: RequestUser,
    clientProfiles?: any[],
  ) {
    const device = await this.getValidDevice(tenantId, deviceId, currentUser);

    let routerProfiles: Array<{
      name: string;
      rateLimit?: string | null;
      sessionTimeout?: string | null;
      idleTimeout?: string | null;
      keepaliveTimeout?: string | null;
      sharedUsers?: number;
      addressPool?: string | null;
    }> = [];

    if (Array.isArray(clientProfiles) && clientProfiles.length > 0) {
      // Profiles fetched directly by mobile client over local LAN
      routerProfiles = clientProfiles
        .map((p) => ({
          name: (p.name || p['name'] || '').toString().trim(),
          rateLimit: p['rate-limit'] || p.rateLimit || null,
          sessionTimeout: p['session-timeout'] || p.sessionTimeout || null,
          idleTimeout: p['idle-timeout'] || p.idleTimeout || null,
          keepaliveTimeout: p['keepalive-timeout'] || p.keepaliveTimeout || null,
          sharedUsers: Number(p['shared-users'] ?? p.sharedUsers ?? 1) || 1,
          addressPool: p['address-pool'] || p.addressPool || null,
        }))
        .filter((p) => p.name.length > 0);
    } else {
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

      const fetched = await client.listHotspotProfiles();
      routerProfiles = fetched.map((rp) => ({
        name: rp.name,
        rateLimit: rp.rateLimit ?? null,
        sessionTimeout: rp.sessionTimeout ?? null,
        idleTimeout: rp.idleTimeout ?? null,
        keepaliveTimeout: rp.keepaliveTimeout ?? null,
        sharedUsers: rp.sharedUsers ?? 1,
        addressPool: rp.addressPool ?? null,
      }));
    }

    this.logger.log(`Syncing ${routerProfiles.length} profiles for router ${device.host}`);

    const synced = [];
    const activeNames: string[] = [];

    for (const rp of routerProfiles) {
      if (!rp.name) continue;
      activeNames.push(rp.name);

      const profile = await this.prisma.hotspotProfile.upsert({
        where: {
          tenantId_deviceId_name: {
            tenantId,
            deviceId,
            name: rp.name,
          },
        },
        create: {
          tenantId,
          deviceId,
          name: rp.name,
          rateLimit: rp.rateLimit ?? null,
          sessionTimeout: rp.sessionTimeout ?? null,
          idleTimeout: rp.idleTimeout ?? null,
          keepaliveTimeout: rp.keepaliveTimeout ?? null,
          sharedUsers: rp.sharedUsers ?? 1,
          addressPool: rp.addressPool ?? null,
        },
        update: {
          rateLimit: rp.rateLimit ?? null,
          sessionTimeout: rp.sessionTimeout ?? null,
          idleTimeout: rp.idleTimeout ?? null,
          keepaliveTimeout: rp.keepaliveTimeout ?? null,
          sharedUsers: rp.sharedUsers ?? 1,
          addressPool: rp.addressPool ?? null,
        },
      });
      synced.push({
        ...profile,
        dataLimitBytes: profile.dataLimitBytes ? Number(profile.dataLimitBytes) : null,
        dataLimitGb: profile.dataLimitBytes
          ? Number((Number(profile.dataLimitBytes) / (1024 * 1024 * 1024)).toFixed(2))
          : null,
      });
    }

    // Two-Way Sync Pruning: Remove any profiles in the database for this device that were deleted from the router
    if (activeNames.length > 0) {
      await this.prisma.hotspotProfile.deleteMany({
        where: {
          tenantId,
          deviceId,
          name: { notIn: activeNames },
        },
      });
    }

    return synced;
  }

  async createProfile(
    tenantId: string,
    deviceId: string,
    dto: CreateProfileDto,
    currentUser?: RequestUser,
  ) {
    const device = await this.getValidDevice(tenantId, deviceId, currentUser);
    const effectiveTenantId = tenantId || device.tenantId;

    const existing = await this.prisma.hotspotProfile.findFirst({
      where: { tenantId: effectiveTenantId, deviceId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException({
        code: 'PROFILE_EXISTS',
        message: `A hotspot profile with name "${dto.name}" already exists on this router`,
      });
    }

    const effectiveValidity = dto.validity || dto.sessionTimeout;
    const normalizedValidity = effectiveValidity ? normalizeValidityDuration(effectiveValidity) : null;

    // Calculate quota limit in bytes if provided
    let calculatedDataLimitBytes: bigint | null = null;
    if (dto.dataLimitMb !== undefined && dto.dataLimitMb !== null) {
      const val = Number(dto.dataLimitMb);
      if (Number.isNaN(val) || val <= 0) {
        throw new BadRequestException('حجم البيانات بالميجابايت يجب أن يكون رقماً موجباً أكبر من الصفر');
      }
      // 1 MB = 1024 * 1024 bytes = 1,048,576 bytes
      calculatedDataLimitBytes = BigInt(Math.round(val * 1024 * 1024));
    } else if (dto.dataLimitGb !== undefined && dto.dataLimitGb !== null) {
      const val = Number(dto.dataLimitGb);
      if (Number.isNaN(val) || val <= 0) {
        throw new BadRequestException('حجم البيانات بالجيجابايت يجب أن يكون رقماً موجباً أكبر من الصفر');
      }
      // 1 GB = 1024 * 1024 * 1024 bytes = 1,073,741,824 bytes
      calculatedDataLimitBytes = BigInt(Math.round(val * 1024 * 1024 * 1024));
    } else if (dto.dataLimitBytes !== undefined && dto.dataLimitBytes !== null) {
      const bVal = Number(dto.dataLimitBytes);
      if (Number.isNaN(bVal) || bVal < 0) {
        throw new BadRequestException('حجم البيانات بالبايت يجب أن يكون صفراً أو رقماً موجباً');
      }
      calculatedDataLimitBytes = bVal > 0 ? BigInt(dto.dataLimitBytes) : null;
    }

    // Enforce genuine router connectivity or explicit Private LAN handling
    const isLocalPrivateLan = Boolean(DevicesService?.isLocalOnlyPrivateLan?.(device.id));
    if (isLocalPrivateLan) {
      const created = await this.prisma.hotspotProfile.create({
        data: {
          tenantId: effectiveTenantId,
          deviceId,
          name: dto.name,
          displayName: dto.displayName?.trim() || null,
          price: dto.price !== undefined && dto.price !== null ? dto.price : null,
          sessionTimeout: normalizedValidity,
          rateLimit: dto.rateLimit ?? null,
          idleTimeout: dto.idleTimeout ?? null,
          keepaliveTimeout: dto.keepaliveTimeout ?? null,
          sharedUsers: dto.sharedUsers ?? 1,
          addressPool: dto.addressPool ?? null,
          dataLimitBytes: calculatedDataLimitBytes,
        },
      });
      return {
        ...created,
        price: created.price ? Number(created.price) : (dto.price ?? 0),
        displayName: created.displayName || dto.displayName || created.name,
        dataLimitBytes: created.dataLimitBytes ? Number(created.dataLimitBytes) : null,
        dataLimitGb: created.dataLimitBytes ? Number(created.dataLimitBytes) / (1024 * 1024 * 1024) : null,
        syncedToRouter: false,
        routerSyncStatus: 'SKIPPED_PRIVATE_LAN',
      };
    }

    if (!device.isOnline && device.status !== DeviceStatus.ONLINE) {
      throw new BadGatewayException({
        code: 'ROUTER_OFFLINE',
        message: 'تعذر إنشاء البروفايل: الراوتر غير متصل حالياً (Offline). يجب أن يكون الراوتر متصلاً لضمان إنشاء البروفايل عليه أولاً.',
      });
    }

    const deviceConfig = this.toDeviceConfig(device);
    let createdProfileRecord: any = null;

    const result = await this.executor.executeHotspotProfileCreate(
      deviceConfig,
      {
        name: dto.name,
        rateLimit: dto.rateLimit,
        sessionTimeout: normalizedValidity ?? undefined,
        idleTimeout: dto.idleTimeout,
        keepaliveTimeout: dto.keepaliveTimeout,
        sharedUsers: dto.sharedUsers ?? 1,
        addressPool: dto.addressPool,
      },
      async () => {
        createdProfileRecord = await this.prisma.hotspotProfile.create({
          data: {
            tenantId: effectiveTenantId,
            deviceId,
            name: dto.name,
            displayName: dto.displayName?.trim() || null,
            price: dto.price !== undefined && dto.price !== null ? dto.price : null,
            sessionTimeout: normalizedValidity,
            rateLimit: dto.rateLimit ?? null,
            idleTimeout: dto.idleTimeout ?? null,
            keepaliveTimeout: dto.keepaliveTimeout ?? null,
            sharedUsers: dto.sharedUsers ?? 1,
            addressPool: dto.addressPool ?? null,
            dataLimitBytes: calculatedDataLimitBytes,
          },
        });
      },
    );

    if (result.status !== OperationExecutionStatus.SUCCESS) {
      this.handleExecutorFailure(result, 'فشل إنشاء البروفايل على الراوتر');
    }

    this.logger.log(`Created and verified hotspot profile "${dto.name}" on device ${device.id}`);
    return {
      ...createdProfileRecord,
      price: createdProfileRecord.price ? Number(createdProfileRecord.price) : (dto.price ?? 0),
      displayName: createdProfileRecord.displayName || dto.displayName || createdProfileRecord.name,
      dataLimitBytes: createdProfileRecord.dataLimitBytes ? Number(createdProfileRecord.dataLimitBytes) : null,
      dataLimitGb: createdProfileRecord.dataLimitBytes ? Number(createdProfileRecord.dataLimitBytes) / (1024 * 1024 * 1024) : null,
      syncedToRouter: true,
      routerSyncStatus: 'PROVISIONED',
    };
  }

  async createTenantProfile(
    tenantId: string | undefined,
    dto: CreateProfileDto,
    currentUser?: RequestUser,
  ) {
    let deviceId = dto.deviceId;
    if (!deviceId) {
      const where: any = { deletedAt: null };
      if (tenantId) where.tenantId = tenantId;
      const firstDevice = await this.prisma.mikroTikDevice.findFirst({
        where,
      });
      if (!firstDevice) {
        throw new NotFoundException({
          code: 'DEVICE_NOT_FOUND',
          message: 'يجب إضافة راوتر ميكروتيك أولاً قبل إنشاء باقات الهوتسبوت',
        });
      }
      deviceId = firstDevice.id;
    }
    return this.createProfile(tenantId || '', deviceId, dto, currentUser);
  }

  async deleteProfile(
    tenantId: string,
    deviceId: string,
    profileId: string,
    currentUser?: RequestUser,
    syncToRouter: boolean = true,
  ) {
    const device = await this.getValidDevice(tenantId, deviceId, currentUser);

    const profile = await this.prisma.hotspotProfile.findFirst({
      where: { id: profileId, tenantId, deviceId },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: `Hotspot profile with ID ${profileId} was not found`,
      });
    }

    // If syncToRouter is enabled, enforce that the profile is actually deleted on MikroTik first!
    if (syncToRouter) {
      if (DevicesService?.isLocalOnlyPrivateLan?.(device.id)) {
        throw new BadGatewayException({
          code: 'ROUTER_LOCAL_LAN_REQUIRED',
          message: 'الراوتر متصل عبر شبكة محلية خاصة (Private LAN). يجب إتمام عملية الحذف من تطبيق الهاتف عبر الشبكة المحلية لضمان حذفه من الراوتر أولاً.',
        });
      }

      if (!device.isOnline && device.status !== DeviceStatus.ONLINE) {
        throw new BadGatewayException({
          code: 'ROUTER_OFFLINE',
          message: 'تعذر حذف البروفايل: الراوتر غير متصل حالياً. يجب أن يكون الراوتر متصلاً لحذف البروفايل منه أولاً، ولن يتم حذفه من التطبيق لضمان التطابق.',
        });
      }

      const deviceConfig = this.toDeviceConfig(device);
      const result = await this.executor.executeHotspotProfileDelete(
        deviceConfig,
        profile.name,
        async () => {
          await this.prisma.hotspotProfile.delete({
            where: { id: profileId },
          });
        },
      );

      if (result.status !== OperationExecutionStatus.SUCCESS) {
        this.handleExecutorFailure(result, `فشل حذف البروفايل "${profile.name}" من راوتر MikroTik`);
      }
    } else {
      // Only delete from DB if syncToRouter was explicitly false
      await this.prisma.hotspotProfile.delete({
        where: { id: profileId },
      });
    }

    return {
      success: true,
      message: `تم حذف البروفايل "${profile.name}" بنجاح من الراوتر وقاعدة البيانات`,
    };
  }

  async deleteTenantProfile(tenantId: string, profileId: string, syncToRouter: boolean = true) {
    const profile = await this.prisma.hotspotProfile.findFirst({
      where: { id: profileId, tenantId },
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'الباقة غير موجودة',
      });
    }
    return this.deleteProfile(tenantId, profile.deviceId, profileId, undefined, syncToRouter);
  }

  async updateTenantProfile(tenantId: string, profileId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.hotspotProfile.findFirst({
      where: { id: profileId, tenantId },
      include: { device: true },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'الباقة غير موجودة',
      });
    }

    if (!profile.device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: 'الراوتر المرتبط بهذه الباقة غير موجود',
      });
    }

    if (DevicesService?.isLocalOnlyPrivateLan?.(profile.device.id)) {
      throw new BadGatewayException({
        code: 'ROUTER_LOCAL_LAN_REQUIRED',
        message: 'الراوتر متصل عبر شبكة محلية خاصة (Private LAN) دون نفق سحابي؛ يرجى تعديل الباقة عبر تطبيق الهاتف المتصل بالشبكة المحلية لضمان تعديلها على الراوتر أولاً.',
      });
    }

    if (!profile.device.isOnline && profile.device.status !== DeviceStatus.ONLINE) {
      throw new BadGatewayException({
        code: 'ROUTER_OFFLINE',
        message: 'تعذر تعديل الباقة: الراوتر غير متصل حالياً (Offline). يجب أن يكون الراوتر متصلاً لتعديل الباقة عليه أولاً.',
      });
    }

    const effectiveValidity = dto.validity || dto.sessionTimeout;
    const normalizedValidity = effectiveValidity !== undefined ? normalizeValidityDuration(effectiveValidity) : undefined;

    let newDataLimitBytes: bigint | null | undefined = undefined;
    if (dto.dataLimitMb !== undefined) {
      if (dto.dataLimitMb === null) {
        newDataLimitBytes = null;
      } else {
        const val = Number(dto.dataLimitMb);
        if (Number.isNaN(val) || val <= 0) {
          throw new BadRequestException('حجم البيانات بالميجابايت يجب أن يكون رقماً موجباً أكبر من الصفر');
        }
        newDataLimitBytes = BigInt(Math.round(val * 1024 * 1024));
      }
    } else if (dto.dataLimitGb !== undefined) {
      if (dto.dataLimitGb === null) {
        newDataLimitBytes = null;
      } else {
        const val = Number(dto.dataLimitGb);
        if (Number.isNaN(val) || val <= 0) {
          throw new BadRequestException('حجم البيانات بالجيجابايت يجب أن يكون رقماً موجباً أكبر من الصفر');
        }
        newDataLimitBytes = BigInt(Math.round(val * 1024 * 1024 * 1024));
      }
    } else if (dto.dataLimitBytes !== undefined) {
      if (dto.dataLimitBytes === null) {
        newDataLimitBytes = null;
      } else {
        const bVal = Number(dto.dataLimitBytes);
        if (Number.isNaN(bVal) || bVal < 0) {
          throw new BadRequestException('حجم البيانات بالبايت يجب أن يكون صفراً أو رقماً موجباً');
        }
        newDataLimitBytes = bVal > 0 ? BigInt(dto.dataLimitBytes) : null;
      }
    }

    const deviceConfig = this.toDeviceConfig(profile.device);
    let updated: any = null;

    const result = await this.executor.executeHotspotProfileUpdate(
      deviceConfig,
      profile.name,
      {
        rateLimit: dto.rateLimit,
        sessionTimeout: normalizedValidity,
        sharedUsers: dto.sharedUsers,
      },
      async () => {
        updated = await this.prisma.hotspotProfile.update({
          where: { id: profileId },
          data: {
            ...(dto.name ? { name: dto.name } : {}),
            ...(dto.displayName !== undefined ? { displayName: dto.displayName?.trim() || null } : {}),
            ...(dto.price !== undefined ? { price: dto.price !== null ? dto.price : null } : {}),
            ...(dto.rateLimit !== undefined ? { rateLimit: dto.rateLimit } : {}),
            ...(normalizedValidity !== undefined ? { sessionTimeout: normalizedValidity } : {}),
            ...(dto.sharedUsers !== undefined ? { sharedUsers: dto.sharedUsers } : {}),
            ...(dto.addressPool !== undefined ? { addressPool: dto.addressPool } : {}),
            ...(newDataLimitBytes !== undefined ? { dataLimitBytes: newDataLimitBytes } : {}),
          },
        });

        if (newDataLimitBytes !== undefined) {
          await this.prisma.card.updateMany({
            where: { profileId, status: 'AVAILABLE' },
            data: { dataLimitBytes: newDataLimitBytes },
          });
          await this.prisma.cardBatch.updateMany({
            where: { profileId },
            data: { dataLimitBytes: newDataLimitBytes },
          });
        }
      },
    );

    if (result.status !== OperationExecutionStatus.SUCCESS) {
      this.handleExecutorFailure(result, 'فشل تعديل البروفايل على الراوتر');
    }

    if (newDataLimitBytes !== undefined) {
      try {
        const client = await this.mikrotikClientFactory.getClient(deviceConfig);
        const availableCards = await this.prisma.card.findMany({
          where: { profileId, status: 'AVAILABLE' },
          select: { username: true },
          take: 200,
        });

        for (const card of availableCards) {
          try {
            await client.updateHotspotUser(card.username, {
              limitBytesTotal: newDataLimitBytes ? Number(newDataLimitBytes) : 0,
            });
          } catch {
            // Ignore if card not present on router
          }
        }
      } catch (syncErr) {
        this.logger.warn(`Could not sync updated card limits to router: ${syncErr}`);
      }
    }

    return {
      ...updated,
      price: updated.price ? Number(updated.price) : 0,
      displayName: updated.displayName || updated.name,
      dataLimitBytes: updated.dataLimitBytes ? Number(updated.dataLimitBytes) : null,
      dataLimitGb: updated.dataLimitBytes ? Number(updated.dataLimitBytes) / (1024 * 1024 * 1024) : null,
    };
  }

  async listActiveSessions(
    tenantId: string,
    deviceId: string,
    currentUser?: RequestUser,
  ): Promise<HotspotActiveSessionItem[]> {
    const device = await this.getValidDevice(tenantId, deviceId, currentUser);

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

    return client.listActiveSessions();
  }

  async kickSession(
    tenantId: string,
    deviceId: string,
    sessionId: string,
    username?: string,
    ipAddress?: string,
    userId?: string,
    currentUser?: RequestUser,
  ) {
    const device = await this.getValidDevice(tenantId, deviceId, currentUser);
    const deviceConfig = this.toDeviceConfig(device);

    const result = await this.executor.executeActiveSessionRemove(
      deviceConfig,
      { id: sessionId, user: username },
      async () => {
        // Record administrative action in AuditLog
        try {
          await this.prisma.auditLog.create({
            data: {
              tenantId,
              userId: userId ?? null,
              action: 'KICK_HOTSPOT_SESSION',
              entity: 'HotspotActiveSession',
              entityId: sessionId,
              newValues: {
                deviceId: device.id,
                deviceName: device.name,
                username: username ?? sessionId,
                ipAddress: ipAddress ?? null,
                timestamp: new Date().toISOString(),
              },
            },
          });
        } catch (_) {}

        // Remove active session cache record if present
        try {
          await (this.prisma as any).hotspotActiveSession?.deleteMany?.({
            where: { deviceId: device.id, sessionId },
          });
        } catch (_) {}
      },
    );

    if (result.status !== OperationExecutionStatus.SUCCESS) {
      this.handleExecutorFailure(result, 'فشل فصل الجلسة على راوتر MikroTik');
    }

    return {
      success: true,
      message: `تم فصل المستخدم "${username || sessionId}" بنجاح من راوتر ${device.name}`,
    };
  }

  async listAllActiveSessions(
    tenantId?: string | null,
    deviceId?: string,
    search?: string,
    currentUser?: RequestUser,
  ): Promise<HotspotActiveSessionsResponseDto> {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (first) resolvedTenantId = first.id;
    }

    if (!resolvedTenantId) {
      return {
        data: [],
        total: 0,
        meta: {
          lastUpdated: new Date().toISOString(),
          routers: [],
        },
      };
    }

    const deviceWhere: Prisma.MikroTikDeviceWhereInput = {
      tenantId: resolvedTenantId,
      deletedAt: null,
    };
    if (deviceId) {
      // Assert user access for specific device
      await this.getValidDevice(resolvedTenantId, deviceId, currentUser);
      deviceWhere.id = deviceId;
    } else if (
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
      if (assignedIds.length === 0) {
        return {
          data: [],
          total: 0,
          meta: {
            lastUpdated: new Date().toISOString(),
            routers: [],
          },
        };
      }
      deviceWhere.id = { in: assignedIds };
    }

    const devices = await this.prisma.mikroTikDevice.findMany({
      where: deviceWhere,
    });

    const routerStatuses: Record<string, RouterConnectionStatusDto> = {};
    const rawDeviceSessions: {
      device: (typeof devices)[0];
      client?: any;
      session: HotspotActiveSessionItem;
      routerUser?: HotspotUserItem;
    }[] = [];
    const allUsernames = new Set<string>();

    for (const device of devices) {
      const isPrivateLan =
        device.host === 'localhost' ||
        /^(127\.|192\.168\.|10\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1|fc|fd)/.test(
          device.host.trim().toLowerCase(),
        );
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

        const sessions = await client.listActiveSessions();
        const now = new Date();
        routerStatuses[device.id] = {
          id: device.id,
          name: device.name,
          status: 'online',
        };
        DevicesService.updateChannelState(device.id, {
          cloudStatus: 'ONLINE',
          cloudCheckedAt: now,
          lastVerifiedSource:
            device.rosVersion === 'V7' && (device.restPort === 80 || device.restPort === 443)
              ? 'CLOUD_REST'
              : 'CLOUD_API',
          lastVerifiedAt: now,
          activeHotspotSessions: sessions.length,
        });
        if (typeof this.prisma.mikroTikDevice?.update === 'function') {
          await this.prisma.mikroTikDevice
            .update({
              where: { id: device.id },
              data: {
                isOnline: true,
                status: DeviceStatus.ONLINE,
                lastSyncAt: now,
                lastError: null,
              },
            })
            .catch(() => {});
        }

        // Query router users to access cumulative closed-session counters (bytes-in/out)
        let routerUsers: HotspotUserItem[] = [];
        if (sessions.length > 0 && typeof client.listHotspotUsers === 'function') {
          try {
            routerUsers = await client.listHotspotUsers();
          } catch (uErr: any) {
            this.logger.debug(
              `Could not fetch hotspot users from router ${device.id}: ${uErr instanceof Error ? uErr.message : String(uErr)}`,
            );
          }
        }
        const userMap = new Map<string, HotspotUserItem>();
        for (const u of routerUsers) {
          if (u.name) userMap.set(u.name, u);
        }

        for (const s of sessions) {
          const routerUser = userMap.get(s.user);
          rawDeviceSessions.push({ device, client, session: s, routerUser });
          if (s.user) {
            allUsernames.add(s.user);
          }
        }
      } catch (err: any) {
        await this.mikrotikClientFactory?.invalidateClient?.(device.id);
        const errMessage = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not poll live sessions from device ${device.id} (${device.name}): ${errMessage}`);
        const now = new Date();
        if (isPrivateLan) {
          DevicesService.updateChannelState(device.id, {
            cloudStatus: 'UNREACHABLE_PRIVATE_LAN',
            cloudCheckedAt: now,
          });
        } else {
          DevicesService.updateChannelState(device.id, {
            cloudStatus: 'ERROR',
            cloudCheckedAt: now,
          });
          if (typeof this.prisma.mikroTikDevice?.update === 'function') {
            await this.prisma.mikroTikDevice
              .update({
                where: { id: device.id },
                data: {
                  isOnline: false,
                  status: DeviceStatus.ERROR,
                  lastError: errMessage,
                },
              })
              .catch(() => {});
          }
        }
        routerStatuses[device.id] = {
          id: device.id,
          name: device.name,
          status: 'unreachable',
          error: errMessage,
        };
      }
    }

    // Batch query linked cards and profiles in DB for this tenant
    const usernamesList = Array.from(allUsernames);
    const [cards, tenantProfiles] = await Promise.all([
      usernamesList.length > 0
        ? this.prisma.card.findMany({
            where: {
              tenantId: resolvedTenantId,
              username: { in: usernamesList },
            },
            include: {
              profile: true,
              batch: true,
            },
          })
        : [],
      this.prisma.hotspotProfile.findMany({
        where: { tenantId: resolvedTenantId },
      }),
    ]);

    const cardMap = new Map<string, (typeof cards)[0]>();
    for (const card of cards) {
      cardMap.set(card.username, card);
    }

    const profileMapByName = new Map<string, (typeof tenantProfiles)[0]>();
    for (const p of tenantProfiles) {
      profileMapByName.set(p.name, p);
    }

    const results: EnrichedHotspotSessionDto[] = [];
    const nowIso = new Date().toISOString();

    for (const { device, client, session: s, routerUser } of rawDeviceSessions) {
      const card = cardMap.get(s.user);
      const matchedProfile =
        card?.profile ||
        profileMapByName.get(card?.profile?.name || '') ||
        profileMapByName.get('default');

      const profileName = card?.profile?.name || matchedProfile?.name || 'default';
      const rawRateLimit = card?.profile?.rateLimit || matchedProfile?.rateLimit || null;
      const parsedRates = parseRateLimit(rawRateLimit);

      const consumption = calculateConsumptionAndQuota({
        sessionBytesIn: s.bytesIn,
        sessionBytesOut: s.bytesOut,
        cumulativeUserBytesIn: routerUser?.bytesIn ?? null,
        cumulativeUserBytesOut: routerUser?.bytesOut ?? null,
        cardDataLimitBytes: card?.dataLimitBytes ?? null,
        profileDataLimitBytes: matchedProfile?.dataLimitBytes ?? null,
        routerLimitBytesTotal: s.limitBytesTotal ?? routerUser?.limitBytesTotal ?? null,
        hasKnownPlanOrProfile: Boolean(card || matchedProfile),
      });

      const validity = calculateValidityAndTime({
        uptimeStr: s.uptime,
        sessionTimeLeftStr: s.sessionTimeLeft,
        cardActivatedAt: card?.activatedAt,
        cardExpiresAt: card?.expiresAt,
        cardTimeLimit: card?.timeLimit,
        profileSessionTimeout: matchedProfile?.sessionTimeout,
        validityDays: card?.validityDays,
      });

      // 1. If card was not activated yet and is now running an active session, record first login & expiration
      if (card && !card.activatedAt) {
        const activatedAt = new Date();
        const updateData: any = {
          activatedAt,
          status: 'ACTIVE',
        };
        if (card.validityDays && !card.expiresAt) {
          updateData.expiresAt = new Date(activatedAt.getTime() + card.validityDays * 86400 * 1000);
          card.expiresAt = updateData.expiresAt;
        }
        card.activatedAt = activatedAt;
        card.status = 'ACTIVE' as any;
        if (typeof (this.prisma.card as any)?.update === 'function') {
          this.prisma.card
            .update({
              where: { id: card.id },
              data: updateData,
            })
            .catch((err) => this.logger.debug(`Could not update card activation: ${err.message}`));
        }
      }

      // 2. If card is expired or validity.isExpired, kick session and disable user on router
      if (card && ((card.expiresAt && card.expiresAt.getTime() <= Date.now()) || validity.isExpired)) {
        if (client) {
          if (typeof client.removeActiveSession === 'function') {
            client.removeActiveSession(s.id || s.sessionId).catch(() => {});
          }
          if (typeof client.disableHotspotUser === 'function') {
            client.disableHotspotUser(card.username).catch(() => {});
          }
        }
        if (card.status !== ('EXPIRED' as any)) {
          if (typeof (this.prisma.card as any)?.update === 'function') {
            this.prisma.card
              .update({
                where: { id: card.id },
                data: { status: 'EXPIRED' },
              })
              .catch(() => {});
          }
        }
      }

      results.push({
        id: s.id || s.sessionId || `${device.id}_${s.user}`,
        user: s.user || 'مستخدم',
        address: s.address || '',
        macAddress: s.macAddress || '',
        uptime: validity.sessionUptime,
        uptimeSeconds: validity.sessionUptimeSeconds,
        bytesIn: s.bytesIn || 0,
        bytesOut: s.bytesOut || 0,
        sessionId: s.sessionId,
        server: s.server,
        loginBy: s.loginBy,

        deviceId: device.id,
        deviceName: device.name,
        routerStatus: 'online',

        profileName,
        rateLimit: rawRateLimit,
        downloadSpeedLimit: parsedRates.downloadSpeedLimit,
        uploadSpeedLimit: parsedRates.uploadSpeedLimit,
        downloadSpeedLimitBps: parsedRates.downloadSpeedLimitBps,
        uploadSpeedLimitBps: parsedRates.uploadSpeedLimitBps,
        isUnlimitedSpeed: parsedRates.isUnlimitedSpeed,

        totalQuotaBytes: consumption.totalQuotaBytes,
        consumedBytes: consumption.consumedBytes,
        remainingBytes: consumption.remainingBytes,
        consumptionPercentage: consumption.consumptionPercentage,
        isUnlimitedQuota: consumption.isUnlimitedQuota,
        isQuotaExhausted: consumption.isQuotaExhausted,
        isUnknownQuota: consumption.isUnknownQuota,

        timeLimit: validity.timeLimit,
        sessionTimeLeft: validity.sessionTimeLeft,
        remainingTimeSeconds: validity.remainingTimeSeconds,
        expiresAt: validity.expiresAt,
        isUnlimitedTime: validity.isUnlimitedTime,
        isExpired: validity.isExpired,

        connectionStatus: 'connected',
        lastSeen: nowIso,
      });
    }

    // Apply filtering if search parameter provided
    let filtered = results;
    if (search && search.trim().length > 0) {
      const query = search.trim().toLowerCase();
      const cleanMacQuery = query.replace(/[:-]/g, '');
      filtered = results.filter((s) => {
        const userMatch = s.user.toLowerCase().includes(query);
        const ipMatch = s.address.toLowerCase().includes(query);
        const profileMatch = s.profileName.toLowerCase().includes(query);
        const macRaw = s.macAddress.toLowerCase();
        const cleanMacRaw = macRaw.replace(/[:-]/g, '');
        const macMatch =
          macRaw.includes(query) || (cleanMacQuery.length > 2 && cleanMacRaw.includes(cleanMacQuery));
        return userMatch || ipMatch || macMatch || profileMatch;
      });
    }

    return {
      data: filtered,
      total: filtered.length,
      meta: {
        lastUpdated: nowIso,
        routers: Object.values(routerStatuses),
      },
    };
  }

  async kickTenantSession(
    tenantId?: string | null,
    sessionId?: string,
    deviceId?: string,
    username?: string,
    ipAddress?: string,
    userId?: string,
  ) {
    if (!sessionId) {
      throw new NotFoundException({
        code: 'SESSION_ID_REQUIRED',
        message: 'معرف الجلسة مطلوب لإجراء عملية الفصل',
      });
    }

    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (first) resolvedTenantId = first.id;
    }

    if (!resolvedTenantId) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'المستأجر غير موجود',
      });
    }

    if (deviceId) {
      return this.kickSession(resolvedTenantId, deviceId, sessionId, username, ipAddress, userId);
    }

    const devices = await this.prisma.mikroTikDevice.findMany({
      where: { tenantId: resolvedTenantId, deletedAt: null },
    });

    for (const device of devices) {
      try {
        const res = await this.kickSession(resolvedTenantId, device.id, sessionId, username, ipAddress, userId);
        return res;
      } catch (_) {}
    }

    throw new NotFoundException({
      code: 'SESSION_NOT_FOUND',
      message: `لم يتم العثور على جلسة نشطة للمستخدم على أجهزة الراوتر المتاحة`,
    });
  }
}
