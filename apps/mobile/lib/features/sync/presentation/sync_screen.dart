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

  Future<void> _triggerSync() async {
    setState(() {
      _isSyncing = true;
      _lastSyncMessage = null;
    });

    final syncManager = ref.read(syncManagerProvider);

    try {
      // 1. Push pending offline mutations
      final result = await syncManager.pushPendingMutations();

      // 2. Pull latest delta catalog
      await syncManager.pullCatalog();

      // Refresh providers
      ref.read(pendingMutationsProvider.notifier).refresh();
      ref.read(offlineCardsProvider.notifier).refresh();
      ref.read(profilesProvider.notifier).fetchProfiles();

      setState(() {
        if (result.errorMessage != null) {
          _lastSyncMessage = 'خطأ أثناء المزامنة: ${result.errorMessage}';
        } else {
          _lastSyncMessage =
              'اكتملت المزامنة بنجاح: تم تطبيق ${result.appliedCount} عملية، تعارضات: ${result.conflictCount}';
        }
      });
    } catch (e) {
      setState(() {
        _lastSyncMessage = 'تعذر الاتصال بالخادم: $e';
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
    final dateFormat = intl.DateFormat('yyyy-MM-dd HH:mm:ss');

    return Scaffold(
      appBar: AppBar(
        title: const Text('مركز المزامنة دون اتصال'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'مزامنة فورية',
            onPressed: _isSyncing ? null : _triggerSync,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Status Banner Cards
            Row(
              children: [
                Expanded(
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                isOnline ? Icons.cloud_done : Icons.cloud_off,
                                color: isOnline ? const Color(0xFF0D9488) : Colors.amber,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                isOnline ? 'متصل بالخادم' : 'وضع غير متصل',
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            isOnline
                                ? 'يتم إرسال العمليات مباشرة ومزامنة الطوارئ'
                                : 'يتم تخزين المبيعات محلياً وإرسالها عند الاتصال',
                            style: const TextStyle(fontSize: 12, color: Colors.grey),
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
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.inventory_2_outlined, color: Color(0xFF0D9488)),
                              SizedBox(width: 8),
                              Text('كروت المحفظة الجاهزة', style: TextStyle(fontWeight: FontWeight.bold)),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '$availableCardsCount كرت جاهز للبيع',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Sync Action Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'حالة رتل المزامنة المحلي',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'معلق: $pendingCount | تعارض: $conflictCount | إجمالي السجلات: ${mutations.length}',
                              style: const TextStyle(fontSize: 13, color: Colors.grey),
                            ),
                          ],
                        ),
                        ElevatedButton.icon(
                          icon: _isSyncing
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Icon(Icons.sync),
                          label: Text(_isSyncing ? 'جاري المزامنة...' : 'بدء المزامنة الآن'),
                          onPressed: _isSyncing ? null : _triggerSync,
                        ),
                      ],
                    ),
                    if (_lastSyncMessage != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: _lastSyncMessage!.contains('خطأ')
                              ? Colors.red.shade900.withValues(alpha: 0.2)
                              : Colors.teal.shade900.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _lastSyncMessage!,
                          style: TextStyle(
                            fontSize: 13,
                            color: _lastSyncMessage!.contains('خطأ') ? Colors.redAccent : Colors.tealAccent,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Pending Mutations List
            const Text(
              'سجل العمليات المعلقة والمحفوظة محلياً',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),

            if (mutations.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(32.0),
                  child: Center(
                    child: Column(
                      children: const [
                        Icon(Icons.check_circle_outline, size: 48, color: Color(0xFF0D9488)),
                        SizedBox(height: 8),
                        Text('جميع العمليات متزامنة بنجاح مع الخادم الرئيسي!'),
                      ],
                    ),
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

                  return Card(
                    child: ListTile(
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
                              ? Colors.red
                              : isPending
                                  ? Colors.amber
                                  : Colors.green,
                        ),
                      ),
                      title: Row(
                        children: [
                          Text('العملية: ${item.type == 'SELL_CARD' ? 'بيع كرت' : item.type}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: isConflict ? Colors.red.shade900 : Colors.blueGrey.shade800,
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
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('المعرف: ${item.clientMutationId}', style: const TextStyle(fontSize: 11)),
                          Text('التاريخ: ${dateFormat.format(item.createdAt)}',
                              style: const TextStyle(fontSize: 11, color: Colors.grey)),
                          if (item.error != null)
                            Text(
                              'السبب: ${item.error}',
                              style: const TextStyle(fontSize: 11, color: Colors.redAccent),
                            ),
                        ],
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
