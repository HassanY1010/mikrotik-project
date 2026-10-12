import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { CardCodeGeneratorService } from './card-code-generator.service';
import { CreateBatchDto } from '../dto/create-batch.dto';
import { UpdateCardStatusDto } from '../dto/update-card-status.dto';
import { CardStatus, CardBatchStatus, SyncStatus, Prisma } from '@prisma/client';
import { QuotasService } from './quotas.service';

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

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: `Hotspot profile with ID ${dto.profileId} was not found`,
      });
    }

    const effectiveTotalCards = dto.totalCards || dto.quantity || 100;
    const effectiveLength = dto.length || dto.codeLength || 8;
    const effectivePrice = dto.price !== undefined ? dto.price : (Number((profile as any)?.price) || 500);

    const batchNumber = this.codeGenerator.generateBatchNumber();
    const timeLimit = dto.timeLimit ?? profile.sessionTimeout ?? null;
    const dataLimitBytes = dto.dataLimitMb ? BigInt(dto.dataLimitMb) * BigInt(1024 * 1024) : null;

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
            themePreset: dto.themePreset ?? 'FOOTBALL',
            createdById: effectiveUserId,
          },
        });

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
        themePreset: updatedBatch!.themePreset ?? dto.themePreset ?? 'FOOTBALL',
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
        // Idempotent retry: if user already exists on router, treat as synced
        if (msg.includes('already have') || msg.includes('already exists')) {
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
  async getTenantQuota(tenantId: string) {
    return this.quotasService.getTenantQuota(tenantId);
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
}
