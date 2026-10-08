import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

class RadarScreen extends ConsumerStatefulWidget {
  const RadarScreen({super.key});

  @override
  ConsumerState<RadarScreen> createState() => _RadarScreenState();
}

class _RadarScreenState extends ConsumerState<RadarScreen> with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  String _searchQuery = '';
  String? _kickingSessionId;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _handleKick(ActiveSessionModel session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: const [
            Icon(Icons.wifi_off, color: Colors.red),
            SizedBox(width: 8),
            Text('قطع اتصال المستخدم'),
          ],
        ),
        content: Text(
          'هل تريد بالتأكيد فصل المستخدم "${session.user}" (${session.address}) وطرده من شبكة الهوتسبوت؟',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('فصل وقطع الاتصال'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _kickingSessionId = session.id);
      final success = await ref
          .read(activeSessionsProvider.notifier)
          .kickSession(session.id, deviceId: session.deviceId);
      setState(() => _kickingSessionId = null);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              success
                  ? 'تم قطع اتصال المستخدم بنجاح'
                  : 'تم إرسال أمر الفصل محلياً',
            ),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionsAsync = ref.watch(activeSessionsProvider);
    final routersAsync = ref.watch(routersProvider);
    final selectedRouterId = ref.watch(selectedRouterIdProvider);

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
                color: const Color(0xFF06B6D4).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.radar, color: Color(0xFF06B6D4), size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'رادار الشبكة والمستخدمين',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'مراقبة الجلسات الحية والتحكم بالطرد',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
            onPressed: () => ref.invalidate(activeSessionsProvider),
            tooltip: 'تحديث الرادار',
          ),
        ],
      ),
      body: Column(
        children: [
          // Radar Header with animated radar visualizer
          _buildRadarHeaderVisualizer(routersAsync, selectedRouterId, sessionsAsync),

          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'بحث باسم المستخدم أو IP أو MAC...',
                hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF38BDF8)),
                filled: true,
                fillColor: const Color(0xFF1E293B),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF334155)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF334155)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF06B6D4)),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
              onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
            ),
          ),

          // Sessions List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(activeSessionsProvider),
              child: sessionsAsync.when(
                data: (sessions) {
                  final filtered = sessions.where((s) {
                    if (_searchQuery.isEmpty) return true;
                    return s.user.toLowerCase().contains(_searchQuery) ||
                        s.address.toLowerCase().contains(_searchQuery) ||
                        s.macAddress.toLowerCase().contains(_searchQuery);
                  }).toList();

                  if (filtered.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.wifi_tethering_off, size: 54, color: Colors.grey.shade600),
                          const SizedBox(height: 12),
                          Text(
                            _searchQuery.isEmpty
                                ? 'لا يوجد مستخدمون متصلون حالياً'
                                : 'لا توجد نتائج تطابق بحثك',
                            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                          ),
                        ],
                      ),
                    );
                  }

                  return ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, idx) => _buildSessionCard(filtered[idx]),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => Center(
                  child: Text('خطأ في جلب بيانات الرادار: $err', style: const TextStyle(color: Colors.red)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRadarHeaderVisualizer(
    AsyncValue<List<RouterDeviceModel>> routersAsync,
    String? selectedRouterId,
    AsyncValue<List<ActiveSessionModel>> sessionsAsync,
  ) {
    final count = sessionsAsync.asData?.value.length ?? 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: Color(0xFF1E293B),
        border: Border(bottom: BorderSide(color: Color(0xFF334155))),
      ),
      child: Row(
        children: [
          // Animated Pulse Radar Widget
          Stack(
            alignment: Alignment.center,
            children: [
              AnimatedBuilder(
                animation: _animController,
                builder: (context, child) {
                  return Container(
                    width: 70,
                    height: 70,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: const Color(0xFF06B6D4).withValues(
                          alpha: (1.0 - _animController.value).clamp(0.0, 1.0),
                        ),
                        width: 2,
                      ),
                    ),
                  );
                },
              ),
              Container(
                width: 48,
                height: 48,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Color(0xFF0F172A),
                ),
                child: const Icon(Icons.radar, color: Color(0xFF06B6D4), size: 26),
              ),
            ],
          ),
          const SizedBox(width: 16),
          // Router & Active stats
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                routersAsync.when(
                  data: (routers) {
                    final current = routers.firstWhere(
                      (r) => r.id == selectedRouterId,
                      orElse: () => routers.isNotEmpty ? routers.first : RouterDeviceModel(id: '', name: 'الراوتر', host: ''),
                    );
                    return Text(
                      current.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    );
                  },
                  loading: () => const Text('جاري تحديد الراوتر...', style: TextStyle(color: Colors.grey)),
                  error: (_, _) => const Text('الراوتر الحالي', style: TextStyle(color: Colors.white)),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFF06B6D4).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '$count جهاز متصل الآن',
                        style: const TextStyle(
                          color: Color(0xFF22D3EE),
                          fontWeight: FontWeight.bold,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSessionCard(ActiveSessionModel session) {
    final isKicking = _kickingSessionId == session.id;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF334155)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.2),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF38BDF8).withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.devices, color: Color(0xFF38BDF8), size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.user,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'IP: ${session.address}',
                      style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 12),
                    ),
                  ],
                ),
              ),
              // Disconnect / Kick button
              IconButton(
                onPressed: isKicking ? null : () => _handleKick(session),
                icon: isKicking
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.red),
                      )
                    : const Icon(Icons.power_settings_new, color: Colors.redAccent),
                tooltip: 'فصل وقطع الاتصال',
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Divider(color: Color(0xFF334155), height: 1),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.fingerprint, color: Color(0xFF94A3B8), size: 14),
                  const SizedBox(width: 4),
                  Text(
                    session.macAddress,
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                  ),
                ],
              ),
              Row(
                children: [
                  const Icon(Icons.timer_outlined, color: Color(0xFF94A3B8), size: 14),
                  const SizedBox(width: 4),
                  Text(
                    session.uptime,
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                  ),
                ],
              ),
              Row(
                children: [
                  const Icon(Icons.data_usage, color: Color(0xFF10B981), size: 14),
                  const SizedBox(width: 4),
                  Text(
                    '${session.totalMb.toStringAsFixed(1)} MB',
                    style: const TextStyle(
                      color: Color(0xFF10B981),
                      fontWeight: FontWeight.bold,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
