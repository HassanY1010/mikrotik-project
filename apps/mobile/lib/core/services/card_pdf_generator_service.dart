import 'dart:convert';
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

  static CardDesignTheme fromId(String? id, {String? customPrimaryHex, String? customAccentHex, String? customName}) {
    if (customPrimaryHex != null && customPrimaryHex.isNotEmpty) {
      PdfColor parseHex(String hex, PdfColor fallback) {
        try {
          final clean = hex.replaceAll('#', '');
          final val = int.tryParse(clean.length == 6 ? 'FF$clean' : clean, radix: 16);
          return val != null ? PdfColor.fromInt(val) : fallback;
        } catch (_) {
          return fallback;
        }
      }
      return CardDesignTheme(
        id: id ?? 'CUSTOM',
        name: customName ?? 'قالب مخصص',
        primaryColor: parseHex(customPrimaryHex, const PdfColor.fromInt(0xFF1E3A8A)),
        accentColor: parseHex(customAccentHex ?? '#38BDF8', const PdfColor.fromInt(0xFF38BDF8)),
      );
    }
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
    String? customPrimaryColor,
    String? customAccentColor,
    String? customBackgroundImageBase64,
    Uint8List? customBackgroundImageBytes,
    bool? showQr,
    bool showPrice = true,
    bool showSerial = true,
    String? instructions,
    CardTemplateModel? template,
    bool isLandscape = false,
    int? customCols,
    int? customRows,
    double? customMargin,
    double? customSpacing,
  }) async {
    final effectiveNetworkName = networkName.trim().isNotEmpty
        ? networkName.trim()
        : (template?.networkName ?? 'سودافاي | SudaFi Net');

    final effectiveSupportPhone = supportPhone ?? (template?.supportPhone.isNotEmpty == true ? template!.supportPhone : null);
    final effectiveThemePreset = themePreset ?? (template?.themePreset.isNotEmpty == true ? template!.themePreset : 'CLASSIC');
    final effectivePrimaryColor = customPrimaryColor ?? template?.primaryColor;
    final effectiveAccentColor = customAccentColor ?? template?.accentColor;
    final effectiveBackgroundImageBase64 = customBackgroundImageBase64 ?? template?.backgroundImageBase64;
    final effectiveInstructions = instructions ?? template?.instructions;
    final effectiveShowPrice = template != null ? template.showPrice : showPrice;
    final effectiveShowSerial = template != null ? template.showSerial : showSerial;
    final templateShowQr = template?.showQr;
    final elementsLayout = template?.elementsLayout;

    final theme = CardDesignTheme.fromId(
      effectiveThemePreset,
      customPrimaryHex: effectivePrimaryColor,
      customAccentHex: effectiveAccentColor,
    );
    final fontBundle = await PdfFontService.loadArabicFonts();

    Uint8List? bgBytes = customBackgroundImageBytes;
    if (bgBytes == null && effectiveBackgroundImageBase64 != null && effectiveBackgroundImageBase64.isNotEmpty) {
      try {
        bgBytes = base64Decode(effectiveBackgroundImageBase64);
      } catch (_) {}
    }

    pw.MemoryImage? bgImage;
    if (bgBytes != null && bgBytes.isNotEmpty) {
      try {
        bgImage = pw.MemoryImage(bgBytes);
      } catch (_) {
        bgImage = null;
      }
    }

    final pdf = pw.Document(
      title: 'كروت هوتسبوت - $effectiveNetworkName',
      author: 'MikroTik HotSpot Cloud',
      theme: pw.ThemeData.withFont(
        base: fontBundle.regular,
        bold: fontBundle.bold,
      ),
    );

    final effectivePageFormat = isLandscape ? PdfPageFormat.a4.landscape : PdfPageFormat.a4;

    // Grid configuration based on layout or custom grid
    int cols;
    int rows;
    double cardMargin;
    double fontSizeTitle;
    double fontSizeCode;
    double qrSize;
    bool layoutDefaultShowQr;

    if (customCols != null && customRows != null && customCols > 0 && customRows > 0) {
      cols = customCols;
      rows = customRows;
      final totalGrid = cols * rows;
      cardMargin = customMargin ?? (totalGrid > 40 ? 1.0 : (totalGrid > 20 ? 2.0 : 3.5));
      fontSizeTitle = (totalGrid > 40 ? 5.5 : (totalGrid > 20 ? 7.0 : 9.0));
      fontSizeCode = (totalGrid > 40 ? 7.0 : (totalGrid > 20 ? 9.0 : 11.5));
      qrSize = (totalGrid > 50 ? 0.0 : (totalGrid > 20 ? 26.0 : 38.0));
      layoutDefaultShowQr = qrSize > 0;
    } else {
      switch (layout) {
        case CardPdfLayout.a4Grid10:
          cols = 2;
          rows = 5;
          cardMargin = 4.0;
          fontSizeTitle = 9.5;
          fontSizeCode = 12.0;
          qrSize = 44.0;
          layoutDefaultShowQr = true;
          break;
        case CardPdfLayout.a4Grid12:
          cols = 3;
          rows = 4;
          cardMargin = 3.5;
          fontSizeTitle = 8.5;
          fontSizeCode = 11.0;
          qrSize = 38.0;
          layoutDefaultShowQr = true;
          break;
        case CardPdfLayout.a4Grid24:
          cols = 3;
          rows = 8;
          cardMargin = 2.0;
          fontSizeTitle = 7.0;
          fontSizeCode = 9.0;
          qrSize = 26.0;
          layoutDefaultShowQr = true;
          break;
        case CardPdfLayout.a4Grid100:
          cols = 5;
          rows = 20;
          cardMargin = 1.0;
          fontSizeTitle = 5.5;
          fontSizeCode = 7.0;
          qrSize = 0.0;
          layoutDefaultShowQr = false;
          break;
      }
    }

    final bool effectiveShowQr = (layout == CardPdfLayout.a4Grid100 && customCols == null) ? false : (templateShowQr ?? showQr ?? layoutDefaultShowQr);

    final cardsPerPage = cols * rows;
    final totalPages = (cards.length / cardsPerPage).ceil().clamp(1, 9999);

    for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      final startIndex = pageIndex * cardsPerPage;
      final pageCards = cards.skip(startIndex).take(cardsPerPage).toList();

      pdf.addPage(
        pw.Page(
          pageFormat: effectivePageFormat,
          margin: pw.EdgeInsets.all(customSpacing ?? 10),
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
                          'شبكة: $effectiveNetworkName ${batchNumber != null ? ' | دفعة: $batchNumber' : ''}',
                          style: pw.TextStyle(
                            fontSize: 8,
                            color: PdfColors.grey700,
                            fontWeight: pw.FontWeight.bold,
                          ),
                        ),
                      ),
                      if (effectiveSupportPhone != null && effectiveSupportPhone.isNotEmpty)
                        pw.Directionality(
                          textDirection: pw.TextDirection.ltr,
                          child: pw.Text(
                            'Support: $effectiveSupportPhone',
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
                    childAspectRatio: (effectivePageFormat.availableWidth / cols) /
                        ((effectivePageFormat.availableHeight - 16) / rows),
                    children: List.generate(pageCards.length, (cardIdx) {
                      final card = pageCards[cardIdx];
                      return layout == CardPdfLayout.a4Grid100
                          ? _buildMiniCardItem(
                              card: card,
                              networkName: effectiveNetworkName,
                              theme: theme,
                              fontBundle: fontBundle,
                              cardMargin: cardMargin,
                              index: startIndex + cardIdx + 1,
                              bgImage: bgImage,
                              showPrice: effectiveShowPrice,
                              showSerial: effectiveShowSerial,
                            )
                          : _buildCardItem(
                              card: card,
                              networkName: effectiveNetworkName,
                              theme: theme,
                              fontBundle: fontBundle,
                              cardMargin: cardMargin,
                              fontSizeTitle: fontSizeTitle,
                              fontSizeCode: fontSizeCode,
                              qrSize: qrSize,
                              showQr: effectiveShowQr,
                              showPrice: effectiveShowPrice,
                              showSerial: effectiveShowSerial,
                              instructions: effectiveInstructions,
                              index: startIndex + cardIdx + 1,
                              bgImage: bgImage,
                              elementsLayout: elementsLayout,
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

  static double _scaleMultiplier(String scale) {
    switch (scale) {
      case 'small':
        return 0.82;
      case 'large':
        return 1.25;
      default:
        return 1.0;
    }
  }

  static pw.Widget _buildZoneRow(
    List<pw.Widget> leftList,
    List<pw.Widget> centerList,
    List<pw.Widget> rightList,
  ) {
    if (leftList.isEmpty && centerList.isEmpty && rightList.isEmpty) {
      return pw.SizedBox();
    }

    final pw.Widget? leftCol = leftList.isNotEmpty
        ? (leftList.length == 1
            ? leftList.first
            : pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                mainAxisSize: pw.MainAxisSize.min,
                children: leftList,
              ))
        : null;

    final pw.Widget? centerCol = centerList.isNotEmpty
        ? (centerList.length == 1
            ? centerList.first
            : pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.center,
                mainAxisSize: pw.MainAxisSize.min,
                children: centerList,
              ))
        : null;

    final pw.Widget? rightCol = rightList.isNotEmpty
        ? (rightList.length == 1
            ? rightList.first
            : pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                mainAxisSize: pw.MainAxisSize.min,
                children: rightList,
              ))
        : null;

    return pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        leftCol ?? pw.SizedBox(),
        centerCol ?? pw.SizedBox(),
        rightCol ?? pw.SizedBox(),
      ],
    );
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
    bool showPrice = true,
    bool showSerial = true,
    String? instructions,
    pw.MemoryImage? bgImage,
    CardElementsLayout? elementsLayout,
  }) {
    final hasPin = card.clearPassword != null &&
        card.clearPassword!.isNotEmpty &&
        card.clearPassword != card.username;

    pw.Widget cardContent;

    if (elementsLayout != null) {
      // 1. Network Name
      final netPlacement = elementsLayout.networkName;
      final pw.Widget netWidget = pw.Directionality(
        textDirection: pw.TextDirection.rtl,
        child: pw.Text(
          networkName,
          maxLines: 1,
          overflow: pw.TextOverflow.clip,
          style: pw.TextStyle(
            fontSize: fontSizeTitle * _scaleMultiplier(netPlacement.scale),
            color: theme.headerTextColor,
            fontWeight: pw.FontWeight.bold,
          ),
        ),
      );

      // 2. Price Badge
      final pricePlacement = elementsLayout.price;
      final bool canShowPrice = showPrice && pricePlacement.isVisible;
      final pw.Widget? priceWidget = canShowPrice
          ? pw.Container(
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
                    fontSize: (fontSizeTitle - 1) * _scaleMultiplier(pricePlacement.scale),
                    fontWeight: pw.FontWeight.bold,
                    color: theme.badgeTextColor,
                  ),
                ),
              ),
            )
          : null;

      // 3. Profile details
      final profPlacement = elementsLayout.profileDetails;
      final bool canShowProf = profPlacement.isVisible;
      final pw.Widget? profileWidget = canShowProf
          ? pw.Directionality(
              textDirection: pw.TextDirection.rtl,
              child: pw.Text(
                card.profileName,
                maxLines: 1,
                style: pw.TextStyle(
                  fontSize: (fontSizeTitle - 0.5) * _scaleMultiplier(profPlacement.scale),
                  color: theme.primaryColor,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
            )
          : null;

      // 4. Credentials
      final credPlacement = elementsLayout.credentials;
      final bool canShowCred = credPlacement.isVisible;
      final pw.Widget? credWidget = canShowCred
          ? pw.Container(
              padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              decoration: pw.BoxDecoration(
                color: const PdfColor.fromInt(0xFFF1F5F9),
                borderRadius: const pw.BorderRadius.all(pw.Radius.circular(2.5)),
                border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
              ),
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                mainAxisSize: pw.MainAxisSize.min,
                children: [
                  pw.Directionality(
                    textDirection: pw.TextDirection.rtl,
                    child: pw.Text(
                      hasPin ? 'اسم المستخدم:' : 'رمز الدخول (PIN):',
                      style: pw.TextStyle(
                        fontSize: 6 * _scaleMultiplier(credPlacement.scale),
                        color: PdfColors.grey700,
                      ),
                    ),
                  ),
                  pw.Directionality(
                    textDirection: pw.TextDirection.ltr,
                    child: pw.Text(
                      card.username,
                      style: pw.TextStyle(
                        fontSize: fontSizeCode * _scaleMultiplier(credPlacement.scale),
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
                          fontSize: (fontSizeCode - 1.5) * _scaleMultiplier(credPlacement.scale),
                          fontWeight: pw.FontWeight.bold,
                          color: const PdfColor.fromInt(0xFFDC2626),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            )
          : null;

      // 5. QR Code
      final qrPlacement = elementsLayout.qrCode;
      final bool canShowQr = showQr && qrSize > 0 && qrPlacement.isVisible;
      final effectiveQrSize = qrSize * _scaleMultiplier(qrPlacement.scale);
      final pw.Widget? qrWidget = canShowQr
          ? pw.Container(
              width: effectiveQrSize,
              height: effectiveQrSize,
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
            )
          : null;

      // 6. Instructions
      final instPlacement = elementsLayout.instructions;
      final bool canShowInst = (instructions != null && instructions.isNotEmpty) && instPlacement.isVisible;
      final pw.Widget? instWidget = canShowInst
          ? pw.Directionality(
              textDirection: pw.TextDirection.rtl,
              child: pw.Text(
                instructions,
                maxLines: 1,
                overflow: pw.TextOverflow.clip,
                style: pw.TextStyle(
                  fontSize: 5.5 * _scaleMultiplier(instPlacement.scale),
                  color: PdfColors.grey700,
                ),
              ),
            )
          : null;

      // 7. Serial Number
      final snPlacement = elementsLayout.serialNumber;
      final bool canShowSn = showSerial && snPlacement.isVisible;
      final pw.Widget? snWidget = canShowSn
          ? pw.Directionality(
              textDirection: pw.TextDirection.ltr,
              child: pw.Text(
                'SN: ${card.serialNumber.isNotEmpty ? card.serialNumber : '#$index'}',
                style: pw.TextStyle(
                  fontSize: 5.5 * _scaleMultiplier(snPlacement.scale),
                  color: PdfColors.grey600,
                ),
              ),
            )
          : null;

      // Group into 3 vertical zones: top, middle, bottom
      final List<_PdfZoneEntry> allEntries = [
        _PdfZoneEntry(netWidget, netPlacement.vertical, netPlacement.align),
        if (priceWidget != null) _PdfZoneEntry(priceWidget, pricePlacement.vertical, pricePlacement.align),
        if (profileWidget != null) _PdfZoneEntry(profileWidget, profPlacement.vertical, profPlacement.align),
        if (credWidget != null) _PdfZoneEntry(credWidget, credPlacement.vertical, credPlacement.align),
        if (qrWidget != null) _PdfZoneEntry(qrWidget, qrPlacement.vertical, qrPlacement.align),
        if (instWidget != null) _PdfZoneEntry(instWidget, instPlacement.vertical, instPlacement.align),
        if (snWidget != null) _PdfZoneEntry(snWidget, snPlacement.vertical, snPlacement.align),
      ];

      final topEntries = allEntries.where((e) => e.vertical == 'top').toList();
      final midEntries = allEntries.where((e) => e.vertical == 'middle').toList();
      final botEntries = allEntries.where((e) => e.vertical == 'bottom').toList();

      final topLeft = topEntries.where((e) => e.align == 'left').map((e) => e.widget).toList();
      final topCenter = topEntries.where((e) => e.align == 'center').map((e) => e.widget).toList();
      final topRight = topEntries.where((e) => e.align == 'right').map((e) => e.widget).toList();

      final midLeft = midEntries.where((e) => e.align == 'left').map((e) => e.widget).toList();
      final midCenter = midEntries.where((e) => e.align == 'center').map((e) => e.widget).toList();
      final midRight = midEntries.where((e) => e.align == 'right').map((e) => e.widget).toList();

      final botLeft = botEntries.where((e) => e.align == 'left').map((e) => e.widget).toList();
      final botCenter = botEntries.where((e) => e.align == 'center').map((e) => e.widget).toList();
      final botRight = botEntries.where((e) => e.align == 'right').map((e) => e.widget).toList();

      pw.Widget? topContainer;
      if (topLeft.isNotEmpty || topCenter.isNotEmpty || topRight.isNotEmpty) {
        topContainer = pw.Container(
          padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 2.5),
          decoration: pw.BoxDecoration(
            color: theme.primaryColor,
            borderRadius: const pw.BorderRadius.all(pw.Radius.circular(3)),
          ),
          child: _buildZoneRow(topLeft, topCenter, topRight),
        );
      }

      pw.Widget? middleContainer;
      if (midLeft.isNotEmpty || midCenter.isNotEmpty || midRight.isNotEmpty) {
        middleContainer = pw.Padding(
          padding: const pw.EdgeInsets.symmetric(vertical: 2),
          child: _buildZoneRow(midLeft, midCenter, midRight),
        );
      }

      pw.Widget? bottomContainer;
      if (botLeft.isNotEmpty || botCenter.isNotEmpty || botRight.isNotEmpty) {
        bottomContainer = pw.Container(
          padding: const pw.EdgeInsets.only(top: 1.5),
          decoration: const pw.BoxDecoration(
            border: pw.Border(top: pw.BorderSide(color: PdfColors.grey300, width: 0.5)),
          ),
          child: _buildZoneRow(botLeft, botCenter, botRight),
        );
      }

      cardContent = pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          if (topContainer != null) topContainer else pw.SizedBox(),
          if (middleContainer != null) pw.Expanded(child: pw.Center(child: middleContainer)) else pw.SizedBox(),
          if (bottomContainer != null) bottomContainer else pw.SizedBox(),
        ],
      );
    } else {
      cardContent = pw.Column(
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
                if (showPrice)
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
          if (showSerial || (instructions != null && instructions.isNotEmpty))
            pw.Container(
              padding: const pw.EdgeInsets.only(top: 1.5),
              decoration: const pw.BoxDecoration(
                border: pw.Border(top: pw.BorderSide(color: PdfColors.grey300, width: 0.5)),
              ),
              child: pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  if (showSerial)
                    pw.Directionality(
                      textDirection: pw.TextDirection.ltr,
                      child: pw.Text(
                        'SN: ${card.serialNumber.isNotEmpty ? card.serialNumber : '#$index'}',
                        style: const pw.TextStyle(fontSize: 5.5, color: PdfColors.grey600),
                      ),
                    )
                  else
                    pw.SizedBox(),
                  pw.Directionality(
                    textDirection: pw.TextDirection.rtl,
                    child: pw.Text(
                      (instructions != null && instructions.isNotEmpty)
                          ? instructions
                          : 'امسح الرمز أو ادخل الكود',
                      style: const pw.TextStyle(fontSize: 5.5, color: PdfColors.grey600),
                    ),
                  ),
                ],
              ),
            ),
        ],
      );
    }

    return pw.Container(
      margin: pw.EdgeInsets.all(cardMargin),
      decoration: pw.BoxDecoration(
        color: PdfColors.white,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4)),
        border: pw.Border.all(
          color: PdfColors.grey400,
          width: 0.6,
          style: pw.BorderStyle.dashed, // Precision dotted cut guidelines for print shops
        ),
      ),
      child: pw.ClipRRect(
        horizontalRadius: 4,
        verticalRadius: 4,
        child: bgImage != null
            ? pw.Stack(
                children: [
                  pw.Positioned.fill(
                    child: pw.Image(
                      bgImage,
                      fit: pw.BoxFit.cover,
                    ),
                  ),
                  pw.Container(
                    padding: const pw.EdgeInsets.all(3.5),
                    color: const PdfColor(1, 1, 1, 0.25),
                    child: cardContent,
                  ),
                ],
              )
            : pw.Padding(
                padding: const pw.EdgeInsets.all(3.5),
                child: cardContent,
              ),
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
    bool showPrice = true,
    bool showSerial = true,
    pw.MemoryImage? bgImage,
  }) {
    final hasPin = card.clearPassword != null &&
        card.clearPassword!.isNotEmpty &&
        card.clearPassword != card.username;

    final miniCardContent = pw.Column(
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
              if (showPrice)
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
            if (showSerial)
              pw.Directionality(
                textDirection: pw.TextDirection.ltr,
                child: pw.Text(
                  '#${card.serialNumber.isNotEmpty ? card.serialNumber.substring(card.serialNumber.length > 5 ? card.serialNumber.length - 5 : 0) : index}',
                  style: const pw.TextStyle(fontSize: 4, color: PdfColors.grey600),
                ),
              )
            else
              pw.SizedBox(),
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
    );

    return pw.Container(
      margin: pw.EdgeInsets.all(cardMargin),
      decoration: pw.BoxDecoration(
        color: PdfColors.white,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(1.5)),
        border: pw.Border.all(color: PdfColors.grey400, width: 0.4, style: pw.BorderStyle.dashed),
      ),
      child: pw.ClipRRect(
        horizontalRadius: 1.5,
        verticalRadius: 1.5,
        child: bgImage != null
            ? pw.Stack(
                children: [
                  pw.Positioned.fill(
                    child: pw.Image(
                      bgImage,
                      fit: pw.BoxFit.cover,
                    ),
                  ),
                  pw.Container(
                    padding: const pw.EdgeInsets.all(1.5),
                    color: const PdfColor(1, 1, 1, 0.25),
                    child: miniCardContent,
                  ),
                ],
              )
            : pw.Padding(
                padding: const pw.EdgeInsets.all(1.5),
                child: miniCardContent,
              ),
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
    String? customPrimaryColor,
    String? customAccentColor,
    String? customBackgroundImageBase64,
    Uint8List? customBackgroundImageBytes,
    bool? showQr,
    bool showPrice = true,
    bool showSerial = true,
    String? instructions,
    CardTemplateModel? template,
    bool isLandscape = false,
    int? customCols,
    int? customRows,
    double? customMargin,
    double? customSpacing,
  }) async {
    final bytes = await generateCardsPdf(
      cards: cards,
      networkName: networkName,
      supportPhone: supportPhone,
      layout: layout,
      batchNumber: batchNumber,
      themePreset: themePreset,
      customPrimaryColor: customPrimaryColor,
      customAccentColor: customAccentColor,
      customBackgroundImageBase64: customBackgroundImageBase64,
      customBackgroundImageBytes: customBackgroundImageBytes,
      showQr: showQr,
      showPrice: showPrice,
      showSerial: showSerial,
      instructions: instructions,
      template: template,
      isLandscape: isLandscape,
      customCols: customCols,
      customRows: customRows,
      customMargin: customMargin,
      customSpacing: customSpacing,
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
    String? customPrimaryColor,
    String? customAccentColor,
    String? customBackgroundImageBase64,
    Uint8List? customBackgroundImageBytes,
    bool? showQr,
    bool showPrice = true,
    bool showSerial = true,
    String? instructions,
    CardTemplateModel? template,
    bool isLandscape = false,
    int? customCols,
    int? customRows,
    double? customMargin,
    double? customSpacing,
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
          customPrimaryColor: customPrimaryColor,
          customAccentColor: customAccentColor,
          customBackgroundImageBase64: customBackgroundImageBase64,
          customBackgroundImageBytes: customBackgroundImageBytes,
          showQr: showQr,
          showPrice: showPrice,
          showSerial: showSerial,
          instructions: instructions,
          template: template,
          isLandscape: isLandscape,
          customCols: customCols,
          customRows: customRows,
          customMargin: customMargin,
          customSpacing: customSpacing,
        );
      },
    );
  }
}

class _PdfZoneEntry {
  final pw.Widget widget;
  final String vertical;
  final String align;

  _PdfZoneEntry(this.widget, this.vertical, this.align);
}
