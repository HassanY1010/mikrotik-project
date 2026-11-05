import 'dart:convert';
import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../models/models.dart';
import 'pdf_font_service.dart';
import 'card_pattern_image_generator.dart';

enum CardPdfLayout {
  a4Grid10,  // 2 cols x 5 rows = 10 cards (Large, premium with big QR and details)
  a4Grid12,  // 3 cols x 4 rows = 12 cards (Standard voucher size)
  a4Grid24,  // 3 cols x 8 rows = 24 cards (High efficiency)
  a4Grid100, // 5 cols x 20 rows = 100 cards (Micro dense tokens)
  a4Grid120, // 5 cols x 24 rows = 120 cards (Ultra dense dealer voucher grid)
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

  static const CardDesignTheme cyberpunk = CardDesignTheme(
    id: 'CYBERPUNK',
    name: 'الألعاب والجيمنج الرقمي',
    primaryColor: PdfColor.fromInt(0xFF090D16), // Midnight Black
    accentColor: PdfColor.fromInt(0xFF00FFCC),  // Neon Cyan / Mint
    headerTextColor: PdfColor.fromInt(0xFF00FFCC),
    badgeTextColor: PdfColors.black,
  );

  static const CardDesignTheme artisanCoffee = CardDesignTheme(
    id: 'ARTISAN_COFFEE',
    name: 'المقاهي والمطاعم الكلاسيكي',
    primaryColor: PdfColor.fromInt(0xFF3E2723), // Dark Roast Brown
    accentColor: PdfColor.fromInt(0xFFD7CCC8),  // Warm Craft Paper
    headerTextColor: PdfColor.fromInt(0xFFD7CCC8),
    badgeTextColor: PdfColors.black,
  );

  static const CardDesignTheme ramadan = CardDesignTheme(
    id: 'RAMADAN',
    name: 'رمضان المبارك والأعياد',
    primaryColor: PdfColor.fromInt(0xFF0B192C), // Deep Indigo / Navy
    accentColor: PdfColor.fromInt(0xFFF1C40F),  // Warm Golden Crescent
    headerTextColor: PdfColor.fromInt(0xFFF1C40F),
    badgeTextColor: PdfColors.black,
  );

  static const CardDesignTheme academic = CardDesignTheme(
    id: 'ACADEMIC',
    name: 'الدراسة والجامعات',
    primaryColor: PdfColor.fromInt(0xFF1E293B), // Slate Slate
    accentColor: PdfColor.fromInt(0xFF38BDF8),  // Sky Blue
    headerTextColor: PdfColors.white,
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
      case 'CYBERPUNK':
      case 'GAMING':
        return cyberpunk;
      case 'ARTISAN_COFFEE':
      case 'COFFEE':
        return artisanCoffee;
      case 'RAMADAN':
        return ramadan;
      case 'ACADEMIC':
      case 'UNIVERSITY':
        return academic;
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
    bool showOuterBorder = true,
    bool showNetworkName = true,
    bool showProfileName = true,
    bool showCredentials = true,
    bool showInstructions = true,
    int? cardWidthMm,
    int? cardHeightMm,
    String? instructions,
    CardTemplateModel? template,
    bool isLandscape = false,
    int? customCols,
    int? customRows,
    double? customMargin,
    double? customSpacing,
    CardColorCustomization? customColors,
    CardElementsLayout? elementsLayout,
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
    final effectiveElementsLayout = elementsLayout ?? template?.elementsLayout;
    final effectiveCustomColors = customColors ?? template?.customColors;
    final effectiveDesignStyle = template?.designStyle ?? effectiveThemePreset;

    final theme = CardDesignTheme.fromId(
      effectiveThemePreset,
      customPrimaryHex: effectivePrimaryColor,
      customAccentHex: effectiveAccentColor,
    );
    final fontBundle = await PdfFontService.loadArabicFonts();

    Uint8List? bgBytes = customBackgroundImageBytes ??
        template?.getSyncBackgroundBytes() ??
        template?.backgroundImageBytes;
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

    // Generate Luxury Decorative Pattern Overlay image if enabled
    pw.MemoryImage? patternOverlayImage;
    final patternType = template?.patternOverlay ?? 'NONE';
    final patternOpacity = template?.patternOpacity ?? 0.12;
    if (patternType != 'NONE' && patternOpacity > 0.001) {
      try {
        final patternBytes = CardPatternImageGenerator.generatePatternPng(
          patternId: patternType,
          widthPx: 320,
          heightPx: 200,
          opacity: patternOpacity,
        );
        if (patternBytes != null && patternBytes.isNotEmpty) {
          patternOverlayImage = pw.MemoryImage(patternBytes);
        }
      } catch (_) {}
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
          cardMargin = 0.8;
          fontSizeTitle = 4.8;
          fontSizeCode = 6.0;
          qrSize = 19.0;
          layoutDefaultShowQr = true;
          break;
        case CardPdfLayout.a4Grid120:
          cols = 5;
          rows = 24;
          cardMargin = 0.6;
          fontSizeTitle = 4.2;
          fontSizeCode = 5.5;
          qrSize = 17.0;
          layoutDefaultShowQr = true;
          break;
      }
    }

    final bool effectiveShowQr = (templateShowQr ?? showQr ?? layoutDefaultShowQr);

    final cardsPerPage = cols * rows;
    final totalPages = (cards.length / cardsPerPage).ceil().clamp(1, 9999);

    final int effectiveWidthMm = cardWidthMm ?? template?.widthMm ?? 85;
    final int effectiveHeightMm = cardHeightMm ?? template?.heightMm ?? 54;
    final double targetAspectRatio = (effectiveWidthMm > 0 && effectiveHeightMm > 0)
        ? (effectiveWidthMm / effectiveHeightMm)
        : (85.0 / 54.0);

    final double pageMargin = (customSpacing ?? ((layout == CardPdfLayout.a4Grid100 || layout == CardPdfLayout.a4Grid120) ? 4.0 : 8.0));
    final double headerHeight = 16.0;
    final double availableWidth = effectivePageFormat.width - (2 * pageMargin);
    final double availableHeight = effectivePageFormat.height - (2 * pageMargin) - headerHeight;

    final double gapX = (cols > 4 ? 1.0 : 2.0);
    final double gapY = (rows > 10 ? 1.0 : 2.0);

    final double cardCellWidth = ((availableWidth - ((cols - 1) * gapX)) / cols).clamp(10.0, 500.0);
    final double cardCellHeight = ((availableHeight - ((rows - 1) * gapY)) / rows).clamp(10.0, 500.0);

    for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      final startIndex = pageIndex * cardsPerPage;
      final pageCards = cards.skip(startIndex).take(cardsPerPage).toList();

      pdf.addPage(
        pw.Page(
          pageFormat: effectivePageFormat,
          margin: pw.EdgeInsets.all(pageMargin),
          theme: pw.ThemeData.withFont(
            base: fontBundle.regular,
            bold: fontBundle.bold,
          ),
          build: (pw.Context context) {
            return pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.stretch,
              children: [
                // Page Header with print marks and batch metadata in Arabic RTL
                pw.Container(
                  height: headerHeight,
                  padding: const pw.EdgeInsets.only(bottom: 3),
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
                            fontSize: 7.5,
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
                            style: const pw.TextStyle(fontSize: 7.5, color: PdfColors.grey700),
                          ),
                        ),
                      pw.Directionality(
                        textDirection: pw.TextDirection.rtl,
                        child: pw.Text(
                          'صفحة ${pageIndex + 1} من $totalPages | الكروت (${startIndex + 1} - ${startIndex + pageCards.length})',
                          style: const pw.TextStyle(fontSize: 7.5, color: PdfColors.grey600),
                        ),
                      ),
                    ],
                  ),
                ),
                pw.SizedBox(height: 1),

                // Precision Cards Grid Matrix (Pure Mathematical Geometry)
                pw.Expanded(
                  child: pw.Column(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    children: List.generate(rows, (r) {
                      return pw.Row(
                        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                        children: List.generate(cols, (c) {
                          final cardIdx = r * cols + c;
                          if (cardIdx < pageCards.length) {
                            final card = pageCards[cardIdx];
                            final isDense = cols > 4 || rows > 10 || layout == CardPdfLayout.a4Grid100 || layout == CardPdfLayout.a4Grid120;
                            final cardWidget = _buildCardItem(
                              card: card,
                              networkName: effectiveNetworkName,
                              theme: theme,
                              fontBundle: fontBundle,
                              cardMargin: cardMargin,
                              fontSizeTitle: fontSizeTitle,
                              fontSizeCode: fontSizeCode,
                              qrSize: effectiveShowQr ? (qrSize > 0 ? qrSize : 22.0) : 0.0,
                              showQr: effectiveShowQr,
                              showPrice: effectiveShowPrice,
                              showSerial: effectiveShowSerial,
                              showOuterBorder: showOuterBorder,
                              showNetworkName: showNetworkName,
                              showProfileName: showProfileName,
                              showCredentials: showCredentials,
                              showInstructions: showInstructions,
                              instructions: effectiveInstructions,
                              index: startIndex + cardIdx + 1,
                              bgImage: bgImage,
                              patternOverlayImage: patternOverlayImage,
                              elementsLayout: effectiveElementsLayout,
                              targetAspectRatio: targetAspectRatio,
                              customColors: effectiveCustomColors,
                              designStyle: effectiveDesignStyle,
                              isDenseGrid: isDense,
                            );

                            return pw.SizedBox(
                              width: cardCellWidth,
                              height: cardCellHeight,
                              child: cardWidget,
                            );
                          } else {
                            // Empty placeholder cell preserving exact grid alignment on last page
                            return pw.SizedBox(
                              width: cardCellWidth,
                              height: cardCellHeight,
                            );
                          }
                        }),
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

  static PdfColor? _parsePdfHex(String? hex) {
    if (hex == null || hex.trim().isEmpty) return null;
    try {
      final clean = hex.replaceAll('#', '').trim();
      final val = int.tryParse(clean.length == 6 ? 'FF$clean' : clean, radix: 16);
      return val != null ? PdfColor.fromInt(val) : null;
    } catch (_) {
      return null;
    }
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
    bool showOuterBorder = true,
    bool showNetworkName = true,
    bool showProfileName = true,
    bool showCredentials = true,
    bool showInstructions = true,
    String? instructions,
    pw.MemoryImage? bgImage,
    pw.MemoryImage? patternOverlayImage,
    CardElementsLayout? elementsLayout,
    double targetAspectRatio = 85.0 / 54.0,
    CardColorCustomization? customColors,
    String? designStyle,
    bool isDenseGrid = false,
  }) {
    final bool isSeparateUserPass = card.clearPassword != null &&
        card.clearPassword!.isNotEmpty &&
        card.clearPassword != card.username;
    final bool isUsernameOnly = card.clearPassword == null || card.clearPassword!.isEmpty;
    final bool isUnifiedPin = !isSeparateUserPass && !isUsernameOnly;

    final bool hasCustomBgImage = bgImage != null;
    final cardBgColor = _parsePdfHex(customColors?.cardBackgroundColor) ??
        (hasCustomBgImage ? const PdfColor(0, 0, 0, 0) : PdfColors.white);

    final bool isDarkCard = !hasCustomBgImage
        ? (cardBgColor.red < 0.4 && cardBgColor.green < 0.4 && cardBgColor.blue < 0.4)
        : false;

    final headerTextColor = _parsePdfHex(customColors?.headerTextColor) ??
        (isDarkCard ? PdfColors.white : (theme.primaryColor != PdfColors.white ? theme.primaryColor : const PdfColor.fromInt(0xFF0F172A)));
    final bodyTextColor = _parsePdfHex(customColors?.bodyTextColor) ??
        (isDarkCard ? PdfColors.white : const PdfColor.fromInt(0xFF334155));
    final usernameColor = _parsePdfHex(customColors?.usernameColor) ??
        (isDarkCard ? theme.accentColor : const PdfColor.fromInt(0xFF1E3A8A));
    final passwordColor = _parsePdfHex(customColors?.passwordColor) ??
        const PdfColor.fromInt(0xFFDC2626);
    final pinColor = _parsePdfHex(customColors?.pinColor) ?? usernameColor;
    final borderColor = _parsePdfHex(customColors?.borderColor) ??
        (isDarkCard ? theme.accentColor : const PdfColor.fromInt(0xFFCBD5E1));
    final secondaryColor = _parsePdfHex(customColors?.secondaryColor) ?? theme.accentColor;
    final priceBgColor = _parsePdfHex(customColors?.priceBackgroundColor) ?? secondaryColor;
    final priceTextColor = _parsePdfHex(customColors?.priceTextColor) ?? theme.badgeTextColor;

    pw.Widget cardContent;

    if (elementsLayout != null) {
      // 1. Network Name
      final netPlacement = elementsLayout.networkName;
      final bool canShowNet = showNetworkName && netPlacement.isVisible;
      final pw.Widget? netWidget = canShowNet
          ? pw.Directionality(
              textDirection: pw.TextDirection.rtl,
              child: pw.Text(
                networkName,
                maxLines: 1,
                overflow: pw.TextOverflow.clip,
                style: pw.TextStyle(
                  fontSize: fontSizeTitle * _scaleMultiplier(netPlacement.scale),
                  color: headerTextColor,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
            )
          : null;

      // 2. Price Badge
      final pricePlacement = elementsLayout.price;
      final bool canShowPrice = showPrice && pricePlacement.isVisible;
      final pw.Widget? priceWidget = canShowPrice
          ? pw.Container(
              padding: pw.EdgeInsets.symmetric(horizontal: isDenseGrid ? 2.5 : 4, vertical: isDenseGrid ? 0.5 : 1),
              decoration: pw.BoxDecoration(
                color: priceBgColor,
                borderRadius: pw.BorderRadius.all(pw.Radius.circular(isDenseGrid ? 1.5 : 2)),
              ),
              child: pw.Directionality(
                textDirection: pw.TextDirection.ltr,
                child: pw.Text(
                  '${card.price.toStringAsFixed(0)} ${card.currency}',
                  style: pw.TextStyle(
                    fontSize: (fontSizeTitle - (isDenseGrid ? 0.5 : 1)) * _scaleMultiplier(pricePlacement.scale),
                    fontWeight: pw.FontWeight.bold,
                    color: priceTextColor,
                  ),
                ),
              ),
            )
          : null;

      // 3. Profile details
      final profPlacement = elementsLayout.profileDetails;
      final bool canShowProf = showProfileName && profPlacement.isVisible;
      final pw.Widget? profileWidget = canShowProf
          ? pw.Directionality(
              textDirection: pw.TextDirection.rtl,
              child: pw.Text(
                card.profileName,
                maxLines: 1,
                style: pw.TextStyle(
                  fontSize: (fontSizeTitle - 0.5) * _scaleMultiplier(profPlacement.scale),
                  color: bodyTextColor,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
            )
          : null;

      // 4. Credentials
      final credPlacement = elementsLayout.credentials;
      final bool canShowCred = showCredentials && credPlacement.isVisible;
      final pw.Widget? credWidget = canShowCred
          ? pw.Container(
              padding: pw.EdgeInsets.symmetric(horizontal: isDenseGrid ? 2.5 : 5, vertical: isDenseGrid ? 0.8 : 2.5),
              decoration: pw.BoxDecoration(
                color: isDarkCard ? PdfColors.white : const PdfColor.fromInt(0xFFF8FAFC),
                borderRadius: pw.BorderRadius.all(pw.Radius.circular(isDenseGrid ? 1.5 : 3)),
                border: pw.Border.all(
                  color: borderColor,
                  width: isDenseGrid ? 0.35 : 0.6,
                ),
              ),
              child: isSeparateUserPass
                  ? pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      mainAxisSize: pw.MainAxisSize.min,
                      children: [
                        pw.Text(
                          'U: ${card.username}',
                          style: pw.TextStyle(
                            fontSize: fontSizeCode * _scaleMultiplier(credPlacement.scale),
                            fontWeight: pw.FontWeight.bold,
                            color: usernameColor,
                          ),
                        ),
                        pw.SizedBox(height: 1),
                        pw.Text(
                          'P: ${card.clearPassword}',
                          style: pw.TextStyle(
                            fontSize: (fontSizeCode - 1) * _scaleMultiplier(credPlacement.scale),
                            fontWeight: pw.FontWeight.bold,
                            color: passwordColor,
                          ),
                        ),
                      ],
                    )
                  : pw.Text(
                      isUnifiedPin
                          ? 'PIN: ${card.username}'
                          : 'USER: ${card.username}',
                      style: pw.TextStyle(
                        fontSize: fontSizeCode * _scaleMultiplier(credPlacement.scale),
                        fontWeight: pw.FontWeight.bold,
                        letterSpacing: isUnifiedPin ? 1.2 : 0.8,
                        color: isUnifiedPin ? pinColor : usernameColor,
                      ),
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
              padding: pw.EdgeInsets.all(isDenseGrid ? 0.8 : 1.5),
              decoration: pw.BoxDecoration(
                border: pw.Border.all(color: borderColor, width: isDenseGrid ? 0.3 : 0.5),
                borderRadius: pw.BorderRadius.all(pw.Radius.circular(isDenseGrid ? 1.2 : 2)),
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
      final bool canShowInst = showInstructions && (instructions != null && instructions.isNotEmpty) && instPlacement.isVisible;
      final pw.Widget? instWidget = canShowInst
          ? pw.Directionality(
              textDirection: pw.TextDirection.rtl,
              child: pw.Text(
                instructions,
                maxLines: 1,
                overflow: pw.TextOverflow.clip,
                style: pw.TextStyle(
                  fontSize: (isDenseGrid ? 3.4 : 4.8) * _scaleMultiplier(instPlacement.scale),
                  color: isDarkCard ? bodyTextColor : const PdfColor.fromInt(0xFF64748B),
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
                  fontSize: (isDenseGrid ? 3.4 : 4.6) * _scaleMultiplier(snPlacement.scale),
                  color: isDarkCard ? bodyTextColor : const PdfColor.fromInt(0xFF94A3B8),
                ),
              ),
            )
          : null;

      // Group into 3 vertical zones: top, middle, bottom
      final List<_PdfZoneEntry> allEntries = [
        if (netWidget != null) _PdfZoneEntry(netWidget, netPlacement.vertical, netPlacement.align),
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
          padding: pw.EdgeInsets.symmetric(horizontal: isDenseGrid ? 2.0 : 4.0, vertical: isDenseGrid ? 0.6 : 2.0),
          decoration: bgImage != null
              ? null
              : pw.BoxDecoration(
                  color: isDarkCard ? const PdfColor(0, 0, 0, 0.25) : const PdfColor.fromInt(0xFFF8FAFC),
                  borderRadius: pw.BorderRadius.all(pw.Radius.circular(isDenseGrid ? 1.5 : 3)),
                  border: isDarkCard ? null : pw.Border.all(color: const PdfColor.fromInt(0xFFE2E8F0), width: isDenseGrid ? 0.3 : 0.5),
                ),
          child: _buildZoneRow(topLeft, topCenter, topRight),
        );
      }

      pw.Widget? middleContainer;
      if (midLeft.isNotEmpty || midCenter.isNotEmpty || midRight.isNotEmpty) {
        middleContainer = pw.Padding(
          padding: pw.EdgeInsets.symmetric(vertical: isDenseGrid ? 0.4 : 2.0),
          child: _buildZoneRow(midLeft, midCenter, midRight),
        );
      }

      pw.Widget? bottomContainer;
      if (botLeft.isNotEmpty || botCenter.isNotEmpty || botRight.isNotEmpty) {
        bottomContainer = pw.Container(
          padding: pw.EdgeInsets.only(
            top: isDenseGrid ? 0.4 : 1.5,
            bottom: isDenseGrid ? 0.4 : 2.5,
            left: isDenseGrid ? 1.0 : 2.0,
            right: isDenseGrid ? 1.0 : 2.0,
          ),
          decoration: bgImage != null
              ? null
              : pw.BoxDecoration(
                  border: pw.Border(
                    top: pw.BorderSide(
                      color: isDarkCard ? const PdfColor(1, 1, 1, 0.2) : const PdfColor.fromInt(0xFFE2E8F0),
                      width: 0.35,
                    ),
                  ),
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
            padding: pw.EdgeInsets.symmetric(horizontal: isDenseGrid ? 2.0 : 4, vertical: isDenseGrid ? 0.6 : 2.5),
            decoration: bgImage != null
                ? null
                : pw.BoxDecoration(
                    color: isDarkCard ? const PdfColor(0, 0, 0, 0.2) : const PdfColor.fromInt(0xFFF8FAFC),
                    borderRadius: pw.BorderRadius.all(pw.Radius.circular(isDenseGrid ? 1.5 : 3)),
                    border: isDarkCard ? null : pw.Border.all(color: const PdfColor.fromInt(0xFFE2E8F0), width: isDenseGrid ? 0.3 : 0.5),
                  ),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                if (showNetworkName)
                  pw.Expanded(
                    child: pw.Directionality(
                      textDirection: pw.TextDirection.rtl,
                      child: pw.Text(
                        networkName,
                        maxLines: 1,
                        overflow: pw.TextOverflow.clip,
                        style: pw.TextStyle(
                          fontSize: fontSizeTitle,
                          color: headerTextColor,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                    ),
                  )
                else
                  pw.Spacer(),
                if (showPrice)
                  pw.Container(
                    padding: pw.EdgeInsets.symmetric(horizontal: isDenseGrid ? 2.0 : 4, vertical: isDenseGrid ? 0.5 : 1),
                    decoration: pw.BoxDecoration(
                      color: priceBgColor,
                      borderRadius: pw.BorderRadius.all(pw.Radius.circular(isDenseGrid ? 1.2 : 2)),
                    ),
                    child: pw.Directionality(
                      textDirection: pw.TextDirection.ltr,
                      child: pw.Text(
                        '${card.price.toStringAsFixed(0)} ${card.currency}',
                        style: pw.TextStyle(
                          fontSize: fontSizeTitle - (isDenseGrid ? 0.4 : 1),
                          fontWeight: pw.FontWeight.bold,
                          color: priceTextColor,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Body: Profile info + Credentials Box + QR Code
          pw.Padding(
            padding: pw.EdgeInsets.symmetric(vertical: isDenseGrid ? 0.6 : 2),
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
                      if (showProfileName) ...[
                        pw.Directionality(
                          textDirection: pw.TextDirection.rtl,
                          child: pw.Text(
                            card.profileName,
                            maxLines: 1,
                            style: pw.TextStyle(
                              fontSize: fontSizeTitle - (isDenseGrid ? 0.2 : 0.5),
                              color: bodyTextColor,
                              fontWeight: pw.FontWeight.bold,
                            ),
                          ),
                        ),
                        pw.SizedBox(height: isDenseGrid ? 1 : 2),
                      ],

                      // Code / Username box with LTR direction for numbers & symbols
                      if (showCredentials)
                        pw.Container(
                          padding: pw.EdgeInsets.symmetric(horizontal: isDenseGrid ? 2.5 : 4, vertical: isDenseGrid ? 0.8 : 2),
                          decoration: pw.BoxDecoration(
                            color: isDarkCard ? PdfColors.white : const PdfColor.fromInt(0xFFF8FAFC),
                            borderRadius: pw.BorderRadius.all(pw.Radius.circular(isDenseGrid ? 1.5 : 3)),
                            border: pw.Border.all(
                              color: borderColor,
                              width: isDenseGrid ? 0.35 : 0.6,
                            ),
                          ),
                          child: isSeparateUserPass
                              ? pw.Column(
                                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                                  mainAxisSize: pw.MainAxisSize.min,
                                  children: [
                                    pw.Text(
                                      'U: ${card.username}',
                                      style: pw.TextStyle(
                                        fontSize: fontSizeCode,
                                        fontWeight: pw.FontWeight.bold,
                                        color: usernameColor,
                                      ),
                                    ),
                                    pw.SizedBox(height: 1),
                                    pw.Text(
                                      'P: ${card.clearPassword}',
                                      style: pw.TextStyle(
                                        fontSize: fontSizeCode - 1,
                                        fontWeight: pw.FontWeight.bold,
                                        color: passwordColor,
                                      ),
                                    ),
                                  ],
                                )
                              : pw.Text(
                                  isUnifiedPin
                                      ? 'PIN: ${card.username}'
                                      : 'USER: ${card.username}',
                                  style: pw.TextStyle(
                                    fontSize: fontSizeCode,
                                    fontWeight: pw.FontWeight.bold,
                                    letterSpacing: isUnifiedPin ? 1.2 : 0.8,
                                    color: isUnifiedPin ? pinColor : usernameColor,
                                  ),
                                ),
                        ),
                    ],
                  ),
                ),

                // Right: High resolution QR Code for smartphone instant login
                if (showQr && qrSize > 0) ...[
                  pw.SizedBox(width: isDenseGrid ? 1.5 : 3),
                  pw.Container(
                    width: isDenseGrid ? qrSize.clamp(14.0, 18.0) : qrSize,
                    height: isDenseGrid ? qrSize.clamp(14.0, 18.0) : qrSize,
                    padding: pw.EdgeInsets.all(isDenseGrid ? 0.8 : 1.5),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: borderColor, width: isDenseGrid ? 0.3 : 0.5),
                      borderRadius: pw.BorderRadius.all(pw.Radius.circular(isDenseGrid ? 1.2 : 2)),
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
          if (showSerial || (showInstructions && instructions != null && instructions.isNotEmpty))
            pw.Container(
              padding: pw.EdgeInsets.only(
                top: isDenseGrid ? 0.4 : 1.5,
                bottom: isDenseGrid ? 0.4 : 2.5,
                left: isDenseGrid ? 1.0 : 2.0,
                right: isDenseGrid ? 1.0 : 2.0,
              ),
              decoration: bgImage != null
                  ? null
                  : pw.BoxDecoration(
                      border: pw.Border(top: pw.BorderSide(color: isDarkCard ? const PdfColor(1, 1, 1, 0.2) : const PdfColor.fromInt(0xFFE2E8F0), width: isDenseGrid ? 0.25 : 0.4)),
                    ),
              child: pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  if (showInstructions)
                    pw.Directionality(
                      textDirection: pw.TextDirection.rtl,
                      child: pw.Text(
                        (instructions != null && instructions.isNotEmpty)
                            ? instructions
                            : 'امسح الرمز أو ادخل الكود',
                        style: pw.TextStyle(
                          fontSize: isDenseGrid ? 3.4 : 4.8,
                          color: isDarkCard ? bodyTextColor : const PdfColor.fromInt(0xFF64748B),
                        ),
                      ),
                    )
                  else
                    pw.SizedBox(),
                  if (showSerial)
                    pw.Directionality(
                      textDirection: pw.TextDirection.ltr,
                      child: pw.Text(
                        'SN: ${card.serialNumber.isNotEmpty ? card.serialNumber : '#$index'}',
                        style: pw.TextStyle(
                          fontSize: isDenseGrid ? 3.4 : 4.6,
                          color: isDarkCard ? bodyTextColor : const PdfColor.fromInt(0xFF94A3B8),
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      );
    }

    final cardWidget = pw.Container(
      width: double.infinity,
      height: double.infinity,
      margin: pw.EdgeInsets.all(cardMargin),
      decoration: pw.BoxDecoration(
        color: cardBgColor,
        borderRadius: pw.BorderRadius.all(pw.Radius.circular(isDenseGrid ? 1.5 : 4)),
        border: showOuterBorder
            ? pw.Border.all(
                color: borderColor,
                width: isDenseGrid ? 0.35 : (designStyle == 'MINIMALIST' ? 0.4 : (designStyle == 'LUXURY_ROYAL' ? 0.8 : 0.5)),
              )
            : null,
      ),
      child: pw.ClipRRect(
        horizontalRadius: isDenseGrid ? 1.5 : 4,
        verticalRadius: isDenseGrid ? 1.5 : 4,
        child: pw.Stack(
          children: [
            if (bgImage != null)
              pw.Positioned.fill(
                child: pw.Image(
                  bgImage,
                  fit: pw.BoxFit.cover,
                  alignment: pw.Alignment.center,
                ),
              ),
            if (patternOverlayImage != null)
              pw.Positioned.fill(
                child: pw.Image(
                  patternOverlayImage,
                  fit: pw.BoxFit.cover,
                ),
              ),
            if (designStyle == 'LUXURY_ROYAL')
              pw.Positioned.fill(
                child: pw.Container(
                  margin: pw.EdgeInsets.all(isDenseGrid ? 0.8 : 1.5),
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(
                      color: borderColor,
                      width: isDenseGrid ? 0.3 : 0.5,
                    ),
                  ),
                ),
              ),
            if (designStyle == 'FOOTBALL')
              pw.Positioned(
                top: 0,
                right: 0,
                child: pw.Container(
                  padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 1.2),
                  decoration: const pw.BoxDecoration(
                    color: PdfColor.fromInt(0xFFF59E0B),
                    borderRadius: pw.BorderRadius.only(
                      bottomLeft: pw.Radius.circular(3),
                    ),
                  ),
                  child: pw.Text(
                    'MATCH PASS',
                    style: pw.TextStyle(
                      color: const PdfColor.fromInt(0xFF065F46),
                      fontWeight: pw.FontWeight.bold,
                      fontSize: 4.5,
                    ),
                  ),
                ),
              ),
            if (designStyle == 'CORPORATE_ISP')
              pw.Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: pw.Container(
                  height: 1.5,
                  color: const PdfColor.fromInt(0xFF2563EB),
                ),
              ),
            if (designStyle == 'TECH_CIRCUIT')
              pw.Positioned(
                bottom: 2,
                left: 3,
                child: pw.Text(
                  '// SYS_ONLINE',
                  style: const pw.TextStyle(
                    color: PdfColor.fromInt(0xFF00FFCC),
                    fontSize: 4.5,
                  ),
                ),
              ),
            if (designStyle == 'GEOMETRIC')
              pw.Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: pw.Container(
                  height: isDenseGrid ? 1.5 : 2.5,
                  color: const PdfColor.fromInt(0xFFF59E0B),
                ),
              ),
            pw.Container(
              padding: pw.EdgeInsets.all(isDenseGrid ? 1.0 : 3.5),
              child: cardContent,
            ),
          ],
        ),
      ),
    );

    return cardWidget;
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
    bool showOuterBorder = true,
    bool showNetworkName = true,
    bool showProfileName = true,
    bool showCredentials = true,
    bool showInstructions = true,
    int? cardWidthMm,
    int? cardHeightMm,
    String? instructions,
    CardTemplateModel? template,
    bool isLandscape = false,
    int? customCols,
    int? customRows,
    double? customMargin,
    double? customSpacing,
    CardColorCustomization? customColors,
    CardElementsLayout? elementsLayout,
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
      showOuterBorder: showOuterBorder,
      showNetworkName: showNetworkName,
      showProfileName: showProfileName,
      showCredentials: showCredentials,
      showInstructions: showInstructions,
      cardWidthMm: cardWidthMm,
      cardHeightMm: cardHeightMm,
      instructions: instructions,
      template: template,
      isLandscape: isLandscape,
      customCols: customCols,
      customRows: customRows,
      customMargin: customMargin,
      customSpacing: customSpacing,
      customColors: customColors,
      elementsLayout: elementsLayout,
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
    bool showOuterBorder = true,
    bool showNetworkName = true,
    bool showProfileName = true,
    bool showCredentials = true,
    bool showInstructions = true,
    int? cardWidthMm,
    int? cardHeightMm,
    String? instructions,
    CardTemplateModel? template,
    bool isLandscape = false,
    int? customCols,
    int? customRows,
    double? customMargin,
    double? customSpacing,
    CardColorCustomization? customColors,
    CardElementsLayout? elementsLayout,
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
          showOuterBorder: showOuterBorder,
          showNetworkName: showNetworkName,
          showProfileName: showProfileName,
          showCredentials: showCredentials,
          showInstructions: showInstructions,
          cardWidthMm: cardWidthMm,
          cardHeightMm: cardHeightMm,
          instructions: instructions,
          template: template,
          isLandscape: isLandscape,
          customCols: customCols,
          customRows: customRows,
          customMargin: customMargin,
          customSpacing: customSpacing,
          customColors: customColors,
          elementsLayout: elementsLayout,
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
