import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../models/models.dart';

enum CardPdfLayout {
  a4Grid10,  // 2 cols x 5 rows = 10 cards (Large, premium with big QR and details)
  a4Grid12,  // 3 cols x 4 rows = 12 cards (Standard voucher size)
  a4Grid24,  // 3 cols x 8 rows = 24 cards (High efficiency)
  a4Grid100, // 5 cols x 20 rows = 100 cards (Micro dense tokens)
}

class CardPdfGeneratorService {
  /// Generates a high-resolution, print-ready PDF document for cards
  static Future<Uint8List> generateCardsPdf({
    required List<OfflineCardModel> cards,
    required String networkName,
    String? supportPhone,
    CardPdfLayout layout = CardPdfLayout.a4Grid10,
    String? batchNumber,
  }) async {
    final pdf = pw.Document(
      title: 'كروت هوتسبوت - $networkName',
      author: 'MikroTik HotSpot Cloud',
    );

    // Load standard Arabic font or fallback unicode font for clean rendering
    pw.Font? arabicFont;
    try {
      arabicFont = await PdfGoogleFonts.cairoMedium();
    } catch (_) {
      // Fallback if offline
    }

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
        cardMargin = 2.5;
        fontSizeTitle = 7.5;
        fontSizeCode = 9.5;
        qrSize = 28.0;
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
          margin: const pw.EdgeInsets.all(12),
          build: (pw.Context context) {
            return pw.Column(
              children: [
                // Page Header with print marks and batch metadata
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
                      pw.Text(
                        'شبكة: $networkName ${batchNumber != null ? ' | دفعة: $batchNumber' : ''}',
                        style: pw.TextStyle(
                          font: arabicFont,
                          fontSize: 8,
                          color: PdfColors.grey700,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                      if (supportPhone != null && supportPhone.isNotEmpty)
                        pw.Text(
                          'دعم فني: $supportPhone',
                          style: pw.TextStyle(font: arabicFont, fontSize: 8, color: PdfColors.grey700),
                        ),
                      pw.Text(
                        'صفحة ${pageIndex + 1} من $totalPages | الكروت (${startIndex + 1} - ${startIndex + pageCards.length})',
                        style: pw.TextStyle(font: arabicFont, fontSize: 8, color: PdfColors.grey600),
                      ),
                    ],
                  ),
                ),
                pw.SizedBox(height: 4),

                // Cards Grid Matrix
                pw.Expanded(
                  child: pw.GridView(
                    crossAxisCount: cols,
                    childAspectRatio: (PdfPageFormat.a4.availableWidth / cols) /
                        ((PdfPageFormat.a4.availableHeight - 20) / rows),
                    children: List.generate(pageCards.length, (cardIdx) {
                      final card = pageCards[cardIdx];
                      return _buildCardItem(
                        card: card,
                        networkName: networkName,
                        arabicFont: arabicFont,
                        cardMargin: cardMargin,
                        fontSizeTitle: fontSizeTitle,
                        fontSizeCode: fontSizeCode,
                        qrSize: qrSize,
                        showQr: showQr,
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

  /// Builds an individual hotspot card with cut marks and credentials
  static pw.Widget _buildCardItem({
    required OfflineCardModel card,
    required String networkName,
    pw.Font? arabicFont,
    required double cardMargin,
    required double fontSizeTitle,
    required double fontSizeCode,
    required double qrSize,
    required bool showQr,
  }) {
    final hasPin = card.clearPassword != null &&
        card.clearPassword!.isNotEmpty &&
        card.clearPassword != card.username;

    return pw.Container(
      margin: pw.EdgeInsets.all(cardMargin),
      padding: const pw.EdgeInsets.all(4),
      decoration: pw.BoxDecoration(
        color: PdfColors.white,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(3)),
        border: pw.Border.all(
          color: PdfColors.grey400,
          width: 0.75,
          style: pw.BorderStyle.dashed, // Dotted/dashed line for clean manual cutting at print shop
        ),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          // Header Row: Network Name + Price
          pw.Container(
            padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            decoration: const pw.BoxDecoration(
              color: PdfColor.fromInt(0xFF0F172A), // Dark slate
              borderRadius: pw.BorderRadius.all(pw.Radius.circular(2)),
            ),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Expanded(
                  child: pw.Text(
                    networkName,
                    maxLines: 1,
                    overflow: pw.TextOverflow.clip,
                    style: pw.TextStyle(
                      font: arabicFont,
                      fontSize: fontSizeTitle - 1,
                      color: PdfColors.white,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                ),
                pw.Container(
                  padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: const pw.BoxDecoration(
                    color: PdfColor.fromInt(0xFFF59E0B), // Amber badge
                    borderRadius: pw.BorderRadius.all(pw.Radius.circular(2)),
                  ),
                  child: pw.Text(
                    '${card.price.toStringAsFixed(0)} ${card.currency}',
                    style: pw.TextStyle(
                      font: arabicFont,
                      fontSize: fontSizeTitle - 1.5,
                      fontWeight: pw.FontWeight.bold,
                      color: PdfColors.black,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Middle Body: Profile info + Code + QR Code
          pw.Padding(
            padding: const pw.EdgeInsets.symmetric(vertical: 2),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                // Left: Credentials box
                pw.Expanded(
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    mainAxisAlignment: pw.MainAxisAlignment.center,
                    children: [
                      // Profile badge
                      pw.Text(
                        card.profileName,
                        maxLines: 1,
                        style: pw.TextStyle(
                          font: arabicFont,
                          fontSize: fontSizeTitle - 1,
                          color: const PdfColor.fromInt(0xFF059669), // Emerald
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                      pw.SizedBox(height: 2),

                      // Code / Username box
                      pw.Container(
                        padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                        decoration: pw.BoxDecoration(
                          color: const PdfColor.fromInt(0xFFF1F5F9), // Light grey
                          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(2)),
                          border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
                        ),
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: [
                            pw.Text(
                              hasPin ? 'User:' : 'الكود:',
                              style: pw.TextStyle(
                                font: arabicFont,
                                fontSize: fontSizeCode - 4.5,
                                color: PdfColors.grey600,
                              ),
                            ),
                            pw.Text(
                              card.username,
                              style: pw.TextStyle(
                                fontSize: fontSizeCode,
                                fontWeight: pw.FontWeight.bold,
                                letterSpacing: 1.2,
                                color: PdfColors.black,
                              ),
                            ),
                            if (hasPin) ...[
                              pw.SizedBox(height: 1),
                              pw.Text(
                                'PIN: ${card.clearPassword}',
                                style: pw.TextStyle(
                                  fontSize: fontSizeCode - 1,
                                  fontWeight: pw.FontWeight.bold,
                                  color: const PdfColor.fromInt(0xFFDC2626),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Right: QR Code for instant smartphone login
                if (showQr && qrSize > 0) ...[
                  pw.SizedBox(width: 4),
                  pw.Container(
                    width: qrSize,
                    height: qrSize,
                    padding: const pw.EdgeInsets.all(1.5),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
                      borderRadius: const pw.BorderRadius.all(pw.Radius.circular(2)),
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

          // Footer: Serial number + quick tip
          pw.Container(
            padding: const pw.EdgeInsets.only(top: 1),
            decoration: const pw.BoxDecoration(
              border: pw.Border(top: pw.BorderSide(color: PdfColors.grey300, width: 0.5)),
            ),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text(
                  'سيريال: ${card.serialNumber}',
                  style: const pw.TextStyle(fontSize: 5.5, color: PdfColors.grey600),
                ),
                pw.Text(
                  'امسح الرمز أو ادخل الكود',
                  style: pw.TextStyle(font: arabicFont, fontSize: 5.5, color: PdfColors.grey600),
                ),
              ],
            ),
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
  }) async {
    final bytes = await generateCardsPdf(
      cards: cards,
      networkName: networkName,
      supportPhone: supportPhone,
      layout: layout,
      batchNumber: batchNumber,
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
        );
      },
    );
  }
}
