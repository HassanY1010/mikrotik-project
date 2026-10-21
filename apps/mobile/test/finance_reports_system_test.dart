import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/finance/presentation/finance_reports_screen.dart';

void main() {
  group('Financial & Operational Reporting System Tests', () {
    test('Exact User Accounting Scenario Verification', () {
      // 10 cards @ 100 SDG = 1,000 SDG Gross Sales
      // Cash collected: 700 SDG
      // Receivables: 300 SDG
      // COGS: 400 SDG (10 * 40 SDG)
      // Operating expenses: 100 SDG
      // -> Gross profit = 1,000 - 400 = 600 SDG
      // -> Net operating profit = 600 - 100 = 500 SDG
      // -> Cash collection = 700 SDG
      // -> Net cash flow = 700 - 100 = 600 SDG
      final periodJson = {
        'key': 'this_month',
        'label': 'هذا الشهر',
        'startDate': '2026-10-01',
        'endDate': '2026-10-31',
        'grossSales': 1000.0,
        'discounts': 0.0,
        'netSales': 1000.0,
        'cashCollected': 700.0,
        'remainingReceivables': 300.0,
        'operatingExpenses': 100.0,
        'cogs': 400.0,
        'grossProfit': 600.0,
        'netProfit': 500.0,
        'netCashFlow': 600.0,
        'profitMarginPercent': 50.0,
        'salesCount': 10,
        'cardsCount': 10,
        'refundsAmount': 0.0,
        'refundsCount': 0,
        'hasCostData': true,
        'hasExpenseData': true,
        'accountingNotes': 'تم حساب الأرباح بناءً على تكلفة الكروت والمصروفات المسجلة.',
      };

      final periodModel = FinancialPeriodModel.fromJson(periodJson);

      expect(periodModel.grossSales, 1000.0);
      expect(periodModel.cashCollected, 700.0);
      expect(periodModel.remainingReceivables, 300.0);
      expect(periodModel.cogs, 400.0);
      expect(periodModel.operatingExpenses, 100.0);
      expect(periodModel.grossProfit, 600.0);
      expect(periodModel.netProfit, 500.0);
      expect(periodModel.netCashFlow, 600.0);
      expect(periodModel.hasCostData, isTrue);
      expect(periodModel.hasExpenseData, isTrue);
    });

    test('Card Inventory Lifecycle & Valuation Model Parsing', () {
      final invJson = {
        'totalCardsGenerated': 1000,
        'totalCardsPrinted': 800,
        'totalCardsAvailable': 500,
        'totalCardsSold': 300,
        'totalCardsActive': 150,
        'totalCardsExpired': 100,
        'totalCardsDisabled': 50,
        'stockEstimatedValue': 250000.0,
        'stockCostValue': 100000.0,
      };

      final invModel = CardInventoryMetricsModel.fromJson(invJson);

      expect(invModel.totalCardsGenerated, 1000);
      expect(invModel.totalCardsPrinted, 800);
      expect(invModel.totalCardsAvailable, 500);
      expect(invModel.totalCardsSold, 300);
      expect(invModel.totalCardsActive, 150);
      expect(invModel.totalCardsExpired, 100);
      expect(invModel.totalCardsDisabled, 50);
      expect(invModel.stockEstimatedValue, 250000.0);
      expect(invModel.stockCostValue, 100000.0);
    });

    test('ExpenseItemModel and Category Breakdown Parsing', () {
      final expenseJson = {
        'id': 'exp-uuid-1',
        'title': 'شراء ورق A4 وحبر طابعة',
        'category': 'PAPER_INK',
        'categoryLabelAr': 'ورق وحبر طباعة A4',
        'amount': 4500.0,
        'currency': 'SDG',
        'expenseDate': '2026-10-21T10:00:00.000Z',
        'paymentMethod': 'CASH',
        'vendor': 'مكتبة الخرطوم',
        'description': '3 كرتون ورق A4 وحبر أسود',
        'createdBy': {'fullName': 'محمد أحمد'},
        'createdAt': '2026-10-21T10:00:00.000Z',
      };

      final item = ExpenseItemModel.fromJson(expenseJson);
      expect(item.id, 'exp-uuid-1');
      expect(item.title, 'شراء ورق A4 وحبر طابعة');
      expect(item.category, 'PAPER_INK');
      expect(item.categoryLabelAr, 'ورق وحبر طباعة A4');
      expect(item.amount, 4500.0);
      expect(item.vendor, 'مكتبة الخرطوم');
      expect(item.createdByName, 'محمد أحمد');

      final breakdownJson = {
        'category': 'INTERNET_UPSTREAM',
        'categoryLabelAr': 'اشتراك إنترنت / خط رئيسي',
        'totalAmount': 50000.0,
        'count': 1,
        'percentage': 60,
      };

      final breakdown = ExpenseCategoryBreakdownModel.fromJson(breakdownJson);
      expect(breakdown.category, 'INTERNET_UPSTREAM');
      expect(breakdown.totalAmount, 50000.0);
      expect(breakdown.percentage, 60);
    });

    testWidgets('FinanceReportsScreen renders tabs and period chips correctly', (tester) async {
      final dummyReport = FinancialReportModel(
        todayRevenue: 5000.0,
        todaySalesCount: 10,
        todayCollected: 5000.0,
        weekRevenue: 25000.0,
        weekSalesCount: 50,
        weekCollected: 25000.0,
        monthRevenue: 100000.0,
        monthSalesCount: 200,
        monthCollected: 95000.0,
        allTimeRevenue: 500000.0,
        allTimeSalesCount: 1000,
        allTimeCollected: 480000.0,
        totalRefunds: 0.0,
        refundedCount: 0,
        profitMarginPercent: 60.0,
        estimatedProfit: 300000.0,
        currency: 'SDG',
        totalOperatingExpenses: 50000.0,
        netOperatingProfit: 250000.0,
        totalGrossSales: 500000.0,
        totalDiscounts: 0.0,
        totalReceivables: 20000.0,
        netCashFlow: 430000.0,
        selectedPeriod: FinancialPeriodModel(
          key: 'all_time',
          label: 'كل الفترات',
          startDate: '',
          endDate: '',
          grossSales: 500000.0,
          discounts: 0.0,
          netSales: 500000.0,
          cashCollected: 480000.0,
          remainingReceivables: 20000.0,
          operatingExpenses: 50000.0,
          cogs: 100000.0,
          grossProfit: 400000.0,
          netProfit: 350000.0,
          netCashFlow: 430000.0,
          profitMarginPercent: 70.0,
          salesCount: 1000,
          cardsCount: 1000,
          hasCostData: true,
          hasExpenseData: true,
          accountingNotes: 'تقارير مالية مدققة',
        ),
        inventory: CardInventoryMetricsModel(
          totalCardsGenerated: 1200,
          totalCardsPrinted: 1000,
          totalCardsAvailable: 200,
          totalCardsSold: 1000,
          totalCardsActive: 400,
          totalCardsExpired: 500,
          totalCardsDisabled: 100,
          stockEstimatedValue: 100000.0,
          stockCostValue: 40000.0,
        ),
        next7DaysForecast: 15000.0,
        next30DaysForecast: 60000.0,
        trend: 'UP',
        bestSellingProfiles: [],
        salesByRouter: [],
        salesByCashier: [],
        dailyRevenueLast30Days: [],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            financialReportProvider.overrideWith(() => _MockFinancialReportNotifier(dummyReport)),
            expensesProvider.overrideWith(() => _MockExpensesNotifier()),
            salesTransactionsProvider.overrideWith(() => _MockSalesTransactionsNotifier()),
          ],
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: FinanceReportsScreen(),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify Screen Header
      expect(find.text('التقارير المالية والتشغيلية'), findsOneWidget);

      // Verify All 5 Tabs exist
      expect(find.text('الملخص'), findsOneWidget);
      expect(find.text('المبيعات والتحصيل'), findsOneWidget);
      expect(find.text('المخزون والطباعة'), findsOneWidget);
      expect(find.text('المصروفات'), findsOneWidget);
      expect(find.text('الأرباح والسيولة'), findsOneWidget);

      // Verify Period selector chips exist
      expect(find.text('كل الفترات'), findsWidgets);
      expect(find.text('اليوم'), findsOneWidget);
      expect(find.text('آخر 7 أيام'), findsOneWidget);
      expect(find.text('هذا الشهر'), findsOneWidget);

      // Verify Summary Tab KPI Cards
      expect(find.text('إجمالي المبيعات'), findsOneWidget);
      expect(find.text('المبالغ المحصلة فعلياً'), findsOneWidget);
      expect(find.text('المبالغ المتبقية (الديون)'), findsOneWidget);
      expect(find.text('إجمالي المصروفات'), findsOneWidget);
      expect(find.text('صافي الربح التشغيلي'), findsOneWidget);
      expect(find.text('كروت مطبوعة جاهزة'), findsOneWidget);

      // Switch to Tab 3: Inventory & Printing
      await tester.tap(find.text('المخزون والطباعة'));
      await tester.pumpAndSettle();
      expect(find.text('دورة حياة كروت الهوتسبوت المطبوعة'), findsOneWidget);
      expect(find.text('2. الكروت المطبوعة (A4 / حراري)'), findsOneWidget);
      expect(find.text('1,000 كرت'), findsWidgets);

      // Switch to Tab 5: Profit & Cash Flow Breakdown
      // Since TabBar is scrollable, drag to ensure the tab is visible
      await tester.drag(find.byType(TabBar), const Offset(300, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.text('الأرباح والسيولة'), warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(find.textContaining('قائمة الدخل والأرباح'), findsOneWidget);
      expect(find.textContaining('التدفق النقدي والسيولة'), findsOneWidget);
    });
  });
}

class _MockFinancialReportNotifier extends FinancialReportNotifier {
  final FinancialReportModel model;
  _MockFinancialReportNotifier(this.model);

  @override
  Future<FinancialReportModel> build() async => model;
}

class _MockExpensesNotifier extends ExpensesNotifier {
  @override
  Future<List<ExpenseItemModel>> build() async => [];
}

class _MockSalesTransactionsNotifier extends SalesTransactionsNotifier {
  @override
  Future<List<Map<String, dynamic>>> build() async => [];
}
