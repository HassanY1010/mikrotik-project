import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
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
  currency: string;
  paymentMethodBreakdown: Record<PaymentMethod, { count: number; total: number }>;
  profileBreakdown: Array<{ profileName: string; count: number; total: number; totalAmount?: number }>;
}

export interface DailySalesReport {
  date: string;
  totalTransactions: number;
  totalRevenue: number;
  currency: string;
  byDevice: Array<{ deviceId: string; deviceName: string; count: number; total: number }>;
  byCashier: Array<{ cashierId: string; cashierName: string; count: number; total: number }>;
  byProfile: Array<{ profileName: string; count: number; total: number }>;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
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
  ): Promise<{ transactions: SaleTransaction[]; receipts: ThermalReceiptPayload[] }> {
    const quantity = dto.quantity ?? 1;

    // Verify tenant exists and fetch currency/metadata
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    // Verify device and profile
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id: dto.deviceId, tenantId, deletedAt: null },
    });
    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: 'Device not found for this tenant',
      });
    }

    const profile = await this.prisma.hotspotProfile.findFirst({
      where: { id: dto.profileId, tenantId, deviceId: dto.deviceId },
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'Hotspot profile not found on this device',
      });
    }

    const cashier = await this.prisma.user.findFirst({
      where: { id: cashierId, tenantId },
    });
    const cashierName = cashier ? cashier.fullName : 'Cashier';

    // Find requested cards (either specific cardId or next available in this profile)
    let cardsToSell: Card[] = [];

    if (dto.cardId) {
      const specificCard = await this.prisma.card.findFirst({
        where: {
          id: dto.cardId,
          tenantId,
          deviceId: dto.deviceId,
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
          deviceId: dto.deviceId,
          profileId: dto.profileId,
          status: CardStatus.AVAILABLE,
        },
        orderBy: { createdAt: 'asc' },
        take: quantity,
      });

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

    // Atomically mark cards as SOLD and insert SaleTransactions
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
            deviceId: dto.deviceId,
            amount: card.price,
            currency: tenant.currency ?? 'SDG',
            paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
            customerPhone: dto.customerPhone ?? null,
            customerName: dto.customerName ?? null,
            invoiceNumber,
            printedCount: 1,
            lastPrintedAt: new Date(),
          },
        });
        createdTransactions.push(transaction);
      }
    });

    // Build thermal receipts with decrypted credentials and QR codes
    for (let i = 0; i < cardsToSell.length; i++) {
      const card = cardsToSell[i];
      const tx = createdTransactions[i];

      const password = this.encryptionService.decrypt(
        card.passwordEncrypted,
        card.iv,
        card.authTag,
      );

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

    return { transactions: createdTransactions, receipts };
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

    const password = this.encryptionService.decrypt(
      tx.card.passwordEncrypted,
      tx.card.iv,
      tx.card.authTag,
    );

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

    const where: any = {
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

    let totalRevenue = 0;
    const currency = transactions[0]?.currency ?? 'SDG';

    const paymentMethodBreakdown: Record<PaymentMethod, { count: number; total: number }> = {
      [PaymentMethod.CASH]: { count: 0, total: 0 },
      [PaymentMethod.CARD]: { count: 0, total: 0 },
      [PaymentMethod.MOBILE_WALLET]: { count: 0, total: 0 },
      [PaymentMethod.TRANSFER]: { count: 0, total: 0 },
    };

    const profileMap = new Map<string, { count: number; total: number }>();

    for (const t of transactions) {
      const amount = Number(t.amount);
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
      totalSalesCount: transactions.length,
      totalRevenue,
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

    let totalRevenue = 0;
    const currency = transactions[0]?.currency ?? 'SDG';

    const deviceMap = new Map<string, { deviceName: string; count: number; total: number }>();
    const cashierMap = new Map<string, { cashierName: string; count: number; total: number }>();
    const profileMap = new Map<string, { count: number; total: number }>();

    for (const t of transactions) {
      const amount = Number(t.amount);
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
