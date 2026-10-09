import { Injectable, NotFoundException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { CardsService } from '../../cards/services/cards.service';
import { CheckoutSaleDto } from '../dto/checkout-sale.dto';
import { RefundSaleDto } from '../dto/refund-sale.dto';
import { SalesQueryDto } from '../dto/sales-query.dto';
import { CardStatus, PaymentMethod, Prisma, Card, SaleTransaction } from '@prisma/client';
import * as crypto from 'crypto';
import * as qrcode from 'qrcode';

export interface ThermalReceiptPayload {
  invoiceNumber: string;
  tenantName: string;
  tenantPhone: string | null;
  cashierName: string;
  deviceName: string;
  profileName: string;
  serialNumber: string;
  username: string;
  password: string;
  pinCode: string;
  price: number;
  currency: string;
  paymentMethod: PaymentMethod;
  timeLimit: string | null;
  dataLimitBytes: number | null;
  qrDataUrl: string;
  printedCount: number;
  createdAt: Date;
}

export interface ShiftSummaryReport {
  cashierId: string;
  cashierName: string;
  periodStart: Date;
  periodEnd: Date;
  totalTransactions: number;
  totalSalesCount?: number;
  totalRevenue: number;
  grossRevenue?: number;
  totalRefunds?: number;
  refundedCount?: number;
  currency: string;
  paymentMethodBreakdown: Record<PaymentMethod, { count: number; total: number }>;
  profileBreakdown: Array<{ profileName: string; count: number; total: number; totalAmount?: number }>;
}

export interface DailySalesReport {
  date: string;
  totalTransactions: number;
  totalRevenue: number;
  grossRevenue?: number;
  totalRefunds?: number;
  refundedCount?: number;
  currency: string;
  byDevice: Array<{ deviceId: string; deviceName: string; count: number; total: number }>;
  byCashier: Array<{ cashierId: string; cashierName: string; count: number; total: number }>;
  byProfile: Array<{ profileName: string; count: number; total: number }>;
}

export interface CheckoutResultPayload {
  transactions: SaleTransaction[];
  receipts: ThermalReceiptPayload[];
  transaction: SaleTransaction;
  receipt: ThermalReceiptPayload;
  invoiceNumber: string;
  card: {
    id: string;
    serialNumber: string;
    username: string;
    password: string;
    pinCode: string;
    price: number;
  };
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  // In-memory idempotency cache (TTL: 10 minutes)
  private readonly idempotencyCache = new Map<
    string,
    { result: CheckoutResultPayload; timestamp: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
    @Optional() private readonly cardsService?: CardsService,
  ) {}

  private generateInvoiceNumber(): string {
    const now = new Date();
    const yy = (now.getFullYear() % 100).toString().padStart(2, '0');
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `INV-${yy}${mm}${dd}-${rand}`;
  }

  async checkout(
    tenantId: string,
    cashierId: string,
    dto: CheckoutSaleDto,
  ): Promise<CheckoutResultPayload> {
    // 0. Idempotency check: prevent duplicate charges on network retries
    if (dto.idempotencyKey) {
      const cached = this.idempotencyCache.get(dto.idempotencyKey);
      if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        this.logger.log(`Idempotent hit for checkout key: ${dto.idempotencyKey}`);
        return cached.result;
      }
    }

    const quantity = dto.quantity ?? 1;

    // 1. Verify tenant exists and fetch currency/metadata
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    // 2. Resolve profile and device (auto-resolves deviceId if missing or mismatched)
    let profile = null;
    if (dto.deviceId) {
      profile = await this.prisma.hotspotProfile.findFirst({
        where: { id: dto.profileId, tenantId, deviceId: dto.deviceId },
      });
    }
    if (!profile) {
      profile = await this.prisma.hotspotProfile.findFirst({
        where: { id: dto.profileId, tenantId },
      });
    }

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'Hotspot profile not found for this tenant',
      });
    }

    const effectiveDeviceId = profile.deviceId;
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id: effectiveDeviceId, tenantId, deletedAt: null },
    });
    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: 'Device not found for this profile',
      });
    }

    const cashier = await this.prisma.user.findFirst({
      where: { id: cashierId, tenantId },
    });
    const cashierName = cashier ? cashier.fullName : 'الكاشير';

    // 3. Normalize payment method
    let paymentMethod: PaymentMethod = PaymentMethod.CASH;
    const pmRaw = String(dto.paymentMethod || 'CASH').toUpperCase();
    if (pmRaw === 'BANK' || pmRaw === 'TRANSFER') {
      paymentMethod = PaymentMethod.TRANSFER;
    } else if (
      pmRaw === 'CASH_FAWRI' ||
      pmRaw === 'FAWRI' ||
      pmRaw === 'MOBILE_WALLET'
    ) {
      paymentMethod = PaymentMethod.MOBILE_WALLET;
    } else if (pmRaw === 'CARD') {
      paymentMethod = PaymentMethod.CARD;
    } else {
      paymentMethod = PaymentMethod.CASH;
    }

    // 4. Find requested cards (either specific cardId or next available in this profile)
    let cardsToSell: Card[] = [];

    if (dto.cardId) {
      const specificCard = await this.prisma.card.findFirst({
        where: {
          id: dto.cardId,
          tenantId,
          deviceId: effectiveDeviceId,
          profileId: dto.profileId,
          status: CardStatus.AVAILABLE,
        },
      });

      if (!specificCard) {
        throw new BadRequestException({
          code: 'CARD_UNAVAILABLE',
          message: 'The requested card is not available for sale',
        });
      }
      cardsToSell = [specificCard];
    } else {
      cardsToSell = await this.prisma.card.findMany({
        where: {
          tenantId,
          deviceId: effectiveDeviceId,
          profileId: dto.profileId,
          status: CardStatus.AVAILABLE,
        },
        orderBy: { createdAt: 'asc' },
        take: quantity,
      });

      // 5. On-Demand generation fallback: if inventory is low and cardsService is available, generate cards instantly!
      if (cardsToSell.length < quantity && this.cardsService) {
        const needed = quantity - cardsToSell.length;
        const batchToCreate = Math.max(needed, 5);
        this.logger.log(
          `POS inventory low for profile "${profile.name}". Auto-generating ${batchToCreate} on-demand cards.`,
        );

        try {
          await this.cardsService.createBatch(tenantId, cashierId, {
            deviceId: effectiveDeviceId,
            profileId: dto.profileId,
            totalCards: batchToCreate,
            length: 6,
            pattern: 'NUMERIC',
            singleCredential: true,
            syncToRouter: device.isOnline,
          });

          // Re-query available cards after batch generation
          cardsToSell = await this.prisma.card.findMany({
            where: {
              tenantId,
              deviceId: effectiveDeviceId,
              profileId: dto.profileId,
              status: CardStatus.AVAILABLE,
            },
            orderBy: { createdAt: 'asc' },
            take: quantity,
          });
        } catch (genErr) {
          this.logger.warn(`Could not auto-generate batch for POS: ${genErr}`);
        }
      }

      if (cardsToSell.length < quantity) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_CARDS',
          message: `Only ${cardsToSell.length} card(s) available for profile "${profile.name}". Requested: ${quantity}. Please generate more cards.`,
        });
      }
    }

    const createdTransactions: SaleTransaction[] = [];
    const receipts: ThermalReceiptPayload[] = [];
    const cardIdsToUpdate = cardsToSell.map((c) => c.id);

    // 6. Atomically mark cards as SOLD and insert SaleTransactions
    await this.prisma.$transaction(async (tx) => {
      // Mark cards SOLD
      await tx.card.updateMany({
        where: { id: { in: cardIdsToUpdate } },
        data: {
          status: CardStatus.SOLD,
          soldAt: new Date(),
          soldById: cashierId,
        },
      });

      for (const card of cardsToSell) {
        const invoiceNumber = this.generateInvoiceNumber();
        const transaction = await tx.saleTransaction.create({
          data: {
            tenantId,
            cardId: card.id,
            cashierId,
            deviceId: effectiveDeviceId,
            amount: card.price,
            currency: tenant.currency ?? 'SDG',
            paymentMethod,
            customerPhone: dto.customerPhone ?? null,
            customerName: dto.customerName ?? null,
            invoiceNumber,
            printedCount: 1,
            lastPrintedAt: new Date(),
          },
        });
        createdTransactions.push(transaction);
      }

      // 6.5. Award Loyalty Points: 1 point per 100 SDG (minimum 1 point)
      const totalAmountEarned = cardsToSell.reduce((sum, c) => sum + Number(c.price), 0);
      const pointsEarned = Math.max(1, Math.floor(totalAmountEarned / 100));
      const refInvoice = createdTransactions[0]?.invoiceNumber ?? 'POS-SALE';
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          loyaltyPoints: { increment: pointsEarned },
        },
      });
      await tx.tenantWalletTransaction.create({
        data: {
          tenantId,
          amount: 0,
          type: 'BONUS',
          pointsDelta: pointsEarned,
          balanceAfter: Number(tenant.walletBalance ?? 0),
          reference: refInvoice,
          notes: `نقاط ولاء مكتسبة من عملية بيع ${refInvoice}`,
          createdById: cashierId,
        },
      });
    });

    // 7. Build thermal receipts with decrypted credentials and QR codes
    for (let i = 0; i < cardsToSell.length; i++) {
      const card = cardsToSell[i];
      const tx = createdTransactions[i];

      let password = card.pinCode ?? card.username;
      const decrypted = this.encryptionService.tryDecrypt(
        card.passwordEncrypted,
        card.iv,
        card.authTag,
      );
      if (decrypted !== null) {
        password = decrypted;
      } else {
        this.logger.warn(`Could not decrypt password for card ${card.username}, using pinCode fallback`);
      }

      const qrPayload = `http://login.hotspot/login?username=${encodeURIComponent(card.username)}&password=${encodeURIComponent(password)}`;
      const qrDataUrl = await qrcode.toDataURL(qrPayload, {
        margin: 1,
        width: 256,
        errorCorrectionLevel: 'M',
      });

      receipts.push({
        invoiceNumber: tx.invoiceNumber,
        tenantName: tenant.name,
        tenantPhone: tenant.phone,
        cashierName,
        deviceName: device.name,
        profileName: profile.name,
        serialNumber: card.serialNumber,
        username: card.username,
        password,
        pinCode: card.pinCode ?? password,
        price: Number(card.price),
        currency: tenant.currency ?? 'SDG',
        paymentMethod: tx.paymentMethod,
        timeLimit: card.timeLimit,
        dataLimitBytes: card.dataLimitBytes ? Number(card.dataLimitBytes) : null,
        qrDataUrl,
        printedCount: 1,
        createdAt: tx.createdAt,
      });
    }

    this.logger.log(
      `POS checkout completed: ${cardsToSell.length} card(s) sold by cashier ${cashierId}`,
    );

    const result: CheckoutResultPayload = {
      transactions: createdTransactions,
      receipts,
      transaction: createdTransactions[0],
      receipt: receipts[0],
      invoiceNumber: receipts[0].invoiceNumber,
      card: {
        id: cardsToSell[0].id,
        serialNumber: cardsToSell[0].serialNumber,
        username: cardsToSell[0].username,
        password: receipts[0].password,
        pinCode: receipts[0].pinCode,
        price: receipts[0].price,
      },
    };

    // Store in idempotency cache
    if (dto.idempotencyKey) {
      this.idempotencyCache.set(dto.idempotencyKey, {
        result,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  async getReceipt(tenantId: string, transactionId: string): Promise<ThermalReceiptPayload> {
    const tx = await this.prisma.saleTransaction.findFirst({
      where: { id: transactionId, tenantId },
      include: {
        tenant: true,
        cashier: true,
        device: true,
        card: {
          include: { profile: true },
        },
      },
    });

    if (!tx) {
      throw new NotFoundException({
        code: 'TRANSACTION_NOT_FOUND',
        message: `Sale transaction with ID ${transactionId} was not found`,
      });
    }

    // Increment printedCount
    const updatedTx = await this.prisma.saleTransaction.update({
      where: { id: transactionId },
      data: {
        printedCount: tx.printedCount + 1,
        lastPrintedAt: new Date(),
      },
    });

    let password = tx.card.pinCode ?? tx.card.username;
    const decrypted = this.encryptionService.tryDecrypt(
      tx.card.passwordEncrypted,
      tx.card.iv,
      tx.card.authTag,
    );
    if (decrypted !== null) {
      password = decrypted;
    } else {
      this.logger.warn(`Could not decrypt password for transaction ${transactionId}, using pinCode fallback`);
    }

    const qrPayload = `http://login.hotspot/login?username=${encodeURIComponent(tx.card.username)}&password=${encodeURIComponent(password)}`;
    const qrDataUrl = await qrcode.toDataURL(qrPayload, {
      margin: 1,
      width: 256,
      errorCorrectionLevel: 'M',
    });

    return {
      invoiceNumber: updatedTx.invoiceNumber,
      tenantName: tx.tenant.name,
      tenantPhone: tx.tenant.phone,
      cashierName: tx.cashier.fullName,
      deviceName: tx.device.name,
      profileName: tx.card.profile.name,
      serialNumber: tx.card.serialNumber,
      username: tx.card.username,
      password,
      pinCode: tx.card.pinCode ?? password,
      price: Number(tx.amount),
      currency: tx.currency,
      paymentMethod: tx.paymentMethod,
      timeLimit: tx.card.timeLimit,
      dataLimitBytes: tx.card.dataLimitBytes ? Number(tx.card.dataLimitBytes) : null,
      qrDataUrl,
      printedCount: updatedTx.printedCount,
      createdAt: updatedTx.createdAt,
    };
  }

  async refund(
    tenantId: string,
    transactionId: string,
    _cashierId: string,
    dto: RefundSaleDto,
  ): Promise<{ success: boolean; message: string }> {
    const tx = await this.prisma.saleTransaction.findFirst({
      where: { id: transactionId, tenantId },
      include: {
        card: true,
        device: true,
      },
    });

    if (!tx) {
      throw new NotFoundException({
        code: 'TRANSACTION_NOT_FOUND',
        message: `Transaction ${transactionId} not found`,
      });
    }

    if (tx.card.status === CardStatus.DISABLED) {
      throw new BadRequestException({
        code: 'SALE_ALREADY_REFUNDED',
        message: `Sale transaction ${transactionId} has already been refunded`,
      });
    }

    // Mark card as DISABLED
    await this.prisma.card.update({
      where: { id: tx.cardId },
      data: { status: CardStatus.DISABLED },
    });

    // Command router to disable HotSpot user
    try {
      const client = await this.mikrotikClientFactory.getClient({
        id: tx.device.id,
        name: tx.device.name,
        host: tx.device.host,
        apiPort: tx.device.apiPort,
        restPort: tx.device.restPort,
        useSsl: tx.device.useSsl,
        username: tx.device.username,
        passwordEncrypted: tx.device.passwordEncrypted,
        iv: tx.device.iv,
        authTag: tx.device.authTag,
        rosVersion: tx.device.rosVersion,
      });

      await client.disableHotspotUser(tx.card.username);
    } catch (err) {
      this.logger.warn(`Could not disable hotspot user on router during refund: ${err}`);
    }

    // Deduct loyalty points previously awarded for this refunded sale
    try {
      const pointsToDeduct = Math.max(1, Math.floor(Number(tx.amount) / 100));
      const tenantRecord = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const currentPoints = tenantRecord?.loyaltyPoints ?? 0;
      const actualDeduction = Math.min(currentPoints, pointsToDeduct);
      if (actualDeduction > 0) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { loyaltyPoints: { decrement: actualDeduction } },
        });
        await this.prisma.tenantWalletTransaction.create({
          data: {
            tenantId,
            amount: 0,
            type: 'ADJUSTMENT',
            pointsDelta: -actualDeduction,
            balanceAfter: Number(tenantRecord?.walletBalance ?? 0),
            reference: tx.invoiceNumber,
            notes: `خصم نقاط ولاء بسبب استرجاع الفاتورة ${tx.invoiceNumber}`,
            createdById: _cashierId,
          },
        });
      }
    } catch (pointsErr) {
      this.logger.warn(`Could not adjust loyalty points during refund: ${pointsErr}`);
    }

    this.logger.log(
      `Transaction ${transactionId} refunded for card ${tx.card.serialNumber}. Reason: ${dto.reason}`,
    );

    return {
      success: true,
      message: `Card ${tx.card.serialNumber} refunded and disabled successfully`,
    };
  }

  async listTransactions(tenantId: string, query: SalesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.SaleTransactionWhereInput = { tenantId };

    if (query.deviceId) where.deviceId = query.deviceId;
    if (query.cashierId) where.cashierId = query.cashierId;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [transactions, total] = await Promise.all([
      this.prisma.saleTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          cashier: { select: { fullName: true } },
          device: { select: { name: true } },
          card: {
            select: {
              serialNumber: true,
              username: true,
              status: true,
              profile: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.saleTransaction.count({ where }),
    ]);

    const data = transactions.map((t) => ({
      id: t.id,
      invoiceNumber: t.invoiceNumber,
      amount: Number(t.amount),
      currency: t.currency,
      paymentMethod: t.paymentMethod,
      customerName: t.customerName,
      customerPhone: t.customerPhone,
      cashierName: t.cashier.fullName,
      deviceName: t.device.name,
      cardSerialNumber: t.card.serialNumber,
      cardUsername: t.card.username,
      cardStatus: t.card.status,
      profileName: t.card.profile.name,
      printedCount: t.printedCount,
      lastPrintedAt: t.lastPrintedAt,
      createdAt: t.createdAt,
      isRefunded: t.card.status === CardStatus.DISABLED,
      card: {
        serialNumber: t.card.serialNumber,
        username: t.card.username,
      },
    }));

    return { data, total, page, limit };
  }

  async getShiftSummary(tenantId: string, cashierId: string): Promise<ShiftSummaryReport> {
    const user = await this.prisma.user.findFirst({
      where: { id: cashierId },
      include: { role: true },
    });

    // Today's shift (starts at 00:00:00 today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Prisma.SaleTransactionWhereInput = {
      tenantId,
      createdAt: { gte: today },
    };

    // If the caller is specifically a CASHIER, scope to their own transactions
    if (user?.role?.name === 'CASHIER') {
      where.cashierId = cashierId;
    }

    const transactions = await this.prisma.saleTransaction.findMany({
      where,
      include: {
        card: {
          include: { profile: true },
        },
      },
    });

    const currency = transactions[0]?.currency ?? 'SDG';

    const paymentMethodBreakdown: Record<PaymentMethod, { count: number; total: number }> = {
      [PaymentMethod.CASH]: { count: 0, total: 0 },
      [PaymentMethod.CARD]: { count: 0, total: 0 },
      [PaymentMethod.MOBILE_WALLET]: { count: 0, total: 0 },
      [PaymentMethod.TRANSFER]: { count: 0, total: 0 },
    };

    const profileMap = new Map<string, { count: number; total: number }>();

    let grossRevenue = 0;
    let totalRevenue = 0;
    let totalRefunds = 0;
    let refundedCount = 0;

    for (const t of transactions) {
      const amount = Number(t.amount);
      const isRefunded = t.card.status === CardStatus.DISABLED;

      if (isRefunded) {
        totalRefunds += amount;
        refundedCount++;
        continue;
      }

      grossRevenue += amount;
      totalRevenue += amount;

      // Payment method tally
      if (paymentMethodBreakdown[t.paymentMethod]) {
        paymentMethodBreakdown[t.paymentMethod].count++;
        paymentMethodBreakdown[t.paymentMethod].total += amount;
      }

      // Profile tally
      const profileName = t.card.profile.name;
      const current = profileMap.get(profileName) ?? { count: 0, total: 0 };
      current.count++;
      current.total += amount;
      profileMap.set(profileName, current);
    }

    const profileBreakdown = Array.from(profileMap.entries()).map(([profileName, data]) => ({
      profileName,
      count: data.count,
      total: data.total,
      totalAmount: data.total,
    }));

    return {
      cashierId: user?.id ?? cashierId,
      cashierName: user?.fullName ?? 'الوردية العامة',
      periodStart: today,
      periodEnd: new Date(),
      totalTransactions: transactions.length,
      totalSalesCount: transactions.length - refundedCount,
      totalRevenue,
      grossRevenue,
      totalRefunds,
      refundedCount,
      currency,
      paymentMethodBreakdown,
      profileBreakdown,
    };
  }

  async getDailyReport(tenantId: string, dateStr?: string): Promise<DailySalesReport> {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await this.prisma.saleTransaction.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        cashier: true,
        device: true,
        card: {
          include: { profile: true },
        },
      },
    });

    const currency = transactions[0]?.currency ?? 'SDG';

    const deviceMap = new Map<string, { deviceName: string; count: number; total: number }>();
    const cashierMap = new Map<string, { cashierName: string; count: number; total: number }>();
    const profileMap = new Map<string, { count: number; total: number }>();

    let grossRevenue = 0;
    let totalRevenue = 0;
    let totalRefunds = 0;
    let refundedCount = 0;

    for (const t of transactions) {
      const amount = Number(t.amount);
      const isRefunded = t.card.status === CardStatus.DISABLED;

      if (isRefunded) {
        totalRefunds += amount;
        refundedCount++;
        continue;
      }

      grossRevenue += amount;
      totalRevenue += amount;

      // Device aggregation
      const dev = deviceMap.get(t.deviceId) ?? { deviceName: t.device.name, count: 0, total: 0 };
      dev.count++;
      dev.total += amount;
      deviceMap.set(t.deviceId, dev);

      // Cashier aggregation
      const cash = cashierMap.get(t.cashierId) ?? {
        cashierName: t.cashier.fullName,
        count: 0,
        total: 0,
      };
      cash.count++;
      cash.total += amount;
      cashierMap.set(t.cashierId, cash);

      // Profile aggregation
      const prof = profileMap.get(t.card.profile.name) ?? { count: 0, total: 0 };
      prof.count++;
      prof.total += amount;
      profileMap.set(t.card.profile.name, prof);
    }

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalTransactions: transactions.length,
      totalRevenue,
      grossRevenue,
      totalRefunds,
      refundedCount,
      currency,
      byDevice: Array.from(deviceMap.entries()).map(([deviceId, d]) => ({
        deviceId,
        deviceName: d.deviceName,
        count: d.count,
        total: d.total,
      })),
      byCashier: Array.from(cashierMap.entries()).map(([cashierId, c]) => ({
        cashierId,
        cashierName: c.cashierName,
        count: c.count,
        total: c.total,
      })),
      byProfile: Array.from(profileMap.entries()).map(([profileName, p]) => ({
        profileName,
        count: p.count,
        total: p.total,
      })),
    };
  }
}
