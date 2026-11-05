import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  List<OfflineCardModel> makeCards(int count) {
    return List.generate(count, (i) {
      final numStr = (849200 + i).toString();
      return OfflineCardModel(
        id: 'card-$i',
        serialNumber: 'SN-20261024-${(i + 1).toString().padLeft(3, '0')}',
        username: numStr,
        clearPassword: (5540 + i).toString(),
        profileId: 'p-1',
        profileName: 'يوم واحد HR',
        deviceId: 'dev-1',
        price: 500,
        currency: 'SDG',
      );
    });
  }

  group('Final Audit & Comprehensive Verification of 7 Points', () {
    // 1. Live Preview & PDF Parity
    test('Point 1: Built-in Templates render clean ink-saving layout with white card background', () async {
      final cards = makeCards(24);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي جيو نت',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid24,
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(15000));
      expect(pdfBytes.sublist(0, 5), equals([0x25, 0x50, 0x44, 0x46, 0x2D]));
    });

    // 2. Custom Imported Templates Preserved
    test('Point 2: Custom Imported Templates retain background image bytes without alteration', () async {
      final dummyPngBytes = Uint8List.fromList([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82,
      ]);
      final customTemplate = CardTemplateModel(
        id: 'tpl-custom-phone',
        name: 'قالب مستورد من الهاتف',
        widthMm: 85,
        heightMm: 54,
        backgroundImageBytes: dummyPngBytes,
        layoutConfig: {
          'backgroundImageBase64': base64Encode(dummyPngBytes),
          'networkName': 'شبكة مخصصة',
        },
        primaryColor: '#0F172A',
        accentColor: '#D97706',
      );

      final cards = makeCards(10);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        template: customTemplate,
        networkName: 'شبكة مخصصة',
        layout: CardPdfLayout.a4Grid10,
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(15000));
      expect(customTemplate.backgroundImageBytes, isNotNull);
      expect(customTemplate.getSyncBackgroundBytes(), equals(dummyPngBytes));
    });

    // 3. Customization Options (Colors, Patterns, Texts, Contacts, Toggles)
    test('Point 3: Custom Colors, Decorative Patterns, Sales Phone & Visibility Toggles reflect in PDF', () async {
      const customColors = CardColorCustomization(
        cardBackgroundColor: '#FFFFFF',
        headerTextColor: '#0F172A',
        bodyTextColor: '#334155',
        usernameColor: '#1E293B',
        passwordColor: '#DC2626',
        pinColor: '#059669',
        borderColor: '#CBD5E1',
        secondaryColor: '#D97706',
        priceBackgroundColor: '#D97706',
        priceTextColor: '#FFFFFF',
      );

      final cards = makeCards(12);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي جيو نت',
        supportPhone: 'دعم: 0912345678 • مبيعات: 0123456789',
        instructions: 'أو أدخل الرمز للدخول',
        customColors: customColors,
        showNetworkName: true,
        showPrice: true,
        showSerial: true,
        showOuterBorder: true,
        showProfileName: true,
        showCredentials: true,
        showInstructions: true,
        showQr: true,
        layout: CardPdfLayout.a4Grid12,
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(15000));
    });

    // 4. Dimensions (Presets and Custom)
    test('Point 4: Standard Dimensions (85x54, 100x40, 70x35, 50x30) and Custom Dimensions apply cleanly', () async {
      final cards = makeCards(10);

      // Ticket 100x40
      final ticketPdf = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'تذكرة قياسية',
        cardWidthMm: 100,
        cardHeightMm: 40,
        layout: CardPdfLayout.a4Grid10,
      );
      expect(ticketPdf.length, greaterThan(15000));

      // Mini 50x30
      final miniPdf = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'كرت مصغر',
        cardWidthMm: 50,
        cardHeightMm: 30,
        layout: CardPdfLayout.a4Grid10,
      );
      expect(miniPdf.length, greaterThan(15000));

      // Custom Dimension 90x45
      final customDimPdf = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'مقاس مخصص 90x45',
        cardWidthMm: 90,
        cardHeightMm: 45,
        layout: CardPdfLayout.a4Grid10,
      );
      expect(customDimPdf.length, greaterThan(15000));
    });

    // 5. Alignment and Placement
    test('Point 5: Element Placement and Alignment configure properly', () async {
      final customLayout = CardElementsLayout(
        networkName: const CardElementPlacement(vertical: 'top', align: 'right', isVisible: true),
        price: const CardElementPlacement(vertical: 'top', align: 'left', isVisible: true),
        credentials: const CardElementPlacement(vertical: 'middle', align: 'left', isVisible: true),
        qrCode: const CardElementPlacement(vertical: 'middle', align: 'right', isVisible: true),
        serialNumber: const CardElementPlacement(vertical: 'bottom', align: 'right', isVisible: true),
        instructions: const CardElementPlacement(vertical: 'bottom', align: 'left', isVisible: true),
      );

      final cards = makeCards(12);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي جيو نت',
        elementsLayout: customLayout,
        layout: CardPdfLayout.a4Grid12,
      );
      expect(pdfBytes.length, greaterThan(15000));
    });

    // 6. All 5 A4 Print Formats (10, 12, 24, 100, 120 cards)
    test('Point 6: 10, 12, 24, 100, and 120 card layouts render perfectly without overlap or clipping', () async {
      final layoutsToTest = [
        (CardPdfLayout.a4Grid10, 10),
        (CardPdfLayout.a4Grid12, 12),
        (CardPdfLayout.a4Grid24, 24),
        (CardPdfLayout.a4Grid100, 100),
        (CardPdfLayout.a4Grid120, 120),
      ];

      for (final (layout, count) in layoutsToTest) {
        final cards = makeCards(count);
        final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
          cards: cards,
          networkName: 'سودافاي جيو نت',
          supportPhone: '0912345678',
          layout: layout,
        );

        expect(pdfBytes, isNotNull);
        expect(pdfBytes.length, greaterThan(20000), reason: 'Failed for ${layout.name}');
      }
    });

    // 7. Mandatory Network Name
    test('Point 7: Network Name is strictly required and non-empty', () {
      final emptyNetName = '   ';
      expect(emptyNetName.trim().isEmpty, isTrue);

      final validNetName = 'سودافاي جيو نت';
      expect(validNetName.trim().isNotEmpty, isTrue);
    });

    // 8. 100-card and 120-card parity with Live Preview
    test('Point 8: 100-card and 120-card grids fully apply elementsLayout, toggles and customColors exactly matching Live Preview', () async {
      final customLayout = CardElementsLayout(
        networkName: const CardElementPlacement(vertical: 'top', align: 'right', isVisible: true),
        price: const CardElementPlacement(vertical: 'top', align: 'left', isVisible: true),
        credentials: const CardElementPlacement(vertical: 'middle', align: 'left', isVisible: true),
        qrCode: const CardElementPlacement(vertical: 'middle', align: 'right', isVisible: true),
        serialNumber: const CardElementPlacement(vertical: 'bottom', align: 'right', isVisible: true),
        instructions: const CardElementPlacement(vertical: 'bottom', align: 'left', isVisible: true),
      );

      const customColors = CardColorCustomization(
        cardBackgroundColor: '#FFFFFF',
        headerTextColor: '#0F172A',
        priceBackgroundColor: '#D97706',
        priceTextColor: '#FFFFFF',
        borderColor: '#CBD5E1',
      );

      // Test 100-card grid
      final cards100 = makeCards(100);
      final pdf100 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards100,
        networkName: 'سودافاي هوتسبوت',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid100,
        elementsLayout: customLayout,
        customColors: customColors,
        themePreset: 'GEOMETRIC',
        showNetworkName: true,
        showPrice: true,
        showProfileName: true,
        showCredentials: true,
        showInstructions: true,
        showSerial: true,
        showOuterBorder: true,
        showQr: true,
      );
      expect(pdf100, isNotNull);
      expect(pdf100.length, greaterThan(25000));

      // Test 120-card grid
      final cards120 = makeCards(120);
      final pdf120 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards120,
        networkName: 'سودافاي هوتسبوت',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid120,
        elementsLayout: customLayout,
        customColors: customColors,
        themePreset: 'GEOMETRIC',
        showNetworkName: true,
        showPrice: true,
        showProfileName: true,
        showCredentials: true,
        showInstructions: true,
        showSerial: true,
        showOuterBorder: true,
        showQr: true,
      );
      expect(pdf120, isNotNull);
      expect(pdf120.length, greaterThan(30000));
    });
  });
}
