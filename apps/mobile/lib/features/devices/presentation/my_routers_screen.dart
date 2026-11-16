import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../router_setup/presentation/router_setup_screen.dart';

class MyRoutersScreen extends ConsumerStatefulWidget {
  const MyRoutersScreen({super.key});

  @override
  ConsumerState<MyRoutersScreen> createState() => _MyRoutersScreenState();
}

class _MyRoutersScreenState extends ConsumerState<MyRoutersScreen> {
  final Map<String, bool> _testingStatus = {};

  Future<void> _handleSelectRouter(RouterDeviceModel router) async {
    HapticFeedback.selectionClick();
    ref.read(selectedRouterIdProvider.notifier).select(router.id);
    ref.read(routersProvider.notifier).pollRouterTelemetry(router.id);

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle_rounded, color: Colors.white, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'تم التبديل بنجاح إلى: ${router.name} (${router.host})',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF10B981),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );

    // If popped or navigated from dashboard, close screen to return to dashboard
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop(router.id);
    }
  }

  Future<void> _handleReconnect(RouterDeviceModel router) async {
    HapticFeedback.lightImpact();
    setState(() => _testingStatus[router.id] = true);

    try {
      final routersNotifier = ref.read(routersProvider.notifier);
      final res = await routersNotifier.testConnection(router.id);
      final isSuccess = res['success'] == true;

      // Also trigger a background telemetry poll to refresh metrics
      await routersNotifier.pollRouterTelemetry(router.id);

      if (!mounted) return;
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              Icon(
                isSuccess ? Icons.wifi_rounded : Icons.wifi_off_rounded,
                color: Colors.white,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isSuccess
                      ? 'الراوتر «${router.name}» متصل وجاهز للعمل.'
                      : 'تعذر الاتصال بـ «${router.name}»: ${res['message'] ?? 'تحقق من الشبكة والراوتر'}',
                ),
              ),
            ],
          ),
          backgroundColor: isSuccess ? const Color(0xFF10B981) : const Color(0xFFEF4444),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('فشل فحص الاتصال: $e'),
          backgroundColor: const Color(0xFFEF4444),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _testingStatus[router.id] = false);
      }
    }
  }

  Future<void> _handleDeleteRouter(RouterDeviceModel router) async {
    HapticFeedback.heavyImpact();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: context.borderColor),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.delete_forever_rounded, color: Color(0xFFEF4444), size: 24),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'حذف الراوتر',
                style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 17),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'هل أنت متأكد من حذف الراوتر التالي من حسابك؟',
              style: TextStyle(color: context.textPrimary, fontSize: 14),
            ),
            const SizedBox(height: 10),
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
                    router.name,
                    style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'IP: ${router.host}',
                    style: TextStyle(color: context.textSecondary, fontSize: 12),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'ملاحظة: يمكنك إعادة إضافة وبرمجة الراوتر في أي وقت لاحقاً.',
              style: TextStyle(color: context.textSecondary, fontSize: 11),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFDC2626),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('تأكيد الحذف', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      final res = await ref.read(routersProvider.notifier).deleteRouter(router.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message']?.toString() ?? 'تم حذف الراوتر بنجاح'),
          backgroundColor: res['success'] == true ? const Color(0xFF10B981) : const Color(0xFFEF4444),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _handleEditRouter(RouterDeviceModel router) async {
    final formKey = GlobalKey<FormState>();
    final nameCtrl = TextEditingController(text: router.name);
    final hostCtrl = TextEditingController(text: router.host);
    final userCtrl = TextEditingController(text: router.username);
    final passCtrl = TextEditingController(
      text: ref.read(routersProvider.notifier).getSessionPassword(router.id) ?? '',
    );
    final apiPortCtrl = TextEditingController(text: router.apiPort.toString());
    final restPortCtrl = TextEditingController(text: router.restPort.toString());
    bool useSsl = router.useSsl;
    bool obscurePassword = true;

    final updated = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (dialogCtx, setDialogState) {
          return AlertDialog(
            backgroundColor: context.bgCard,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: BorderSide(color: context.borderColor),
            ),
            title: Row(
              children: [
                const Icon(Icons.edit_note_rounded, color: AppTheme.primary, size: 24),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'تعديل بيانات الراوتر',
                    style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                ),
              ],
            ),
            content: SingleChildScrollView(
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextFormField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'اسم الراوتر *',
                        prefixIcon: Icon(Icons.label_outline),
                      ),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'مطلوب إدخال الاسم' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: hostCtrl,
                      decoration: const InputDecoration(
                        labelText: 'عنوان IP أو المضيف *',
                        prefixIcon: Icon(Icons.dns_outlined),
                      ),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'مطلوب إدخال العنوان' : null,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: apiPortCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'منفذ API',
                              hintText: '8728',
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            controller: restPortCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'منفذ REST / Web',
                              hintText: '80',
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: userCtrl,
                      decoration: const InputDecoration(
                        labelText: 'اسم المستخدم (RouterOS)',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: passCtrl,
                      obscureText: obscurePassword,
                      decoration: InputDecoration(
                        labelText: 'كلمة المرور',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          icon: Icon(
                            obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                            size: 20,
                          ),
                          onPressed: () => setDialogState(() => obscurePassword = !obscurePassword),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        'استخدام اتصال مشفر (SSL)',
                        style: TextStyle(color: context.textPrimary, fontSize: 13),
                      ),
                      value: useSsl,
                      activeThumbColor: AppTheme.primary,
                      onChanged: (val) => setDialogState(() => useSsl = val),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
              ),
              ElevatedButton(
                onPressed: () async {
                  if (!formKey.currentState!.validate()) return;
                  final payload = {
                    'name': nameCtrl.text.trim(),
                    'host': hostCtrl.text.trim(),
                    'username': userCtrl.text.trim().isEmpty ? 'admin' : userCtrl.text.trim(),
                    if (passCtrl.text.trim().isNotEmpty) 'password': passCtrl.text.trim(),
                    'apiPort': int.tryParse(apiPortCtrl.text.trim()) ?? 8728,
                    'restPort': int.tryParse(restPortCtrl.text.trim()) ?? 80,
                    'useSsl': useSsl,
                  };

                  final res = await ref.read(routersProvider.notifier).saveRouter(payload, id: router.id);
                  if (passCtrl.text.trim().isNotEmpty) {
                    ref.read(routersProvider.notifier).cacheSessionPassword(router.id, passCtrl.text.trim());
                  }

                  if (ctx.mounted) {
                    Navigator.pop(ctx, res['success'] == true);
                  }
                },
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                child: const Text('حفظ التعديل', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          );
        },
      ),
    );

    if (updated == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم تحديث بيانات الراوتر بنجاح'),
          backgroundColor: Color(0xFF10B981),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _copyToClipboard(String text, String label) {
    if (text.isEmpty) return;
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('تم نسخ $label: $text'),
        backgroundColor: const Color(0xFF10B981),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final routersAsync = ref.watch(routersProvider);
    final selectedRouterId = ref.watch(selectedRouterIdProvider);

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        title: Row(
          children: [
            Text(
              'الراوترات',
              style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 20),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.3)),
              ),
              child: const Text(
                'إدارة الأجهزة',
                style: TextStyle(color: Color(0xFF10B981), fontSize: 11, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        backgroundColor: context.bgCard,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'تحديث القائمة',
            onPressed: () => ref.read(routersProvider.notifier).refresh(),
          ),
        ],
      ),
      body: routersAsync.when(
        data: (routers) {
          final totalCount = routers.length;
          final onlineCount = routers.where((r) => r.isEffectiveOnline).length;
          final offlineCount = totalCount - onlineCount;

          return Column(
            children: [
              // Top Statistics Header Row matching the user's mockup exactly
              Container(
                margin: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Row(
                  children: [
                    // Total Routers
                    Expanded(
                      child: _buildStatCard(
                        title: 'إجمالي الراوترات',
                        value: totalCount.toString().padLeft(2, '0'),
                        color: context.textPrimary,
                        bgColor: context.bgCard,
                        borderColor: context.borderColor,
                      ),
                    ),
                    const SizedBox(width: 10),
                    // Online Routers
                    Expanded(
                      child: _buildStatCard(
                        title: 'متصل',
                        value: onlineCount.toString().padLeft(2, '0'),
                        color: const Color(0xFF10B981),
                        bgColor: const Color(0xFF10B981).withValues(alpha: 0.08),
                        borderColor: const Color(0xFF10B981).withValues(alpha: 0.25),
                      ),
                    ),
                    const SizedBox(width: 10),
                    // Offline Routers
                    Expanded(
                      child: _buildStatCard(
                        title: 'غير متصل',
                        value: offlineCount.toString().padLeft(2, '0'),
                        color: const Color(0xFFEF4444),
                        bgColor: const Color(0xFFEF4444).withValues(alpha: 0.08),
                        borderColor: const Color(0xFFEF4444).withValues(alpha: 0.25),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 4),

              // Routers List
              Expanded(
                child: routers.isEmpty
                    ? _buildEmptyState()
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 6, 16, 16),
                        itemCount: routers.length,
                        itemBuilder: (ctx, index) {
                          final router = routers[index];
                          final isSelected = router.id == selectedRouterId;
                          final isTesting = _testingStatus[router.id] == true;

                          return _buildRouterCard(
                            router: router,
                            isSelected: isSelected,
                            isTesting: isTesting,
                          );
                        },
                      ),
              ),

              // Bottom Sticky Add Router Button
              SafeArea(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: context.bgCard,
                    border: Border(top: BorderSide(color: context.borderColor)),
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton.icon(
                      onPressed: () {
                        HapticFeedback.mediumImpact();
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const RouterSetupScreen()),
                        );
                      },
                      icon: const Icon(Icons.add, color: Colors.white, size: 22),
                      label: const Text(
                        'إضافة راوتر جديد',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF10B981),
                        elevation: 2,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(),
        ),
        error: (err, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline_rounded, color: Color(0xFFEF4444), size: 48),
                const SizedBox(height: 12),
                Text(
                  'تعذر تحميل قائمة الراوترات',
                  style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 16),
                ),
                const SizedBox(height: 6),
                Text(
                  err.toString(),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.textSecondary, fontSize: 12),
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: () => ref.read(routersProvider.notifier).refresh(),
                  icon: const Icon(Icons.refresh),
                  label: const Text('إعادة المحاولة'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatCard({
    required String title,
    required String value,
    required Color color,
    required Color bgColor,
    required Color borderColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        children: [
          Text(
            title,
            style: TextStyle(
              color: context.textSecondary,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 24,
              fontWeight: FontWeight.w900,
              letterSpacing: 1,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.router_rounded, color: Color(0xFF10B981), size: 54),
            ),
            const SizedBox(height: 16),
            Text(
              'لا يوجد راوترات مضافة حتى الآن',
              style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 17),
            ),
            const SizedBox(height: 8),
            Text(
              'قم بإضافة جهاز MikroTik للتحكم بالشبكة والكروت والمشتركين من مكان واحد.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRouterCard({
    required RouterDeviceModel router,
    required bool isSelected,
    required bool isTesting,
  }) {
    final isOnline = router.isEffectiveOnline;
    final statusColor = isOnline ? const Color(0xFF10B981) : const Color(0xFFEF4444);
    final statusBg = isOnline ? const Color(0xFF10B981).withValues(alpha: 0.12) : const Color(0xFFEF4444).withValues(alpha: 0.12);
    final statusText = isOnline ? 'متصل' : 'غير متصل';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isSelected ? const Color(0xFF10B981) : context.borderColor,
          width: isSelected ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: context.isDarkMode ? 0.2 : 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Upper Section: Status badge, Active indicator, Name, IP, Delete
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // Status Badge (Pill)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: statusBg,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              color: statusColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            statusText,
                            style: TextStyle(
                              color: statusColor,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(width: 8),

                    // Active Router Badge if selected
                    if (isSelected)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 13),
                            SizedBox(width: 4),
                            Text(
                              'الراوتر النشط',
                              style: TextStyle(
                                color: Color(0xFF10B981),
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),

                    const Spacer(),

                    // Delete button
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, size: 20, color: Color(0xFFEF4444)),
                      tooltip: 'حذف الراوتر',
                      visualDensity: VisualDensity.compact,
                      onPressed: () => _handleDeleteRouter(router),
                    ),
                  ],
                ),

                const SizedBox(height: 8),

                // Router Name
                Text(
                  router.name,
                  style: TextStyle(
                    color: context.textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 4),

                // Router IP & Details
                Row(
                  children: [
                    InkWell(
                      onTap: () => _copyToClipboard(router.host, 'عنوان IP'),
                      borderRadius: BorderRadius.circular(6),
                      child: Row(
                        children: [
                          Text(
                            'IP: ${router.host}',
                            style: TextStyle(
                              color: context.textSecondary,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Icon(Icons.copy_rounded, size: 13, color: context.textSecondary),
                        ],
                      ),
                    ),
                    if (router.modelName != null && router.modelName!.isNotEmpty) ...[
                      const SizedBox(width: 10),
                      Text('•', style: TextStyle(color: context.textSecondary)),
                      const SizedBox(width: 10),
                      Text(
                        router.modelName!,
                        style: TextStyle(color: context.textSecondary, fontSize: 12),
                      ),
                    ],
                    if (router.rosVersion.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Text(
                        '(${router.rosVersion})',
                        style: TextStyle(color: context.textSecondary, fontSize: 11),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),

          Divider(height: 1, color: context.borderColor),

          // Lower Section: Action Buttons matching the user's mockup exactly
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: context.bgCardAlt.withValues(alpha: 0.5),
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(16),
                bottomRight: Radius.circular(16),
              ),
            ),
            child: Row(
              children: [
                // 1. Choose Router Button (Primary Action)
                Expanded(
                  flex: 3,
                  child: InkWell(
                    onTap: () => _handleSelectRouter(router),
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? const Color(0xFF10B981).withValues(alpha: 0.2)
                            : const Color(0xFF10B981).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: const Color(0xFF10B981).withValues(alpha: isSelected ? 0.6 : 0.3),
                        ),
                      ),
                      child: Center(
                        child: Text(
                          isSelected ? 'الراوتر المحدد ✓' : 'اختيار الراوتر',
                          style: const TextStyle(
                            color: Color(0xFF10B981),
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

                const SizedBox(width: 6),

                // 2. Edit Router Button
                Expanded(
                  flex: 3,
                  child: InkWell(
                    onTap: () => _handleEditRouter(router),
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: context.bgCard,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: context.borderColor),
                      ),
                      child: Center(
                        child: Text(
                          'تعديل البيانات',
                          style: TextStyle(
                            color: context.textPrimary,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

                const SizedBox(width: 6),

                // 3. Reconnect Button
                Expanded(
                  flex: 3,
                  child: InkWell(
                    onTap: isTesting ? null : () => _handleReconnect(router),
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: context.bgCard,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: context.borderColor),
                      ),
                      child: Center(
                        child: isTesting
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary),
                              )
                            : Text(
                                'إعادة الاتصال',
                                style: TextStyle(
                                  color: context.isDarkMode ? const Color(0xFF60A5FA) : const Color(0xFF2563EB),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
