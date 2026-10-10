import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import 'create_user_dialog.dart';

class TenantUsersScreen extends ConsumerStatefulWidget {
  const TenantUsersScreen({super.key});

  @override
  ConsumerState<TenantUsersScreen> createState() => _TenantUsersScreenState();
}

class _TenantUsersScreenState extends ConsumerState<TenantUsersScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _handleDeleteUser(UserModel u) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('تأكيد حذف المستخدم', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: Text(
          'هل أنت متأكد من حذف حساب «${u.fullName}» (${u.email})؟ سيفقد المستخدم إمكانية الدخول للنظام فوراً.',
          style: const TextStyle(color: Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8)))),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: const Text('حذف الحساب', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final res = await ref.read(tenantUsersProvider.notifier).deleteUser(u.id);
      if (!mounted) return;

      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم حذف حساب المستخدم بنجاح'), backgroundColor: Color(0xFF10B981)),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['message']?.toString() ?? 'فشل حذف المستخدم'), backgroundColor: const Color(0xFFEF4444)),
        );
      }
    }
  }

  String _formatRole(String role) {
    switch (role.toUpperCase()) {
      case 'SUPER_ADMIN':
        return 'مدير المنصة الرئيسي';
      case 'TENANT_ADMIN':
      case 'OWNER':
      case 'ADMIN':
        return 'مالك / مدير المنظومة';
      case 'MANAGER':
        return 'مدير فرع / شبكة';
      case 'CASHIER':
        return 'كاشير نقطة بيع';
      default:
        return role;
    }
  }

  Color _roleColor(String role) {
    switch (role.toUpperCase()) {
      case 'SUPER_ADMIN':
      case 'TENANT_ADMIN':
      case 'OWNER':
      case 'ADMIN':
        return const Color(0xFFF59E0B);
      case 'MANAGER':
        return const Color(0xFF38BDF8);
      case 'CASHIER':
      default:
        return const Color(0xFF10B981);
    }
  }

  @override
  Widget build(BuildContext context) {
    final usersAsync = ref.watch(tenantUsersProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: const Text(
          'مستخدمو المنظومة والموظفون',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث',
            onPressed: () => ref.read(tenantUsersProvider.notifier).refresh(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Header Action Banner
          Container(
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
              color: Color(0xFF1E293B),
              border: Border(bottom: BorderSide(color: Color(0xFF334155))),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          final created = await CreateUserDialog.show(context);
                          if (created == true) {
                            ref.read(tenantUsersProvider.notifier).refresh();
                          }
                        },
                        icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                        label: const Text('إضافة مستخدم جديد'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _searchController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'بحث باسم الموظف أو البريد...',
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
                    fillColor: const Color(0xFF0F172A),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF38BDF8))),
                  ),
                  onChanged: (v) => setState(() => _searchQuery = v.trim().toLowerCase()),
                ),
              ],
            ),
          ),

          // Users List
          Expanded(
            child: usersAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF38BDF8))),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Color(0xFFEF4444)),
                      const SizedBox(height: 12),
                      Text('فشل تحميل المستخدمين: $err', style: const TextStyle(color: Color(0xFF94A3B8)), textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () => ref.read(tenantUsersProvider.notifier).refresh(),
                        child: const Text('إعادة المحاولة'),
                      ),
                    ],
                  ),
                ),
              ),
              data: (users) {
                final filtered = users.where((u) {
                  return _searchQuery.isEmpty ||
                      u.fullName.toLowerCase().contains(_searchQuery) ||
                      u.email.toLowerCase().contains(_searchQuery);
                }).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.people_outline, size: 64, color: Colors.white.withValues(alpha: 0.2)),
                          const SizedBox(height: 16),
                          const Text('لا يوجد مستخدمون مسجلون', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          const Text('يمكنك إضافة كاشير أو مدير لفرعك عبر زر «إضافة مستخدم جديد» بالأعلى.', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13), textAlign: TextAlign.center),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.all(14),
                  itemCount: filtered.length,
                  itemBuilder: (ctx, idx) {
                    final u = filtered[idx];
                    final roleColor = _roleColor(u.role);

                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFF334155)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          // User Avatar
                          CircleAvatar(
                            radius: 24,
                            backgroundColor: roleColor.withValues(alpha: 0.2),
                            child: Icon(Icons.person, color: roleColor, size: 26),
                          ),
                          const SizedBox(width: 14),

                          // User Info
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        u.fullName,
                                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: roleColor.withValues(alpha: 0.2),
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(color: roleColor),
                                      ),
                                      child: Text(
                                        _formatRole(u.role),
                                        style: TextStyle(color: roleColor, fontSize: 10, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  u.email,
                                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                                ),
                                if (u.phone != null && u.phone!.isNotEmpty) ...[
                                  const SizedBox(height: 2),
                                  Text(
                                    'الهاتف: ${u.phone}',
                                    style: const TextStyle(color: Color(0xFF64748B), fontSize: 11),
                                  ),
                                ],
                                if (u.createdAt != null) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    'تاريخ الإضافة: ${DateFormat('yyyy-MM-dd').format(u.createdAt!)}',
                                    style: const TextStyle(color: Color(0xFF475569), fontSize: 10),
                                  ),
                                ],
                              ],
                            ),
                          ),

                          // Delete Action (Only for non-admin accounts)
                          if (!u.role.toUpperCase().contains('ADMIN'))
                            IconButton(
                              icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444), size: 20),
                              tooltip: 'حذف المستخدم',
                              onPressed: () => _handleDeleteUser(u),
                            ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
