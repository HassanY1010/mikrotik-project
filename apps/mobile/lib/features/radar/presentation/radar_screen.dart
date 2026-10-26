import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';

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
  final Set<String> _expandedSessionIds = {};

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat();

    // Auto-refresh sessions periodically every 15 seconds while mounted
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
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
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.wifi_off, color: Colors.redAccent, size: 24),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'قطع اتصال المشترك',
                style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'هل تريد بالتأكيد فصل المشترك التالي من راوتر MikroTik؟',
              style: TextStyle(color: context.textPrimary, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.bgCardAlt,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: context.borderColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'اسم المستخدم / الكرت: ${session.user}',
                    style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                  const SizedBox(height: 4),
                  Text('عنوان IP: ${session.address}',
                      style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 12)),
                  if (session.macAddress.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text('عنوان MAC: ${session.macAddress}',
                        style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  ],
                  if (session.deviceName != null && session.deviceName!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text('الراوتر: ${session.deviceName}',
                        style: const TextStyle(color: Color(0xFF06B6D4), fontSize: 11)),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'سيتم إنهاء الجلسة الحالية وإيقاف الاتصال فورياً على الراوتر.',
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
                  ? 'تم فصل المشترك "${session.user}" بنجاح.'
                  : (result['message']?.toString() ?? 'فشل فصل المشترك'),
            ),
            backgroundColor: success ? const Color(0xFF10B981) : Colors.redAccent,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  void _copyToClipboard(String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('تم نسخ $label: $text'),
        backgroundColor: const Color(0xFF0284C7),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sessionsAsync = ref.watch(activeSessionsProvider);
    final routersAsync = ref.watch(routersProvider);
    final selectedRouterId = ref.watch(selectedRouterIdProvider);
    final lastUpdated = ref.watch(radarLastUpdatedProvider);
    final routerStatuses = ref.watch(radarRouterStatusesProvider);

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
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
              children: [
                Text(
                  'رادار المشتركين المتصلين',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: context.textPrimary,
                  ),
                ),
                Text(
                  'مراقبة لحظية لاستهلاك وباقات المشتركين',
                  style: TextStyle(fontSize: 11, color: context.textSecondary),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
            onPressed: () => ref.read(activeSessionsProvider.notifier).refresh(),
            tooltip: 'تحديث البيانات الآن',
          ),
        ],
      ),
      body: Column(
        children: [
          // Radar Header with router switcher & visualizer
          _buildRadarHeaderVisualizer(routersAsync, selectedRouterId, sessionsAsync, lastUpdated),

          // Unreachable Routers Warning Banner (if any router failed)
          if (routerStatuses.any((r) => !r.isOnline))
            _buildUnreachableBanner(routerStatuses.where((r) => !r.isOnline).toList()),

          // Search and Filter Bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              style: TextStyle(color: context.textPrimary),
              decoration: InputDecoration(
                hintText: 'بحث باسم المشترك، الكرت، IP، MAC أو البروفايل...',
                hintStyle: TextStyle(color: context.textSecondary, fontSize: 13),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF38BDF8)),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: Icon(Icons.clear, color: context.textSecondary, size: 18),
                        onPressed: () => setState(() => _searchQuery = ''),
                      )
                    : null,
                filled: true,
                fillColor: context.bgCard,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: context.borderColor),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: context.borderColor),
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
                    final profileMatch = s.profileName.toLowerCase().contains(cleanQuery);
                    final macRaw = s.macAddress.toLowerCase();
                    final cleanMacRaw = macRaw.replaceAll(RegExp(r'[:-]'), '');
                    final macMatch = macRaw.contains(cleanQuery) ||
                        (cleanMacQuery.length > 2 && cleanMacRaw.contains(cleanMacQuery));
                    return userMatch || ipMatch || macMatch || profileMatch;
                  }).toList();

                  if (filtered.isEmpty) {
                    return Center(
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        child: Padding(
                          padding: const EdgeInsets.all(24.0),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                _searchQuery.isEmpty ? Icons.wifi_tethering_off : Icons.search_off,
                                size: 54,
                                color: context.textSecondary,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                _searchQuery.isEmpty
                                    ? 'لا يوجد مشتركين متصلين حالياً على هذا الراوتر'
                                    : 'لا توجد نتائج تطابق بحثك عن "$_searchQuery"',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: context.textPrimary, fontSize: 14, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _searchQuery.isEmpty
                                    ? 'سيتم تحديث القائمة تلقائياً عند اتصال أي جهاز جديد.'
                                    : 'تأكد من كتابة الاسم أو رقم الكرت أو عنوان الماك بشكل صحيح.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: context.textSecondary, fontSize: 12),
                              ),
                              const SizedBox(height: 14),
                              ElevatedButton.icon(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF0284C7),
                                  foregroundColor: Colors.white,
                                ),
                                icon: const Icon(Icons.sync, size: 18),
                                label: const Text('تحديث القائمة الآن'),
                                onPressed: () => ref.read(activeSessionsProvider.notifier).refresh(),
                              ),
                            ],
                          ),
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
                          Text(
                            'تعذر جلب جلسات الراوتر المباشرة',
                            style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 15),
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
    DateTime? lastUpdated,
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

    String timeStr = 'منذ لحظات';
    if (lastUpdated != null) {
      final h = lastUpdated.hour.toString().padLeft(2, '0');
      final m = lastUpdated.minute.toString().padLeft(2, '0');
      final s = lastUpdated.second.toString().padLeft(2, '0');
      timeStr = '$h:$m:$s';
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.bgCard,
        border: Border(bottom: BorderSide(color: context.borderColor)),
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
                    width: 72,
                    height: 72,
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
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: context.bgCardAlt,
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
                      dropdownColor: context.bgCard,
                      isDense: true,
                      style: TextStyle(
                        color: context.textPrimary,
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
                    style: TextStyle(
                      color: context.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFF06B6D4).withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 7,
                            height: 7,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: Color(0xFF10B981),
                            ),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            '$count مشترك متصل الآن',
                            style: const TextStyle(
                              color: Color(0xFF22D3EE),
                              fontWeight: FontWeight.bold,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'آخر تحديث: $timeStr',
                      style: TextStyle(color: context.textSecondary, fontSize: 10),
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

  Widget _buildUnreachableBanner(List<RouterConnectionStatus> unreachable) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Colors.amber.shade900.withValues(alpha: 0.25),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Colors.amber, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'تعذر جلب بيانات من: ${unreachable.map((r) => r.name).join(', ')} (انقطاع الراوتر)',
              style: const TextStyle(color: Colors.amber, fontSize: 12),
            ),
          ),
          TextButton(
            onPressed: () => ref.read(activeSessionsProvider.notifier).refresh(),
            child: const Text('إعادة المحاولة', style: TextStyle(color: Colors.white, fontSize: 11)),
          ),
        ],
      ),
    );
  }

  Widget _buildSessionCard(ActiveSessionModel session) {
    final isKicking = _kickingSessionId == session.id;
    final isExpanded = _expandedSessionIds.contains(session.id);

    // Dynamic progress color based on consumption percentage
    final percentage = session.consumptionPercentage ?? 0.0;
    Color progressColor = const Color(0xFF06B6D4);
    if (session.isQuotaExhausted) {
      progressColor = Colors.redAccent;
    } else if (percentage >= 80) {
      progressColor = Colors.orangeAccent;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: session.isQuotaExhausted ? Colors.redAccent.withValues(alpha: 0.5) : context.borderColor,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.2),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row 1: User / Voucher, Status indicator, and Disconnect button
          Row(
            children: [
              // Online Glowing Dot + Username
              Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF10B981),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF10B981).withValues(alpha: 0.6),
                      blurRadius: 6,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  session.user,
                  style: TextStyle(
                    color: context.textPrimary,
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
              ),

              // Disconnect (Kick) Button
              IconButton(
                onPressed: isKicking ? null : () => _handleKick(session),
                icon: isKicking
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.redAccent),
                      )
                    : const Icon(Icons.power_settings_new, color: Colors.redAccent, size: 24),
                tooltip: 'فصل الاتصال من الراوتر',
              ),
            ],
          ),

          const SizedBox(height: 6),

          // Row 2: Badges (Router Name, Profile Name, Speed Limits)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (session.deviceName != null && session.deviceName!.isNotEmpty)
                _buildBadge(
                  icon: Icons.router,
                  text: session.deviceName!,
                  color: const Color(0xFF38BDF8),
                ),
              _buildBadge(
                icon: Icons.card_membership,
                text: session.profileName,
                color: const Color(0xFFA855F7),
              ),
              _buildBadge(
                icon: Icons.speed,
                text: session.formattedSpeed,
                color: const Color(0xFFF59E0B),
              ),
            ],
          ),

          const SizedBox(height: 12),

          // Row 3: Data Consumption Progress Section
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: context.bgCardAlt,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.data_usage, color: Color(0xFF06B6D4), size: 16),
                        const SizedBox(width: 4),
                        Text(
                          'استهلاك الباقة:',
                          style: TextStyle(color: context.textPrimary, fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                    Text(
                      'المتبقي: ${session.formattedRemaining}',
                      style: TextStyle(
                        color: session.isQuotaExhausted ? Colors.redAccent : const Color(0xFF10B981),
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (!session.isUnlimitedQuota && !session.isUnknownQuota) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: (percentage / 100).clamp(0.0, 1.0),
                      minHeight: 6,
                      backgroundColor: Colors.grey.shade800,
                      valueColor: AlwaysStoppedAnimation<Color>(progressColor),
                    ),
                  ),
                  const SizedBox(height: 6),
                ],
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'المستهلك: ${session.formattedConsumed}',
                      style: TextStyle(color: context.textSecondary, fontSize: 11),
                    ),
                    Text(
                      'الإجمالي: ${session.formattedTotalQuota}',
                      style: TextStyle(color: context.textSecondary, fontSize: 11),
                    ),
                    if (session.consumptionPercentage != null)
                      Text(
                        '${session.consumptionPercentage!.toStringAsFixed(1)}%',
                        style: TextStyle(color: progressColor, fontWeight: FontWeight.bold, fontSize: 11),
                      ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // Row 4: Session Uptime & Remaining Duration
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.timer_outlined, color: Color(0xFF38BDF8), size: 15),
                  const SizedBox(width: 4),
                  Text(
                    'الجلسة: ${session.uptime}',
                    style: TextStyle(color: context.textPrimary, fontSize: 12),
                  ),
                ],
              ),
              Row(
                children: [
                  const Icon(Icons.hourglass_bottom, color: Color(0xFFF59E0B), size: 15),
                  const SizedBox(width: 4),
                  Text(
                    'الوقت: ${session.formattedRemainingTime}',
                    style: TextStyle(
                      color: session.isExpired ? Colors.redAccent : context.textPrimary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ],
          ),

          const SizedBox(height: 8),

          // Row 5: IP and MAC Addresses with Tap-to-Copy
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              InkWell(
                onTap: () => _copyToClipboard(session.address, 'عنوان IP'),
                borderRadius: BorderRadius.circular(6),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Row(
                    children: [
                      const Icon(Icons.language, color: Color(0xFF94A3B8), size: 14),
                      const SizedBox(width: 4),
                      Text(
                        'IP: ${session.address}',
                        style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
              InkWell(
                onTap: () => _copyToClipboard(session.macAddress, 'عنوان MAC'),
                borderRadius: BorderRadius.circular(6),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Row(
                    children: [
                      const Icon(Icons.fingerprint, color: Color(0xFF94A3B8), size: 14),
                      const SizedBox(width: 4),
                      Text(
                        session.macAddress,
                        style: TextStyle(color: context.textSecondary, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // Row 6: Expandable Details Section
          const SizedBox(height: 6),
          Divider(color: context.borderColor, height: 1),
          const SizedBox(height: 4),

          InkWell(
            onTap: () {
              setState(() {
                if (isExpanded) {
                  _expandedSessionIds.remove(session.id);
                } else {
                  _expandedSessionIds.add(session.id);
                }
              });
            },
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    isExpanded ? 'طي التفاصيل الإضافية' : 'عرض التفاصيل الإضافية',
                    style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                  Icon(
                    isExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                    color: const Color(0xFF38BDF8),
                    size: 16,
                  ),
                ],
              ),
            ),
          ),

          if (isExpanded) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: context.bgCardAlt,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: context.borderColor),
              ),
              child: Column(
                children: [
                  _buildDetailRow('معرف الجلسة:', session.sessionId ?? 'غير متاح'),
                  _buildDetailRow('خادم الهوتسبوت:', session.server ?? 'hotspot1'),
                  _buildDetailRow('طريقة الدخول:', session.loginBy ?? 'تلقائي / كرت'),
                  _buildDetailRow('محدد السرعة (Rate-Limit):', session.rateLimit ?? 'غير محدد (مفتوح)'),
                  _buildDetailRow('حجم الرفع (Upload):', ActiveSessionModel.formatBytes(session.bytesIn)),
                  _buildDetailRow('حجم التنزيل (Download):', ActiveSessionModel.formatBytes(session.bytesOut)),
                  if (session.timeLimit != null)
                    _buildDetailRow('الحد الزمني للباقة:', session.timeLimit!),
                  if (session.expiresAt != null)
                    _buildDetailRow('تاريخ الانتهاء:', session.expiresAt!.substring(0, 10)),
                  _buildDetailRow(
                    'حالة الباقة:',
                    session.isQuotaExhausted
                        ? 'مستنفدة بالكامل'
                        : (session.isExpired ? 'منتهية الصلاحية' : 'نشطة وجارية'),
                    valueColor: (session.isQuotaExhausted || session.isExpired)
                        ? Colors.redAccent
                        : const Color(0xFF10B981),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBadge({
    required IconData icon,
    required String text,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 13),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: context.textSecondary, fontSize: 11)),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                color: valueColor ?? context.textPrimary,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
