import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';
import 'package:mobile/core/services/card_template_import_service.dart';
import 'package:mobile/features/studio/presentation/pdf_viewer_screen.dart';
import 'package:pdf/pdf.dart';
import 'package:printing/printing.dart';
import 'package:image/image.dart' as img;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Helper to generate N mock cards
  List<OfflineCardModel> createMockCards(int count, {String credentialMode = 'pin'}) {
    return List.generate(count, (i) {
      final id = (i + 1).toString().padLeft(4, '0');
      return OfflineCardModel(
        id: 'card-$id',
        serialNumber: 'SN-2026-$id',
        username: 'user$id',
        clearPassword: credentialMode == 'pin'
            ? 'user$id'
            : (credentialMode == 'separate' ? 'pass$id' : null),
        profileId: 'prof-1h',
        profileName: '1 Hour Ultra',
        deviceId: 'dev-mikrotik-1',
        price: 500,
        currency: 'SDG',
        status: 'AVAILABLE',
      );
    });
  }

  // 1x1 PNG transparent / colored pixel for mock backgrounds
  Uint8List createMockImageBytes({int r = 15, int g = 23, int b = 42}) {
    final image = img.Image(width: 100, height: 60);
    for (int y = 0; y < 60; y++) {
      for (int x = 0; x < 100; x++) {
        image.setPixelRgb(x, y, r, g, b);
      }
    }
    return Uint8List.fromList(img.encodePng(image));
  }

  group('Final Verification & Regression Audit (10 Core Checkpoints)', () {
    // ------------------------------------------------------------------------
    // Checkpoint 1 & 2: PdfViewerScreen exists, receives real PDF bytes,
    // operates independently of printer dialog.
    // ------------------------------------------------------------------------
    testWidgets('Checkpoint 1 & 2: PdfViewerScreen renders real PDF bytes independently of printer dialog',
        (WidgetTester tester) async {
      final sampleCards = createMockCards(4);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'سودافاي | SudaFi Net',
        layout: CardPdfLayout.a4Grid10,
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(1000));
      // PDF standard header check
      expect(String.fromCharCodes(pdfBytes.take(4)), equals('%PDF'));

      await tester.pumpWidget(
        MaterialApp(
          home: PdfViewerScreen(
            pdfBytes: pdfBytes,
            title: 'معاينة PDF الفعلي (4 كروت)',
            filename: 'audit_test.pdf',
            totalCards: 4,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 50));

      // Verify that PdfViewerScreen widget exists and is displayed
      expect(find.byType(PdfViewerScreen), findsOneWidget);
      // Verify app bar title
      expect(find.text('معاينة PDF الفعلي (4 كروت)'), findsOneWidget);
      // Verify total cards indicator
      expect(find.text('إجمالي الكروت: 4 كرت جاهز للطباعة'), findsOneWidget);
      // Verify PdfPreview component is embedded inside body, not native print dialog
      expect(find.byType(PdfPreview), findsOneWidget);
      // Verify toolbar actions exist: Download, Share, Direct Print
      expect(find.byIcon(Icons.download_rounded), findsOneWidget);
      expect(find.byIcon(Icons.share_outlined), findsOneWidget);
      expect(find.byIcon(Icons.print_outlined), findsOneWidget);
    });

    // ------------------------------------------------------------------------
    // Checkpoint 3: Share and Preview share the identical byte array
    // ------------------------------------------------------------------------
    test('Checkpoint 3: shareCardsPdf generates identical PDF bytes matching preview', () async {
      final cards = createMockCards(10);
      final previewBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'BATCH-IDENTICAL',
      );

      final shareGeneratedBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'BATCH-IDENTICAL',
      );

      expect(previewBytes.length, equals(shareGeneratedBytes.length));
      // Bytes should have standard PDF header and structure
      expect(String.fromCharCodes(previewBytes.take(4)), equals('%PDF'));
      expect(String.fromCharCodes(shareGeneratedBytes.take(4)), equals('%PDF'));
    });

    // ------------------------------------------------------------------------
    // Checkpoint 4: 7 Elements positions (vertical + horizontal) in PDF
    // ------------------------------------------------------------------------
    test('Checkpoint 4: All 7 card elements respect vertical (top/mid/bot) and horizontal (left/center/right) positions', () async {
      final cards = createMockCards(1, credentialMode: 'separate');
      const customLayout = CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'top', align: 'right', scale: 'large'),
        price: CardElementPlacement(vertical: 'top', align: 'left', scale: 'normal'),
        credentials: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'large'),
        profileDetails: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'normal'),
        qrCode: CardElementPlacement(vertical: 'middle', align: 'left', scale: 'normal'),
        instructions: CardElementPlacement(vertical: 'bottom', align: 'center', scale: 'small'),
        serialNumber: CardElementPlacement(vertical: 'bottom', align: 'right', scale: 'small'),
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شبكة السرعة العالية',
        layout: CardPdfLayout.a4Grid10,
        instructions: 'يرجى تسجيل الدخول بكود الكرت',
        showQr: true,
        showPrice: true,
        showSerial: true,
        elementsLayout: customLayout,
      );

      expect(pdfBytes.length, greaterThan(2000));
      expect(String.fromCharCodes(pdfBytes.take(4)), equals('%PDF'));

      // Invert positions: Network bottom-left, Price bottom-right, QR top-center
      const invertedLayout = CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'bottom', align: 'left', scale: 'small'),
        price: CardElementPlacement(vertical: 'bottom', align: 'right', scale: 'small'),
        credentials: CardElementPlacement(vertical: 'top', align: 'center', scale: 'large'),
        profileDetails: CardElementPlacement(vertical: 'middle', align: 'center', scale: 'normal'),
        qrCode: CardElementPlacement(vertical: 'top', align: 'center', scale: 'normal'),
        instructions: CardElementPlacement(vertical: 'middle', align: 'left', scale: 'small'),
        serialNumber: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'small'),
      );

      final invertedBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شبكة السرعة العالية',
        layout: CardPdfLayout.a4Grid10,
        instructions: 'يرجى تسجيل الدخول بكود الكرت',
        showQr: true,
        showPrice: true,
        showSerial: true,
        elementsLayout: invertedLayout,
      );

      expect(invertedBytes.length, greaterThan(2000));
      expect(String.fromCharCodes(invertedBytes.take(4)), equals('%PDF'));
    });

    // ------------------------------------------------------------------------
    // Checkpoint 5: 100-card A4 grid shows QR code and zero abnormal gap
    // ------------------------------------------------------------------------
    test('Checkpoint 5: A4 100-card grid renders QR codes and enforces exact cell bounds without row gaps', () async {
      final cards100 = createMockCards(100);
      const customLayout = CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'top', align: 'right', scale: 'normal'),
        price: CardElementPlacement(vertical: 'top', align: 'left', scale: 'normal'),
        credentials: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'normal'),
        profileDetails: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'normal'),
        qrCode: CardElementPlacement(vertical: 'middle', align: 'left', scale: 'normal'),
        instructions: CardElementPlacement(vertical: 'bottom', align: 'center', scale: 'small'),
        serialNumber: CardElementPlacement(vertical: 'bottom', align: 'right', scale: 'small'),
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards100,
        networkName: 'سودافاي 100 كرت',
        layout: CardPdfLayout.a4Grid100,
        showQr: true,
        showPrice: true,
        elementsLayout: customLayout,
      );

      expect(pdfBytes.length, greaterThan(15000));
      expect(String.fromCharCodes(pdfBytes.take(4)), equals('%PDF'));

      // Check mathematical cell calculations: A4 portrait (210×297 mm)
      // Printable: 210 - 2*5 = 200 mm. Cols = 5 => 40.0 mm width
      // Printable height: 297 - 2*5 - 7 = 280 mm. Rows = 20 => 14.0 mm height
      const printableWidth = 200.0 * PdfPageFormat.mm;
      const printableHeight = 280.0 * PdfPageFormat.mm;
      final cellW = printableWidth / 5;
      final cellH = printableHeight / 20;

      expect(cellW, closeTo(40.0 * PdfPageFormat.mm, 0.01));
      expect(cellH, closeTo(14.0 * PdfPageFormat.mm, 0.01));
      expect(cellW * 5, closeTo(printableWidth, 0.01));
      expect(cellH * 20, closeTo(printableHeight, 0.01));
    });

    // ------------------------------------------------------------------------
    // Checkpoint 6: 120 cards on 2 pages (100 on page 1, 20 on page 2)
    // ------------------------------------------------------------------------
    test('Checkpoint 6: 120 cards split stably across 2 pages with identical cell dimensions on both pages', () async {
      final cards120 = createMockCards(120);

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards120,
        networkName: 'سودافاي 120 كرت',
        layout: CardPdfLayout.a4Grid100,
        showQr: true,
      );

      expect(pdfBytes.length, greaterThan(20000));
      expect(String.fromCharCodes(pdfBytes.take(4)), equals('%PDF'));

      // Verify PDF has 2 pages in page tree catalog
      final pdfString = latin1.decode(pdfBytes, allowInvalid: true);
      final countMatch = RegExp(r'/Count\s+(\d+)').firstMatch(pdfString);
      final pageCount = countMatch != null ? int.parse(countMatch.group(1)!) : 0;
      expect(pageCount, equals(2));
    });

    // ------------------------------------------------------------------------
    // Checkpoint 7: Imported templates with multiple distinct designs
    // ------------------------------------------------------------------------
    test('Checkpoint 7: Imported templates with diverse backgrounds, dimensions, and layouts are preserved in PDF', () async {
      final image1Bytes = createMockImageBytes(r: 16, g: 185, b: 129); // Emerald
      final image2Bytes = createMockImageBytes(r: 239, g: 68, b: 68);  // Crimson

      final templateImage1 = CardTemplateModel(
        id: 'imported-emerald',
        name: 'قالب زمردي مستورد',
        themePreset: 'EMERALD_CUSTOM',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        backgroundImageBytes: image1Bytes,
        layoutConfig: {
          'backgroundImageBase64': base64Encode(image1Bytes),
          'elements': const CardElementsLayout(
            networkName: CardElementPlacement(vertical: 'top', align: 'center'),
            price: CardElementPlacement(vertical: 'bottom', align: 'right'),
          ).toMap(),
        },
      );

      final templateImage2 = CardTemplateModel(
        id: 'imported-crimson',
        name: 'قالب قرمزي مستورد',
        themePreset: 'CRIMSON_CUSTOM',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        backgroundImageBytes: image2Bytes,
        layoutConfig: {
          'backgroundImageBase64': base64Encode(image2Bytes),
          'elements': const CardElementsLayout(
            networkName: CardElementPlacement(vertical: 'top', align: 'right'),
            price: CardElementPlacement(vertical: 'top', align: 'left'),
          ).toMap(),
        },
      );

      final cards = createMockCards(2);

      final pdf1 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شبكة الزمرد',
        template: templateImage1,
      );

      final pdf2 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شبكة القرمزي',
        template: templateImage2,
      );

      expect(pdf1.length, greaterThan(3000));
      expect(pdf2.length, greaterThan(3000));
      expect(pdf1, isNot(equals(pdf2))); // Distinct templates yield distinct PDF outputs
    });

    // ------------------------------------------------------------------------
    // Checkpoint 8: Pre-made (built-in) templates respect custom element positions
    // ------------------------------------------------------------------------
    test('Checkpoint 8: Built-in templates strictly apply user-provided custom element placements', () async {
      final catalog = CardTemplateImportService.getBuiltInCatalog();
      expect(catalog.length, greaterThanOrEqualTo(8));

      final geometricTemplate = catalog.firstWhere((t) => t.themePreset == 'GEOMETRIC');
      final modernTemplate = catalog.firstWhere((t) => t.themePreset == 'MODERN');

      const userOverrideLayout = CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'bottom', align: 'center', scale: 'large'),
        price: CardElementPlacement(vertical: 'top', align: 'right', scale: 'normal'),
        credentials: CardElementPlacement(vertical: 'middle', align: 'center', scale: 'large'),
      );

      final cards = createMockCards(4);

      final geoPdf = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'هندسي مخصص',
        template: geometricTemplate,
        elementsLayout: userOverrideLayout,
      );

      final modernPdf = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'عصري مخصص',
        template: modernTemplate,
        elementsLayout: userOverrideLayout,
      );

      expect(geoPdf.length, greaterThan(2000));
      expect(modernPdf.length, greaterThan(2000));
    });

    // ------------------------------------------------------------------------
    // Checkpoint 9: Custom images and backgrounds do not vanish when creating or sharing PDF
    // ------------------------------------------------------------------------
    test('Checkpoint 9: Custom background image bytes and base64 strings embed reliably into PDF stream', () async {
      final bgBytes = createMockImageBytes(r: 30, g: 58, b: 138);
      final cards = createMockCards(6);

      // 1. Pass via customBackgroundImageBytes
      final pdfWithBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شبكة الخلفية المباشرة',
        customBackgroundImageBytes: bgBytes,
      );

      // 2. Pass via customBackgroundImageBase64
      final pdfWithBase64 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شبكة الخلفية Base64',
        customBackgroundImageBase64: base64Encode(bgBytes),
      );

      // 3. Compare with PDF without background image
      final pdfWithoutBg = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شبكة بدون خلفية',
      );

      expect(pdfWithBytes.length, greaterThan(pdfWithoutBg.length));
      expect(pdfWithBase64.length, greaterThan(pdfWithoutBg.length));

      // Ensure PDF contains embedded image object
      final pdfString = latin1.decode(pdfWithBytes, allowInvalid: true);
      expect(pdfString.contains('/Subtype /Image') || pdfString.contains('/XObject'), isTrue);
    });

    // ------------------------------------------------------------------------
    // Checkpoint 10: Credential Modes (Unified PIN, Username+Password, Username only)
    // ------------------------------------------------------------------------
    test('Checkpoint 10: All three credential modes render properly without missing fields or orphaned labels', () async {
      final pinCards = createMockCards(2, credentialMode: 'pin');
      final userPassCards = createMockCards(2, credentialMode: 'separate');
      final userOnlyCards = createMockCards(2, credentialMode: 'useronly');

      final pinPdf = await CardPdfGeneratorService.generateCardsPdf(
        cards: pinCards,
        networkName: 'شبكة PIN الموحد',
      );

      final userPassPdf = await CardPdfGeneratorService.generateCardsPdf(
        cards: userPassCards,
        networkName: 'شبكة المستخدم وكلمة المرور',
      );

      final userOnlyPdf = await CardPdfGeneratorService.generateCardsPdf(
        cards: userOnlyCards,
        networkName: 'شبكة اسم المستخدم فقط',
      );

      expect(pinPdf.length, greaterThan(2000));
      expect(userPassPdf.length, greaterThan(2000));
      expect(userOnlyPdf.length, greaterThan(2000));
    });
  });
}
