import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SalesQueryDto } from '../sales/dto/sales-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportSalesCsv(tenantId: string, query: SalesQueryDto): Promise<string> {
    const where: Prisma.SaleTransactionWhereInput = { tenantId };

    if (query.deviceId) where.deviceId = query.deviceId;
    if (query.cashierId) where.cashierId = query.cashierId;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const transactions = await this.prisma.saleTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        cashier: { select: { fullName: true } },
        device: { select: { name: true } },
        card: {
          select: {
            serialNumber: true,
            username: true,
            profile: { select: { name: true } },
          },
        },
      },
    });

    const headers = [
      'رقم الفاتورة',
      'اسم الكاشير',
      'اسم الراوتر',
      'الرقم التسلسلي',
      'اسم المستخدم',
      'الباقة',
      'المبلغ',
      'العملة',
      'طريقة الدفع',
      'تاريخ البيع',
    ];

    const rows = transactions.map((t) => [
      `"${t.invoiceNumber}"`,
      `"${t.cashier.fullName}"`,
      `"${t.device.name}"`,
      `"${t.card.serialNumber}"`,
      `"${t.card.username}"`,
      `"${t.card.profile.name}"`,
      `"${t.amount}"`,
      `"${t.currency}"`,
      `"${t.paymentMethod}"`,
      `"${t.createdAt.toISOString()}"`,
    ]);

    // Prepend UTF-8 BOM (\uFEFF) for Arabic Excel compatibility
    return '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  async exportCardsCsv(tenantId: string, batchId?: string, deviceId?: string): Promise<string> {
    const where: Prisma.CardWhereInput = { tenantId };
    if (batchId) where.batchId = batchId;
    if (deviceId) where.deviceId = deviceId;

    const cards = await this.prisma.card.findMany({
      where,
      orderBy: { serialNumber: 'asc' },
      include: {
        device: { select: { name: true } },
        profile: { select: { name: true } },
        soldBy: { select: { fullName: true } },
      },
    });

    const headers = [
      'الرقم التسلسلي',
      'اسم المستخدم',
      'رمز PIN',
      'الباقة',
      'الراوتر',
      'السعر',
      'الحالة',
      'حالة المزامنة',
      'تاريخ البيع',
      'البائع',
      'تاريخ الإنشاء',
    ];

    const rows = cards.map((c) => [
      `"${c.serialNumber}"`,
      `"${c.username}"`,
      `"${c.pinCode ?? ''}"`,
      `"${c.profile.name}"`,
      `"${c.device.name}"`,
      `"${c.price}"`,
      `"${c.status}"`,
      `"${c.syncStatus}"`,
      `"${c.soldAt ? c.soldAt.toISOString() : ''}"`,
      `"${c.soldBy ? c.soldBy.fullName : ''}"`,
      `"${c.createdAt.toISOString()}"`,
    ]);

    return '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
