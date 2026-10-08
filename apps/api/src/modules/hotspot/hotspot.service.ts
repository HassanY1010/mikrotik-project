import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { HotspotActiveSessionItem } from '../../core/mikrotik/interfaces/mikrotik-client.interface';

@Injectable()
export class HotspotService {
  private readonly logger = new Logger(HotspotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
  ) {}

  private async getValidDevice(tenantId: string, deviceId: string) {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id: deviceId, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${deviceId} was not found for this tenant`,
      });
    }

    return device;
  }

  async listProfiles(tenantId: string, deviceId: string) {
    await this.getValidDevice(tenantId, deviceId);

    return this.prisma.hotspotProfile.findMany({
      where: { tenantId, deviceId },
      orderBy: { name: 'asc' },
    });
  }

  async listAllProfiles(tenantId: string) {
    const profiles = await this.prisma.hotspotProfile.findMany({
      where: { tenantId },
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
      const validity =
        p.sessionTimeout ||
        (p.cardBatches[0]?.validityDays ? `${p.cardBatches[0].validityDays}d` : '1d');
      let displayName = p.name;
      const lower = p.name.toLowerCase();
      if (lower === '1hour-unlimited') displayName = 'باقة 1 ساعة (إنترنت مفتوح)';
      else if (lower === '3hours-unlimited') displayName = 'باقة 3 ساعات (إنترنت مفتوح)';
      else if (lower === '1day-unlimited') displayName = 'باقة 1 يوم (إنترنت مفتوح)';
      else if (lower === '1week-unlimited') displayName = 'باقة 1 أسبوع (إنترنت مفتوح)';
      else if (lower === '1month-unlimited') displayName = 'باقة 1 شهر (إنترنت مفتوح)';
      else if (lower.includes('-unlimited')) {
        displayName = p.name.replace(/-unlimited/gi, ' (إنترنت مفتوح)');
      }

      return {
        id: p.id,
        name: p.name,
        displayName,
        price,
        validity,
        rateLimit: p.rateLimit || '2M/5M',
        sharedUsers: p.sharedUsers,
        deviceId: p.deviceId,
        device: p.device,
        availableCards: p._count.cards,
      };
    });
  }

  async syncProfiles(tenantId: string, deviceId: string) {
    const device = await this.getValidDevice(tenantId, deviceId);

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
      synced.push(profile);
    }

    return synced;
  }

  async createProfile(tenantId: string, deviceId: string, dto: CreateProfileDto) {
    const device = await this.getValidDevice(tenantId, deviceId);

    const existing = await this.prisma.hotspotProfile.findFirst({
      where: { tenantId, deviceId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException({
        code: 'PROFILE_EXISTS',
        message: `A hotspot profile with name "${dto.name}" already exists on this router`,
      });
    }

    // Provision on MikroTik router (if reachable)
    let routerProvisioned = false;
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
        sessionTimeout: dto.validity || dto.sessionTimeout,
        idleTimeout: dto.idleTimeout,
        keepaliveTimeout: dto.keepaliveTimeout,
        sharedUsers: dto.sharedUsers ?? 1,
        addressPool: dto.addressPool,
      });
      routerProvisioned = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Could not provision profile "${dto.name}" on physical router (${device.host}): ${msg}. Profile will still be saved in database.`,
      );
    }

    // Save in DB
    const profile = await this.prisma.hotspotProfile.create({
      data: {
        tenantId,
        deviceId,
        name: dto.name,
        sessionTimeout: dto.validity || dto.sessionTimeout || null,
        rateLimit: dto.rateLimit ?? null,
        idleTimeout: dto.idleTimeout ?? null,
        keepaliveTimeout: dto.keepaliveTimeout ?? null,
        sharedUsers: dto.sharedUsers ?? 1,
        addressPool: dto.addressPool ?? null,
      },
    });

    this.logger.log(`Created hotspot profile "${profile.name}" on device ${device.id} (synced: ${routerProvisioned})`);
    return profile;
  }

  async createTenantProfile(tenantId: string, dto: CreateProfileDto) {
    let deviceId = dto.deviceId;
    if (!deviceId) {
      const firstDevice = await this.prisma.mikroTikDevice.findFirst({
        where: { tenantId, deletedAt: null },
      });
      if (!firstDevice) {
        throw new NotFoundException({
          code: 'DEVICE_NOT_FOUND',
          message: 'يجب إضافة راوتر ميكروتيك أولاً قبل إنشاء باقات الهوتسبوت',
        });
      }
      deviceId = firstDevice.id;
    }
    return this.createProfile(tenantId, deviceId, dto);
  }

  async deleteProfile(tenantId: string, deviceId: string, profileId: string) {
    const device = await this.getValidDevice(tenantId, deviceId);

    const profile = await this.prisma.hotspotProfile.findFirst({
      where: { id: profileId, tenantId, deviceId },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: `Hotspot profile with ID ${profileId} was not found`,
      });
    }

    // Remove from MikroTik
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

    if (profile.device) {
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
          sessionTimeout: dto.validity || dto.sessionTimeout,
          sharedUsers: dto.sharedUsers,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not update profile on physical router: ${msg}`);
      }
    }

    const updated = await this.prisma.hotspotProfile.update({
      where: { id: profileId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.rateLimit !== undefined ? { rateLimit: dto.rateLimit } : {}),
        ...(dto.validity || dto.sessionTimeout
          ? { sessionTimeout: dto.validity || dto.sessionTimeout }
          : {}),
        ...(dto.sharedUsers !== undefined ? { sharedUsers: dto.sharedUsers } : {}),
        ...(dto.addressPool !== undefined ? { addressPool: dto.addressPool } : {}),
      },
    });

    return updated;
  }

  async listActiveSessions(
    tenantId: string,
    deviceId: string,
  ): Promise<HotspotActiveSessionItem[]> {
    const device = await this.getValidDevice(tenantId, deviceId);

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

  async kickSession(tenantId: string, deviceId: string, sessionId: string) {
    const device = await this.getValidDevice(tenantId, deviceId);

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

    await client.removeActiveSession(sessionId);
    return { success: true, message: `Hotspot session "${sessionId}" disconnected` };
  }
}
