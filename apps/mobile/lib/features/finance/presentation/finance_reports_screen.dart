import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../pos/presentation/pos_screen.dart';

class FinanceReportsScreen extends ConsumerStatefulWidget {
  const FinanceReportsScreen({super.key});

  @override
  ConsumerState<FinanceReportsScreen> createState() => _FinanceReportsScreenState();
}

class _FinanceReportsScreenState extends ConsumerState<FinanceReportsScreen> {
  int? _selectedChartDayIndex;
  bool _isSyncing = false;

  final NumberFormat _currencyFormat = NumberFormat('#,##0', 'en_US');

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
    } catch (_) {
      await ref.read(financialReportProvider.notifier).refresh();
    } finally {
      if (mounted) setState(() => _isSyncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final reportAsync = ref.watch(financialReportProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.bar_chart_rounded, color: Color(0xFFFBBF24), size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'التقارير المالية والأرباح',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'بيانات مبيعات حقيقية وتدقيق هوامش الربح',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
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
      ),
      body: reportAsync.when(
        data: (report) => RefreshIndicator(
          onRefresh: _handleRefreshAndSync,
          color: const Color(0xFF38BDF8),
          backgroundColor: const Color(0xFF1E293B),
          child: _buildReportContent(context, report),
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
                'جارٍ تدقيق واستخراج السجلات المالية الفعلية...',
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
                const Text(
                  'تعذر تحميل التقرير المالي',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  err.toString(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
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
    );
  }

  Widget _buildReportContent(BuildContext context, FinancialReportModel report) {
    final bool hasZeroAllTime = report.allTimeSalesCount == 0 && report.allTimeRevenue == 0;

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // If no sales at all exist in the system:
          if (hasZeroAllTime)
            Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFF334155)),
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
                      children: const [
                        Text(
                          'لا توجد عمليات بيع مسجلة حتى الآن',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        SizedBox(height: 3),
                        Text(
                          'يمكنك بدء تسجيل المبيعات وطباعة الإيصالات عبر نقطة البيع السريعة.',
                          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const PosScreen()),
                      );
                    },
                    child: const Text('فتح POS', style: TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),

          // 1. Four Key Financial Period Cards
          Row(
            children: [
              Expanded(
                child: _buildFinancialMetricCard(
                  title: 'مبيعات اليوم',
                  amount: _formatAmount(report.todayRevenue, report.currency),
                  salesCount: '${report.todaySalesCount} مبيعة مكتملة',
                  collectedAmount: 'المحصّل: ${_formatAmount(report.todayCollected, report.currency)}',
                  accentColor: const Color(0xFF3B82F6),
                  icon: Icons.today_rounded,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildFinancialMetricCard(
                  title: 'هذا الأسبوع',
                  amount: _formatAmount(report.weekRevenue, report.currency),
                  salesCount: '${report.weekSalesCount} مبيعة مكتملة',
                  collectedAmount: 'المحصّل: ${_formatAmount(report.weekCollected, report.currency)}',
                  accentColor: const Color(0xFF10B981),
                  icon: Icons.date_range_rounded,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildFinancialMetricCard(
                  title: 'هذا الشهر',
                  amount: _formatAmount(report.monthRevenue, report.currency),
                  salesCount: '${report.monthSalesCount} مبيعة مكتملة',
                  collectedAmount: 'المحصّل: ${_formatAmount(report.monthCollected, report.currency)}',
                  accentColor: const Color(0xFF8B5CF6),
                  icon: Icons.calendar_month_rounded,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildFinancialMetricCard(
                  title: 'الإجمالي الكلي',
                  amount: _formatAmount(report.allTimeRevenue, report.currency),
                  salesCount: '${report.allTimeSalesCount} مبيعة مكتملة',
                  collectedAmount: 'صافي الربح: ${_formatAmount(report.estimatedProfit, report.currency)}',
                  accentColor: const Color(0xFFF59E0B),
                  icon: Icons.account_balance_wallet_rounded,
                ),
              ),
            ],
          ),

          // Net profit transparent explanation banner
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline, size: 16, color: Color(0xFF38BDF8)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    report.profitNotes.isNotEmpty
                        ? report.profitNotes
                        : 'صافي الربح الفعلي يمثل إجمالي المبالغ المحصلة مخصوماً منها التكاليف المسجلة إن وجدت.',
                    style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 11, height: 1.4),
                  ),
                ),
              ],
            ),
          ),

          // Refunds banner if any exist
          if (report.refundedCount > 0) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.assignment_return_outlined, size: 16, color: Color(0xFFEF4444)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'تم تسجيل ${report.refundedCount} مبيعة ملغاة/مستردة بقيمة ${_formatAmount(report.totalRefunds, report.currency)} (مستبعدة من صافي الإيرادات المحصلة)',
                      style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 11),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 20),

          // 2. Smart Forecast Card
          _buildForecastCard(report),

          const SizedBox(height: 24),

          // 3. 30-Day Daily Movement Chart
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'حركة المبيعات خلال آخر 30 يوماً',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              Text(
                'إجمالي الفترة: ${_formatAmount(report.dailyRevenueLast30Days.fold<double>(0, (sum, d) => sum + (double.tryParse(d['amount']?.toString() ?? '0') ?? 0)), report.currency)}',
                style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _buildInteractive30DayChart(report.dailyRevenueLast30Days, report.currency),

          const SizedBox(height: 24),

          // 4. Top 5 Best-Selling Packages
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'أكثر 5 باقات مبيعاً (Top 5 Packages)',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              Text(
                '${report.bestSellingProfiles.length} باقات مباعة',
                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _buildProfilesBreakdown(report.bestSellingProfiles, report.currency),

          const SizedBox(height: 24),

          // 5. Sales Distribution by Routers
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'توزيع المبيعات حسب الراوترات',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
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

  Widget _buildFinancialMetricCard({
    required String title,
    required String amount,
    required String salesCount,
    required String collectedAmount,
    required Color accentColor,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w600)),
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: accentColor.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: accentColor, size: 14),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            amount,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(color: accentColor, shape: BoxShape.circle),
              ),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  salesCount,
                  style: TextStyle(color: accentColor, fontSize: 11, fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            collectedAmount,
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildForecastCard(FinancialReportModel report) {
    if (!report.isForecastAvailable) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF334155)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.auto_graph_rounded, color: Color(0xFF94A3B8), size: 20),
                SizedBox(width: 8),
                Text(
                  'التوقعات الذكية للأرباح (Smart Forecast)',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                ),
                Spacer(),
                Text(
                  'غير متاح حالياً',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              report.forecastMessage.isNotEmpty
                  ? report.forecastMessage
                  : 'البيانات التاريخية غير كافية حالياً لبناء نموذج توقع إحصائي دقيق.',
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12, height: 1.4),
            ),
            if (report.forecastNote.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                report.forecastNote,
                style: const TextStyle(color: Color(0xFF64748B), fontSize: 11),
              ),
            ],
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
        gradient: const LinearGradient(
          colors: [Color(0xFF064E3B), Color(0xFF0F172A)],
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
                children: const [
                  Icon(Icons.auto_graph_rounded, color: Color(0xFF34D399), size: 20),
                  SizedBox(width: 8),
                  Text(
                    'التوقعات الذكية للأرباح (Smart Forecast)',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
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
            style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11, height: 1.4),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF1E293B)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('توقع الـ 7 أيام القادمة', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
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
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF1E293B)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('توقع الـ 30 يوماً القادمة', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
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
          color: const Color(0xFF1E293B),
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
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Detail card for the selected day or overall guide
          if (selectedItem != null)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF38BDF8), width: 0.8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${selectedItem['dayName'] ?? ''} (${selectedItem['date']})',
                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
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
                        color: v == 0 ? const Color(0xFF334155).withValues(alpha: 0.3) : null,
                        borderRadius: BorderRadius.circular(3),
                        border: isSelected ? Border.all(color: Colors.white, width: 1) : null,
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
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF334155)),
        ),
        child: const Center(
          child: Text('لا توجد باقات تم بيعها حتى الآن في سجلات النظام', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
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
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF334155)),
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
                      Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
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
                  Text('$count كرت تم بيعه', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
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
                    backgroundColor: const Color(0xFF0F172A),
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
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF334155)),
        ),
        child: const Center(
          child: Text('لا توجد مبيعات مقترنة براوترات حتى الآن', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
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
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF334155)),
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
                      Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
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
                  Text('$count عملية بيع مسجلة', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
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
                    backgroundColor: const Color(0xFF0F172A),
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
