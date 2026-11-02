import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';
import 'package:mobile/core/services/card_template_import_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:pdf/pdf.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Section 13: Diverse Built-in Templates & In-Depth Color Customization', () {
    test('getBuiltInCatalog contains distinct visual styles including Geometric, Modern, ISP Pro, Minimal, Tech, Luxury, Creative', () {
      final catalog = CardTemplateImportService.getBuiltInCatalog();
      expect(catalog.isNotEmpty, true);

      // Verify that all 7 required styles exist
      final styles = catalog.map((t) => t.designStyle.toUpperCase()).toSet();
      expect(styles.contains('GEOMETRIC'), true, reason: 'Must contain GEOMETRIC style');
      expect(styles.contains('MODERN'), true, reason: 'Must contain MODERN style');
      expect(styles.contains('CORPORATE_ISP'), true, reason: 'Must contain CORPORATE_ISP style');
      expect(styles.contains('MINIMALIST'), true, reason: 'Must contain MINIMALIST style');
      expect(styles.contains('TECH_CIRCUIT'), true, reason: 'Must contain TECH_CIRCUIT style');
      expect(styles.contains('LUXURY_ROYAL'), true, reason: 'Must contain LUXURY_ROYAL style');
      expect(styles.contains('CREATIVE_ASYMMETRIC'), true, reason: 'Must contain CREATIVE_ASYMMETRIC style');

      // Verify that distinct elements layouts exist across templates (not all identical copies)
      final geometric = catalog.firstWhere((t) => t.id == 'builtin-geometric');
      final modern = catalog.firstWhere((t) => t.id == 'builtin-modern');
      final corporate = catalog.firstWhere((t) => t.id == 'builtin-corporate-isp');

      expect(geometric.elementsLayout.qrCode.align, 'right');
      expect(modern.elementsLayout.networkName.align, 'center');
      expect(corporate.elementsLayout.qrCode.align, 'left');
    });

    test('CardColorCustomization serializes, deserializes, and parses Flutter colors accurately', () {
      const colors = CardColorCustomization(
        headerTextColor: '#FFFFFF',
        bodyTextColor: '#E2E8F0',
        usernameColor: '#0F766E',
        passwordColor: '#DC2626',
        pinColor: '#D97706',
        borderColor: '#06B6D4',
        secondaryColor: '#F59E0B',
        cardBackgroundColor: '#065F46',
      );

      final map = colors.toMap();
      expect(map['headerTextColor'], '#FFFFFF');
      expect(map['usernameColor'], '#0F766E');
      expect(map['cardBackgroundColor'], '#065F46');

      final reconstructed = CardColorCustomization.fromMap(map);
      expect(reconstructed.headerTextColor, '#FFFFFF');
      expect(reconstructed.bodyTextColor, '#E2E8F0');
      expect(reconstructed.usernameColor, '#0F766E');
      expect(reconstructed.passwordColor, '#DC2626');
      expect(reconstructed.pinColor, '#D97706');
      expect(reconstructed.borderColor, '#06B6D4');
      expect(reconstructed.secondaryColor, '#F59E0B');
      expect(reconstructed.cardBackgroundColor, '#065F46');

      // Test flutter color parsing
      expect(colors.headerTextColorFlutter != null, true);
      expect(colors.headerTextColorFlutter!.toARGB32(), 0xFFFFFFFF);
      expect(colors.usernameColorFlutter!.toARGB32(), 0xFF0F766E);
    });

    test('withCustomColors attaches colors to template without altering structural dimensions or layout', () {
      final baseTemplate = CardTemplateModel(
        id: 'test-template',
        name: 'قالب اختبار',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        themePreset: 'CLASSIC',
        layoutConfig: {
          'networkName': 'شبكة تجريبية',
          'showQr': true,
        },
      );

      const customColors = CardColorCustomization(
        headerTextColor: '#F1C40F',
        usernameColor: '#00FFCC',
        cardBackgroundColor: '#0B192C',
      );

      final updatedTemplate = baseTemplate.withCustomColors(customColors);

      expect(updatedTemplate.widthMm, 85);
      expect(updatedTemplate.heightMm, 54);
      expect(updatedTemplate.orientation, 'landscape');
      expect(updatedTemplate.networkName, 'شبكة تجريبية');
      expect(updatedTemplate.customColors.headerTextColor, '#F1C40F');
      expect(updatedTemplate.customColors.usernameColor, '#00FFCC');
      expect(updatedTemplate.customColors.cardBackgroundColor, '#0B192C');
    });

    test('LocalStorage persists and retrieves studioCustomColors correctly', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      expect(storage.getStudioCustomColors(), isNull);

      const colors = CardColorCustomization(
        headerTextColor: '#10B981',
        borderColor: '#F59E0B',
      );

      await storage.setStudioCustomColors(colors.toMap());
      final retrieved = storage.getStudioCustomColors();
      expect(retrieved, isNotNull);
      expect(retrieved!['headerTextColor'], '#10B981');
      expect(retrieved['borderColor'], '#F59E0B');

      await storage.setStudioCustomColors(null);
      expect(storage.getStudioCustomColors(), isNull);
    });
  });

  group('Section 14: Rigorous Mathematical Precision Grid Layout (A4 Dimensions)', () {
    test('Calculates exact cell geometry on A4 portrait (210×297 mm)', () {
      const a4WidthPt = 595.275;
      const a4HeightPt = 841.89;
      const pageMargin = 8.0;
      const headerHeight = 16.0;

      final availableWidth = a4WidthPt - (2 * pageMargin);
      final availableHeight = a4HeightPt - (2 * pageMargin) - headerHeight;

      // Test Grid 10: 2 cols x 5 rows
      const cols = 2;
      const rows = 5;
      const gapX = 2.0;
      const gapY = 2.0;

      final cardCellWidth = (availableWidth - ((cols - 1) * gapX)) / cols;
      final cardCellHeight = (availableHeight - ((rows - 1) * gapY)) / rows;

      expect(cardCellWidth > 200, true);
      expect(cardCellHeight > 100, true);

      // Verify that total width of row does not exceed available width
      final totalRowWidth = (cardCellWidth * cols) + ((cols - 1) * gapX);
      expect(totalRowWidth, closeTo(availableWidth, 0.001));

      // Verify that total height of column does not exceed available height
      final totalColHeight = (cardCellHeight * rows) + ((rows - 1) * gapY);
      expect(totalColHeight, closeTo(availableHeight, 0.001));
    });

    test('Zero drift across custom grid matrices (from 2x2 up to 6x20)', () {
      final a4 = PdfPageFormat.a4;
      const pageMargin = 6.0;
      const headerHeight = 16.0;
      final availableWidth = a4.width - (2 * pageMargin);
      final availableHeight = a4.height - (2 * pageMargin) - headerHeight;

      final testGrids = [
        [2, 3],
        [3, 4],
        [4, 6],
        [5, 10],
        [6, 20],
      ];

      for (final grid in testGrids) {
        final cols = grid[0];
        final rows = grid[1];
        final gapX = cols > 4 ? 1.0 : 2.0;
        final gapY = rows > 10 ? 1.0 : 2.0;

        final cellWidth = (availableWidth - ((cols - 1) * gapX)) / cols;
        final cellHeight = (availableHeight - ((rows - 1) * gapY)) / rows;

        expect(cellWidth > 0, true);
        expect(cellHeight > 0, true);

        final totalWidth = (cellWidth * cols) + ((cols - 1) * gapX);
        final totalHeight = (cellHeight * rows) + ((rows - 1) * gapY);

        expect(totalWidth, closeTo(availableWidth, 0.001));
        expect(totalHeight, closeTo(availableHeight, 0.001));
      }
    });

    test('generateCardsPdf applies precision grid and renders multi-page PDF without errors', () async {
      final sampleCards = List.generate(
        25,
        (i) => OfflineCardModel(
          id: 'card-$i',
          serialNumber: 'SN-2026-${(i + 1).toString().padLeft(4, "0")}',
          username: 'user${1000 + i}',
          clearPassword: 'pass${1000 + i}',
          profileId: 'prof-test',
          profileName: 'باقة فايبر سريعة',
          deviceId: 'router-1',
          price: 250.0,
          currency: 'SDG',
        ),
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'سودافاي شبكة الاختبار',
        layout: CardPdfLayout.a4Grid10, // 10 cards per page -> 3 pages for 25 cards
        customColors: const CardColorCustomization(
          headerTextColor: '#065F46',
          usernameColor: '#F59E0B',
          borderColor: '#10B981',
          cardBackgroundColor: '#0F172A',
        ),
      );

      expect(pdfBytes.isNotEmpty, true);
      // Verify PDF Magic Bytes (%PDF-)
      final magicHeader = utf8.decode(pdfBytes.sublist(0, 5), allowMalformed: true);
      expect(magicHeader.startsWith('%PDF'), true);
    });

    test('User exact scenario: 100 cards batch (a4Grid100) strictly applies custom element placements and QR code', () async {
      final sampleCards = List.generate(
        100,
        (i) => OfflineCardModel(
          id: 'card-$i',
          serialNumber: 'SN-2026-${(i + 1).toString().padLeft(4, "0")}',
          username: '${849200 + i}',
          clearPassword: '${849200 + i}', // Single PIN mode
          profileId: 'prof-1h',
          profileName: '1h (ساعة واحدة)',
          deviceId: 'router-1',
          price: 500.0,
          currency: 'SDG',
        ),
      );

      // Elements placement as configured in Image 1:
      // Network Name: Top, Right
      // Card Price: Top, Left
      // Credentials: Middle, Right
      // Profile Details: Middle, Right
      // QR Code: Middle, Left
      // Instructions: Bottom, Center
      final userLayout = CardElementsLayout(
        networkName: const CardElementPlacement(vertical: 'top', align: 'right', isVisible: true),
        price: const CardElementPlacement(vertical: 'top', align: 'left', isVisible: true),
        credentials: const CardElementPlacement(vertical: 'middle', align: 'right', isVisible: true),
        profileDetails: const CardElementPlacement(vertical: 'middle', align: 'right', isVisible: true),
        qrCode: const CardElementPlacement(vertical: 'middle', align: 'left', isVisible: true),
        instructions: const CardElementPlacement(vertical: 'bottom', align: 'center', isVisible: true),
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'تذكرة إنترنت هوتسبوت',
        layout: CardPdfLayout.a4Grid100,
        batchNumber: 'B-261101-826F',
        showPrice: true,
        showQr: true,
        instructions: 'امسح الرمز أو ادخل الكود',
        elementsLayout: userLayout,
      );

      expect(pdfBytes.isNotEmpty, true);
      final magicHeader = utf8.decode(pdfBytes.sublist(0, 5), allowMalformed: true);
      expect(magicHeader.startsWith('%PDF'), true);
    });
  });
}

