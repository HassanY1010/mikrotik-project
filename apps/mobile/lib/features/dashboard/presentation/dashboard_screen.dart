import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/utils/whatsapp_helper.dart';
import '../../../core/widgets/whatsapp_button.dart';
import '../../../core/theme/app_theme.dart';
import '../../radar/presentation/radar_screen.dart';
import '../../portal/presentation/hotspot_portal_designer_screen.dart';
import '../../devices/presentation/connected_devices_screen.dart';
import '../../router_setup/presentation/router_setup_screen.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  final Function(int tabIndex)? onNavigateTab;
  final VoidCallback? onOpenPos;
  final VoidCallback? onOpenOfflineWallet;
  final VoidCallback? onOpenSync;
  final VoidCallback? onOpenShift;
  final VoidCallback? onOpenRouterSetup;
  final VoidCallback? onOpenCloudWallet;
  final VoidCallback? onOpenDrawer;
  final VoidCallback? onLogout;
  final VoidCallback? onOpenTemplates;
  final VoidCallback? onOpenProfiles;
  final VoidCallback? onOpenPppoe;
  final VoidCallback? onOpenUserProfile;
  final VoidCallback? onOpenTenantUsers;
  final VoidCallback? onOpenPortalDesigner;
  final VoidCallback? onOpenRouterProvisioning;

  const DashboardScreen({
    super.key,
    this.onNavigateTab,
    this.onOpenPos,
    this.onOpenOfflineWallet,
    this.onOpenSync,
    this.onOpenShift,
    this.onOpenRouterSetup,
    this.onOpenCloudWallet,
    this.onOpenDrawer,
    this.onLogout,
    this.onOpenTemplates,
    this.onOpenProfiles,
    this.onOpenPppoe,
    this.onOpenUserProfile,
    this.onOpenTenantUsers,
    this.onOpenPortalDesigner,
    this.onOpenRouterProvisioning,
  });

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> with WidgetsBindingObserver {
  bool _isTogglingLock = false;
  bool _isTogglingAntiTethering = false;
  bool _isTestingConnection = false;
  bool _isSyncing = false;
  DateTime? _lastResumeRefreshAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      final now = DateTime.now();
      // Throttle resume refreshes: must be at least 15 seconds apart
      if (_lastResumeRefreshAt == null || now.difference(_lastResumeRefreshAt!) > const Duration(seconds: 15)) {
        _lastResumeRefreshAt = now;
        _onAppResumed();
      }
    }
  }

  Future<void> _onAppResumed() async {
    if (!mounted) return;
    try {
      // Re-verify session and fetch fresh routers and stats
      await ref.read(routersProvider.notifier).refresh();
      await ref.read(currentUserProvider.notifier).fetchMe();
      ref.invalidate(financialReportProvider);
      ref.invalidate(activeSessionsProvider);
    } catch (_) {}
  }

  Future<void> _handleSyncAndRefresh() async {
    if (_isSyncing) return;
    setState(() => _isSyncing = true);

    try {
      final syncManager = ref.read(syncManagerProvider);

      // 1. Push any pending offline sales mutations to server
      final pushResult = await syncManager.pushPendingMutations();

      // 2. Pull catalog and updates
      await syncManager.pullCatalog();

      // 3. Refresh providers
      ref.invalidate(routersProvider);
      ref.invalidate(activeSessionsProvider);
      ref.invalidate(financialReportProvider);
      ref.read(pendingMutationsProvider.notifier).refresh();
      ref.read(offlineCardsProvider.notifier).refresh();

      if (!mounted) return;

      String message;
      Color bgColor;
      if (pushResult.errorMessage != null) {
        message = 'تم تحديث البيانات، لكن تعذر إرسال العمليات المعلقة (${pushResult.errorMessage})؛ تم الاحتفاظ بها محلياً.';
        bgColor = Colors.amber.shade800;
      } else if (pushResult.conflictCount > 0) {
        message = 'تمت المزامنة: اعتُمدت ${pushResult.appliedCount} عملية، ويوجد ${pushResult.conflictCount} تعارض.';
        bgColor = Colors.amber.shade800;
      } else if (pushResult.appliedCount > 0) {
        message = 'تمت المزامنة بنجاح! تم اعتماد ${pushResult.appliedCount} عملية ورفع مبيعات اليوم.';
        bgColor = const Color(0xFF16A34A);
      } else {
        message = 'تم تحديث ومزامنة بيانات لوحة التحكم بنجاح.';
        bgColor = const Color(0xFF16A34A);
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: bgColor,
          duration: const Duration(seconds: 3),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تعذر إتمام المزامنة: $e. تم الاحتفاظ بالبيانات المحلية بأمان.'),
          backgroundColor: Colors.red.shade800,
          duration: const Duration(seconds: 4),
        ),
      );
    } finally {
      if (mounted) setState(() => _isSyncing = false);
    }
  }

  void _navigateToRadar() {
    if (widget.onNavigateTab != null) {
      widget.onNavigateTab!(3);
    } else {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const RadarScreen()),
      );
    }
  }

  Future<void> _testRouterConnection(RouterDeviceModel router) async {
    if (_isTestingConnection) return;
    setState(() => _isTestingConnection = true);

    final res = await ref.read(routersProvider.notifier).testConnection(router.id);
    if (!mounted) return;
    setState(() => _isTestingConnection = false);

    final success = res['success'] == true;
    final msg = res['message']?.toString() ??
        (success ? 'تم الاتصال بالراوتر بنجاح' : 'تعذر الاتصال بالراوتر');
    final latency = res['latencyMs'];
    final displayMsg = latency != null ? '$msg ($latency ms)' : msg;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              success ? Icons.check_circle : Icons.error_outline,
              color: Colors.white,
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                displayMsg,
                style: const TextStyle(fontSize: 12),
              ),
            ),
          ],
        ),
        backgroundColor: success ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  void _navigateToPortalDesigner() {
    if (widget.onOpenPortalDesigner != null) {
      widget.onOpenPortalDesigner!();
    } else {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const HotspotPortalDesignerScreen()),
      );
    }
  }

  void _navigateToConnectedDevices() {
    final selectedId = ref.read(selectedRouterIdProvider);
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ConnectedDevicesScreen(initialRouterId: selectedId),
      ),
    );
  }

  void _navigateToRouterProvisioning() {
    if (widget.onOpenRouterProvisioning != null) {
      widget.onOpenRouterProvisioning!();
      return;
    }
    final selectedId = ref.read(selectedRouterIdProvider);
    final routers = ref.read(routersProvider).asData?.value ?? [];
    RouterDeviceModel? selectedRouter;
    if (selectedId != null && routers.isNotEmpty) {
      for (final r in routers) {
        if (r.id == selectedId) {
          selectedRouter = r;
          break;
        }
      }
    }
    selectedRouter ??= routers.isNotEmpty ? routers.first : null;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RouterSetupScreen(router: selectedRouter),
      ),
    );
  }

  Future<void> _handleRouterBackup() async {
    final routers = ref.read(routersProvider).asData?.value ?? [];
    if (routers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Expanded(
                child: Text('لا يوجد راوتر مسجل في حسابك. يرجى إضافة راوتر أولاً.'),
              ),
            ],
          ),
          backgroundColor: Color(0xFFDC2626),
        ),
      );
      return;
    }

    final selectedId = ref.read(selectedRouterIdProvider);
    final currentRouter = routers.firstWhere(
      (r) => r.id == selectedId,
      orElse: () => routers.first,
    );

    final currentUser = ref.read(currentUserProvider);
    final role = currentUser?.role.toUpperCase() ?? '';
    final allowedRoles = ['SUPER_ADMIN', 'OWNER', 'TENANT_ADMIN', 'ADMIN', 'MANAGER'];
    if (!allowedRoles.contains(role)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.shield_outlined, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Expanded(
                child: Text('عذراً، صلاحيات حسابك الحالية لا تسمح بإنشاء نسخ احتياطية للراوتر.'),
              ),
            ],
          ),
          backgroundColor: Color(0xFFDC2626),
        ),
      );
      return;
    }

    _showBackupModal(currentRouter);
  }

  void _showBackupModal(RouterDeviceModel currentRouter) {
    final now = DateTime.now();
    final defaultName =
        'backup_${currentRouter.name.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')}_${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}_${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}';
    final nameController = TextEditingController(text: defaultName);
    final passController = TextEditingController();
    bool isLoading = false;
    bool isFetchingList = false;
    List<Map<String, dynamic>>? existingBackups;
    String? localError;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return AlertDialog(
              backgroundColor: context.bgCard,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: BorderSide(color: context.borderColor),
              ),
              titlePadding: const EdgeInsets.fromLTRB(20, 20, 20, 10),
              contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              title: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.backup_outlined, color: Color(0xFF10B981), size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'النسخ الاحتياطي للمايكروتك',
                      style: TextStyle(
                        color: context.textPrimary,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Router info badge
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: context.bgCardAlt,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: context.borderColor),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.router, color: Color(0xFF38BDF8), size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  currentRouter.name,
                                  style: TextStyle(
                                    color: context.textPrimary,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                  ),
                                ),
                                Text(
                                  '${currentRouter.host} • ROS ${currentRouter.rosVersion}',
                                  style: TextStyle(
                                    color: context.textSecondary,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: currentRouter.isOnline
                                  ? Colors.green.withValues(alpha: 0.2)
                                  : Colors.red.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: currentRouter.isOnline ? Colors.green : Colors.red,
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
                                        ? Colors.greenAccent
                                        : Colors.redAccent,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  currentRouter.isOnline ? 'متصل' : 'غير متصل',
                                  style: TextStyle(
                                    color: currentRouter.isOnline
                                        ? Colors.greenAccent
                                        : Colors.redAccent,
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Offline warning if router is offline
                    if (!currentRouter.isOnline) ...[
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: context.isDarkMode
                              ? Colors.amber.withValues(alpha: 0.12)
                              : const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: context.isDarkMode
                                ? Colors.amber.withValues(alpha: 0.4)
                                : const Color(0xFFF59E0B).withValues(alpha: 0.5),
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.warning_amber_rounded,
                              color: context.isDarkMode ? Colors.amber : const Color(0xFFB45309),
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'تنبيه: الراوتر في حالة غير متصل حالياً بالخادم. يرجى التأكد من تشغيل الراوتر واتصاله بالشبكة قبل النسخ.',
                                style: TextStyle(
                                  color: context.isDarkMode ? const Color(0xFFFDE68A) : const Color(0xFF92400E),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                    ],

                    // Input: Backup Name
                    Text(
                      'اسم ملف النسخة الاحتياطية:',
                      style: TextStyle(
                          color: context.textPrimary, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: nameController,
                      style: TextStyle(color: context.textPrimary, fontSize: 13),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: context.bgScaffold,
                        hintText: 'اسم النسخة الاحتياطية',
                        hintStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                        suffixText: '.backup',
                        suffixStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: Color(0xFF10B981)),
                        ),
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Input: Optional Password
                    Text(
                      'كلمة مرور التشفير (اختياري):',
                      style: TextStyle(
                          color: context.textPrimary, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: passController,
                      obscureText: true,
                      style: TextStyle(color: context.textPrimary, fontSize: 13),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: context.bgScaffold,
                        hintText: 'اترك الحقل فارغاً لنسخة بدون تشفير',
                        hintStyle: TextStyle(color: context.textSecondary, fontSize: 11),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: Color(0xFF10B981)),
                        ),
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                    ),

                    if (localError != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.red.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.red.withValues(alpha: 0.4)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline, color: Colors.redAccent, size: 16),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                localError!,
                                style: const TextStyle(color: Colors.redAccent, fontSize: 11),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    const SizedBox(height: 14),

                    // Existing backups collapsible section
                    InkWell(
                      onTap: isFetchingList
                          ? null
                          : () async {
                              setDialogState(() {
                                isFetchingList = true;
                                localError = null;
                              });
                              try {
                                final list = await ref
                                    .read(routersProvider.notifier)
                                    .listBackups(currentRouter.id);
                                setDialogState(() {
                                  existingBackups = list;
                                  isFetchingList = false;
                                });
                              } catch (e) {
                                setDialogState(() {
                                  isFetchingList = false;
                                  localError = 'تعذر جلب النسخ السابقة: $e';
                                });
                              }
                            },
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: const [
                              Icon(Icons.folder_zip_outlined, color: Color(0xFF38BDF8), size: 16),
                              SizedBox(width: 6),
                              Text(
                                'عرض النسخ المحفوظة على الراوتر',
                                style: TextStyle(
                                  color: Color(0xFF38BDF8),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                          if (isFetchingList)
                            const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Color(0xFF38BDF8)),
                            )
                          else
                            const Icon(Icons.keyboard_arrow_down,
                                color: Color(0xFF38BDF8), size: 18),
                        ],
                      ),
                    ),

                    if (existingBackups != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        constraints: const BoxConstraints(maxHeight: 120),
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: context.bgScaffold,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: context.borderColor),
                        ),
                        child: existingBackups!.isEmpty
                            ? Center(
                                child: Text(
                                  'لا توجد نسخ احتياطية مسجلة في الراوتر حالياً',
                                  style: TextStyle(color: context.textSecondary, fontSize: 11),
                                ),
                              )
                            : ListView.separated(
                                shrinkWrap: true,
                                itemCount: existingBackups!.length,
                                separatorBuilder: (context, index) =>
                                    Divider(color: context.borderColor, height: 8),
                                itemBuilder: (ctx, i) {
                                  final b = existingBackups![i];
                                  final bName = b['name']?.toString() ?? 'backup';
                                  final bSize = b['size'] != null
                                      ? '${(b['size'] / 1024).toStringAsFixed(1)} KB'
                                      : '';
                                  return Row(
                                    children: [
                                      const Icon(Icons.file_present_outlined,
                                          size: 16, color: Color(0xFF10B981)),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              bName,
                                              style: TextStyle(
                                                  color: context.textPrimary,
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w600),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            if (bSize.isNotEmpty)
                                              Text(
                                                bSize,
                                                style: TextStyle(
                                                    color: context.textSecondary, fontSize: 10),
                                              ),
                                          ],
                                        ),
                                      ),
                                      IconButton(
                                        icon: const Icon(Icons.restore_page_outlined,
                                            size: 18, color: Color(0xFFF59E0B)),
                                        tooltip: 'استعادة هذه النسخة على الراوتر',
                                        onPressed: () {
                                          Navigator.pop(dialogContext);
                                          _showRestoreBackupConfirmationDialog(
                                            currentRouter: currentRouter,
                                            filename: bName,
                                          );
                                        },
                                      ),
                                      IconButton(
                                        icon: const Icon(Icons.download_rounded,
                                            size: 18, color: Color(0xFF38BDF8)),
                                        tooltip: 'تنزيل وحفظ النسخة',
                                        onPressed: () async {
                                          final dlRes = await ref
                                              .read(routersProvider.notifier)
                                              .downloadBackup(currentRouter.id, bName);
                                          if (!mounted) return;
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            SnackBar(
                                              content: Row(
                                                children: [
                                                  Icon(
                                                    dlRes['success'] == true
                                                        ? Icons.check_circle
                                                        : Icons.error_outline,
                                                    color: Colors.white,
                                                    size: 18,
                                                  ),
                                                  const SizedBox(width: 8),
                                                  Expanded(
                                                    child: Text(
                                                        dlRes['message']?.toString() ?? ''),
                                                  ),
                                                ],
                                              ),
                                              action: (dlRes['success'] == true && dlRes['path'] != null && !dlRes['path'].toString().contains('المتصفح'))
                                                  ? SnackBarAction(
                                                      label: 'مشاركة',
                                                      textColor: Colors.yellowAccent,
                                                      onPressed: () {
                                                        ref.read(routersProvider.notifier).shareDownloadedBackup(dlRes['path'].toString(), bName);
                                                      },
                                                    )
                                                  : null,
                                              backgroundColor: dlRes['success'] == true
                                                  ? const Color(0xFF10B981)
                                                  : const Color(0xFFDC2626),
                                            ),
                                          );
                                        },
                                      ),
                                    ],
                                  );
                                },
                              ),
                      ),
                    ],
                  ],
                ),
              ),
              actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              actions: [
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: isLoading ? null : () => Navigator.pop(dialogContext),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: context.borderColor),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton.icon(
                        onPressed: isLoading
                            ? null
                            : () async {
                                final nameVal = nameController.text.trim();
                                final passVal = passController.text.trim();

                                setDialogState(() {
                                  isLoading = true;
                                  localError = null;
                                });

                                final res = await ref.read(routersProvider.notifier).createBackup(
                                      currentRouter.id,
                                      backupName: nameVal.isNotEmpty ? nameVal : null,
                                      password: passVal.isNotEmpty ? passVal : null,
                                    );

                                if (!dialogContext.mounted) return;

                                if (res['success'] == true) {
                                  Navigator.pop(dialogContext);
                                  _showBackupSuccessDialog(
                                    currentRouter: currentRouter,
                                    backupInfo: res['backup'],
                                    message: res['message']?.toString() ??
                                        'تم إنشاء النسخة الاحتياطية بنجاح',
                                  );
                                } else {
                                  setDialogState(() {
                                    isLoading = false;
                                    localError = res['message']?.toString() ??
                                        'فشل إنشاء النسخة الاحتياطية';
                                  });
                                }
                              },
                        icon: isLoading
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.cloud_upload_outlined,
                                size: 18, color: Colors.white),
                        label: Text(
                          isLoading ? 'جارٍ الحفظ...' : 'إنشاء النسخة الآن',
                          style: const TextStyle(
                              color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF10B981),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showBackupSuccessDialog({
    required RouterDeviceModel currentRouter,
    required Map<String, dynamic>? backupInfo,
    required String message,
  }) {
    final filename = backupInfo?['filename']?.toString() ?? 'backup.backup';
    final sizeBytes = backupInfo?['size'];
    final sizeStr =
        sizeBytes != null ? '${(sizeBytes / 1024).toStringAsFixed(1)} KB' : 'محفوظ بالراوتر';
    final dateStr = backupInfo?['creationTime']?.toString() ??
        DateTime.now().toString().substring(0, 16);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0xFF10B981), width: 1.5),
        ),
        title: Row(
          children: [
            const Icon(Icons.check_circle, color: Color(0xFF10B981), size: 28),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'اكتمل النسخ الاحتياطي',
                style: TextStyle(
                    color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message,
              style: TextStyle(color: context.textSecondary, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.bgCardAlt,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: context.borderColor),
              ),
              child: Column(
                children: [
                  _buildSuccessRow('الجهاز:', '${currentRouter.name} (${currentRouter.host})'),
                  const SizedBox(height: 6),
                  _buildSuccessRow('الملف:', filename, isBold: true),
                  const SizedBox(height: 6),
                  _buildSuccessRow('الحجم:', sizeStr),
                  const SizedBox(height: 6),
                  _buildSuccessRow('التاريخ:', dateStr),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.info_outline, color: Color(0xFF38BDF8), size: 16),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'النسخة محفوظة بأمان في ذاكرة الراوتر (Files). يمكنك استعادتها بأي وقت عبر WinBox أو النظام.',
                    style: TextStyle(color: context.textSecondary, fontSize: 11),
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              OutlinedButton.icon(
                onPressed: () async {
                  final dlRes = await ref
                      .read(routersProvider.notifier)
                      .downloadBackup(currentRouter.id, filename);
                  if (!ctx.mounted) return;
                  final path = dlRes['path']?.toString();
                  ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(
                      content: Row(
                        children: [
                          Icon(
                            dlRes['success'] == true ? Icons.check_circle : Icons.error_outline,
                            color: Colors.white,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(child: Text(dlRes['message']?.toString() ?? '')),
                        ],
                      ),
                      action: (dlRes['success'] == true &&
                              path != null &&
                              !path.contains('المتصفح'))
                          ? SnackBarAction(
                              label: 'مشاركة',
                              textColor: Colors.yellowAccent,
                              onPressed: () {
                                ref
                                    .read(routersProvider.notifier)
                                    .shareDownloadedBackup(path, filename);
                              },
                            )
                          : null,
                      backgroundColor: dlRes['success'] == true
                          ? const Color(0xFF10B981)
                          : const Color(0xFFDC2626),
                    ),
                  );
                },
                icon: const Icon(Icons.download_rounded, size: 16, color: Color(0xFF38BDF8)),
                label: const Text('تنزيل النسخة', style: TextStyle(color: Color(0xFF38BDF8))),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFF38BDF8)),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
              ),
              const SizedBox(width: 10),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF10B981),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                ),
                child: const Text('تم',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showRestoreBackupConfirmationDialog({
    required RouterDeviceModel currentRouter,
    required String filename,
  }) {
    final passController = TextEditingController();
    bool confirmed = false;
    bool isRestoring = false;
    String? localError;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              backgroundColor: context.bgCard,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
              ),
              title: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 28),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'تأكيد استعادة النسخة الاحتياطية',
                      style: TextStyle(
                        color: context.textPrimary,
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEF4444).withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'تحذير شديد الأهمية:',
                            style: TextStyle(
                              color: Color(0xFFEF4444),
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '• استعادة نسخة كاملة (.backup) ستستبدل جميع إعدادات الراوتر الحالية فوراً.\n'
                            '• سيعاد تشغيل الراوتر تلقائياً وينقطع الاتصال بالشبكة لعدة دقائق.\n'
                            '• إذا كانت النسخة تحتوي على عناوين IP أو كلمات مرور مختلفة، فقد يتعذر الوصول للراوتر عن بُعد وستحتاج إلى اتصال محلي عبر كابل WinBox.',
                            style: TextStyle(
                              color: context.textPrimary,
                              fontSize: 11,
                              height: 1.45,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    _buildSuccessRow('الجهاز المستهدف:', '${currentRouter.name} (${currentRouter.host})'),
                    const SizedBox(height: 6),
                    _buildSuccessRow('ملف النسخة:', filename, isBold: true),
                    const SizedBox(height: 12),
                    TextField(
                      controller: passController,
                      obscureText: true,
                      style: TextStyle(color: context.textPrimary, fontSize: 13),
                      decoration: InputDecoration(
                        labelText: 'كلمة مرور النسخة (إن وجدت)',
                        labelStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                        hintText: 'اتركه فارغاً إذا لم تكن النسخة مشفرة',
                        hintStyle: TextStyle(color: context.textSecondary.withValues(alpha: 0.6), fontSize: 11),
                        prefixIcon: const Icon(Icons.lock_outline, size: 18, color: Color(0xFFF59E0B)),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: isRestoring
                          ? null
                          : () {
                              setDialogState(() {
                                confirmed = !confirmed;
                              });
                            },
                      borderRadius: BorderRadius.circular(8),
                      child: Row(
                        children: [
                          Checkbox(
                            value: confirmed,
                            activeColor: const Color(0xFFEF4444),
                            onChanged: isRestoring
                                ? null
                                : (v) {
                                    setDialogState(() {
                                      confirmed = v ?? false;
                                    });
                                  },
                          ),
                          Expanded(
                            child: Text(
                              'أقر بأنني على دراية بأن الراوتر سيعيد التشغيل وقد يستبدل العناوين الحالية.',
                              style: TextStyle(
                                color: context.textPrimary,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (localError != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.red.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          localError!,
                          style: const TextStyle(color: Colors.redAccent, fontSize: 11),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              actions: [
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: isRestoring ? null : () => Navigator.pop(dialogCtx),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: context.borderColor),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton.icon(
                        onPressed: (!confirmed || isRestoring)
                            ? null
                            : () async {
                                final passVal = passController.text.trim();
                                setDialogState(() {
                                  isRestoring = true;
                                  localError = null;
                                });

                                final res = await ref.read(routersProvider.notifier).restoreBackup(
                                      currentRouter.id,
                                      filename,
                                      password: passVal.isNotEmpty ? passVal : null,
                                      confirmed: true,
                                    );

                                if (!dialogCtx.mounted) return;

                                if (res['success'] == true) {
                                  Navigator.pop(dialogCtx);
                                  _showRestoreSuccessDialog(
                                    currentRouter: currentRouter,
                                    filename: filename,
                                    message: res['message']?.toString() ??
                                        'تم إرسال أمر الاستعادة بنجاح، جاري إعادة تشغيل الراوتر',
                                  );
                                } else {
                                  setDialogState(() {
                                    isRestoring = false;
                                    localError = res['message']?.toString() ??
                                        'فشلت عملية استعادة النسخة الاحتياطية';
                                  });
                                }
                              },
                        icon: isRestoring
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.restore, size: 18, color: Colors.white),
                        label: Text(
                          isRestoring ? 'جارٍ الاستعادة...' : 'تأكيد واستعادة الآن',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFEF4444),
                          disabledBackgroundColor: Colors.grey.withValues(alpha: 0.3),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showRestoreSuccessDialog({
    required RouterDeviceModel currentRouter,
    required String filename,
    required String message,
  }) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0xFFF59E0B), width: 1.5),
        ),
        title: Row(
          children: [
            const Icon(Icons.published_with_changes, color: Color(0xFFF59E0B), size: 28),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'بدء استعادة النسخة الاحتياطية',
                style: TextStyle(
                  color: context.textPrimary,
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                ),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message,
              style: TextStyle(color: context.textSecondary, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.bgCardAlt,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: context.borderColor),
              ),
              child: Column(
                children: [
                  _buildSuccessRow('الجهاز:', '${currentRouter.name} (${currentRouter.host})'),
                  const SizedBox(height: 6),
                  _buildSuccessRow('النسخة المستعادة:', filename, isBold: true),
                  const SizedBox(height: 6),
                  _buildSuccessRow('حالة الراوتر:', 'جاري إعادة التشغيل (Rebooting)'),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.info_outline, color: Color(0xFFF59E0B), size: 16),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'تم قطع الاتصال بالراوتر تمهيداً لإعادة تشغيله وتطبيق النسخة. انتظر دقيقة ثم قم باختبار الاتصال مجدداً.',
                    style: TextStyle(color: context.textSecondary, fontSize: 11),
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(routersProvider.notifier).refresh();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF59E0B),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            ),
            child: const Text('حسناً، فهمت',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }


  Widget _buildSuccessRow(String label, String value, {bool isBold = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: context.textSecondary, fontSize: 11)),
        Flexible(
          child: Text(
            value,
            style: TextStyle(
              color: isBold ? const Color(0xFF38BDF8) : context.textPrimary,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
              fontSize: 12,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  Future<void> _handleEmergencyLock(RouterDeviceModel router) async {
    final willLock = !router.isLocked;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: context.borderColor),
        ),
        title: Row(
          children: [
            Icon(
              willLock ? Icons.warning_amber_rounded : Icons.lock_open,
              color: willLock ? Colors.redAccent : Colors.greenAccent,
            ),
            const SizedBox(width: 8),
            Text(
              willLock ? 'تأكيد قفل الطوارئ' : 'إلغاء قفل الطوارئ',
              style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ],
        ),
        content: Text(
          willLock
              ? 'تنبيه أمني هام:\nسيتم إضافة وتفعيل قاعدة حظر فورية (Drop Filter) في جدار حماية الراوتر (Firewall) لمنع جميع حركة مرور بيانات الإنترنت عن المشتركين.\n\nهل تريد تنفيذ القفل فوراً؟'
              : 'سيتم تعطيل قاعدة الحظر في جدار حماية الراوتر واستئناف خدمة الإنترنت لجميع المشتركين.\n\nهل تريد المتابعة؟',
          style: TextStyle(color: context.textSecondary, fontSize: 13, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: willLock ? Colors.red.shade700 : Colors.green.shade700,
              foregroundColor: Colors.white,
            ),
            child: Text(willLock ? 'تفعيل القفل فوراً' : 'استئناف المرور'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _isTogglingLock = true);
      final result = await ref
          .read(routersProvider.notifier)
          .toggleEmergencyLock(router.id, willLock);
      if (!mounted) return;
      setState(() => _isTogglingLock = false);

      final success = result['success'] == true;
      final msg = result['message']?.toString() ??
          (success
              ? (willLock ? 'تم تفعيل قفل الطوارئ في الراوتر بنجاح' : 'تم فك قفل الطوارئ')
              : 'فشلت العملية');

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: success
              ? (willLock ? Colors.red.shade700 : Colors.green.shade700)
              : Colors.red.shade900,
          duration: const Duration(seconds: 4),
        ),
      );
    }
  }

  Future<void> _handleAntiTethering(RouterDeviceModel router) async {
    final willEnable = !router.antiTetheringEnabled;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: context.borderColor),
        ),
        title: Row(
          children: [
            Icon(
              Icons.shield_outlined,
              color: willEnable ? const Color(0xFF38BDF8) : Colors.amber,
            ),
            const SizedBox(width: 8),
            Text(
              willEnable ? 'تفعيل حظر البث (TTL=1)' : 'تعطيل حظر البث (TTL)',
              style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ],
        ),
        content: Text(
          willEnable
              ? 'سيتم إضافة وتفعيل قاعدة Mangle في الراوتر (change-ttl new-ttl=1) لمنع المشتركين من إعادة توزيع وبث باقات الإنترنت عبر نقاط اتصال أو هواتف أخرى.\n\nهل تريد تفعيل الحماية؟'
              : 'سيتم تعطيل قاعدة حظر توزيع الإنترنت (TTL) في الراوتر والسماح بتمرير الحزم بالقيمة الافتراضية.\n\nهل تريد المتابعة؟',
          style: TextStyle(color: context.textSecondary, fontSize: 13, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: willEnable ? const Color(0xFF2563EB) : Colors.amber.shade800,
              foregroundColor: Colors.white,
            ),
            child: Text(willEnable ? 'تفعيل الحماية' : 'تعطيل الحظر'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _isTogglingAntiTethering = true);
      final result = await ref
          .read(routersProvider.notifier)
          .toggleAntiTethering(router.id, willEnable);
      if (!mounted) return;
      setState(() => _isTogglingAntiTethering = false);

      final success = result['success'] == true;
      final msg = result['message']?.toString() ??
          (success
              ? (willEnable
                  ? 'تم تفعيل حماية Anti-Tethering (TTL=1) على الراوتر'
                  : 'تم تعطيل حماية Anti-Tethering')
              : 'فشلت العملية');

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: success
              ? (willEnable ? Colors.blue.shade700 : Colors.grey.shade800)
              : Colors.red.shade900,
          duration: const Duration(seconds: 4),
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
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        leading: widget.onOpenDrawer != null
            ? IconButton(
                icon: Icon(Icons.menu_rounded, color: context.textPrimary),
                tooltip: 'القائمة الجانبية',
                onPressed: widget.onOpenDrawer,
              )
            : null,
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
              children: [
                Text(
                  'سودافاي | SudaFi',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: context.textPrimary,
                  ),
                ),
                Text(
                  'لوحة التحكم والتشغيل المباشر',
                  style: TextStyle(fontSize: 11, color: context.textSecondary),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: _isSyncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
                  )
                : const Icon(Icons.sync, color: Color(0xFF38BDF8)),
            tooltip: 'مزامنة وتحديث البيانات',
            onPressed: _isSyncing ? null : _handleSyncAndRefresh,
          ),
          IconButton(
            icon: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: (ref.watch(themeModeProvider) == ThemeMode.light
                        ? const Color(0xFFF59E0B)
                        : const Color(0xFF38BDF8))
                    .withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(
                ref.watch(themeModeProvider) == ThemeMode.light
                    ? Icons.dark_mode_outlined
                    : Icons.light_mode_outlined,
                color: ref.watch(themeModeProvider) == ThemeMode.light
                    ? const Color(0xFFF59E0B)
                    : const Color(0xFF38BDF8),
                size: 18,
              ),
            ),
            tooltip: ref.watch(themeModeProvider) == ThemeMode.light
                ? 'التبديل إلى الوضع الداكن'
                : 'التبديل إلى الوضع الفاتح',
            onPressed: () {
              ref.read(themeModeProvider.notifier).toggleTheme();
            },
          ),
          if (widget.onOpenUserProfile != null)
            IconButton(
              icon: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: const Color(0xFF38BDF8).withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.person_outline, color: Color(0xFF38BDF8), size: 18),
              ),
              tooltip: 'حسابي وإعدادات الأمان',
              onPressed: widget.onOpenUserProfile,
            ),
          if (widget.onLogout != null)
            IconButton(
              icon: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.logout_rounded, color: Color(0xFFF87171), size: 18),
              ),
              tooltip: 'تسجيل الخروج',
              onPressed: widget.onLogout,
            ),
          const SizedBox(width: 4),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _handleSyncAndRefresh,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Subscription Status Banner for Non-Subscribed / Expired Accounts
              ref.watch(tenantQuotaProvider).when(
                data: (quota) {
                  final currentUser = ref.watch(currentUserProvider);
                  final isSuperAdmin = currentUser?.role.toUpperCase() == 'SUPER_ADMIN';
                  if (isSuperAdmin) return const SizedBox.shrink();

                  final status = quota?.status ?? currentUser?.subscriptionStatus ?? 'NONE';
                  final isTrial = status == 'TRIAL';
                  final expiresAt = quota?.expiresAt ?? currentUser?.subscriptionExpiresAt;
                  final isTrialExpired = isTrial && expiresAt != null && DateTime.now().isAfter(expiresAt);

                  // If active paid subscription (ACTIVE and not TRIAL), do not show banner
                  if (status == 'ACTIVE' && !isTrial) return const SizedBox.shrink();

                  final isExpired = status == 'EXPIRED' || isTrialExpired;
                  final isSuspended = status == 'SUSPENDED';
                  final wasTrial = isTrial || quota?.planName == 'TRIAL' || currentUser?.subscriptionPlan == 'TRIAL';

                  // If active 48-Hour Free Trial
                  if (isTrial && !isTrialExpired) {
                    final remaining = expiresAt?.difference(DateTime.now());
                    final remainingHours = remaining != null ? remaining.inHours : 0;
                    final remainingMinutes = remaining != null ? (remaining.inMinutes % 60) : 0;
                    final remainingText = remaining != null
                        ? (remainingHours > 0
                            ? '$remainingHours ساعة و $remainingMinutes دقيقة'
                            : '$remainingMinutes دقيقة')
                        : '48 ساعة';

                    return Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            const Color(0xFF0F766E).withValues(alpha: 0.25),
                            const Color(0xFF0369A1).withValues(alpha: 0.20),
                          ],
                          begin: Alignment.topRight,
                          end: Alignment.bottomLeft,
                        ),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: const Color(0xFF0D9488).withValues(alpha: 0.5),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0D9488).withValues(alpha: 0.3),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(
                              Icons.verified_rounded,
                              color: Color(0xFF2DD4BF),
                              size: 22,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    const Text(
                                      'الباقة التجريبية المجانية',
                                      style: TextStyle(
                                        color: Color(0xFF5EEAD4),
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                      ),
                                    ),
                                    const Spacer(),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF2DD4BF).withValues(alpha: 0.2),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(color: const Color(0xFF2DD4BF).withValues(alpha: 0.4)),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(Icons.timer_outlined, size: 12, color: Color(0xFF2DD4BF)),
                                          const SizedBox(width: 4),
                                          Text(
                                            'متبقي $remainingText',
                                            style: const TextStyle(
                                              color: Color(0xFFCCFBF1),
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'جميع ميزات النظام والصلاحيات مفعلة بالكامل لتجربة الخدمة (توليد الكروت، إدارة الرواتر، والتقارير).',
                                  style: TextStyle(
                                    color: context.textSecondary,
                                    fontSize: 11,
                                    height: 1.35,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                WhatsAppButton(
                                  type: WhatsAppActionType.subscription,
                                  label: 'الترقية للباقات المدفوعة عبر واتساب',
                                  planName: 'PRO',
                                  fontSize: 11,
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  return Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: isExpired || isSuspended
                          ? const Color(0xFFEF4444).withValues(alpha: 0.12)
                          : const Color(0xFF0F766E).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isExpired || isSuspended
                            ? const Color(0xFFEF4444).withValues(alpha: 0.4)
                            : const Color(0xFF0D9488).withValues(alpha: 0.4),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isExpired || isSuspended
                                ? const Color(0xFFEF4444).withValues(alpha: 0.2)
                                : const Color(0xFF0D9488).withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            isExpired ? Icons.timer_off_outlined : (isSuspended ? Icons.block_rounded : Icons.info_outline_rounded),
                            color: isExpired || isSuspended ? const Color(0xFFF87171) : const Color(0xFF2DD4BF),
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                isExpired
                                    ? (wasTrial ? 'انتهت الفترة التجريبية المجانية (48 ساعة)' : 'انتهت صلاحية باقة الاشتراك')
                                    : (isSuspended ? 'الحساب معلق مؤقتاً' : 'تفعيل باقة الاشتراك مطلوب'),
                                style: TextStyle(
                                  color: isExpired || isSuspended ? const Color(0xFFFCA5A5) : const Color(0xFF5EEAD4),
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                isExpired
                                    ? (wasTrial
                                        ? 'انتهت فترة الـ 48 ساعة التجريبية لحسابك. للاستمرار في استخدام ميزات النظام وربط الموجهات وتوليد الكروت، يرجى اختيار إحدى الباقات المدفوعة.'
                                        : 'انتهت صلاحية باقتك السابقة؛ يرجى التواصل لتجديد الاشتراك واستئناف العمليات.')
                                    : (isSuspended
                                        ? 'تم تعليق هذا الحساب مؤقتاً؛ يرجى التواصل مع إدارة المنصة.'
                                        : 'يمكنك استعراض النظام؛ ولتفعيل ربط موجهات ميكروتك وتوليد الكروت، يرجى تفعيل باقة الاشتراك.'),
                                style: TextStyle(
                                  color: context.textSecondary,
                                  fontSize: 11,
                                  height: 1.35,
                                ),
                              ),
                              const SizedBox(height: 10),
                              WhatsAppButton(
                                type: isSuspended ? WhatsAppActionType.support : WhatsAppActionType.subscription,
                                label: isExpired
                                    ? (wasTrial ? 'اختيار باقة مدفوعة والاشتراك' : 'تجديد الاشتراك عبر واتساب')
                                    : (isSuspended ? 'تواصل مع الدعم الفني' : 'طلب تفعيل الاشتراك عبر واتساب'),
                                planName: wasTrial ? 'BASIC' : (quota?.planNameAr ?? quota?.planName),
                                fontSize: 11,
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),

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
                  final isCached = ref.read(routersProvider.notifier).isUsingCachedData;
                  return Column(
                    children: [
                      if (isCached)
                        Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: context.isDarkMode
                                ? Colors.amber.withValues(alpha: 0.15)
                                : const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: context.isDarkMode
                                  ? Colors.amber.withValues(alpha: 0.4)
                                  : const Color(0xFFF59E0B).withValues(alpha: 0.5),
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.cloud_off_rounded,
                                color: context.isDarkMode ? Colors.amber : const Color(0xFFB45309),
                                size: 18,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'يتم عرض آخر بيانات محفوظة محلياً؛ تعذر الاتصال بالخادم للتحديث المباشر.',
                                  style: TextStyle(
                                    color: context.isDarkMode ? const Color(0xFFFDE68A) : const Color(0xFF92400E),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              TextButton(
                                onPressed: () => ref.read(routersProvider.notifier).refresh(),
                                style: TextButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  minimumSize: Size.zero,
                                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                ),
                                child: Text(
                                  'تحديث الآن',
                                  style: TextStyle(
                                    color: context.isDarkMode ? const Color(0xFF38BDF8) : const Color(0xFF0284C7),
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
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
                error: (err, _) => _buildRouterFetchErrorCard(err),
              ),

              const SizedBox(height: 16),

              // KPI Financial Banner Card
              routersAsync.when(
                data: (routers) {
                  final currentRouter = routers.isNotEmpty
                      ? routers.firstWhere(
                          (r) => r.id == selectedRouterId,
                          orElse: () => routers.first,
                        )
                      : null;
                  final isRouterOnline = currentRouter?.isOnline ?? false;

                  return financeAsync.when(
                    data: (finance) => sessionsAsync.when(
                      data: (sessions) => _buildKpiMetricsCard(
                        finance: finance,
                        isRouterOnline: isRouterOnline,
                        connectedUsersCount: sessions.length,
                        isLoadingSessions: false,
                      ),
                      loading: () => _buildKpiMetricsCard(
                        finance: finance,
                        isRouterOnline: isRouterOnline,
                        connectedUsersCount: null,
                        isLoadingSessions: true,
                      ),
                      error: (_, _) => _buildKpiMetricsCard(
                        finance: finance,
                        isRouterOnline: false,
                        connectedUsersCount: null,
                        isLoadingSessions: false,
                      ),
                    ),
                    loading: () => const SizedBox(
                      height: 80,
                      child: Center(child: CircularProgressIndicator()),
                    ),
                    error: (_, _) => _buildKpiMetricsCard(
                      finance: null,
                      isRouterOnline: isRouterOnline,
                      connectedUsersCount: null,
                      isLoadingSessions: false,
                    ),
                  );
                },
                loading: () => const SizedBox(
                  height: 80,
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (_, _) => _buildKpiMetricsCard(
                  finance: null,
                  isRouterOnline: false,
                  connectedUsersCount: null,
                  isLoadingSessions: false,
                ),
              ),

              const SizedBox(height: 20),

              // Quick Actions Grid Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'الوصول السريع والإجراءات',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: context.textPrimary,
                    ),
                  ),
                  const Text(
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
                  Text(
                    'المستخدمون المتصلون الآن (الرادار)',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: context.textPrimary,
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _navigateToRadar,
                    icon: const Icon(Icons.arrow_back, size: 16, color: Color(0xFF38BDF8)),
                    label: const Text('عرض الكل', style: TextStyle(color: Color(0xFF38BDF8))),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              routersAsync.when(
                data: (routers) {
                  final currentRouter = routers.isNotEmpty
                      ? routers.firstWhere(
                          (r) => r.id == selectedRouterId,
                          orElse: () => routers.first,
                        )
                      : null;

                  if (currentRouter != null && !currentRouter.isOnline) {
                    return Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: context.bgCard,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: context.borderColor),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.wifi_off, color: Colors.redAccent.withValues(alpha: 0.8), size: 22),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'الراوتر غير متصل حالياً؛ لا يمكن جلب جلسات المستخدمين اللحظية (الرادار). اضغط فحص الاتصال للتحقق.',
                              style: TextStyle(color: context.textSecondary, fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  return sessionsAsync.when(
                    data: (sessions) => _buildRecentSessionsList(sessions),
                    loading: () => const Center(
                      child: Padding(
                        padding: EdgeInsets.all(16.0),
                        child: CircularProgressIndicator(),
                      ),
                    ),
                    error: (_, _) => Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: context.bgCard,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Center(
                        child: Text(
                          'تعذر جلب جلسات الهوتسبوت من الراوتر',
                          style: TextStyle(color: context.textSecondary, fontSize: 12),
                        ),
                      ),
                    ),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, _) => const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRouterFetchErrorCard(Object? error) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.wifi_off_rounded, color: Colors.amber, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'تعذر تحديث بيانات أجهزة الراوتر',
                  style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold),
                ),
                Text(
                  'حدث خطأ مؤقت أثناء الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.',
                  style: TextStyle(color: context.textSecondary, fontSize: 12),
                ),
              ],
            ),
          ),
          ElevatedButton.icon(
            onPressed: () {
              ref.read(routersProvider.notifier).refresh();
            },
            icon: const Icon(Icons.refresh, size: 16, color: Colors.white),
            label: const Text('إعادة المحاولة', style: TextStyle(color: Colors.white, fontSize: 12)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyRouterCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.bgCard,
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
              children: [
                Text(
                  'لم يتم ربط راوتر نشط',
                  style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold),
                ),
                Text(
                  'اضغط على إعداد الراوتر لتهيئة بيانات الربط عبر API أو REST',
                  style: TextStyle(color: context.textSecondary, fontSize: 12),
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
        color: context.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: Row(
        children: [
          const Icon(Icons.dns, color: Color(0xFF38BDF8), size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: selected.id,
                dropdownColor: context.bgCard,
                isExpanded: true,
                style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold),
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
          const SizedBox(width: 6),
          // Test connection action button
          InkWell(
            onTap: _isTestingConnection ? null : () => _testRouterConnection(selected),
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: context.bgCardAlt,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_isTestingConnection)
                    const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
                    )
                  else
                    const Icon(Icons.wifi_find, size: 14, color: Color(0xFF38BDF8)),
                  const SizedBox(width: 4),
                  Text(
                    _isTestingConnection ? 'جارٍ الفحص' : 'فحص',
                    style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 6),
          // Online / Offline Status Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: selected.isOnline
                  ? Colors.green.withValues(alpha: 0.2)
                  : Colors.red.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected.isOnline ? Colors.green : Colors.red,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: selected.isOnline ? Colors.greenAccent : Colors.redAccent,
                    shape: BoxShape.circle,
                  ),
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
          const SizedBox(width: 6),
          // Quick Add Router button
          Tooltip(
            message: 'إضافة راوتر جديد إلى باقتك',
            child: InkWell(
              onTap: widget.onOpenRouterSetup,
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFF2563EB).withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.5)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(Icons.add, size: 14, color: Color(0xFF38BDF8)),
                    SizedBox(width: 2),
                    Text(
                      'إضافة',
                      style: TextStyle(
                        color: Color(0xFF38BDF8),
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRouterHealthCard(RouterDeviceModel router) {
    final isOnline = router.isOnline;

    // CPU Metrics
    final String cpuStr;
    final double cpuRatio;
    final Color cpuColor;
    if (isOnline && router.cpuLoad != null) {
      final cpu = router.cpuLoad!;
      cpuStr = '$cpu%';
      cpuRatio = (cpu / 100.0).clamp(0.0, 1.0);
      cpuColor = _getColorForPercent(cpu);
    } else {
      cpuStr = 'غير متاح';
      cpuRatio = 0.0;
      cpuColor = Colors.grey;
    }

    // RAM Metrics
    final String ramStr;
    final double ramRatio;
    final Color ramColor;
    if (isOnline &&
        router.memoryTotalMb != null &&
        router.memoryTotalMb! > 0 &&
        router.memoryFreeMb != null) {
      final memTotal = router.memoryTotalMb!;
      final memFree = router.memoryFreeMb!;
      final memUsed = (memTotal - memFree).clamp(0, memTotal);
      final memPct = ((memUsed / memTotal) * 100).round().clamp(0, 100);
      ramStr = '$memPct%';
      ramRatio = (memPct / 100.0).clamp(0.0, 1.0);
      ramColor = _getColorForPercent(memPct);
    } else {
      ramStr = 'غير متاح';
      ramRatio = 0.0;
      ramColor = Colors.grey;
    }

    // DISK Metrics
    final String diskStr;
    final double diskRatio;
    final Color diskColor;
    if (isOnline &&
        router.diskTotalMb != null &&
        router.diskTotalMb! > 0 &&
        router.diskFreeMb != null) {
      final diskTotal = router.diskTotalMb!;
      final diskFree = router.diskFreeMb!;
      final diskUsed = (diskTotal - diskFree).clamp(0, diskTotal);
      final diskPct = ((diskUsed / diskTotal) * 100).round().clamp(0, 100);
      diskStr = '$diskPct%';
      diskRatio = (diskPct / 100.0).clamp(0.0, 1.0);
      diskColor = _getColorForPercent(diskPct);
    } else {
      diskStr = 'غير متاح';
      diskRatio = 0.0;
      diskColor = Colors.grey;
    }

    final uptimeStr = isOnline ? (router.uptime ?? 'نشط') : 'غير متصل';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: context.isDarkMode
              ? const [Color(0xFF1E293B), Color(0xFF0F172A)]
              : const [Colors.white, Color(0xFFF1F5F9)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: router.isLocked ? Colors.red.withValues(alpha: 0.5) : context.borderColor,
          width: router.isLocked ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: context.isDarkMode
                ? Colors.black.withValues(alpha: 0.3)
                : Colors.black.withValues(alpha: 0.05),
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
                    style: TextStyle(
                      color: context.textPrimary,
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
                'العمل: $uptimeStr',
                style: TextStyle(color: context.textSecondary, fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // 3 Metric Gauges (CPU, RAM, DISK)
          Row(
            children: [
              Expanded(
                child: _buildMetricGauge(
                  'المعالج CPU',
                  cpuStr,
                  cpuRatio,
                  cpuColor,
                  isAvailable: isOnline && router.cpuLoad != null,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildMetricGauge(
                  'الذاكرة RAM',
                  ramStr,
                  ramRatio,
                  ramColor,
                  isAvailable: isOnline && router.memoryTotalMb != null,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildMetricGauge(
                  'القرص DISK',
                  diskStr,
                  diskRatio,
                  diskColor,
                  isAvailable: isOnline && router.diskTotalMb != null,
                ),
              ),
            ],
          ),

          if (!isOnline) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: context.isDarkMode
                    ? Colors.amber.withValues(alpha: 0.1)
                    : const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: context.isDarkMode
                      ? Colors.amber.withValues(alpha: 0.3)
                      : const Color(0xFFF59E0B).withValues(alpha: 0.5),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_outline,
                    color: context.isDarkMode ? Colors.amber : const Color(0xFFB45309),
                    size: 16,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      router.host.startsWith('192.168.') ||
                              router.host.startsWith('10.') ||
                              router.host.startsWith('172.')
                          ? 'الراوتر بعنوان LAN خاص (${router.host}). يلزم VPN/وكيل شبكي للاتصال من السحابة، أو اضغط فحص الاتصال.'
                          : 'الراوتر غير متصل حالياً بالخادم. قراءات المعالج والذاكرة غير متاحة لحظياً.',
                      style: TextStyle(
                        color: context.isDarkMode ? const Color(0xFFFDE68A) : const Color(0xFF92400E),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 16),
          Divider(color: context.borderColor, height: 1),
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
                          : context.bgCardAlt,
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
                            router.isLocked ? 'قفل الطوارئ (نشط)' : 'قفل الطوارئ',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: router.isLocked ? Colors.redAccent : context.textPrimary,
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
                          : context.bgCardAlt,
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
                          router.antiTetheringEnabled
                              ? Icons.shield
                              : Icons.shield_outlined,
                          color: router.antiTetheringEnabled
                              ? const Color(0xFF38BDF8)
                              : Colors.grey,
                          size: 18,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            router.antiTetheringEnabled ? 'حظر البث (نشط)' : 'حظر البث (TTL)',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: router.antiTetheringEnabled
                                  ? const Color(0xFF38BDF8)
                                  : context.textPrimary,
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

  Widget _buildMetricGauge(
    String label,
    String valueStr,
    double ratio,
    Color color, {
    bool isAvailable = true,
  }) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: context.bgCardAlt,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        children: [
          Text(label, style: TextStyle(color: context.textSecondary, fontSize: 10)),
          const SizedBox(height: 6),
          Text(
            valueStr,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.bold,
              fontSize: isAvailable ? 14 : 11,
            ),
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: ratio.clamp(0.0, 1.0),
              backgroundColor: context.borderColor,
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

  Widget _buildKpiMetricsCard({
    required FinancialReportModel? finance,
    required bool isRouterOnline,
    required int? connectedUsersCount,
    required bool isLoadingSessions,
  }) {
    // 1. Reconcile server transactions with any local offline receipts for today
    final storage = ref.read(localStorageProvider);
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    final localReceipts = storage.getSalesHistory();
    final todayLocalSales = localReceipts.where(
      (r) => r.soldAt.isAfter(startOfToday) && r.isOffline,
    );
    final localTodayRev = todayLocalSales.fold<double>(0.0, (acc, r) => acc + r.amount);
    final localTodayCount = todayLocalSales.length;

    final baseRev = finance?.todayRevenue ?? 0.0;
    final totalRevenue = baseRev + localTodayRev;
    final baseCount = finance?.todaySalesCount ?? 0;
    final totalSalesCount = baseCount + localTodayCount;
    final currency = finance?.currency ?? 'SDG';

    // 2. Format connected users
    String connectedStr;
    if (!isRouterOnline) {
      connectedStr = 'غير متاح';
    } else if (isLoadingSessions) {
      connectedStr = '...';
    } else {
      connectedStr = '${connectedUsersCount ?? 0} جهاز';
    }

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
            '${totalRevenue.toStringAsFixed(0)} $currency',
            Icons.account_balance_wallet,
          ),
          Container(width: 1, height: 40, color: Colors.white.withValues(alpha: 0.2)),
          _buildKpiItem(
            'كروت مباعة',
            '$totalSalesCount كرت',
            Icons.credit_card,
          ),
          Container(width: 1, height: 40, color: Colors.white.withValues(alpha: 0.2)),
          _buildKpiItem(
            'المتصلون الآن',
            connectedStr,
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
        Text(val, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        const SizedBox(height: 2),
        Text(title, style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 10)),
      ],
    );
  }

  Widget _buildQuickActionsGrid() {
    final actions = [
      _ActionItem(
        'إنشاء كروت',
        Icons.auto_awesome,
        const Color(0xFF8B5CF6),
        () => widget.onNavigateTab?.call(2),
      ),
      _ActionItem(
        'قوالب الطباعة',
        Icons.palette_outlined,
        const Color(0xFFA855F7),
        widget.onOpenTemplates,
      ),
      _ActionItem(
        'مصمم صفحات الهوتسبوت',
        Icons.brush_outlined,
        const Color(0xFF0EA5E9),
        _navigateToPortalDesigner,
      ),
      _ActionItem(
        'نقطة البيع (POS)',
        Icons.point_of_sale,
        const Color(0xFF10B981),
        widget.onOpenPos,
      ),
      _ActionItem(
        'الكروت',
        Icons.inventory_2,
        const Color(0xFF3B82F6),
        () => widget.onNavigateTab?.call(1),
      ),
      _ActionItem(
        'بروفايلات',
        Icons.speed,
        const Color(0xFFF59E0B),
        widget.onOpenProfiles,
      ),
      _ActionItem(
        'اشتراكات PPPoE',
        Icons.settings_ethernet,
        const Color(0xFF06B6D4),
        widget.onOpenPppoe,
      ),
      _ActionItem(
        'الرادار',
        Icons.radar,
        const Color(0xFF06B6D4),
        _navigateToRadar,
      ),
      _ActionItem(
        'برمجة المايكروتيك',
        Icons.settings_suggest_rounded,
        const Color(0xFF8B5CF6),
        _navigateToRouterProvisioning,
      ),
      _ActionItem(
        'أجهزة البث',
        Icons.devices_other_rounded,
        const Color(0xFF0284C7),
        _navigateToConnectedDevices,
      ),
      _ActionItem(
        'النسخ الاحتياطي للمايكروتك',
        Icons.backup_outlined,
        const Color(0xFF10B981),
        _handleRouterBackup,
      ),
      _ActionItem(
        'محفظة الأوفلاين',
        Icons.wallet,
        const Color(0xFF14B8A6),
        widget.onOpenOfflineWallet,
      ),
      _ActionItem(
        'مركز المزامنة',
        Icons.sync,
        const Color(0xFFF97316),
        widget.onOpenSync,
      ),
      _ActionItem(
        'تقارير',
        Icons.bar_chart,
        const Color(0xFFF59E0B),
        () => widget.onNavigateTab?.call(4),
      ),
      _ActionItem(
        'فريق العمل والصلاحيات',
        Icons.people_outline,
        const Color(0xFFEC4899),
        widget.onOpenTenantUsers,
      ),
      _ActionItem(
        'حسابي والأمان',
        Icons.person_pin_outlined,
        const Color(0xFF38BDF8),
        widget.onOpenUserProfile,
      ),
    ];

    final screenWidth = MediaQuery.of(context).size.width;
    final crossAxisCount = screenWidth > 900 ? 5 : (screenWidth > 600 ? 4 : 3);

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: actions.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.borderColor),
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
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: context.textPrimary,
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
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.borderColor),
        ),
        child: Center(
          child: Text(
            'لا توجد جلسات نشطة حالياً على الراوتر',
            style: TextStyle(color: context.textSecondary, fontSize: 12),
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
            color: context.bgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.borderColor),
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
                      style: TextStyle(
                        color: context.textPrimary,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      '${s.address} • ${s.macAddress}',
                      style: TextStyle(color: context.textSecondary, fontSize: 11),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${s.totalMb.toStringAsFixed(1)} MB',
                    style: TextStyle(
                      color: context.skyColor,
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
