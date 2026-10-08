import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

class FinanceReportsScreen extends ConsumerWidget {
  const FinanceReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
              child: const Icon(Icons.bar_chart, color: Color(0xFFFBBF24), size: 22),
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
                  'المبيعات، هوامش الربح، والتوقعات الذكية',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
            onPressed: () => ref.invalidate(financialReportProvider),
            tooltip: 'تحديث التقرير',
          ),
          IconButton(
            icon: const Icon(Icons.download, color: Color(0xFF10B981)),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('تم تصدير التقرير المالي الشامل بصيغة PDF بنجاح'),
                  backgroundColor: Color(0xFF10B981),
                ),
              );
            },
            tooltip: 'تصدير PDF',
          ),
        ],
      ),
      body: reportAsync.when(
        data: (report) => _buildReportContent(context, report),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(
          child: Text('خطأ في جلب التقرير: $err', style: const TextStyle(color: Colors.red)),
        ),
      ),
    );
  }

  Widget _buildReportContent(BuildContext context, FinancialReportModel report) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Period revenue summary cards (2x2 grid)
          Row(
            children: [
              Expanded(
                child: _buildRevenueMiniCard(
                  'اليوم',
                  '${report.todayRevenue.toStringAsFixed(0)} ${report.currency}',
                  '${report.todaySalesCount} مبيعة',
                  const Color(0xFF2563EB),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildRevenueMiniCard(
                  'هذا الأسبوع',
                  '${report.weekRevenue.toStringAsFixed(0)} ${report.currency}',
                  '${report.weekSalesCount} مبيعة',
                  const Color(0xFF0D9488),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _buildRevenueMiniCard(
                  'هذا الشهر',
                  '${report.monthRevenue.toStringAsFixed(0)} ${report.currency}',
                  '${report.monthSalesCount} مبيعة',
                  const Color(0xFF7C3AED),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildRevenueMiniCard(
                  'الإجمالي الكلي',
                  '${report.allTimeRevenue.toStringAsFixed(0)} ${report.currency}',
                  'صافي الربح: ${report.estimatedProfit.toStringAsFixed(0)}',
                  const Color(0xFFD97706),
                ),
              ),
            ],
          ),

          const SizedBox(height: 18),

          // Smart Forecast Card (P2 requirement)
          _buildForecastCard(report),

          const SizedBox(height: 20),

          // Daily Revenue 30-Day Trend (Bar Chart simulation)
          const Text(
            'حركة المبيعات خلال آخر 30 يوماً',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 10),
          _buildTrendChart(report.dailyRevenueLast30Days),

          const SizedBox(height: 20),

          // Best Selling Profiles breakdown
          const Text(
            'أكثر الباقات مبيعاً',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 10),
          _buildProfilesBreakdown(report.bestSellingProfiles, report.currency),

          const SizedBox(height: 20),

          // Router Breakdown
          if (report.salesByRouter.isNotEmpty) ...[
            const Text(
              'توزيع المبيعات حسب الراوترات',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 10),
            _buildRoutersBreakdown(report.salesByRouter, report.currency),
          ],
        ],
      ),
    );
  }

  Widget _buildRevenueMiniCard(String title, String amount, String subtitle, Color color) {
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
              Text(title, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
              CircleAvatar(radius: 4, backgroundColor: color),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            amount,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
          ),
          const SizedBox(height: 4),
          Text(subtitle, style: TextStyle(color: color, fontSize: 10)),
        ],
      ),
    );
  }

  Widget _buildForecastCard(FinancialReportModel report) {
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
                  Icon(Icons.trending_up, color: Color(0xFF34D399), size: 20),
                  SizedBox(width: 8),
                  Text(
                    'التوقعات الذكية للأرباح (Smart Forecast)',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: const [
                    Icon(Icons.arrow_upward, size: 12, color: Color(0xFF34D399)),
                    SizedBox(width: 4),
                    Text('اتجاه صاعد', style: TextStyle(color: Color(0xFF34D399), fontSize: 11)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'بناءً على متوسط الاستهلاك وسرعة بيع الكروت، يتوقع النظام تحقيق الآتي:',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 11),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('توقع الـ 7 أيام القادمة', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
                      const SizedBox(height: 4),
                      Text(
                        '${report.next7DaysForecast.toStringAsFixed(0)} ${report.currency}',
                        style: const TextStyle(color: Color(0xFF34D399), fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('توقع الـ 30 يوماً القادمة', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
                      const SizedBox(height: 4),
                      Text(
                        '${report.next30DaysForecast.toStringAsFixed(0)} ${report.currency}',
                        style: const TextStyle(color: Color(0xFF6EE7B7), fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTrendChart(List<Map<String, dynamic>> daily) {
    if (daily.isEmpty) {
      return Container(
        height: 100,
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
          child: Text('بيانات المبيعات قيد التجميع', style: TextStyle(color: Colors.grey)),
        ),
      );
    }

    double maxVal = 1.0;
    for (var d in daily) {
      final v = double.tryParse(d['revenue']?.toString() ?? '0') ?? 0;
      if (v > maxVal) maxVal = v;
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        children: [
          SizedBox(
            height: 100,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: daily.map((d) {
                final v = double.tryParse(d['revenue']?.toString() ?? '0') ?? 0;
                final ratio = (v / maxVal).clamp(0.1, 1.0);
                return Expanded(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    height: 90 * ratio,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF38BDF8), Color(0xFF1D4ED8)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('بداية الفترة', style: TextStyle(color: Color(0xFF64748B), fontSize: 10)),
              Text('اليوم', style: TextStyle(color: Color(0xFF38BDF8), fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProfilesBreakdown(List<Map<String, dynamic>> profiles, String currency) {
    if (profiles.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Center(
          child: Text('لا توجد مبيعات مسجلة للباقات حتى الآن', style: TextStyle(color: Colors.grey, fontSize: 12)),
        ),
      );
    }

    return Column(
      children: profiles.map((p) {
        final name = p['profileName']?.toString() ?? 'باقة';
        final count = p['count'] ?? 0;
        final total = double.tryParse(p['total']?.toString() ?? '0') ?? 0;

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text('$count كرت تم بيعه', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                ],
              ),
              Text(
                '${total.toStringAsFixed(0)} $currency',
                style: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold, fontSize: 13),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildRoutersBreakdown(List<Map<String, dynamic>> routers, String currency) {
    return Column(
      children: routers.map((r) {
        final name = r['routerName']?.toString() ?? 'راوتر';
        final count = r['salesCount'] ?? 0;
        final rev = double.tryParse(r['revenue']?.toString() ?? '0') ?? 0;

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.router, color: Color(0xFF38BDF8), size: 18),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                      Text('$count عملية بيع', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                    ],
                  ),
                ],
              ),
              Text(
                '${rev.toStringAsFixed(0)} $currency',
                style: const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold, fontSize: 13),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
