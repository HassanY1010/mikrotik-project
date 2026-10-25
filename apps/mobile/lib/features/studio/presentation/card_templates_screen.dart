import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/services/card_template_import_service.dart';
import 'card_template_editor_screen.dart';

class CardTemplatesScreen extends ConsumerStatefulWidget {
  const CardTemplatesScreen({super.key});

  @override
  ConsumerState<CardTemplatesScreen> createState() => _CardTemplatesScreenState();
}

class _CardTemplatesScreenState extends ConsumerState<CardTemplatesScreen> {

  void _handleExportTemplate(CardTemplateModel tpl) {
    final jsonStr = const JsonEncoder.withIndent('  ').convert(tpl.toJson());
    Share.share(
      jsonStr,
      subject: 'قالب كروت هوتسبوت: ${tpl.name}',
    );
  }

  void _handleDuplicate(CardTemplateModel tpl) async {
    final cloned = tpl.copyWith(
      id: '',
      name: '${tpl.name} (نسخة)',
      isDefault: false,
    );

    final res = await ref.read(cardTemplatesProvider.notifier).createTemplate(cloned);
    if (!mounted) return;

    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم نسخ القالب بنجاح!'), backgroundColor: Color(0xFF10B981)),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['message']?.toString() ?? 'فشل نسخ القالب'), backgroundColor: const Color(0xFFEF4444)),
      );
    }
  }

  void _handleDelete(CardTemplateModel tpl) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('تأكيد الحذف', style: TextStyle(color: context.textPrimary, fontSize: 16)),
        content: Text('هل أنت متأكد من حذف القالب «${tpl.name}»؟ لا يمكن التراجع عن هذه العملية.', style: TextStyle(color: context.textSecondary)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('إلغاء', style: TextStyle(color: context.textSecondary))),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: const Text('حذف القالب', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final res = await ref.read(cardTemplatesProvider.notifier).deleteTemplate(tpl.id);
      if (!mounted) return;
      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم حذف القالب بنجاح'), backgroundColor: Color(0xFF10B981)),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['message']?.toString() ?? 'فشل حذف القالب'), backgroundColor: const Color(0xFFEF4444)),
        );
      }
    }
  }

  Color _hexToColor(String? hex, Color defaultColor) {
    if (hex == null || hex.isEmpty) return defaultColor;
    try {
      final clean = hex.replaceAll('#', '').trim();
      if (clean.length == 6) return Color(int.parse('FF$clean', radix: 16));
      if (clean.length == 8) return Color(int.parse(clean, radix: 16));
    } catch (_) {}
    return defaultColor;
  }

  /// Displays the two options requested: Built-in Ready Template OR Import from Phone
  void _showAddTemplateOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: context.bgCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetCtx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'إضافة قالب جديد',
                style: TextStyle(
                  color: context.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                'اختر طريقة إضافة القالب إلى حسابك',
                style: TextStyle(
                  color: context.textSecondary,
                  fontSize: 13,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),

              // الخيار الأول: إضافة قالب جاهز من داخل التطبيق
              InkWell(
                key: const Key('add_builtin_template_option'),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _showBuiltInTemplatesCatalog();
                },
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: context.isDarkMode ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: AppTheme.primary.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
                        ),
                        child: const Icon(
                          Icons.dashboard_customize_outlined,
                          color: AppTheme.primary,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'إضافة قالب جاهز من داخل التطبيق',
                              style: TextStyle(
                                color: context.textPrimary,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'استعراض واختيار قوالب سودافي الجاهزة المضمنة وإضافتها لقوالبك',
                              style: TextStyle(
                                color: context.textSecondary,
                                fontSize: 11.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(Icons.arrow_forward_ios_rounded, size: 16, color: context.textSecondary),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 14),

              // الخيار الثاني: استيراد قالب جاهز من الهاتف
              InkWell(
                key: const Key('import_device_template_option'),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _showDeviceImportTypeOptions();
                },
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: context.isDarkMode ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: AppTheme.accent.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppTheme.accent.withValues(alpha: 0.4)),
                        ),
                        child: const Icon(
                          Icons.file_upload_outlined,
                          color: AppTheme.accent,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'استيراد قالب جاهز من الهاتف',
                              style: TextStyle(
                                color: context.textPrimary,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'استيراد قالب SudaFi، أو صورة تصميم (PNG/JPG)، أو مستند PDF',
                              style: TextStyle(
                                color: context.textSecondary,
                                fontSize: 11.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(Icons.arrow_forward_ios_rounded, size: 16, color: context.textSecondary),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  /// Displays the catalog of built-in ready templates to pick and add
  void _showBuiltInTemplatesCatalog() {
    final catalog = CardTemplateImportService.getBuiltInCatalog();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.bgScaffold,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (catalogCtx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.85,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (sheetCtx, scrollController) {
            final userTemplates = ref.watch(cardTemplatesProvider).value ?? [];

            return Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                  decoration: BoxDecoration(
                    color: context.bgCard,
                    border: Border(bottom: BorderSide(color: context.borderColor)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'القوالب الجاهزة المضمنة',
                              style: TextStyle(
                                color: context.textPrimary,
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'اختر من قوالب سودافي الجاهزة لإضافتها فوراً لقوالبك',
                              style: TextStyle(color: context.textSecondary, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(catalogCtx),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    controller: scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: catalog.length,
                    itemBuilder: (ctx, idx) {
                      final tpl = catalog[idx];
                      final isAlreadyAdded = userTemplates.any(
                        (u) => u.name == tpl.name || (u.themePreset == tpl.themePreset && u.widthMm == tpl.widthMm && u.heightMm == tpl.heightMm),
                      );

                      final primaryColor = _hexToColor(tpl.primaryColor, AppTheme.primary);
                      final accentColor = _hexToColor(tpl.accentColor, AppTheme.accent);

                      return Container(
                        margin: const EdgeInsets.only(bottom: 14),
                        decoration: BoxDecoration(
                          color: context.bgCard,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isAlreadyAdded
                                ? const Color(0xFF10B981).withValues(alpha: 0.5)
                                : context.borderColor,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                children: [
                                  Container(
                                    width: 48,
                                    height: 48,
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        colors: [primaryColor, primaryColor.withValues(alpha: 0.8)],
                                      ),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: accentColor, width: 2),
                                    ),
                                    child: const Icon(Icons.style, color: Colors.white, size: 22),
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
                                                tpl.name,
                                                style: TextStyle(
                                                  color: context.textPrimary,
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 14,
                                                ),
                                              ),
                                            ),
                                            if (isAlreadyAdded)
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                                decoration: BoxDecoration(
                                                  color: const Color(0xFF10B981).withValues(alpha: 0.15),
                                                  borderRadius: BorderRadius.circular(12),
                                                  border: Border.all(color: const Color(0xFF10B981)),
                                                ),
                                                child: const Text(
                                                  '✓ مضاف مسبقاً',
                                                  style: TextStyle(
                                                    color: Color(0xFF10B981),
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.bold,
                                                  ),
                                                ),
                                              ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'المقاس: ${tpl.widthMm}×${tpl.heightMm} مم (${tpl.orientation == 'portrait' ? 'عمودي' : 'أفقي'}) • الثيم: ${tpl.themePreset}',
                                          style: TextStyle(color: context.textSecondary, fontSize: 11.5),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          'الترويسة: ${tpl.headerTitle}',
                                          style: TextStyle(color: context.textSecondary, fontSize: 11),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Divider(height: 1, color: context.borderColor),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  if (isAlreadyAdded)
                                    OutlinedButton.icon(
                                      onPressed: () => _addBuiltInTemplate(tpl, asDuplicate: true, closeContext: catalogCtx),
                                      icon: const Icon(Icons.copy, size: 15),
                                      label: const Text('إضافة نسخة أخرى', style: TextStyle(fontSize: 12)),
                                    )
                                  else
                                    ElevatedButton.icon(
                                      onPressed: () => _addBuiltInTemplate(tpl, asDuplicate: false, closeContext: catalogCtx),
                                      icon: const Icon(Icons.add, size: 16),
                                      label: const Text('إضافة إلى قوالبي', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: AppTheme.primary,
                                        foregroundColor: Colors.white,
                                      ),
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
            );
          },
        );
      },
    );
  }

  void _addBuiltInTemplate(CardTemplateModel tpl, {required bool asDuplicate, BuildContext? closeContext}) async {
    if (closeContext != null && Navigator.canPop(closeContext)) {
      Navigator.pop(closeContext);
    }

    final newTpl = tpl.copyWith(
      id: '',
      name: asDuplicate ? '${tpl.name} (نسخة)' : tpl.name,
      isDefault: false,
    );

    final res = await ref.read(cardTemplatesProvider.notifier).createTemplate(newTpl);
    if (!mounted) return;

    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تمت إضافة القالب «${newTpl.name}» بنجاح!'),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message']?.toString() ?? 'فشل إضافة القالب'),
          backgroundColor: const Color(0xFFEF4444),
        ),
      );
    }
  }

  /// Handles picking and importing a template file from device storage
  void _handleImportTemplateFromDevice() async {
    final result = await CardTemplateImportService.importTemplateFromFile();
    if (!mounted) return;

    if (result.isCancelled) {
      // User cancelled file picking gracefully - no error
      return;
    }

    if (!result.isSuccess || result.template == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.errorMessage ?? 'تعذر استيراد القالب من الملف.'),
          backgroundColor: const Color(0xFFEF4444),
          duration: const Duration(seconds: 4),
        ),
      );
      return;
    }

    final imported = result.template!;
    final userTemplates = ref.read(cardTemplatesProvider).value ?? [];

    String finalName = imported.name;
    if (userTemplates.any((t) => t.name == finalName)) {
      finalName = '$finalName (مستورد)';
    }

    final templateToSave = imported.copyWith(
      id: '',
      name: finalName,
      isDefault: false,
    );

    final res = await ref.read(cardTemplatesProvider.notifier).createTemplate(templateToSave);
    if (!mounted) return;

    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تم استيراد القالب «$finalName» بنجاح! وهو متاح الآن للاستخدام في الطباعة.'),
          backgroundColor: const Color(0xFF10B981),
          duration: const Duration(seconds: 4),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message']?.toString() ?? 'فشل حفظ القالب المستورد.'),
          backgroundColor: const Color(0xFFEF4444),
        ),
      );
    }
  }

  /// Opens the import sub-sheet showing the three supported file formats
  void _showDeviceImportTypeOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: context.bgCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetCtx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'نوع التصميم المستورد',
                style: TextStyle(
                  color: context.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                'اختر نوع الملف المراد استيراده من هاتفك واستخدامه في الكروت',
                style: TextStyle(
                  color: context.textSecondary,
                  fontSize: 12.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),

              // نوع 1: قالب سودافي قابل للتعديل
              _buildImportTypeTile(
                key: const Key('import_type_sudafi_json'),
                title: 'قالب SudaFi قابل للتعديل (JSON)',
                subtitle: 'ملف قالب كامل (.json, .sudafi, .template) يحتوي على الأبعاد والألوان والحقول',
                icon: Icons.data_object_rounded,
                iconColor: const Color(0xFF0284C7),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _handleImportTemplateFromDevice();
                },
              ),
              const SizedBox(height: 12),

              // نوع 2: تصميم صورة
              _buildImportTypeTile(
                key: const Key('import_type_image'),
                title: 'تصميم صورة (PNG / JPG / WebP)',
                subtitle: 'استيراد صورة كخلفية لكرت الهوتسبوت وإضافة حقول الكرت وQR Code فوقها',
                icon: Icons.image_outlined,
                iconColor: const Color(0xFF10B981),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _handleImportImageBackground();
                },
              ),
              const SizedBox(height: 12),

              // نوع 3: تصميم مستند PDF
              _buildImportTypeTile(
                key: const Key('import_type_pdf'),
                title: 'تصميم مستند PDF',
                subtitle: 'استيراد صفحة من ملف PDF كخلفية تصميم عالية الدقة مع حقول الطباعة',
                icon: Icons.picture_as_pdf_outlined,
                iconColor: const Color(0xFFEF4444),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _handleImportPdfBackground();
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildImportTypeTile({
    required Key key,
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      key: key,
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.isDarkMode ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.borderColor),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: iconColor.withValues(alpha: 0.35)),
              ),
              child: Icon(icon, color: iconColor, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: context.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 13.5,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: context.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Icon(Icons.arrow_forward_ios_rounded, size: 15, color: context.textSecondary),
          ],
        ),
      ),
    );
  }

  /// Handles importing an image (PNG, JPG, WebP) as a background template
  void _handleImportImageBackground() async {
    final result = await CardTemplateImportService.importImageFromFile();
    if (!mounted) return;

    if (result.isCancelled) return;

    if (!result.isSuccess || result.imageBytes == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.errorMessage ?? 'تعذر قراءة ملف الصورة المحدد.'),
          backgroundColor: const Color(0xFFEF4444),
          duration: const Duration(seconds: 4),
        ),
      );
      return;
    }

    _showMediaTemplatePreviewDialog(
      mediaBytes: result.imageBytes!,
      initialName: result.fileName ?? 'تصميم صورة جديد',
      isPdf: false,
    );
  }

  /// Handles importing a PDF document as a background template
  void _handleImportPdfBackground() async {
    final result = await CardTemplateImportService.importPdfFromFile();
    if (!mounted) return;

    if (result.isCancelled) return;

    if (!result.isSuccess || result.imageBytes == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.errorMessage ?? 'تعذر قراءة مستند الـ PDF المحدد.'),
          backgroundColor: const Color(0xFFEF4444),
          duration: const Duration(seconds: 4),
        ),
      );
      return;
    }

    _showMediaTemplatePreviewDialog(
      mediaBytes: result.imageBytes!,
      initialName: result.fileName ?? 'تصميم PDF جديد',
      isPdf: true,
      allPages: result.pdfPageThumbnails,
    );
  }

  /// Shows interactive preview and customization dialog before saving Image/PDF background template
  void _showMediaTemplatePreviewDialog({
    required Uint8List mediaBytes,
    required String initialName,
    required bool isPdf,
    List<Uint8List>? allPages,
  }) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) {
        int selectedPageIndex = 0;
        Uint8List currentImageBytes = (allPages != null && allPages.isNotEmpty)
            ? allPages[selectedPageIndex]
            : mediaBytes;

        final nameCtrl = TextEditingController(text: initialName);
        final networkCtrl = TextEditingController(text: 'سودافاي | SudaFi Net');
        int widthMm = 85;
        int heightMm = 54;
        bool showQr = true;
        bool showPin = true;
        bool showPrice = true;
        bool showValidity = true;
        bool isSaving = false;

        return StatefulBuilder(
          builder: (ctx, setDlgState) {
            return AlertDialog(
              backgroundColor: context.bgCard,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              titlePadding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
              contentPadding: const EdgeInsets.symmetric(horizontal: 20),
              title: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: (isPdf ? const Color(0xFFEF4444) : const Color(0xFF10B981)).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined,
                      color: isPdf ? const Color(0xFFEF4444) : const Color(0xFF10B981),
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isPdf ? 'معاينة تصميم مستند PDF' : 'معاينة تصميم الصورة',
                          style: TextStyle(
                            color: context.textPrimary,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'تخصيص الحقول وضبط المقاس قبل الحفظ',
                          style: TextStyle(color: context.textSecondary, fontSize: 11.5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              content: SizedBox(
                width: 480,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 12),

                      // Transparent User Explanation
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: context.isDarkMode ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: context.borderColor),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.info_outline, color: Color(0xFF0284C7), size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                isPdf
                                    ? 'تنويه: سيتم استخدام صفحة الـ PDF المختارة كخلفية تصميمية لبطاقة الكرت، مع طباعة بيانات الدخول ورمز QR فوقها بدقة فائقة.'
                                    : 'تنويه: سيتم استخدام الصورة كخلفية لبطاقة الكرت، مع طباعة بيانات تسجيل الدخول ورمز QR فوقها بجودة عالية.',
                                style: TextStyle(color: context.textSecondary, fontSize: 11.5),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),

                      // Multi-page selector if PDF has multiple pages
                      if (allPages != null && allPages.length > 1) ...[
                        Text(
                          'اختر الصفحة المراد استخدامها (${allPages.length} صفحات):',
                          style: TextStyle(color: context.textPrimary, fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: List.generate(allPages.length, (pIdx) {
                              final isSel = selectedPageIndex == pIdx;
                              return GestureDetector(
                                onTap: () {
                                  setDlgState(() {
                                    selectedPageIndex = pIdx;
                                    currentImageBytes = allPages[pIdx];
                                  });
                                },
                                child: Container(
                                  margin: const EdgeInsets.only(left: 8),
                                  padding: const EdgeInsets.all(4),
                                  decoration: BoxDecoration(
                                    color: isSel ? const Color(0xFF0284C7).withValues(alpha: 0.15) : context.bgCardAlt,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: isSel ? const Color(0xFF0284C7) : context.borderColor,
                                      width: isSel ? 2 : 1,
                                    ),
                                  ),
                                  child: Column(
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(4),
                                        child: Image.memory(
                                          allPages[pIdx],
                                          width: 48,
                                          height: 32,
                                          fit: BoxFit.cover,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        'صفحة ${pIdx + 1}',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                                          color: isSel ? const Color(0xFF0284C7) : context.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }),
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],

                      // Live Card Visual Preview
                      Center(
                        child: Container(
                          width: 260,
                          height: 155,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.15),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                            border: Border.all(color: context.borderColor, width: 1.5),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Stack(
                              children: [
                                Positioned.fill(
                                  child: Image.memory(
                                    currentImageBytes,
                                    fit: BoxFit.cover,
                                  ),
                                ),
                                Container(
                                  color: Colors.black.withValues(alpha: 0.25),
                                  padding: const EdgeInsets.all(8),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.stretch,
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      // Header
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Expanded(
                                            child: Text(
                                              networkCtrl.text.trim().isNotEmpty
                                                  ? networkCtrl.text.trim()
                                                  : 'سودافاي | SudaFi Net',
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 11,
                                                fontWeight: FontWeight.bold,
                                                shadows: [Shadow(color: Colors.black, blurRadius: 4)],
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          if (showPrice)
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                              decoration: BoxDecoration(
                                                color: Colors.amber,
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: const Text(
                                                '1000 SDG',
                                                style: TextStyle(
                                                  color: Colors.black,
                                                  fontSize: 9,
                                                  fontWeight: FontWeight.bold,
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),

                                      // Middle Credentials & QR
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                const Text(
                                                  'باقة يومية 1 جيجا',
                                                  style: TextStyle(
                                                    color: Colors.white,
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.bold,
                                                    shadows: [Shadow(color: Colors.black, blurRadius: 3)],
                                                  ),
                                                ),
                                                const SizedBox(height: 4),
                                                if (showPin)
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                    decoration: BoxDecoration(
                                                      color: Colors.white,
                                                      borderRadius: BorderRadius.circular(4),
                                                    ),
                                                    child: const Text(
                                                      'PIN: 849204',
                                                      style: TextStyle(
                                                        color: Color(0xFF1E3A8A),
                                                        fontWeight: FontWeight.bold,
                                                        fontSize: 11,
                                                      ),
                                                    ),
                                                  ),
                                              ],
                                            ),
                                          ),
                                          if (showQr)
                                            Container(
                                              width: 44,
                                              height: 44,
                                              padding: const EdgeInsets.all(3),
                                              decoration: BoxDecoration(
                                                color: Colors.white,
                                                borderRadius: BorderRadius.circular(6),
                                              ),
                                              child: const Center(
                                                child: Icon(Icons.qr_code, size: 36, color: Colors.black),
                                              ),
                                            ),
                                        ],
                                      ),

                                      // Footer
                                      if (showValidity)
                                        const Text(
                                          'الصلاحية: 24 ساعة • سرعة فائقة',
                                          style: TextStyle(
                                            color: Colors.white70,
                                            fontSize: 8.5,
                                            shadows: [Shadow(color: Colors.black, blurRadius: 3)],
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Name Field
                      TextField(
                        key: const Key('media_template_name_field'),
                        controller: nameCtrl,
                        decoration: InputDecoration(
                          labelText: 'اسم القالب',
                          hintText: 'مثال: كرت النجوم الذهبي',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Dimensions Chips
                      Text('أبعاد الكرت:', style: TextStyle(color: context.textPrimary, fontSize: 12, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 8,
                        children: [
                          ChoiceChip(
                            label: const Text('85×54 مم (قياسي)'),
                            selected: widthMm == 85 && heightMm == 54,
                            onSelected: (val) {
                              if (val) setDlgState(() { widthMm = 85; heightMm = 54; });
                            },
                          ),
                          ChoiceChip(
                            label: const Text('100×40 مم (تذكرة)'),
                            selected: widthMm == 100 && heightMm == 40,
                            onSelected: (val) {
                              if (val) setDlgState(() { widthMm = 100; heightMm = 40; });
                            },
                          ),
                          ChoiceChip(
                            label: const Text('70×35 مم (مدمج)'),
                            selected: widthMm == 70 && heightMm == 35,
                            onSelected: (val) {
                              if (val) setDlgState(() { widthMm = 70; heightMm = 35; });
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Toggles for card fields
                      SwitchListTile(
                        dense: true,
                        title: const Text('إظهار رمز الاستجابة السريعة (QR Code)', style: TextStyle(fontSize: 12.5)),
                        value: showQr,
                        onChanged: (val) => setDlgState(() => showQr = val),
                      ),
                      SwitchListTile(
                        dense: true,
                        title: const Text('إظهار رمز الدخول (PIN)', style: TextStyle(fontSize: 12.5)),
                        value: showPin,
                        onChanged: (val) => setDlgState(() => showPin = val),
                      ),
                      SwitchListTile(
                        dense: true,
                        title: const Text('إظهار سعر الكرت', style: TextStyle(fontSize: 12.5)),
                        value: showPrice,
                        onChanged: (val) => setDlgState(() => showPrice = val),
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: isSaving ? null : () => Navigator.pop(dialogCtx),
                  child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
                ),
                ElevatedButton.icon(
                  key: const Key('save_media_template_button'),
                  onPressed: isSaving
                      ? null
                      : () async {
                          final name = nameCtrl.text.trim();
                          if (name.isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('يرجى إدخال اسم للقالب'), backgroundColor: Colors.red),
                            );
                            return;
                          }

                          setDlgState(() => isSaving = true);
                          final tpl = CardTemplateImportService.createTemplateFromMedia(
                            imageBytes: currentImageBytes,
                            name: name,
                            widthMm: widthMm,
                            heightMm: heightMm,
                            showQr: showQr,
                            showPin: showPin,
                            showPrice: showPrice,
                            showValidity: showValidity,
                            networkName: networkCtrl.text.trim().isNotEmpty
                                ? networkCtrl.text.trim()
                                : 'سودافاي | SudaFi Net',
                            isPdf: isPdf,
                          );

                          Navigator.pop(dialogCtx);

                          final res = await ref.read(cardTemplatesProvider.notifier).createTemplate(tpl);
                          if (!mounted) return;

                          if (res['success'] == true) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('تم حفظ قالب «$name» بنجاح وهو متاح الآن للاستخدام!'),
                                backgroundColor: const Color(0xFF10B981),
                              ),
                            );
                          } else {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(res['message']?.toString() ?? 'فشل حفظ القالب'),
                                backgroundColor: const Color(0xFFEF4444),
                              ),
                            );
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    foregroundColor: Colors.white,
                  ),
                  icon: isSaving
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Icon(Icons.check, size: 18),
                  label: const Text('حفظ القالب واستخدامه'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final templatesAsync = ref.watch(cardTemplatesProvider);

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: const Text(
          'قوالب طباعة الكروت الجاهزة',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث القوالب',
            onPressed: () => ref.read(cardTemplatesProvider.notifier).refresh(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Top Action Button - «إضافة قالب جديد»
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.bgCard,
              border: Border(bottom: BorderSide(color: context.borderColor)),
            ),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                key: const Key('add_new_template_button'),
                onPressed: _showAddTemplateOptions,
                icon: const Icon(Icons.add_circle_outline, size: 20),
                label: const Text('إضافة قالب جديد', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 2,
                ),
              ),
            ),
          ),

          // Templates List
          Expanded(
            child: templatesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF38BDF8))),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Color(0xFFEF4444)),
                      const SizedBox(height: 12),
                      Text('فشل تحميل القوالب: $err', style: const TextStyle(color: Color(0xFF94A3B8)), textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () => ref.read(cardTemplatesProvider.notifier).refresh(),
                        child: const Text('إعادة المحاولة'),
                      ),
                    ],
                  ),
                ),
              ),
              data: (templates) {
                if (templates.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.style_outlined, size: 64, color: context.isDarkMode ? Colors.white.withValues(alpha: 0.3) : Colors.black.withValues(alpha: 0.2)),
                          const SizedBox(height: 16),
                          Text('لا توجد قوالب طباعة مسجلة', style: TextStyle(color: context.textPrimary, fontSize: 17, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          Text('يمكنك اختيار أحد القوالب الجاهزة أو استيراد قالب من الهاتف.', style: TextStyle(color: context.textSecondary, fontSize: 13), textAlign: TextAlign.center),
                          const SizedBox(height: 20),
                          ElevatedButton.icon(
                            onPressed: _showAddTemplateOptions,
                            icon: const Icon(Icons.add, size: 18),
                            label: const Text('إضافة قالب جديد'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.all(14),
                  itemCount: templates.length,
                  itemBuilder: (ctx, i) {
                    final tpl = templates[i];
                    final primary = _hexToColor(tpl.primaryColor, const Color(0xFF1E3A8A));
                    final accent = _hexToColor(tpl.accentColor, const Color(0xFF10B981));

                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: context.bgCard,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: tpl.isDefault ? const Color(0xFF10B981) : context.borderColor,
                          width: tpl.isDefault ? 1.5 : 1,
                        ),
                      ),
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(14),
                            child: Row(
                              children: [
                                // Theme Color Badge
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(colors: [primary, primary.withValues(alpha: 0.7)]),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: accent, width: 2),
                                  ),
                                  child: const Icon(Icons.style, color: Colors.white, size: 20),
                                ),
                                const SizedBox(width: 12),

                                // Template Info
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Flexible(
                                            child: Text(
                                              tpl.name,
                                              style: TextStyle(
                                                color: context.textPrimary,
                                                fontWeight: FontWeight.bold,
                                                fontSize: 15,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          if (tpl.isDefault) ...[
                                            const SizedBox(width: 8),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                              decoration: BoxDecoration(
                                                color: const Color(0xFF10B981).withValues(alpha: 0.18),
                                                borderRadius: BorderRadius.circular(12),
                                                border: Border.all(color: const Color(0xFF10B981)),
                                              ),
                                              child: const Text(
                                                'افتراضي',
                                                style: TextStyle(color: Color(0xFF34D399), fontSize: 10, fontWeight: FontWeight.bold),
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'الأبعاد: ${tpl.widthMm}x${tpl.heightMm} مم • الشبكة: ${tpl.networkName}',
                                        style: TextStyle(color: context.textSecondary, fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),

                          Divider(color: context.borderColor, height: 1),

                          // Actions Row
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                TextButton.icon(
                                  onPressed: () async {
                                    final updated = await Navigator.push<bool>(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => CardTemplateEditorScreen(template: tpl),
                                      ),
                                    );
                                    if (updated == true) {
                                      ref.read(cardTemplatesProvider.notifier).refresh();
                                    }
                                  },
                                  icon: const Icon(Icons.edit_outlined, size: 16, color: Color(0xFF38BDF8)),
                                  label: const Text('تعديل', style: TextStyle(color: Color(0xFF38BDF8), fontSize: 12)),
                                ),
                                TextButton.icon(
                                  onPressed: () => _handleDuplicate(tpl),
                                  icon: const Icon(Icons.copy_outlined, size: 16, color: Color(0xFFA78BFA)),
                                  label: const Text('نسخ', style: TextStyle(color: Color(0xFFA78BFA), fontSize: 12)),
                                ),
                                TextButton.icon(
                                  onPressed: () => _handleExportTemplate(tpl),
                                  icon: const Icon(Icons.share_outlined, size: 16, color: Color(0xFFFBBF24)),
                                  label: const Text('تصدير', style: TextStyle(color: Color(0xFFFBBF24), fontSize: 12)),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 18, color: Color(0xFFEF4444)),
                                  tooltip: 'حذف',
                                  onPressed: () => _handleDelete(tpl),
                                ),
                              ],
                            ),
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
