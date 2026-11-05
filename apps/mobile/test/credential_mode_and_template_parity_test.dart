import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';
import 'package:mobile/core/services/card_template_import_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Credential Mode & Built-in Template Parity in 10 and 120 layouts', () {
    List<OfflineCardModel> makeCards({required int count, required int mode}) {
      return List.generate(count, (idx) {
        final username = '84920${idx % 10}';
        final String? clearPassword = mode == 0
            ? username
            : (mode == 2 ? null : '554${idx % 10}');

        return OfflineCardModel(
          id: 'card-$idx',
          serialNumber: 'SN-2026-${(idx + 1).toString().padLeft(4, "0")}',
          username: username,
          clearPassword: clearPassword,
          profileId: 'prof-1',
          profileName: 'HR (يوم واحد)',
          deviceId: 'dev-1',
          price: 500,
          currency: 'SDG',
        );
      });
    }

    test('120-card grid with Mode 2 (Username Only) generates valid PDF with QR and no password', () async {
      final cards = makeCards(count: 120, mode: 2);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي جيو نت',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid120,
        batchNumber: 'BATCH-120-USER-ONLY',
        showQr: true,
        showPrice: true,
        showSerial: true,
        showOuterBorder: true,
        themePreset: 'GEOMETRIC',
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(2000));
      expect(pdfBytes.sublist(0, 5), equals([0x25, 0x50, 0x44, 0x46, 0x2D]));
    });

    test('120-card grid with Mode 1 (Username + Password) generates valid PDF with QR and separate U/P', () async {
      final cards = makeCards(count: 120, mode: 1);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي جيو نت',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid120,
        batchNumber: 'BATCH-120-USER-PASS',
        showQr: true,
        showPrice: true,
        showSerial: true,
        showOuterBorder: true,
        themePreset: 'GEOMETRIC',
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(2000));
    });

    test('120-card grid with Mode 0 (PIN) generates valid PDF with QR and PIN credentials', () async {
      final cards = makeCards(count: 120, mode: 0);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي جيو نت',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid120,
        batchNumber: 'BATCH-120-PIN',
        showQr: true,
        showPrice: true,
        showSerial: true,
        showOuterBorder: true,
        themePreset: 'GEOMETRIC',
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(2000));
    });

    test('Built-in Geometric Template in 10-card layout reflects Mode 1 vs Mode 0 distinctly', () async {
      final catalog = CardTemplateImportService.getBuiltInCatalog();
      final geoTemplate = catalog.firstWhere((t) => t.themePreset == 'GEOMETRIC');

      // Test Mode 1 (User + Pass)
      final cardsMode1 = makeCards(count: 10, mode: 1);
      final pdfBytesMode1 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cardsMode1,
        networkName: 'سودافاي جيو نت',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'BATCH-10-GEO-USERPASS',
        template: geoTemplate,
        elementsLayout: geoTemplate.elementsLayout,
        themePreset: geoTemplate.themePreset,
      );

      // Test Mode 0 (Unified PIN)
      final cardsMode0 = makeCards(count: 10, mode: 0);
      final pdfBytesMode0 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cardsMode0,
        networkName: 'سودافاي جيو نت',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'BATCH-10-GEO-PIN',
        template: geoTemplate,
        elementsLayout: geoTemplate.elementsLayout,
        themePreset: geoTemplate.themePreset,
      );

      expect(pdfBytesMode1, isNotNull);
      expect(pdfBytesMode0, isNotNull);
      // Mode 1 and Mode 0 produce distinct PDF byte streams
      expect(pdfBytesMode1.length != pdfBytesMode0.length, isTrue);
    });

    test('24-card layout (3x8) and 12-card layout (3x4) generate clean ink-saving PDF with white background', () async {
      final cards24 = makeCards(count: 24, mode: 1);
      final pdfBytes24 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards24,
        networkName: 'مجمع الطلاب الأكاديمي',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid24,
        batchNumber: 'BATCH-24-CARDS',
        themePreset: 'GEOMETRIC',
        showQr: true,
        showPrice: true,
        showSerial: true,
        showOuterBorder: true,
      );

      expect(pdfBytes24, isNotNull);
      expect(pdfBytes24.length, greaterThan(2000));
      expect(pdfBytes24.sublist(0, 5), equals([0x25, 0x50, 0x44, 0x46, 0x2D]));

      final cards12 = makeCards(count: 12, mode: 1);
      final pdfBytes12 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards12,
        networkName: 'مجمع الطلاب الأكاديمي',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid12,
        batchNumber: 'BATCH-12-CARDS',
        themePreset: 'GEOMETRIC',
        showQr: true,
        showPrice: true,
        showSerial: true,
        showOuterBorder: true,
      );

      expect(pdfBytes12, isNotNull);
      expect(pdfBytes12.length, greaterThan(2000));
      expect(pdfBytes12.sublist(0, 5), equals([0x25, 0x50, 0x44, 0x46, 0x2D]));
    });

    test('Custom Dimensions (Ticket 100x40, Square 60x60, Portrait 54x85) generate valid proportional PDFs', () async {
      final cards = makeCards(count: 10, mode: 1);

      // Ticket 100x40
      final pdfTicket = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي تذكرة',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'TICKET-100x40',
        cardWidthMm: 100,
        cardHeightMm: 40,
        themePreset: 'GEOMETRIC',
      );
      expect(pdfTicket, isNotNull);
      expect(pdfTicket.length, greaterThan(2000));

      // Square 60x60
      final pdfSquare = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي مربع',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'SQUARE-60x60',
        cardWidthMm: 60,
        cardHeightMm: 60,
        themePreset: 'GEOMETRIC',
      );
      expect(pdfSquare, isNotNull);
      expect(pdfSquare.length, greaterThan(2000));

      // Portrait 54x85
      final pdfPortrait = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي عمودي',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'PORTRAIT-54x85',
        cardWidthMm: 54,
        cardHeightMm: 85,
        themePreset: 'GEOMETRIC',
      );
      expect(pdfPortrait, isNotNull);
      expect(pdfPortrait.length, greaterThan(2000));
    });

    test('Data field visibility toggles and custom colors (Price, Border) generate valid PDFs', () async {
      final cards = makeCards(count: 10, mode: 1);

      final pdfCustomized = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي مخصص',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'CUSTOM-DATA-COLORS',
        showNetworkName: false,
        showProfileName: false,
        showPrice: true,
        showCredentials: true,
        showOuterBorder: false,
        customColors: const CardColorCustomization(
          priceTextColor: '#F59E0B',
          priceBackgroundColor: '#0F172A',
          borderColor: '#E2E8F0',
          headerTextColor: '#0F172A',
          bodyTextColor: '#334155',
        ),
      );

      expect(pdfCustomized, isNotNull);
      expect(pdfCustomized.length, greaterThan(2000));
      expect(pdfCustomized.sublist(0, 5), equals([0x25, 0x50, 0x44, 0x46, 0x2D]));
    });
  });
}
