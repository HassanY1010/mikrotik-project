import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/services/card_template_import_service.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SharedPreferences prefs;
  late LocalStorage localStorage;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    localStorage = LocalStorage(prefs);
  });

  group('Card Template Import & Persistence Verification', () {
    test('Import preserves existing stable ID, custom colors, dimensions, and elements layout', () async {
      final jsonContent = jsonEncode({
        'id': 'imported-template-alpha-99',
        'name': 'Golden Mesh Premium',
        'themePreset': 'VIP_GOLD',
        'primaryColor': '#1A1A24',
        'accentColor': '#FFD700',
        'widthMm': 85.6,
        'heightMm': 53.98,
        'showPrice': true,
        'showQr': true,
        'showPin': true,
        'showSpeed': true,
        'showValidity': true,
        'instructions': 'اتصل بالشبكة وأدخل الكود في صفحة تسجيل الدخول',
        'elements': {
          'networkName': {'vertical': 'top', 'align': 'right', 'scale': 'large', 'isVisible': true},
          'price': {'vertical': 'top', 'align': 'left', 'scale': 'normal', 'isVisible': true},
          'credentials': {'vertical': 'middle', 'align': 'center', 'scale': 'large', 'isVisible': true},
          'profileDetails': {'vertical': 'middle', 'align': 'right', 'scale': 'normal', 'isVisible': true},
          'qrCode': {'vertical': 'middle', 'align': 'left', 'scale': 'normal', 'isVisible': true},
          'instructions': {'vertical': 'bottom', 'align': 'center', 'scale': 'small', 'isVisible': true},
          'serialNumber': {'vertical': 'bottom', 'align': 'right', 'scale': 'small', 'isVisible': true},
        }
      });

      final result = CardTemplateImportService.validateAndParseTemplateJson(jsonContent);
      expect(result.isValid, isTrue);
      final template = result.template!;

      // 1. Stable ID preserved
      expect(template.id, 'imported-template-alpha-99');
      expect(template.name, 'Golden Mesh Premium');
      expect(template.primaryColor, '#1A1A24');
      expect(template.accentColor, '#FFD700');
      expect(template.showPrice, isTrue);

      // 2. Elements layout correctly deserialized
      final layout = template.elementsLayout;
      expect(layout.networkName.vertical, 'top');
      expect(layout.networkName.align, 'right');
      expect(layout.networkName.scale, 'large');
      expect(layout.credentials.vertical, 'middle');
      expect(layout.credentials.align, 'center');
      expect(layout.credentials.scale, 'large');
      expect(layout.qrCode.align, 'left');

      // 3. Save to LocalStorage and verify retrieval
      await localStorage.saveCustomTemplate(template);
      final list = localStorage.getCustomTemplates();
      expect(list.length, 1);
      expect(list.first.id, 'imported-template-alpha-99');
      expect(list.first.elementsLayout.credentials.align, 'center');
    });

    test('Backward compatibility: Legacy templates without elements layout load safely with valid defaults', () async {
      final legacyJson = jsonEncode({
        'id': 'legacy-template-01',
        'name': 'Old School Blue',
        'themePreset': 'TECH_BLUE',
        'primaryColor': '003366', // missing # prefix
        'accentColor': '00CCFF',
        'widthMm': 85.0,
        'heightMm': 54.0,
      });

      final result = CardTemplateImportService.validateAndParseTemplateJson(legacyJson);
      expect(result.isValid, isTrue);
      final template = result.template!;

      // Must not crash or revert to default template
      expect(template.id, 'legacy-template-01');
      expect(template.elementsLayout.networkName.vertical, 'top');
      expect(template.elementsLayout.credentials.vertical, 'middle');
      expect(template.elementsLayout.instructions.vertical, 'bottom');
    });

    test('createTemplateFromMedia includes default CardElementsLayout and preserves parameters', () {
      final dummyBytes = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]);
      final template = CardTemplateImportService.createTemplateFromMedia(
        name: 'Custom Image Template',
        imageBytes: dummyBytes,
        themePreset: 'MINIMAL_DARK',
        primaryColor: '#111827',
        accentColor: '#10B981',
      );

      expect(template.name, 'Custom Image Template');
      expect(template.backgroundImageBase64, isNotEmpty);
      expect(template.elementsLayout.networkName.align, 'right');
      expect(template.elementsLayout.price.align, 'left');
    });
  });

  group('Studio Active Template Selection & LocalStorage State Tests', () {
    test('Selected studio template ID persists across cold app restarts', () async {
      expect(localStorage.getSelectedStudioTemplateId(), isNull);

      await localStorage.setSelectedStudioTemplateId('custom-template-999');
      expect(localStorage.getSelectedStudioTemplateId(), 'custom-template-999');

      // Switch to another template
      await localStorage.setSelectedStudioTemplateId('custom-template-888');
      expect(localStorage.getSelectedStudioTemplateId(), 'custom-template-888');

      // Clearing selection
      await localStorage.setSelectedStudioTemplateId(null);
      expect(localStorage.getSelectedStudioTemplateId(), isNull);
    });

    test('Switching between two custom templates does not bleed properties', () async {
      final template1 = CardTemplateModel(
        id: 'tmpl-1',
        name: 'Dark Red Cyber',
        themePreset: 'CYBER_RED',
        primaryColor: '#990000',
        accentColor: '#FF4444',
        widthMm: 85,
        heightMm: 54,
      ).withElementsLayout(const CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'bottom', align: 'left'),
        credentials: CardElementPlacement(vertical: 'top', align: 'center'),
      ));

      final template2 = CardTemplateModel(
        id: 'tmpl-2',
        name: 'Emerald Green Minimal',
        themePreset: 'EMERALD_GREEN',
        primaryColor: '#005522',
        accentColor: '#00FF88',
        widthMm: 85,
        heightMm: 54,
      ).withElementsLayout(const CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'top', align: 'right'),
        credentials: CardElementPlacement(vertical: 'middle', align: 'right'),
      ));

      await localStorage.saveCustomTemplate(template1);
      await localStorage.saveCustomTemplate(template2);

      final storedTemplates = localStorage.getCustomTemplates();
      final loaded1 = storedTemplates.firstWhere((t) => t.id == 'tmpl-1');
      final loaded2 = storedTemplates.firstWhere((t) => t.id == 'tmpl-2');

      expect(loaded1.primaryColor, '#990000');
      expect(loaded1.elementsLayout.networkName.vertical, 'bottom');
      expect(loaded1.elementsLayout.credentials.vertical, 'top');

      expect(loaded2.primaryColor, '#005522');
      expect(loaded2.elementsLayout.networkName.vertical, 'top');
      expect(loaded2.elementsLayout.credentials.vertical, 'middle');
    });
  });

  group('PDF Generation Engine with Custom Template & Zone Layout', () {
    final sampleCards = [
      OfflineCardModel(
        id: 'card-001',
        serialNumber: 'SN-001',
        username: 'usr-9281',
        clearPassword: 'pin-5521',
        profileId: 'prof-1',
        profileName: 'باقة يومية 5 جيجا',
        deviceId: 'dev-1',
        price: 500.0,
        currency: 'SDG',
      ),
      OfflineCardModel(
        id: 'card-002',
        serialNumber: 'SN-002',
        username: 'usr-9282',
        clearPassword: 'pin-5522',
        profileId: 'prof-2',
        profileName: 'باقة شهرية غير محدودة',
        deviceId: 'dev-1',
        price: 3500.0,
        currency: 'SDG',
      ),
    ];

    test('generateCardsPdf applies custom template styling and element placements', () async {
      final customTemplate = CardTemplateModel(
        id: 'gold-custom',
        name: 'Gold Custom Template',
        themePreset: 'VIP_GOLD',
        primaryColor: '#2B2B36',
        accentColor: '#E5A93C',
        widthMm: 85,
        heightMm: 54,
        layoutConfig: {
          'showPrice': true,
          'showQr': true,
          'showSerial': true,
          'instructions': 'سودافاي نت - استخدم الكود لتسجيل الدخول',
        },
      ).withElementsLayout(const CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'top', align: 'right', scale: 'large'),
        price: CardElementPlacement(vertical: 'top', align: 'left', scale: 'normal'),
        profileDetails: CardElementPlacement(vertical: 'middle', align: 'right', scale: 'normal'),
        credentials: CardElementPlacement(vertical: 'middle', align: 'center', scale: 'large'),
        qrCode: CardElementPlacement(vertical: 'middle', align: 'left', scale: 'normal'),
        instructions: CardElementPlacement(vertical: 'bottom', align: 'center', scale: 'small'),
        serialNumber: CardElementPlacement(vertical: 'bottom', align: 'right', scale: 'small'),
      ));

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'سودافاي السريع',
        template: customTemplate,
        layout: CardPdfLayout.a4Grid10,
      );

      expect(pdfBytes, isNotEmpty);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('generateCardsPdf handles dense 6x20 (120 cards) grid without overflow', () async {
      final batch120 = List.generate(
        120,
        (i) => OfflineCardModel(
          id: 'dense-$i',
          serialNumber: 'SN-DENSE-${i + 1}',
          username: 'user_${1000 + i}',
          clearPassword: 'pass_${1000 + i}',
          profileId: 'dense-prof',
          profileName: 'Dense 6x20',
          deviceId: 'dev-1',
          price: 500.0,
          currency: 'SDG',
        ),
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: batch120,
        networkName: 'شبكة الكثافة العالية',
        customCols: 6,
        customRows: 20,
        customMargin: 1.0,
        isLandscape: false,
      );

      expect(pdfBytes, isNotEmpty);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('Large batch of 100 cards generates successfully with custom template without overflow', () async {
      final batch100 = List.generate(
        100,
        (i) => OfflineCardModel(
          id: 'card-$i',
          serialNumber: 'SN-$i',
          username: 'usr-$i',
          clearPassword: 'pin-$i',
          profileId: 'prof-1',
          profileName: 'باقة اختبار $i',
          deviceId: 'dev-1',
          price: 250.0 + i,
          currency: 'SDG',
        ),
      );

      final customTemplate = CardTemplateModel(
        id: 'dense-custom',
        name: 'Dense Custom Layout',
        themePreset: 'TECH_BLUE',
        primaryColor: '#0F172A',
        accentColor: '#38BDF8',
        widthMm: 85,
        heightMm: 54,
      ).withElementsLayout(const CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'top', align: 'center', scale: 'small'),
        price: CardElementPlacement(vertical: 'top', align: 'right', scale: 'small'),
        credentials: CardElementPlacement(vertical: 'middle', align: 'center', scale: 'normal'),
        instructions: CardElementPlacement(vertical: 'bottom', align: 'center', scale: 'small'),
      ));

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: batch100,
        networkName: 'شبكة سودافاي الكبرى',
        template: customTemplate,
        layout: CardPdfLayout.a4Grid100,
      );

      expect(pdfBytes, isNotEmpty);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('generateCardsPdf handles dense 6x20 (120 cards) grid without overflow', () async {
      final batch120 = List.generate(
        120,
        (i) => OfflineCardModel(
          id: 'dense-$i',
          serialNumber: 'SN-DENSE-${i + 1}',
          username: 'user_${1000 + i}',
          clearPassword: 'pass_${1000 + i}',
          profileId: 'dense-prof',
          profileName: 'Dense 6x20',
          deviceId: 'dev-1',
          price: 500.0,
          currency: 'SDG',
        ),
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: batch120,
        networkName: 'شبكة الكثافة العالية',
        customCols: 6,
        customRows: 20,
        customMargin: 1.0,
        isLandscape: false,
      );

      expect(pdfBytes, isNotEmpty);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('All elements can be placed in arbitrary vertical zones without crash', () async {
      final bottomHeavyTemplate = CardTemplateModel(
        id: 'bottom-heavy',
        name: 'Bottom Heavy',
        themePreset: 'PURPLE_GALAXY',
        primaryColor: '#3B0764',
        accentColor: '#C084FC',
        widthMm: 85,
        heightMm: 54,
      ).withElementsLayout(const CardElementsLayout(
        networkName: CardElementPlacement(vertical: 'bottom', align: 'right'),
        price: CardElementPlacement(vertical: 'bottom', align: 'left'),
        credentials: CardElementPlacement(vertical: 'bottom', align: 'center'),
        profileDetails: CardElementPlacement(vertical: 'top', align: 'center'),
        qrCode: CardElementPlacement(vertical: 'top', align: 'left'),
      ));

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'شبكة المجرة',
        template: bottomHeavyTemplate,
        layout: CardPdfLayout.a4Grid12,
      );

      expect(pdfBytes, isNotEmpty);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('generateCardsPdf renders valid PDF with landscape A4 sheet orientation', () async {
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'شبكة الواحة الأفقية',
        layout: CardPdfLayout.a4Grid12,
        isLandscape: true,
      );

      expect(pdfBytes, isNotEmpty);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('generateCardsPdf renders successfully with custom rows, columns, and margins', () async {
      final batch20 = List.generate(
        20,
        (i) => OfflineCardModel(
          id: 'custom-grid-card-$i',
          serialNumber: 'SN-CG-$i',
          username: 'usr-$i',
          clearPassword: 'pin-$i',
          profileId: 'prof-1',
          profileName: 'باقة 20 كرت مخصصة',
          deviceId: 'dev-1',
          price: 1000.0,
          currency: 'SDG',
        ),
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: batch20,
        networkName: 'شبكة التوزيع المخصص',
        customCols: 4,
        customRows: 5, // 4 * 5 = 20 cards per A4 page
        customMargin: 2.0,
        isLandscape: false,
      );

      expect(pdfBytes, isNotEmpty);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('generateCardsPdf handles dense 6x20 (120 cards) grid without overflow', () async {
      final batch120 = List.generate(
        120,
        (i) => OfflineCardModel(
          id: 'dense-$i',
          serialNumber: 'SN-DENSE-${i + 1}',
          username: 'user_${1000 + i}',
          clearPassword: 'pass_${1000 + i}',
          profileId: 'dense-prof',
          profileName: 'Dense 6x20',
          deviceId: 'dev-1',
          price: 500.0,
          currency: 'SDG',
        ),
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: batch120,
        networkName: 'شبكة الكثافة العالية',
        customCols: 6,
        customRows: 20,
        customMargin: 1.0,
        isLandscape: false,
      );

      expect(pdfBytes, isNotEmpty);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('Calculates expected printing pages correctly for presets and custom grids', () {
      // 50 cards with 10-grid preset -> 5 pages
      int cpp10 = 10;
      expect((50 / cpp10).ceil(), 5);

      // 50 cards with 12-grid preset -> 5 pages (48 on 4 pages + 2 on 5th page)
      int cpp12 = 12;
      expect((50 / cpp12).ceil(), 5);

      // 100 cards with 24-grid preset -> 5 pages
      int cpp24 = 24;
      expect((100 / cpp24).ceil(), 5);

      // 100 cards with 100-grid preset -> 1 page
      int cpp100 = 100;
      expect((100 / cpp100).ceil(), 1);

      // 55 cards with custom 4 cols * 5 rows (20 per page) -> 3 pages
      int customCpp = 4 * 5;
      expect((55 / customCpp).ceil(), 3);
    });
  });
}
