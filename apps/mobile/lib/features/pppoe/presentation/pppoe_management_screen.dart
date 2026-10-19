import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import 'tabs/pppoe_accounts_tab.dart';
import 'tabs/pppoe_profiles_tab.dart';
import 'tabs/pppoe_sessions_tab.dart';
import 'tabs/pppoe_commands_tab.dart';

class PppoeManagementScreen extends ConsumerStatefulWidget {
  const PppoeManagementScreen({super.key});

  @override
  ConsumerState<PppoeManagementScreen> createState() => _PppoeManagementScreenState();
}

class _PppoeManagementScreenState extends ConsumerState<PppoeManagementScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _refreshAll() {
    ref.read(pppoeProfilesProvider.notifier).refresh();
    ref.read(pppoeAccountsProvider.notifier).refresh();
    ref.read(pppoeSessionsProvider.notifier).refresh();
  }

  @override
  Widget build(BuildContext context) {
    final routersAsync = ref.watch(routersProvider);
    final selectedRouterId = ref.watch(selectedRouterIdProvider);

    final accountsCount = ref.watch(pppoeAccountsProvider).asData?.value.length ?? 0;
    final profilesCount = ref.watch(pppoeProfilesProvider).asData?.value.length ?? 0;
    final sessionsCount = ref.watch(pppoeSessionsProvider).asData?.value.length ?? 0;
    final commandsCount = ref.watch(pppoeCommandsProvider).length;

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: Row(
          children: [
            const Icon(Icons.settings_ethernet, color: Color(0xFF06B6D4), size: 22),
            const SizedBox(width: 8),
            Text(
              'اشتراكات PPPoE',
              style: TextStyle(color: context.textPrimary, fontSize: 17, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF06B6D4)),
            tooltip: 'تحديث بيانات الراوتر',
            onPressed: _refreshAll,
          ),
        ],
      ),
      body: Column(
        children: [
          // Router Selector & KPI Header
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: BoxDecoration(
              color: context.bgCard,
              border: Border(bottom: BorderSide(color: context.borderColor)),
            ),
            child: Column(
              children: [
                // Router Dropdown
                routersAsync.when(
                  loading: () => const LinearProgressIndicator(color: Color(0xFF06B6D4), minHeight: 2),
                  error: (e, _) => Text(
                    'تعذر جلب الراوترات: $e',
                    style: const TextStyle(color: Color(0xFFF87171), fontSize: 11),
                  ),
                  data: (routers) {
                    if (routers.isEmpty) {
                      return const Row(
                        children: [
                          Icon(Icons.warning_amber_rounded, color: Color(0xFFF59E0B), size: 18),
                          SizedBox(width: 8),
                          Text(
                            'لا توجد أجهزة راوتر مضافة في الحساب',
                            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                          ),
                        ],
                      );
                    }

                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                      decoration: BoxDecoration(
                        color: context.bgScaffold,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: context.borderColor),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: selectedRouterId ?? (routers.isNotEmpty ? routers.first.id : null),
                          isExpanded: true,
                          dropdownColor: context.bgCard,
                          icon: const Icon(Icons.arrow_drop_down, color: Color(0xFF06B6D4)),
                          items: routers.map((r) {
                            return DropdownMenuItem<String>(
                              value: r.id,
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.router,
                                    color: r.isOnline ? const Color(0xFF10B981) : const Color(0xFF64748B),
                                    size: 16,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${r.name} (${r.host})',
                                    style: TextStyle(color: context.textPrimary, fontSize: 13),
                                  ),
                                  const Spacer(),
                                  Text(
                                    r.isOnline ? 'متصل' : 'غير متصل',
                                    style: TextStyle(
                                      color: r.isOnline ? const Color(0xFF10B981) : const Color(0xFF64748B),
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
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
                    );
                  },
                ),

                const SizedBox(height: 10),

                // KPI Summary Chips
                Row(
                  children: [
                    Expanded(
                      child: _buildKpiChip(
                        title: 'المشتركون',
                        value: '$accountsCount',
                        color: const Color(0xFF38BDF8),
                        icon: Icons.people_alt,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildKpiChip(
                        title: 'متصل الآن',
                        value: '$sessionsCount',
                        color: const Color(0xFF10B981),
                        icon: Icons.wifi,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildKpiChip(
                        title: 'باقات السرعة',
                        value: '$profilesCount',
                        color: const Color(0xFFF59E0B),
                        icon: Icons.speed,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Tab Bar
          Container(
            color: context.bgCard,
            child: TabBar(
              controller: _tabController,
              isScrollable: true,
              indicatorColor: const Color(0xFF06B6D4),
              indicatorWeight: 3,
              labelColor: const Color(0xFF06B6D4),
              unselectedLabelColor: const Color(0xFF94A3B8),
              labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
              tabs: [
                Tab(
                  child: Row(
                    children: [
                      const Icon(Icons.people, size: 16),
                      const SizedBox(width: 6),
                      const Text('الحسابات'),
                      if (accountsCount > 0) ...[
                        const SizedBox(width: 4),
                        _buildTabBadge('$accountsCount'),
                      ],
                    ],
                  ),
                ),
                Tab(
                  child: Row(
                    children: [
                      const Icon(Icons.layers, size: 16),
                      const SizedBox(width: 6),
                      const Text('باقات السرعة'),
                      if (profilesCount > 0) ...[
                        const SizedBox(width: 4),
                        _buildTabBadge('$profilesCount'),
                      ],
                    ],
                  ),
                ),
                Tab(
                  child: Row(
                    children: [
                      const Icon(Icons.online_prediction, size: 16),
                      const SizedBox(width: 6),
                      const Text('الجلسات النشطة'),
                      if (sessionsCount > 0) ...[
                        const SizedBox(width: 4),
                        _buildTabBadge('$sessionsCount', isGreen: true),
                      ],
                    ],
                  ),
                ),
                Tab(
                  child: Row(
                    children: [
                      const Icon(Icons.terminal, size: 16),
                      const SizedBox(width: 6),
                      const Text('أوامر الراوتر'),
                      if (commandsCount > 0) ...[
                        const SizedBox(width: 4),
                        _buildTabBadge('$commandsCount'),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Tab Views
          Expanded(
            child: selectedRouterId == null
                ? const Center(
                    child: Text(
                      'يرجى تحديد جهاز راوتر للمتابعة',
                      style: TextStyle(color: Color(0xFF94A3B8)),
                    ),
                  )
                : TabBarView(
                    controller: _tabController,
                    children: const [
                      PppoeAccountsTab(),
                      PppoeProfilesTab(),
                      PppoeSessionsTab(),
                      PppoeCommandsTab(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildKpiChip({
    required String title,
    required String value,
    required Color color,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: context.bgScaffold,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.borderColor),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 6),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.bold),
              ),
              Text(
                title,
                style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTabBadge(String text, {bool isGreen = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: isGreen ? const Color(0xFF10B981) : context.bgCardAlt,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: isGreen ? Colors.white : const Color(0xFF94A3B8),
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
