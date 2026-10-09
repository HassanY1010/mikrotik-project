import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { SyncPushDto } from '../dto/sync-push.dto';
import { SyncPullQueryDto } from '../dto/sync-pull-query.dto';
import { ReserveCardsDto } from '../dto/reserve-cards.dto';
import { CardStatus, PaymentMethod, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

export interface MutationResult {
  clientMutationId: string;
  status: 'APPLIED' | 'CONFLICT' | 'REJECTED';
  error?: string;
  serverEntityId?: string;
}

export interface SyncPullResponse {
  serverTimestamp: string;
  devices: Array<{ id: string; name: string; isOnline: boolean }>;
  profiles: Array<{
    id: string;
    deviceId: string;
    name: string;
    rateLimit: string | null;
    sessionTimeout: string | null;
    sharedUsers: number;
    availableCards?: number;
  }>;
  batches: Array<{
    id: string;
    batchNumber: string;
    deviceId: string;
    profileId: string;
    totalCards: number;
    price: number;
    createdAt: Date;
  }>;
  inventorySummary?: {
    totalAvailableCards: number;
    totalSoldCards: number;
  };
}

export interface ReservedCardPayload {
  id: string;
  serialNumber: string;
  username: string;
  password: string;
  clearPassword: string;
  pinCode: string;
  price: number;
  currency: string;
  profileId: string;
  profileName: string;
  deviceId: string;
  status: string;
  timeLimit: string | null;
  dataLimitBytes: number | null;
  qrPayload: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  private generateInvoiceNumber(): string {
    const now = new Date();
    const yy = (now.getFullYear() % 100).toString().padStart(2, '0');
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `INV-OFF-${yy}${mm}${dd}-${rand}`;
  }

  /**
   * Reconciles offline mutations sent from mobile clients.
   * Handles idempotent processing and conflict detection.
   */
  async pushMutations(
    tenantId: string,
    cashierId: string,
    dto: SyncPushDto,
  ): Promise<{ processedMutations: MutationResult[]; serverTimestamp: string }> {
    const results: MutationResult[] = [];

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });
    const currency = tenant?.currency ?? 'SDG';

    for (const mutation of dto.mutations) {
      try {
        if (mutation.type === 'SALE') {
          const cardId = mutation.payload['cardId'] as string;
          const paymentMethod =
            (mutation.payload['paymentMethod'] as PaymentMethod) ?? PaymentMethod.CASH;
          const customerPhone = (mutation.payload['customerPhone'] as string) ?? null;
          const customerName = (mutation.payload['customerName'] as string) ?? null;

          if (!cardId) {
            results.push({
              clientMutationId: mutation.clientMutationId,
              status: 'REJECTED',
              error: 'Missing cardId in sale mutation payload',
            });
            continue;
          }

          // Check if card is available
          const card = await this.prisma.card.findFirst({
            where: { id: cardId, tenantId },
          });

          if (!card) {
            results.push({
              clientMutationId: mutation.clientMutationId,
              status: 'REJECTED',
              error: `Card ${cardId} not found for this tenant`,
            });
            continue;
          }

          if (card.status !== CardStatus.AVAILABLE) {
            // Conflict: Card was already sold, active, or disabled on the server
            this.logger.warn(
              `Conflict on card ${card.serialNumber}: offline sale attempted but card is ${card.status}`,
            );
            results.push({
              clientMutationId: mutation.clientMutationId,
              status: 'CONFLICT',
              error: `Card was already ${card.status} on the server`,
            });
            continue;
          }

          // Atomically apply sale
          const offlineDate = new Date(mutation.createdAt);
          const invoiceNumber = this.generateInvoiceNumber();

          const [, tx] = await this.prisma.$transaction([
            this.prisma.card.update({
              where: { id: cardId },
              data: {
                status: CardStatus.SOLD,
                soldAt: offlineDate,
                soldById: cashierId,
              },
            }),
            this.prisma.saleTransaction.create({
              data: {
                tenantId,
                cardId,
                cashierId,
                deviceId: card.deviceId,
                amount: card.price,
                currency,
                paymentMethod,
                customerPhone,
                customerName,
                invoiceNumber,
                printedCount: 1,
                lastPrintedAt: offlineDate,
                createdAt: offlineDate,
              },
            }),
          ]);

          results.push({
            clientMutationId: mutation.clientMutationId,
            status: 'APPLIED',
            serverEntityId: tx.id,
          });
        } else if (mutation.type === 'CARD_STATUS') {
          const cardId = mutation.payload['cardId'] as string;
          const newStatus = mutation.payload['status'] as CardStatus;

          const card = await this.prisma.card.findFirst({
            where: { id: cardId, tenantId },
          });

          if (!card) {
            results.push({
              clientMutationId: mutation.clientMutationId,
              status: 'REJECTED',
              error: `Card ${cardId} not found`,
            });
            continue;
          }

          await this.prisma.card.update({
            where: { id: cardId },
            data: { status: newStatus },
          });

          results.push({
            clientMutationId: mutation.clientMutationId,
            status: 'APPLIED',
            serverEntityId: cardId,
          });
        } else {
          results.push({
            clientMutationId: mutation.clientMutationId,
            status: 'APPLIED',
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error processing mutation ${mutation.clientMutationId}: ${errorMsg}`);
        results.push({
          clientMutationId: mutation.clientMutationId,
          status: 'REJECTED',
          error: errorMsg,
        });
      }
    }

    return {
      processedMutations: results,
      serverTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Returns incremental updates since client's last sync timestamp.
   */
  async pullUpdates(tenantId: string, query: SyncPullQueryDto): Promise<SyncPullResponse> {
    const sinceDate = query.since ? new Date(query.since) : new Date(0);

    const deviceWhere: Prisma.MikroTikDeviceWhereInput = {
      tenantId,
      deletedAt: null,
      updatedAt: { gte: sinceDate },
    };
    if (query.deviceId) deviceWhere.id = query.deviceId;

    const profileWhere: Prisma.HotspotProfileWhereInput = {
      tenantId,
      updatedAt: { gte: sinceDate },
    };
    if (query.deviceId) profileWhere.deviceId = query.deviceId;

    const batchWhere: Prisma.CardBatchWhereInput = {
      tenantId,
      updatedAt: { gte: sinceDate },
    };
    if (query.deviceId) batchWhere.deviceId = query.deviceId;

    const [devices, profiles, batches, totalAvailableCards, totalSoldCards] = await Promise.all([
      this.prisma.mikroTikDevice.findMany({
        where: deviceWhere,
        select: { id: true, name: true, isOnline: true },
      }),
      this.prisma.hotspotProfile.findMany({
        where: profileWhere,
        select: {
          id: true,
          deviceId: true,
          name: true,
          rateLimit: true,
          sessionTimeout: true,
          sharedUsers: true,
          _count: {
            select: {
              cards: { where: { status: CardStatus.AVAILABLE } },
            },
          },
        },
      }),
      this.prisma.cardBatch.findMany({
        where: batchWhere,
        select: {
          id: true,
          batchNumber: true,
          deviceId: true,
          profileId: true,
          totalCards: true,
          price: true,
          createdAt: true,
        },
      }),
      this.prisma.card.count({
        where: {
          tenantId,
          status: { in: [CardStatus.AVAILABLE, CardStatus.GENERATED] },
        },
      }),
      this.prisma.card.count({
        where: {
          tenantId,
          status: CardStatus.SOLD,
        },
      }),
    ]);

    return {
      serverTimestamp: new Date().toISOString(),
      devices,
      profiles: profiles.map((p: any) => ({
        id: p.id,
        deviceId: p.deviceId,
        name: p.name,
        rateLimit: p.rateLimit,
        sessionTimeout: p.sessionTimeout,
        sharedUsers: p.sharedUsers,
        availableCards: p._count?.cards ?? 0,
      })),
      batches: batches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        deviceId: b.deviceId,
        profileId: b.profileId,
        totalCards: b.totalCards,
        price: Number(b.price),
        createdAt: b.createdAt,
      })),
      inventorySummary: {
        totalAvailableCards,
        totalSoldCards,
      },
    };
  }

  /**
   * Allocates and securely returns a block of available cards for mobile client local storage.
   */
  async reserveCards(
    tenantId: string,
    cashierId: string,
    dto: ReserveCardsDto,
  ): Promise<ReservedCardPayload[]> {
    const profile = await this.prisma.hotspotProfile.findFirst({
      where: {
        id: dto.profileId,
        tenantId,
        ...(dto.deviceId ? { deviceId: dto.deviceId } : {}),
      },
      include: {
        device: { select: { id: true, name: true } },
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'باقة الهوتسبوت المحددة غير موجودة أو لا تنتمي لهذه المنشأة',
      });
    }

    const effectiveDeviceId = dto.deviceId || profile.deviceId;

    const availableCards = await this.prisma.card.findMany({
      where: {
        tenantId,
        deviceId: effectiveDeviceId,
        profileId: dto.profileId,
        status: CardStatus.AVAILABLE,
      },
      orderBy: { serialNumber: 'asc' },
      take: dto.quantity,
    });

    if (availableCards.length === 0) {
      throw new BadRequestException({
        code: 'NO_CARDS_AVAILABLE',
        message: `لا توجد أي كروت متوفرة حالياً في باقة "${profile.name}" لحجزها لمحفظة الأوفلاين`,
      });
    }

    if (availableCards.length < dto.quantity) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_CARDS',
        message: `الكروت المتوفرة في باقة "${profile.name}" (${availableCards.length} كرت) أقل من العدد المطلوب (${dto.quantity} كرت). يرجى توليد كروت إضافية أو حجز كمية أقل.`,
      });
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: cashierId,
          action: 'RESERVE_OFFLINE_CARDS',
          entity: 'CARD',
          entityId: dto.profileId,
          newValues: {
            quantity: dto.quantity,
            cardIds: availableCards.map((c) => c.id),
            profileName: profile.name,
            deviceId: effectiveDeviceId,
          },
        },
      });
    } catch (_) {}

    return availableCards.map((card) => {
      let clearPassword = card.pinCode ?? card.username;
      const decrypted = this.encryptionService.tryDecrypt(
        card.passwordEncrypted,
        card.iv,
        card.authTag,
      );
      if (decrypted !== null) {
        clearPassword = decrypted;
      }

      const qrPayload = `http://login.hotspot/login?username=${encodeURIComponent(card.username)}&password=${encodeURIComponent(clearPassword)}`;

      return {
        id: card.id,
        serialNumber: card.serialNumber,
        username: card.username,
        password: clearPassword,
        clearPassword,
        pinCode: card.pinCode ?? clearPassword,
        price: Number(card.price),
        currency: 'SDG',
        profileId: card.profileId,
        profileName: profile.name,
        deviceId: card.deviceId,
        status: card.status,
        timeLimit: card.timeLimit,
        dataLimitBytes: card.dataLimitBytes ? Number(card.dataLimitBytes) : null,
        qrPayload,
      };
    });
  }
}
