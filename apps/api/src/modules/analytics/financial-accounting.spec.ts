import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../core/database/prisma.service';
import { CardStatus, ExpenseCategory, PaymentMethod } from '@prisma/client';

describe('Financial Accounting & Calculations Engine (Section 11)', () => {
  let service: AnalyticsService;
  let prisma: {
    tenant: { findFirst: jest.Mock; findUnique: jest.Mock };
    saleTransaction: { findMany: jest.Mock };
    expense: { findMany: jest.Mock };
    card: { count: jest.Mock; aggregate: jest.Mock };
  };

  const mockTenantId = 'tenant-test-777';

  beforeEach(async () => {
    prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ id: mockTenantId, currency: 'SDG' }),
        findUnique: jest.fn().mockResolvedValue({ id: mockTenantId, currency: 'SDG' }),
      },
      saleTransaction: {
        findMany: jest.fn(),
      },
      expense: {
        findMany: jest.fn(),
      },
      card: {
        count: jest.fn(),
        aggregate: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('accurately computes user-specified benchmark: 1000 gross, 700 collected, 400 COGS, 100 expenses -> 600 gross profit, 500 net profit', async () => {
    // 10 cards sold at 100 SDG each.
    // Customer paid 700 SDG in total (e.g. 7 paid in full, 3 unpaid or partial).
    const now = new Date();
    const mockTransactions = Array.from({ length: 10 }, (_, i) => ({
      id: `tx-${i + 1}`,
      amount: '100.00',
      discountAmount: '0.00',
      paidAmount: i < 7 ? '100.00' : '0.00', // 7 paid = 700, 3 unpaid = 0
      remainingAmount: i < 7 ? '0.00' : '100.00',
      createdAt: now,
      card: {
        id: `card-${i + 1}`,
        status: CardStatus.SOLD,
        unitCost: '40.00', // 40 per card cost
        profile: { id: 'prof-1', name: 'باقة 100 جنيه' },
      },
      device: { id: 'dev-1', name: 'Main-Router' },
      cashier: { id: 'cash-1', fullName: 'علي الكاشير' },
    }));

    prisma.saleTransaction.findMany.mockResolvedValue(mockTransactions);

    // 100 SDG operating expenses (e.g. paper & ink)
    prisma.expense.findMany.mockResolvedValue([
      {
        id: 'exp-1',
        title: 'شراء ورق A4',
        category: ExpenseCategory.PAPER_AND_INK,
        amount: '100.00',
        expenseDate: now,
        paymentMethod: PaymentMethod.CASH,
      },
    ]);

    // Card inventory mock
    prisma.card.count.mockImplementation(({ where }) => {
      if (where.isPrinted) return Promise.resolve(50); // 50 printed
      if (where.status === CardStatus.AVAILABLE) return Promise.resolve(40); // 40 in stock
      if (where.status === CardStatus.SOLD) return Promise.resolve(10); // 10 sold
      if (where.status === CardStatus.ACTIVE) return Promise.resolve(6); // 6 logged in
      if (where.status === CardStatus.EXPIRED) return Promise.resolve(2);
      if (where.status === CardStatus.DISABLED) return Promise.resolve(1);
      return Promise.resolve(100); // 100 total generated
    });

    prisma.card.aggregate.mockResolvedValue({
      _sum: {
        price: '4000.00', // 40 cards * 100 = 4,000 retail value
        unitCost: '1600.00', // 40 cards * 40 = 1,600 cost value
      },
    });

    const report = await service.getFinancialReport(mockTenantId, { period: 'all_time' });
    const period = report.selectedPeriod;

    // 1. Gross Sales = 1,000
    expect(period.grossSales).toBe(1000);

    // 2. Net Sales = 1,000
    expect(period.netSales).toBe(1000);

    // 3. Cash Collections = 700 (Strictly NOT equal to Gross Sales!)
    expect(period.cashCollected).toBe(700);
    expect(period.cashCollected).not.toBe(period.grossSales);

    // 4. Remaining Receivables = 300
    expect(period.remainingReceivables).toBe(300);

    // 5. Cost of Goods Sold (COGS) = 400 (10 * 40)
    expect(period.cogs).toBe(400);
    expect(period.hasCostData).toBe(true);

    // 6. Gross Profit = 1,000 - 400 = 600
    expect(period.grossProfit).toBe(600);

    // 7. Operating Expenses = 100
    expect(period.operatingExpenses).toBe(100);
    expect(period.hasExpenseData).toBe(true);

    // 8. Net Operating Profit = Gross Profit (600) - Operating Expenses (100) = 500
    expect(period.netProfit).toBe(500);
    expect(period.netProfit).not.toBe(period.cashCollected);

    // 9. Net Cash Flow = Collections (700) - Cash Expenses (100) = 600
    expect(period.netCashFlow).toBe(600);

    // 10. Inventory lifecycle verification
    expect(report.inventory.totalCardsGenerated).toBe(100);
    expect(report.inventory.totalCardsPrinted).toBe(50);
    expect(report.inventory.totalCardsAvailable).toBe(40);
    expect(report.inventory.totalCardsSold).toBe(10);
    expect(report.inventory.stockEstimatedValue).toBe(4000);
    expect(report.inventory.stockCostValue).toBe(1600);
  });

  it('correctly handles absence of unitCost and expenses with clear disclosures', async () => {
    const now = new Date();
    // 5 cards sold at 200 each, but unitCost is 0 / null
    const mockTransactions = Array.from({ length: 5 }, (_, i) => ({
      id: `tx-${i + 1}`,
      amount: '200.00',
      discountAmount: '0.00',
      paidAmount: '200.00',
      remainingAmount: '0.00',
      createdAt: now,
      card: {
        id: `card-${i + 1}`,
        status: CardStatus.SOLD,
        unitCost: '0.00', // unrecorded unit cost
        profile: { id: 'prof-2', name: 'باقة يوم' },
      },
      device: { id: 'dev-1', name: 'Main-Router' },
      cashier: { id: 'cash-1', fullName: 'علي' },
    }));

    prisma.saleTransaction.findMany.mockResolvedValue(mockTransactions);
    prisma.expense.findMany.mockResolvedValue([]); // No expenses recorded

    prisma.card.count.mockResolvedValue(5);
    prisma.card.aggregate.mockResolvedValue({ _sum: { price: '0', unitCost: '0' } });

    const report = await service.getFinancialReport(mockTenantId, { period: 'all_time' });
    const period = report.selectedPeriod;

    expect(period.grossSales).toBe(1000);
    expect(period.cogs).toBe(0);
    expect(period.hasCostData).toBe(false);
    expect(period.hasExpenseData).toBe(false);
    // Explicit disclosure in accountingNotes
    expect(period.accountingNotes).toContain('لم تُسجل تكلفة');
  });

  it('properly subtracts refunds from gross sales without double deductions', async () => {
    const now = new Date();
    const mockTransactions = [
      {
        id: 'tx-1',
        amount: '500.00',
        discountAmount: '0.00',
        paidAmount: '500.00',
        remainingAmount: '0.00',
        createdAt: now,
        card: { id: 'c-1', status: CardStatus.SOLD, unitCost: '50.00', profile: { name: 'باقة أسبوع' } },
        device: { name: 'Router' },
        cashier: { fullName: 'كاشير 1' },
      },
      {
        id: 'tx-2',
        amount: '500.00',
        discountAmount: '0.00',
        paidAmount: '500.00',
        remainingAmount: '0.00',
        createdAt: now,
        card: { id: 'c-2', status: CardStatus.DISABLED, unitCost: '50.00', profile: { name: 'باقة أسبوع' } }, // Refunded / Disabled
        device: { name: 'Router' },
        cashier: { fullName: 'كاشير 1' },
      },
    ];

    prisma.saleTransaction.findMany.mockResolvedValue(mockTransactions);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.card.count.mockResolvedValue(2);
    prisma.card.aggregate.mockResolvedValue({ _sum: { price: '0', unitCost: '0' } });

    const report = await service.getFinancialReport(mockTenantId, { period: 'all_time' });
    const period = report.selectedPeriod;

    // Completed sales: only tx-1 (500)
    expect(period.netSales).toBe(500);
    expect(period.refundsAmount).toBe(500);
    expect(period.refundsCount).toBe(1);
    expect(period.salesCount).toBe(1);
  });

  it('accurately isolates partial collections and distributor debt balances without double counting', async () => {
    const now = new Date();
    // 2 transactions:
    // Tx 1: direct sale 200 SDG with 20 SDG discount, 180 net, paid in full (180 paid, 0 remaining)
    // Tx 2: distributor batch sale 1,000 SDG, 0 discount, 300 paid upfront, 700 remaining debt
    const mockTransactions = [
      {
        id: 'tx-direct-1',
        amount: '200.00',
        discountAmount: '20.00',
        paidAmount: '180.00',
        remainingAmount: '0.00',
        paymentStatus: 'PAID',
        createdAt: now,
        card: { id: 'c-d-1', status: CardStatus.SOLD, unitCost: '30.00', profile: { name: 'مباشر' } },
        device: { name: 'Router' },
        cashier: { fullName: 'كاشير' },
      },
      {
        id: 'tx-dist-2',
        amount: '1000.00',
        discountAmount: '0.00',
        paidAmount: '300.00',
        remainingAmount: '700.00',
        paymentStatus: 'PARTIAL',
        distributorName: 'نقطة بيع حي النصر',
        createdAt: now,
        card: { id: 'c-dist-2', status: CardStatus.SOLD, unitCost: '150.00', profile: { name: 'جملة' } },
        device: { name: 'Router' },
        cashier: { fullName: 'كاشير' },
      },
    ];

    prisma.saleTransaction.findMany.mockResolvedValue(mockTransactions);
    prisma.expense.findMany.mockResolvedValue([
      {
        id: 'exp-comm-1',
        title: 'عمولة موزع',
        category: ExpenseCategory.COMMISSIONS,
        amount: '50.00',
        expenseDate: now,
        paymentMethod: PaymentMethod.CASH,
      },
    ]);
    prisma.card.count.mockResolvedValue(10);
    prisma.card.aggregate.mockResolvedValue({ _sum: { price: '0', unitCost: '0' } });

    const report = await service.getFinancialReport(mockTenantId, { period: 'all_time' });
    const period = report.selectedPeriod;

    // Gross = 200 + 1000 = 1200
    expect(period.grossSales).toBe(1200);
    // Discounts = 20
    expect(period.discounts).toBe(20);
    // Net sales = 1200 - 20 = 1180
    expect(period.netSales).toBe(1180);
    // Cash collected = 180 + 300 = 480
    expect(period.cashCollected).toBe(480);
    // Remaining receivables = 1180 - 480 = 700 (Matches the 700 debt of distributor!)
    expect(period.remainingReceivables).toBe(700);
    // COGS = 30 + 150 = 180
    expect(period.cogs).toBe(180);
    // Gross profit = 1180 - 180 = 1000
    expect(period.grossProfit).toBe(1000);
    // Operating expenses = 50
    expect(period.operatingExpenses).toBe(50);
    // Net profit = 1000 - 50 = 950
    expect(period.netProfit).toBe(950);
    // Net cash flow = Collected (480) - Expenses (50) = 430
    expect(period.netCashFlow).toBe(430);
  });
});

