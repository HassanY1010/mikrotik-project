import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';

class ConnectedDevicesScreen extends ConsumerStatefulWidget {
  final String? initialRouterId;

  const ConnectedDevicesScreen({
    super.key,
    this.initialRouterId,
  });

  @override
  ConsumerState<ConnectedDevicesScreen> createState() => _ConnectedDevicesScreenState();
}

class _ConnectedDevicesScreenState extends ConsumerState<ConnectedDevicesScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String _selectedFilter = 'ALL'; // ALL, ACCESS_POINT, ACTIVE, LEASED, PHONE, COMPUTER, UNKNOWN
  String? _currentRouterId;

  @override
  void initState() {
    super.initState();
    _currentRouterId = widget.initialRouterId;
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _copyToClipboard(String text, String label) {
    if (text.isEmpty) return;
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'تم نسخ $label: $text',
                style: const TextStyle(fontSize: 13),
              ),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF16A34A),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  List<ConnectedDeviceModel> _filterDevices(List<ConnectedDeviceModel> devices) {
    return devices.where((device) {
      // 1. Filter by category
      if (_selectedFilter == 'ACCESS_POINT' && !device.isAccessPoint) {
        return false;
      }
      if (_selectedFilter == 'ACTIVE' && !device.isConfirmedOnline) {
        return false;
      }
      if (_selectedFilter == 'LEASED' && !device.isLeaseOnly) {
        return false;
      }
      if (_selectedFilter == 'PHONE' && device.deviceType != 'PHONE') {
        return false;
      }
      if (_selectedFilter == 'COMPUTER' && device.deviceType != 'COMPUTER') {
        return false;
      }
      if (_selectedFilter == 'UNKNOWN' && !device.isUnknown) {
        return false;
      }

      // 2. Filter by search query
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final name = device.name.toLowerCase();
        final ip = device.ipAddress.toLowerCase();
        final mac = device.macAddress.toLowerCase();
        final iface = (device.interfaceName ?? '').toLowerCase();
        final host = (device.hostName ?? '').toLowerCase();
        final vendor = (device.vendor ?? '').toLowerCase();

        return name.contains(q) ||
            ip.contains(q) ||
            mac.contains(q) ||
            iface.contains(q) ||
            host.contains(q) ||
            vendor.contains(q);
      }

      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final routersAsync = ref.watch(routersProvider);

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        centerTitle: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'الأجهزة المتصلة وأجهزة البث',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
              ),
            ),
            routersAsync.when(
              data: (routers) {
                final effectiveId = _currentRouterId ?? ref.watch(selectedRouterIdProvider);
                final currentRouter = routers.isNotEmpty
                    ? routers.firstWhere(
                        (r) => r.id == effectiveId,
                        orElse: () => routers.first,
                      )
                    : null;
                if (currentRouter == null) return const SizedBox.shrink();
                return Text(
                  'الراوتر: ${currentRouter.name} (${currentRouter.host})',
                  style: TextStyle(
                    fontSize: 11,
                    color: context.textSecondary,
                  ),
                );
              },
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'تحديث القائمة',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              final effectiveId = _currentRouterId ?? ref.read(selectedRouterIdProvider);
              if (effectiveId != null && effectiveId.isNotEmpty) {
                ref.invalidate(connectedDevicesProvider(effectiveId));
              }
            },
          ),
        ],
      ),
      body: routersAsync.when(
        data: (routers) {
          if (routers.isEmpty) {
            return _buildNoRoutersView();
          }

          final effectiveId = _currentRouterId ?? ref.watch(selectedRouterIdProvider);
          final currentRouter = routers.firstWhere(
            (r) => r.id == effectiveId,
            orElse: () => routers.first,
          );

          final devicesAsync = ref.watch(connectedDevicesProvider(currentRouter.id));

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(connectedDevicesProvider(currentRouter.id));
              await ref.read(connectedDevicesProvider(currentRouter.id).future);
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Router Selector & Status Card
                _buildRouterInfoCard(routers, currentRouter),
                const SizedBox(height: 16),

                // If router is offline, show notice
                if (!currentRouter.isOnline) ...[
                  _buildRouterOfflineNotice(currentRouter),
                  const SizedBox(height: 16),
                ],

                // Devices stats and list
                devicesAsync.when(
                  data: (devices) {
                    final apCount = devices.where((d) => d.isAccessPoint).length;
                    final confirmedCount = devices.where((d) => d.isConfirmedOnline).length;
                    final leasedCount = devices.where((d) => d.isLeaseOnly).length;
                    final filtered = _filterDevices(devices);

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // KPI Summary Cards
                        _buildKpiSummary(devices.length, apCount, confirmedCount, leasedCount),
                        const SizedBox(height: 16),

                        // Search Bar
                        _buildSearchBar(),
                        const SizedBox(height: 12),

                        // Filter Chips
                        _buildFilterChips(devices.length, apCount, confirmedCount, leasedCount),
                        const SizedBox(height: 16),

                        // List Header with count
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'الأجهزة المكتشفة (${filtered.length})',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: context.textPrimary,
                              ),
                            ),
                            if (_searchQuery.isNotEmpty || _selectedFilter != 'ALL')
                              InkWell(
                                onTap: () {
                                  setState(() {
                                    _searchQuery = '';
                                    _searchController.clear();
                                    _selectedFilter = 'ALL';
                                  });
                                },
                                child: const Text(
                                  'إعادة التعيين',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Color(0xFF38BDF8),
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),

                        // Device Cards List
                        if (filtered.isEmpty)
                          _buildEmptyDevicesView(devices.isEmpty)
                        else
                          ListView.separated(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: filtered.length,
                            separatorBuilder: (_, _) => const SizedBox(height: 10),
                            itemBuilder: (ctx, idx) => _buildDeviceCard(filtered[idx]),
                          ),
                      ],
                    );
                  },
                  loading: () => _buildLoadingView(),
                  error: (err, _) => _buildErrorView(currentRouter.id, err),
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(
          child: Text(
            'تعذر تحميل بيانات الراوترات: $err',
            style: const TextStyle(color: Colors.red),
          ),
        ),
      ),
    );
  }

  Widget _buildNoRoutersView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF0284C7).withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.router_outlined,
                size: 56,
                color: Color(0xFF0284C7),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              'لا يوجد راوتر مسجل',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: context.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'يرجى إضافة راوتر مايكروتك وربطه بالشبكة لتتمكن من فحص أجهزة البث والأجهزة المتصلة.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: context.textSecondary),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRouterOfflineNotice(RouterDeviceModel router) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.wifi_off_rounded, color: Color(0xFFEF4444), size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'الراوتر غير متصل حالياً',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFEF4444),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'قد لا تظهر أحدث الأجهزة النشطة لأن خادم النظام غير قادر على التواصل مع الراوتر (${router.host}). يرجى التأكد من تشغيله واتصاله بالإنترنت.',
                  style: TextStyle(
                    fontSize: 11,
                    color: context.textSecondary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRouterInfoCard(List<RouterDeviceModel> routers, RouterDeviceModel currentRouter) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF0284C7).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.settings_input_antenna_rounded,
                  color: Color(0xFF0284C7),
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'الراوتر المحدد',
                      style: TextStyle(
                        fontSize: 10,
                        color: context.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      currentRouter.name,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
              // Online / Offline Status Badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: currentRouter.isOnline
                      ? const Color(0xFF16A34A).withValues(alpha: 0.15)
                      : const Color(0xFFDC2626).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: currentRouter.isOnline
                        ? const Color(0xFF16A34A).withValues(alpha: 0.4)
                        : const Color(0xFFDC2626).withValues(alpha: 0.4),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: currentRouter.isOnline
                            ? const Color(0xFF16A34A)
                            : const Color(0xFFDC2626),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      currentRouter.isOnline ? 'متصل' : 'غير متصل',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: currentRouter.isOnline
                            ? const Color(0xFF16A34A)
                            : const Color(0xFFDC2626),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (routers.length > 1) ...[
            const SizedBox(height: 12),
            Divider(color: context.borderColor, height: 1),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  'تبديل الراوتر:',
                  style: TextStyle(fontSize: 11, color: context.textSecondary),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: currentRouter.id,
                      isDense: true,
                      isExpanded: true,
                      dropdownColor: context.bgCard,
                      items: routers.map((r) {
                        return DropdownMenuItem<String>(
                          value: r.id,
                          child: Text(
                            '${r.name} (${r.host})',
                            style: TextStyle(
                              fontSize: 12,
                              color: context.textPrimary,
                            ),
                          ),
                        );
                      }).toList(),
                      onChanged: (newId) {
                        if (newId != null && newId != currentRouter.id) {
                          setState(() => _currentRouterId = newId);
                          ref.read(selectedRouterIdProvider.notifier).select(newId);
                        }
                      },
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildKpiSummary(int total, int aps, int confirmed, int leased) {
    return Row(
      children: [
        Expanded(
          child: _buildSummaryCard(
            title: 'إجمالي الأجهزة',
            count: '$total',
            icon: Icons.devices_other_rounded,
            color: const Color(0xFF3B82F6),
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: _buildSummaryCard(
            title: 'أجهزة البث',
            count: '$aps',
            icon: Icons.cell_tower_rounded,
            color: const Color(0xFF0EA5E9),
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: _buildSummaryCard(
            title: 'متصل مؤكد',
            count: '$confirmed',
            icon: Icons.wifi_tethering_rounded,
            color: const Color(0xFF10B981),
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: _buildSummaryCard(
            title: 'عقد نشط',
            count: '$leased',
            icon: Icons.access_time_rounded,
            color: const Color(0xFFF59E0B),
          ),
        ),
      ],
    );
  }

  Widget _buildSummaryCard({
    required String title,
    required String count,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 16),
          ),
          const SizedBox(height: 4),
          Text(
            count,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 9,
              color: context.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: TextField(
        controller: _searchController,
        style: TextStyle(fontSize: 13, color: context.textPrimary),
        onChanged: (val) => setState(() => _searchQuery = val.trim()),
        decoration: InputDecoration(
          hintText: 'البحث بالاسم، IP، MAC، المنفذ، أو الشركة المصنعة...',
          hintStyle: TextStyle(fontSize: 12, color: context.textSecondary),
          prefixIcon: const Icon(Icons.search, size: 20),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: () {
                    setState(() {
                      _searchQuery = '';
                      _searchController.clear();
                    });
                  },
                )
              : null,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        ),
      ),
    );
  }

  Widget _buildFilterChips(int total, int aps, int confirmed, int leased) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _buildChip('الكل ($total)', 'ALL'),
          const SizedBox(width: 6),
          _buildChip('أجهزة البث ($aps)', 'ACCESS_POINT', icon: Icons.cell_tower_rounded),
          const SizedBox(width: 6),
          _buildChip('متصل مؤكد ($confirmed)', 'ACTIVE', icon: Icons.bolt_rounded),
          const SizedBox(width: 6),
          _buildChip('عقود نشطة ($leased)', 'LEASED', icon: Icons.access_time_rounded),
          const SizedBox(width: 6),
          _buildChip('هواتف', 'PHONE', icon: Icons.smartphone_rounded),
          const SizedBox(width: 6),
          _buildChip('كمبيوترات', 'COMPUTER', icon: Icons.laptop_mac_rounded),
          const SizedBox(width: 6),
          _buildChip('غير محدد', 'UNKNOWN', icon: Icons.help_outline_rounded),
        ],
      ),
    );
  }

  Widget _buildChip(String label, String filterKey, {IconData? icon}) {
    final isSelected = _selectedFilter == filterKey;
    return InkWell(
      onTap: () => setState(() => _selectedFilter = filterKey),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFF0284C7)
              : context.bgCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected
                ? const Color(0xFF0284C7)
                : context.borderColor,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 14,
                color: isSelected ? Colors.white : context.textSecondary,
              ),
              const SizedBox(width: 4),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected ? Colors.white : context.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeviceCard(ConnectedDeviceModel device) {
    final isAp = device.isAccessPoint;

    // Determine card icon and color
    IconData icon;
    Color iconColor;
    if (isAp) {
      icon = Icons.cell_tower_rounded;
      iconColor = const Color(0xFF0EA5E9); // Bright Cyan
    } else if (device.deviceType == 'PHONE') {
      icon = Icons.smartphone_rounded;
      iconColor = const Color(0xFFA855F7); // Purple
    } else if (device.deviceType == 'COMPUTER') {
      icon = Icons.laptop_mac_rounded;
      iconColor = const Color(0xFF3B82F6); // Blue
    } else if (device.deviceType == 'ROUTER') {
      icon = Icons.router_rounded;
      iconColor = const Color(0xFF6366F1); // Indigo
    } else {
      icon = Icons.devices_other_rounded;
      iconColor = const Color(0xFF64748B); // Slate
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isAp
              ? const Color(0xFF0EA5E9).withValues(alpha: 0.4)
              : context.borderColor,
          width: isAp ? 1.5 : 1.0,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: Icon, Name/Host, Badges
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: iconColor, size: 22),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            device.name,
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.bold,
                              color: context.textPrimary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isAp) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0EA5E9).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: const Color(0xFF0EA5E9).withValues(alpha: 0.4),
                              ),
                            ),
                            child: const Text(
                              'جهاز بث',
                              style: TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF0EA5E9),
                              ),
                            ),
                          ),
                        ] else if (device.isUnknown) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.grey.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'جهاز غير محدد',
                              style: TextStyle(
                                fontSize: 9.0,
                                color: context.textSecondary,
                              ),
                            ),
                          ),
                        ] else if (device.deviceType == 'ROUTER') ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF6366F1).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'راوتر',
                              style: TextStyle(
                                fontSize: 9.5,
                                color: Color(0xFF6366F1),
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (device.hostName != null &&
                        device.hostName!.isNotEmpty &&
                        device.hostName != device.name) ...[
                      const SizedBox(height: 2),
                      Text(
                        'الاسم المضيف: ${device.hostName}',
                        style: TextStyle(fontSize: 11, color: context.textSecondary),
                      ),
                    ],
                    if (device.vendor != null && device.vendor!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        'الجهة المصنعة: ${device.vendor}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xFFCEAE85), // SudaFi Gold
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              // Status Badge with 3 distinct certainty states
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: device.isConfirmedOnline
                      ? const Color(0xFF10B981).withValues(alpha: 0.15)
                      : device.isLeaseOnly
                          ? const Color(0xFFF59E0B).withValues(alpha: 0.15)
                          : Colors.grey.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 5,
                      height: 5,
                      decoration: BoxDecoration(
                        color: device.isConfirmedOnline
                            ? const Color(0xFF10B981)
                            : device.isLeaseOnly
                                ? const Color(0xFFF59E0B)
                                : Colors.grey,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      device.isConfirmedOnline
                          ? 'متصل مؤكد'
                          : device.isLeaseOnly
                              ? 'عقد نشط'
                              : 'غير متصل',
                      style: TextStyle(
                        fontSize: 9.5,
                        fontWeight: FontWeight.bold,
                        color: device.isConfirmedOnline
                            ? const Color(0xFF10B981)
                            : device.isLeaseOnly
                                ? const Color(0xFFF59E0B)
                                : Colors.grey,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),
          Divider(color: context.borderColor, height: 1),
          const SizedBox(height: 10),

          // Metadata: IP, MAC, Interface, Source
          Wrap(
            spacing: 16,
            runSpacing: 8,
            children: [
              // IP Address with tap to copy
              if (device.ipAddress.isNotEmpty)
                InkWell(
                  onTap: () => _copyToClipboard(device.ipAddress, 'عنوان IP'),
                  borderRadius: BorderRadius.circular(6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.link, size: 14, color: context.textSecondary),
                        const SizedBox(width: 4),
                        Text(
                          device.ipAddress,
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF38BDF8),
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(Icons.copy, size: 12, color: context.textSecondary),
                      ],
                    ),
                  ),
                ),

              // MAC Address with tap to copy
              if (device.macAddress.isNotEmpty)
                InkWell(
                  onTap: () => _copyToClipboard(device.macAddress, 'عنوان MAC'),
                  borderRadius: BorderRadius.circular(6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.fingerprint, size: 14, color: context.textSecondary),
                        const SizedBox(width: 4),
                        Text(
                          device.macAddress,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontFamily: 'monospace',
                            color: context.textSecondary,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(Icons.copy, size: 12, color: context.textSecondary),
                      ],
                    ),
                  ),
                ),

              // Interface
              if (device.interfaceName != null && device.interfaceName!.isNotEmpty)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.alt_route, size: 14, color: context.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      'المنفذ: ${device.interfaceName}',
                      style: TextStyle(fontSize: 11, color: context.textSecondary),
                    ),
                  ],
                ),

              // Sources Badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: context.bgCardAlt,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'المصدر: ${device.sources.isNotEmpty ? device.sources.join(' + ') : device.source}',
                  style: TextStyle(
                    fontSize: 9.5,
                    color: context.textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),

              // Discovery Age / Lease Expiry / Uptime
              if (device.age != null && device.age!.isNotEmpty)
                Text(
                  'زمن الاكتشاف: ${device.age}',
                  style: TextStyle(fontSize: 10, color: context.textSecondary),
                ),
              if (device.expiresAfter != null && device.expiresAfter!.isNotEmpty)
                Text(
                  'الصلاحية: ${device.expiresAfter}',
                  style: TextStyle(fontSize: 10, color: context.textSecondary),
                ),
              if (device.uptime != null && device.uptime!.isNotEmpty)
                Text(
                  'مدة التشغيل: ${device.uptime}',
                  style: TextStyle(fontSize: 10, color: context.textSecondary),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyDevicesView(bool wasInitiallyEmpty) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            wasInitiallyEmpty ? Icons.devices_other_rounded : Icons.search_off_rounded,
            size: 48,
            color: context.textSecondary.withValues(alpha: 0.6),
          ),
          const SizedBox(height: 12),
          Text(
            wasInitiallyEmpty
                ? 'لا توجد أجهزة متصلة مكتشفة'
                : 'لا توجد نتائج مطابقة للبحث أو الفلتر',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            wasInitiallyEmpty
                ? 'لم يتم العثور على أجهزة في جدول DHCP Leases أو ARP أو Neighbors على هذا الراوتر.'
                : 'جرب تغيير نص البحث أو اختيار تصنيف آخر.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11.5, color: context.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingView() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 32,
            height: 32,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
          const SizedBox(height: 16),
          Text(
            'جاري فحص الأجهزة المتصلة بالراوتر...',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'يتم استعلام جداول DHCP وARP والجيران اللاسلكيين في RouterOS',
            style: TextStyle(fontSize: 11, color: context.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorView(String routerId, Object error) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          const Icon(Icons.error_outline_rounded, size: 36, color: Color(0xFFEF4444)),
          const SizedBox(height: 10),
          const Text(
            'تعذر جلب الأجهزة المتصلة',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Color(0xFFEF4444),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            error.toString().replaceAll('Exception:', '').trim(),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11.5, color: context.textSecondary),
          ),
          const SizedBox(height: 14),
          ElevatedButton.icon(
            onPressed: () => ref.invalidate(connectedDevicesProvider(routerId)),
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('إعادة المحاولة', style: TextStyle(fontSize: 12)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0284C7),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ],
      ),
    );
  }
}
