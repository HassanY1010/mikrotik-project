import 'package:flutter/services.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

class PdfFontBundle {
  final pw.Font regular;
  final pw.Font bold;

  const PdfFontBundle({
    required this.regular,
    required this.bold,
  });
}

class PdfFontService {
  static PdfFontBundle? _cachedBundle;

  /// Loads reliable Arabic + Latin TrueType fonts, guaranteeing offline availability
  static Future<PdfFontBundle> loadArabicFonts() async {
    if (_cachedBundle != null) {
      return _cachedBundle!;
    }

    pw.Font? regular;
    pw.Font? bold;

    // 1. Primary: Bundled offline font assets (Guaranteed zero-network availability)
    try {
      final regularData = await rootBundle.load('assets/fonts/tahoma.ttf');
      final boldData = await rootBundle.load('assets/fonts/tahomabd.ttf');
      regular = pw.Font.ttf(regularData);
      bold = pw.Font.ttf(boldData);
    } catch (_) {
      // Asset not found or failed, try next fallback
    }

    // 2. Secondary fallback: Cairo from Google Fonts via printing package
    if (regular == null || bold == null) {
      try {
        regular = await PdfGoogleFonts.cairoMedium();
        bold = await PdfGoogleFonts.cairoBold();
      } catch (_) {
        // Offline / Google Fonts unreachable
      }
    }

    // 3. Absolute emergency fallback
    regular ??= pw.Font.helvetica();
    bold ??= pw.Font.helveticaBold();

    _cachedBundle = PdfFontBundle(regular: regular, bold: bold);
    return _cachedBundle!;
  }
}
