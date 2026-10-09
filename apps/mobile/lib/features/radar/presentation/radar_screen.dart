import 'dart:async';
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
  Timer? _autoRefreshTimer;
  String _searchQuery = '';
  String? _kickingSessionId;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat();

    // Auto-refresh sessions periodically every 20 seconds while mounted
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted && _kickingSessionId == null) {
        ref.read(activeSessionsProvider.notifier).refresh();
      }
    });
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    _animController.dispose();
    super.dispose();
  }

  void _handleKick(ActiveSessionModel session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: const [
            Icon(Icons.wifi_off, color: Colors.redAccent, size: 24),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'قطع اتصال المستخدم',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'هل تريد بالتأكيد فصل المستخدم التالي من شبكة HotSpot؟',
              style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('اسم المستخدم: ${session.user}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                  const SizedBox(height: 4),
                  Text('عنوان IP: ${session.address}',
                      style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 12)),
                  if (session.macAddress.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text('الماك MAC: ${session.macAddress}',
                        style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'سيتم إنهاء جلسة الاتصال النشطة لهذا المستخدم على الراوتر.',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.redAccent,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('فصل الاتصال', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      setState(() => _kickingSessionId = session.id);
      final result = await ref.read(activeSessionsProvider.notifier).kickSession(
            session.id,
            deviceId: session.deviceId,
            username: session.user,
            ipAddress: session.address,
          );
      if (mounted) {
        setState(() => _kickingSessionId = null);
        final bool success = result['success'] == true;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              success
                  ? 'تم فصل المستخدم "${session.user}" من شبكة HotSpot بنجاح.'
                  : (result['message']?.toString() ?? 'فشل فصل المستخدم'),
            ),
            backgroundColor: success ? const Color(0xFF10B981) : Colors.redAccent,
            duration: const Duration(seconds: 4),
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
            onPressed: () => ref.read(activeSessionsProvider.notifier).refresh(),
            tooltip: 'تحديث الجلسات الحية',
          ),
        ],
      ),
      body: Column(
        children: [
          // Radar Header with router switcher & visualizer
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
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, color: Color(0xFF94A3B8), size: 18),
                        onPressed: () => setState(() => _searchQuery = ''),
                      )
                    : null,
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
              onChanged: (val) => setState(() => _searchQuery = val.trim()),
            ),
          ),

          // Sessions List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.read(activeSessionsProvider.notifier).refresh(),
              child: sessionsAsync.when(
                data: (sessions) {
                  final cleanQuery = _searchQuery.toLowerCase();
                  final cleanMacQuery = cleanQuery.replaceAll(RegExp(r'[:-]'), '');

                  final filtered = sessions.where((s) {
                    if (cleanQuery.isEmpty) return true;
                    final userMatch = s.user.toLowerCase().contains(cleanQuery);
                    final ipMatch = s.address.toLowerCase().contains(cleanQuery);
                    final macRaw = s.macAddress.toLowerCase();
                    final cleanMacRaw = macRaw.replaceAll(RegExp(r'[:-]'), '');
                    final macMatch = macRaw.contains(cleanQuery) ||
                        (cleanMacQuery.length > 2 && cleanMacRaw.contains(cleanMacQuery));
                    return userMatch || ipMatch || macMatch;
                  }).toList();

                  if (filtered.isEmpty) {
                    return Center(
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              _searchQuery.isEmpty ? Icons.wifi_tethering_off : Icons.search_off,
                              size: 54,
                              color: Colors.grey.shade600,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _searchQuery.isEmpty
                                  ? 'لا يوجد مستخدمون متصلون حالياً على هذا الراوتر'
                                  : 'لا توجد نتائج تطابق بحثك عن "$_searchQuery"',
                              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                            ),
                            const SizedBox(height: 8),
                            TextButton.icon(
                              icon: const Icon(Icons.sync, color: Color(0xFF38BDF8), size: 16),
                              label: const Text('تحديث القائمة الآن', style: TextStyle(color: Color(0xFF38BDF8))),
                              onPressed: () => ref.read(activeSessionsProvider.notifier).refresh(),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  return ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, idx) => _buildSessionCard(filtered[idx]),
                  );
                },
                loading: () => const Center(
                  child: CircularProgressIndicator(color: Color(0xFF06B6D4)),
                ),
                error: (err, _) => Center(
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.cloud_off, size: 54, color: Colors.redAccent),
                          const SizedBox(height: 12),
                          const Text(
                            'تعذر جلب جلسات الراوتر المباشرة',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            err.toString(),
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                          ),
                          const SizedBox(height: 14),
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF0284C7),
                              foregroundColor: Colors.white,
                            ),
                            icon: const Icon(Icons.refresh, size: 18),
                            label: const Text('إعادة المحاولة'),
                            onPressed: () => ref.read(activeSessionsProvider.notifier).refresh(),
                          ),
                        ],
                      ),
                    ),
                  ),
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
    final routers = routersAsync.asData?.value ?? [];

    RouterDeviceModel? currentRouter;
    if (routers.isNotEmpty) {
      currentRouter = routers.firstWhere(
        (r) => r.id == selectedRouterId,
        orElse: () => routers.first,
      );
    }

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
                if (routers.length > 1)
                  DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: currentRouter?.id,
                      dropdownColor: const Color(0xFF1E293B),
                      isDense: true,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                      items: routers.map((r) {
                        return DropdownMenuItem<String>(
                          value: r.id,
                          child: Text('${r.name} (${r.modelName ?? 'MikroTik'})'),
                        );
                      }).toList(),
                      onChanged: (id) {
                        if (id != null) {
                          ref.read(selectedRouterIdProvider.notifier).select(id);
                        }
                      },
                    ),
                  )
                else
                  Text(
                    currentRouter != null
                        ? '${currentRouter.name} - ${currentRouter.modelName ?? 'MikroTik'}'
                        : 'جاري تحديد الراوتر...',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
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
              // Power Disconnect Button
              IconButton(
                onPressed: isKicking ? null : () => _handleKick(session),
                icon: isKicking
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.redAccent),
                      )
                    : const Icon(Icons.power_settings_new, color: Colors.redAccent, size: 26),
                tooltip: 'فصل وقطع الاتصال',
              ),
              const SizedBox(width: 8),
              // User and IP
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.user,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'IP: ${session.address}',
                      style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              // Device Icon Box
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF38BDF8).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.devices, color: Color(0xFF38BDF8), size: 22),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Divider(color: Color(0xFF334155), height: 1),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Total Data Usage
              Row(
                children: [
                  const Icon(Icons.sync, color: Color(0xFF10B981), size: 14),
                  const SizedBox(width: 4),
                  Text(
                    'MB ${session.totalMb.toStringAsFixed(1)}',
                    style: const TextStyle(
                      color: Color(0xFF10B981),
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
              // Uptime
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
              // MAC Address
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
            ],
          ),
        ],
      ),
    );
  }
}
