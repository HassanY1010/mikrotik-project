import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
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
          // Top Action Button
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.bgCard,
              border: Border(bottom: BorderSide(color: context.borderColor)),
            ),
            child: SizedBox(
              width: double.infinity,
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
                icon: const Icon(Icons.add_circle_outline, size: 20),
                label: const Text('تصميم قالب جديد بمقاس محدد', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
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
                          Icon(Icons.style_outlined, size: 64, color: Colors.white.withValues(alpha: 0.3)),
                          const SizedBox(height: 16),
                          const Text('لا توجد قوالب طباعة مسجلة', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          const Text('يمكنك اختيار أحد القوالب الجاهزة أو تصميم قالب جديد بالمقاس المناسب.', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13), textAlign: TextAlign.center),
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
