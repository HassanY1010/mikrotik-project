import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { CardCodeGeneratorService } from './card-code-generator.service';
import { CreateBatchDto } from '../dto/create-batch.dto';
import { UpdateCardStatusDto } from '../dto/update-card-status.dto';
import { CardStatus, CardBatchStatus, SyncStatus, Prisma } from '@prisma/client';

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
  ) {}

  async createBatch(tenantId: string, userId: string, dto: CreateBatchDto) {
    // 1. Resolve deviceId: if not provided, look up from profile or tenant's active device
    let effectiveDeviceId = dto.deviceId;
    if (!effectiveDeviceId) {
      const p = await this.prisma.hotspotProfile.findFirst({
        where: { id: dto.profileId, tenantId },
      });
      if (p) {
        effectiveDeviceId = p.deviceId;
      }
    }

    if (!effectiveDeviceId) {
      const firstDevice = await this.prisma.mikroTikDevice.findFirst({
        where: { tenantId, deletedAt: null },
      });
      if (!firstDevice) {
        throw new NotFoundException({
          code: 'DEVICE_NOT_FOUND',
          message: 'يجب إضافة راوتر ميكروتيك أولاً قبل توليد الكروت',
        });
      }
      effectiveDeviceId = firstDevice.id;
    }

    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id: effectiveDeviceId, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `Device with ID ${effectiveDeviceId} was not found for this tenant`,
      });
    }

    // 2. Verify profile belongs to tenant
    const profile = await this.prisma.hotspotProfile.findFirst({
      where: { id: dto.profileId, tenantId },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: `Hotspot profile with ID ${dto.profileId} was not found`,
      });
    }

    const effectiveTotalCards = dto.totalCards || dto.quantity || 100;
    const effectiveLength = dto.length || dto.codeLength || 8;
    const effectivePrice = dto.price !== undefined ? dto.price : 500;

    // 3. Generate unique batch number
    const batchNumber = this.codeGenerator.generateBatchNumber();
    const timeLimit = dto.timeLimit ?? profile.sessionTimeout ?? null;
    const dataLimitBytes = dto.dataLimitMb ? BigInt(dto.dataLimitMb) * BigInt(1024 * 1024) : null;

    // 4. Create batch record in PROCESSING state
    const batch = await this.prisma.cardBatch.create({
      data: {
        tenantId,
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
        createdById: userId,
      },
    });

    // 5. Query existing usernames for this device to guarantee uniqueness
    const existingCards = await this.prisma.card.findMany({
      where: { tenantId, deviceId: effectiveDeviceId },
      select: { username: true },
    });
    const existingSet = new Set(existingCards.map((c) => c.username));

    // 6. Generate unique card codes via CSPRNG
    const usernames = this.codeGenerator.generateBatchCodes(
      effectiveTotalCards,
      {
        length: effectiveLength,
        pattern: dto.pattern ?? 'NUMERIC',
        prefix: dto.prefix,
      },
      existingSet,
    );

    // 7. Prepare card records with encrypted passwords
    const cardDataToInsert: Prisma.CardCreateManyInput[] = [];
    const plainCredentials: Array<{ username: string; password: string }> = [];

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      const password = dto.singleUserPin ? username : this.codeGenerator.generatePin(4);
      const pinCode = password;

      const { ciphertext, iv, authTag } = this.encryptionService.encrypt(password);
      const serialNumber = this.codeGenerator.generateSerialNumber(batchNumber, i + 1);

      cardDataToInsert.push({
        tenantId,
        batchId: batch.id,
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

      plainCredentials.push({ username, password });
    }

    // 8. Bulk insert cards in PostgreSQL
    await this.prisma.card.createMany({
      data: cardDataToInsert,
    });

    // 9. Synchronize with RouterOS if requested
    let syncedCount = 0;
    let syncError: string | null = null;

    if (dto.syncToRouter !== false) {
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

        // Add users to RouterOS Hotspot with accurate per-card tracking
        const syncedUsernames: string[] = [];
        const failedUsernames: string[] = [];

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
          } catch (itemErr) {
            const errStr = itemErr instanceof Error ? itemErr.message : String(itemErr);
            this.logger.warn(`Failed to sync card ${cred.username} to router: ${errStr}`);
            failedUsernames.push(cred.username);
          }
        }

        // Mark only genuinely synced cards
        if (syncedUsernames.length > 0) {
          await this.prisma.card.updateMany({
            where: { batchId: batch.id, username: { in: syncedUsernames } },
            data: { syncStatus: SyncStatus.SYNCED, syncError: null },
          });
        }

        // Mark any failed cards
        if (failedUsernames.length > 0) {
          await this.prisma.card.updateMany({
            where: { batchId: batch.id, username: { in: failedUsernames } },
            data: {
              syncStatus: SyncStatus.FAILED,
              syncError: 'Failed to provision on MikroTik HotSpot user list',
            },
          });
        }
      } catch (routerErr) {
        syncError = routerErr instanceof Error ? routerErr.message : String(routerErr);
        this.logger.error(`Batch ${batchNumber} router synchronization failed: ${syncError}`);

        await this.prisma.card.updateMany({
          where: { batchId: batch.id },
          data: {
            syncStatus: SyncStatus.FAILED,
            syncError,
          },
        });
      }
    }

    // 10. Update batch status to COMPLETED
    const updatedBatch = await this.prisma.cardBatch.update({
      where: { id: batch.id },
      data: { status: CardBatchStatus.COMPLETED },
      include: {
        device: { select: { name: true } },
        profile: { select: { name: true } },
      },
    });

    return {
      batch: {
        id: updatedBatch.id,
        batchNumber: updatedBatch.batchNumber,
        totalCards: updatedBatch.totalCards,
        deviceName: updatedBatch.device.name,
        profileName: updatedBatch.profile.name,
        price: Number(updatedBatch.price),
        status: updatedBatch.status,
        syncedToRouter: syncedCount === dto.totalCards,
        syncedCount,
        syncError,
        createdAt: updatedBatch.createdAt,
      },
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
        cards: {
          select: { status: true },
        },
      },
    });

    return batches.map((b) => {
      const availableCards = b.cards.filter((c) => c.status === CardStatus.AVAILABLE).length;
      const soldCards = b.cards.filter((c) => c.status === CardStatus.SOLD).length;
      const activeCards = b.cards.filter((c) => c.status === CardStatus.ACTIVE).length;
      const disabledCards = b.cards.filter((c) => c.status === CardStatus.DISABLED).length;
      const expiredCards = b.cards.filter((c) => c.status === CardStatus.EXPIRED).length;

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
    const batch = await this.prisma.cardBatch.findFirst({
      where: { id: batchId, tenantId },
      include: {
        device: { select: { name: true } },
        profile: { select: { name: true } },
        cards: { select: { status: true } },
      },
    });

    if (!batch) {
      throw new NotFoundException({
        code: 'BATCH_NOT_FOUND',
        message: `Card batch with ID ${batchId} was not found`,
      });
    }

    const availableCards = batch.cards.filter((c) => c.status === CardStatus.AVAILABLE).length;
    const soldCards = batch.cards.filter((c) => c.status === CardStatus.SOLD).length;
    const activeCards = batch.cards.filter((c) => c.status === CardStatus.ACTIVE).length;
    const disabledCards = batch.cards.filter((c) => c.status === CardStatus.DISABLED).length;
    const expiredCards = batch.cards.filter((c) => c.status === CardStatus.EXPIRED).length;

    return {
      id: batch.id,
      tenantId: batch.tenantId,
      deviceId: batch.deviceId,
      deviceName: batch.device.name,
      profileId: batch.profileId,
      profileName: batch.profile.name,
      batchNumber: batch.batchNumber,
      totalCards: batch.totalCards,
      availableCards,
      soldCards,
      activeCards,
      disabledCards,
      expiredCards,
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

    // If disabling or re-enabling, sync to MikroTik router
    if (dto.status === CardStatus.DISABLED) {
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
    } else if (card.status === CardStatus.DISABLED) {
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
        message: 'All cards in this batch are already synced to the router',
        syncedCount: 0,
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
    const syncedCardIds: string[] = [];

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
      } catch (err) {
        this.logger.warn(`Could not sync card ${card.username}: ${err}`);
      }
    }

    if (syncedCardIds.length > 0) {
      await this.prisma.card.updateMany({
        where: { id: { in: syncedCardIds } },
        data: { syncStatus: SyncStatus.SYNCED, syncError: null },
      });
    }

    return {
      success: true,
      totalUnsynced: batch.cards.length,
      syncedCount,
    };
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
    const where: Prisma.CardWhereInput = {
      tenantId,
    };

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as CardStatus;
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

    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
      ];
    }

    const limit = query.limit ? Number(query.limit) : 100;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;

    const cards = await this.prisma.card.findMany({
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
      },
    });

    return cards.map((c) => ({
      id: c.id,
      serialNumber: c.serialNumber,
      username: c.username,
      pinCode: c.pinCode,
      price: Number(c.price),
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      profile: c.profile
        ? {
            id: c.profile.id,
            name: c.profile.name,
            displayName: c.profile.name,
          }
        : undefined,
      device: c.device
        ? {
            id: c.device.id,
            name: c.device.name,
          }
        : undefined,
    }));
  }
}
