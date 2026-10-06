import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import '../../../core/providers.dart';

class SyncScreen extends ConsumerStatefulWidget {
  const SyncScreen({super.key});

  @override
  ConsumerState<SyncScreen> createState() => _SyncScreenState();
}

class _SyncScreenState extends ConsumerState<SyncScreen> {
  bool _isSyncing = false;
  String? _lastSyncMessage;
  bool _isSuccessMessage = true;

  Future<void> _triggerSync() async {
    setState(() {
      _isSyncing = true;
      _lastSyncMessage = null;
    });

    final syncManager = ref.read(syncManagerProvider);

    try {
      // 1. Push pending offline mutations to server
      final result = await syncManager.pushPendingMutations();

      // 2. Pull latest delta catalog from server
      await syncManager.pullCatalog();

      // Refresh providers
      ref.read(pendingMutationsProvider.notifier).refresh();
      ref.read(offlineCardsProvider.notifier).refresh();
      ref.read(profilesProvider.notifier).fetchProfiles();

      setState(() {
        if (result.errorMessage != null) {
          _isSuccessMessage = false;
          _lastSyncMessage = 'تنبيه أثناء المزامنة: ${result.errorMessage}';
        } else {
          _isSuccessMessage = true;
          _lastSyncMessage =
              'اكتملت المزامنة بنجاح: تم اعتماد ${result.appliedCount} عملية، التعارضات: ${result.conflictCount}';
        }
      });
    } catch (e) {
      setState(() {
        _isSuccessMessage = false;
        _lastSyncMessage = 'تعذر الاتصال بالخادم السحابي. يرجى التأكد من اتصال الإنترنت.';
      });
    } finally {
      if (mounted) setState(() => _isSyncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mutations = ref.watch(pendingMutationsProvider);
    final cards = ref.watch(offlineCardsProvider);
    final isOnline = ref.watch(isOnlineModeProvider);
    final availableCardsCount = cards.where((c) => c.status == 'AVAILABLE').length;
    final pendingCount = mutations.where((m) => m.status == 'PENDING').length;
    final conflictCount = mutations.where((m) => m.status == 'CONFLICT').length;
    final dateFormat = intl.DateFormat('yyyy-MM-dd HH:mm');

    return Scaffold(
      appBar: AppBar(
        title: const Text('مركز المزامنة دون اتصال'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'مزامنة فورية',
            onPressed: _isSyncing ? null : _triggerSync,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(14.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Status Banner Cards
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(14.0),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isOnline
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
                              isOnline ? Icons.cloud_done : Icons.cloud_off,
                              size: 18,
                              color: isOnline ? const Color(0xFF10B981) : Colors.amber,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                isOnline ? 'متصل بالسيرفر' : 'دون اتصال',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          isOnline ? 'مزامنة لحظية نشطة' : 'تخزين محلي مؤقت',
                          style: const TextStyle(fontSize: 11, color: Colors.grey),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(14.0),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: availableCardsCount > 0
                            ? const Color(0xFF0D9488).withValues(alpha: 0.3)
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
                        Text(
                          '$availableCardsCount كرت جاهز',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: availableCardsCount > 0 ? const Color(0xFF5EEAD4) : Colors.grey,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Sync Action & Queue Card
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
                          color: pendingCount > 0
                              ? Colors.amber.withValues(alpha: 0.2)
                              : const Color(0xFF0D9488).withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          pendingCount > 0 ? '$pendingCount معلقة' : 'مُزامن بالكامل',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: pendingCount > 0 ? Colors.amber : const Color(0xFF5EEAD4),
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
                                '${mutations.length}',
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

            // Pending Mutations List
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'سجل العمليات المعلقة والمحفوظة محلياً',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                ),
                Text(
                  '${mutations.length} عملية',
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 10),

            if (mutations.isEmpty)
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
                itemCount: mutations.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final item = mutations[index];
                  final isConflict = item.status == 'CONFLICT';
                  final isPending = item.status == 'PENDING';

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
                                  : Colors.green,
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
                              'معرف العملية: ${item.clientMutationId.substring(0, item.clientMutationId.length > 18 ? 18 : item.clientMutationId.length)}...',
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
    );
  }
}
