import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:printing/printing.dart';
import 'package:pdf/pdf.dart';
import '../../../core/theme/app_theme.dart';

/// Interactive Real PDF Viewer Screen with full zoom, page navigation, direct print, save, and share
class PdfViewerScreen extends StatefulWidget {
  final Uint8List pdfBytes;
  final String title;
  final String filename;
  final int totalCards;

  const PdfViewerScreen({
    super.key,
    required this.pdfBytes,
    this.title = 'معاينة ملف PDF الفعلي',
    this.filename = 'Hotspot_Cards.pdf',
    this.totalCards = 0,
  });

  @override
  State<PdfViewerScreen> createState() => _PdfViewerScreenState();
}

class _PdfViewerScreenState extends State<PdfViewerScreen> {
  bool _isSaving = false;

  void _showSnackBar(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? const Color(0xFFEF4444) : const Color(0xFF10B981),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _sharePdf() async {
    try {
      await Printing.sharePdf(
        bytes: widget.pdfBytes,
        filename: widget.filename,
      );
    } catch (e) {
      _showSnackBar('فشل مشاركة ملف PDF: $e', isError: true);
    }
  }

  Future<void> _saveToDevice() async {
    setState(() => _isSaving = true);
    try {
      Directory? directory;
      if (Platform.isAndroid) {
        directory = Directory('/storage/emulated/0/Download');
        if (!await directory.exists()) {
          directory = await getExternalStorageDirectory();
        }
      } else {
        directory = await getApplicationDocumentsDirectory();
      }

      if (directory != null) {
        final filePath = '${directory.path}/${widget.filename}';
        final file = File(filePath);
        await file.writeAsBytes(widget.pdfBytes);

        _showSnackBar(
          'تم حفظ ملف PDF بنجاح في: ${directory.path.split("/").last}/${widget.filename}',
        );
      } else {
        // Fallback to native OS share dialog
        await _sharePdf();
      }
    } catch (_) {
      // Fallback to share dialog on permission or path issues
      await _sharePdf();
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _printDirectly() async {
    try {
      await Printing.layoutPdf(
        name: widget.title,
        onLayout: (PdfPageFormat format) async => widget.pdfBytes,
      );
    } catch (e) {
      _showSnackBar('فشل إرسال أمر الطباعة: $e', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.title,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            if (widget.totalCards > 0)
              Text(
                'إجمالي الكروت: ${widget.totalCards} كرت جاهز للطباعة',
                style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
              ),
          ],
        ),
        backgroundColor: const Color(0xFF1E293B),
        elevation: 2,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.download_rounded, color: Colors.white),
            tooltip: 'حفظ في جهاز الهاتف',
            onPressed: _isSaving ? null : _saveToDevice,
          ),
          IconButton(
            icon: const Icon(Icons.share_outlined, color: Colors.white),
            tooltip: 'مشاركة PDF',
            onPressed: _sharePdf,
          ),
          IconButton(
            icon: const Icon(Icons.print_outlined, color: AppTheme.primary),
            tooltip: 'طباعة مباشرة',
            onPressed: _printDirectly,
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Top Quick Info Banner
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: const Color(0xFF1E293B).withValues(alpha: 0.6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(Icons.zoom_in, size: 16, color: Color(0xFF38BDF8)),
                        SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'يدعم التكبير والتصغير وتصفح الصفحات بدقة أصلية 100%',
                            style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 11),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: const Color(0xFF10B981), width: 0.6),
                    ),
                    child: const Text(
                      'PDF متجهي عالي الدقة',
                      style: TextStyle(color: Color(0xFF10B981), fontSize: 10, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
            ),

            // Real PDF Interactive Preview Engine
            Expanded(
              child: PdfPreview(
                build: (format) => widget.pdfBytes,
                useActions: false, // We supply custom toolbar actions above
                canChangePageFormat: false,
                canChangeOrientation: false,
                canDebug: false,
                dynamicLayout: false,
                previewPageMargin: const EdgeInsets.all(12),
                loadingWidget: const Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(color: AppTheme.primary),
                      SizedBox(height: 12),
                      Text(
                        'جاري عرض مستند PDF...',
                        style: TextStyle(color: Colors.white, fontSize: 13),
                      ),
                    ],
                  ),
                ),
                onError: (context, error) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.error_outline, size: 48, color: Color(0xFFEF4444)),
                        const SizedBox(height: 12),
                        Text(
                          'تعذر عرض ملف PDF: $error',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),

            // Persistent Action Bottom Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: const BoxDecoration(
                color: Color(0xFF1E293B),
                border: Border(top: BorderSide(color: Color(0xFF334155), width: 0.8)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xFF475569)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      icon: const Icon(Icons.share, size: 16),
                      label: const Text('مشاركة الملف', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      onPressed: _sharePdf,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF38BDF8),
                        side: const BorderSide(color: Color(0xFF0284C7)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      icon: const Icon(Icons.download, size: 16),
                      label: const Text('حفظ في الجهاز', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      onPressed: _saveToDevice,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      icon: const Icon(Icons.print, size: 16),
                      label: const Text('طباعة مباشرة', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      onPressed: _printDirectly,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
