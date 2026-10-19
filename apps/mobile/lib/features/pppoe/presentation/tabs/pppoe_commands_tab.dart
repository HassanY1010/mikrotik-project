import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers.dart';
import '../../../../core/theme/app_theme.dart';

class PppoeCommandsTab extends ConsumerStatefulWidget {
  const PppoeCommandsTab({super.key});

  @override
  ConsumerState<PppoeCommandsTab> createState() => _PppoeCommandsTabState();
}

class _PppoeCommandsTabState extends ConsumerState<PppoeCommandsTab> {
  final TextEditingController _searchIdController = TextEditingController();
  bool _isPolling = false;

  @override
  void dispose() {
    _searchIdController.dispose();
    super.dispose();
  }

  void _handleManualSearch() async {
    final id = _searchIdController.text.trim();
    if (id.isEmpty) return;

    ref.read(pppoeCommandsProvider.notifier).trackCommand(
      id,
      'استعلام يدوي لمعرّف أمر راوتر',
    );
  }

  void _refreshAllCommands() async {
    setState(() => _isPolling = true);
    final commands = ref.read(pppoeCommandsProvider);
    for (final cmd in commands) {
      await ref.read(pppoeCommandsProvider.notifier).fetchStatus(cmd.commandId);
    }
    if (!mounted) return;
    setState(() => _isPolling = false);
  }

  String _translateType(String type) {
    switch (type) {
      case 'pppoe.profile.sync':
        return 'مزامنة بروفايل PPPoE';
      case 'pppoe.secret.add':
        return 'إنشاء اشتراك PPPoE (Secret Add)';
      case 'pppoe.secret.update':
        return 'تحديث اشتراك PPPoE (Secret Update)';
      case 'pppoe.secret.disable':
        return 'تعطيل اشتراك PPPoE وفصل اتصاله';
      case 'pppoe.secret.enable':
        return 'تفعيل اشتراك PPPoE';
      case 'pppoe.secret.remove':
        return 'حذف اشتراك PPPoE نهائياً';
      case 'pppoe.session.list':
        return 'استعلام الجلسات النشطة';
      case 'pppoe.session.disconnect':
        return 'قطع اتصال جلسة مستخدم';
      default:
        return type.isNotEmpty ? type : 'أمر راوتر MikroTik';
    }
  }

  Widget _buildStatusBadge(BuildContext context, String status) {
    Color bg;
    Color fg;
    IconData icon;
    String text;

    switch (status) {
      case 'COMPLETED':
        bg = const Color(0xFF10B981).withValues(alpha: 0.15);
        fg = const Color(0xFF34D399);
        icon = Icons.check_circle_outline;
        text = 'اكتمل بنجاح على الراوتر';
        break;
      case 'FAILED':
        bg = const Color(0xFFEF4444).withValues(alpha: 0.15);
        fg = const Color(0xFFF87171);
        icon = Icons.highlight_off;
        text = 'فشل التنفيذ على الراوتر';
        break;
      case 'DISPATCHED':
        bg = const Color(0xFF3B82F6).withValues(alpha: 0.15);
        fg = const Color(0xFF60A5FA);
        icon = Icons.send_outlined;
        text = 'قيد المعالجة في Agent';
        break;
      case 'PENDING':
        bg = const Color(0xFFF59E0B).withValues(alpha: 0.15);
        fg = const Color(0xFFFBBF24);
        icon = Icons.hourglass_empty;
        text = 'بانتظار استلام الوكيل';
        break;
      case 'EXPIRED':
        bg = const Color(0xFF64748B).withValues(alpha: 0.15);
        fg = const Color(0xFF94A3B8);
        icon = Icons.timer_off_outlined;
        text = 'انتهت المهلة';
        break;
      default:
        bg = context.bgCardAlt;
        fg = context.textPrimary;
        icon = Icons.info_outline;
        text = status;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: fg.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: fg, size: 14),
          const SizedBox(width: 5),
          Text(
            text,
            style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final commands = ref.watch(pppoeCommandsProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(
        children: [
          // Banner explaining agent command queue architecture
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            decoration: BoxDecoration(
              color: context.isDarkMode
                  ? const Color(0xFF0369A1).withValues(alpha: 0.15)
                  : const Color(0xFFE0F2FE),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: context.isDarkMode
                    ? const Color(0xFF0284C7).withValues(alpha: 0.3)
                    : const Color(0xFFBAE6FD),
              ),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline, color: Color(0xFF0284C7), size: 18),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'تُنفذ عمليات PPPoE عبر وكيل LAN مشفر. لا تُعتبر العملية مكتملة على الراوتر حتى تصبح الحالة COMPLETED.',
                    style: TextStyle(
                      color: context.isDarkMode ? const Color(0xFFBAE6FD) : const Color(0xFF0369A1),
                      fontSize: 11,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Search ID & Refresh Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: context.bgCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.borderColor),
                    ),
                    child: TextField(
                      controller: _searchIdController,
                      style: TextStyle(color: context.textPrimary, fontSize: 12, fontFamily: 'monospace'),
                      decoration: InputDecoration(
                        hintText: 'ابحث بمعرّف الأمر (Command UUID)...',
                        hintStyle: TextStyle(color: context.textSecondary, fontSize: 11),
                        prefixIcon: Icon(Icons.search, color: context.textSecondary, size: 16),
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                      onSubmitted: (_) => _handleManualSearch(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: _isPolling
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
                        )
                      : const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
                  tooltip: 'تحديث جميع الأوامر',
                  onPressed: _isPolling ? null : _refreshAllCommands,
                ),
              ],
            ),
          ),

          // Commands List
          Expanded(
            child: commands.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.terminal, color: context.textSecondary, size: 48),
                        const SizedBox(height: 12),
                        Text(
                          'لم يتم جدولة أوامر راوتر جديدة خلال هذه الجلسة',
                          style: TextStyle(color: context.textPrimary, fontSize: 14, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'ستظهر هنا حالة الأوامر عند إنشاء حسابات أو بروفايلات أو فصل جلسات',
                          style: TextStyle(color: context.textSecondary, fontSize: 12),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: commands.length,
                    itemBuilder: (context, index) {
                      final item = commands[index];
                      final model = item.statusModel;
                      final status = model?.status ?? 'PENDING';

                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        decoration: BoxDecoration(
                          color: context.bgCard,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: context.borderColor),
                        ),
                        child: ExpansionTile(
                          tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                          leading: const Icon(Icons.bolt, color: Color(0xFFF59E0B), size: 22),
                          title: Text(
                            item.description,
                            style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.bold),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 2),
                              Text(
                                _translateType(item.type),
                                style: TextStyle(color: context.textSecondary, fontSize: 11),
                              ),
                              const SizedBox(height: 4),
                              _buildStatusBadge(context, status),
                            ],
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8), size: 18),
                            tooltip: 'تحديث حالة الأمر',
                            onPressed: () => ref.read(pppoeCommandsProvider.notifier).fetchStatus(item.commandId),
                          ),
                          children: [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Divider(color: context.borderColor),
                                  const SizedBox(height: 6),

                                  // Error message if FAILED
                                  if (model?.errorMessage != null && model!.errorMessage!.isNotEmpty)
                                    Container(
                                      width: double.infinity,
                                      margin: const EdgeInsets.only(bottom: 10),
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.4)),
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          const Text(
                                            'خطأ من الراوتر / الوكيل:',
                                            style: TextStyle(color: Color(0xFFF87171), fontSize: 11, fontWeight: FontWeight.bold),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            model.errorMessage!,
                                            style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 11, fontFamily: 'monospace'),
                                          ),
                                        ],
                                      ),
                                    ),

                                  // Command ID
                                  _buildDetailRow(context, 'معرّف الأمر:', item.commandId),
                                  if (model?.operationId != null)
                                    _buildDetailRow(context, 'معرّف العملية:', model!.operationId),
                                  _buildDetailRow(context, 'وقت الجدولة:', item.queuedAt.toString().substring(0, 19)),
                                  if (model?.dispatchedAt != null)
                                    _buildDetailRow(context, 'وقت الإرسال للوكيل:', model!.dispatchedAt!.toString().substring(0, 19)),
                                  if (model?.completedAt != null)
                                    _buildDetailRow(context, 'وقت الاكتمال:', model!.completedAt!.toString().substring(0, 19)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(BuildContext context, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: context.textSecondary, fontSize: 11)),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              value,
              style: TextStyle(color: context.textPrimary, fontSize: 11, fontFamily: 'monospace'),
            ),
          ),
        ],
      ),
    );
  }
}
