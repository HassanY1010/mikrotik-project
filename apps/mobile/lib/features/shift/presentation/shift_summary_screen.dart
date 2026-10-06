import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import '../../../core/constants/api_endpoints.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

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
      setState(() {
        _serverSummary = ShiftSummaryModel.fromJson(data as Map<String, dynamic>);
      });
    } catch (_) {
      // If offline, we calculate summary locally from storage
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final storage = ref.watch(localStorageProvider);
    final localSales = storage.getSalesHistory();

    // Compute offline fallback metrics if server summary is null
    double totalRev = _serverSummary?.totalRevenue ?? 0.0;
    int totalCount = _serverSummary?.totalSalesCount ?? 0;
    String currency = _serverSummary?.currency ?? 'YER';

    if (_serverSummary == null && localSales.isNotEmpty) {
      totalRev = localSales.fold(0.0, (acc, s) => acc + s.amount);
      totalCount = localSales.length;
    }

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
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // KPI Summary Cards
                  Row(
                    children: [
                      Expanded(
                        child: Card(
                          child: Padding(
                            padding: const EdgeInsets.all(18.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('إجمالي النقدية في الدرج',
                                    style: TextStyle(fontSize: 13, color: Colors.grey)),
                                const SizedBox(height: 8),
                                Text(
                                  '${totalRev.toStringAsFixed(0)} $currency',
                                  style: TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.bold,
                                    color: theme.colorScheme.primary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Card(
                          child: Padding(
                            padding: const EdgeInsets.all(18.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('عدد الكروت المباعة',
                                    style: TextStyle(fontSize: 13, color: Colors.grey)),
                                const SizedBox(height: 8),
                                Text(
                                  '$totalCount كرت',
                                  style: const TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.amber,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Profiles Breakdown Card
                  if (_serverSummary != null && _serverSummary!.profileBreakdown.isNotEmpty) ...[
                    const Text(
                      'المبيعات حسب الباقة',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Card(
                      child: ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _serverSummary!.profileBreakdown.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final p = _serverSummary!.profileBreakdown[index];
                          return ListTile(
                            title: Text(p.profileName, style: const TextStyle(fontWeight: FontWeight.bold)),
                            trailing: Text(
                              '${p.count} كرت  |  ${p.totalAmount.toStringAsFixed(0)} $currency',
                              style: TextStyle(fontWeight: FontWeight.bold, color: theme.colorScheme.primary),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],

                  // Recent Local Sales History
                  const Text(
                    'آخر المبيعات المسجلة محلياً',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),

                  if (localSales.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(24.0),
                        child: Center(
                          child: Text('لا توجد مبيعات مسجلة في هذه الوردية بعد',
                              style: TextStyle(color: Colors.grey)),
                        ),
                      ),
                    )
                  else
                    ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: localSales.take(15).length,
                      separatorBuilder: (_, _) => const SizedBox(height: 6),
                      itemBuilder: (context, index) {
                        final s = localSales[index];
                        return Card(
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: s.isOffline
                                  ? Colors.amber.withValues(alpha: 0.2)
                                  : const Color(0xFF0D9488).withValues(alpha: 0.2),
                              child: Icon(
                                s.isOffline ? Icons.offline_bolt : Icons.receipt_long,
                                color: s.isOffline ? Colors.amber : const Color(0xFF0D9488),
                              ),
                            ),
                            title: Text(
                              '${s.invoiceNumber}  •  ${s.profileName}',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                            subtitle: Text(
                              'المستخدم: ${s.username} | ${dateFormat.format(s.soldAt)}',
                              style: const TextStyle(fontSize: 11, color: Colors.grey),
                            ),
                            trailing: Text(
                              '${s.amount.toStringAsFixed(0)} ${s.currency}',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                            ),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
    );
  }
}
