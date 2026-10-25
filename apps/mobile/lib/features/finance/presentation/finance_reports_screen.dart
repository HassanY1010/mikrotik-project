import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../pos/presentation/pos_screen.dart';

class FinanceReportsScreen extends ConsumerStatefulWidget {
  const FinanceReportsScreen({super.key});

  @override
  ConsumerState<FinanceReportsScreen> createState() => _FinanceReportsScreenState();
}

class _FinanceReportsScreenState extends ConsumerState<FinanceReportsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  int? _selectedChartDayIndex;
  bool _isSyncing = false;
  String _salesSearchQuery = '';

  final NumberFormat _currencyFormat = NumberFormat('#,##0', 'en_US');

  final List<Map<String, String>> _periodOptions = [
    {'key': 'all_time', 'label': 'كل الفترات'},
    {'key': 'today', 'label': 'اليوم'},
    {'key': 'yesterday', 'label': 'أمس'},
    {'key': 'last_7_days', 'label': 'آخر 7 أيام'},
    {'key': 'this_month', 'label': 'هذا الشهر'},
    {'key': 'last_month', 'label': 'الشهر السابق'},
    {'key': 'this_year', 'label': 'هذا العام'},
    {'key': 'custom', 'label': 'فترة مخصصة'},
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  String _formatAmount(double amount, String currency) {
    return '${_currencyFormat.format(amount)} $currency';
  }

  Future<void> _handleRefreshAndSync() async {
    if (_isSyncing) return;
    setState(() => _isSyncing = true);
    try {
      final syncManager = ref.read(syncManagerProvider);
      await syncManager.pushPendingMutations();
      await ref.read(financialReportProvider.notifier).refresh();
      await ref.read(expensesProvider.notifier).refresh();
      await ref.read(salesTransactionsProvider.notifier).refresh();
    } catch (_) {
      await ref.read(financialReportProvider.notifier).refresh();
    } finally {
      if (mounted) setState(() => _isSyncing = false);
    }
  }

  Future<void> _handlePeriodChange(String key) async {
    if (key == 'custom') {
      final now = DateTime.now();
      final initialRange = ref.read(reportsCustomDateRangeProvider) ??
          DateTimeRange(start: now.subtract(const Duration(days: 30)), end: now);

      final picked = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2020),
        lastDate: DateTime(2030),
        initialDateRange: initialRange,
        builder: (context, child) {
          return Theme(
            data: Theme.of(context).copyWith(
              colorScheme: ColorScheme.dark(
                primary: const Color(0xFF38BDF8),
                onPrimary: Colors.white,
                surface: context.bgCard,
                onSurface: context.textPrimary,
              ),
            ),
            child: Directionality(
              textDirection: ui.TextDirection.rtl,
              child: child!,
            ),
          );
        },
      );

      if (picked != null) {
        ref.read(reportsCustomDateRangeProvider.notifier).setRange(picked);
        ref.read(reportsPeriodFilterProvider.notifier).setPeriod('custom');
        ref.read(financialReportProvider.notifier).refresh();
      }
    } else {
      ref.read(reportsPeriodFilterProvider.notifier).setPeriod(key);
      ref.read(financialReportProvider.notifier).refresh();
    }
  }

  void _showAddExpenseDialog() {
    final titleCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final vendorCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    String selectedCategory = 'INTERNET_UPSTREAM';
    String paymentMethod = 'CASH';

    final categories = [
      {'key': 'INTERNET_UPSTREAM', 'label': 'اشتراك إنترنت / خط رئيسي'},
      {'key': 'ELECTRICITY_POWER', 'label': 'كهرباء وطاقة / مولد'},
      {'key': 'PAPER_INK', 'label': 'ورق وحبر طباعة A4'},
      {'key': 'EQUIPMENT_MAINTENANCE', 'label': 'صيانة راوترات ومعدات'},
      {'key': 'SALARIES_WAGES', 'label': 'رواتب وأجور موظفين'},
      {'key': 'DISTRIBUTOR_COMMISSION', 'label': 'عمولات موزعين ونقاط بيع'},
      {'key': 'RENT', 'label': 'إيجار موقع أو برج'},
      {'key': 'OTHER', 'label': 'مصروفات تشغيلية أخرى'},
    ];

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: context.bgCard,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.add_shopping_cart, color: Color(0xFFEF4444), size: 20),
              ),
              const SizedBox(width: 8),
              Text(
                'تسجيل مصروف جديد',
                style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(
                    labelText: 'عنوان أو بند المصروف *',
                    hintText: 'مثال: شراء كرتون ورق A4 وحبر للطابعة',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'المبلغ *',
                    hintText: '0.00',
                    prefixIcon: Icon(Icons.monetization_on_outlined, size: 20),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedCategory,
                  decoration: const InputDecoration(labelText: 'تصنيف المصروف'),
                  items: categories.map((c) {
                    return DropdownMenuItem(
                      value: c['key'],
                      child: Text(c['label']!, style: const TextStyle(fontSize: 13)),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) setDialogState(() => selectedCategory = val);
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: paymentMethod,
                  decoration: const InputDecoration(labelText: 'طريقة الدفع'),
                  items: const [
                    DropdownMenuItem(value: 'CASH', child: Text('نقداً (كاش)')),
                    DropdownMenuItem(value: 'BANK_TRANSFER', child: Text('تحويل بنكي / بنكك')),
                    DropdownMenuItem(value: 'OTHER', child: Text('أخرى')),
                  ],
                  onChanged: (val) {
                    if (val != null) setDialogState(() => paymentMethod = val);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: vendorCtrl,
                  decoration: const InputDecoration(
                    labelText: 'الجهة المستفيدة / المورد (اختياري)',
                    hintText: 'اسم المكتبة أو الشركة',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'ملاحظات إضافية',
                    hintText: 'أي تفاصيل متعلقة بالفاتورة',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFEF4444),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () async {
                final title = titleCtrl.text.trim();
                final amt = double.tryParse(amountCtrl.text.trim()) ?? 0;
                if (title.isEmpty || amt <= 0) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('يرجى إدخال عنوان المصروف ومبلغ صحيح')),
                  );
                  return;
                }

                Navigator.pop(ctx);
                final success = await ref.read(expensesProvider.notifier).createExpense(
                  title: title,
                  category: selectedCategory,
                  amount: amt,
                  vendor: vendorCtrl.text.trim().isNotEmpty ? vendorCtrl.text.trim() : null,
                  description: descCtrl.text.trim().isNotEmpty ? descCtrl.text.trim() : null,
                  paymentMethod: paymentMethod,
                );

                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(success ? 'تم تسجيل المصروف وتحديث التقارير بنجاح' : 'فشل تسجيل المصروف'),
                      backgroundColor: success ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                    ),
                  );
                }
              },
              child: const Text('حفظ المصروف'),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmDeleteExpense(String id, String title) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        title: Text('تأكيد الحذف', style: TextStyle(color: context.textPrimary)),
        content: Text('هل أنت متأكد من حذف المصروف "$title"؟ سيتم تحديث صافي الأرباح تلقائياً.',
            style: TextStyle(color: context.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              Navigator.pop(ctx);
              final ok = await ref.read(expensesProvider.notifier).deleteExpense(id);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(ok ? 'تم حذف المصروف بنجاح' : 'تعذر حذف المصروف'),
                    backgroundColor: ok ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                  ),
                );
              }
            },
            child: const Text('تأكيد الحذف'),
          ),
        ],
      ),
    );
  }

  Future<void> _exportCsv(String type) async {
    try {
      final apiClient = ref.read(apiClientProvider);
      String endpoint = ApiEndpoints.reportsSalesCsv;
      String filename = 'sales_report.csv';

      if (type == 'cards') {
        endpoint = ApiEndpoints.reportsCardsCsv;
        filename = 'cards_inventory_report.csv';
      } else if (type == 'expenses') {
        endpoint = ApiEndpoints.reportsExpensesCsv;
        filename = 'expenses_report.csv';
      }

      final res = await apiClient.get(endpoint);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('تم تصدير ملف $filename بنجاح (${res.data?.toString().length ?? 0} بايت)'),
            backgroundColor: const Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تعذر تصدير الملف حالياً'),
            backgroundColor: Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final reportAsync = ref.watch(financialReportProvider);
    final selectedPeriodKey = ref.watch(reportsPeriodFilterProvider);

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.assessment_rounded, color: Color(0xFFFBBF24), size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'التقارير المالية والتشغيلية',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: context.textPrimary,
                  ),
                ),
                Text(
                  'تدقيق المبيعات، المخزون، المصروفات والأرباح',
                  style: TextStyle(fontSize: 11, color: context.textSecondary),
                ),
              ],
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.file_download_outlined, color: Color(0xFF10B981)),
            tooltip: 'تصدير التقارير',
            onSelected: (val) => _exportCsv(val),
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'sales',
                child: Row(
                  children: [
                    Icon(Icons.point_of_sale, size: 18, color: Color(0xFF38BDF8)),
                    SizedBox(width: 8),
                    Text('تصدير المبيعات (CSV)'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'cards',
                child: Row(
                  children: [
                    Icon(Icons.inventory_2_outlined, size: 18, color: Color(0xFFF59E0B)),
                    SizedBox(width: 8),
                    Text('تصدير مخزون الكروت (CSV)'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'expenses',
                child: Row(
                  children: [
                    Icon(Icons.receipt_long, size: 18, color: Color(0xFFEF4444)),
                    SizedBox(width: 8),
                    Text('تصدير المصروفات (CSV)'),
                  ],
                ),
              ),
            ],
          ),
          IconButton(
            icon: _isSyncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
                  )
                : const Icon(Icons.sync, color: Color(0xFF38BDF8)),
            onPressed: _isSyncing ? null : _handleRefreshAndSync,
            tooltip: 'مزامنة وتحديث التقرير',
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(98),
          child: Column(
            children: [
              // Period selector chips
              Container(
                height: 44,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: _periodOptions.length,
                  itemBuilder: (context, index) {
                    final item = _periodOptions[index];
                    final isSelected = selectedPeriodKey == item['key'];
                    return Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: ChoiceChip(
                        label: Text(
                          item['label']!,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            color: isSelected ? Colors.white : context.textSecondary,
                          ),
                        ),
                        selected: isSelected,
                        selectedColor: const Color(0xFF2563EB),
                        backgroundColor: context.bgCardAlt,
                        onSelected: (selected) {
                          if (selected) _handlePeriodChange(item['key']!);
                        },
                      ),
                    );
                  },
                ),
              ),
              // TabBar
              TabBar(
                controller: _tabController,
                isScrollable: true,
                labelColor: const Color(0xFF38BDF8),
                unselectedLabelColor: context.textSecondary,
                indicatorColor: const Color(0xFF38BDF8),
                indicatorWeight: 3,
                tabs: const [
                  Tab(icon: Icon(Icons.dashboard_outlined, size: 18), text: 'الملخص'),
                  Tab(icon: Icon(Icons.point_of_sale, size: 18), text: 'المبيعات والتحصيل'),
                  Tab(icon: Icon(Icons.inventory_2_outlined, size: 18), text: 'المخزون والطباعة'),
                  Tab(icon: Icon(Icons.receipt_long, size: 18), text: 'المصروفات'),
                  Tab(icon: Icon(Icons.account_balance_wallet_outlined, size: 18), text: 'الأرباح والسيولة'),
                ],
              ),
            ],
          ),
        ),
      ),
      body: reportAsync.when(
        data: (report) => TabBarView(
          controller: _tabController,
          children: [
            RefreshIndicator(
              onRefresh: _handleRefreshAndSync,
              backgroundColor: context.bgCard,
              color: const Color(0xFF38BDF8),
              child: _buildSummaryTab(report),
            ),
            RefreshIndicator(
              onRefresh: _handleRefreshAndSync,
              backgroundColor: context.bgCard,
              color: const Color(0xFF38BDF8),
              child: _buildSalesTab(report),
            ),
            RefreshIndicator(
              onRefresh: _handleRefreshAndSync,
              backgroundColor: context.bgCard,
              color: const Color(0xFF38BDF8),
              child: _buildInventoryTab(report),
            ),
            RefreshIndicator(
              onRefresh: _handleRefreshAndSync,
              backgroundColor: context.bgCard,
              color: const Color(0xFF38BDF8),
              child: _buildExpensesTab(report),
            ),
            RefreshIndicator(
              onRefresh: _handleRefreshAndSync,
              backgroundColor: context.bgCard,
              color: const Color(0xFF38BDF8),
              child: _buildProfitTab(report),
            ),
          ],
        ),
        loading: () => const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFFBBF24)),
              ),
              SizedBox(height: 16),
              Text(
                'جارٍ تدقيق واستخراج السجلات المالية والتشغيلية...',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
              ),
            ],
          ),
        ),
        error: (err, _) => Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline_rounded, size: 52, color: Color(0xFFEF4444)),
                const SizedBox(height: 14),
                Text(
                  'تعذر تحميل التقارير المالية',
                  style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  err.toString(),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.textSecondary, fontSize: 12),
                ),
                const SizedBox(height: 18),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: () => ref.read(financialReportProvider.notifier).refresh(),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('إعادة المحاولة'),
                ),
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: _tabController.index == 3
          ? FloatingActionButton.extended(
              onPressed: _showAddExpenseDialog,
              backgroundColor: const Color(0xFFEF4444),
              icon: const Icon(Icons.add, color: Colors.white),
              label: const Text('إضافة مصروف', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            )
          : null,
    );
  }

  // ===========================================================================
  // TAB 1: SUMMARY DASHBOARD
  // ===========================================================================
  Widget _buildSummaryTab(FinancialReportModel report) {
    final period = report.selectedPeriod;
    final bool hasZeroAllTime = report.allTimeSalesCount == 0 && report.allTimeRevenue == 0;

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFF2563EB).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF2563EB).withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.calendar_today_outlined, size: 18, color: Color(0xFF38BDF8)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'الفترة المحددة: ${period.label} ${period.startDate.isNotEmpty ? "(${period.startDate} إلى ${period.endDate})" : ""}',
                    style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          if (hasZeroAllTime)
            Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.bgCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: context.borderColor),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF38BDF8).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.point_of_sale, color: Color(0xFF38BDF8), size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'لا توجد عمليات بيع مسجلة حتى الآن',
                          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'ابدأ بإنشاء دفعات الكروت وطباعتها ثم بيعها عبر نقطة البيع السريعة.',
                          style: TextStyle(color: context.textSecondary, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const PosScreen()));
                    },
                    child: const Text('فتح POS', style: TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),

          Text(
            'مؤشرات الأداء المالي والتشغيلي للفترة',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
          ),
          const SizedBox(height: 10),

          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  title: 'إجمالي المبيعات',
                  value: _formatAmount(period.grossSales, report.currency),
                  subtitle: '${period.salesCount} عملية بيع',
                  color: const Color(0xFF3B82F6),
                  icon: Icons.monetization_on_outlined,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildMetricTile(
                  title: 'المبالغ المحصلة فعلياً',
                  value: _formatAmount(period.cashCollected, report.currency),
                  subtitle: 'السيولة النقدية المستلمة',
                  color: const Color(0xFF10B981),
                  icon: Icons.payments_outlined,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  title: 'المبالغ المتبقية (الديون)',
                  value: _formatAmount(period.remainingReceivables, report.currency),
                  subtitle: 'مستحقات لدى العملاء/الموزعين',
                  color: const Color(0xFFF59E0B),
                  icon: Icons.pending_actions_outlined,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildMetricTile(
                  title: 'إجمالي المصروفات',
                  value: _formatAmount(period.operatingExpenses, report.currency),
                  subtitle: 'تشغيل، إنترنت، كهرباء وورق',
                  color: const Color(0xFFEF4444),
                  icon: Icons.receipt_long,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  title: 'الربح الإجمالي (Gross)',
                  value: _formatAmount(period.grossProfit, report.currency),
                  subtitle: period.hasCostData ? 'المبيعات - تكلفة الكروت' : 'دون تكلفة كروت مسجلة',
                  color: const Color(0xFF8B5CF6),
                  icon: Icons.trending_up,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildMetricTile(
                  title: 'صافي الربح التشغيلي',
                  value: _formatAmount(period.netProfit, report.currency),
                  subtitle: 'الربح الإجمالي - المصروفات',
                  color: const Color(0xFF06B6D4),
                  icon: Icons.account_balance_wallet_rounded,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  title: 'كروت مطبوعة جاهزة',
                  value: '${report.inventory.totalCardsPrinted} كرت',
                  subtitle: 'على ورق A4 أو حراري',
                  color: const Color(0xFF6366F1),
                  icon: Icons.print_outlined,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildMetricTile(
                  title: 'كروت متاحة بالمخزون',
                  value: '${report.inventory.totalCardsAvailable} كرت',
                  subtitle: 'جاهزة للبيع والتسليم',
                  color: const Color(0xFF14B8A6),
                  icon: Icons.storefront_outlined,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          if (period.accountingNotes.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.bgCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: context.borderColor),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, size: 16, color: Color(0xFF38BDF8)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      period.accountingNotes,
                      style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 11, height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 20),

          _buildForecastCard(report),
          const SizedBox(height: 24),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'حركة المبيعات خلال آخر 30 يوماً',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
              ),
              Text(
                'إجمالي: ${_formatAmount(report.dailyRevenueLast30Days.fold<double>(0, (sum, d) => sum + (double.tryParse(d['amount']?.toString() ?? '0') ?? 0)), report.currency)}',
                style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _buildInteractive30DayChart(report.dailyRevenueLast30Days, report.currency),
          const SizedBox(height: 24),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'أكثر الباقات مبيعاً (Top Packages)',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
              ),
              Text(
                '${report.bestSellingProfiles.length} باقات',
                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _buildProfilesBreakdown(report.bestSellingProfiles, report.currency),
          const SizedBox(height: 24),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'توزيع المبيعات حسب الراوترات',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
              ),
              Text(
                '${report.salesByRouter.length} راوترات نشطة',
                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _buildRoutersBreakdown(report.salesByRouter, report.currency),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildMetricTile({
    required String title,
    required String value,
    required String subtitle,
    required Color color,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(color: context.textSecondary, fontSize: 11, fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 14),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 3),
          Text(
            subtitle,
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // TAB 2: SALES TRANSACTIONS & COLLECTIONS
  // ===========================================================================
  Widget _buildSalesTab(FinancialReportModel report) {
    final txListAsync = ref.watch(salesTransactionsProvider);
    final period = report.selectedPeriod;

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('إجمالي المبيعات:', style: TextStyle(color: context.textSecondary, fontSize: 12)),
                    Text(_formatAmount(period.grossSales, report.currency),
                        style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14)),
                  ],
                ),
                const Divider(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('المحصل نقداً:', style: TextStyle(color: Color(0xFF10B981), fontSize: 12)),
                    Text(_formatAmount(period.cashCollected, report.currency),
                        style: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold, fontSize: 14)),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('الديون والمستحقات المتبقية:', style: TextStyle(color: Color(0xFFF59E0B), fontSize: 12)),
                    Text(_formatAmount(period.remainingReceivables, report.currency),
                        style: const TextStyle(color: Color(0xFFF59E0B), fontWeight: FontWeight.bold, fontSize: 14)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          TextField(
            onChanged: (val) => setState(() => _salesSearchQuery = val.trim().toLowerCase()),
            decoration: InputDecoration(
              hintText: 'البحث برقم الإيصال، اسم البروفايل، الكاشير أو الموزع...',
              prefixIcon: const Icon(Icons.search, size: 20),
              filled: true,
              fillColor: context.bgCard,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 14),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'سجل عمليات البيع الفعلية المسجلة',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, size: 18, color: Color(0xFF38BDF8)),
                onPressed: () => ref.read(salesTransactionsProvider.notifier).refresh(),
              ),
            ],
          ),
          const SizedBox(height: 8),

          txListAsync.when(
            data: (txList) {
              final filtered = txList.where((tx) {
                if (_salesSearchQuery.isEmpty) return true;
                final inv = tx['invoiceNumber']?.toString().toLowerCase() ?? '';
                final prof = tx['profileName']?.toString().toLowerCase() ?? '';
                final cashier = tx['cashierName']?.toString().toLowerCase() ?? '';
                final dist = tx['distributorName']?.toString().toLowerCase() ?? '';
                return inv.contains(_salesSearchQuery) ||
                    prof.contains(_salesSearchQuery) ||
                    cashier.contains(_salesSearchQuery) ||
                    dist.contains(_salesSearchQuery);
              }).toList();

              if (filtered.isEmpty) {
                return Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: context.bgCard,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Column(
                      children: [
                        const Icon(Icons.receipt_long, size: 40, color: Colors.grey),
                        const SizedBox(height: 10),
                        Text('لا توجد عمليات بيع تطابق البحث في السجلات',
                            style: TextStyle(color: context.textSecondary, fontSize: 13)),
                      ],
                    ),
                  ),
                );
              }

              return ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: filtered.length,
                separatorBuilder: (context, index) => const SizedBox(height: 8),
                itemBuilder: (context, idx) {
                  final t = filtered[idx];
                  final invoiceNum = t['invoiceNumber']?.toString() ?? 'إيصال';
                  final amount = double.tryParse(t['amount']?.toString() ?? '0') ?? 0.0;
                  final paid = double.tryParse(t['paidAmount']?.toString() ?? t['amount']?.toString() ?? '0') ?? 0.0;
                  final remaining = double.tryParse(t['remainingAmount']?.toString() ?? '0') ?? 0.0;
                  final status = t['paymentStatus']?.toString() ?? 'PAID';
                  final profile = t['profileName']?.toString() ?? 'باقة';
                  final soldAt = t['soldAt'] != null ? t['soldAt'].toString().split('T')[0] : '';
                  final distributor = t['distributorName']?.toString();

                  Color statusColor = const Color(0xFF10B981);
                  String statusLabel = 'مدفوع بالكامل';
                  if (status == 'PARTIALLY_PAID') {
                    statusColor = const Color(0xFFF59E0B);
                    statusLabel = 'مدفوع جزئياً';
                  } else if (status == 'UNPAID') {
                    statusColor = const Color(0xFFEF4444);
                    statusLabel = 'غير مدفوع (دين)';
                  } else if (status == 'REFUNDED') {
                    statusColor = const Color(0xFF6B7280);
                    statusLabel = 'مسترد / ملغى';
                  }

                  return Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: context.bgCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.borderColor),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Text(
                                  invoiceNum,
                                  style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: statusColor.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    statusLabel,
                                    style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              _formatAmount(amount, report.currency),
                              style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'الباقة: $profile',
                              style: TextStyle(color: context.textSecondary, fontSize: 11),
                            ),
                            Text(
                              'التاريخ: $soldAt',
                              style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
                            ),
                          ],
                        ),
                        if (distributor != null && distributor.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            'الموزع/نقطة البيع: $distributor',
                            style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11),
                          ),
                        ],
                        if (remaining > 0) ...[
                          const SizedBox(height: 4),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('المحصل: ${_formatAmount(paid, report.currency)}',
                                  style: const TextStyle(color: Color(0xFF10B981), fontSize: 10)),
                              Text('المتبقي كدين: ${_formatAmount(remaining, report.currency)}',
                                  style: const TextStyle(color: Color(0xFFEF4444), fontSize: 10, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ],
                      ],
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())),
            error: (e, _) => Center(child: Text('تعذر تحميل سجل المبيعات: $e', style: const TextStyle(color: Colors.red, fontSize: 12))),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // TAB 3: CARD INVENTORY & PRINTING PIPELINE
  // ===========================================================================
  Widget _buildInventoryTab(FinancialReportModel report) {
    final inv = report.inventory;

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: context.isDarkMode
                    ? const [Color(0xFF1E3A8A), Color(0xFF0F172A)]
                    : const [Color(0xFFEFF6FF), Color(0xFFDBEAFE)],
              ),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.print_rounded, color: Color(0xFF60A5FA), size: 28),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'دورة حياة كروت الهوتسبوت المطبوعة',
                        style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'يتم فصل الكروت المطبوعة الجاهزة على ورق A4 عن الكروت المباعة والكروت المفعلة بدقة.',
                        style: TextStyle(color: context.textSecondary, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          Text(
            'حالات الكروت في النظام (بدون تكرار أو ازدواجية)',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
          ),
          const SizedBox(height: 10),

          _buildInventoryRow(
            title: '1. إجمالي الكروت المنشأة',
            count: inv.totalCardsGenerated,
            desc: 'جميع الكروت المسجلة في قاعدة البيانات',
            color: const Color(0xFF3B82F6),
            icon: Icons.create_new_folder_outlined,
          ),
          _buildInventoryRow(
            title: '2. الكروت المطبوعة (A4 / حراري)',
            count: inv.totalCardsPrinted,
            desc: 'تم تجهيزها وطباعتها ورقياً للقص والبيع',
            color: const Color(0xFF6366F1),
            icon: Icons.print_outlined,
          ),
          _buildInventoryRow(
            title: '3. كروت متاحة في المخزون للبيع',
            count: inv.totalCardsAvailable,
            desc: 'كروت غير مباعة وجاهزة للتوزيع والبيع',
            color: const Color(0xFF10B981),
            icon: Icons.storefront_outlined,
          ),
          _buildInventoryRow(
            title: '4. الكروت المباعة فعلياً',
            count: inv.totalCardsSold,
            desc: 'تم بيعها وتسجيل فواتيرها',
            color: const Color(0xFFF59E0B),
            icon: Icons.check_circle_outline,
          ),
          _buildInventoryRow(
            title: '5. الكروت المستخدمة / النشطة بالراوتر',
            count: inv.totalCardsActive,
            desc: 'قام المشتركون بتسجيل الدخول بها حالياً',
            color: const Color(0xFF06B6D4),
            icon: Icons.wifi,
          ),
          _buildInventoryRow(
            title: '6. كروت منتهية الصلاحية',
            count: inv.totalCardsExpired,
            desc: 'انتهت مدة صلاحيتها أو استهلاكها',
            color: const Color(0xFF94A3B8),
            icon: Icons.hourglass_disabled_outlined,
          ),
          _buildInventoryRow(
            title: '7. كروت تالفة / ملغاة / مفقودة',
            count: inv.totalCardsDisabled,
            desc: 'تم تعطيلها أو إتلافها واستبعادها من البيع',
            color: const Color(0xFFEF4444),
            icon: Icons.cancel_outlined,
          ),
          const SizedBox(height: 16),

          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('تقييم مخزون الكروت المتاح', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: context.textPrimary)),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('القيمة البيعية المتوقعة للمخزون:', style: TextStyle(color: context.textSecondary, fontSize: 12)),
                    Text(_formatAmount(inv.stockEstimatedValue, report.currency),
                        style: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('تكلفة رأس مال المخزون (إن وجدت):', style: TextStyle(color: context.textSecondary, fontSize: 12)),
                    Text(
                      inv.stockCostValue > 0 ? _formatAmount(inv.stockCostValue, report.currency) : 'غير مسجلة',
                      style: TextStyle(
                        color: inv.stockCostValue > 0 ? const Color(0xFF38BDF8) : Colors.grey,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInventoryRow({
    required String title,
    required int count,
    required String desc,
    required Color color,
    required IconData icon,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                const SizedBox(height: 2),
                Text(desc, style: const TextStyle(color: Color(0xFF64748B), fontSize: 11)),
              ],
            ),
          ),
          Text(
            '${NumberFormat("#,##0").format(count)} كرت',
            style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 14),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // TAB 4: OPERATING EXPENSES
  // ===========================================================================
  Widget _buildExpensesTab(FinancialReportModel report) {
    final expensesAsync = ref.watch(expensesProvider);
    final breakdown = report.expensesBreakdown;
    final totalExp = report.selectedPeriod.operatingExpenses;

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFEF4444).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('إجمالي المصروفات التشغيلية للفترة', style: TextStyle(color: Color(0xFFFCA5A5), fontSize: 12)),
                    const SizedBox(height: 4),
                    Text(
                      _formatAmount(totalExp, report.currency),
                      style: const TextStyle(color: Color(0xFFEF4444), fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEF4444),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: _showAddExpenseDialog,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('إضافة مصروف'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          if (breakdown.isNotEmpty) ...[
            Text(
              'توزيع المصروفات حسب التصنيف',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
            ),
            const SizedBox(height: 10),
            Column(
              children: breakdown.map((cat) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.bgCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(cat.categoryLabelAr,
                              style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                          Text(_formatAmount(cat.totalAmount, report.currency),
                              style: const TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold, fontSize: 13)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${cat.count} فواتير مسجلة', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                          Text('${cat.percentage}%', style: const TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: (cat.percentage / 100).clamp(0.0, 1.0),
                          backgroundColor: context.bgCardAlt,
                          valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFEF4444)),
                          minHeight: 4,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
          ],

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'سجل بنود المصروفات المسجلة',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, size: 18, color: Color(0xFF38BDF8)),
                onPressed: () => ref.read(expensesProvider.notifier).refresh(),
              ),
            ],
          ),
          const SizedBox(height: 8),

          expensesAsync.when(
            data: (items) {
              if (items.isEmpty) {
                return Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: context.bgCard,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Column(
                      children: [
                        const Icon(Icons.receipt_long, size: 40, color: Colors.grey),
                        const SizedBox(height: 10),
                        Text('لم يتم تسجيل أي مصروفات حتى الآن',
                            style: TextStyle(color: context.textSecondary, fontSize: 13)),
                        const SizedBox(height: 10),
                        ElevatedButton(
                          onPressed: _showAddExpenseDialog,
                          child: const Text('تسجيل أول مصروف'),
                        ),
                      ],
                    ),
                  ),
                );
              }

              return ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: items.length,
                separatorBuilder: (context, index) => const SizedBox(height: 8),
                itemBuilder: (context, idx) {
                  final exp = items[idx];
                  return Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: context.bgCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.borderColor),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(Icons.receipt, color: Color(0xFFEF4444), size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(exp.title,
                                  style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                              const SizedBox(height: 2),
                              Text(
                                '${exp.categoryLabelAr} • ${exp.expenseDate.toIso8601String().split('T')[0]}',
                                style: const TextStyle(color: Color(0xFF64748B), fontSize: 11),
                              ),
                              if (exp.vendor != null && exp.vendor!.isNotEmpty)
                                Text('المستفيد: ${exp.vendor}',
                                    style: TextStyle(color: context.textSecondary, fontSize: 10)),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              _formatAmount(exp.amount, exp.currency),
                              style: const TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 18, color: Colors.grey),
                              onPressed: () => _confirmDeleteExpense(exp.id, exp.title),
                              tooltip: 'حذف المصروف',
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())),
            error: (e, _) => Center(child: Text('تعذر تحميل المصروفات: $e', style: const TextStyle(color: Colors.red, fontSize: 12))),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // TAB 5: PROFIT & CASH FLOW BREAKDOWN
  // ===========================================================================
  Widget _buildProfitTab(FinancialReportModel report) {
    final period = report.selectedPeriod;

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.account_balance, color: Color(0xFF38BDF8), size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'قائمة الدخل والأرباح للفترة (${period.label})',
                      style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ],
                ),
                const Divider(height: 20),
                _buildStatementRow('إجمالي المبيعات (Gross Sales):', period.grossSales, report.currency, isPositive: true),
                if (period.discounts > 0)
                  _buildStatementRow('(-) الخصومات والتخفيضات:', -period.discounts, report.currency, isNegative: true),
                if (period.refundsAmount > 0)
                  _buildStatementRow('(-) المبيعات المستردة/الملغاة:', -period.refundsAmount, report.currency, isNegative: true),
                const Divider(height: 16),
                _buildStatementRow('= صافي المبيعات (Net Sales):', period.netSales, report.currency, isHighlight: true),
                _buildStatementRow(
                  '(-) تكلفة الكروت المباعة (COGS):',
                  -period.cogs,
                  report.currency,
                  isNegative: true,
                  subtitle: period.hasCostData ? 'محسوبة من تكلفة الكرت الفعلية' : 'تكلفة الكروت غير مسجلة (0)',
                ),
                const Divider(height: 16),
                _buildStatementRow('= الربح الإجمالي (Gross Profit):', period.grossProfit, report.currency, isHighlight: true, color: const Color(0xFF10B981)),
                _buildStatementRow(
                  '(-) المصروفات التشغيلية المسجلة:',
                  -period.operatingExpenses,
                  report.currency,
                  isNegative: true,
                  subtitle: 'إنترنت، طاقة، ورق، صيانة ورواتب',
                ),
                const Divider(height: 20),
                _buildStatementRow(
                  '★ صافي الربح التشغيلي (Net Operating Profit):',
                  period.netProfit,
                  report.currency,
                  isHighlight: true,
                  isLarge: true,
                  color: period.netProfit >= 0 ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.currency_exchange, color: Color(0xFFF59E0B), size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'التدفق النقدي والسيولة الفعلية (Cash Flow)',
                      style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ],
                ),
                const Divider(height: 20),
                _buildStatementRow('المقبوضات النقدية المحصلة من العملاء:', period.cashCollected, report.currency, isPositive: true),
                _buildStatementRow('(-) المدفوعات النقدية للمصروفات:', -period.operatingExpenses, report.currency, isNegative: true),
                const Divider(height: 16),
                _buildStatementRow(
                  '★ صافي التدفق النقدي (Net Cash Flow):',
                  period.netCashFlow,
                  report.currency,
                  isHighlight: true,
                  isLarge: true,
                  color: period.netCashFlow >= 0 ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                ),
                const SizedBox(height: 8),
                const Text(
                  'ملاحظة محاسبية: يمثل صافي التدفق النقدي السيولة الحقيقية المتوفرة في الخزينة بعد طرح المصروفات المدفوعة من المبالغ المحصلة فعلياً، وهو منفصل عن الأرباح المحاسبية.',
                  style: TextStyle(color: Color(0xFF64748B), fontSize: 10, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatementRow(
    String label,
    double amount,
    String currency, {
    bool isPositive = false,
    bool isNegative = false,
    bool isHighlight = false,
    bool isLarge = false,
    Color? color,
    String? subtitle,
  }) {
    Color valColor = context.textPrimary;
    if (color != null) {
      valColor = color;
    } else if (isPositive) {
      valColor = const Color(0xFF10B981);
    } else if (isNegative) {
      valColor = const Color(0xFFEF4444);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: isHighlight ? context.textPrimary : context.textSecondary,
                    fontSize: isLarge ? 13 : 12,
                    fontWeight: isHighlight ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
              ),
              Text(
                _formatAmount(amount, currency),
                style: TextStyle(
                  color: valColor,
                  fontSize: isLarge ? 14 : 12,
                  fontWeight: isHighlight ? FontWeight.bold : FontWeight.w600,
                ),
              ),
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle, style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
          ],
        ],
      ),
    );
  }

  // ===========================================================================
  // COMMON HELPER WIDGETS (Forecast, Charts, Profiles, Routers)
  // ===========================================================================
  Widget _buildForecastCard(FinancialReportModel report) {
    if (!report.isForecastAvailable) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.bgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.auto_graph_rounded, color: context.textSecondary, size: 20),
                const SizedBox(width: 8),
                Text(
                  'التوقعات الذكية للأرباح (Smart Forecast)',
                  style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                ),
                const Spacer(),
                Text('غير متاح حالياً', style: TextStyle(color: context.textSecondary, fontSize: 11)),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              report.forecastMessage.isNotEmpty
                  ? report.forecastMessage
                  : 'البيانات التاريخية غير كافية حالياً لبناء نموذج توقع إحصائي دقيق.',
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12, height: 1.4),
            ),
          ],
        ),
      );
    }

    String trendLabel = 'مستقر';
    Color trendColor = const Color(0xFF38BDF8);
    IconData trendIcon = Icons.trending_flat;

    if (report.trend == 'UP') {
      trendLabel = 'اتجاه صاعد';
      trendColor = const Color(0xFF34D399);
      trendIcon = Icons.trending_up;
    } else if (report.trend == 'DOWN') {
      trendLabel = 'اتجاه هابط';
      trendColor = const Color(0xFFEF4444);
      trendIcon = Icons.trending_down;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: context.isDarkMode
              ? const [Color(0xFF064E3B), Color(0xFF0F172A)]
              : const [Color(0xFFECFDF5), Color(0xFFD1FAE5)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.auto_graph_rounded, color: Color(0xFF34D399), size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'التوقعات الذكية للأرباح (Smart Forecast)',
                    style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: trendColor.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(trendIcon, size: 12, color: trendColor),
                    const SizedBox(width: 4),
                    Text(trendLabel, style: TextStyle(color: trendColor, fontSize: 11, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            report.forecastMessage.isNotEmpty
                ? report.forecastMessage
                : 'بناءً على متوسط الاستهلاك وسرعة بيع الكروت، يتوقع النظام الآتي:',
            style: TextStyle(
              color: context.isDarkMode ? Colors.white.withValues(alpha: 0.85) : const Color(0xFF065F46),
              fontSize: 11,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.bgCardAlt,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('توقع الـ 7 أيام القادمة', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                      const SizedBox(height: 4),
                      Text(
                        _formatAmount(report.next7DaysForecast, report.currency),
                        style: const TextStyle(color: Color(0xFF34D399), fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.bgCardAlt,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('توقع الـ 30 يوماً القادمة', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                      const SizedBox(height: 4),
                      Text(
                        _formatAmount(report.next30DaysForecast, report.currency),
                        style: const TextStyle(color: Color(0xFF6EE7B7), fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            report.forecastNote.isNotEmpty
                ? report.forecastNote
                : 'تقدير إحصائي استرشادي مبني على متوسط استهلاك الفترة السابقة، وليس ربحاً مضموناً.',
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
          ),
        ],
      ),
    );
  }

  Widget _buildInteractive30DayChart(List<Map<String, dynamic>> daily, String currency) {
    if (daily.isEmpty) {
      return Container(
        height: 120,
        decoration: BoxDecoration(
          color: context.bgCard,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
          child: Text('لا توجد مبيعات مسجلة في آخر 30 يوماً', style: TextStyle(color: Colors.grey)),
        ),
      );
    }

    double maxVal = 1.0;
    for (var d in daily) {
      final v = double.tryParse(d['amount']?.toString() ?? '0') ?? 0;
      if (v > maxVal) maxVal = v;
    }

    final selectedItem = (_selectedChartDayIndex != null &&
            _selectedChartDayIndex! >= 0 &&
            _selectedChartDayIndex! < daily.length)
        ? daily[_selectedChartDayIndex!]
        : null;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (selectedItem != null)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: context.bgCardAlt,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF38BDF8), width: 0.8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${selectedItem['dayName'] ?? ''} (${selectedItem['date']})',
                    style: TextStyle(color: context.textPrimary, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                  Text(
                    '${_formatAmount(double.tryParse(selectedItem['amount']?.toString() ?? '0') ?? 0, currency)} • ${selectedItem['count'] ?? 0} مبيعة',
                    style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.only(bottom: 8.0),
              child: Text(
                'المس أي عمود لعرض تفاصيل ذلك اليوم بدقة:',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10),
              ),
            ),
          SizedBox(
            height: 110,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(daily.length, (idx) {
                final d = daily[idx];
                final v = double.tryParse(d['amount']?.toString() ?? '0') ?? 0;
                final isSelected = _selectedChartDayIndex == idx;
                final ratio = v > 0 ? (v / maxVal).clamp(0.08, 1.0) : 0.04;

                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _selectedChartDayIndex = isSelected ? null : idx;
                      });
                    },
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 1),
                      height: 95 * ratio,
                      decoration: BoxDecoration(
                        gradient: v > 0
                            ? LinearGradient(
                                colors: isSelected
                                    ? [const Color(0xFFFBBF24), const Color(0xFFD97706)]
                                    : [const Color(0xFF38BDF8), const Color(0xFF1D4ED8)],
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                              )
                            : null,
                        color: v == 0 ? context.borderColor.withValues(alpha: 0.3) : null,
                        borderRadius: BorderRadius.circular(3),
                        border: isSelected ? Border.all(color: context.textPrimary, width: 1) : null,
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'قبل 30 يوماً (${daily.first['date'] ?? ''})',
                style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
              ),
              Text(
                'اليوم (${daily.last['date'] ?? ''})',
                style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 10, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProfilesBreakdown(List<Map<String, dynamic>> profiles, String currency) {
    if (profiles.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.borderColor),
        ),
        child: Center(
          child: Text('لا توجد باقات تم بيعها حتى الآن في سجلات النظام',
              style: TextStyle(color: context.textSecondary, fontSize: 12)),
        ),
      );
    }

    return Column(
      children: profiles.map((p) {
        final name = p['name']?.toString() ?? 'باقة هوتسبوت';
        final count = p['salesCount'] ?? p['count'] ?? 0;
        final total = double.tryParse(p['revenue']?.toString() ?? p['total']?.toString() ?? '0') ?? 0;
        final pct = p['percentage'] ?? 0;

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: context.bgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.borderColor),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Icon(Icons.wifi, color: Color(0xFF10B981), size: 16),
                      ),
                      const SizedBox(width: 8),
                      Text(name, style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                    ],
                  ),
                  Text(
                    _formatAmount(total, currency),
                    style: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('$count كرت تم بيعه', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                  if (pct > 0)
                    Text('$pct% من إجمالي المبيعات', style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
                ],
              ),
              if (pct > 0) ...[
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (pct / 100).clamp(0.0, 1.0),
                    backgroundColor: context.bgCardAlt,
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF10B981)),
                    minHeight: 4,
                  ),
                ),
              ],
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildRoutersBreakdown(List<Map<String, dynamic>> routers, String currency) {
    if (routers.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.borderColor),
        ),
        child: Center(
          child: Text('لا توجد مبيعات مقترنة براوترات حتى الآن',
              style: TextStyle(color: context.textSecondary, fontSize: 12)),
        ),
      );
    }

    return Column(
      children: routers.map((r) {
        final name = r['deviceName']?.toString() ?? r['routerName']?.toString() ?? 'راوتر';
        final count = r['salesCount'] ?? 0;
        final rev = double.tryParse(r['revenue']?.toString() ?? '0') ?? 0;
        final pct = r['percentage'] ?? 0;

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: context.bgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.borderColor),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF38BDF8).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Icon(Icons.router_rounded, color: Color(0xFF38BDF8), size: 16),
                      ),
                      const SizedBox(width: 8),
                      Text(name, style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                    ],
                  ),
                  Text(
                    _formatAmount(rev, currency),
                    style: const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('$count عملية بيع مسجلة', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                  if (pct > 0)
                    Text('$pct% من الإجمالي', style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
                ],
              ),
              if (pct > 0) ...[
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (pct / 100).clamp(0.0, 1.0),
                    backgroundColor: context.bgCardAlt,
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF38BDF8)),
                    minHeight: 4,
                  ),
                ),
              ],
            ],
          ),
        );
      }).toList(),
    );
  }
}
