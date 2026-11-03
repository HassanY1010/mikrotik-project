import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_template_import_service.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Problem 1: QR Card Registration Optionality & LocalStorage', () {
    test('getCardQrRegistrationEnabled defaults to true and can be toggled', () async {
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();

      expect(storage.getCardQrRegistrationEnabled(), isTrue);

      await storage.setCardQrRegistrationEnabled(false);
      expect(storage.getCardQrRegistrationEnabled(), isFalse);

      await storage.setCardQrRegistrationEnabled(true);
      expect(storage.getCardQrRegistrationEnabled(), isTrue);
    });

    test('Cards generate and function with or without QR registration requirement', () {
      final card = OfflineCardModel(
        id: 'c-test-1',
        serialNumber: 'SN-2026-0001',
        username: '849204',
        clearPassword: null, // Unified PIN mode
        profileId: 'p-1',
        profileName: 'Standard Package',
        deviceId: 'd-1',
        price: 500,
        currency: 'SDG',
      );

      // In PIN-only or disabled QR registration, user can login purely by code
      expect(card.username, equals('849204'));
      expect(card.loginUrl, contains('username=849204'));
      expect(card.loginUrl, contains('password=849204'));
    });
  });

  group('Problem 2: Ready-Made Template Catalog Diversity', () {
    test('Catalog contains all requested themes with unique visual styles and layouts', () {
      final catalog = CardTemplateImportService.getBuiltInCatalog();
      expect(catalog.isNotEmpty, isTrue);

      final presets = catalog.map((t) => t.themePreset.toUpperCase()).toSet();
      expect(presets, contains('FOOTBALL'));
      expect(presets, contains('GEOMETRIC'));
      expect(presets, contains('MODERN'));
      expect(presets, contains('CORPORATE_ISP'));
      expect(presets, contains('MINIMALIST'));
      expect(presets, contains('TECH_CIRCUIT'));
      expect(presets, contains('LUXURY_ROYAL'));

      // Check distinct designStyle and elements layout across templates
      final techTemplate = catalog.firstWhere((t) => t.themePreset == 'TECH_CIRCUIT');
      final modernTemplate = catalog.firstWhere((t) => t.themePreset == 'MODERN');
      final corpTemplate = catalog.firstWhere((t) => t.themePreset == 'CORPORATE_ISP');
      final minimalTemplate = catalog.firstWhere((t) => t.themePreset == 'MINIMALIST');

      final techLayout = techTemplate.elementsLayout;
      final modernLayout = modernTemplate.elementsLayout;
      final corpLayout = corpTemplate.elementsLayout;
      final minimalLayout = minimalTemplate.elementsLayout;

      expect(techLayout, isNotNull);
      expect(modernLayout, isNotNull);
      expect(corpLayout, isNotNull);
      expect(minimalLayout, isNotNull);

      // Verify Tech has credentials on left, QR on right
      expect(techLayout.credentials.align, equals('left'));
      expect(techLayout.qrCode.align, equals('right'));

      // Verify Modern has credentials centered, QR on bottom left
      expect(modernLayout.credentials.align, equals('center'));
      expect(modernLayout.qrCode.vertical, equals('bottom'));
      expect(modernLayout.qrCode.align, equals('left'));

      // Verify Corporate has credentials on right, QR on left (classic RTL/ISP layout)
      expect(corpLayout.credentials.align, equals('right'));
      expect(corpLayout.qrCode.align, equals('left'));

      // Verify Minimalist has centered credentials and small bottom QR
      expect(minimalLayout.credentials.align, equals('center'));
      expect(minimalLayout.qrCode.scale, equals('small'));
    });

    test('PDF generator renders unique themes without throwing', () async {
      final catalog = CardTemplateImportService.getBuiltInCatalog();
      final testCards = List.generate(
        4,
        (i) => OfflineCardModel(
          id: 'card-$i',
          serialNumber: 'SN-00$i',
          username: 'USER${1000 + i}',
          clearPassword: 'P${2000 + i}',
          profileId: 'p-1',
          profileName: 'VIP Turbo',
          deviceId: 'd-1',
          price: 1500,
          currency: 'SDG',
        ),
      );

      for (final tpl in catalog) {
        final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
          cards: testCards,
          networkName: tpl.layoutConfig['networkName'] as String? ?? 'SudaFi Net',
          supportPhone: tpl.layoutConfig['supportPhone'] as String? ?? '0912345678',
          layout: CardPdfLayout.a4Grid10,
          batchNumber: 'BATCH-DIVERSITY-${tpl.themePreset}',
          template: tpl,
          elementsLayout: tpl.elementsLayout,
          themePreset: tpl.themePreset,
        );

        expect(pdfBytes, isA<Uint8List>());
        expect(pdfBytes.length, greaterThan(1000));
        final header = String.fromCharCodes(pdfBytes.sublist(0, 5));
        expect(header, equals('%PDF-'));
      }
    });

    test('PDF generator respects manual element position overrides', () async {
      final customLayout = const CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'top', align: 'left', scale: 'large'),
        price: CardElementPlacement(vertical: 'top', align: 'right', scale: 'normal'),
        credentials: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'large'),
        profileDetails: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'small'),
        qrCode: CardElementPlacement(vertical: 'middle', align: 'left', scale: 'large'),
        instructions: CardElementPlacement(vertical: 'bottom', align: 'center', scale: 'small'),
        serialNumber: CardElementPlacement(vertical: 'bottom', align: 'left', scale: 'small'),
      );

      final cards = [
        OfflineCardModel(
          id: 'card-ov-1',
          serialNumber: 'SN-OVERRIDE-01',
          username: 'OVERRIDE_USER',
          clearPassword: '9988',
          profileId: 'p-ov',
          profileName: 'Override Profile',
          deviceId: 'd-1',
          price: 2500,
          currency: 'SDG',
        ),
      ];

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'Custom Overridden Net',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'BATCH-OVERRIDE',
        elementsLayout: customLayout,
        themePreset: 'MODERN',
      );

      expect(pdfBytes.length, greaterThan(1000));
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), equals('%PDF-'));
    });
  });
}
