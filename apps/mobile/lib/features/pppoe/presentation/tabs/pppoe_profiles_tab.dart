import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers.dart';
import '../dialogs/create_edit_pppoe_profile_dialog.dart';

class PppoeProfilesTab extends ConsumerStatefulWidget {
  const PppoeProfilesTab({super.key});

  @override
  ConsumerState<PppoeProfilesTab> createState() => _PppoeProfilesTabState();
}

class _PppoeProfilesTabState extends ConsumerState<PppoeProfilesTab> {
  void _showCreateEditDialog([PppoeProfileModel? profile]) {
    showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => CreateEditPppoeProfileDialog(existingProfile: profile),
    );
  }

  void _handleSyncProfile(PppoeProfileModel profile) async {
    final res = await ref.read(pppoeProfilesProvider.notifier).syncProfile(profile.id, profile.name);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(res['message']?.toString() ?? 'تم إرسال أمر المزامنة'),
        backgroundColor: res['success'] == true ? const Color(0xFF10B981) : const Color(0xFFEF4444),
      ),
    );
  }

  void _handleDeleteProfile(PppoeProfileModel profile) async {
    if (profile.accountsCount > 0) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('تعذر حذف البروفايل', style: TextStyle(color: Colors.white, fontSize: 16)),
          content: Text(
            'لا يمكن حذف البروفايل «${profile.name}» لوجود (${profile.accountsCount}) مشتركين مرتبطين به حالياً. يرجى نقل المشتركين أو حذفهم أولاً.',
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
          ),
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx),
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF334155)),
              child: const Text('حسناً', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('تأكيد حذف البروفايل', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: Text(
          'هل أنت متأكد من حذف بروفايل السرعة «${profile.name}»؟ سيتم حذفه من قاعدة البيانات.',
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: const Text('حذف البروفايل', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final res = await ref.read(pppoeProfilesProvider.notifier).deleteProfile(profile.id, profile.name);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(res['message']?.toString() ?? 'تم حذف البروفايل'),
        backgroundColor: res['success'] == true ? const Color(0xFF10B981) : const Color(0xFFEF4444),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profilesAsync = ref.watch(pppoeProfilesProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: const Color(0xFF06B6D4),
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text(
          'إضافة بروفايل',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: profilesAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Color(0xFF06B6D4)),
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
                  'تعذر تحميل بروفايلات PPPoE: $err',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFFF87171), fontSize: 13),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () => ref.read(pppoeProfilesProvider.notifier).refresh(),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF334155)),
                  child: const Text('إعادة المحاولة', style: TextStyle(color: Colors.white)),
                ),
              ],
            ),
          ),
        ),
        data: (profiles) {
          if (profiles.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.layers_outlined, color: Color(0xFF475569), size: 48),
                  const SizedBox(height: 12),
                  const Text(
                    'لا توجد بروفايلات PPPoE مضافة',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'انقر على "إضافة بروفايل" لإنشاء باقة سرعة ومزامنتها على الراوتر',
                    style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            color: const Color(0xFF06B6D4),
            backgroundColor: const Color(0xFF1E293B),
            onRefresh: () => ref.read(pppoeProfilesProvider.notifier).refresh(),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
              itemCount: profiles.length,
              itemBuilder: (context, index) {
                final p = profiles[index];
                return _buildProfileCard(p);
              },
            ),
          );
        },
      ),
    );
  }

  Widget _buildProfileCard(PppoeProfileModel p) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Name, rate limit pill, actions
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF06B6D4).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.layers, color: Color(0xFF06B6D4), size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (p.description != null && p.description!.isNotEmpty)
                        Text(
                          p.description!,
                          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),

                // Accounts count badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.people_alt, color: Color(0xFF38BDF8), size: 13),
                      const SizedBox(width: 4),
                      Text(
                        '${p.accountsCount}',
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),

                const SizedBox(width: 6),

                // Actions Menu
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_vert, color: Color(0xFF94A3B8), size: 20),
                  color: const Color(0xFF1E293B),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: const BorderSide(color: Color(0xFF334155)),
                  ),
                  onSelected: (val) {
                    if (val == 'edit') {
                      _showCreateEditDialog(p);
                    } else if (val == 'sync') {
                      _handleSyncProfile(p);
                    } else if (val == 'delete') {
                      _handleDeleteProfile(p);
                    }
                  },
                  itemBuilder: (ctx) => [
                    const PopupMenuItem(
                      value: 'edit',
                      child: Row(
                        children: [
                          Icon(Icons.edit_outlined, color: Color(0xFF38BDF8), size: 18),
                          SizedBox(width: 8),
                          Text('تعديل الإعدادات', style: TextStyle(color: Colors.white, fontSize: 13)),
                        ],
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'sync',
                      child: Row(
                        children: [
                          Icon(Icons.sync, color: Color(0xFF10B981), size: 18),
                          SizedBox(width: 8),
                          Text('مزامنة مع الراوتر', style: TextStyle(color: Color(0xFF34D399), fontSize: 13)),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          Icon(Icons.delete_outline, color: p.accountsCount > 0 ? const Color(0xFF64748B) : const Color(0xFFEF4444), size: 18),
                          const SizedBox(width: 8),
                          Text(
                            'حذف البروفايل',
                            style: TextStyle(
                              color: p.accountsCount > 0 ? const Color(0xFF64748B) : const Color(0xFFF87171),
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 12),
            const Divider(color: Color(0xFF334155), height: 1),
            const SizedBox(height: 12),

            // Speed limit & Price
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.speed, color: Color(0xFFF59E0B), size: 16),
                    const SizedBox(width: 6),
                    Text(
                      p.rateLimit ?? 'بدون تحديد سرعة',
                      style: const TextStyle(
                        color: Color(0xFFF59E0B),
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
                Text(
                  '${p.price.toStringAsFixed(0)} ج.س / شهر',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 8),

            // Network addresses
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                if (p.localAddress != null && p.localAddress!.isNotEmpty)
                  _buildTag('بوابة: ${p.localAddress}'),
                if (p.remoteAddress != null && p.remoteAddress!.isNotEmpty)
                  _buildTag('مسبح: ${p.remoteAddress}'),
                if (p.onlyOne)
                  _buildTag('جلسة أحادية (Only-One)'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTag(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Text(
        text,
        style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontFamily: 'monospace'),
      ),
    );
  }
}
