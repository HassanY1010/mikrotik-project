// ignore_for_file: deprecated_member_use
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../services/hotspot_portal_validator.dart';

enum PortalViewMode {
  twoOptions, // Initial screen displaying ONLY the 2 choices
  readyMade, // Option 1: Ready-made templates viewer & deployer
  imported, // Option 2: Import custom portal from phone storage
}

class HotspotPortalDesignerScreen extends ConsumerStatefulWidget {
  const HotspotPortalDesignerScreen({super.key});

  @override
  ConsumerState<HotspotPortalDesignerScreen> createState() => _HotspotPortalDesignerScreenState();
}

class _HotspotPortalDesignerScreenState extends ConsumerState<HotspotPortalDesignerScreen> {
  PortalViewMode _currentMode = PortalViewMode.twoOptions;

  // Selected preset for Ready-Made templates
  String _selectedPresetKey = 'MODERN_DARK';
  String? _selectedRouterId;
  bool _isInspecting = false;
  bool _isPublishing = false;

  // Presets Definition
  final Map<String, Map<String, dynamic>> _presets = {
    'MODERN_DARK': {
      'name': 'الوضع الداكن العصري (Modern Dark)',
      'network': 'شبكة ستارلينك الفضائية',
      'title': 'مرحباً بكم في شبكتنا',
      'subtitle': 'أدخل كود كرت الإنترنت لبدء التصفح الفوري',
      'primary': const Color(0xFF0EA5E9),
      'accent': const Color(0xFF10B981),
      'bg': const Color(0xFF0F172A),
      'card': const Color(0xFF1E293B),
      'text': const Color(0xFFF8FAFC),
      'footer': 'مدعوم بواسطة منصة SudaFi',
      'badge': 'الأكثر شعبية',
    },
    'STARLINK_CYAN': {
      'name': 'أزرق ستارلينك الفضائي (Starlink Cyan)',
      'network': 'Starlink Satellite High-Speed',
      'title': 'بوابة الاتصال بالإنترنت',
      'subtitle': 'إنترنت فضائي فائق السرعة عبر شبكة Starlink',
      'primary': const Color(0xFF06B6D4),
      'accent': const Color(0xFF3B82F6),
      'bg': const Color(0xFF082F49),
      'card': const Color(0xFF0C4A6E),
      'text': const Color(0xFFF0FDFA),
      'footer': 'Powered by Starlink & SudaFi',
      'badge': 'اتصال فضائي',
    },
    'SUNSET_GOLD': {
      'name': 'غروب الشمس الذهبي (Sunset Gold)',
      'network': 'شبكة الأفق الذهبية',
      'title': 'سجل دخولك الآن',
      'subtitle': 'إنترنت سريع واستقرار عالي لكافة الاستخدامات',
      'primary': const Color(0xFFF59E0B),
      'accent': const Color(0xFFEF4444),
      'bg': const Color(0xFF1C1917),
      'card': const Color(0xFF292524),
      'text': const Color(0xFFFEF3C7),
      'footer': 'شبكة الإنترنت المعتمدة — SudaFi',
      'badge': 'ألوان دافئة',
    },
    'MINIMAL_LIGHT': {
      'name': 'النمط الأبيض الهادئ (Minimal Clean)',
      'network': 'شبكة المدينة للإنترنت',
      'title': 'أهلاً بك',
      'subtitle': 'أدخل رقم الكرت لبدء التصفح المباشر',
      'primary': const Color(0xFF2563EB),
      'accent': const Color(0xFF10B981),
      'bg': const Color(0xFFF8FAFC),
      'card': const Color(0xFFFFFFFF),
      'text': const Color(0xFF0F172A),
      'footer': 'جميع الحقوق محفوظة © SudaFi',
      'badge': 'نمط كلاسيكي',
    },
  };

  // Imported bundle state
  ImportedPortalBundle? _importedBundle;
  bool _isProcessingFile = false;

  @override
  void initState() {
    super.initState();
    // Auto-select first router if available
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final routers = ref.read(routersProvider).value ?? [];
      if (routers.isNotEmpty && _selectedRouterId == null) {
        setState(() => _selectedRouterId = routers.first.id);
      }
    });
  }

  // Back button handling: returns to the 2-option home if inside a sub-flow
  void _handleBack() {
    if (_currentMode != PortalViewMode.twoOptions) {
      setState(() => _currentMode = PortalViewMode.twoOptions);
    } else {
      Navigator.of(context).pop();
    }
  }

  // ---------------------------------------------------------------------------
  // Option 2: File Picker & Validator Handler
  // ---------------------------------------------------------------------------
  Future<void> _pickFileFromPhone() async {
    setState(() => _isProcessingFile = true);
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['html', 'htm', 'zip'],
        withData: true,
      );

      if (!mounted) return;

      if (result == null || result.files.isEmpty) {
        setState(() => _isProcessingFile = false);
        return;
      }

      final file = result.files.first;
      final bytes = file.bytes;
      if (bytes == null || bytes.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تعذر قراءة محتوى الملف المحدد من ذاكرة الهاتف.'),
            backgroundColor: Color(0xFFEF4444),
          ),
        );
        setState(() => _isProcessingFile = false);
        return;
      }

      final ext = file.name.split('.').last.toLowerCase();
      ImportedPortalBundle bundle;
      if (ext == 'zip') {
        bundle = HotspotPortalValidator.processZipArchive(
          zipFilename: file.name,
          zipBytes: bytes,
        );
      } else {
        bundle = HotspotPortalValidator.processSingleHtml(
          filename: file.name,
          bytes: bytes,
        );
      }

      setState(() {
        _importedBundle = bundle;
        _currentMode = PortalViewMode.imported;
        _isProcessingFile = false;
      });
    } catch (e) {
      setState(() => _isProcessingFile = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('حدث خطأ أثناء معالجة الملف: $e'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Publishing Engine: Dynamic Directory Discovery, Overwrite Protection, Verify
  // ---------------------------------------------------------------------------
  Future<void> _deployPortalToRouter({
    required bool isReadyMade,
    bool forceOverwrite = false,
  }) async {
    final routers = ref.read(routersProvider).value ?? [];
    if (routers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('لا يوجد راوتر مرتبط بحسابك. يرجى إضافة راوتر أولاً.'),
          backgroundColor: Color(0xFFEF4444),
        ),
      );
      return;
    }

    final targetId = _selectedRouterId ?? routers.first.id;
    final selectedRouter = routers.firstWhere((r) => r.id == targetId, orElse: () => routers.first);

    setState(() => _isPublishing = true);

    try {
      final apiClient = ref.read(apiClientProvider);

      // 1. Inspect router HotSpot directory first if not forced
      if (!forceOverwrite) {
        setState(() => _isInspecting = true);
        try {
          final inspectRes = await apiClient.get(ApiEndpoints.portalInspectHotspot(targetId));
          final raw = inspectRes.data;
          final inspectData = (raw is Map && raw['data'] != null) ? raw['data'] : raw;

          final existingCount = inspectData is Map ? (inspectData['existingFilesCount'] ?? 0) : 0;
          final activeDir = inspectData is Map ? (inspectData['activeDirectory'] ?? 'hotspot') : 'hotspot';

          if (existingCount is int && existingCount > 0) {
            setState(() {
              _isInspecting = false;
              _isPublishing = false;
            });
            // Show overwrite warning dialog
            final confirmed = await _showOverwriteWarningDialog(
              routerName: selectedRouter.name,
              directoryName: activeDir.toString(),
              existingFilesCount: existingCount,
            );
            if (!confirmed) return;
            // Retry with forceOverwrite
            return _deployPortalToRouter(isReadyMade: isReadyMade, forceOverwrite: true);
          }
        } catch (_) {
          // Proceed if inspect endpoint is unavailable
        } finally {
          if (mounted) setState(() => _isInspecting = false);
        }
      }

      // 2. Prepare payload
      final Map<String, dynamic> payload = {
        'directoryName': 'hotspot',
        'applyToProfile': 'hsprof1',
        'overwriteConfirmed': forceOverwrite,
      };

      if (isReadyMade) {
        payload['themePreset'] = _selectedPresetKey;
      } else {
        if (_importedBundle == null || _importedBundle!.files.isEmpty) {
          throw Exception('لا توجد ملفات صالحة للرفع.');
        }
        payload['files'] = _importedBundle!.files.map((f) => f.toJson()).toList();
      }

      // 3. Send upload request to backend
      final res = await apiClient.post(
        ApiEndpoints.portalPublish(targetId),
        data: payload,
      );

      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      final msg = data is Map ? (data['message'] ?? 'تم نشر الصفحة والتحقق من وجودها بنجاح.') : 'تم النشر بنجاح.';
      final stagingDir = data is Map ? data['stagingDirectory']?.toString() : null;
      final origDir = data is Map ? data['originalHtmlDirectory']?.toString() : null;
      final origProf = data is Map ? data['originalProfileName']?.toString() : null;

      if (mounted) {
        _showSuccessDialog(
          routerName: selectedRouter.name,
          routerId: targetId,
          message: msg.toString(),
          filesCount: isReadyMade ? 2 : (_importedBundle?.files.length ?? 1),
          stagingDirectory: stagingDir,
          originalHtmlDirectory: origDir,
          profileName: origProf,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('فشل رفع صفحة الهوتسبوت: $e'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isPublishing = false;
          _isInspecting = false;
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Dialogs: Overwrite Warning & Deployment Success
  // ---------------------------------------------------------------------------
  Future<bool> _showOverwriteWarningDialog({
    required String routerName,
    required String directoryName,
    required int existingFilesCount,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.bgCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0xFFF59E0B), width: 1.5),
        ),
        title: Row(
          children: [
            const Icon(Icons.warning_amber_rounded, color: Color(0xFFF59E0B), size: 24),
            const SizedBox(width: 8),
            Text(
              'تأكيد استبدال الصفحة الحالية',
              style: TextStyle(color: ctx.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'المجلد ($directoryName) على الراوتر «$routerName» يحتوي بالفعل على ($existingFilesCount) ملفات لصفحة هوتسبوت سابقة.',
              style: TextStyle(color: ctx.textSecondary, fontSize: 13, height: 1.5),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.3)),
              ),
              child: const Text(
                'تنبيه: متابعة الرفع ستستبدل ملفات صفحة تسجيل الدخول الحالية فوراً. تأكد من أنك أخذت نسخة احتياطية من إعدادات الراوتر أولاً.',
                style: TextStyle(color: Color(0xFFF59E0B), fontSize: 12, height: 1.4),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('إلغاء', style: TextStyle(color: ctx.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('نعم، استبدل الصفحة الآن'),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  void _showSuccessDialog({
    required String routerName,
    required String routerId,
    required String message,
    required int filesCount,
    String? stagingDirectory,
    String? originalHtmlDirectory,
    String? profileName,
  }) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.bgCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0xFF10B981), width: 1.5),
        ),
        title: Row(
          children: [
            const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 24),
            const SizedBox(width: 8),
            Text(
              'تم النشر المرحلي والتحقق بنجاح',
              style: TextStyle(color: ctx.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message,
              style: TextStyle(color: ctx.textSecondary, fontSize: 13, height: 1.5),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('الراوتر: $routerName', style: const TextStyle(color: Color(0xFF10B981), fontSize: 12, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text('عدد الملفات التي تم التحقق منها: $filesCount', style: TextStyle(color: ctx.textSecondary, fontSize: 11)),
                  const SizedBox(height: 4),
                  Text('المجلد المرحلي النشط: ${stagingDirectory ?? "hotspot-staging"}', style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11)),
                  if (originalHtmlDirectory != null && profileName != null) ...[
                    const SizedBox(height: 4),
                    Text('الإعداد الأصلي المحفوظ: $originalHtmlDirectory (بروفايل $profileName)', style: TextStyle(color: ctx.textSecondary, fontSize: 11)),
                  ],
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (originalHtmlDirectory != null && profileName != null)
            TextButton.icon(
              onPressed: () async {
                Navigator.of(ctx).pop();
                try {
                  final apiClient = ref.read(apiClientProvider);
                  await apiClient.post(
                    ApiEndpoints.portalRollbackProfile(routerId),
                    data: {
                      'profileName': profileName,
                      'htmlDirectory': originalHtmlDirectory,
                    },
                  );
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('تم التراجع بنجاح وإعادة البروفايل ($profileName) إلى ($originalHtmlDirectory).'),
                        backgroundColor: const Color(0xFF10B981),
                      ),
                    );
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('فشل أمر التراجع: $e'),
                        backgroundColor: const Color(0xFFEF4444),
                      ),
                    );
                  }
                }
              },
              icon: const Icon(Icons.undo_rounded, size: 16, color: Color(0xFFF59E0B)),
              label: const Text('تراجع إلى الصفحة السابقة', style: TextStyle(color: Color(0xFFF59E0B), fontSize: 12)),
            ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              setState(() => _currentMode = PortalViewMode.twoOptions);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('تم'),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN BUILD METHOD
  // ---------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        _handleBack();
        return false;
      },
      child: Scaffold(
        backgroundColor: context.bgScaffold,
        appBar: AppBar(
          backgroundColor: context.bgCard,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
            onPressed: _handleBack,
          ),
          title: Text(
            _getAppBarTitle(),
            style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 16),
          ),
        ),
        body: _buildCurrentView(),
      ),
    );
  }

  String _getAppBarTitle() {
    switch (_currentMode) {
      case PortalViewMode.twoOptions:
        return 'مصمم صفحات الهوتسبوت';
      case PortalViewMode.readyMade:
        return 'الصفحات الجاهزة';
      case PortalViewMode.imported:
        return 'استيراد صفحة من الهاتف';
    }
  }

  Widget _buildCurrentView() {
    switch (_currentMode) {
      case PortalViewMode.twoOptions:
        return _buildTwoOptionsHome();
      case PortalViewMode.readyMade:
        return _buildReadyMadeTemplatesView();
      case PortalViewMode.imported:
        return _buildImportedPortalView();
    }
  }

  // ===========================================================================
  // SCREEN 1: THE TWO DIRECT OPTIONS (HOME)
  // ===========================================================================
  Widget _buildTwoOptionsHome() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Banner
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF38BDF8).withOpacity(0.2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0EA5E9).withOpacity(0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.wifi_tethering_rounded, color: Color(0xFF38BDF8), size: 26),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'بوابة تسجيل دخول MikroTik',
                            style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'اختر الطريقة المناسبة لإضافة صفحة تسجيل الدخول لشبكتك',
                            style: TextStyle(color: context.textSecondary, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Option 1: Ready-Made Templates
          _buildOptionCard(
            title: 'إضافة صفحة من الصفحات الجاهزة',
            badgeText: 'قوالب جاهزة ومتوافقة',
            badgeColor: const Color(0xFF10B981),
            icon: Icons.palette_rounded,
            iconColor: const Color(0xFF38BDF8),
            description:
                'اختر من بين نماذج تسجيل الدخول العصرية المصممة مسبقاً، عاين شكلها فورياً، وأضفها لراوترك بضغطة زر مع رفع كافة الموارد المتوافقة.',
            bulletPoints: [
              'نماذج عصرية (داكن، ستارلينك، ذهبي، وأبيض هادئ)',
              'معاينة حية وتفاعلية قبل الاعتماد',
              'متوافقة 100% مع متغيرات MikroTik Hotspot',
              'رفع تلقائي دون الحاجة لأي تعديل يدوي',
            ],
            buttonText: 'استعراض الصفحات الجاهزة ←',
            buttonColor: const Color(0xFF0EA5E9),
            onTap: () {
              setState(() => _currentMode = PortalViewMode.readyMade);
            },
          ),
          const SizedBox(height: 20),

          // Option 2: Import from Phone
          _buildOptionCard(
            title: 'استيراد صفحة من الهاتف',
            badgeText: 'يدعم HTML و ZIP',
            badgeColor: const Color(0xFFF59E0B),
            icon: Icons.folder_zip_rounded,
            iconColor: const Color(0xFFF59E0B),
            description:
                'استورد صفحة تسجيل دخول مصممة مسبقاً محفوظة على هاتفك (ملف HTML منفرد أو ملف ZIP كامل بموارده)، مع فحص الروابط والموارد ورفعها للراوتر.',
            bulletPoints: [
              'استيراد ملف HTML أو أرشيف ZIP كامل',
              'الحفاظ على بنية المجلدات (CSS، JS، الصور والخطوط)',
              'فحص سلامة الموارد وتنبيهك في حال وجود ملفات مفقودة',
              'تنبيهك للموارد الخارجية التي تحتاج Walled Garden',
            ],
            buttonText: _isProcessingFile ? 'جاري قراءة الملف...' : 'استيراد صفحة من الهاتف ←',
            buttonColor: const Color(0xFFF59E0B),
            isLoading: _isProcessingFile,
            onTap: _isProcessingFile ? null : _pickFileFromPhone,
          ),
        ],
      ),
    );
  }

  Widget _buildOptionCard({
    required String title,
    required String badgeText,
    required Color badgeColor,
    required IconData icon,
    required Color iconColor,
    required String description,
    required List<String> bulletPoints,
    required String buttonText,
    required Color buttonColor,
    required VoidCallback? onTap,
    bool isLoading = false,
  }) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.borderColor),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: iconColor.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(icon, color: iconColor, size: 28),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  title,
                                  style: TextStyle(
                                    color: context.textPrimary,
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: badgeColor.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: badgeColor.withOpacity(0.3)),
                            ),
                            child: Text(
                              badgeText,
                              style: TextStyle(color: badgeColor, fontSize: 11, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  description,
                  style: TextStyle(color: context.textSecondary, fontSize: 13, height: 1.5),
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.bgScaffold.withOpacity(0.7),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    children: bulletPoints
                        .map(
                          (pt) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(Icons.check_circle_outline_rounded, size: 15, color: Color(0xFF10B981)),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    pt,
                                    style: TextStyle(color: context.textPrimary.withOpacity(0.85), fontSize: 12),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  height: 44,
                  child: ElevatedButton(
                    onPressed: onTap,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: buttonColor,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      elevation: 0,
                    ),
                    child: isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Text(
                            buttonText,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ===========================================================================
  // SCREEN 2: READY-MADE TEMPLATES VIEWER & DEPLOYER
  // ===========================================================================
  Widget _buildReadyMadeTemplatesView() {
    final currentPreset = _presets[_selectedPresetKey] ?? _presets['MODERN_DARK']!;
    final routers = ref.watch(routersProvider).value ?? [];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Selector header
          Text('اختر نموذج الصفحة الجاهزة:', style: TextStyle(color: context.textPrimary, fontSize: 14, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),

          // Horizontal Preset Selector
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _presets.entries.map((entry) {
                final isSelected = entry.key == _selectedPresetKey;
                final data = entry.value;
                final primaryCol = data['primary'] as Color;
                return GestureDetector(
                  onTap: () => setState(() => _selectedPresetKey = entry.key),
                  child: Container(
                    margin: const EdgeInsets.only(left: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: isSelected ? primaryCol.withOpacity(0.15) : context.bgCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? primaryCol : context.borderColor,
                        width: isSelected ? 1.8 : 1,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 14,
                          height: 14,
                          decoration: BoxDecoration(
                            color: primaryCol,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          data['name'] as String,
                          style: TextStyle(
                            color: isSelected ? primaryCol : context.textPrimary,
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 20),

          // Live Interactive Preview
          Text('معاينة حية لتصميم الصفحة:', style: TextStyle(color: context.textPrimary, fontSize: 14, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          _buildPhonePreviewFrame(currentPreset),
          const SizedBox(height: 20),

          // Target Router Selection & Deployment
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
                Text('الراوتر المستهدف لإضافة الصفحة:', style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (routers.isEmpty)
                  Text('لا توجد راوترات مضافة في حسابك حالياً.', style: TextStyle(color: context.textSecondary, fontSize: 12))
                else
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    value: _selectedRouterId ?? routers.first.id,
                    dropdownColor: context.bgCard,
                    style: TextStyle(color: context.textPrimary, fontSize: 13),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: context.bgScaffold,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: context.borderColor)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: context.borderColor)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    ),
                    items: routers.map((r) {
                      return DropdownMenuItem(
                        value: r.id,
                        child: Text('${r.name} (${r.host})', overflow: TextOverflow.ellipsis),
                      );
                    }).toList(),
                    onChanged: (val) {
                      if (val != null) setState(() => _selectedRouterId = val);
                    },
                  ),
                const SizedBox(height: 16),

                // Deploy Button
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: _isPublishing ? null : () => _deployPortalToRouter(isReadyMade: true),
                    icon: _isPublishing
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.cloud_upload_rounded),
                    label: Text(
                      _isPublishing ? (_isInspecting ? 'جاري فحص الراوتر...' : 'جاري الرفع والتحقق...') : 'إضافة الصفحة إلى الراوتر المحدد',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0EA5E9),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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

  Widget _buildPhonePreviewFrame(Map<String, dynamic> data) {
    final bgColor = data['bg'] as Color;
    final cardColor = data['card'] as Color;
    final primaryColor = data['primary'] as Color;
    final textColor = data['text'] as Color;

    return Center(
      child: Container(
        width: 320,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: Colors.white.withOpacity(0.15), width: 2),
          boxShadow: [
            BoxShadow(
              color: primaryColor.withOpacity(0.2),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          children: [
            // Speaker notch
            Container(
              width: 50,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 14),

            // Network Logo / Name
            Text(
              data['network'] as String,
              style: TextStyle(color: textColor, fontSize: 15, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),

            // Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withOpacity(0.08)),
              ),
              child: Column(
                children: [
                  Icon(Icons.wifi_rounded, color: primaryColor, size: 36),
                  const SizedBox(height: 8),
                  Text(
                    data['title'] as String,
                    style: TextStyle(color: textColor, fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    data['subtitle'] as String,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: textColor.withOpacity(0.7), fontSize: 11),
                  ),
                  const SizedBox(height: 14),

                  // Input box
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.25),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.white.withOpacity(0.1)),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.credit_card, color: primaryColor, size: 16),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'أدخل كود الكرت (مثال: 78945612)',
                            style: TextStyle(color: textColor.withOpacity(0.4), fontSize: 11),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Submit button
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: primaryColor,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    alignment: Alignment.center,
                    child: const Text(
                      'تسجيل الدخول والاتصال',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Text(
              data['footer'] as String,
              style: TextStyle(color: textColor.withOpacity(0.4), fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }

  // ===========================================================================
  // SCREEN 3: IMPORTED PORTAL FROM PHONE (VALIDATION, ASSETS, DEPLOY)
  // ===========================================================================
  Widget _buildImportedPortalView() {
    final bundle = _importedBundle;
    final routers = ref.watch(routersProvider).value ?? [];

    if (bundle == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.file_upload_outlined, size: 48, color: Color(0xFFF59E0B)),
            const SizedBox(height: 12),
            Text('لم يتم اختيار ملف بعد', style: TextStyle(color: context.textPrimary, fontSize: 16)),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _pickFileFromPhone,
              child: const Text('اختيار ملف صفحة (HTML أو ZIP)'),
            ),
          ],
        ),
      );
    }

    final report = bundle.report;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Re-pick button header
          Row(
            children: [
              Expanded(
                child: Text(
                  'تفاصيل الحزمة المستوردة: ${bundle.bundleName}',
                  style: TextStyle(color: context.textPrimary, fontSize: 14, fontWeight: FontWeight.bold),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              TextButton.icon(
                onPressed: _pickFileFromPhone,
                icon: const Icon(Icons.replay_rounded, size: 16),
                label: const Text('تغيير الملف'),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Summary Stats Cards
          Row(
            children: [
              _buildStatBadge(
                title: 'إجمالي الملفات',
                value: '${bundle.files.length} ملف',
                icon: Icons.folder_rounded,
                color: const Color(0xFF38BDF8),
              ),
              const SizedBox(width: 10),
              _buildStatBadge(
                title: 'الحجم الكلي',
                value: '${(bundle.totalBytes / 1024).toStringAsFixed(1)} KB',
                icon: Icons.data_usage_rounded,
                color: const Color(0xFF10B981),
              ),
              const SizedBox(width: 10),
              _buildStatBadge(
                title: 'حالة الفحص',
                value: report.isValid ? 'سليم وجاهز' : 'توجد أخطاء',
                icon: report.isValid ? Icons.verified_rounded : Icons.error_outline_rounded,
                color: report.isValid ? const Color(0xFF10B981) : const Color(0xFFEF4444),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Safety & Compatibility Report Box
          _buildValidationReportCard(report),
          const SizedBox(height: 16),

          // File List Preview
          Container(
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
                    const Icon(Icons.list_alt_rounded, size: 18, color: Color(0xFF0EA5E9)),
                    const SizedBox(width: 8),
                    Text('الملفات المتضمنة في الحزمة:', style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: bundle.files.map((f) {
                    final isMain = f.path.toLowerCase() == (bundle.mainHtmlPath?.toLowerCase() ?? '');
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: isMain ? const Color(0xFF0EA5E9).withOpacity(0.15) : context.bgScaffold,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: isMain ? const Color(0xFF0EA5E9) : context.borderColor),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            isMain ? Icons.star_rounded : (f.isBinary ? Icons.image_outlined : Icons.code_rounded),
                            size: 14,
                            color: isMain ? const Color(0xFF0EA5E9) : context.textSecondary,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            f.path,
                            style: TextStyle(
                              color: isMain ? const Color(0xFF0EA5E9) : context.textPrimary,
                              fontSize: 11,
                              fontWeight: isMain ? FontWeight.bold : FontWeight.normal,
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Target Router Selection & Deployment
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
                Text('الراوتر المستهدف لرفع الصفحة:', style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (routers.isEmpty)
                  Text('لا توجد راوترات مضافة في حسابك حالياً.', style: TextStyle(color: context.textSecondary, fontSize: 12))
                else
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    value: _selectedRouterId ?? routers.first.id,
                    dropdownColor: context.bgCard,
                    style: TextStyle(color: context.textPrimary, fontSize: 13),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: context.bgScaffold,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: context.borderColor)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: context.borderColor)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    ),
                    items: routers.map((r) {
                      return DropdownMenuItem(
                        value: r.id,
                        child: Text('${r.name} (${r.host})', overflow: TextOverflow.ellipsis),
                      );
                    }).toList(),
                    onChanged: (val) {
                      if (val != null) setState(() => _selectedRouterId = val);
                    },
                  ),
                const SizedBox(height: 16),

                // Deploy Button
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: (_isPublishing || !report.isValid)
                        ? null
                        : () => _deployPortalToRouter(isReadyMade: false),
                    icon: _isPublishing
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.cloud_upload_rounded),
                    label: Text(
                      _isPublishing
                          ? (_isInspecting ? 'جاري فحص الراوتر...' : 'جاري الرفع والتحقق...')
                          : 'نشر الصفحة إلى الراوتر المحدد',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFF59E0B),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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

  Widget _buildStatBadge({
    required String title,
    required String value,
    required IconData icon,
    required Color color,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 4),
            Text(title, style: TextStyle(color: context.textSecondary, fontSize: 10)),
            const SizedBox(height: 2),
            Text(value, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold), maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }

  Widget _buildValidationReportCard(PortalValidationReport report) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: report.errors.isNotEmpty ? const Color(0xFFEF4444) : (report.warnings.isNotEmpty ? const Color(0xFFF59E0B) : const Color(0xFF10B981))),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                report.errors.isNotEmpty
                    ? Icons.cancel_rounded
                    : (report.warnings.isNotEmpty ? Icons.warning_rounded : Icons.check_circle_rounded),
                color: report.errors.isNotEmpty
                    ? const Color(0xFFEF4444)
                    : (report.warnings.isNotEmpty ? const Color(0xFFF59E0B) : const Color(0xFF10B981)),
                size: 20,
              ),
              const SizedBox(width: 8),
              Text(
                'تقرير الفحص التلقائي لسلامة الصفحة:',
                style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Errors
          if (report.errors.isNotEmpty) ...[
            ...report.errors.map(
              (err) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.close, color: Color(0xFFEF4444), size: 14),
                    const SizedBox(width: 6),
                    Expanded(child: Text(err, style: const TextStyle(color: Color(0xFFEF4444), fontSize: 11, height: 1.4))),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
          ],

          // Warnings
          if (report.warnings.isNotEmpty) ...[
            ...report.warnings.map(
              (warn) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, color: Color(0xFFF59E0B), size: 14),
                    const SizedBox(width: 6),
                    Expanded(child: Text(warn, style: const TextStyle(color: Color(0xFFF59E0B), fontSize: 11, height: 1.4))),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
          ],

          // Feature checklist
          Divider(color: context.borderColor),
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: [
              _buildFeatureCheck(label: 'فورم تسجيل الدخول', isPresent: report.hotspotFeatures['hasLoginForm'] ?? false),
              _buildFeatureCheck(label: 'حقل اسم المستخدم/الكرت', isPresent: report.hotspotFeatures['hasUsername'] ?? false),
              _buildFeatureCheck(label: 'متغير الخطأ \$(error)', isPresent: report.hotspotFeatures['hasErrorVariable'] ?? false),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFeatureCheck({required String label, required bool isPresent}) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          isPresent ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
          size: 13,
          color: isPresent ? const Color(0xFF10B981) : Colors.grey,
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            color: isPresent ? const Color(0xFF10B981) : Colors.grey,
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}
