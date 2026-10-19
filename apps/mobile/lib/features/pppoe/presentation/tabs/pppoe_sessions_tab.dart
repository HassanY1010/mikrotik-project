import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers.dart';
import '../../../../core/theme/app_theme.dart';

class PppoeSessionsTab extends ConsumerStatefulWidget {
  const PppoeSessionsTab({super.key});

  @override
  ConsumerState<PppoeSessionsTab> createState() => _PppoeSessionsTabState();
}

class _PppoeSessionsTabState extends ConsumerState<PppoeSessionsTab> {
  bool _isForceSyncing = false;

  void _handleForceSync() async {
    setState(() => _isForceSyncing = true);
    final res = await ref.read(pppoeSessionsProvider.notifier).refresh(syncFromRouter: true);
    if (!mounted) return;
    setState(() => _isForceSyncing = false);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(res['message']?.toString() ?? 'تم طلب المزامنة من الراوتر'),
        backgroundColor: const Color(0xFF10B981),
      ),
    );
  }

  void _handleDisconnect(PppoeActiveSessionModel session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('تأكيد قطع اتصال الجلسة', style: TextStyle(color: ctx.textPrimary, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'هل أنت متأكد من رغبتك في قطع اتصال جلسة المشترك «${session.username}» فوراً من الراوتر؟',
              style: TextStyle(color: ctx.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: ctx.bgCardAlt,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: ctx.borderColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('عنوان IP: ${session.ipAddress}', style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 12, fontFamily: 'monospace')),
                  const SizedBox(height: 4),
                  Text('مدة الاتصال: ${session.formattedUptime}', style: TextStyle(color: ctx.textSecondary, fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('إلغاء', style: TextStyle(color: ctx.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444)),
            child: const Text('قطع الاتصال الآن', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final res = await ref.read(pppoeSessionsProvider.notifier).disconnectSession(
      username: session.username,
      sessionId: session.sessionId,
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(res['message']?.toString() ?? 'تم فصل الجلسة'),
        backgroundColor: res['success'] == true ? const Color(0xFF10B981) : const Color(0xFFEF4444),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sessionsAsync = ref.watch(pppoeSessionsProvider);
    final lastSyncTime = ref.read(pppoeSessionsProvider.notifier).lastSyncTime;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(
        children: [
          // Subheader: Quick stats & Force sync button
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: context.bgCard,
              border: Border(bottom: BorderSide(color: context.borderColor)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: Color(0xFF10B981),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'الجلسات الحية: ${sessionsAsync.asData?.value.length ?? 0}',
                          style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    if (lastSyncTime != null)
                      Text(
                        'آخر استعلام: ${lastSyncTime.hour.toString().padLeft(2, '0')}:${lastSyncTime.minute.toString().padLeft(2, '0')}:${lastSyncTime.second.toString().padLeft(2, '0')}',
                        style: TextStyle(color: context.textSecondary, fontSize: 11),
                      ),
                  ],
                ),
                ElevatedButton.icon(
                  onPressed: _isForceSyncing ? null : _handleForceSync,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: _isForceSyncing
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.sync, color: Colors.white, size: 16),
                  label: const Text(
                    'مزامنة مباشرة مع الراوتر',
                    style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),

          // Sessions List
          Expanded(
            child: sessionsAsync.when(
              loading: () => const Center(
                child: CircularProgressIndicator(color: Color(0xFF10B981)),
              ),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 40),
                      const SizedBox(height: 12),
                      Text(
                        'تعذر تحميل الجلسات النشطة: $err',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Color(0xFFF87171), fontSize: 13),
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: () => ref.read(pppoeSessionsProvider.notifier).refresh(),
                        style: ElevatedButton.styleFrom(backgroundColor: context.bgCardAlt),
                        child: Text('إعادة المحاولة', style: TextStyle(color: context.textPrimary)),
                      ),
                    ],
                  ),
                ),
              ),
              data: (sessions) {
                if (sessions.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.router_outlined, color: context.textSecondary, size: 48),
                        const SizedBox(height: 12),
                        Text(
                          'لا توجد جلسات PPPoE متصلة حالياً',
                          style: TextStyle(color: context.textPrimary, fontSize: 15, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'اضغط على "مزامنة مباشرة مع الراوتر" لجلب الاتصالات الحية',
                          style: TextStyle(color: context.textSecondary, fontSize: 12),
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  color: const Color(0xFF10B981),
                  backgroundColor: context.bgCard,
                  onRefresh: () => ref.read(pppoeSessionsProvider.notifier).refresh(),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: sessions.length,
                    itemBuilder: (context, index) {
                      final s = sessions[index];
                      return _buildSessionCard(context, s);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSessionCard(BuildContext context, PppoeActiveSessionModel s) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Username, Session ID, Disconnect Button
            Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF10B981),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF10B981).withValues(alpha: 0.5),
                        blurRadius: 4,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        s.username,
                        style: TextStyle(
                          color: context.textPrimary,
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'monospace',
                        ),
                      ),
                      if (s.sessionId != null && s.sessionId!.isNotEmpty)
                        Text(
                          'معرّف الجلسة: ${s.sessionId}',
                          style: TextStyle(color: context.textSecondary, fontSize: 11, fontFamily: 'monospace'),
                        ),
                    ],
                  ),
                ),

                // Disconnect Button
                OutlinedButton.icon(
                  onPressed: () => _handleDisconnect(s),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Color(0xFFEF4444)),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  icon: const Icon(Icons.power_settings_new, color: Color(0xFFEF4444), size: 14),
                  label: const Text(
                    'فصل',
                    style: TextStyle(color: Color(0xFFEF4444), fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 10),
            Divider(color: context.borderColor, height: 1),
            const SizedBox(height: 10),

            // Metadata Grid: IP, Uptime, Bytes In/Out
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // IP Address
                Row(
                  children: [
                    const Icon(Icons.alt_route, color: Color(0xFF38BDF8), size: 14),
                    const SizedBox(width: 4),
                    Text(
                      s.ipAddress,
                      style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 12, fontFamily: 'monospace'),
                    ),
                  ],
                ),

                // Uptime
                Row(
                  children: [
                    Icon(Icons.access_time, color: context.textSecondary, size: 14),
                    const SizedBox(width: 4),
                    Text(
                      s.formattedUptime,
                      style: TextStyle(color: context.textSecondary, fontSize: 11),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 6),

            // Traffic Stats Row
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Download
                Row(
                  children: [
                    const Icon(Icons.arrow_downward, color: Color(0xFF34D399), size: 14),
                    const SizedBox(width: 4),
                    Text(
                      'تنزيل: ${s.formattedBytesOut}',
                      style: const TextStyle(color: Color(0xFF34D399), fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),

                // Upload
                Row(
                  children: [
                    const Icon(Icons.arrow_upward, color: Color(0xFFA78BFA), size: 14),
                    const SizedBox(width: 4),
                    Text(
                      'رفع: ${s.formattedBytesIn}',
                      style: const TextStyle(color: Color(0xFFA78BFA), fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),

                // MAC if present
                if (s.macAddress != null && s.macAddress!.isNotEmpty)
                  Text(
                    s.macAddress!,
                    style: TextStyle(color: context.textSecondary, fontSize: 10, fontFamily: 'monospace'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
