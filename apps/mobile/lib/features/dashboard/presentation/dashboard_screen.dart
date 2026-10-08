import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  final Function(int tabIndex)? onNavigateTab;
  final VoidCallback? onOpenPos;
  final VoidCallback? onOpenOfflineWallet;
  final VoidCallback? onOpenSync;
  final VoidCallback? onOpenShift;
  final VoidCallback? onOpenRouterSetup;
  final VoidCallback? onOpenCloudWallet;

  const DashboardScreen({
    super.key,
    this.onNavigateTab,
    this.onOpenPos,
    this.onOpenOfflineWallet,
    this.onOpenSync,
    this.onOpenShift,
    this.onOpenRouterSetup,
    this.onOpenCloudWallet,
  });

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  bool _isTogglingLock = false;
  bool _isTogglingAntiTethering = false;

  void _handleEmergencyLock(RouterDeviceModel router) async {
    final willLock = !router.isLocked;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            Icon(
              willLock ? Icons.lock : Icons.lock_open,
              color: willLock ? Colors.red : Colors.green,
            ),
            const SizedBox(width: 8),
            Text(willLock ? 'تأكيد قفل الطوارئ' : 'إلغاء قفل الطوارئ'),
          ],
        ),
        content: Text(
          willLock
              ? 'سيتم تجميد وتأمين الراوتر ومنع أي تعديلات غير مصرح بها فوراً. هل تريد المتابعة؟'
              : 'هل أنت متأكد من رغبتك في فك قفل الطوارئ واستئناف العمليات؟',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: willLock ? Colors.red : Colors.green,
              foregroundColor: Colors.white,
            ),
            child: Text(willLock ? 'تفعيل القفل الآن' : 'فك القفل'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _isTogglingLock = true);
      final success = await ref
          .read(routersProvider.notifier)
          .toggleEmergencyLock(router.id, willLock);
      setState(() => _isTogglingLock = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              success
                  ? (willLock
                      ? 'تم تفعيل قفل الطوارئ بنجاح'
                      : 'تم إلغاء قفل الطوارئ بنجاح')
                  : 'تم تحديث الحالة محلياً (غير متصل بالراوتر حالياً)',
            ),
            backgroundColor: willLock ? Colors.red.shade700 : Colors.green.shade700,
          ),
        );
      }
    }
  }

  void _handleAntiTethering(RouterDeviceModel router) async {
    final willEnable = !router.antiTetheringEnabled;
    setState(() => _isTogglingAntiTethering = true);
    final success = await ref
        .read(routersProvider.notifier)
        .toggleAntiTethering(router.id, willEnable);
    setState(() => _isTogglingAntiTethering = false);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            success
                ? (willEnable
                    ? 'تم تفعيل حماية Anti-Tethering (TTL=1)'
                    : 'تم تعطيل حماية Anti-Tethering')
                : 'تم تحديث حالة الحماية محلياً',
          ),
          backgroundColor: willEnable ? Colors.blue.shade700 : Colors.grey.shade800,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final routersAsync = ref.watch(routersProvider);
    final sessionsAsync = ref.watch(activeSessionsProvider);
    final financeAsync = ref.watch(financialReportProvider);
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
                color: const Color(0xFF2563EB).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.router, color: Color(0xFF38BDF8), size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'سودافاي | SudaFi',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'لوحة التحكم والتشغيل المباشر',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
            tooltip: 'تحديث البيانات',
            onPressed: () {
              ref.invalidate(routersProvider);
              ref.invalidate(activeSessionsProvider);
              ref.invalidate(financialReportProvider);
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(routersProvider);
          ref.invalidate(activeSessionsProvider);
          ref.invalidate(financialReportProvider);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Router selector & status banner
              routersAsync.when(
                data: (routers) {
                  if (routers.isEmpty) {
                    return _buildEmptyRouterCard();
                  }
                  final currentRouter = routers.firstWhere(
                    (r) => r.id == selectedRouterId,
                    orElse: () => routers.first,
                  );
                  return Column(
                    children: [
                      _buildRouterHeaderBar(routers, currentRouter),
                      const SizedBox(height: 12),
                      _buildRouterHealthCard(currentRouter),
                    ],
                  );
                },
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24.0),
                    child: CircularProgressIndicator(),
                  ),
                ),
                error: (_, _) => _buildEmptyRouterCard(),
              ),

              const SizedBox(height: 16),

              // KPI Financial Banner Card
              financeAsync.when(
                data: (finance) => sessionsAsync.when(
                  data: (sessions) => _buildKpiMetricsCard(finance, sessions.length),
                  loading: () => _buildKpiMetricsCard(finance, 0),
                  error: (_, _) => _buildKpiMetricsCard(finance, 0),
                ),
                loading: () => const SizedBox(height: 80, child: Center(child: CircularProgressIndicator())),
                error: (_, _) => _buildKpiMetricsCard(null, 0),
              ),

              const SizedBox(height: 20),

              // Quick Actions Grid Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: const [
                  Text(
                    'الوصول السريع والإجراءات',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  Text(
                    'جميع الوظائف',
                    style: TextStyle(fontSize: 12, color: Color(0xFF38BDF8)),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // 3x4 Quick Actions Grid
              _buildQuickActionsGrid(),

              const SizedBox(height: 20),

              // Live Radar / Connected Users snippet
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'المستخدمون المتصلون الآن (الرادار)',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => widget.onNavigateTab?.call(3),
                    icon: const Icon(Icons.arrow_back, size: 16, color: Color(0xFF38BDF8)),
                    label: const Text('عرض الكل', style: TextStyle(color: Color(0xFF38BDF8))),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              sessionsAsync.when(
                data: (sessions) => _buildRecentSessionsList(sessions),
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, _) => const Text('تعذر تحميل الجلسات', style: TextStyle(color: Colors.grey)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyRouterCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Colors.amber, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'لم يتم ربط راوتر نشط',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
                Text(
                  'اضغط على إعداد الراوتر لتهيئة بيانات الربط عبر API أو REST',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: widget.onOpenRouterSetup,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
            child: const Text('تهيئة', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Widget _buildRouterHeaderBar(List<RouterDeviceModel> routers, RouterDeviceModel selected) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Row(
        children: [
          const Icon(Icons.dns, color: Color(0xFF38BDF8), size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: selected.id,
                dropdownColor: const Color(0xFF1E293B),
                isExpanded: true,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                items: routers.map((r) {
                  return DropdownMenuItem<String>(
                    value: r.id,
                    child: Text(
                      '${r.name} (${r.host})',
                      overflow: TextOverflow.ellipsis,
                    ),
                  );
                }).toList(),
                onChanged: (id) {
                  if (id != null) {
                    ref.read(selectedRouterIdProvider.notifier).select(id);
                  }
                },
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: selected.isOnline
                  ? Colors.green.withValues(alpha: 0.2)
                  : Colors.red.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: selected.isOnline ? Colors.green : Colors.red,
                width: 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 4,
                  backgroundColor: selected.isOnline ? Colors.green : Colors.red,
                ),
                const SizedBox(width: 6),
                Text(
                  selected.isOnline ? 'متصل' : 'غير متصل',
                  style: TextStyle(
                    color: selected.isOnline ? Colors.greenAccent : Colors.redAccent,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRouterHealthCard(RouterDeviceModel router) {
    final cpu = router.cpuLoad ?? 0;
    final memTotal = router.memoryTotalMb ?? 1024;
    final memFree = router.memoryFreeMb ?? 512;
    final memUsed = (memTotal - memFree).clamp(0, memTotal);
    final memPct = ((memUsed / memTotal) * 100).round();

    final diskTotal = router.diskTotalMb ?? 512;
    final diskFree = router.diskFreeMb ?? 256;
    final diskUsed = (diskTotal - diskFree).clamp(0, diskTotal);
    final diskPct = ((diskUsed / diskTotal) * 100).round();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: router.isLocked ? Colors.red.withValues(alpha: 0.5) : const Color(0xFF334155),
          width: router.isLocked ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          // Row: Model, ROS, Uptime
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.developer_board, color: Color(0xFF38BDF8), size: 18),
                  const SizedBox(width: 6),
                  Text(
                    router.modelName ?? 'MikroTik RouterOS',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF2563EB).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'ROS ${router.rosVersion}',
                  style: const TextStyle(color: Color(0xFF60A5FA), fontSize: 11),
                ),
              ),
              Text(
                'العمل: ${router.uptime ?? '0s'}',
                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // 3 Metric Gauges (CPU, RAM, DISK)
          Row(
            children: [
              Expanded(child: _buildMetricGauge('المعالج CPU', '$cpu%', cpu / 100.0, _getColorForPercent(cpu))),
              const SizedBox(width: 8),
              Expanded(child: _buildMetricGauge('الذاكرة RAM', '$memPct%', memPct / 100.0, _getColorForPercent(memPct))),
              const SizedBox(width: 8),
              Expanded(child: _buildMetricGauge('القرص DISK', '$diskPct%', diskPct / 100.0, _getColorForPercent(diskPct))),
            ],
          ),

          const SizedBox(height: 16),
          const Divider(color: Color(0xFF334155), height: 1),
          const SizedBox(height: 12),

          // Action Switches: Emergency Lock & Anti-Tethering
          Row(
            children: [
              // Emergency Lock
              Expanded(
                child: InkWell(
                  onTap: _isTogglingLock ? null : () => _handleEmergencyLock(router),
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: router.isLocked
                          ? Colors.red.withValues(alpha: 0.2)
                          : const Color(0xFF334155).withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: router.isLocked ? Colors.red : Colors.transparent,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          router.isLocked ? Icons.lock : Icons.lock_open,
                          color: router.isLocked ? Colors.redAccent : Colors.grey,
                          size: 18,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            router.isLocked ? 'مقفل للطوارئ' : 'قفل الطوارئ',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: router.isLocked ? Colors.redAccent : Colors.white,
                            ),
                          ),
                        ),
                        if (_isTogglingLock)
                          const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Anti-Tethering
              Expanded(
                child: InkWell(
                  onTap: _isTogglingAntiTethering ? null : () => _handleAntiTethering(router),
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: router.antiTetheringEnabled
                          ? const Color(0xFF2563EB).withValues(alpha: 0.2)
                          : const Color(0xFF334155).withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: router.antiTetheringEnabled
                            ? const Color(0xFF38BDF8)
                            : Colors.transparent,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.shield_outlined,
                          color: router.antiTetheringEnabled
                              ? const Color(0xFF38BDF8)
                              : Colors.grey,
                          size: 18,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            router.antiTetheringEnabled ? 'حظر البث نشط' : 'حظر البث (TTL)',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: router.antiTetheringEnabled
                                  ? const Color(0xFF38BDF8)
                                  : Colors.white,
                            ),
                          ),
                        ),
                        if (_isTogglingAntiTethering)
                          const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetricGauge(String label, String valueStr, double ratio, Color color) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        children: [
          Text(label, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
          const SizedBox(height: 6),
          Text(
            valueStr,
            style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 14),
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: ratio.clamp(0.0, 1.0),
              backgroundColor: const Color(0xFF334155),
              valueColor: AlwaysStoppedAnimation<Color>(color),
              minHeight: 5,
            ),
          ),
        ],
      ),
    );
  }

  Color _getColorForPercent(num percent) {
    if (percent < 50) return const Color(0xFF10B981); // Emerald
    if (percent < 80) return const Color(0xFFF59E0B); // Amber
    return const Color(0xFFEF4444); // Red
  }

  Widget _buildKpiMetricsCard(FinancialReportModel? finance, int connectedUsers) {
    final revenue = finance?.todayRevenue ?? 28400;
    final salesCount = finance?.todaySalesCount ?? 42;
    final currency = finance?.currency ?? 'SDG';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1D4ED8), Color(0xFF1E3A8A)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF1D4ED8).withValues(alpha: 0.3),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildKpiItem(
            'مبيعات اليوم',
            '${revenue.toStringAsFixed(0)} $currency',
            Icons.account_balance_wallet,
          ),
          Container(width: 1, height: 40, color: Colors.white.withValues(alpha: 0.2)),
          _buildKpiItem(
            'كروت مباعة',
            '$salesCount كرت',
            Icons.credit_card,
          ),
          Container(width: 1, height: 40, color: Colors.white.withValues(alpha: 0.2)),
          _buildKpiItem(
            'المتصلون الآن',
            '$connectedUsers جهاز',
            Icons.wifi_tethering,
          ),
        ],
      ),
    );
  }

  Widget _buildKpiItem(String title, String val, IconData icon) {
    return Column(
      children: [
        Icon(icon, color: const Color(0xFF93C5FD), size: 20),
        const SizedBox(height: 4),
        Text(val, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        Text(title, style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 10)),
      ],
    );
  }

  Widget _buildQuickActionsGrid() {
    final actions = [
      _ActionItem('استوديو الكروت', Icons.auto_awesome, const Color(0xFF8B5CF6), () => widget.onNavigateTab?.call(2)),
      _ActionItem('رادار الشبكة', Icons.radar, const Color(0xFF06B6D4), () => widget.onNavigateTab?.call(3)),
      _ActionItem('نقطة البيع POS', Icons.point_of_sale, const Color(0xFF10B981), widget.onOpenPos),
      _ActionItem('مخزن الكروت', Icons.inventory_2, const Color(0xFF3B82F6), () => widget.onNavigateTab?.call(1)),
      _ActionItem('التقارير المالية', Icons.bar_chart, const Color(0xFFF59E0B), () => widget.onNavigateTab?.call(4)),
      _ActionItem('محفظة السحاب', Icons.cloud_done, const Color(0xFFEC4899), widget.onOpenCloudWallet),
      _ActionItem('إعداد الراوتر', Icons.settings_input_antenna, const Color(0xFF6366F1), widget.onOpenRouterSetup),
      _ActionItem('محفظة الأوفلاين', Icons.wallet, const Color(0xFF14B8A6), widget.onOpenOfflineWallet),
      _ActionItem('مركز المزامنة', Icons.sync, const Color(0xFFF97316), widget.onOpenSync),
      _ActionItem('تقرير الوردية', Icons.receipt_long, const Color(0xFF0EA5E9), widget.onOpenShift),
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: actions.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 1.05,
      ),
      itemBuilder: (ctx, idx) {
        final item = actions[idx];
        return InkWell(
          onTap: item.onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: item.color.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(item.icon, color: item.color, size: 22),
                ),
                const SizedBox(height: 6),
                Text(
                  item.title,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildRecentSessionsList(List<ActiveSessionModel> sessions) {
    if (sessions.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
          child: Text(
            'لا توجد جلسات نشطة حالياً على الراوتر',
            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
          ),
        ),
      );
    }

    final displayList = sessions.take(3).toList();

    return Column(
      children: displayList.map((s) {
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: const Color(0xFF06B6D4).withValues(alpha: 0.2),
                child: const Icon(Icons.person, color: Color(0xFF06B6D4), size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.user,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      '${s.address} • ${s.macAddress}',
                      style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${s.totalMb.toStringAsFixed(1)} MB',
                    style: const TextStyle(
                      color: Color(0xFF38BDF8),
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                  Text(
                    s.uptime,
                    style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
                  ),
                ],
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class _ActionItem {
  final String title;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  _ActionItem(this.title, this.icon, this.color, this.onTap);
}
