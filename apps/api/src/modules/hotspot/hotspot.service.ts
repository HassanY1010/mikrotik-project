import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { HotspotActiveSessionItem } from '../../core/mikrotik/interfaces/mikrotik-client.interface';
import {
  formatValidityDurationArabic,
  normalizeValidityDuration,
} from '../../common/utils/validity-duration.util';
import { RoleName } from '@mikrotik-saas/shared-types';
import type { RequestUser } from '../../core/decorators/current-user.decorator';

@Injectable()
export class HotspotService {
  private readonly logger = new Logger(HotspotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
  ) {}

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
      const price = p.cardBatches[0]?.price ? Number(p.cardBatches[0].price) : 500;
      const rawVal =
        p.sessionTimeout ||
        (p.cardBatches[0]?.validityDays ? `${p.cardBatches[0].validityDays}d` : null);
      const validity = rawVal ? normalizeValidityDuration(rawVal) : null;
      let displayName = p.name;
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

  async syncProfiles(tenantId: string, deviceId: string, currentUser?: RequestUser) {
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

    const routerProfiles = await client.listHotspotProfiles();
    this.logger.log(`Fetched ${routerProfiles.length} profiles from router ${device.host}`);

    const synced = [];
    for (const rp of routerProfiles) {
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

    // Provision on MikroTik router (only if router is online to prevent freezing HTTP request)
    let routerProvisioned = false;
    if (device.isOnline) {
      const connectionType = device.rosVersion === 'V7' && device.restPort ? 'REST' : 'API';
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

        await client.createHotspotProfile({
          name: dto.name,
          rateLimit: dto.rateLimit,
          sessionTimeout: normalizedValidity ?? undefined,
          idleTimeout: dto.idleTimeout,
          keepaliveTimeout: dto.keepaliveTimeout,
          sharedUsers: dto.sharedUsers ?? 1,
          addressPool: dto.addressPool,
        });
        routerProvisioned = true;
      } catch (err: unknown) {
        const rawErrMsg = err instanceof Error ? err.message : String(err);
        const sanitizedErrMsg = rawErrMsg.replace(/password=\S+/gi, 'password=***');

        // Detailed technical logging according to Section 5 without leaking secrets
        this.logger.error({
          operation: 'CREATE_HOTSPOT_PROFILE',
          stage: 'ROUTEROS_PROVISIONING',
          routerId: device.id,
          routerHost: device.host,
          rosVersion: device.rosVersion,
          connectionType,
          routerPath: '/ip/hotspot/user/profile',
          safePayload: {
            name: dto.name,
            rateLimit: dto.rateLimit ?? null,
            sessionTimeout: normalizedValidity,
            sharedUsers: dto.sharedUsers ?? 1,
          },
          originalError: sanitizedErrMsg,
        });

        let userMessage = 'فشل إنشاء البروفايل على الراوتر';
        if (/permission|not enough permissions|action not permitted|read-only/i.test(rawErrMsg)) {
          userMessage = 'فشل إنشاء البروفايل: حساب الاتصال بالراوتر لا يمتلك صلاحيات الكتابة';
        } else if (/timeout|timed out|ETIMEDOUT/i.test(rawErrMsg)) {
          userMessage = 'فشل إنشاء البروفايل: انتهت مهلة الاتصال بالراوتر (Timeout)';
        } else if (/ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(rawErrMsg)) {
          userMessage = 'فشل إنشاء البروفايل: تعذر الاتصال بعنوان الراوتر';
        } else if (/already have profile/i.test(rawErrMsg)) {
          userMessage = `فشل إنشاء البروفايل: يوجد بروفايل بنفس الاسم (${dto.name}) على الراوتر`;
        } else if (/invalid/i.test(rawErrMsg)) {
          userMessage = `فشل إنشاء البروفايل على الراوتر: قيمة غير صالحة (${sanitizedErrMsg})`;
        } else {
          userMessage = `فشل إنشاء البروفايل على الراوتر: ${sanitizedErrMsg}`;
        }

        throw new BadGatewayException({
          code: 'ROUTER_PROVISIONING_FAILED',
          message: userMessage,
          details: {
            routerId: device.id,
            routerName: device.name,
            connectionType,
            stage: 'ROUTEROS_PROVISIONING',
            originalError: sanitizedErrMsg,
          },
        });
      }
    } else {
      this.logger.log(
        `Router "${device.name}" (${device.host}) is currently offline. Profile "${dto.name}" saved in database; sync will occur once router connects.`,
      );
    }

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

    // Save in DB
    const profile = await this.prisma.hotspotProfile.create({
      data: {
        tenantId: effectiveTenantId,
        deviceId,
        name: dto.name,
        sessionTimeout: normalizedValidity,
        rateLimit: dto.rateLimit ?? null,
        idleTimeout: dto.idleTimeout ?? null,
        keepaliveTimeout: dto.keepaliveTimeout ?? null,
        sharedUsers: dto.sharedUsers ?? 1,
        addressPool: dto.addressPool ?? null,
        dataLimitBytes: calculatedDataLimitBytes,
      },
    });

    this.logger.log(`Created hotspot profile "${profile.name}" on device ${device.id} (synced: ${routerProvisioned})`);
    return {
      ...profile,
      dataLimitBytes: profile.dataLimitBytes ? Number(profile.dataLimitBytes) : null,
      dataLimitGb: profile.dataLimitBytes ? Number(profile.dataLimitBytes) / (1024 * 1024 * 1024) : null,
    };
  }

  async createTenantProfile(tenantId: string | undefined, dto: CreateProfileDto) {
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
    return this.createProfile(tenantId || '', deviceId, dto);
  }

  async deleteProfile(
    tenantId: string,
    deviceId: string,
    profileId: string,
    currentUser?: RequestUser,
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

    // Remove from MikroTik (only if router is online)
    if (device.isOnline) {
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

        await client.deleteHotspotProfile(profile.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not delete profile on physical router: ${msg}`);
        // If deleted on router already or router unreachable, still allow removing from DB
      }
    }

    await this.prisma.hotspotProfile.delete({
      where: { id: profileId },
    });

    return { success: true, message: `Profile "${profile.name}" removed successfully` };
  }

  async deleteTenantProfile(tenantId: string, profileId: string) {
    const profile = await this.prisma.hotspotProfile.findFirst({
      where: { id: profileId, tenantId },
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'الباقة غير موجودة',
      });
    }
    return this.deleteProfile(tenantId, profile.deviceId, profileId);
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

    const effectiveValidity = dto.validity || dto.sessionTimeout;
    const normalizedValidity = effectiveValidity !== undefined ? normalizeValidityDuration(effectiveValidity) : undefined;

    if (profile.device && profile.device.isOnline) {
      try {
        const client = await this.mikrotikClientFactory.getClient({
          id: profile.device.id,
          name: profile.device.name,
          host: profile.device.host,
          apiPort: profile.device.apiPort,
          restPort: profile.device.restPort,
          useSsl: profile.device.useSsl,
          username: profile.device.username,
          passwordEncrypted: profile.device.passwordEncrypted,
          iv: profile.device.iv,
          authTag: profile.device.authTag,
          rosVersion: profile.device.rosVersion,
        });

        await client.updateHotspotProfile(profile.name, {
          rateLimit: dto.rateLimit,
          sessionTimeout: normalizedValidity,
          sharedUsers: dto.sharedUsers,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not update profile on physical router: ${msg}`);
      }
    }

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

    const updated = await this.prisma.hotspotProfile.update({
      where: { id: profileId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
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

      if (profile.device && profile.device.isOnline) {
        try {
          const client = await this.mikrotikClientFactory.getClient({
            id: profile.device.id,
            name: profile.device.name,
            host: profile.device.host,
            apiPort: profile.device.apiPort,
            restPort: profile.device.restPort,
            useSsl: profile.device.useSsl,
            username: profile.device.username,
            passwordEncrypted: profile.device.passwordEncrypted,
            iv: profile.device.iv,
            authTag: profile.device.authTag,
            rosVersion: profile.device.rosVersion,
          });

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
        } catch (err) {
          this.logger.warn(`Could not sync updated card limits to router: ${err}`);
        }
      }
    }

    return {
      ...updated,
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

    try {
      await client.removeActiveSession(sessionId);
    } catch (err) {
      // If session not found, check if it's already terminated
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.toLowerCase().includes('no such') || msg.toLowerCase().includes('not found')) {
        return {
          success: true,
          message: `المستخدم ${username || sessionId} غير متصل حالياً أو تم فصله بالفعل`,
          alreadyDisconnected: true,
        };
      }
      throw err;
    }

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
  ): Promise<{ data: (HotspotActiveSessionItem & { deviceId: string; deviceName: string })[]; total: number }> {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (first) resolvedTenantId = first.id;
    }

    if (!resolvedTenantId) {
      return { data: [], total: 0 };
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
        return { data: [], total: 0 };
      }
      deviceWhere.id = { in: assignedIds };
    }

    const devices = await this.prisma.mikroTikDevice.findMany({
      where: deviceWhere,
    });

    const results: (HotspotActiveSessionItem & { deviceId: string; deviceName: string })[] = [];

    for (const device of devices) {
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
        for (const s of sessions) {
          results.push({
            ...s,
            deviceId: device.id,
            deviceName: device.name,
          });
        }
      } catch (err) {
        this.logger.debug(`Could not poll live sessions from device ${device.id} (${device.name}): ${err}`);
      }
    }

    // Apply filtering if search parameter provided
    let filtered = results;
    if (search && search.trim().length > 0) {
      const query = search.trim().toLowerCase();
      const cleanMacQuery = query.replace(/[:-]/g, '');
      filtered = results.filter((s) => {
        const userMatch = s.user.toLowerCase().includes(query);
        const ipMatch = s.address.toLowerCase().includes(query);
        const macRaw = s.macAddress.toLowerCase();
        const cleanMacRaw = macRaw.replace(/[:-]/g, '');
        const macMatch = macRaw.includes(query) || (cleanMacQuery.length > 2 && cleanMacRaw.includes(cleanMacQuery));
        return userMatch || ipMatch || macMatch;
      });
    }

    return { data: filtered, total: filtered.length };
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
