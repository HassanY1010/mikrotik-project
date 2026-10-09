import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import '../../../core/providers.dart';
import '../../cards/presentation/cards_wallet_screen.dart';

class SyncScreen extends ConsumerStatefulWidget {
  const SyncScreen({super.key});

  @override
  ConsumerState<SyncScreen> createState() => _SyncScreenState();
}

class _SyncScreenState extends ConsumerState<SyncScreen> {
  bool _isSyncing = false;
  bool _isCheckingHealth = false;
  String? _lastSyncMessage;
  bool _isSuccessMessage = true;
  String _selectedFilter = 'ALL'; // ALL, PENDING, CONFLICT, APPLIED

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _probeHealthAndSync(initial: true);
    });
  }

  Future<void> _probeHealthAndSync({bool initial = false}) async {
    if (!mounted) return;
    setState(() => _isCheckingHealth = true);

    try {
      final isOnline = await ref.read(isOnlineModeProvider.notifier).checkHealth();
      if (isOnline) {
        final syncManager = ref.read(syncManagerProvider);
        await syncManager.pullCatalog();
        ref.read(serverAvailableCardsProvider.notifier).refresh();
        ref.read(offlineCardsProvider.notifier).refresh();
        ref.read(pendingMutationsProvider.notifier).refresh();
      }
    } catch (_) {
      // Ignored: health status handled inside notifier
    } finally {
      if (mounted) {
        setState(() => _isCheckingHealth = false);
      }
    }
  }

  Future<void> _triggerSync() async {
    if (_isSyncing) return;

    setState(() {
      _isSyncing = true;
      _lastSyncMessage = null;
    });

    final syncManager = ref.read(syncManagerProvider);

    try {
      // 1. Probe real server connectivity first
      final isOnline = await ref.read(isOnlineModeProvider.notifier).checkHealth();
      if (!isOnline) {
        setState(() {
          _isSuccessMessage = false;
          _lastSyncMessage =
              'تعذر الاتصال بالخادم الرئيسي (Server Unreachable). تأكد من اتصال الإنترنت؛ سيتم الاحتفاظ بالعمليات في الرتل المحلي.';
        });
        return;
      }

      // 2. Push pending offline mutations
      final result = await syncManager.pushPendingMutations();

      // 3. Pull latest catalog & inventory summary
      await syncManager.pullCatalog();

      // 4. Refresh all relevant providers
      ref.read(pendingMutationsProvider.notifier).refresh();
      ref.read(offlineCardsProvider.notifier).refresh();
      ref.read(serverAvailableCardsProvider.notifier).refresh();
      ref.read(profilesProvider.notifier).fetchProfiles();

      setState(() {
        if (result.errorMessage != null) {
          _isSuccessMessage = false;
          _lastSyncMessage = 'تنبيه أثناء المزامنة: ${result.errorMessage}';
        } else if (result.conflictCount > 0) {
          _isSuccessMessage = false;
          _lastSyncMessage =
              'اكتملت المزامنة: تم اعتماد ${result.appliedCount} عملية، ويوجد ${result.conflictCount} تعارض بحاجة لمراجعة.';
        } else if (result.appliedCount > 0) {
          _isSuccessMessage = true;
          _lastSyncMessage =
              'اكتملت المزامنة بنجاح! تم اعتماد ${result.appliedCount} عملية على السيرفر وتحديث بيانات المخزن.';
        } else {
          _isSuccessMessage = true;
          _lastSyncMessage =
              'جميع العمليات متزامنة بالفعل. تم سحب وتحديث بيانات المخزن والباقات من السيرفر.';
        }
      });
    } catch (e) {
      setState(() {
        _isSuccessMessage = false;
        _lastSyncMessage = 'حدث خطأ أثناء المزامنة: $e';
      });
    } finally {
      if (mounted) setState(() => _isSyncing = false);
    }
  }

  void _navigateToCardsWallet() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const CardsWalletScreen()),
    );
    // Refresh counts when returning from wallet
    ref.read(offlineCardsProvider.notifier).refresh();
    ref.read(serverAvailableCardsProvider.notifier).refresh();
  }

  @override
  Widget build(BuildContext context) {
    final mutations = ref.watch(pendingMutationsProvider);
    final localCards = ref.watch(offlineCardsProvider);
    final isOnline = ref.watch(isOnlineModeProvider);
    final serverAvailableCards = ref.watch(serverAvailableCardsProvider);

    final localReadyCount = localCards.where((c) => c.status == 'AVAILABLE').length;
    final pendingCount = mutations.where((m) => m.status == 'PENDING').length;
    final conflictCount = mutations.where((m) => m.status == 'CONFLICT').length;
    final appliedCount = mutations.where((m) => m.status == 'APPLIED').length;
    final totalCount = mutations.length;

    // Filter mutations list
    final filteredMutations = mutations.where((m) {
      if (_selectedFilter == 'PENDING') return m.status == 'PENDING';
      if (_selectedFilter == 'CONFLICT') return m.status == 'CONFLICT';
      if (_selectedFilter == 'APPLIED') return m.status == 'APPLIED';
      return true;
    }).toList();

    final dateFormat = intl.DateFormat('yyyy-MM-dd HH:mm');

    return Scaffold(
      appBar: AppBar(
        title: const Text('مركز المزامنة دون اتصال'),
        actions: [
          IconButton(
            icon: _isCheckingHealth
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.refresh),
            tooltip: 'تحديث وفحص الاتصال',
            onPressed: (_isSyncing || _isCheckingHealth)
                ? null
                : () => _probeHealthAndSync(),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _probeHealthAndSync(),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(14.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Status Banner Cards
              Row(
                children: [
                  // Server connection probe card
                  Expanded(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: _isCheckingHealth ? null : () => _probeHealthAndSync(),
                      child: Container(
                        padding: const EdgeInsets.all(14.0),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: _isCheckingHealth
                                ? Colors.blue.withValues(alpha: 0.4)
                                : isOnline
                                    ? const Color(0xFF0D9488).withValues(alpha: 0.3)
                                    : Colors.amber.withValues(alpha: 0.3),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  _isCheckingHealth
                                      ? Icons.sync
                                      : (isOnline ? Icons.cloud_done : Icons.cloud_off),
                                  size: 18,
                                  color: _isCheckingHealth
                                      ? Colors.blueAccent
                                      : (isOnline ? const Color(0xFF10B981) : Colors.amber),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    _isCheckingHealth
                                        ? 'جاري فحص الاتصال...'
                                        : (isOnline ? 'متصل بالسيرفر' : 'دون اتصال بالسيرفر'),
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              isOnline
                                  ? 'مزامنة عند الطلب جاهزة'
                                  : 'تخزين محلي مؤقت',
                              style: const TextStyle(fontSize: 11, color: Colors.grey),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),

                  // Wallet cards count card with tap navigation
                  Expanded(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: _navigateToCardsWallet,
                      child: Container(
                        padding: const EdgeInsets.all(14.0),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: localReadyCount > 0
                                ? const Color(0xFF0D9488).withValues(alpha: 0.4)
                                : const Color(0xFF334155),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: const [
                                Icon(Icons.inventory_2_outlined, size: 18, color: Color(0xFF0D9488)),
                                SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    'كروت المحفظة',
                                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  localReadyCount > 0
                                      ? '$localReadyCount كرت جاهز'
                                      : (serverAvailableCards > 0
                                          ? '0 جاهز ($serverAvailableCards بالسيرفر)'
                                          : '0 كرت جاهز'),
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: localReadyCount > 0
                                        ? const Color(0xFF5EEAD4)
                                        : Colors.grey.shade400,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const Icon(Icons.chevron_left, size: 16, color: Colors.grey),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Sync Action & Queue Status Card
              Container(
                padding: const EdgeInsets.all(16.0),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: const [
                            Icon(Icons.sync_alt, size: 20, color: Color(0xFF0D9488)),
                            SizedBox(width: 8),
                            Text(
                              'حالة رتل المزامنة المحلي',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: _isSyncing
                                ? Colors.blue.withValues(alpha: 0.2)
                                : conflictCount > 0
                                    ? Colors.red.withValues(alpha: 0.2)
                                    : pendingCount > 0
                                        ? Colors.amber.withValues(alpha: 0.2)
                                        : const Color(0xFF0D9488).withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _isSyncing
                                ? 'جاري المزامنة...'
                                : conflictCount > 0
                                    ? '$conflictCount تعارض'
                                    : pendingCount > 0
                                        ? '$pendingCount معلقة'
                                        : 'مُزامن بالكامل',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: _isSyncing
                                  ? Colors.blueAccent
                                  : conflictCount > 0
                                      ? Colors.redAccent
                                      : pendingCount > 0
                                          ? Colors.amber
                                          : const Color(0xFF5EEAD4),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Three Counter Badges
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0F172A),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              children: [
                                const Text('قيد الانتظار', style: TextStyle(fontSize: 11, color: Colors.grey)),
                                const SizedBox(height: 4),
                                Text(
                                  '$pendingCount',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold,
                                    color: pendingCount > 0 ? Colors.amber : Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0F172A),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              children: [
                                const Text('تعارضات', style: TextStyle(fontSize: 11, color: Colors.grey)),
                                const SizedBox(height: 4),
                                Text(
                                  '$conflictCount',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold,
                                    color: conflictCount > 0 ? Colors.redAccent : Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0F172A),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              children: [
                                const Text('الإجمالي', style: TextStyle(fontSize: 11, color: Colors.grey)),
                                const SizedBox(height: 4),
                                Text(
                                  '$totalCount',
                                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Sync Trigger Button
                    SizedBox(
                      height: 48,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0D9488),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        icon: _isSyncing
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                              )
                            : const Icon(Icons.sync, size: 20),
                        label: Text(
                          _isSyncing ? 'جاري المزامنة مع الخادم...' : 'بدء المزامنة الفورية الآن',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        onPressed: _isSyncing ? null : _triggerSync,
                      ),
                    ),

                    if (_lastSyncMessage != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: _isSuccessMessage
                              ? const Color(0xFF0D9488).withValues(alpha: 0.15)
                              : Colors.red.shade900.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _isSuccessMessage
                                ? const Color(0xFF0D9488).withValues(alpha: 0.4)
                                : Colors.redAccent.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Text(
                          _lastSyncMessage!,
                          style: TextStyle(
                            fontSize: 12,
                            color: _isSuccessMessage ? const Color(0xFF5EEAD4) : Colors.redAccent,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Queue and Operations Header & Filters
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'سجل العمليات المعلقة والمحفوظة محلياً',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                  Text(
                    '$totalCount عملية',
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              if (mutations.isNotEmpty) ...[
                // Filter chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildFilterChip('ALL', 'الكل ($totalCount)'),
                      const SizedBox(width: 6),
                      _buildFilterChip('PENDING', 'معلقة ($pendingCount)'),
                      const SizedBox(width: 6),
                      _buildFilterChip('CONFLICT', 'تعارضات ($conflictCount)'),
                      const SizedBox(width: 6),
                      _buildFilterChip('APPLIED', 'مكتملة ($appliedCount)'),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
              ],

              if (filteredMutations.isEmpty)
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
                        Icon(Icons.check_circle_outline, size: 48, color: Color(0xFF10B981)),
                        SizedBox(height: 10),
                        Text(
                          'جميع العمليات متزامنة بنجاح مع الخادم الرئيسي!',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white70),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'لا توجد مبيعات معلقة في انتظار الإرسال',
                          style: TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                )
              else
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: filteredMutations.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final item = filteredMutations[index];
                    final isConflict = item.status == 'CONFLICT';
                    final isPending = item.status == 'PENDING';
                    final isApplied = item.status == 'APPLIED';

                    return Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isConflict
                              ? Colors.redAccent.withValues(alpha: 0.4)
                              : isPending
                                  ? Colors.amber.withValues(alpha: 0.4)
                                  : const Color(0xFF334155),
                        ),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                        leading: CircleAvatar(
                          backgroundColor: isConflict
                              ? Colors.red.withValues(alpha: 0.2)
                              : isPending
                                  ? Colors.amber.withValues(alpha: 0.2)
                                  : isApplied
                                      ? Colors.teal.withValues(alpha: 0.2)
                                      : Colors.green.withValues(alpha: 0.2),
                          child: Icon(
                            isConflict
                                ? Icons.warning_amber
                                : isPending
                                    ? Icons.hourglass_top
                                    : Icons.check,
                            color: isConflict
                                ? Colors.redAccent
                                : isPending
                                    ? Colors.amber
                                    : const Color(0xFF5EEAD4),
                            size: 20,
                          ),
                        ),
                        title: Row(
                          children: [
                            Text(
                              item.type == 'SALE' || item.type == 'SELL_CARD'
                                  ? 'بيع كرت هوتسبوت'
                                  : item.type,
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: isConflict
                                    ? Colors.red.shade900
                                    : isPending
                                        ? Colors.amber.shade900
                                        : Colors.teal.shade900,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                isPending
                                    ? 'قيد الانتظار'
                                    : isConflict
                                        ? 'تعارض'
                                        : isApplied
                                            ? 'معتمدة على السيرفر'
                                            : 'مكتملة',
                                style: const TextStyle(fontSize: 10, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                        subtitle: Padding(
                          padding: const EdgeInsets.only(top: 4.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'معرف العملية: ${item.clientMutationId.substring(0, item.clientMutationId.length > 20 ? 20 : item.clientMutationId.length)}...',
                                style: const TextStyle(fontSize: 11, color: Colors.grey),
                              ),
                              Text(
                                'التاريخ: ${dateFormat.format(item.createdAt)}',
                                style: const TextStyle(fontSize: 11, color: Colors.grey),
                              ),
                              if (item.error != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2.0),
                                  child: Text(
                                    'السبب: ${item.error}',
                                    style: const TextStyle(fontSize: 11, color: Colors.redAccent),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilterChip(String filterKey, String label) {
    final isSelected = _selectedFilter == filterKey;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => setState(() => _selectedFilter = filterKey),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFF0D9488).withValues(alpha: 0.3)
              : const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? const Color(0xFF0D9488) : const Color(0xFF334155),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: isSelected ? const Color(0xFF5EEAD4) : Colors.grey,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }
}
