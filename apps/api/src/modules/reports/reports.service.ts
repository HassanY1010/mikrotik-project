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
      'الموزع / نقطة البيع',
      'اسم الراوتر',
      'الرقم التسلسلي',
      'اسم المستخدم',
      'الباقة',
      'إجمالي المبلغ',
      'الخصم',
      'المبلغ المدفوع',
      'المبلغ المتبقي',
      'حالة الدفع',
      'العملة',
      'طريقة الدفع',
      'تاريخ البيع',
    ];

    const rows = transactions.map((t) => [
      `"${t.invoiceNumber}"`,
      `"${t.cashier.fullName}"`,
      `"${t.distributorName ?? ''}"`,
      `"${t.device.name}"`,
      `"${t.card.serialNumber}"`,
      `"${t.card.username}"`,
      `"${t.card.profile.name}"`,
      `"${t.amount}"`,
      `"${t.discountAmount}"`,
      `"${t.paidAmount}"`,
      `"${t.remainingAmount}"`,
      `"${t.paymentStatus}"`,
      `"${t.currency}"`,
      `"${t.paymentMethod}"`,
      `"${t.createdAt.toISOString()}"`,
    ]);

    // Prepend UTF-8 BOM (\uFEFF) for Arabic Excel compatibility
    return '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  async exportExpensesCsv(
    tenantId: string,
    startDate?: string,
    endDate?: string,
    category?: string,
  ): Promise<string> {
    const where: Prisma.ExpenseWhereInput = { tenantId };
    if (category) where.category = category as any;
    if (startDate || endDate) {
      where.expenseDate = {};
      if (startDate) where.expenseDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        if (endDate.length <= 10) end.setHours(23, 59, 59, 999);
        where.expenseDate.lte = end;
      }
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
      include: { createdBy: { select: { fullName: true } } },
    });

    const headers = [
      'تاريخ المصروف',
      'التصنيف',
      'البند / العنوان',
      'المبلغ',
      'العملة',
      'طريقة الدفع',
      'المورد / المستفيد',
      'الوصف',
      'المسؤول',
      'تاريخ التسجيل',
    ];

    const rows = expenses.map((e) => [
      `"${e.expenseDate.toISOString().split('T')[0]}"`,
      `"${e.category}"`,
      `"${e.title}"`,
      `"${e.amount}"`,
      `"${e.currency}"`,
      `"${e.paymentMethod}"`,
      `"${e.vendor ?? ''}"`,
      `"${e.description ?? ''}"`,
      `"${e.createdBy?.fullName ?? ''}"`,
      `"${e.createdAt.toISOString()}"`,
    ]);

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
