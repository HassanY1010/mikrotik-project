import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { Prisma, ExpenseCategory, PaymentMethod } from '@prisma/client';

export interface ExpenseCategorySummary {
  category: ExpenseCategory;
  categoryLabelAr: string;
  totalAmount: number;
  count: number;
  percentage: number;
}

export interface ExpensesSummaryResult {
  totalExpenses: number;
  totalCount: number;
  currency: string;
  startDate?: string;
  endDate?: string;
  byCategory: ExpenseCategorySummary[];
  byPaymentMethod: Record<PaymentMethod, { total: number; count: number }>;
}

export const EXPENSE_CATEGORY_ARABIC_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.INTERNET_UPSTREAM]: 'اشتراك الإنترنت الأساسي (مزود الخدمة)',
  [ExpenseCategory.ELECTRICITY]: 'الكهرباء والطاقة والبطاريات',
  [ExpenseCategory.PAPER_AND_INK]: 'ورق وحبر وطباعة الكروت',
  [ExpenseCategory.HARDWARE_MAINTENANCE]: 'صيانة أجهزة MikroTik والشبكة',
  [ExpenseCategory.SALARIES]: 'رواتب الموظفين والكاشيرات',
  [ExpenseCategory.COMMISSIONS]: 'عمولات الموزعين ونقاط البيع',
  [ExpenseCategory.RENT]: 'إيجار المواقع والأبراج',
  [ExpenseCategory.OTHER]: 'مصروفات تشغيلية أخرى',
};

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateExpenseDto) {
    const expenseDate = dto.expenseDate ? new Date(dto.expenseDate) : new Date();

    const expense = await this.prisma.expense.create({
      data: {
        tenantId,
        title: dto.title,
        category: dto.category,
        amount: dto.amount,
        currency: dto.currency || 'SDG',
        expenseDate,
        paymentMethod: dto.paymentMethod || PaymentMethod.CASH,
        vendor: dto.vendor,
        description: dto.description,
        receiptUrl: dto.receiptUrl,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    this.logger.log(
      `Expense created: [${expense.id}] "${expense.title}" - ${expense.amount} ${expense.currency} for tenant ${tenantId}`,
    );

    return {
      ...expense,
      amount: Number(expense.amount),
      categoryLabelAr: EXPENSE_CATEGORY_ARABIC_LABELS[expense.category] || expense.category,
    };
  }

  async findAll(tenantId: string, query: ExpenseQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = { tenantId };

    if (query.category) where.category = query.category;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;

    if (query.startDate || query.endDate) {
      where.expenseDate = {};
      if (query.startDate) where.expenseDate.gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (query.endDate.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        where.expenseDate.lte = end;
      }
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { vendor: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        skip,
        take: limit,
        include: {
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);

    const data = expenses.map((e) => ({
      ...e,
      amount: Number(e.amount),
      categoryLabelAr: EXPENSE_CATEGORY_ARABIC_LABELS[e.category] || e.category,
    }));

    return { data, total, page, limit };
  }

  async findOne(tenantId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException({
        code: 'EXPENSE_NOT_FOUND',
        message: `Expense ${id} not found`,
      });
    }

    return {
      ...expense,
      amount: Number(expense.amount),
      categoryLabelAr: EXPENSE_CATEGORY_ARABIC_LABELS[expense.category] || expense.category,
    };
  }

  async update(tenantId: string, id: string, dto: UpdateExpenseDto) {
    const existing = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException({
        code: 'EXPENSE_NOT_FOUND',
        message: `Expense ${id} not found`,
      });
    }

    const data: Prisma.ExpenseUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.expenseDate !== undefined) data.expenseDate = new Date(dto.expenseDate);
    if (dto.paymentMethod !== undefined) data.paymentMethod = dto.paymentMethod;
    if (dto.vendor !== undefined) data.vendor = dto.vendor;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.receiptUrl !== undefined) data.receiptUrl = dto.receiptUrl;

    const updated = await this.prisma.expense.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
      categoryLabelAr: EXPENSE_CATEGORY_ARABIC_LABELS[updated.category] || updated.category,
    };
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException({
        code: 'EXPENSE_NOT_FOUND',
        message: `Expense ${id} not found`,
      });
    }

    await this.prisma.expense.delete({ where: { id } });
    this.logger.log(`Expense deleted: [${id}] for tenant ${tenantId}`);

    return { success: true, message: 'تم حذف المصروف بنجاح' };
  }

  async getSummary(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<ExpensesSummaryResult> {
    const where: Prisma.ExpenseWhereInput = { tenantId };

    if (startDate || endDate) {
      where.expenseDate = {};
      if (startDate) where.expenseDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        if (endDate.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        where.expenseDate.lte = end;
      }
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'asc' },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });
    const currency = expenses[0]?.currency || tenant?.currency || 'SDG';

    let totalExpenses = 0;
    const categoryMap = new Map<ExpenseCategory, { total: number; count: number }>();
    const paymentMethodBreakdown: Record<PaymentMethod, { total: number; count: number }> = {
      [PaymentMethod.CASH]: { total: 0, count: 0 },
      [PaymentMethod.CARD]: { total: 0, count: 0 },
      [PaymentMethod.MOBILE_WALLET]: { total: 0, count: 0 },
      [PaymentMethod.TRANSFER]: { total: 0, count: 0 },
    };

    for (const e of expenses) {
      const amt = Number(e.amount);
      totalExpenses += amt;

      const cat = categoryMap.get(e.category) ?? { total: 0, count: 0 };
      cat.total += amt;
      cat.count += 1;
      categoryMap.set(e.category, cat);

      if (paymentMethodBreakdown[e.paymentMethod]) {
        paymentMethodBreakdown[e.paymentMethod].total += amt;
        paymentMethodBreakdown[e.paymentMethod].count += 1;
      }
    }

    const byCategory: ExpenseCategorySummary[] = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        categoryLabelAr: EXPENSE_CATEGORY_ARABIC_LABELS[category] || category,
        totalAmount: data.total,
        count: data.count,
        percentage: totalExpenses > 0 ? Math.round((data.total / totalExpenses) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      totalExpenses,
      totalCount: expenses.length,
      currency,
      startDate,
      endDate,
      byCategory,
      byPaymentMethod: paymentMethodBreakdown,
    };
  }
}
