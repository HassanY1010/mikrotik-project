import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService, EXPENSE_CATEGORY_ARABIC_LABELS } from './expenses.service';
import { PrismaService } from '../../core/database/prisma.service';
import { ExpenseCategory, PaymentMethod } from '@prisma/client';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: {
    expense: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    tenant: {
      findUnique: jest.Mock;
    };
  };

  const mockTenantId = 'tenant-uuid-101';
  const mockUserId = 'user-uuid-202';

  beforeEach(async () => {
    prisma = {
      expense: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: mockTenantId, currency: 'SDG' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
  });

  it('should be defined and export category Arabic labels', () => {
    expect(service).toBeDefined();
    expect(EXPENSE_CATEGORY_ARABIC_LABELS[ExpenseCategory.INTERNET_UPSTREAM]).toContain('اشتراك الإنترنت');
    expect(EXPENSE_CATEGORY_ARABIC_LABELS[ExpenseCategory.PAPER_AND_INK]).toContain('ورق وحبر');
  });

  it('should record an operational expense with correct tenant and currency', async () => {
    const mockExpense = {
      id: 'exp-1',
      tenantId: mockTenantId,
      title: 'شراء ورق A4 وحبر للطابعة',
      category: ExpenseCategory.PAPER_AND_INK,
      amount: '5000',
      currency: 'SDG',
      expenseDate: new Date('2026-10-21'),
      paymentMethod: PaymentMethod.CASH,
      vendor: 'مكتبة الخرطوم',
      description: 'كرتونة ورق + عبوتين حبر كانون',
      createdById: mockUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: { id: mockUserId, fullName: 'أحمد عثمان', email: 'ahmed@sudafi.net' },
    };

    prisma.expense.create.mockResolvedValue(mockExpense);

    const result = await service.create(mockTenantId, mockUserId, {
      title: 'شراء ورق A4 وحبر للطابعة',
      category: ExpenseCategory.PAPER_AND_INK,
      amount: 5000,
      currency: 'SDG',
      paymentMethod: PaymentMethod.CASH,
      vendor: 'مكتبة الخرطوم',
      description: 'كرتونة ورق + عبوتين حبر كانون',
    });

    expect(prisma.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: mockTenantId,
        title: 'شراء ورق A4 وحبر للطابعة',
        category: ExpenseCategory.PAPER_AND_INK,
        amount: 5000,
        currency: 'SDG',
        createdById: mockUserId,
      }),
      include: expect.any(Object),
    });

    expect(result.amount).toBe(5000);
    expect(result.categoryLabelAr).toContain('ورق وحبر');
  });

  it('should correctly summarize expenses by category and calculate percentages', async () => {
    const expenses = [
      {
        id: '1',
        category: ExpenseCategory.INTERNET_UPSTREAM,
        amount: '60000',
        paymentMethod: PaymentMethod.TRANSFER,
        expenseDate: new Date('2026-10-01'),
        currency: 'SDG',
      },
      {
        id: '2',
        category: ExpenseCategory.ELECTRICITY,
        amount: '20000',
        paymentMethod: PaymentMethod.CASH,
        expenseDate: new Date('2026-10-05'),
        currency: 'SDG',
      },
      {
        id: '3',
        category: ExpenseCategory.PAPER_AND_INK,
        amount: '20000',
        paymentMethod: PaymentMethod.CASH,
        expenseDate: new Date('2026-10-10'),
        currency: 'SDG',
      },
    ];

    prisma.expense.findMany.mockResolvedValue(expenses);

    const summary = await service.getSummary(mockTenantId);

    expect(summary.totalExpenses).toBe(100000);
    expect(summary.totalCount).toBe(3);
    expect(summary.currency).toBe('SDG');

    // Internet upstream is 60,000 / 100,000 = 60%
    const internetCat = summary.byCategory.find((c) => c.category === ExpenseCategory.INTERNET_UPSTREAM);
    expect(internetCat?.totalAmount).toBe(60000);
    expect(internetCat?.percentage).toBe(60);

    // Electricity is 20,000 / 100,000 = 20%
    const elecCat = summary.byCategory.find((c) => c.category === ExpenseCategory.ELECTRICITY);
    expect(elecCat?.totalAmount).toBe(20000);
    expect(elecCat?.percentage).toBe(20);

    // Payment method cash = 40,000
    expect(summary.byPaymentMethod[PaymentMethod.CASH].total).toBe(40000);
    expect(summary.byPaymentMethod[PaymentMethod.TRANSFER].total).toBe(60000);
  });
});
