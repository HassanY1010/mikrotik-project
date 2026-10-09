import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import 'package:pdf/pdf.dart';
import 'package:printing/printing.dart';
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
  bool _isSyncing = false;
  bool _isClosingShift = false;
  String? _fetchError;
  bool _isShiftClosedLocally = false;
  DateTime? _closedAt;

  @override
  void initState() {
    super.initState();
    _fetchSummary();
  }

  Future<void> _fetchSummary() async {
    setState(() {
      _isLoading = true;
      _fetchError = null;
    });

    final apiClient = ref.read(apiClientProvider);

    try {
      final res = await apiClient.get(ApiEndpoints.shiftSummary);
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      if (mounted) {
        setState(() {
          _serverSummary = ShiftSummaryModel.fromJson(data as Map<String, dynamic>);
          if (_serverSummary!.isClosed) {
            _isShiftClosedLocally = true;
            _closedAt = _serverSummary!.closedAt;
          }
          _fetchError = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _fetchError = 'تعذر الاتصال بالخادم الرئيسي لجلب بيانات الوردية السحابية.';
        });
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSyncAndRefresh() async {
    if (_isSyncing) return;

    setState(() => _isSyncing = true);
    final syncManager = ref.read(syncManagerProvider);

    try {
      // 1. Push any pending offline sales mutations to server
      final pushResult = await syncManager.pushPendingMutations();

      // 2. Pull latest catalog updates
      await syncManager.pullCatalog();

      // 3. Refresh server shift summary
      await _fetchSummary();

      // 4. Refresh local providers
      ref.read(pendingMutationsProvider.notifier).refresh();
      ref.read(offlineCardsProvider.notifier).refresh();

      if (!mounted) return;

      String message;
      if (pushResult.appliedCount > 0) {
        message = 'تمت المزامنة بنجاح! تم اعتماد ${pushResult.appliedCount} عملية وتحديث تقرير الوردية.';
      } else {
        message = 'تم تحديث بيانات الوردية بنجاح من الخادم.';
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: const Color(0xFF0D9488),
          duration: const Duration(seconds: 3),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تعذر إتمام المزامنة: $e'),
          backgroundColor: Colors.redAccent,
          duration: const Duration(seconds: 4),
        ),
      );
    } finally {
      if (mounted) setState(() => _isSyncing = false);
    }
  }

  Future<void> _closeShiftOnServer({
    required double cashInDrawer,
    required int totalCardsCount,
    required double totalRevenue,
    required double cashAmount,
    required double bankakAmount,
    required double fawryAmount,
    required double cardAmount,
    required String currency,
    required String cashierName,
    required String tenantName,
    required DateTime periodStart,
    required List<ShiftTransactionItem> recentTransactions,
  }) async {
    if (_isClosingShift || _isShiftClosedLocally) return;

    setState(() => _isClosingShift = true);
    final apiClient = ref.read(apiClientProvider);

    try {
      final res = await apiClient.post(ApiEndpoints.closeShift);
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      if (data is Map<String, dynamic>) {
        _serverSummary = ShiftSummaryModel.fromJson(data);
      }

      setState(() {
        _isShiftClosedLocally = true;
        _closedAt = DateTime.now();
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم إغلاق الوردية المالية واعتماد السجلات بنجاح!'),
          backgroundColor: Color(0xFF0D9488),
          duration: Duration(seconds: 3),
        ),
      );

      // Offer printing PDF report immediately after close
      _printPdfReport(
        cashInDrawer: cashInDrawer,
        totalCardsCount: totalCardsCount,
        totalRevenue: totalRevenue,
        cashAmount: cashAmount,
        bankakAmount: bankakAmount,
        fawryAmount: fawryAmount,
        cardAmount: cardAmount,
        currency: currency,
        cashierName: cashierName,
        tenantName: tenantName,
        periodStart: periodStart,
        recentTransactions: recentTransactions,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('فشل إغلاق الوردية على الخادم: $e'),
          backgroundColor: Colors.redAccent,
          duration: const Duration(seconds: 4),
        ),
      );
    } finally {
      if (mounted) setState(() => _isClosingShift = false);
    }
  }

  Future<void> _printPdfReport({
    required double cashInDrawer,
    required int totalCardsCount,
    required double totalRevenue,
    required double cashAmount,
    required double bankakAmount,
    required double fawryAmount,
    required double cardAmount,
    required String currency,
    required String cashierName,
    required String tenantName,
    required DateTime periodStart,
    required List<ShiftTransactionItem> recentTransactions,
  }) async {
    try {
      final pdfBytes = await ThermalPrinterService.generateShiftSummaryPdf(
        tenantName: tenantName,
        cashierName: cashierName,
        periodStart: periodStart,
        periodEnd: _closedAt ?? DateTime.now(),
        cashInDrawer: cashInDrawer,
        totalSalesCount: totalCardsCount,
        cashAmount: cashAmount,
        bankakAmount: bankakAmount,
        fawryAmount: fawryAmount,
        cardAmount: cardAmount,
        totalRevenue: totalRevenue,
        currency: currency,
        recentTransactions: recentTransactions,
        isClosed: _isShiftClosedLocally,
        closedAt: _closedAt,
      );

      await Printing.layoutPdf(
        name: 'Shift_Report_${cashierName}_${DateTime.now().millisecondsSinceEpoch}',
        onLayout: (PdfPageFormat format) async => pdfBytes,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تعذر إنشاء ملف PDF: $e'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  void _showCloseShiftDialog({
    required double cashInDrawer,
    required int totalCardsCount,
    required double totalRevenue,
    required double cashAmount,
    required double bankakAmount,
    required double fawryAmount,
    required double cardAmount,
    required String currency,
    required String cashierName,
    required String tenantName,
    required DateTime periodStart,
    required List<ShiftTransactionItem> recentTransactions,
  }) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: const [
            Icon(Icons.point_of_sale, color: Color(0xFF0D9488)),
            SizedBox(width: 8),
            Text('إغلاق وطباعة الوردية', style: TextStyle(fontSize: 16)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'تأكيد مطابقة النقدية والعمليات قبل إغلاق الوردية وطباعة التقرير:',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('النقدية الفعلية بالدرج:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      Text(
                        '${cashInDrawer.toStringAsFixed(0)} $currency',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF10B981), fontSize: 14),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('الكروت المباعة:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      Text('$totalCardsCount كرت', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('بنكك (محفظة هاتف):', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      Text('${bankakAmount.toStringAsFixed(0)} $currency', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF5EEAD4), fontSize: 13)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('أوكاش / فوري:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      Text('${fawryAmount.toStringAsFixed(0)} $currency', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    ],
                  ),
                  const Divider(height: 16, color: Color(0xFF334155)),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('إجمالي الإيراد العام:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      Text(
                        '${totalRevenue.toStringAsFixed(0)} $currency',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Colors.white),
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
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF5EEAD4),
              side: const BorderSide(color: Color(0xFF0D9488)),
            ),
            icon: const Icon(Icons.picture_as_pdf, size: 16),
            label: const Text('تقرير PDF'),
            onPressed: () {
              Navigator.pop(ctx);
              _printPdfReport(
                cashInDrawer: cashInDrawer,
                totalCardsCount: totalCardsCount,
                totalRevenue: totalRevenue,
                cashAmount: cashAmount,
                bankakAmount: bankakAmount,
                fawryAmount: fawryAmount,
                cardAmount: cardAmount,
                currency: currency,
                cashierName: cashierName,
                tenantName: tenantName,
                periodStart: periodStart,
                recentTransactions: recentTransactions,
              );
            },
          ),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0D9488),
              foregroundColor: Colors.white,
            ),
            icon: _isClosingShift
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.check_circle_outline, size: 16),
            label: Text(_isShiftClosedLocally ? 'طباعة التقرير' : 'إغلاق الوردية'),
            onPressed: _isClosingShift
                ? null
                : () {
                    Navigator.pop(ctx);
                    if (!_isShiftClosedLocally) {
                      _closeShiftOnServer(
                        cashInDrawer: cashInDrawer,
                        totalCardsCount: totalCardsCount,
                        totalRevenue: totalRevenue,
                        cashAmount: cashAmount,
                        bankakAmount: bankakAmount,
                        fawryAmount: fawryAmount,
                        cardAmount: cardAmount,
                        currency: currency,
                        cashierName: cashierName,
                        tenantName: tenantName,
                        periodStart: periodStart,
                        recentTransactions: recentTransactions,
                      );
                    } else {
                      _printPdfReport(
                        cashInDrawer: cashInDrawer,
                        totalCardsCount: totalCardsCount,
                        totalRevenue: totalRevenue,
                        cashAmount: cashAmount,
                        bankakAmount: bankakAmount,
                        fawryAmount: fawryAmount,
                        cardAmount: cardAmount,
                        currency: currency,
                        cashierName: cashierName,
                        tenantName: tenantName,
                        periodStart: periodStart,
                        recentTransactions: recentTransactions,
                      );
                    }
                  },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final storage = ref.watch(localStorageProvider);
    final localReceipts = storage.getSalesHistory();
    final currentUser = ref.watch(currentUserProvider);

    // 1. Gather server data
    final serverTransactions = _serverSummary?.recentTransactions ?? [];
    final serverInvoiceSet = serverTransactions.map((t) => t.invoiceNumber).toSet();

    // 2. Filter local receipts that have NOT yet been committed to the server
    final unSyncedLocalReceipts = localReceipts
        .where((r) => r.isOffline && !serverInvoiceSet.contains(r.invoiceNumber))
        .toList();

    // 3. Compute unsynced local metrics (strictly by payment method)
    double unSyncedCash = 0.0;
    double unSyncedBankak = 0.0;
    double unSyncedFawry = 0.0;
    int unSyncedCount = unSyncedLocalReceipts.length;

    for (final r in unSyncedLocalReceipts) {
      if (r.paymentMethod == 'CASH') {
        unSyncedCash += r.amount;
      } else if (r.paymentMethod == 'MOBILE_WALLET' || r.paymentMethod == 'BANKAK') {
        unSyncedBankak += r.amount;
      } else {
        unSyncedFawry += r.amount;
      }
    }

    // 4. Canonical Reconciled Numbers (No fake fallback numbers)
    final double serverCash = _serverSummary?.cashInDrawer ?? 0.0;
    final double serverBankak = _serverSummary?.bankakAmount ?? 0.0;
    final double serverFawry = _serverSummary?.fawryAmount ?? 0.0;
    final double serverCard = _serverSummary?.cardAmount ?? 0.0;
    final int serverCardsCount = _serverSummary?.totalSalesCount ?? 0;
    final String currency = _serverSummary?.currency ?? 'SDG';

    final double cashInDrawer = serverCash + unSyncedCash;
    final double bankakAmount = serverBankak + unSyncedBankak;
    final double fawryAmount = serverFawry + unSyncedFawry;
    final double cardAmount = serverCard;
    final double totalRevenue = cashInDrawer + bankakAmount + fawryAmount + cardAmount;
    final int totalCardsCount = serverCardsCount + unSyncedCount;

    final String cashierName = _serverSummary?.cashierName ?? currentUser?.fullName ?? 'الكاشير';
    final String tenantName = _serverSummary?.tenantName ?? 'منظومة ميكروتك';
    final DateTime periodStart = _serverSummary?.periodStart ?? DateTime.now();

    // 5. Build Unified Recent Transactions List (deduplicated by invoiceNumber)
    final List<ShiftTransactionItem> unifiedTransactions = [...serverTransactions];
    for (final r in unSyncedLocalReceipts) {
      if (!serverInvoiceSet.contains(r.invoiceNumber)) {
        unifiedTransactions.add(
          ShiftTransactionItem(
            id: r.invoiceNumber,
            invoiceNumber: r.invoiceNumber,
            amount: r.amount,
            currency: r.currency,
            paymentMethod: r.paymentMethod,
            customerName: r.customerName,
            customerPhone: r.customerPhone,
            createdAt: r.soldAt,
            profileName: r.profileName,
            username: r.username,
            serialNumber: r.serialNumber,
            isRefunded: false,
          ),
        );
      }
    }

    // Sort newest first
    unifiedTransactions.sort((a, b) => b.createdAt.compareTo(a.createdAt));

    final dateFormat = intl.DateFormat('yyyy-MM-dd HH:mm');

    return Scaffold(
      appBar: AppBar(
        title: const Text('تقرير وردية الكاشير'),
        actions: [
          IconButton(
            icon: _isSyncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.sync),
            tooltip: 'مزامنة وتحديث الوردية',
            onPressed: (_isLoading || _isSyncing) ? null : _handleSyncAndRefresh,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF0D9488)))
          : RefreshIndicator(
              onRefresh: _handleSyncAndRefresh,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(14.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Network / Sync Status Alert Banner if needed
                    if (_fetchError != null && unifiedTransactions.isEmpty) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.amber.shade900.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.amber.shade700),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.cloud_off, color: Colors.amber, size: 20),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _fetchError!,
                                style: const TextStyle(fontSize: 12, color: Colors.amber),
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.refresh, size: 18, color: Colors.amber),
                              onPressed: _fetchSummary,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Top KPI Summary Cards (Matching Screenshot)
                    Row(
                      children: [
                        // Cash in Drawer (strictly cash sales)
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
                                  '${cashInDrawer.toStringAsFixed(0)} $currency',
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

                        // Cards Sold (strictly sold cards count)
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
                                  '$totalCardsCount كرت',
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
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'توزيع الإيراد حسب طريقة الدفع',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                              ),
                              if (_isShiftClosedLocally)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: Colors.green.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: const Text(
                                    'الوردية مغلقة',
                                    style: TextStyle(fontSize: 11, color: Color(0xFF10B981), fontWeight: FontWeight.bold),
                                  ),
                                ),
                            ],
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
                                        '${cashInDrawer.toStringAsFixed(0)} SDG',
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

                          // Shift Close & Print PDF Trigger Button
                          SizedBox(
                            width: double.infinity,
                            height: 42,
                            child: OutlinedButton.icon(
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFF0D9488),
                                side: const BorderSide(color: Color(0xFF0D9488)),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              icon: const Icon(Icons.receipt_long, size: 18),
                              label: Text(
                                _isShiftClosedLocally
                                    ? 'طباعة تقرير إغلاق الوردية (PDF)'
                                    : 'إغلاق الوردية وطباعة التقرير (PDF)',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                              onPressed: () => _showCloseShiftDialog(
                                cashInDrawer: cashInDrawer,
                                totalCardsCount: totalCardsCount,
                                totalRevenue: totalRevenue,
                                cashAmount: cashInDrawer,
                                bankakAmount: bankakAmount,
                                fawryAmount: fawryAmount,
                                cardAmount: cardAmount,
                                currency: currency,
                                cashierName: cashierName,
                                tenantName: tenantName,
                                periodStart: periodStart,
                                recentTransactions: unifiedTransactions,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Profiles Breakdown Card if present
                    if (_serverSummary != null && _serverSummary!.profileBreakdown.isNotEmpty) ...[
                      const Text(
                        'المبيعات حسب الباقة',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
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
                              dense: true,
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

                    // Recent Shift Sales History Section
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'آخر المبيعات المسجلة محلياً والـ POS',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          '${unifiedTransactions.length} فاتورة',
                          style: const TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    if (unifiedTransactions.isEmpty)
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
                        itemCount: unifiedTransactions.take(25).length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final s = unifiedTransactions[index];
                          final isLocalOnly = !serverInvoiceSet.contains(s.invoiceNumber);

                          return Container(
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E293B),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isLocalOnly
                                    ? Colors.amber.withValues(alpha: 0.3)
                                    : const Color(0xFF334155),
                              ),
                            ),
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                              leading: CircleAvatar(
                                backgroundColor: isLocalOnly
                                    ? Colors.amber.withValues(alpha: 0.2)
                                    : const Color(0xFF0D9488).withValues(alpha: 0.2),
                                child: Icon(
                                  isLocalOnly ? Icons.offline_bolt : Icons.receipt_long,
                                  color: isLocalOnly ? Colors.amber : const Color(0xFF0D9488),
                                  size: 20,
                                ),
                              ),
                              title: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${s.invoiceNumber} • ${s.profileName}',
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: isLocalOnly
                                          ? Colors.amber.shade900
                                          : Colors.teal.shade900,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      isLocalOnly ? 'محلي معلق' : 'معتمد بالخادم',
                                      style: const TextStyle(fontSize: 9, color: Colors.white),
                                    ),
                                  ),
                                ],
                              ),
                              subtitle: Padding(
                                padding: const EdgeInsets.only(top: 3.0),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      '${ThermalPrinterService.formatPaymentMethod(s.paymentMethod)} | ${dateFormat.format(s.createdAt)}',
                                      style: const TextStyle(fontSize: 11, color: Colors.grey),
                                    ),
                                    if (s.username.isNotEmpty)
                                      Text(
                                        s.username,
                                        style: const TextStyle(fontSize: 11, color: Colors.white70),
                                      ),
                                  ],
                                ),
                              ),
                              trailing: Text(
                                '${s.amount.toStringAsFixed(0)} ${s.currency}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                  color: Color(0xFF10B981),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),
    );
  }
}
