import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import 'tenant_users_screen.dart';
import 'create_user_dialog.dart';
import '../../studio/presentation/card_templates_screen.dart';
import '../../hotspot_profiles/presentation/hotspot_profiles_screen.dart';
import '../../../core/widgets/whatsapp_button.dart';
import '../../../core/utils/whatsapp_helper.dart';

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
    ref.invalidate(tenantQuotaProvider);
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
          backgroundColor: ctx.bgCard,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              const Icon(Icons.lock_reset_rounded, color: Color(0xFF38BDF8), size: 22),
              const SizedBox(width: 10),
              Text('تغيير كلمة المرور', style: TextStyle(color: ctx.textPrimary, fontSize: 16)),
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
                      style: TextStyle(color: ctx.textPrimary, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'كلمة المرور الحالية *',
                        labelStyle: TextStyle(color: ctx.textSecondary, fontSize: 12),
                        suffixIcon: IconButton(
                          icon: Icon(obscureCurrent ? Icons.visibility_off : Icons.visibility, color: ctx.textSecondary, size: 18),
                          onPressed: () => setDialogState(() => obscureCurrent = !obscureCurrent),
                        ),
                        filled: true,
                        fillColor: ctx.bgCardAlt,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ctx.borderColor)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ctx.borderColor)),
                      ),
                      validator: (v) => v == null || v.isEmpty ? 'أدخل كلمة المرور الحالية' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: newPassController,
                      obscureText: obscureNew,
                      style: TextStyle(color: ctx.textPrimary, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'كلمة المرور الجديدة *',
                        labelStyle: TextStyle(color: ctx.textSecondary, fontSize: 12),
                        suffixIcon: IconButton(
                          icon: Icon(obscureNew ? Icons.visibility_off : Icons.visibility, color: ctx.textSecondary, size: 18),
                          onPressed: () => setDialogState(() => obscureNew = !obscureNew),
                        ),
                        filled: true,
                        fillColor: ctx.bgCardAlt,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ctx.borderColor)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ctx.borderColor)),
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
                      style: TextStyle(color: ctx.textPrimary, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'تأكيد كلمة المرور الجديدة *',
                        labelStyle: TextStyle(color: ctx.textSecondary, fontSize: 12),
                        filled: true,
                        fillColor: ctx.bgCardAlt,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ctx.borderColor)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ctx.borderColor)),
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
              child: Text('إلغاء', style: TextStyle(color: ctx.textSecondary)),
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
        backgroundColor: ctx.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('تسجيل الخروج', style: TextStyle(color: ctx.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
        content: Text(
          'هل أنت متأكد من رغبتك في إنهاء الجلسة وتسجيل الخروج؟',
          style: TextStyle(color: ctx.textSecondary, fontSize: 13),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('إلغاء', style: TextStyle(color: ctx.textSecondary))),
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

  void _handleDeleteAccount() async {
    HapticFeedback.heavyImpact();
    final formKey = GlobalKey<FormState>();
    final passwordController = TextEditingController();
    final reasonController = TextEditingController();
    final currentUser = ref.read(currentUserProvider);
    final isTenantAdmin = currentUser != null &&
        (currentUser.role.toUpperCase() == 'TENANT_ADMIN' ||
            currentUser.role.toUpperCase() == 'OWNER' ||
            currentUser.role.toUpperCase() == 'ADMIN');
    bool confirmDeleteOrg = false;
    bool obscurePassword = true;
    bool isAgreed = false;
    bool isSubmitting = false;
    String? dialogError;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: ctx.bgCard,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 24),
              const SizedBox(width: 8),
              Text(
                'حذف الحساب نهائيًا',
                style: TextStyle(color: ctx.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: SizedBox(
            width: 380,
            child: Form(
              key: formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF7F1D1D).withValues(alpha: 0.25),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.5)),
                      ),
                      child: const Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.error_outline_rounded, color: Color(0xFFF87171), size: 20),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'تحذير شديد الأهمية: هذا الإجراء نهائي ولا يمكن التراجع عنه بأي شكل! سيتم حذف حسابك وإلغاء جميع الجلسات والرموز التابعة له.',
                              style: TextStyle(color: Color(0xFFFECACA), fontSize: 12, height: 1.4),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: passwordController,
                      obscureText: obscurePassword,
                      style: TextStyle(color: ctx.textPrimary, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'كلمة المرور الحالية لتأكيد الهوية *',
                        labelStyle: TextStyle(color: ctx.textSecondary, fontSize: 12),
                        suffixIcon: IconButton(
                          icon: Icon(
                            obscurePassword ? Icons.visibility_off : Icons.visibility,
                            color: ctx.textSecondary,
                            size: 18,
                          ),
                          onPressed: () => setDialogState(() => obscurePassword = !obscurePassword),
                        ),
                        filled: true,
                        fillColor: ctx.bgCardAlt,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: ctx.borderColor),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: ctx.borderColor),
                        ),
                      ),
                      validator: (v) => v == null || v.isEmpty ? 'يرجى إدخال كلمة المرور لتأكيد الحذف' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: reasonController,
                      style: TextStyle(color: ctx.textPrimary, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'سبب حذف الحساب (اختياري)',
                        labelStyle: TextStyle(color: ctx.textSecondary, fontSize: 12),
                        filled: true,
                        fillColor: ctx.bgCardAlt,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: ctx.borderColor),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: ctx.borderColor),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: isAgreed,
                      activeColor: const Color(0xFFDC2626),
                      checkColor: Colors.white,
                      onChanged: isSubmitting
                          ? null
                          : (val) => setDialogState(() => isAgreed = val ?? false),
                      title: const Text(
                        'أقر وأؤكد بأنني أرغب بحذف حسابي نهائيًا وأعلم بعدم إمكانية استرجاعه',
                        style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 11.5, fontWeight: FontWeight.w600),
                      ),
                      controlAffinity: ListTileControlAffinity.leading,
                    ),
                    if (isTenantAdmin) ...[
                      const SizedBox(height: 6),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: confirmDeleteOrg,
                        activeColor: const Color(0xFFDC2626),
                        checkColor: Colors.white,
                        onChanged: isSubmitting
                            ? null
                            : (val) => setDialogState(() => confirmDeleteOrg = val ?? false),
                        title: const Text(
                          'أوافق على حذف المنظومة وجميع أجهزة MikroTik وكروت الهوتسبوت في حال كنت المالك الوحيد',
                          style: TextStyle(color: Color(0xFFFCA5A5), fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                        controlAffinity: ListTileControlAffinity.leading,
                      ),
                    ],
                    if (dialogError != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF450A0A),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFDC2626)),
                        ),
                        child: Text(
                          dialogError!,
                          style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 12),
                        ),
                      ),
                    ],
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
              onPressed: (!isAgreed || isSubmitting)
                  ? null
                  : () async {
                      if (!formKey.currentState!.validate()) return;
                      setDialogState(() {
                        isSubmitting = true;
                        dialogError = null;
                      });

                      final res = await ref.read(currentUserProvider.notifier).deleteAccount(
                            password: passwordController.text,
                            reason: reasonController.text,
                            confirmDeleteOrganization: isTenantAdmin ? confirmDeleteOrg : null,
                          );

                      if (!mounted) return;

                      if (res['success'] == true) {
                        if (ctx.mounted) Navigator.pop(ctx);
                        await ref.read(localStorageProvider).clearAuth();
                        ref.read(currentUserProvider.notifier).setUser(null);
                        if (mounted) {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('تم حذف حسابك نهائيًا بنجاح.'),
                              backgroundColor: Color(0xFF10B981),
                            ),
                          );
                        }
                      } else {
                        setDialogState(() {
                          isSubmitting = false;
                          dialogError = res['message']?.toString() ?? 'فشل حذف الحساب';
                        });
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626),
                disabledBackgroundColor: const Color(0xFF7F1D1D).withValues(alpha: 0.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: isSubmitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text(
                      'حذف الحساب نهائيًا',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    ),
            ),
          ],
        ),
      ),
    );
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
    final quotaAsync = ref.watch(tenantQuotaProvider);
    final isTenantAdmin = user != null &&
        (user.role.toUpperCase() == 'TENANT_ADMIN' ||
            user.role.toUpperCase() == 'SUPER_ADMIN' ||
            user.role.toUpperCase() == 'OWNER' ||
            user.role.toUpperCase() == 'ADMIN');

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: Text(
          'حساب المستخدم والمنظومة',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: context.textPrimary),
        ),
        actions: [
          IconButton(
            icon: Icon(
              ref.watch(themeModeProvider) == ThemeMode.light
                  ? Icons.dark_mode_outlined
                  : Icons.light_mode_outlined,
              color: const Color(0xFFF59E0B),
            ),
            tooltip: 'تبديل المظهر',
            onPressed: () {
              ref.read(themeModeProvider.notifier).toggleTheme();
            },
          ),
          IconButton(
            icon: _isRefreshing
                ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: context.textPrimary))
                : Icon(Icons.refresh, color: context.textPrimary),
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
              gradient: LinearGradient(
                colors: context.isDarkMode
                    ? const [Color(0xFF1E293B), Color(0xFF0F172A)]
                    : const [Colors.white, Color(0xFFF1F5F9)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: context.borderColor),
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
                        style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 18),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        user?.email ?? '',
                        style: TextStyle(color: context.textSecondary, fontSize: 13),
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

          // SaaS Subscription & Card Quota Details
          _buildSubscriptionQuotaCard(quotaAsync),
          const SizedBox(height: 20),

          // Organization & User Details
          _buildSectionHeader('بيانات الحساب والمؤسسة:', Icons.business),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              children: [
                _buildInfoRow('اسم المؤسسة / المستأجر', user?.tenantName ?? 'منظومة ميكروتك الذكية', Icons.apartment),
                Divider(color: context.borderColor, height: 20),
                _buildInfoRow('معرف المستأجر (Tenant ID)', user?.tenantId ?? 'tenant-active', Icons.fingerprint),
                Divider(color: context.borderColor, height: 20),
                _buildInfoRow('العملة المعتمدة', user?.currency ?? 'SDG (جنيه سوداني)', Icons.monetization_on_outlined),
                Divider(color: context.borderColor, height: 20),
                _buildInfoRow('حالة الحساب', 'نشط ومفعل (ACTIVE)', Icons.verified_user_outlined, valueColor: const Color(0xFF10B981)),
                if (user?.phone != null && user!.phone!.isNotEmpty) ...[
                  Divider(color: context.borderColor, height: 20),
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
                color: context.bgCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: context.borderColor),
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
                  Text(
                    'يمكنك إنشاء حسابات جديدة لموظفي الكاشير أو مديري الفروع ومنحهم صلاحيات فورية.',
                    style: TextStyle(color: context.textSecondary, fontSize: 11),
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.style_outlined, color: Color(0xFFA78BFA)),
                  title: Text('قوالب وتصاميم الطباعة', style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: Text('اختيار وتخصيص القوالب الجاهزة ومقاسات الطباعة', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: Color(0xFF64748B)),
                  onTap: () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const CardTemplatesScreen()));
                  },
                ),
                Divider(color: context.borderColor, height: 1),
                ListTile(
                  leading: const Icon(Icons.speed_outlined, color: Color(0xFF38BDF8)),
                  title: Text('بروفايلات', style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: Text('إنشاء باقات جديدة ومزامنتها مع أجهزة MikroTik', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: Color(0xFF64748B)),
                  onTap: () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const HotspotProfilesScreen()));
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Appearance & Theme Mode Section
          _buildSectionHeader('مظهر التطبيق والسمة:', Icons.palette_outlined),
          const SizedBox(height: 10),
          _buildThemeSelectorCard(),
          const SizedBox(height: 24),

          // Technical Support & Help Section
          _buildSectionHeader('المساعدة والدعم الفني:', Icons.support_agent_rounded),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF25D366).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.headset_mic_rounded, color: Color(0xFF25D366), size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'الدعم الفني المباشر',
                            style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'فريق خدمة عملاء SudaFi متاح لمساعدتك عبر واتساب',
                            style: TextStyle(color: context.textSecondary, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const WhatsAppButton(
                  type: WhatsAppActionType.support,
                  label: 'تواصل مع الدعم الفني',
                  showPhonePill: true,
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.lock_outline, color: Color(0xFFFBBF24)),
                  title: Text('كلمة المرور', style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: Text('تحديث كلمة المرور الخاصة بحسابك بأمان', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                  trailing: OutlinedButton(
                    onPressed: _handleChangePassword,
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Color(0xFFF59E0B)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('تغيير', style: TextStyle(color: Color(0xFFFBBF24), fontSize: 12)),
                  ),
                ),
                Divider(color: context.borderColor, height: 20),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.logout_rounded, color: Color(0xFFEF4444)),
                  title: const Text('تسجيل الخروج', style: TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: Text('إنهاء الجلسة الحالية وحفظ العمليات غير المتزامنة بأمان', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                  onTap: _handleLogout,
                ),
                Divider(color: context.borderColor, height: 20),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF7F1D1D).withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFDC2626).withValues(alpha: 0.4)),
                    ),
                    child: const Icon(Icons.delete_forever_rounded, color: Color(0xFFEF4444), size: 20),
                  ),
                  title: const Text(
                    'حذف الحساب نهائيًا',
                    style: TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  subtitle: Text(
                    'حذف حسابك نهائيًا وجميع بياناته المرتبطة دون إمكانية الاسترجاع',
                    style: TextStyle(color: context.textSecondary, fontSize: 11),
                  ),
                  trailing: OutlinedButton(
                    onPressed: _handleDeleteAccount,
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Color(0xFFDC2626)),
                      backgroundColor: const Color(0xFFDC2626).withValues(alpha: 0.1),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('حذف الحساب', style: TextStyle(color: Color(0xFFEF4444), fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                  onTap: _handleDeleteAccount,
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildThemeSelectorCard() {
    final currentMode = ref.watch(themeModeProvider);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(16),
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
                  color: (currentMode == ThemeMode.light
                          ? const Color(0xFFF59E0B)
                          : const Color(0xFF0D9488))
                      .withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  currentMode == ThemeMode.light
                      ? Icons.light_mode_rounded
                      : (currentMode == ThemeMode.system
                          ? Icons.brightness_auto_rounded
                          : Icons.dark_mode_rounded),
                  color: currentMode == ThemeMode.light
                      ? const Color(0xFFF59E0B)
                      : (currentMode == ThemeMode.system
                          ? const Color(0xFF6366F1)
                          : const Color(0xFF38BDF8)),
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'سمة المنظومة ومظهر الواجهة',
                      style: TextStyle(
                        color: context.textPrimary,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'يتم حفظ التفضيل محلياً ويعمل فورياً عبر كامل شاشات التطبيق',
                      style: TextStyle(color: context.textSecondary, fontSize: 11),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildThemeOptionTile(
                  title: 'داكن',
                  subtitle: 'الوضع الأصلي',
                  icon: Icons.dark_mode_rounded,
                  mode: ThemeMode.dark,
                  isSelected: currentMode == ThemeMode.dark,
                  activeColor: const Color(0xFF38BDF8),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildThemeOptionTile(
                  title: 'فاتح',
                  subtitle: 'مريح للعين',
                  icon: Icons.light_mode_rounded,
                  mode: ThemeMode.light,
                  isSelected: currentMode == ThemeMode.light,
                  activeColor: const Color(0xFF0D9488),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildThemeOptionTile(
                  title: 'تلقائي',
                  subtitle: 'حسب الجهاز',
                  icon: Icons.brightness_auto_rounded,
                  mode: ThemeMode.system,
                  isSelected: currentMode == ThemeMode.system,
                  activeColor: const Color(0xFF6366F1),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildThemeOptionTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required ThemeMode mode,
    required bool isSelected,
    required Color activeColor,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          ref.read(themeModeProvider.notifier).setThemeMode(mode);
        },
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          decoration: BoxDecoration(
            color: isSelected
                ? activeColor.withValues(alpha: 0.12)
                : (context.isDarkMode
                    ? const Color(0xFF0F172A).withValues(alpha: 0.4)
                    : const Color(0xFFF1F5F9)),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? activeColor : context.borderColor,
              width: isSelected ? 1.8 : 1.0,
            ),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                size: 20,
                color: isSelected ? activeColor : context.textSecondary,
              ),
              const SizedBox(height: 6),
              Text(
                title,
                style: TextStyle(
                  color: isSelected ? activeColor : context.textPrimary,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: TextStyle(
                  color: isSelected
                      ? activeColor.withValues(alpha: 0.8)
                      : context.textSecondary,
                  fontSize: 9,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 18, color: const Color(0xFF0D9488)),
        const SizedBox(width: 8),
        Text(
          title,
          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14),
        ),
      ],
    );
  }

  Widget _buildInfoRow(String label, String value, IconData icon, {Color? valueColor}) {
    return Row(
      children: [
        Icon(icon, size: 16, color: context.textSecondary),
        const SizedBox(width: 10),
        Text(label, style: TextStyle(color: context.textSecondary, fontSize: 12)),
        const Spacer(),
        Text(
          value,
          style: TextStyle(color: valueColor ?? context.textPrimary, fontWeight: FontWeight.bold, fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildSubscriptionQuotaCard(AsyncValue<TenantQuotaModel?> quotaAsync) {
    final user = ref.watch(currentUserProvider);
    final isSuperAdmin = user?.role.toUpperCase() == 'SUPER_ADMIN';

    return quotaAsync.when(
      data: (quota) {
        final status = quota?.status ?? (isSuperAdmin ? 'ACTIVE' : 'NONE');
        final isNotSubscribed = !isSuperAdmin && (status == 'NONE' || quota == null);
        final isExpired = !isSuperAdmin && status == 'EXPIRED';
        final isSuspended = !isSuperAdmin && status == 'SUSPENDED';
        final isTrial = status == 'TRIAL';
        final isActive = isSuperAdmin || ((status == 'ACTIVE' || isTrial) && quota != null);

        final planName = isSuperAdmin && (quota == null || quota.planName == null || status == 'NONE')
            ? 'باقة المشرف العام (وصول كامل)'
            : (isNotSubscribed
                ? 'غير مشترك (لا توجد باقة)'
                : (isExpired
                    ? 'منتهي الصلاحية'
                    : (isSuspended
                        ? 'معلق مؤقتاً'
                        : (isTrial
                            ? (quota?.planNameAr ?? user?.subscriptionPlanAr ?? 'الباقة التجريبية المجانية')
                            : (quota?.planNameAr ?? quota?.planName ?? user?.subscriptionPlanAr ?? user?.subscriptionPlan ?? 'الباقة النشطة')))));

        final isUnlimited = isSuperAdmin || (quota != null && isActive && quota.isUnlimited);
        final limit = (quota != null && !isNotSubscribed) ? quota.cardLimit : 0;
        final used = (quota != null && !isNotSubscribed) ? quota.usedCards : 0;
        final remaining = (quota != null && !isNotSubscribed)
            ? (quota.remainingCards ?? (limit != null ? (limit - used).clamp(0, 999999999) : 0))
            : 0;
        final maxRouters = (quota != null && !isNotSubscribed) ? quota.maxRouters : 0;
        final cycleEnd = quota?.cycleEnd;
        final expiresAt = quota?.expiresAt;

        final double usagePercent = (!isUnlimited && limit != null && limit > 0)
            ? (used / limit).clamp(0.0, 1.0)
            : 0.0;

        Color badgeColor;
        Color badgeBorder;
        if (isActive) {
          badgeColor = const Color(0xFF10B981);
          badgeBorder = const Color(0xFF10B981);
        } else if (isExpired || isSuspended) {
          badgeColor = const Color(0xFFEF4444);
          badgeBorder = const Color(0xFFEF4444);
        } else {
          badgeColor = const Color(0xFFF59E0B);
          badgeBorder = const Color(0xFFF59E0B);
        }

        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: context.isDarkMode
                  ? const [Color(0xFF1E293B), Color(0xFF0F172A)]
                  : const [Colors.white, Color(0xFFF1F5F9)],
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isNotSubscribed
                  ? const Color(0xFFF59E0B).withValues(alpha: 0.3)
                  : (isExpired
                      ? const Color(0xFFEF4444).withValues(alpha: 0.3)
                      : (context.isDarkMode
                          ? const Color(0xFF0284C7).withValues(alpha: 0.3)
                          : context.borderColor)),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.card_membership_rounded,
                    color: isNotSubscribed
                        ? const Color(0xFFFBBF24)
                        : (isExpired ? const Color(0xFFF87171) : const Color(0xFF38BDF8)),
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'تفاصيل باقة الاشتراك والحصص:',
                    style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: badgeColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: badgeBorder),
                    ),
                    child: Text(
                      planName,
                      style: TextStyle(color: badgeColor, fontWeight: FontWeight.bold, fontSize: 11),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Non-subscribed / expired informative warning banner
              if (isNotSubscribed || isExpired || isSuspended) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: (isExpired ? const Color(0xFFEF4444) : const Color(0xFFF59E0B)).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: (isExpired ? const Color(0xFFEF4444) : const Color(0xFFF59E0B)).withValues(alpha: 0.25),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        isExpired ? Icons.warning_amber_rounded : Icons.info_outline_rounded,
                        color: isExpired ? const Color(0xFFF87171) : const Color(0xFFFBBF24),
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          isExpired
                              ? 'انتهت صلاحية باقة هذه الشبكة. يرجى التواصل مع إدارة المنصة لتجديد الاشتراك.'
                              : (isSuspended
                                  ? 'تم تعليق هذا الحساب. يرجى التواصل مع إدارة المنصة.'
                                  : 'هذا الحساب غير مرتبط بباقة نشطة حالياً. يرجى التواصل مع إدارة المنصة لتفعيل الاشتراك وحصص الكروت.'),
                          style: TextStyle(
                            color: isExpired ? const Color(0xFFFCA5A5) : const Color(0xFFFDE68A),
                            fontSize: 11,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              _buildInfoRow(
                'الحد الأقصى لأجهزة الراوتر',
                isNotSubscribed ? '0 أجهزة (غير مشترك)' : '$maxRouters أجهزة',
                Icons.router_outlined,
                valueColor: isNotSubscribed ? context.textSecondary : context.textPrimary,
              ),
              Divider(color: context.borderColor, height: 16),
              _buildInfoRow(
                'الحد الأقصى للكروت بالدورة',
                isNotSubscribed
                    ? '0 كرت'
                    : (isUnlimited ? 'غير محدود (Unlimited)' : '$limit كرت'),
                Icons.all_inclusive_rounded,
                valueColor: isNotSubscribed
                    ? context.textSecondary
                    : (isUnlimited ? const Color(0xFF38BDF8) : context.textPrimary),
              ),
              Divider(color: context.borderColor, height: 16),
              _buildInfoRow(
                'الكروت المستهلكة',
                '$used كرت',
                Icons.check_circle_outline,
                valueColor: isNotSubscribed ? context.textSecondary : const Color(0xFFFBBF24),
              ),
              Divider(color: context.borderColor, height: 16),
              _buildInfoRow(
                'الرصيد المتبقي للتوليد',
                isNotSubscribed
                    ? '0 كرت'
                    : (isUnlimited ? 'مفتوح' : '$remaining كرت'),
                Icons.hourglass_bottom_rounded,
                valueColor: isNotSubscribed
                    ? const Color(0xFFEF4444)
                    : (isUnlimited ? const Color(0xFF38BDF8) : const Color(0xFF10B981)),
              ),
              if (isActive && !isUnlimited && limit != null && limit > 0) ...[
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: usagePercent,
                    minHeight: 6,
                    backgroundColor: context.isDarkMode ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                    valueColor: AlwaysStoppedAnimation<Color>(
                      usagePercent > 0.9 ? const Color(0xFFEF4444) : const Color(0xFF0284C7),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'نسبة الاستهلاك: ${(usagePercent * 100).toStringAsFixed(1)}%',
                      style: TextStyle(color: context.textSecondary, fontSize: 11),
                    ),
                    if (cycleEnd != null)
                      Text(
                        'تجديد الحصة: ${cycleEnd.day}/${cycleEnd.month}/${cycleEnd.year}',
                        style: TextStyle(color: context.textSecondary, fontSize: 11),
                      ),
                  ],
                ),
              ],
              if (expiresAt != null) ...[
                Divider(color: context.borderColor, height: 16),
                _buildInfoRow(
                  isTrial ? 'تاريخ ووقت انتهاء التجربة' : 'تاريخ انتهاء الاشتراك',
                  '${expiresAt.day}/${expiresAt.month}/${expiresAt.year} - ${expiresAt.hour.toString().padLeft(2, '0')}:${expiresAt.minute.toString().padLeft(2, '0')}',
                  Icons.event_available_outlined,
                  valueColor: isExpired ? const Color(0xFFEF4444) : const Color(0xFF34D399),
                ),
                if (isTrial && !isExpired) ...[
                  Divider(color: context.borderColor, height: 16),
                  _buildInfoRow(
                    'الوقت المتبقي للتجربة',
                    expiresAt.isAfter(DateTime.now())
                        ? (expiresAt.difference(DateTime.now()).inHours > 0
                            ? '${expiresAt.difference(DateTime.now()).inHours} ساعة و ${expiresAt.difference(DateTime.now()).inMinutes % 60} دقيقة'
                            : '${expiresAt.difference(DateTime.now()).inMinutes} دقيقة')
                        : 'انتهت الفترة التجريبية',
                    Icons.timer_outlined,
                    valueColor: const Color(0xFF2DD4BF),
                  ),
                ],
              ],
              const SizedBox(height: 16),
              WhatsAppButton(
                type: isSuspended ? WhatsAppActionType.support : WhatsAppActionType.subscription,
                label: isNotSubscribed
                    ? 'طلب تفعيل الاشتراك عبر واتساب'
                    : (isExpired
                        ? 'تجديد الاشتراك عبر واتساب'
                        : (isSuspended ? 'تواصل مع الدعم الفني لحل التعليق' : 'ترقية أو تجديد الباقة عبر واتساب')),
                planName: quota?.planNameAr ?? quota?.planName,
                showPhonePill: true,
              ),
            ],
          ),
        );
      },
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0284C7)),
        ),
      ),
      error: (err, stack) => const SizedBox.shrink(),
    );
  }
}
