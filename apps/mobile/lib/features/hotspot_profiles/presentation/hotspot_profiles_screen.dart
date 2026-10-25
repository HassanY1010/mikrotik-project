import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import 'create_hotspot_profile_screen.dart';
import '../../../core/utils/validity_helper.dart';

class HotspotProfilesScreen extends ConsumerStatefulWidget {
  const HotspotProfilesScreen({super.key});

  @override
  ConsumerState<HotspotProfilesScreen> createState() => _HotspotProfilesScreenState();
}

class _HotspotProfilesScreenState extends ConsumerState<HotspotProfilesScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String? _selectedRouterFilter;
  bool _isSyncing = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _handleSyncRouter(List<RouterDeviceModel> routers) async {
    if (routers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('لا توجد راوترات مضافة للمزامنة')),
      );
      return;
    }

    final selectedRouter = await showDialog<RouterDeviceModel>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('اختر الراوتر لمزامنة الباقات', style: TextStyle(color: context.textPrimary, fontSize: 16)),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: routers.length,
            itemBuilder: (ctx, idx) {
              final r = routers[idx];
              return ListTile(
                leading: Icon(Icons.router, color: r.isOnline ? const Color(0xFF10B981) : const Color(0xFFEF4444)),
                title: Text(r.name, style: TextStyle(color: context.textPrimary)),
                subtitle: Text(r.host, style: TextStyle(color: context.textSecondary)),
                onTap: () => Navigator.pop(ctx, r),
              );
            },
          ),
        ),
      ),
    );

    if (selectedRouter != null) {
      setState(() => _isSyncing = true);
      final res = await ref.read(profilesProvider.notifier).syncProfilesWithRouter(selectedRouter.id);
      setState(() => _isSyncing = false);
      if (!mounted) return;

      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تمت مزامنة الباقات من راوتر ميكروتك بنجاح!'), backgroundColor: Color(0xFF10B981)),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['message']?.toString() ?? 'فشل المزامنة'), backgroundColor: const Color(0xFFEF4444)),
        );
      }
    }
  }

  void _handleDelete(HotspotProfileModel p) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('تأكيد حذف الباقة', style: TextStyle(color: context.textPrimary, fontSize: 16)),
        content: Text(
          'هل أنت متأكد من حذف الباقة «${p.displayName ?? p.name}»؟ سيتم حذفها من المنظومة ومن راوتر ميكروتك.',
          style: TextStyle(color: context.textSecondary),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8)))),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: const Text('حذف الباقة', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final res = await ref.read(profilesProvider.notifier).deleteProfile(p.id);
      if (!mounted) return;
      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم حذف الباقة بنجاح من النظام والراوتر'), backgroundColor: Color(0xFF10B981)),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['message']?.toString() ?? 'فشل حذف الباقة'), backgroundColor: const Color(0xFFEF4444)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final profiles = ref.watch(profilesProvider);
    final routersAsync = ref.watch(routersProvider);
    final routers = routersAsync.value ?? [];

    final filtered = profiles.where((p) {
      final matchSearch = _searchQuery.isEmpty ||
          p.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          (p.displayName ?? '').toLowerCase().contains(_searchQuery.toLowerCase());
      final matchRouter = _selectedRouterFilter == null || p.deviceId == _selectedRouterFilter;
      return matchSearch && matchRouter;
    }).toList();

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: Text(
          'بروفايلات',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: context.textPrimary),
        ),
        actions: [
          IconButton(
            icon: _isSyncing
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.sync_rounded),
            tooltip: 'مزامنة من الراوتر',
            onPressed: _isSyncing ? null : () => _handleSyncRouter(routers),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث',
            onPressed: () => ref.read(profilesProvider.notifier).fetchProfiles(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Top Bar with Actions & Search
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.bgCard,
              border: Border(bottom: BorderSide(color: context.borderColor)),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          final created = await Navigator.push<dynamic>(
                            context,
                            MaterialPageRoute(builder: (_) => const CreateHotspotProfileScreen()),
                          );
                          if (created != null && created != false) {
                            ref.read(profilesProvider.notifier).fetchProfiles();
                          }
                        },
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('إنشاء باقة جديدة'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF10B981),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    OutlinedButton.icon(
                      onPressed: _isSyncing ? null : () => _handleSyncRouter(routers),
                      icon: const Icon(Icons.download_rounded, size: 18, color: Color(0xFF38BDF8)),
                      label: const Text('مزامنة الراوتر', style: TextStyle(color: Color(0xFF38BDF8))),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Color(0xFF0284C7)),
                        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Search Bar
                TextField(
                  controller: _searchController,
                  cursorColor: context.textPrimary,
                  style: TextStyle(color: context.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'بحث عن باقة أو سرعة...',
                    hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
                    prefixIcon: const Icon(Icons.search, color: Color(0xFF64748B), size: 20),
                    suffixIcon: _searchQuery.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, color: Color(0xFF64748B), size: 18),
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _searchQuery = '');
                            },
                          )
                        : null,
                    filled: true,
                    fillColor: context.bgScaffold,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: context.borderColor)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: context.borderColor)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF38BDF8))),
                  ),
                  onChanged: (v) => setState(() => _searchQuery = v.trim()),
                ),
              ],
            ),
          ),

          // Profiles List
          Expanded(
            child: filtered.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.wifi_tethering_off, size: 64, color: context.textMuted.withValues(alpha: 0.4)),
                          const SizedBox(height: 16),
                          Text('لا توجد باقات هوتسبوت مسجلة', style: TextStyle(color: context.textPrimary, fontSize: 17, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          Text('يمكنك إنشاء باقة سرعة ووقت جديدة أو مزامنة الباقات من راوتر ميكروتك.', style: TextStyle(color: context.textSecondary, fontSize: 13), textAlign: TextAlign.center),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(14),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, idx) {
                      final p = filtered[idx];

                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: context.bgCard,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: context.borderColor),
                        ),
                        child: Column(
                          children: [
                            Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Icon Badge
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF0284C7).withValues(alpha: 0.2),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: const Color(0xFF0284C7).withValues(alpha: 0.2)),
                                    ),
                                    child: const Icon(Icons.speed, color: Color(0xFF38BDF8), size: 22),
                                  ),
                                  const SizedBox(width: 12),

                                  // Profile Details
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Expanded(
                                              child: Text(
                                                p.displayName ?? p.name,
                                                style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 15),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                              decoration: BoxDecoration(
                                                color: context.amberColor.withValues(alpha: 0.15),
                                                borderRadius: BorderRadius.circular(12),
                                                border: Border.all(color: context.amberColor.withValues(alpha: 0.4)),
                                              ),
                                              child: Text(
                                                '${p.price.toStringAsFixed(0)} SDG',
                                                style: TextStyle(color: context.amberColor, fontWeight: FontWeight.bold, fontSize: 12),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          'المعرف في الراوتر: ${p.name}',
                                          style: TextStyle(color: context.textSecondary, fontSize: 11, fontFamily: 'monospace'),
                                        ),
                                        const SizedBox(height: 8),

                                        // Badges Row
                                        Wrap(
                                          spacing: 6,
                                          runSpacing: 6,
                                          children: [
                                            if (p.isOpenCard)
                                              _buildBadge('♾️ كرت مفتوح (بدون حد/مدة)', const Color(0xFF10B981))
                                            else if (p.isUnlimited)
                                              _buildBadge('🌐 باقة مفتوحة البيانات', const Color(0xFF10B981))
                                            else
                                              _buildBadge(
                                                '📦 ${p.formattedDataLimit}',
                                                const Color(0xFFEC4899),
                                              ),
                                            if (p.rateLimit != null)
                                              _buildBadge('⚡ ${p.rateLimit}', const Color(0xFF38BDF8)),
                                            if (p.validity != null && !p.isOpenCard)
                                              _buildBadge('⏳ ${formatValidityArabic(p.validity)}', const Color(0xFF10B981)),
                                            _buildBadge('🎟️ كروت جاهزة: ${p.availableCards}', const Color(0xFFA78BFA)),
                                            if (p.deviceName != null)
                                              _buildBadge('📡 ${p.deviceName}', const Color(0xFFF97316)),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            Divider(color: context.borderColor, height: 1),

                            // Actions
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  TextButton.icon(
                                    onPressed: () async {
                                      final updated = await Navigator.push<dynamic>(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) => CreateHotspotProfileScreen(editProfile: p),
                                        ),
                                      );
                                      if (updated != null && updated != false) {
                                        ref.read(profilesProvider.notifier).fetchProfiles();
                                      }
                                    },
                                    icon: Icon(Icons.edit_outlined, size: 16, color: context.skyColor),
                                    label: Text('تعديل الباقة', style: TextStyle(color: context.skyColor, fontSize: 12)),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline, size: 18, color: Color(0xFFEF4444)),
                                    tooltip: 'حذف',
                                    onPressed: () => _handleDelete(p),
                                  ),
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

  Widget _buildBadge(String text, Color color) {
    final textColor = context.isDarkMode
        ? color
        : (color == const Color(0xFF38BDF8)
            ? const Color(0xFF0284C7)
            : color == const Color(0xFF10B981)
                ? const Color(0xFF047857)
                : color == const Color(0xFFA78BFA)
                    ? const Color(0xFF6D28D9)
                    : color == const Color(0xFFF97316)
                        ? const Color(0xFFC2410C)
                        : color == const Color(0xFFEC4899)
                            ? const Color(0xFFBE185D)
                            : color);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: context.isDarkMode ? color.withValues(alpha: 0.2) : color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: context.isDarkMode ? 0.3 : 0.25)),
      ),
      child: Text(
        text,
        style: TextStyle(color: textColor, fontSize: 10, fontWeight: FontWeight.w600),
      ),
    );
  }
}
