import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';
import 'package:image/image.dart' as img;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final outputDir = Directory('e:/microTik_project/apps/mobile/test_output_pdfs');
  if (!outputDir.existsSync()) {
    outputDir.createSync(recursive: true);
  }

  List<OfflineCardModel> generateCards(int count, {String prefix = 'V'}) {
    return List.generate(count, (i) {
      final id = (i + 1).toString().padLeft(4, '0');
      return OfflineCardModel(
        id: 'card-$id',
        serialNumber: 'SN-2026-$id',
        username: '$prefix$id',
        clearPassword: '$prefix$id',
        profileId: 'p-1h',
        profileName: '1 Hour Ultra',
        deviceId: 'dev-1',
        price: 500,
        currency: 'SDG',
        status: 'AVAILABLE',
      );
    });
  }

  Uint8List generateTestPatternImage(int w, int h, int r, int g, int b) {
    final image = img.Image(width: w, height: h);
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        // Draw diagonal gradient pattern
        final factor = (x + y) / (w + h);
        image.setPixelRgb(
          x,
          y,
          (r * factor).toInt().clamp(0, 255),
          (g * factor).toInt().clamp(0, 255),
          (b * factor).toInt().clamp(0, 255),
        );
      }
    }
    // Draw a geometric circle in the middle to test that circles are not distorted
    final cx = w ~/ 2;
    final cy = h ~/ 2;
    final radius = (h * 0.25).toInt();
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        final dist = ((x - cx) * (x - cx) + (y - cy) * (y - cy));
        if ((dist - radius * radius).abs() < radius * 2) {
          image.setPixelRgb(x, y, 255, 255, 255);
        }
      }
    }
    return Uint8List.fromList(img.encodePng(image));
  }

  group('Final Visual & Technical PDF Export Validation', () {
    test('1. Generate & Export 12 Cards PDF (a4Grid12)', () async {
      final cards = generateCards(12, prefix: 'C12_');
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | شبكة النخبة 12',
        layout: CardPdfLayout.a4Grid12,
        batchNumber: 'B-12',
        showQr: true,
      );

      final file = File('${outputDir.path}/cards_12_batch.pdf');
      file.writeAsBytesSync(pdfBytes);

      expect(file.existsSync(), isTrue);
      expect(file.lengthSync(), greaterThan(3000));
      expect(String.fromCharCodes(pdfBytes.take(4)), equals('%PDF'));

      final pdfStr = latin1.decode(pdfBytes, allowInvalid: true);
      expect(pdfStr.contains('/Count 1'), isTrue); // Exactly 1 page
    });

    test('2. Generate & Export 50 Cards PDF (a4Grid10 - 5 pages & a4Grid100 - 1 page)', () async {
      final cards = generateCards(50, prefix: 'C50_');

      // 50 cards with a4Grid10 (10 cards/page => exactly 5 pages)
      final pdf10Bytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | شبكة 50 كرت (A4 10)',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'B-50-P5',
        showQr: true,
      );
      final file10 = File('${outputDir.path}/cards_50_grid10_5pages.pdf');
      file10.writeAsBytesSync(pdf10Bytes);
      expect(file10.existsSync(), isTrue);

      final pdf10Str = latin1.decode(pdf10Bytes, allowInvalid: true);
      expect(pdf10Str.contains('/Count 5'), isTrue); // Exactly 5 pages

      // 50 cards with a4Grid100 (100 capacity => exactly 1 page)
      final pdf100Bytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | شبكة 50 كرت (A4 100)',
        layout: CardPdfLayout.a4Grid100,
        batchNumber: 'B-50-P1',
        showQr: true,
      );
      final file100 = File('${outputDir.path}/cards_50_grid100_1page.pdf');
      file100.writeAsBytesSync(pdf100Bytes);
      expect(file100.existsSync(), isTrue);

      final pdf100Str = latin1.decode(pdf100Bytes, allowInvalid: true);
      expect(pdf100Str.contains('/Count 1'), isTrue); // Exactly 1 page
    });

    test('3. Generate & Export 100 Cards PDF (a4Grid100)', () async {
      final cards = generateCards(100, prefix: 'C100_');
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
        cards: cards,
        networkName: 'سودافاي | دفعة 100 كرت كاملة',
        layout: CardPdfLayout.a4Grid100,
        batchNumber: 'B-100-FULL',
        showQr: true,
        showPrice: true,
        elementsLayout: customLayout,
      );

      final file = File('${outputDir.path}/cards_100_batch.pdf');
      file.writeAsBytesSync(pdfBytes);

      expect(file.existsSync(), isTrue);
      expect(file.lengthSync(), greaterThan(15000));

      final pdfStr = latin1.decode(pdfBytes, allowInvalid: true);
      expect(pdfStr.contains('/Count 1'), isTrue); // Exactly 1 page
    });

    test('4. Generate & Export 120 Cards PDF across 2 pages (a4Grid100)', () async {
      final cards = generateCards(120, prefix: 'C120_');

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | دفعة 120 كرت (صفحتين)',
        layout: CardPdfLayout.a4Grid100,
        batchNumber: 'B-120-P2',
        showQr: true,
      );

      final file = File('${outputDir.path}/cards_120_batch.pdf');
      file.writeAsBytesSync(pdfBytes);

      expect(file.existsSync(), isTrue);
      expect(file.lengthSync(), greaterThan(20000));

      final pdfStr = latin1.decode(pdfBytes, allowInvalid: true);
      expect(pdfStr.contains('/Count 2'), isTrue); // Exactly 2 pages
    });

    test('5. Generate & Export 3 Distinct Imported Templates with Backgrounds & Custom Elements', () async {
      final cards = generateCards(6, prefix: 'T_');

      // Template 1: Golden Football (Green/Gold theme, circular watermark)
      final footballBg = generateTestPatternImage(340, 216, 6, 95, 70);
      final templateFootball = CardTemplateModel(
        id: 'custom-football-imported',
        name: 'قالب كرة القدم المستورد',
        themePreset: 'FOOTBALL',
        primaryColor: '#065F46',
        accentColor: '#F59E0B',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        backgroundImageBytes: footballBg,
        layoutConfig: {
          'elements': const CardElementsLayout(
            networkName: CardElementPlacement(vertical: 'top', align: 'right', scale: 'large'),
            price: CardElementPlacement(vertical: 'top', align: 'left', scale: 'normal'),
            credentials: CardElementPlacement(vertical: 'middle', align: 'left', scale: 'large'),
            qrCode: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'normal'),
          ).toMap(),
        },
      );

      // Template 2: Emerald Technology (Cyan/Teal theme)
      final techBg = generateTestPatternImage(340, 216, 13, 148, 136);
      final templateTech = CardTemplateModel(
        id: 'custom-tech-imported',
        name: 'قالب التكنولوجيا المستورد',
        themePreset: 'TECH',
        primaryColor: '#0F172A',
        accentColor: '#06B6D4',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        backgroundImageBytes: techBg,
        layoutConfig: {
          'elements': const CardElementsLayout(
            networkName: CardElementPlacement(vertical: 'top', align: 'center', scale: 'normal'),
            price: CardElementPlacement(vertical: 'top', align: 'left', scale: 'normal'),
            credentials: CardElementPlacement(vertical: 'middle', align: 'center', scale: 'large'),
            qrCode: CardElementPlacement(vertical: 'bottom', align: 'left', scale: 'normal'),
          ).toMap(),
        },
      );

      // Template 3: Corporate ISP (Deep Blue / Cobalt)
      final ispBg = generateTestPatternImage(340, 216, 30, 58, 138);
      final templateISP = CardTemplateModel(
        id: 'custom-isp-imported',
        name: 'قالب الشركات المستورد',
        themePreset: 'CORPORATE_ISP',
        primaryColor: '#1E3A8A',
        accentColor: '#3B82F6',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        backgroundImageBytes: ispBg,
        layoutConfig: {
          'elements': const CardElementsLayout(
            networkName: CardElementPlacement(vertical: 'top', align: 'right', scale: 'large'),
            price: CardElementPlacement(vertical: 'bottom', align: 'right', scale: 'normal'),
            credentials: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'large'),
            qrCode: CardElementPlacement(vertical: 'middle', align: 'left', scale: 'normal'),
          ).toMap(),
        },
      );

      final pdf1 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شبكة كاس الذهب',
        template: templateFootball,
      );
      final pdf2 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شبكة التكنولوجيا الذكية',
        template: templateTech,
      );
      final pdf3 = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'شركة النيل للاتصالات',
        template: templateISP,
      );

      File('${outputDir.path}/template_1_football.pdf').writeAsBytesSync(pdf1);
      File('${outputDir.path}/template_2_tech.pdf').writeAsBytesSync(pdf2);
      File('${outputDir.path}/template_3_corporate_isp.pdf').writeAsBytesSync(pdf3);

      expect(pdf1, isNot(equals(pdf2)));
      expect(pdf2, isNot(equals(pdf3)));
      expect(pdf1, isNot(equals(pdf3)));

      // Ensure each PDF contains its embedded image stream
      final imageRegex = RegExp(r'/Subtype\s*/Image');
      expect(imageRegex.hasMatch(latin1.decode(pdf1, allowInvalid: true)), isTrue);
      expect(imageRegex.hasMatch(latin1.decode(pdf2, allowInvalid: true)), isTrue);
      expect(imageRegex.hasMatch(latin1.decode(pdf3, allowInvalid: true)), isTrue);
    });
  });
}
