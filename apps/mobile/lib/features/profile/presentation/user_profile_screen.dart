import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';
import 'tenant_users_screen.dart';
import 'create_user_dialog.dart';
import '../../studio/presentation/card_templates_screen.dart';
import '../../hotspot_profiles/presentation/hotspot_profiles_screen.dart';

class UserProfileScreen extends ConsumerStatefulWidget {
  const UserProfileScreen({super.key});

  @override
  ConsumerState<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends ConsumerState<UserProfileScreen> {
  bool _isRefreshing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(currentUserProvider.notifier).fetchMe();
    });
  }

  Future<void> _handleRefresh() async {
    setState(() => _isRefreshing = true);
    await ref.read(currentUserProvider.notifier).fetchMe();
    setState(() => _isRefreshing = false);
  }

  void _handleChangePassword() {
    final formKey = GlobalKey<FormState>();
    final currentPassController = TextEditingController();
    final newPassController = TextEditingController();
    final confirmPassController = TextEditingController();
    bool obscureCurrent = true;
    bool obscureNew = true;
    bool isSubmitting = false;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: const [
              Icon(Icons.lock_reset_rounded, color: Color(0xFF38BDF8), size: 22),
              SizedBox(width: 10),
              Text('تغيير كلمة المرور', style: TextStyle(color: Colors.white, fontSize: 16)),
            ],
          ),
          content: SizedBox(
            width: 360,
            child: Form(
              key: formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextFormField(
                      controller: currentPassController,
                      obscureText: obscureCurrent,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'كلمة المرور الحالية *',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                        suffixIcon: IconButton(
                          icon: Icon(obscureCurrent ? Icons.visibility_off : Icons.visibility, color: const Color(0xFF64748B), size: 18),
                          onPressed: () => setDialogState(() => obscureCurrent = !obscureCurrent),
                        ),
                        filled: true,
                        fillColor: const Color(0xFF0F172A),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
                      ),
                      validator: (v) => v == null || v.isEmpty ? 'أدخل كلمة المرور الحالية' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: newPassController,
                      obscureText: obscureNew,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'كلمة المرور الجديدة *',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                        suffixIcon: IconButton(
                          icon: Icon(obscureNew ? Icons.visibility_off : Icons.visibility, color: const Color(0xFF64748B), size: 18),
                          onPressed: () => setDialogState(() => obscureNew = !obscureNew),
                        ),
                        filled: true,
                        fillColor: const Color(0xFF0F172A),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'أدخل كلمة المرور الجديدة';
                        if (v.length < 8) return 'يجب ألا تقل عن 8 خانات';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: confirmPassController,
                      obscureText: obscureNew,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'تأكيد كلمة المرور الجديدة *',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                        filled: true,
                        fillColor: const Color(0xFF0F172A),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
                      ),
                      validator: (v) {
                        if (v != newPassController.text) return 'كلمات المرور غير متطابقة';
                        return null;
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: isSubmitting ? null : () => Navigator.pop(ctx),
              child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
            ),
            ElevatedButton(
              onPressed: isSubmitting
                  ? null
                  : () async {
                      if (!formKey.currentState!.validate()) return;
                      setDialogState(() => isSubmitting = true);

                      final res = await ref.read(currentUserProvider.notifier).changePassword(
                            currentPassword: currentPassController.text,
                            newPassword: newPassController.text,
                          );

                      setDialogState(() => isSubmitting = false);
                      if (!mounted) return;

                      if (res['success'] == true) {
                        if (ctx.mounted) Navigator.pop(ctx);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('تم تغيير كلمة المرور بنجاح!'), backgroundColor: Color(0xFF10B981)),
                          );
                        }
                      } else {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(res['message']?.toString() ?? 'فشل تغيير كلمة المرور'), backgroundColor: const Color(0xFFEF4444)),
                          );
                        }
                      }
                    },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0284C7)),
              child: isSubmitting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('تأكيد التغيير', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  void _handleLogout() async {
    HapticFeedback.mediumImpact();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('تسجيل الخروج', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        content: const Text(
          'هل أنت متأكد من رغبتك في إنهاء الجلسة وتسجيل الخروج؟',
          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8)))),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: const Text('تأكيد الخروج', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(localStorageProvider).clearAuth();
      ref.read(currentUserProvider.notifier).setUser(null);
      if (mounted) Navigator.pop(context);
    }
  }

  String _formatRole(String role) {
    switch (role.toUpperCase()) {
      case 'SUPER_ADMIN':
        return 'مدير المنصة العام (Super Admin)';
      case 'TENANT_ADMIN':
      case 'OWNER':
      case 'ADMIN':
        return 'مالك المنظومة (Tenant Admin)';
      case 'MANAGER':
        return 'مدير فرع / شبكة (Manager)';
      case 'CASHIER':
        return 'كاشير نقطة بيع (Cashier)';
      default:
        return role;
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isTenantAdmin = user != null &&
        (user.role.toUpperCase() == 'TENANT_ADMIN' ||
            user.role.toUpperCase() == 'SUPER_ADMIN' ||
            user.role.toUpperCase() == 'OWNER' ||
            user.role.toUpperCase() == 'ADMIN');

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: const Text(
          'حساب المستخدم والمنظومة',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        actions: [
          IconButton(
            icon: _isRefreshing
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.refresh),
            onPressed: _isRefreshing ? null : _handleRefresh,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // User Profile Header Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 34,
                  backgroundColor: const Color(0xFF2563EB).withValues(alpha: 0.2),
                  child: const Icon(Icons.person, size: 38, color: Color(0xFF38BDF8)),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.fullName.isNotEmpty == true ? user!.fullName : 'مستخدم المنظومة',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        user?.email ?? '',
                        style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0284C7).withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFF0284C7)),
                        ),
                        child: Text(
                          _formatRole(user?.role ?? 'CASHIER'),
                          style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Organization & User Details
          _buildSectionHeader('بيانات الحساب والمؤسسة:', Icons.business),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              children: [
                _buildInfoRow('اسم المؤسسة / المستأجر', user?.tenantName ?? 'منظومة ميكروتك الذكية', Icons.apartment),
                const Divider(color: Color(0xFF334155), height: 20),
                _buildInfoRow('معرف المستأجر (Tenant ID)', user?.tenantId ?? 'tenant-active', Icons.fingerprint),
                const Divider(color: Color(0xFF334155), height: 20),
                _buildInfoRow('العملة المعتمدة', user?.currency ?? 'SDG (جنيه سوداني)', Icons.monetization_on_outlined),
                const Divider(color: Color(0xFF334155), height: 20),
                _buildInfoRow('حالة الحساب', 'نشط ومفعل (ACTIVE)', Icons.verified_user_outlined, valueColor: const Color(0xFF10B981)),
                if (user?.phone != null && user!.phone!.isNotEmpty) ...[
                  const Divider(color: Color(0xFF334155), height: 20),
                  _buildInfoRow('رقم الهاتف المسجل', user.phone!, Icons.phone_outlined),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),

          // User Management & Creation Section (Feature 4 - Visible to Admins)
          if (isTenantAdmin) ...[
            _buildSectionHeader('إدارة الموظفين وصلاحيات المستخدمين:', Icons.admin_panel_settings),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF0284C7).withValues(alpha: 0.2)),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => CreateUserDialog.show(context),
                          icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                          label: const Text('إضافة مستخدم جديد'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF10B981),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const TenantUsersScreen()),
                            );
                          },
                          icon: const Icon(Icons.people_alt_outlined, size: 18, color: Color(0xFF38BDF8)),
                          label: const Text('عرض المستخدمين', style: TextStyle(color: Color(0xFF38BDF8))),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(color: Color(0xFF0284C7)),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'يمكنك إنشاء حسابات جديدة لموظفي الكاشير أو مديري الفروع ومنحهم صلاحيات فورية.',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],

          // Quick Management Hub
          _buildSectionHeader('أدوات التخصيص والشبكة:', Icons.tune),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.style_outlined, color: Color(0xFFA78BFA)),
                  title: const Text('قوالب وتصاميم الطباعة', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: const Text('تعديل القوالب يدويًا أو استيراد قالب من ملفات الجهاز', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: Color(0xFF64748B)),
                  onTap: () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const CardTemplatesScreen()));
                  },
                ),
                const Divider(color: Color(0xFF334155), height: 1),
                ListTile(
                  leading: const Icon(Icons.speed_outlined, color: Color(0xFF38BDF8)),
                  title: const Text('بروفايلات وسرعات الهوتسبوت', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: const Text('إنشاء باقات جديدة ومزامنتها مع أجهزة ميكروتك', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: Color(0xFF64748B)),
                  onTap: () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const HotspotProfilesScreen()));
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Security & Password Section
          _buildSectionHeader('الأمان والجلسة:', Icons.shield_outlined),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.lock_outline, color: Color(0xFFFBBF24)),
                  title: const Text('كلمة المرور', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: const Text('تحديث كلمة المرور الخاصة بحسابك بأمان', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  trailing: OutlinedButton(
                    onPressed: _handleChangePassword,
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Color(0xFFF59E0B)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('تغيير', style: TextStyle(color: Color(0xFFFBBF24), fontSize: 12)),
                  ),
                ),
                const Divider(color: Color(0xFF334155), height: 20),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.logout_rounded, color: Color(0xFFEF4444)),
                  title: const Text('تسجيل الخروج', style: TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: const Text('إنهاء الجلسة الحالية وحفظ العمليات غير المتزامنة بأمان', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  onTap: _handleLogout,
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 18, color: const Color(0xFF38BDF8)),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
        ),
      ],
    );
  }

  Widget _buildInfoRow(String label, String value, IconData icon, {Color? valueColor}) {
    return Row(
      children: [
        Icon(icon, size: 16, color: const Color(0xFF64748B)),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
        const Spacer(),
        Text(
          value,
          style: TextStyle(color: valueColor ?? Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
        ),
      ],
    );
  }
}
