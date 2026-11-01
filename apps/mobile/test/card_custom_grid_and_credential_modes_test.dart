import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Uint8List createSampleImageBytes() {
    final image = img.Image(width: 850, height: 540);
    img.fill(image, color: img.ColorRgb8(240, 245, 250));
    img.fillRect(image, x1: 0, y1: 0, x2: 850, y2: 80, color: img.ColorRgb8(15, 118, 110));
    img.fillRect(image, x1: 0, y1: 480, x2: 850, y2: 540, color: img.ColorRgb8(30, 41, 59));
    return Uint8List.fromList(img.encodePng(image));
  }

  List<OfflineCardModel> createCards(int count, {int credentialMode = 0}) {
    return List.generate(count, (i) {
      final idx = i + 1;
      final username = '${849200 + idx}';
      String? password;
      if (credentialMode == 0) {
        // Single PIN: password equals username
        password = username;
      } else if (credentialMode == 1) {
        // Username + Password: separate password
        password = '${1000 + (idx % 9000)}';
      } else {
        // Username Only: no password
        password = null;
      }

      return OfflineCardModel(
        id: 'card-$idx',
        serialNumber: 'SN-2026-${idx.toString().padLeft(4, "0")}',
        username: username,
        clearPassword: password,
        profileId: 'prof-1',
        profileName: 'باقة يوم واحد - 500 SDG',
        deviceId: 'dev-1',
        price: 500,
        currency: 'SDG',
      );
    });
  }

  group('Custom Grid & Credential Modes Verification Suite', () {
    test('1. Custom Grid 6x20 (120 cards per page) with Single PIN on Default Theme', () async {
      final cards = createCards(120, credentialMode: 0);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        themePreset: 'FOOTBALL',
        customCols: 6,
        customRows: 20,
        customMargin: 2.0, // 2mm
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(1000));
      expect(String.fromCharCodes(pdfBytes.take(5)), equals('%PDF-'));

      // Save sample PDF for visual verification
      final outputDir = Directory('C:/Users/HP/.gemini/antigravity/brain/450c6bde-fe47-4463-9a02-0800f71fe6ce/scratch');
      if (!outputDir.existsSync()) outputDir.createSync(recursive: true);
      File('${outputDir.path}/test_120_cards_single_pin_football.pdf').writeAsBytesSync(pdfBytes);
    });

    test('2. Custom Grid 6x20 (120 cards per page) with Custom Imported Template & Background Image', () async {
      final sampleImage = createSampleImageBytes();
      final template = CardTemplateModel(
        id: 'custom-tpl-1',
        name: 'قالب كروت مخصص ذهبي',
        themePreset: 'FOOTBALL',
        widthMm: 85,
        heightMm: 54,
        layoutConfig: {
          'networkName': 'سودافاي الذهبي',
          'backgroundImageBase64': base64Encode(sampleImage),
        },
      );

      final cards = createCards(120, credentialMode: 0);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي الذهبي',
        template: template,
        customCols: 6,
        customRows: 20,
        customMargin: 2.0,
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(1000));
      final outputDir = Directory('C:/Users/HP/.gemini/antigravity/brain/450c6bde-fe47-4463-9a02-0800f71fe6ce/scratch');
      File('${outputDir.path}/test_120_cards_custom_template.pdf').writeAsBytesSync(pdfBytes);
    });

    test('3. Credential Modes: Single PIN, Username+Password, Username Only', () async {
      for (final mode in [0, 1, 2]) {
        final cards = createCards(60, credentialMode: mode);
        final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
          cards: cards,
          networkName: 'سودافاي - نمط $mode',
          customCols: 4,
          customRows: 10,
          customMargin: 2.0,
        );

        expect(pdfBytes, isNotNull);
        expect(pdfBytes.length, greaterThan(1000));
        expect(String.fromCharCodes(pdfBytes.take(5)), equals('%PDF-'));
      }
    });

    test('4. Grid Dimensions Grid Matrix: (3x10, 4x10, 5x10, 6x20, 4x20, 5x20) with various margins', () async {
      final gridConfigs = [
        {'cols': 3, 'rows': 10, 'margin': 0.0},
        {'cols': 4, 'rows': 10, 'margin': 2.0},
        {'cols': 5, 'rows': 10, 'margin': 5.0},
        {'cols': 6, 'rows': 20, 'margin': 2.0},
        {'cols': 4, 'rows': 20, 'margin': 1.0},
        {'cols': 5, 'rows': 20, 'margin': 3.0},
      ];

      for (final cfg in gridConfigs) {
        final cols = cfg['cols'] as int;
        final rows = cfg['rows'] as int;
        final margin = cfg['margin'] as double;
        final totalCards = cols * rows;

        final cards = createCards(totalCards, credentialMode: 1);
        final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
          cards: cards,
          networkName: 'سودافاي - ${cols}x$rows',
          customCols: cols,
          customRows: rows,
          customMargin: margin,
        );

        expect(pdfBytes, isNotNull);
        expect(pdfBytes.length, greaterThan(1000));
      }
    });

    test('5. Multi-Page Quantities: 50, 100, 120, 250, 500 cards accurately split across pages', () async {
      // With 120 cards per page (6x20):
      // - 50 cards -> 1 page
      // - 100 cards -> 1 page
      // - 120 cards -> 1 page
      // - 250 cards -> 3 pages (120 + 120 + 10)
      // - 500 cards -> 5 pages (120 + 120 + 120 + 120 + 20)
      final quantities = [50, 100, 120, 250, 500];

      for (final q in quantities) {
        final cards = createCards(q, credentialMode: 0);
        final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
          cards: cards,
          networkName: 'سودافاي - كمية $q',
          customCols: 6,
          customRows: 20,
          customMargin: 2.0,
        );

        expect(pdfBytes, isNotNull);
        expect(pdfBytes.length, greaterThan(1000));

        // Check page count in PDF document (/Count N in /Pages catalog)
        final pdfString = String.fromCharCodes(pdfBytes);
        final expectedPages = (q / 120).ceil();
        final countMatch = RegExp(r'/Count\s+(\d+)').firstMatch(pdfString);
        final pageCount = countMatch != null ? int.parse(countMatch.group(1)!) : 0;
        expect(pageCount, equals(expectedPages), reason: 'Quantity $q should produce exactly $expectedPages pages');
      }
    });

    test('6. User scenario: 120 cards with 100 cards per page (Page 1 has 100, Page 2 has 20 identical alignment)', () async {
      final cards = createCards(120, credentialMode: 0);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        layout: CardPdfLayout.a4Grid100, // 5 cols x 20 rows = 100 cards per page
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(1000));
      expect(String.fromCharCodes(pdfBytes.take(5)), equals('%PDF-'));

      final pdfString = String.fromCharCodes(pdfBytes);
      final countMatch = RegExp(r'/Count\s+(\d+)').firstMatch(pdfString);
      expect(countMatch != null ? int.parse(countMatch.group(1)!) : 0, equals(2));

      final outputDir = Directory('C:/Users/HP/.gemini/antigravity/brain/450c6bde-fe47-4463-9a02-0800f71fe6ce/scratch');
      if (!outputDir.existsSync()) outputDir.createSync(recursive: true);
      File('${outputDir.path}/test_120_cards_100_per_page_two_pages.pdf').writeAsBytesSync(pdfBytes);
    });
  });
}
