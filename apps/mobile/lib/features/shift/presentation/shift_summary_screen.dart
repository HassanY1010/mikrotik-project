import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import '../../../core/constants/api_endpoints.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/services/thermal_printer_service.dart';

class ShiftSummaryScreen extends ConsumerStatefulWidget {
  const ShiftSummaryScreen({super.key});

  @override
  ConsumerState<ShiftSummaryScreen> createState() => _ShiftSummaryScreenState();
}

class _ShiftSummaryScreenState extends ConsumerState<ShiftSummaryScreen> {
  ShiftSummaryModel? _serverSummary;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _fetchSummary();
  }

  Future<void> _fetchSummary() async {
    setState(() => _isLoading = true);
    final apiClient = ref.read(apiClientProvider);

    try {
      final res = await apiClient.get(ApiEndpoints.shiftSummary);
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      if (mounted) {
        setState(() {
          _serverSummary = ShiftSummaryModel.fromJson(data as Map<String, dynamic>);
        });
      }
    } catch (_) {
      // If offline, metrics calculate locally from local storage
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showPrintSummaryDialog(double totalRev, int totalCount, String currency, List<SaleReceiptModel> localSales) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: const [
            Icon(Icons.print, color: Color(0xFF0D9488)),
            SizedBox(width: 8),
            Text('طباعة تقرير الوردية', style: TextStyle(fontSize: 16)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'هل تريد إرسال تقرير إغلاق الوردية المالي إلى الطابعة الحرارية؟',
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('إجمالي الكروت:', style: TextStyle(color: Colors.grey)),
                      Text('$totalCount كرت', style: const TextStyle(fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('إجمالي النقدية:', style: TextStyle(color: Colors.grey)),
                      Text(
                        '${totalRev.toStringAsFixed(0)} $currency',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF10B981)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إلغاء', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0D9488),
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.print, size: 18),
            label: const Text('طباعة فورية'),
            onPressed: () async {
              Navigator.pop(ctx);
              final cashierName = ref.read(currentUserProvider)?.fullName ?? 'Cashier';
              final bytes = ThermalPrinterService.buildShiftSummaryEscPos(
                totalRevenue: totalRev,
                totalSalesCount: totalCount,
                currency: currency,
                cashierName: cashierName,
              );
              final result = await ThermalPrinterService.printOverNetwork(bytes: bytes);
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(result.message),
                  backgroundColor: result.isSuccess ? const Color(0xFF0D9488) : Colors.redAccent,
                  duration: const Duration(seconds: 4),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final storage = ref.watch(localStorageProvider);
    final localSales = storage.getSalesHistory();

    // Compute metrics combining server or local offline sales
    double totalRev = _serverSummary?.totalRevenue ?? 0.0;
    int totalCount = _serverSummary?.totalSalesCount ?? 0;
    String currency = _serverSummary?.currency ?? 'SDG';

    if (totalRev == 0 && localSales.isNotEmpty) {
      totalRev = localSales.fold(0.0, (acc, s) => acc + s.amount);
      totalCount = localSales.length;
    }

    // Payment breakdown from local sales
    double cashAmount = localSales
        .where((s) => s.paymentMethod == 'CASH')
        .fold(0.0, (acc, s) => acc + s.amount);
    double bankakAmount = localSales
        .where((s) => s.paymentMethod == 'MOBILE_WALLET')
        .fold(0.0, (acc, s) => acc + s.amount);
    double fawryAmount = localSales
        .where((s) => s.paymentMethod == 'TRANSFER')
        .fold(0.0, (acc, s) => acc + s.amount);

    final dateFormat = intl.DateFormat('yyyy-MM-dd HH:mm');

    return Scaffold(
      appBar: AppBar(
        title: const Text('تقرير وردية الكاشير'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث التقرير',
            onPressed: _isLoading ? null : _fetchSummary,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF0D9488)))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(14.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // KPI Summary Cards
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(16.0),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E293B),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0xFF0D9488).withValues(alpha: 0.3)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: const [
                                  Text(
                                    'النقدية في الدرج',
                                    style: TextStyle(fontSize: 12, color: Colors.grey),
                                  ),
                                  Icon(Icons.point_of_sale, size: 18, color: Color(0xFF10B981)),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${totalRev.toStringAsFixed(0)} $currency',
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF10B981),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(16.0),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E293B),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.amber.withValues(alpha: 0.3)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: const [
                                  Text(
                                    'الكروت المباعة',
                                    style: TextStyle(fontSize: 12, color: Colors.grey),
                                  ),
                                  Icon(Icons.confirmation_number_outlined, size: 18, color: Colors.amber),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '$totalCount كرت',
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.amber,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Payment Methods Breakdown Card
                  Container(
                    padding: const EdgeInsets.all(14.0),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFF334155)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'توزيع الإيراد حسب طريقة الدفع',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 10),
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
                                  children: [
                                    const Text('كاش (نقداً)', style: TextStyle(fontSize: 11, color: Colors.grey)),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${cashAmount.toStringAsFixed(0)} SDG',
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0F172A),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Column(
                                  children: [
                                    const Text('بنكك', style: TextStyle(fontSize: 11, color: Colors.grey)),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${bankakAmount.toStringAsFixed(0)} SDG',
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF5EEAD4)),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0F172A),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Column(
                                  children: [
                                    const Text('أوكاش/فوري', style: TextStyle(fontSize: 11, color: Colors.grey)),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${fawryAmount.toStringAsFixed(0)} SDG',
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          height: 40,
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFF0D9488),
                              side: const BorderSide(color: Color(0xFF0D9488)),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                            icon: const Icon(Icons.receipt_long, size: 18),
                            label: const Text('طباعة إيصال إغلاق الوردية'),
                            onPressed: () => _showPrintSummaryDialog(totalRev, totalCount, currency, localSales),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Profiles Breakdown Card if exists
                  if (_serverSummary != null && _serverSummary!.profileBreakdown.isNotEmpty) ...[
                    const Text(
                      'المبيعات حسب الباقة',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF334155)),
                      ),
                      child: ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _serverSummary!.profileBreakdown.length,
                        separatorBuilder: (_, _) => const Divider(height: 1, color: Color(0xFF334155)),
                        itemBuilder: (context, index) {
                          final p = _serverSummary!.profileBreakdown[index];
                          return ListTile(
                            title: Text(p.profileName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                            trailing: Text(
                              '${p.count} كرت  |  ${p.totalAmount.toStringAsFixed(0)} $currency',
                              style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF10B981), fontSize: 13),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Recent Local Sales History
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'آخر المبيعات المسجلة محلياً',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        '${localSales.length} فاتورة',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  if (localSales.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(28.0),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF334155)),
                      ),
                      child: Center(
                        child: Column(
                          children: const [
                            Icon(Icons.receipt_outlined, size: 40, color: Colors.grey),
                            SizedBox(height: 8),
                            Text(
                              'لا توجد مبيعات مسجلة في هذه الوردية بعد',
                              style: TextStyle(color: Colors.grey, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: localSales.take(20).length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final s = localSales[index];
                        return Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E293B),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFF334155)),
                          ),
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                            leading: CircleAvatar(
                              backgroundColor: s.isOffline
                                  ? Colors.amber.withValues(alpha: 0.2)
                                  : const Color(0xFF0D9488).withValues(alpha: 0.2),
                              child: Icon(
                                s.isOffline ? Icons.offline_bolt : Icons.receipt_long,
                                color: s.isOffline ? Colors.amber : const Color(0xFF0D9488),
                                size: 20,
                              ),
                            ),
                            title: Text(
                              '${s.invoiceNumber} • ${s.profileName}',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 2.0),
                              child: Text(
                                'المستخدم: ${s.username} | ${dateFormat.format(s.soldAt)}',
                                style: const TextStyle(fontSize: 11, color: Colors.grey),
                              ),
                            ),
                            trailing: Text(
                              '${s.amount.toStringAsFixed(0)} ${s.currency}',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF10B981)),
                            ),
                          ),
                        );
                      },
                    ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
    );
  }
}
