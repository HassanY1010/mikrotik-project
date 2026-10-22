import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { CardCodeGeneratorService } from './card-code-generator.service';
import { CreateBatchDto } from '../dto/create-batch.dto';
import { UpdateCardStatusDto } from '../dto/update-card-status.dto';
import { BulkDeleteCardsDto } from '../dto/bulk-delete-cards.dto';
import { CardStatus, CardBatchStatus, SyncStatus, PrintJobStatus, Prisma } from '@prisma/client';
import { QuotasService } from './quotas.service';
import { normalizeValidityDuration } from '../../../common/utils/validity-duration.util';
import { RoleName } from '@mikrotik-saas/shared-types';

export interface BulkDeleteResult {
  success: boolean;
  deletedCount: number;
  pendingCount: number;
  skippedCount: number;
  failedCount: number;
  mikrotikRemovedCount: number;
  mikrotikPendingCount: number;
  details: {
    deletedIds: string[];
    pendingIds: string[];
    skipped: Array<{ id: string; username: string; reason: string }>;
    failed: Array<{ id: string; reason: string }>;
  };
  message: string;
}

export interface CardBatchSummary {
  id: string;
  tenantId: string;
  deviceId: string;
  deviceName: string;
  profileId: string;
  profileName: string;
  batchNumber: string;
  totalCards: number;
  availableCards: number;
  soldCards: number;
  activeCards: number;
  disabledCards: number;
  expiredCards: number;
  price: number;
  status: CardBatchStatus;
  createdAt: Date;
}

export interface CardItemResponse {
  id: string;
  batchId: string;
  serialNumber: string;
  username: string;
  pinCode: string | null;
  price: number;
  status: CardStatus;
  validityDays: number | null;
  timeLimit: string | null;
  dataLimitBytes: number | null;
  syncStatus: SyncStatus;
  soldAt: Date | null;
  activatedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  // Legal status transitions mapping
  private readonly LEGAL_TRANSITIONS: Record<CardStatus, CardStatus[]> = {
    [CardStatus.GENERATED]: [CardStatus.AVAILABLE, CardStatus.DISABLED],
    [CardStatus.AVAILABLE]: [CardStatus.SOLD, CardStatus.DISABLED],
    [CardStatus.SOLD]: [CardStatus.ACTIVE, CardStatus.DISABLED],
    [CardStatus.ACTIVE]: [CardStatus.EXPIRED, CardStatus.DISABLED],
    [CardStatus.EXPIRED]: [],
    [CardStatus.DISABLED]: [CardStatus.AVAILABLE, CardStatus.ACTIVE],
  };

  // Concurrency guard sets
  private readonly activeCardLocks = new Set<string>();
  private readonly activeRetryTenantLocks = new Set<string>();

  /**
   * Strictly differentiates true RouterOS 404 / 'no such item' from network,
   * authentication, permission, and timeout errors.
   */
  isHotspotUserNotFoundError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();

    // 1. Exclude all connectivity, network, and transport errors
    if (
      lower.includes('enotfound') ||
      lower.includes('ehostunreach') ||
      lower.includes('etimedout') ||
      lower.includes('econnrefused') ||
      lower.includes('econnreset') ||
      lower.includes('timeout') ||
      lower.includes('aborted') ||
      lower.includes('network') ||
      lower.includes('socket closed') ||
      lower.includes('connection failed')
    ) {
      return false;
    }

    // 2. Exclude authentication and authorization / permission errors
    if (
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('unauthorized') ||
      lower.includes('forbidden') ||
      lower.includes('bad login') ||
      lower.includes('authentication failed') ||
      lower.includes('not enough permissions') ||
      lower.includes('permission denied')
    ) {
      return false;
    }

    // 3. Exclude proxy, web server, and generic routing errors
    if (
      lower.includes('<!doctype') ||
      lower.includes('<html') ||
      lower.includes('nginx') ||
      lower.includes('apache') ||
      lower.includes('caddy') ||
      lower.includes('cannot get') ||
      lower.includes('cannot post') ||
      lower.includes('cannot delete') ||
      lower.includes('route not found') ||
      lower.includes('not implemented')
    ) {
      return false;
    }

    // 4. True HotSpot user absence indicators:
    // - In RouterOS API: trap with 'no such item' or 'does not exist'
    // - In RouterOS REST: 404 specifically targeting '/ip/hotspot/user' with RouterOS JSON payload or 'no such item'
    const isNoSuchItem = lower.includes('no such item') || lower.includes('does not exist');
    const isSpecificHotspotRest404 =
      lower.includes('404') &&
      (lower.includes('/ip/hotspot/user') || lower.includes('no such item') || lower.includes('detail'));

    return isNoSuchItem || isSpecificHotspotRest404;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
    private readonly codeGenerator: CardCodeGeneratorService,
    private readonly quotasService: QuotasService,
  ) {}

  async createBatch(tenantId?: string | null, userId?: string | null, dto?: CreateBatchDto) {
    if (!dto) {
      throw new BadRequestException('Batch creation payload is required');
    }

    // 1. Resolve tenantId strictly without cross-tenant leak
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId && dto.profileId) {
      const p = await this.prisma.hotspotProfile.findFirst({
        where: { id: dto.profileId },
        select: { tenantId: true },
      });
      if (p) {
        resolvedTenantId = p.tenantId;
      }
    }

    if (!resolvedTenantId) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'تعذر تحديد هوية المنظمة/الشبكة لتوليد الدفعة',
      });
    }

    // Resolve userId if not provided
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const u = await this.prisma.user.findFirst({
        where: { tenantId: resolvedTenantId, deletedAt: null },
      });
      effectiveUserId = u?.id ?? 'system';
    }

    // 2. Resolve deviceId: if not provided, look up from profile or tenant's active device
    let effectiveDeviceId = dto.deviceId;
    if (!effectiveDeviceId) {
      const p = await this.prisma.hotspotProfile.findFirst({
        where: { id: dto.profileId, tenantId: resolvedTenantId },
      });
      if (p) {
        effectiveDeviceId = p.deviceId;
      }
    }

    if (!effectiveDeviceId) {
      const firstDevice = await this.prisma.mikroTikDevice.findFirst({
        where: { tenantId: resolvedTenantId, deletedAt: null },
      });
      if (!firstDevice) {
        throw new NotFoundException({
          code: 'DEVICE_NOT_FOUND',
          message: 'يجب إضافة راوتر ميكروتيك أولاً قبل توليد الكروت',
        });
      }
      effectiveDeviceId = firstDevice.id;
    }

    // 3. Verify device and profile in parallel
    const [device, profile] = await Promise.all([
      this.prisma.mikroTikDevice.findFirst({
        where: { id: effectiveDeviceId, tenantId: resolvedTenantId, deletedAt: null },
      }),
      this.prisma.hotspotProfile.findFirst({
        where: { id: dto.profileId, tenantId: resolvedTenantId },
      }),
    ]);

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${effectiveDeviceId} was not found for this tenant`,
      });
    }

    if (userId && userId !== 'system') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });
      if (
        user &&
        user.role.name !== RoleName.SUPER_ADMIN &&
        user.role.name !== RoleName.TENANT_ADMIN &&
        (user.role.name as any) !== 'OWNER' &&
        (user.role.name as any) !== 'ADMIN'
      ) {
        const access = await this.prisma.userDeviceAccess.findUnique({
          where: {
            userId_deviceId: {
              userId,
              deviceId: effectiveDeviceId,
            },
          },
        });
        if (!access) {
          throw new ForbiddenException({
            code: 'DEVICE_ACCESS_DENIED',
            message: 'ليس لديك صلاحية لتوليد كروت على هذا الراوتر',
          });
        }
      }
    }

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: `Hotspot profile with ID ${dto.profileId} was not found`,
      });
    }

    const effectiveTotalCards = dto.totalCards || dto.quantity || 100;
    const effectiveLength = dto.length || dto.codeLength || 8;
    const effectivePrice = dto.price !== undefined ? dto.price : (Number((profile as any)?.price) || 500);

    // Resolve template if passed
    const effectiveTemplateId = (dto.templateId || dto.cardTemplateId || '').trim();
    let matchedTemplate: { id: string; name: string; themePreset: string | null; widthMm: number } | null = null;
    if (effectiveTemplateId) {
      matchedTemplate = await this.prisma.cardTemplate.findFirst({
        where: { id: effectiveTemplateId, tenantId: resolvedTenantId },
        select: { id: true, name: true, themePreset: true, widthMm: true },
      });
      if (!matchedTemplate) {
        throw new NotFoundException({
          code: 'TEMPLATE_NOT_FOUND',
          message: `قالب تصميم الكروت المحدد (${effectiveTemplateId}) غير موجود أو تم حذفه`,
        });
      }
    }

    const resolvedThemePreset = matchedTemplate?.themePreset || dto.themePreset || 'FOOTBALL';

    const batchNumber = this.codeGenerator.generateBatchNumber();
    const rawTimeLimit = dto.timeLimit ?? profile.sessionTimeout ?? null;
    const timeLimit = rawTimeLimit ? normalizeValidityDuration(rawTimeLimit) : null;
    const profileDataLimitBytes = (profile as any)?.dataLimitBytes != null ? BigInt((profile as any).dataLimitBytes) : null;
    const dataLimitBytes = dto.dataLimitMb ? BigInt(dto.dataLimitMb) * BigInt(1024 * 1024) : profileDataLimitBytes;

    // 4. Atomic transaction: Lock subscription quota, create batch and cards in DB
    const { quotaInfo, batch, cardDataToInsert, plainCredentials } = await this.prisma.$transaction(
      async (tx) => {
        // Enforce quota limits with concurrency-safe row lock
        const quota = await this.quotasService.checkAndLockQuota(tx, resolvedTenantId, effectiveTotalCards);

        // Create batch record in PROCESSING state
        const batchRecord = await tx.cardBatch.create({
          data: {
            tenantId: resolvedTenantId,
            deviceId: effectiveDeviceId,
            profileId: dto.profileId,
            batchNumber,
            totalCards: effectiveTotalCards,
            prefix: dto.prefix ?? null,
            length: effectiveLength,
            pattern: dto.pattern ?? 'NUMERIC',
            price: new Prisma.Decimal(effectivePrice),
            validityDays: dto.validityDays ?? null,
            timeLimit,
            dataLimitBytes,
            status: CardBatchStatus.PROCESSING,
            themePreset: resolvedThemePreset,
            createdById: effectiveUserId,
          },
        });

        if (matchedTemplate) {
          try {
            const printerType = (matchedTemplate.widthMm ?? 85) <= 80 ? 'THERMAL' : 'A4_SHEET';
            await tx.printJob.create({
              data: {
                tenantId: resolvedTenantId,
                templateId: matchedTemplate.id,
                cardBatchId: batchRecord.id,
                printerType,
                status: PrintJobStatus.PENDING,
                totalCards: effectiveTotalCards,
                createdById: effectiveUserId,
              },
            });
          } catch (pjErr) {
            this.logger.warn(`PrintJob link for template ${matchedTemplate.id} skipped: ${pjErr}`);
          }
        }

        // Generate unique card codes via CSPRNG
        let usernames = this.codeGenerator.generateBatchCodes(
          effectiveTotalCards,
          {
            length: effectiveLength,
            pattern: dto.pattern ?? 'NUMERIC',
            prefix: dto.prefix,
          },
        );

        const collisions = await tx.card.findMany({
          where: {
            tenantId: resolvedTenantId,
            deviceId: effectiveDeviceId,
            username: { in: usernames },
          },
          select: { username: true },
        });

        if (collisions.length > 0) {
          const collisionSet = new Set(collisions.map((c) => c.username));
          const valid = usernames.filter((u) => !collisionSet.has(u));
          const replacements = this.codeGenerator.generateBatchCodes(
            collisions.length,
            {
              length: effectiveLength,
              pattern: dto.pattern ?? 'NUMERIC',
              prefix: dto.prefix,
            },
            new Set([...valid, ...collisionSet]),
          );
          usernames = [...valid, ...replacements];
        }

        const cardsToInsert: Prisma.CardCreateManyInput[] = [];
        const plainCreds: Array<{ username: string; password: string }> = [];
        const isSinglePin = dto.singleUserPin === true || dto.singleCredential === true;

        for (let i = 0; i < usernames.length; i++) {
          const username = usernames[i];
          const password = isSinglePin ? username : this.codeGenerator.generatePin(4);
          const pinCode = password;

          const { ciphertext, iv, authTag } = this.encryptionService.encrypt(password);
          const serialNumber = this.codeGenerator.generateSerialNumber(batchNumber, i + 1);
          const cardId = randomUUID();

          cardsToInsert.push({
            id: cardId,
            tenantId: resolvedTenantId,
            batchId: batchRecord.id,
            deviceId: effectiveDeviceId,
            profileId: dto.profileId,
            username,
            passwordEncrypted: ciphertext,
            iv,
            authTag,
            pinCode,
            serialNumber,
            price: new Prisma.Decimal(effectivePrice),
            validityDays: dto.validityDays ?? null,
            timeLimit,
            dataLimitBytes,
            status: CardStatus.AVAILABLE,
            syncStatus: SyncStatus.PENDING,
          });

          plainCreds.push({ username, password });
        }

        // Bulk insert cards in PostgreSQL
        await tx.card.createMany({
          data: cardsToInsert,
        });

        return {
          quotaInfo: quota,
          batch: batchRecord,
          cardDataToInsert: cardsToInsert,
          plainCredentials: plainCreds,
        };
      },
      { timeout: 15000 },
    );

    // 5. Synchronize with RouterOS if requested and device is online
    let syncedCount = 0;
    let syncError: string | null = null;
    const syncedUsernames: string[] = [];
    const failedUsernames: string[] = [];
    let routerSyncStatus: 'SYNCED' | 'PARTIAL' | 'FAILED' | 'PENDING_OFFLINE' = 'PENDING_OFFLINE';

    if (dto.syncToRouter !== false && device.isOnline) {
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

        for (const cred of plainCredentials) {
          try {
            await client.createHotspotUser({
              name: cred.username,
              password: cred.password,
              profile: profile.name,
              limitUptime: timeLimit ?? undefined,
              limitBytesTotal: dataLimitBytes ? Number(dataLimitBytes) : undefined,
              comment: batchNumber,
            });
            syncedCount++;
            syncedUsernames.push(cred.username);
          } catch (itemErr: any) {
            const errStr = itemErr instanceof Error ? itemErr.message : String(itemErr);
            // Handle idempotent creation: if user exists already on router, mark as success
            if (errStr.includes('already have') || errStr.includes('already exists')) {
              syncedCount++;
              syncedUsernames.push(cred.username);
            } else {
              this.logger.warn(`Failed to sync card ${cred.username} to router: ${errStr}`);
              failedUsernames.push(cred.username);
            }
          }
        }

        // Mark successfully synced cards
        if (syncedUsernames.length > 0) {
          await this.prisma.card.updateMany({
            where: { batchId: batch.id, username: { in: syncedUsernames } },
            data: { syncStatus: SyncStatus.SYNCED, syncError: null },
          });
        }

        // Mark failed cards
        if (failedUsernames.length > 0) {
          await this.prisma.card.updateMany({
            where: { batchId: batch.id, username: { in: failedUsernames } },
            data: {
              syncStatus: SyncStatus.FAILED,
              syncError: 'Failed to provision on MikroTik HotSpot user list',
            },
          });
        }

        // Accurately determine batch status and routerSyncStatus
        let finalBatchStatus: CardBatchStatus;
        if (syncedCount === effectiveTotalCards) {
          finalBatchStatus = CardBatchStatus.COMPLETED;
          routerSyncStatus = 'SYNCED';
        } else if (syncedCount > 0) {
          finalBatchStatus = CardBatchStatus.COMPLETED;
          routerSyncStatus = 'PARTIAL';
        } else {
          finalBatchStatus = CardBatchStatus.FAILED;
          routerSyncStatus = 'FAILED';
        }

        await this.prisma.cardBatch.update({
          where: { id: batch.id },
          data: { status: finalBatchStatus },
        });
      } catch (routerErr: any) {
        syncError = routerErr instanceof Error ? routerErr.message : String(routerErr);
        this.logger.error(`Batch ${batchNumber} router synchronization failed: ${syncError}`);

        await this.prisma.card.updateMany({
          where: { batchId: batch.id },
          data: {
            syncStatus: SyncStatus.FAILED,
            syncError,
          },
        });

        await this.prisma.cardBatch.update({
          where: { id: batch.id },
          data: { status: CardBatchStatus.FAILED },
        });

        routerSyncStatus = 'FAILED';
      }
    } else {
      // Offline mode or sync disabled: cards stored in DB in PENDING status
      routerSyncStatus = 'PENDING_OFFLINE';
      await this.prisma.cardBatch.update({
        where: { id: batch.id },
        data: { status: CardBatchStatus.COMPLETED },
      });
    }

    const updatedBatch = await this.prisma.cardBatch.findUnique({
      where: { id: batch.id },
      include: {
        device: { select: { name: true } },
        profile: { select: { name: true } },
      },
    });

    const failedCount = routerSyncStatus === 'PENDING_OFFLINE' ? 0 : Math.max(0, effectiveTotalCards - syncedCount);
    const finalUsedCards = quotaInfo.usedCards + (routerSyncStatus === 'FAILED' ? 0 : effectiveTotalCards);
    const finalRemainingCards = quotaInfo.isUnlimited
      ? null
      : Math.max(0, (quotaInfo.cardLimit ?? 0) - finalUsedCards);
    const isFullySynced = syncedCount === effectiveTotalCards && routerSyncStatus === 'SYNCED';

    return {
      batch: {
        id: updatedBatch!.id,
        batchNumber: updatedBatch!.batchNumber,
        totalCards: updatedBatch!.totalCards,
        deviceName: updatedBatch!.device.name,
        profileName: updatedBatch!.profile.name,
        price: Number(updatedBatch!.price),
        status: updatedBatch!.status,
        syncedToRouter: isFullySynced,
        routerSyncStatus,
        syncedCount,
        failedCount,
        syncError,
        themePreset: updatedBatch!.themePreset ?? resolvedThemePreset,
        templateId: matchedTemplate?.id ?? (effectiveTemplateId.length > 0 ? effectiveTemplateId : null),
        templateName: matchedTemplate?.name ?? null,
        createdAt: updatedBatch!.createdAt,
      },
      quota: {
        limit: quotaInfo.cardLimit,
        used: finalUsedCards,
        remaining: finalRemainingCards,
        isUnlimited: quotaInfo.isUnlimited,
        resetsAt: quotaInfo.cycleEnd.toISOString(),
      },
      syncedToRouter: isFullySynced,
      routerSyncStatus,
      syncedCount,
      failedCount,
      syncError,
      cards: cardDataToInsert.map((c, i) => {
        const isSynced = syncedUsernames.includes(c.username);
        const isFailed = failedUsernames.includes(c.username) || routerSyncStatus === 'FAILED';
        return {
          id: c.id,
          serialNumber: c.serialNumber,
          username: c.username,
          clearPassword: plainCredentials[i]?.password,
          profileId: c.profileId,
          profileName: updatedBatch!.profile.name,
          deviceId: c.deviceId,
          price: Number(c.price),
          currency: 'SDG',
          status: c.status,
          syncStatus: isSynced
            ? SyncStatus.SYNCED
            : (isFailed ? SyncStatus.FAILED : SyncStatus.PENDING),
          syncError: isSynced ? null : (syncError ?? (isFailed ? 'Failed router provisioning' : 'Pending router sync')),
        };
      }),
    };
  }

  async listBatches(tenantId: string, deviceId?: string) {
    const where: Prisma.CardBatchWhereInput = { tenantId };
    if (deviceId) where.deviceId = deviceId;

    const batches = await this.prisma.cardBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        device: { select: { name: true } },
        profile: { select: { name: true } },
      },
    });

    if (batches.length === 0) return [];

    const batchIds = batches.map((b) => b.id);
    const statusCounts = await this.prisma.card.groupBy({
      by: ['batchId', 'status'],
      where: { tenantId, batchId: { in: batchIds } },
      _count: { id: true },
    });

    const countsMap = new Map<string, Record<string, number>>();
    for (const sc of statusCounts) {
      if (!countsMap.has(sc.batchId)) {
        countsMap.set(sc.batchId, {});
      }
      countsMap.get(sc.batchId)![sc.status] = sc._count.id;
    }

    return batches.map((b) => {
      const counts = countsMap.get(b.id) || {};
      const availableCards = counts[CardStatus.AVAILABLE] || 0;
      const soldCards = counts[CardStatus.SOLD] || 0;
      const activeCards = counts[CardStatus.ACTIVE] || 0;
      const disabledCards = counts[CardStatus.DISABLED] || 0;
      const expiredCards = counts[CardStatus.EXPIRED] || 0;

      return {
        id: b.id,
        tenantId: b.tenantId,
        deviceId: b.deviceId,
        deviceName: b.device.name,
        profileId: b.profileId,
        profileName: b.profile.name,
        batchNumber: b.batchNumber,
        totalCards: b.totalCards,
        availableCards,
        soldCards,
        activeCards,
        disabledCards,
        expiredCards,
        price: Number(b.price),
        status: b.status,
        createdAt: b.createdAt,
      };
    });
  }

  async getBatchById(tenantId: string, batchId: string): Promise<CardBatchSummary> {
    const [batch, statusCounts] = await Promise.all([
      this.prisma.cardBatch.findFirst({
        where: { id: batchId, tenantId },
        include: {
          device: { select: { name: true } },
          profile: { select: { name: true } },
        },
      }),
      this.prisma.card.groupBy({
        by: ['status'],
        where: { tenantId, batchId },
        _count: { id: true },
      }),
    ]);

    if (!batch) {
      throw new NotFoundException({
        code: 'BATCH_NOT_FOUND',
        message: `Card batch with ID ${batchId} was not found`,
      });
    }

    const counts: Record<string, number> = {};
    for (const sc of statusCounts) {
      counts[sc.status] = sc._count.id;
    }

    return {
      id: batch.id,
      tenantId: batch.tenantId,
      deviceId: batch.deviceId,
      deviceName: batch.device.name,
      profileId: batch.profileId,
      profileName: batch.profile.name,
      batchNumber: batch.batchNumber,
      totalCards: batch.totalCards,
      availableCards: counts[CardStatus.AVAILABLE] || 0,
      soldCards: counts[CardStatus.SOLD] || 0,
      activeCards: counts[CardStatus.ACTIVE] || 0,
      disabledCards: counts[CardStatus.DISABLED] || 0,
      expiredCards: counts[CardStatus.EXPIRED] || 0,
      price: Number(batch.price),
      status: batch.status,
      createdAt: batch.createdAt,
    };
  }

  async listCardsInBatch(
    tenantId: string,
    batchId: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: CardItemResponse[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const [cards, total] = await Promise.all([
      this.prisma.card.findMany({
        where: { tenantId, batchId },
        orderBy: { serialNumber: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.card.count({
        where: { tenantId, batchId },
      }),
    ]);

    const data: CardItemResponse[] = cards.map((c) => ({
      id: c.id,
      batchId: c.batchId,
      serialNumber: c.serialNumber,
      username: c.username,
      pinCode: c.pinCode,
      price: Number(c.price),
      status: c.status,
      validityDays: c.validityDays,
      timeLimit: c.timeLimit,
      dataLimitBytes: c.dataLimitBytes ? Number(c.dataLimitBytes) : null,
      syncStatus: c.syncStatus,
      soldAt: c.soldAt,
      activatedAt: c.activatedAt,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    }));

    return { data, total, page, limit };
  }

  async updateCardStatus(
    tenantId: string,
    cardId: string,
    dto: UpdateCardStatusDto,
  ): Promise<CardItemResponse> {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, tenantId },
      include: { device: true },
    });

    if (!card) {
      throw new NotFoundException({
        code: 'CARD_NOT_FOUND',
        message: `Card with ID ${cardId} was not found`,
      });
    }

    // Validate legal state transition
    const allowedTargets = this.LEGAL_TRANSITIONS[card.status];
    if (!allowedTargets.includes(dto.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot transition card from status "${card.status}" to "${dto.status}". Allowed targets: [${allowedTargets.join(', ')}]`,
      });
    }

    // If disabling or re-enabling, sync to MikroTik router (if online)
    if (dto.status === CardStatus.DISABLED && card.device?.isOnline) {
      try {
        const client = await this.mikrotikClientFactory.getClient({
          id: card.device.id,
          name: card.device.name,
          host: card.device.host,
          apiPort: card.device.apiPort,
          restPort: card.device.restPort,
          useSsl: card.device.useSsl,
          username: card.device.username,
          passwordEncrypted: card.device.passwordEncrypted,
          iv: card.device.iv,
          authTag: card.device.authTag,
          rosVersion: card.device.rosVersion,
        });
        await client.disableHotspotUser(card.username);
      } catch (err) {
        this.logger.warn(`Could not disable hotspot user on router: ${err}`);
      }
    } else if (card.status === CardStatus.DISABLED && card.device?.isOnline) {
      try {
        const client = await this.mikrotikClientFactory.getClient({
          id: card.device.id,
          name: card.device.name,
          host: card.device.host,
          apiPort: card.device.apiPort,
          restPort: card.device.restPort,
          useSsl: card.device.useSsl,
          username: card.device.username,
          passwordEncrypted: card.device.passwordEncrypted,
          iv: card.device.iv,
          authTag: card.device.authTag,
          rosVersion: card.device.rosVersion,
        });
        await client.enableHotspotUser(card.username);
      } catch (err) {
        this.logger.warn(`Could not enable hotspot user on router: ${err}`);
      }
    }

    const updated = await this.prisma.card.update({
      where: { id: cardId },
      data: { status: dto.status },
    });

    return {
      id: updated.id,
      batchId: updated.batchId,
      serialNumber: updated.serialNumber,
      username: updated.username,
      pinCode: updated.pinCode,
      price: Number(updated.price),
      status: updated.status,
      validityDays: updated.validityDays,
      timeLimit: updated.timeLimit,
      dataLimitBytes: updated.dataLimitBytes ? Number(updated.dataLimitBytes) : null,
      syncStatus: updated.syncStatus,
      soldAt: updated.soldAt,
      activatedAt: updated.activatedAt,
      expiresAt: updated.expiresAt,
      createdAt: updated.createdAt,
    };
  }

  async syncBatchToRouter(tenantId: string, batchId: string) {
    const batch = await this.prisma.cardBatch.findFirst({
      where: { id: batchId, tenantId },
      include: {
        device: true,
        profile: true,
        cards: {
          where: { syncStatus: { not: SyncStatus.SYNCED } },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException({
        code: 'BATCH_NOT_FOUND',
        message: `Card batch with ID ${batchId} was not found`,
      });
    }

    if (batch.cards.length === 0) {
      return {
        success: true,
        message: 'جميع كروت هذه الدفعة متزامنة ومفعلة بالفعل على الراوتر',
        totalUnsynced: 0,
        syncedCount: 0,
        failedCount: 0,
        remainingUnsynced: 0,
        batchStatus: batch.status,
      };
    }

    if (!batch.device.isOnline) {
      return {
        success: false,
        message: 'جهاز الراوتر غير متصل حالياً (OFFLINE). تعذر تنفيذ المزامنة المباشرة',
        totalUnsynced: batch.cards.length,
        syncedCount: 0,
        failedCount: batch.cards.length,
        remainingUnsynced: batch.cards.length,
        batchStatus: batch.status,
      };
    }

    const client = await this.mikrotikClientFactory.getClient({
      id: batch.device.id,
      name: batch.device.name,
      host: batch.device.host,
      apiPort: batch.device.apiPort,
      restPort: batch.device.restPort,
      useSsl: batch.device.useSsl,
      username: batch.device.username,
      passwordEncrypted: batch.device.passwordEncrypted,
      iv: batch.device.iv,
      authTag: batch.device.authTag,
      rosVersion: batch.device.rosVersion,
    });

    let syncedCount = 0;
    let failedCount = 0;
    const syncedCardIds: string[] = [];
    const failedCardIds: string[] = [];

    for (const card of batch.cards) {
      try {
        const password = this.encryptionService.decrypt(
          card.passwordEncrypted,
          card.iv,
          card.authTag,
        );

        await client.createHotspotUser({
          name: card.username,
          password,
          profile: batch.profile.name,
          limitUptime: card.timeLimit ?? undefined,
          limitBytesTotal: card.dataLimitBytes ? Number(card.dataLimitBytes) : undefined,
          comment: batch.batchNumber,
        });

        syncedCount++;
        syncedCardIds.push(card.id);
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        // Idempotent retry: if user already exists on router, ensure latest quota and validity are set
        if (msg.includes('already have') || msg.includes('already exists')) {
          try {
            await client.updateHotspotUser(card.username, {
              limitBytesTotal: card.dataLimitBytes ? Number(card.dataLimitBytes) : 0,
              limitUptime: card.timeLimit ?? undefined,
            });
          } catch (_) {
            // Non-fatal if update on existing user is rejected by router
          }
          syncedCount++;
          syncedCardIds.push(card.id);
        } else {
          this.logger.warn(`Could not sync card ${card.username}: ${msg}`);
          failedCount++;
          failedCardIds.push(card.id);
        }
      }
    }

    if (syncedCardIds.length > 0) {
      await this.prisma.card.updateMany({
        where: { id: { in: syncedCardIds } },
        data: { syncStatus: SyncStatus.SYNCED, syncError: null },
      });
    }

    if (failedCardIds.length > 0) {
      await this.prisma.card.updateMany({
        where: { id: { in: failedCardIds } },
        data: {
          syncStatus: SyncStatus.FAILED,
          syncError: 'Failed to provision on MikroTik HotSpot user list',
        },
      });
    }

    // Check if any cards in this batch remain unsynced
    const remainingUnsynced = await this.prisma.card.count({
      where: {
        batchId,
        syncStatus: { not: SyncStatus.SYNCED },
      },
    });

    let batchStatus = batch.status;
    if (remainingUnsynced === 0) {
      batchStatus = CardBatchStatus.COMPLETED;
      await this.prisma.cardBatch.update({
        where: { id: batchId },
        data: { status: CardBatchStatus.COMPLETED },
      });
    } else if (syncedCount > 0 && batch.status === CardBatchStatus.FAILED) {
      batchStatus = CardBatchStatus.COMPLETED;
      await this.prisma.cardBatch.update({
        where: { id: batchId },
        data: { status: CardBatchStatus.COMPLETED },
      });
    }

    const finalRouterSyncStatus: 'SYNCED' | 'PARTIAL' | 'FAILED' =
      remainingUnsynced === 0
        ? 'SYNCED'
        : syncedCount > 0
          ? 'PARTIAL'
          : 'FAILED';

    return {
      success: syncedCount > 0 || remainingUnsynced === 0,
      totalUnsynced: batch.cards.length,
      syncedCount,
      failedCount,
      remainingUnsynced,
      batchStatus,
      routerSyncStatus: finalRouterSyncStatus,
      syncedToRouter: remainingUnsynced === 0,
    };
  }

  /**
   * Retrieves active card quota details for a tenant.
   */
  async getTenantQuota(tenantId: string, role?: string) {
    return this.quotasService.getTenantQuota(tenantId, new Date(), role);
  }

  async findAllCards(
    tenantId: string,
    query: {
      status?: string;
      search?: string;
      profileId?: string;
      deviceId?: string;
      batchId?: string;
      limit?: number;
      page?: number;
    },
  ) {
    // 1. Resolve tenantId if omitted or empty
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const firstTenant = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (firstTenant) resolvedTenantId = firstTenant.id;
    }

    const where: Prisma.CardWhereInput = {
      tenantId: resolvedTenantId,
    };

    // 2. Status filtering with business logic mapping
    if (query.status && query.status !== 'ALL') {
      const s = query.status.toUpperCase();
      if (s === 'AVAILABLE') {
        where.status = { in: [CardStatus.AVAILABLE, CardStatus.GENERATED] };
      } else if (s === 'SOLD') {
        where.status = CardStatus.SOLD;
      } else if (s === 'ACTIVE' || s === 'USED') {
        where.status = CardStatus.ACTIVE;
      } else if (s === 'DISABLED' || s === 'CANCELLED' || s === 'EXPIRED') {
        where.status = { in: [CardStatus.DISABLED, CardStatus.EXPIRED] };
      } else if (Object.values(CardStatus).includes(s as CardStatus)) {
        where.status = s as CardStatus;
      }
    }

    if (query.profileId) {
      where.profileId = query.profileId;
    }

    if (query.deviceId) {
      where.deviceId = query.deviceId;
    }

    if (query.batchId) {
      where.batchId = query.batchId;
    }

    // 3. Multi-field search across code, serial, pin, profile name, and batch number
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { pinCode: { contains: q, mode: 'insensitive' } },
        { profile: { name: { contains: q, mode: 'insensitive' } } },
        { batch: { batchNumber: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const limit = query.limit ? Math.max(1, Math.min(200, Number(query.limit))) : 50;
    const page = query.page ? Math.max(1, Number(query.page)) : 1;
    const skip = (page - 1) * limit;

    // 4. Parallel execution of paginated cards, total matching count, and inventory group breakdown
    const [
      cards,
      totalMatching,
      statusBreakdown,
    ] = await Promise.all([
      this.prisma.card.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        include: {
          profile: {
            select: { id: true, name: true, rateLimit: true },
          },
          device: {
            select: { id: true, name: true },
          },
          batch: {
            select: { batchNumber: true },
          },
          sales: {
            select: { invoiceNumber: true, amount: true, paymentMethod: true, createdAt: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.card.count({ where }),
      this.prisma.card.groupBy({
        by: ['status'],
        where: { tenantId: resolvedTenantId },
        _count: { status: true },
      }),
    ]);

    const statusCountsMap: Partial<Record<CardStatus, number>> = {};
    let totalInventory = 0;
    for (const item of statusBreakdown) {
      statusCountsMap[item.status] = item._count.status;
      totalInventory += item._count.status;
    }

    const availableCount =
      (statusCountsMap[CardStatus.AVAILABLE] || 0) +
      (statusCountsMap[CardStatus.GENERATED] || 0);
    const soldCount = statusCountsMap[CardStatus.SOLD] || 0;
    const activeCount = statusCountsMap[CardStatus.ACTIVE] || 0;
    const disabledCount =
      (statusCountsMap[CardStatus.DISABLED] || 0) +
      (statusCountsMap[CardStatus.EXPIRED] || 0);

    // 5. Decrypt password credentials for each card
    const formattedCards = cards.map((c) => {
      let clearPassword = c.pinCode ?? c.username;
      const decrypted = this.encryptionService.tryDecrypt(
        c.passwordEncrypted,
        c.iv,
        c.authTag,
      );
      if (decrypted !== null) {
        clearPassword = decrypted;
      }

      return {
        id: c.id,
        serialNumber: c.serialNumber,
        username: c.username,
        pinCode: c.pinCode,
        clearPassword,
        price: Number(c.price),
        status: c.status,
        validityDays: c.validityDays,
        timeLimit: c.timeLimit,
        dataLimitBytes: c.dataLimitBytes ? Number(c.dataLimitBytes) : null,
        syncStatus: c.syncStatus,
        soldAt: c.soldAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        batchNumber: c.batch?.batchNumber ?? null,
        invoiceNumber: c.sales[0]?.invoiceNumber ?? null,
        profile: c.profile
          ? {
              id: c.profile.id,
              name: c.profile.name,
              displayName: c.profile.name,
              rateLimit: c.profile.rateLimit,
            }
          : undefined,
        device: c.device
          ? {
              id: c.device.id,
              name: c.device.name,
            }
          : undefined,
      };
    });

    return {
      data: formattedCards,
      total: totalMatching,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(totalMatching / limit)),
      counts: {
        total: totalInventory,
        available: availableCount,
        sold: soldCount,
        active: activeCount,
        disabled: disabledCount,
      },
    };
  }

  /**
   * Bulk deletes cards belonging to a tenant, with MikroTik RouterOS removal,
   * audit protection for sold cards, and partial failure reporting.
   */
  async bulkDeleteCards(
    tenantId: string,
    dto: BulkDeleteCardsDto,
  ): Promise<BulkDeleteResult> {
    if (!tenantId) {
      throw new BadRequestException('معرف المستأجر مطلوب لتنفيذ عملية الحذف');
    }

    const uniqueIds = Array.from(new Set((dto.cardIds || []).filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('يجب تحديد كرت واحد على الأقل للحذف');
    }

    // Concurrency guard: reject or isolate concurrent deletion calls on the same card IDs
    for (const id of uniqueIds) {
      if (this.activeCardLocks.has(id)) {
        throw new ConflictException(`الكرت ${id} قيد عملية حذف أخرى متزامنة حالياً، يرجى الانتظار`);
      }
    }
    const lockedCardIds: string[] = [];
    for (const id of uniqueIds) {
      this.activeCardLocks.add(id);
      lockedCardIds.push(id);
    }

    try {
      // 1. Fetch requested cards with tenant verification
      const cards = await this.prisma.card.findMany({
        where: {
          tenantId,
          id: { in: uniqueIds },
        },
        include: {
          device: true,
          sales: { select: { id: true, invoiceNumber: true } },
        },
      });

      const foundIds = new Set(cards.map((c) => c.id));
      const failed: Array<{ id: string; reason: string }> = [];
      const skipped: Array<{ id: string; username: string; reason: string }> = [];

      // Track requested IDs that do not exist or belong to another tenant
      for (const reqId of uniqueIds) {
        if (!foundIds.has(reqId)) {
          failed.push({
            id: reqId,
            reason: 'الكرت غير موجود أو تم حذفه مسبقاً أو غير تابع لحساب هذه الشبكة',
          });
        }
      }

      // 2. Classify cards: protect sold or actively accounted cards
      const eligibleCards: typeof cards = [];
      for (const card of cards) {
        if (card.status === CardStatus.SOLD || card.sales.length > 0) {
          skipped.push({
            id: card.id,
            username: card.username,
            reason: 'لا يمكن حذف الكرت نظراً لوجود مبيعات أو قيود مالية مسجلة له',
          });
        } else {
          eligibleCards.push(card);
        }
      }

      let mikrotikRemovedCount = 0;
      let mikrotikPendingCount = 0;

      // 3. Remove users from MikroTik routers if devices are available
      const fullyRemovedCards: typeof eligibleCards = [];
      const pendingRouterCards: typeof eligibleCards = [];

      if (eligibleCards.length > 0) {
        const cardsByDevice = new Map<string, { device: (typeof cards)[0]['device']; cards: typeof eligibleCards }>();
        for (const card of eligibleCards) {
          if (card.device) {
            if (!cardsByDevice.has(card.deviceId)) {
              cardsByDevice.set(card.deviceId, { device: card.device, cards: [] });
            }
            cardsByDevice.get(card.deviceId)!.cards.push(card);
          } else {
            // Cards with no physical device associated can be safely deleted directly
            fullyRemovedCards.push(card);
          }
        }

        for (const { device, cards: devCards } of cardsByDevice.values()) {
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

            for (const card of devCards) {
              try {
                await client.deleteHotspotUser(card.username);
                mikrotikRemovedCount++;
                fullyRemovedCards.push(card);
              } catch (userErr: any) {
                const msg = userErr instanceof Error ? userErr.message : String(userErr);
                if (this.isHotspotUserNotFoundError(userErr)) {
                  // User already deleted or not present on router
                  mikrotikRemovedCount++;
                  fullyRemovedCards.push(card);
                } else {
                  this.logger.warn(
                    `Could not remove user ${card.username} from router ${device.name}: ${msg}`,
                  );
                  mikrotikPendingCount++;
                  pendingRouterCards.push(card);
                }
              }
            }
          } catch (connErr: any) {
            const connMsg = connErr instanceof Error ? connErr.message : String(connErr);
            this.logger.warn(
              `Router ${device.name} (${device.host}) unreachable during card deletion: ${connMsg}`,
            );
            mikrotikPendingCount += devCards.length;
            pendingRouterCards.push(...devCards);
          }
        }

        // 4. Atomically process database operations:
        // - Fully removed cards (confirmed gone from MikroTik) are hard-deleted from PostgreSQL.
        // - Offline/failed cards are NOT deleted: their identity is preserved in DB with status=DISABLED
        //   and syncError='PENDING_ROUTER_DELETION' so they can be audited, tracked, and retried upon reconnection.
        const fullyRemovedIds = fullyRemovedCards.map((c) => c.id);
        const pendingRouterIds = pendingRouterCards.map((c) => c.id);

        await this.prisma.$transaction(async (tx) => {
          if (fullyRemovedIds.length > 0) {
            await tx.hotspotActiveSession.deleteMany({
              where: { cardId: { in: fullyRemovedIds } },
            });

            await tx.card.deleteMany({
              where: {
                tenantId,
                id: { in: fullyRemovedIds },
              },
            });
          }

          if (pendingRouterIds.length > 0) {
            await tx.hotspotActiveSession.deleteMany({
              where: { cardId: { in: pendingRouterIds } },
            });

            await tx.card.updateMany({
              where: {
                tenantId,
                id: { in: pendingRouterIds },
              },
              data: {
                status: CardStatus.DISABLED,
                syncStatus: SyncStatus.FAILED,
                syncError: 'PENDING_ROUTER_DELETION: تعذر الاتصال بالراوتر، الكرت محفوظ للمزامنة اللاحقة',
              },
            });
          }
        });
      }

      const fullyRemovedIds = fullyRemovedCards.map((c) => c.id);
      const pendingRouterIds = pendingRouterCards.map((c) => c.id);

      // Operation is ONLY considered 100% successful if there are NO pending router failures
      // and no missing cards. If any card failed router removal, success is false.
      const isFullSuccess =
        mikrotikPendingCount === 0 &&
        failed.length === 0 &&
        (fullyRemovedIds.length > 0 || eligibleCards.length === 0);

      let message = '';
      if (fullyRemovedIds.length === 0 && pendingRouterIds.length === 0) {
        message = 'لم يتم حذف أي كروت. الكروت المحددة إما غير موجودة أو مباعة ومرتبطة بسجلات مالية.';
      } else {
        const parts: string[] = [];
        if (fullyRemovedIds.length > 0) {
          parts.push(`تم حذف ${fullyRemovedIds.length} كرت بنجاح من قاعدة البيانات والراوتر`);
        }
        if (pendingRouterIds.length > 0) {
          parts.push(
            `تعذر الاتصال بالراوتر لحذف ${pendingRouterIds.length} كرت، تم تعطيلها وحفظ هويتها في النظام بانتظار عودة الاتصال`,
          );
        }
        if (skipped.length > 0) {
          parts.push(`وتم استثناء ${skipped.length} كرت مباع لحماية القيود المالية`);
        }
        message = parts.join(' | ');
      }

      return {
        success: isFullSuccess,
        deletedCount: fullyRemovedIds.length,
        pendingCount: pendingRouterIds.length,
        skippedCount: skipped.length,
        failedCount: failed.length,
        mikrotikRemovedCount,
        mikrotikPendingCount,
        details: {
          deletedIds: fullyRemovedIds,
          pendingIds: pendingRouterIds,
          skipped,
          failed,
        },
        message,
      };
    } finally {
      // Release concurrency locks on cards
      for (const id of lockedCardIds) {
        this.activeCardLocks.delete(id);
      }
    }
  }

  /**
   * Deletes a single card by ID with router removal and security checks.
   */
  async deleteSingleCard(
    tenantId: string,
    cardId: string,
  ): Promise<{ success: boolean; message: string; mikrotikRemoved: boolean; pendingRouterDeletion?: boolean }> {
    const result = await this.bulkDeleteCards(tenantId, { cardIds: [cardId] });
    if (result.deletedCount === 0 && result.pendingCount === 0) {
      const skipReason = result.details.skipped[0]?.reason;
      const failReason = result.details.failed[0]?.reason;
      throw new BadRequestException(skipReason || failReason || 'فشل حذف الكرت');
    }
    return {
      success: result.success,
      message: result.message,
      mikrotikRemoved: result.mikrotikRemovedCount > 0,
      pendingRouterDeletion: result.pendingCount > 0,
    };
  }

  /**
   * Retries deleting pending cards from MikroTik routers once they are back online.
   * Guarded with tenant-level lock to prevent concurrent overlapping jobs.
   */
  async retryPendingDeletions(tenantId: string, deviceId?: string): Promise<{
    processedCount: number;
    cleanedCount: number;
    stillPendingCount: number;
  }> {
    if (this.activeRetryTenantLocks.has(tenantId)) {
      throw new ConflictException('عملية إعادة محاولة مزامنة الحذف جارية بالفعل لهذه الشبكة، يرجى الانتظار');
    }
    this.activeRetryTenantLocks.add(tenantId);

    try {
      const where: Prisma.CardWhereInput = {
        tenantId,
        status: CardStatus.DISABLED,
        syncError: { contains: 'PENDING_ROUTER_DELETION' },
      };
      if (deviceId) {
        where.deviceId = deviceId;
      }

      const cards = await this.prisma.card.findMany({
        where,
        include: { device: true },
      });

      if (cards.length === 0) {
        return { processedCount: 0, cleanedCount: 0, stillPendingCount: 0 };
      }

      let cleanedCount = 0;
      let stillPendingCount = 0;

      const cardsByDevice = new Map<string, { device: (typeof cards)[0]['device']; cards: typeof cards }>();
      for (const card of cards) {
        if (card.device) {
          if (!cardsByDevice.has(card.deviceId)) {
            cardsByDevice.set(card.deviceId, { device: card.device, cards: [] });
          }
          cardsByDevice.get(card.deviceId)!.cards.push(card);
        }
      }

      for (const { device, cards: devCards } of cardsByDevice.values()) {
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

          const deletedIds: string[] = [];
          for (const c of devCards) {
            try {
              await client.deleteHotspotUser(c.username);
              deletedIds.push(c.id);
              cleanedCount++;
            } catch (err: any) {
              if (this.isHotspotUserNotFoundError(err)) {
                deletedIds.push(c.id);
                cleanedCount++;
              } else {
                stillPendingCount++;
              }
            }
          }

          if (deletedIds.length > 0) {
            await this.prisma.$transaction(async (tx) => {
              await tx.hotspotActiveSession.deleteMany({ where: { cardId: { in: deletedIds } } });
              await tx.card.deleteMany({ where: { tenantId, id: { in: deletedIds } } });
            });
          }
        } catch (connErr) {
          stillPendingCount += devCards.length;
        }
      }

      return {
        processedCount: cards.length,
        cleanedCount,
        stillPendingCount,
      };
    } finally {
      this.activeRetryTenantLocks.delete(tenantId);
    }
  }
}

