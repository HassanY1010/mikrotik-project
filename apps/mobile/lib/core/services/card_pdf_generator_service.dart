import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../models/models.dart';
import 'pdf_font_service.dart';

enum CardPdfLayout {
  a4Grid10,  // 2 cols x 5 rows = 10 cards (Large, premium with big QR and details)
  a4Grid12,  // 3 cols x 4 rows = 12 cards (Standard voucher size)
  a4Grid24,  // 3 cols x 8 rows = 24 cards (High efficiency)
  a4Grid100, // 5 cols x 20 rows = 100 cards (Micro dense tokens)
}

class CardDesignTheme {
  final String id;
  final String name;
  final PdfColor primaryColor;
  final PdfColor accentColor;
  final PdfColor headerTextColor;
  final PdfColor badgeTextColor;

  const CardDesignTheme({
    required this.id,
    required this.name,
    required this.primaryColor,
    required this.accentColor,
    this.headerTextColor = PdfColors.white,
    this.badgeTextColor = PdfColors.black,
  });

  static const CardDesignTheme football = CardDesignTheme(
    id: 'FOOTBALL',
    name: 'ثيم كرة القدم الذهبي',
    primaryColor: PdfColor.fromInt(0xFF065F46), // Emerald
    accentColor: PdfColor.fromInt(0xFFF59E0B),  // Amber / Gold
    badgeTextColor: PdfColors.black,
  );

  static const CardDesignTheme eidMubarak = CardDesignTheme(
    id: 'EID_MUBARAK',
    name: 'عيد مبارك الملكي',
    primaryColor: PdfColor.fromInt(0xFF1E3A8A), // Royal Blue
    accentColor: PdfColor.fromInt(0xFFD97706),  // Amber
    badgeTextColor: PdfColors.white,
  );

  static const CardDesignTheme turquoise = CardDesignTheme(
    id: 'TURQUOISE',
    name: 'الفيروزي الحديث',
    primaryColor: PdfColor.fromInt(0xFF0F766E), // Teal
    accentColor: PdfColor.fromInt(0xFF06B6D4),  // Cyan
    badgeTextColor: PdfColors.black,
  );

  static const CardDesignTheme ticket = CardDesignTheme(
    id: 'TICKET',
    name: 'تذكرة كلاسيكية',
    primaryColor: PdfColor.fromInt(0xFF4338CA), // Indigo
    accentColor: PdfColor.fromInt(0xFFEC4899),  // Pink
    badgeTextColor: PdfColors.white,
  );

  static const CardDesignTheme compact = CardDesignTheme(
    id: 'COMPACT',
    name: 'مدمج أنيق',
    primaryColor: PdfColor.fromInt(0xFF334155), // Slate
    accentColor: PdfColor.fromInt(0xFF64748B),  // Light Slate
    badgeTextColor: PdfColors.white,
  );

  static CardDesignTheme fromId(String? id) {
    switch (id?.toUpperCase()) {
      case 'FOOTBALL':
        return football;
      case 'EID':
      case 'EID_MUBARAK':
        return eidMubarak;
      case 'TURQUOISE':
      case 'MODERN_TEAL':
        return turquoise;
      case 'TICKET':
        return ticket;
      case 'COMPACT':
        return compact;
      default:
        return football;
    }
  }
}

class CardPdfGeneratorService {
  /// Generates a high-resolution, print-ready PDF document for cards with full Arabic/English support & exact theme preservation
  static Future<Uint8List> generateCardsPdf({
    required List<OfflineCardModel> cards,
    required String networkName,
    String? supportPhone,
    CardPdfLayout layout = CardPdfLayout.a4Grid10,
    String? batchNumber,
    String? themePreset,
  }) async {
    final theme = CardDesignTheme.fromId(themePreset);
    final fontBundle = await PdfFontService.loadArabicFonts();

    final pdf = pw.Document(
      title: 'كروت هوتسبوت - $networkName',
      author: 'MikroTik HotSpot Cloud',
      theme: pw.ThemeData.withFont(
        base: fontBundle.regular,
        bold: fontBundle.bold,
      ),
    );

    // Grid configuration based on layout
    int cols;
    int rows;
    double cardMargin;
    double fontSizeTitle;
    double fontSizeCode;
    double qrSize;
    bool showQr;

    switch (layout) {
      case CardPdfLayout.a4Grid10:
        cols = 2;
        rows = 5;
        cardMargin = 4.0;
        fontSizeTitle = 9.5;
        fontSizeCode = 12.0;
        qrSize = 44.0;
        showQr = true;
        break;
      case CardPdfLayout.a4Grid12:
        cols = 3;
        rows = 4;
        cardMargin = 3.5;
        fontSizeTitle = 8.5;
        fontSizeCode = 11.0;
        qrSize = 38.0;
        showQr = true;
        break;
      case CardPdfLayout.a4Grid24:
        cols = 3;
        rows = 8;
        cardMargin = 2.0;
        fontSizeTitle = 7.0;
        fontSizeCode = 9.0;
        qrSize = 26.0;
        showQr = true;
        break;
      case CardPdfLayout.a4Grid100:
        cols = 5;
        rows = 20;
        cardMargin = 1.0;
        fontSizeTitle = 5.5;
        fontSizeCode = 7.0;
        qrSize = 0.0;
        showQr = false;
        break;
    }

    final cardsPerPage = cols * rows;
    final totalPages = (cards.length / cardsPerPage).ceil().clamp(1, 9999);

    for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      final startIndex = pageIndex * cardsPerPage;
      final pageCards = cards.skip(startIndex).take(cardsPerPage).toList();

      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(10),
          theme: pw.ThemeData.withFont(
            base: fontBundle.regular,
            bold: fontBundle.bold,
          ),
          build: (pw.Context context) {
            return pw.Column(
              children: [
                // Page Header with print marks and batch metadata in Arabic RTL
                pw.Container(
                  padding: const pw.EdgeInsets.only(bottom: 4),
                  decoration: const pw.BoxDecoration(
                    border: pw.Border(
                      bottom: pw.BorderSide(color: PdfColors.grey400, width: 0.5),
                    ),
                  ),
                  child: pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    children: [
                      pw.Directionality(
                        textDirection: pw.TextDirection.rtl,
                        child: pw.Text(
                          'شبكة: $networkName ${batchNumber != null ? ' | دفعة: $batchNumber' : ''}',
                          style: pw.TextStyle(
                            fontSize: 8,
                            color: PdfColors.grey700,
                            fontWeight: pw.FontWeight.bold,
                          ),
                        ),
                      ),
                      if (supportPhone != null && supportPhone.isNotEmpty)
                        pw.Directionality(
                          textDirection: pw.TextDirection.ltr,
                          child: pw.Text(
                            'Support: $supportPhone',
                            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
                          ),
                        ),
                      pw.Directionality(
                        textDirection: pw.TextDirection.rtl,
                        child: pw.Text(
                          'صفحة ${pageIndex + 1} من $totalPages | الكروت (${startIndex + 1} - ${startIndex + pageCards.length})',
                          style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
                        ),
                      ),
                    ],
                  ),
                ),
                pw.SizedBox(height: 3),

                // Cards Grid Matrix
                pw.Expanded(
                  child: pw.GridView(
                    crossAxisCount: cols,
                    childAspectRatio: (PdfPageFormat.a4.availableWidth / cols) /
                        ((PdfPageFormat.a4.availableHeight - 16) / rows),
                    children: List.generate(pageCards.length, (cardIdx) {
                      final card = pageCards[cardIdx];
                      return layout == CardPdfLayout.a4Grid100
                          ? _buildMiniCardItem(
                              card: card,
                              networkName: networkName,
                              theme: theme,
                              fontBundle: fontBundle,
                              cardMargin: cardMargin,
                              index: startIndex + cardIdx + 1,
                            )
                          : _buildCardItem(
                              card: card,
                              networkName: networkName,
                              theme: theme,
                              fontBundle: fontBundle,
                              cardMargin: cardMargin,
                              fontSizeTitle: fontSizeTitle,
                              fontSizeCode: fontSizeCode,
                              qrSize: qrSize,
                              showQr: showQr,
                              index: startIndex + cardIdx + 1,
                            );
                    }),
                  ),
                ),
              ],
            );
          },
        ),
      );
    }

    return pdf.save();
  }

  /// Builds a standard hotspot card preserving the selected design theme, colors, borders & credentials
  static pw.Widget _buildCardItem({
    required OfflineCardModel card,
    required String networkName,
    required CardDesignTheme theme,
    required PdfFontBundle fontBundle,
    required double cardMargin,
    required double fontSizeTitle,
    required double fontSizeCode,
    required double qrSize,
    required bool showQr,
    required int index,
  }) {
    final hasPin = card.clearPassword != null &&
        card.clearPassword!.isNotEmpty &&
        card.clearPassword != card.username;

    return pw.Container(
      margin: pw.EdgeInsets.all(cardMargin),
      padding: const pw.EdgeInsets.all(3.5),
      decoration: pw.BoxDecoration(
        color: PdfColors.white,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4)),
        border: pw.Border.all(
          color: PdfColors.grey400,
          width: 0.6,
          style: pw.BorderStyle.dashed, // Precision dotted cut guidelines for print shops
        ),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          // Theme Header Bar: Network Name + Price Badge
          pw.Container(
            padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 2.5),
            decoration: pw.BoxDecoration(
              color: theme.primaryColor,
              borderRadius: const pw.BorderRadius.all(pw.Radius.circular(3)),
            ),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Expanded(
                  child: pw.Directionality(
                    textDirection: pw.TextDirection.rtl,
                    child: pw.Text(
                      networkName,
                      maxLines: 1,
                      overflow: pw.TextOverflow.clip,
                      style: pw.TextStyle(
                        fontSize: fontSizeTitle,
                        color: theme.headerTextColor,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                  ),
                ),
                pw.Container(
                  padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: pw.BoxDecoration(
                    color: theme.accentColor,
                    borderRadius: const pw.BorderRadius.all(pw.Radius.circular(2)),
                  ),
                  child: pw.Directionality(
                    textDirection: pw.TextDirection.ltr,
                    child: pw.Text(
                      '${card.price.toStringAsFixed(0)} ${card.currency}',
                      style: pw.TextStyle(
                        fontSize: fontSizeTitle - 1,
                        fontWeight: pw.FontWeight.bold,
                        color: theme.badgeTextColor,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Body: Profile info + Credentials Box + QR Code
          pw.Padding(
            padding: const pw.EdgeInsets.symmetric(vertical: 2),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                // Left: Credentials column
                pw.Expanded(
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    mainAxisAlignment: pw.MainAxisAlignment.center,
                    children: [
                      // Profile Name in Arabic RTL
                      pw.Directionality(
                        textDirection: pw.TextDirection.rtl,
                        child: pw.Text(
                          card.profileName,
                          maxLines: 1,
                          style: pw.TextStyle(
                            fontSize: fontSizeTitle - 0.5,
                            color: theme.primaryColor,
                            fontWeight: pw.FontWeight.bold,
                          ),
                        ),
                      ),
                      pw.SizedBox(height: 2),

                      // Code / Username box with LTR direction for numbers & symbols
                      pw.Container(
                        padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                        decoration: pw.BoxDecoration(
                          color: const PdfColor.fromInt(0xFFF1F5F9), // Light grey
                          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(2.5)),
                          border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
                        ),
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: [
                            pw.Directionality(
                              textDirection: pw.TextDirection.rtl,
                              child: pw.Text(
                                hasPin ? 'اسم المستخدم:' : 'رمز الدخول (PIN):',
                                style: const pw.TextStyle(
                                  fontSize: 6,
                                  color: PdfColors.grey700,
                                ),
                              ),
                            ),
                            pw.Directionality(
                              textDirection: pw.TextDirection.ltr,
                              child: pw.Text(
                                card.username,
                                style: pw.TextStyle(
                                  fontSize: fontSizeCode,
                                  fontWeight: pw.FontWeight.bold,
                                  letterSpacing: 1.0,
                                  color: PdfColors.black,
                                ),
                              ),
                            ),
                            if (hasPin) ...[
                              pw.SizedBox(height: 1),
                              pw.Directionality(
                                textDirection: pw.TextDirection.ltr,
                                child: pw.Text(
                                  'PIN: ${card.clearPassword}',
                                  style: pw.TextStyle(
                                    fontSize: fontSizeCode - 1.5,
                                    fontWeight: pw.FontWeight.bold,
                                    color: const PdfColor.fromInt(0xFFDC2626), // Red
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Right: High resolution QR Code for smartphone instant login
                if (showQr && qrSize > 0) ...[
                  pw.SizedBox(width: 3),
                  pw.Container(
                    width: qrSize,
                    height: qrSize,
                    padding: const pw.EdgeInsets.all(1.5),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
                      borderRadius: const pw.BorderRadius.all(pw.Radius.circular(2)),
                      color: PdfColors.white,
                    ),
                    child: pw.BarcodeWidget(
                      barcode: pw.Barcode.qrCode(),
                      data: card.loginUrl,
                      drawText: false,
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Footer: Serial number + Arabic instructions
          pw.Container(
            padding: const pw.EdgeInsets.only(top: 1.5),
            decoration: const pw.BoxDecoration(
              border: pw.Border(top: pw.BorderSide(color: PdfColors.grey300, width: 0.5)),
            ),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Directionality(
                  textDirection: pw.TextDirection.ltr,
                  child: pw.Text(
                    'SN: ${card.serialNumber.isNotEmpty ? card.serialNumber : '#$index'}',
                    style: const pw.TextStyle(fontSize: 5.5, color: PdfColors.grey600),
                  ),
                ),
                pw.Directionality(
                  textDirection: pw.TextDirection.rtl,
                  child: pw.Text(
                    'امسح الرمز أو ادخل الكود',
                    style: const pw.TextStyle(fontSize: 5.5, color: PdfColors.grey600),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Builds a dense mini card (100 cards per A4 page)
  static pw.Widget _buildMiniCardItem({
    required OfflineCardModel card,
    required String networkName,
    required CardDesignTheme theme,
    required PdfFontBundle fontBundle,
    required double cardMargin,
    required int index,
  }) {
    final hasPin = card.clearPassword != null &&
        card.clearPassword!.isNotEmpty &&
        card.clearPassword != card.username;

    return pw.Container(
      margin: pw.EdgeInsets.all(cardMargin),
      padding: const pw.EdgeInsets.all(1.5),
      decoration: pw.BoxDecoration(
        color: PdfColors.white,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(1.5)),
        border: pw.Border.all(color: PdfColors.grey400, width: 0.4, style: pw.BorderStyle.dashed),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          // Mini Header
          pw.Container(
            padding: const pw.EdgeInsets.symmetric(horizontal: 1.5, vertical: 0.8),
            decoration: pw.BoxDecoration(
              color: theme.primaryColor,
              borderRadius: const pw.BorderRadius.all(pw.Radius.circular(1)),
            ),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Expanded(
                  child: pw.Directionality(
                    textDirection: pw.TextDirection.rtl,
                    child: pw.Text(
                      card.profileName,
                      maxLines: 1,
                      overflow: pw.TextOverflow.clip,
                      style: pw.TextStyle(
                        fontSize: 4.5,
                        color: theme.headerTextColor,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                  ),
                ),
                pw.Directionality(
                  textDirection: pw.TextDirection.ltr,
                  child: pw.Text(
                    '${card.price.toStringAsFixed(0)} ${card.currency}',
                    style: pw.TextStyle(
                      fontSize: 4.5,
                      color: theme.accentColor,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Mini Code Box
          pw.Center(
            child: pw.Directionality(
              textDirection: pw.TextDirection.ltr,
              child: pw.Text(
                card.username,
                style: pw.TextStyle(
                  fontSize: 7.0,
                  fontWeight: pw.FontWeight.bold,
                  letterSpacing: 0.6,
                  color: PdfColors.black,
                ),
              ),
            ),
          ),

          if (hasPin)
            pw.Center(
              child: pw.Directionality(
                textDirection: pw.TextDirection.ltr,
                child: pw.Text(
                  'PIN: ${card.clearPassword}',
                  style: pw.TextStyle(
                    fontSize: 4.5,
                    fontWeight: pw.FontWeight.bold,
                    color: const PdfColor.fromInt(0xFFDC2626),
                  ),
                ),
              ),
            ),

          // Mini Footer
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Directionality(
                textDirection: pw.TextDirection.ltr,
                child: pw.Text(
                  '#${card.serialNumber.isNotEmpty ? card.serialNumber.substring(card.serialNumber.length > 5 ? card.serialNumber.length - 5 : 0) : index}',
                  style: const pw.TextStyle(fontSize: 4, color: PdfColors.grey600),
                ),
              ),
              pw.Directionality(
                textDirection: pw.TextDirection.rtl,
                child: pw.Text(
                  networkName,
                  maxLines: 1,
                  style: const pw.TextStyle(fontSize: 4, color: PdfColors.grey600),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Exports and opens the native OS Share dialog (WhatsApp, Telegram, Save to Files, Print)
  static Future<void> shareCardsPdf({
    required List<OfflineCardModel> cards,
    required String networkName,
    String? supportPhone,
    CardPdfLayout layout = CardPdfLayout.a4Grid10,
    String? batchNumber,
    String? themePreset,
  }) async {
    final bytes = await generateCardsPdf(
      cards: cards,
      networkName: networkName,
      supportPhone: supportPhone,
      layout: layout,
      batchNumber: batchNumber,
      themePreset: themePreset,
    );

    final cleanBatch = batchNumber != null ? '_$batchNumber' : '';
    final filename = 'Hotspot_Cards${cleanBatch}_${DateTime.now().millisecondsSinceEpoch.toString().substring(8)}.pdf';

    await Printing.sharePdf(
      bytes: bytes,
      filename: filename,
    );
  }

  /// Opens the in-app interactive PDF layout & direct printing preview
  static Future<void> previewAndPrint({
    required List<OfflineCardModel> cards,
    required String networkName,
    String? supportPhone,
    CardPdfLayout layout = CardPdfLayout.a4Grid10,
    String? batchNumber,
    String? themePreset,
  }) async {
    await Printing.layoutPdf(
      name: 'كروت هوتسبوت - $networkName',
      onLayout: (PdfPageFormat format) async {
        return generateCardsPdf(
          cards: cards,
          networkName: networkName,
          supportPhone: supportPhone,
          layout: layout,
          batchNumber: batchNumber,
          themePreset: themePreset,
        );
      },
    );
  }
}
