import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import 'card_template_editor_screen.dart';

class CardTemplatesScreen extends ConsumerStatefulWidget {
  const CardTemplatesScreen({super.key});

  @override
  ConsumerState<CardTemplatesScreen> createState() => _CardTemplatesScreenState();
}

class _CardTemplatesScreenState extends ConsumerState<CardTemplatesScreen> {
  bool _isImporting = false;

  Future<void> _handleImportFromDevice() async {
    setState(() => _isImporting = true);
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'],
        allowMultiple: false,
      );

      if (result == null || result.files.isEmpty) {
        setState(() => _isImporting = false);
        return; // User cancelled
      }

      final file = result.files.first;

      // File size security validation: max 500 KB to avoid memory abuse
      if (file.size > 500 * 1024) {
        setState(() => _isImporting = false);
        _showErrorDialog('الملف المختار كبير جداً، الحد الأقصى المسموح به لحجم القالب هو 500 كيلوبايت.');
        return;
      }

      String content = '';
      if (file.bytes != null) {
        content = utf8.decode(file.bytes!);
      } else if (file.path != null) {
        final f = File(file.path!);
        content = await f.readAsString();
      }

      if (content.trim().isEmpty) {
        setState(() => _isImporting = false);
        _showErrorDialog('ملف القالب فارغ.');
        return;
      }

      dynamic decoded;
      try {
        decoded = jsonDecode(content);
      } catch (_) {
        setState(() => _isImporting = false);
        _showErrorDialog('الملف المختار لا يحتوي على تنسيق JSON صالح أو أنه تالف.');
        return;
      }

      if (decoded is! Map<String, dynamic>) {
        setState(() => _isImporting = false);
        _showErrorDialog('بنية ملف القالب غير صالحة. يجب أن يحتوي الملف على كائن JSON لقالب كرت.');
        return;
      }

      // Validate required template fields
      final name = decoded['name']?.toString() ?? file.name.replaceAll('.json', '');
      final themePreset = decoded['themePreset']?.toString() ?? 'CUSTOM';
      final primaryColor = decoded['primaryColor']?.toString() ?? '#065F46';
      final accentColor = decoded['accentColor']?.toString() ?? '#F59E0B';
      final layoutConfig = (decoded['layoutConfig'] is Map)
          ? Map<String, dynamic>.from(decoded['layoutConfig'] as Map)
          : <String, dynamic>{};

      final importedTemplate = CardTemplateModel(
        id: '', // new template on import
        name: name,
        themePreset: themePreset,
        primaryColor: primaryColor,
        accentColor: accentColor,
        widthMm: (decoded['widthMm'] as num?)?.toInt() ?? 85,
        heightMm: (decoded['heightMm'] as num?)?.toInt() ?? 54,
        orientation: decoded['orientation']?.toString() ?? 'landscape',
        layoutConfig: layoutConfig,
        isDefault: false,
      );

      setState(() => _isImporting = false);

      if (!mounted) return;

      // Open editor to let user review preview and confirm saving
      final saved = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => CardTemplateEditorScreen(
            template: importedTemplate,
            isImported: true,
          ),
        ),
      );

      if (saved == true) {
        ref.read(cardTemplatesProvider.notifier).refresh();
      }
    } catch (e) {
      setState(() => _isImporting = false);
      _showErrorDialog('حدث خطأ أثناء قراءة ملف القالب: ${e.toString()}');
    }
  }

  void _showErrorDialog(String msg) {
    if (!mounted) return;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: const [
            Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444)),
            SizedBox(width: 8),
            Text('تنبيه الاستيراد', style: TextStyle(color: Colors.white, fontSize: 16)),
          ],
        ),
        content: Text(msg, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13, height: 1.5)),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF334155)),
            child: const Text('حسناً', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

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
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('تأكيد الحذف', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: Text('هل أنت متأكد من حذف القالب «${tpl.name}»؟ لا يمكن التراجع عن هذه العملية.', style: const TextStyle(color: Color(0xFF94A3B8))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8)))),
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

  @override
  Widget build(BuildContext context) {
    final templatesAsync = ref.watch(cardTemplatesProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: const Text(
          'إدارة وتصميم قوالب الطباعة',
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
          // Top Action Buttons
          Container(
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
              color: Color(0xFF1E293B),
              border: Border(bottom: BorderSide(color: Color(0xFF334155))),
            ),
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      final created = await Navigator.push<bool>(
                        context,
                        MaterialPageRoute(builder: (_) => const CardTemplateEditorScreen()),
                      );
                      if (created == true) {
                        ref.read(cardTemplatesProvider.notifier).refresh();
                      }
                    },
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('قالب جديد'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _isImporting ? null : _handleImportFromDevice,
                    icon: _isImporting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
                          )
                        : const Icon(Icons.file_upload_outlined, size: 18, color: Color(0xFF38BDF8)),
                    label: Text(
                      _isImporting ? 'جاري القراءة...' : 'استيراد من الجهاز',
                      style: const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Color(0xFF0284C7)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
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
                          Icon(Icons.style_outlined, size: 64, color: Colors.white.withValues(alpha: 0.3)),
                          const SizedBox(height: 16),
                          const Text('لا توجد قوالب طباعة مسجلة', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          const Text('يمكنك تصميم قالب كروت جديد أو استيراد ملف قالب جاهز (.json) من جهازك.', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13), textAlign: TextAlign.center),
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
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: tpl.isDefault ? const Color(0xFF10B981) : const Color(0xFF334155),
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
                                              style: const TextStyle(
                                                color: Colors.white,
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
                                        style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const Divider(color: Color(0xFF334155), height: 1),

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
