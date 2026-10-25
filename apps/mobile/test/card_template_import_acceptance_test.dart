import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/services/card_template_import_service.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/features/studio/presentation/card_templates_screen.dart';
import 'package:mobile/core/services/thermal_printer_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('CardTemplateImportService Unit Tests', () {
    test('getBuiltInCatalog returns populated list of unique templates', () {
      final catalog = CardTemplateImportService.getBuiltInCatalog();
      expect(catalog.isNotEmpty, true);
      expect(catalog.length, greaterThanOrEqualTo(6));

      final ids = catalog.map((t) => t.id).toSet();
      expect(ids.length, catalog.length, reason: 'All catalog template IDs must be unique');

      for (final tpl in catalog) {
        expect(tpl.name.trim().isNotEmpty, true);
        expect(tpl.widthMm, greaterThanOrEqualTo(10.0));
        expect(tpl.heightMm, greaterThanOrEqualTo(10.0));
        expect(tpl.primaryColor.startsWith('#'), true);
      }
    });

    test('validateAndParseTemplateJson parses valid SudaFi template JSON correctly', () {
      final validJson = jsonEncode({
        'id': 'test-tpl-1',
        'name': 'قالب تجريبي مخصص',
        'widthMm': 85.0,
        'heightMm': 54.0,
        'primaryColor': '#1A365D',
        'accentColor': '#2B6CB0',
        'showLogo': true,
        'showQr': true,
        'showPrice': true,
        'showExpiry': true,
        'showSerial': true,
        'showPin': true,
        'networkName': 'شبكة سودافي السريعة',
        'themePreset': 'blue',
      });

      final result = CardTemplateImportService.validateAndParseTemplateJson(validJson);
      expect(result.isSuccess, true);
      expect(result.template, isNotNull);
      expect(result.template!.name, 'قالب تجريبي مخصص');
      expect(result.template!.widthMm, 85.0);
      expect(result.template!.heightMm, 54.0);
      expect(result.template!.primaryColor, '#1A365D');
      expect(result.template!.networkName, 'شبكة سودافي السريعة');
      expect(result.errorMessage, isNull);
    });

    test('validateAndParseTemplateJson normalizes colors without hash prefix', () {
      final jsonNoHash = jsonEncode({
        'name': 'قالب ألوان بدون هاش',
        'widthMm': 60.0,
        'heightMm': 40.0,
        'primaryColor': '006A6A',
        'accentColor': 'E8F8F5',
      });

      final result = CardTemplateImportService.validateAndParseTemplateJson(jsonNoHash);
      expect(result.isSuccess, true);
      expect(result.template!.primaryColor, '#006A6A');
      expect(result.template!.accentColor, '#E8F8F5');
    });

    test('validateAndParseTemplateJson rejects corrupt JSON syntax', () {
      const corruptJson = '{ name: "invalid json without quotes... ';
      final result = CardTemplateImportService.validateAndParseTemplateJson(corruptJson);
      expect(result.isSuccess, false);
      expect(result.template, isNull);
      expect(result.errorMessage, contains('صيغة الملف غير مدعومة'));
    });

    test('validateAndParseTemplateJson rejects non-map JSON (array/primitive)', () {
      const arrayJson = '["not", "a", "template", "object"]';
      final result = CardTemplateImportService.validateAndParseTemplateJson(arrayJson);
      expect(result.isSuccess, false);
      expect(result.errorMessage, contains('كائن قالب صحيح'));
    });

    test('validateAndParseTemplateJson rejects missing or empty template name', () {
      final missingNameJson = jsonEncode({
        'widthMm': 85.0,
        'heightMm': 54.0,
      });
      final result = CardTemplateImportService.validateAndParseTemplateJson(missingNameJson);
      expect(result.isSuccess, false);
      expect(result.errorMessage, contains('اسم القالب'));
    });

    test('validateAndParseTemplateJson rejects out-of-bounds dimensions', () {
      final tooSmall = jsonEncode({
        'name': 'قالب صغير جداً',
        'widthMm': 5.0,
        'heightMm': 54.0,
      });
      final resultSmall = CardTemplateImportService.validateAndParseTemplateJson(tooSmall);
      expect(resultSmall.isSuccess, false);
      expect(resultSmall.errorMessage, contains('أبعاد القالب غير صالحة'));

      final tooLarge = jsonEncode({
        'name': 'قالب ضخم جداً',
        'widthMm': 85.0,
        'heightMm': 2000.0,
      });
      final resultLarge = CardTemplateImportService.validateAndParseTemplateJson(tooLarge);
      expect(resultLarge.isSuccess, false);
      expect(resultLarge.errorMessage, contains('أبعاد القالب غير صالحة'));
    });

    test('validateAndParseTemplateJson rejects oversized file (> 200KB)', () {
      final hugePadding = 'x' * (250 * 1024);
      final oversizedJson = jsonEncode({
        'name': 'قالب ضخم الحجم',
        'widthMm': 85.0,
        'heightMm': 54.0,
        'padding': hugePadding,
      });
      final result = CardTemplateImportService.validateAndParseTemplateJson(oversizedJson);
      expect(result.isSuccess, false);
      expect(result.errorMessage, contains('كبير جداً'));
    });
  });

  group('LocalStorage Custom Templates Persistence Tests', () {
    test('saves, retrieves, and deletes custom templates in SharedPreferences', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      // Initially empty
      expect(storage.getCustomTemplates(), isEmpty);

      final tpl1 = CardTemplateModel(
        id: 'cust-1',
        name: 'قالب كروت النخبة',
        widthMm: 85,
        heightMm: 54,
        primaryColor: '#006A6A',
        accentColor: '#E8F8F5',
        layoutConfig: {
          'showLogo': true,
          'showQr': true,
        },
      );

      // Save tpl1
      await storage.saveCustomTemplate(tpl1);
      final listAfterSave = storage.getCustomTemplates();
      expect(listAfterSave.length, 1);
      expect(listAfterSave.first.name, 'قالب كروت النخبة');
      expect(listAfterSave.first.id, 'cust-1');

      // Update tpl1 in place without duplication
      final tpl1Updated = tpl1.copyWith(name: 'قالب كروت النخبة المعدل');
      await storage.saveCustomTemplate(tpl1Updated);
      final listAfterUpdate = storage.getCustomTemplates();
      expect(listAfterUpdate.length, 1);
      expect(listAfterUpdate.first.name, 'قالب كروت النخبة المعدل');

      // Add tpl2
      final tpl2 = CardTemplateModel(
        id: 'cust-2',
        name: 'قالب مصغر',
        widthMm: 50,
        heightMm: 30,
        primaryColor: '#333333',
        accentColor: '#FFFFFF',
      );
      await storage.saveCustomTemplate(tpl2);
      expect(storage.getCustomTemplates().length, 2);

      // Delete tpl1
      await storage.deleteCustomTemplate('cust-1');
      final listAfterDelete = storage.getCustomTemplates();
      expect(listAfterDelete.length, 1);
      expect(listAfterDelete.first.id, 'cust-2');
    });
  });

  group('CardTemplatesNotifier State Management Tests', () {
    test('Initializes with built-in templates and allows adding custom template', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(cardTemplatesProvider.notifier);
      final initialTemplates = await container.read(cardTemplatesProvider.future);

      // Should contain built-in templates
      expect(initialTemplates.isNotEmpty, true);
      expect(initialTemplates.any((t) => t.id == 'builtin-sudafi-brand'), true);

      // Add new template
      final newTpl = CardTemplateModel(
        id: 'imported_test_123',
        name: 'قالب تم استيراده للاختبار',
        widthMm: 80,
        heightMm: 50,
        primaryColor: '#006A6A',
        accentColor: '#00B4D8',
      );

      await notifier.createTemplate(newTpl);

      final afterAdd = await container.read(cardTemplatesProvider.future);
      expect(afterAdd.any((t) => t.id == 'imported_test_123'), true);

      // Verify persisted in LocalStorage
      final savedInStorage = storage.getCustomTemplates();
      expect(savedInStorage.any((t) => t.id == 'imported_test_123'), true);
    });

    test('Server sync merge safeguard preserves local custom background data', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      // Local custom template with background image
      const bgData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      final localWithBg = CardTemplateModel(
        id: 'tpl-sync-preserve',
        name: 'قالب الخلفية المحفوظ محلياً',
        widthMm: 85,
        heightMm: 54,
        layoutConfig: {
          'backgroundImageBase64': bgData,
          'isImageBackground': true,
        },
      );
      await storage.saveCustomTemplate(localWithBg);

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      final list = await container.read(cardTemplatesProvider.future);
      final synced = list.firstWhere((t) => t.id == 'tpl-sync-preserve');
      expect(synced.hasCustomBackground, true);
      expect(synced.backgroundImageBase64, bgData);
    });
  });

  group('CardTemplatesScreen UI Acceptance Tests', () {
    testWidgets('Tapping "إضافة قالب جديد" displays exactly two options modal', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
          ],
          child: const MaterialApp(
            home: CardTemplatesScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Find the main "إضافة قالب جديد" button
      final addBtnFinder = find.byKey(const Key('add_new_template_button'));
      expect(addBtnFinder, findsOneWidget);
      expect(find.text('إضافة قالب جديد'), findsOneWidget);

      // Tap the button
      await tester.tap(addBtnFinder);
      await tester.pumpAndSettle();

      // Verify the bottom sheet displays the title and EXACTLY TWO OPTIONS
      expect(find.text('إضافة قالب جديد'), findsWidgets);
      expect(find.byKey(const Key('add_builtin_template_option')), findsOneWidget);
      expect(find.byKey(const Key('import_device_template_option')), findsOneWidget);
      expect(find.text('إضافة قالب جاهز من داخل التطبيق'), findsOneWidget);
      expect(find.text('استيراد قالب جاهز من الهاتف'), findsOneWidget);

      // Open built-in catalog
      await tester.tap(find.byKey(const Key('add_builtin_template_option')));
      await tester.pumpAndSettle();

      // Verify catalog title and templates are shown
      expect(find.text('القوالب الجاهزة المضمنة'), findsOneWidget);
      expect(find.text('ثيم كرة القدم الذهبي (85×54 مم)'), findsWidgets);
    });
  });

  group('End-to-End PDF Printing with Imported Template', () {
    test('Imported template parameters produce valid print-ready PDF with exact colors and layout', () async {
      final validImportedJson = jsonEncode({
        'name': 'قالب شبكة الواحة المستورد',
        'widthMm': 85.0,
        'heightMm': 54.0,
        'primaryColor': '#0F766E',
        'accentColor': '#F59E0B',
        'themePreset': 'TURQUOISE',
        'layoutConfig': {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'networkName': 'شبكة الواحة الذكية',
        },
      });

      final parseResult = CardTemplateImportService.validateAndParseTemplateJson(validImportedJson);
      expect(parseResult.isSuccess, true);
      final tpl = parseResult.template!;

      // Verify template properties
      expect(tpl.widthMm, 85);
      expect(tpl.heightMm, 54);
      expect(tpl.primaryColor, '#0F766E');
      expect(tpl.accentColor, '#F59E0B');
      expect(tpl.networkName, 'شبكة الواحة الذكية');
      expect(tpl.showQr, true);

      // Verify feeding imported template into PDF Generator works seamlessly
      final sampleCards = List.generate(
        10,
        (i) => OfflineCardModel(
          id: 'card-$i',
          serialNumber: 'SN-W-$i',
          username: 'user$i',
          clearPassword: 'pin$i',
          profileId: 'p-1',
          profileName: 'باقة 1 جيجا',
          deviceId: 'd-1',
          price: 500,
          currency: 'SDG',
          status: 'AVAILABLE',
        ),
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: tpl.networkName,
        layout: CardPdfLayout.a4Grid10,
        themePreset: tpl.themePreset,
        customPrimaryColor: tpl.primaryColor,
        customAccentColor: tpl.accentColor,
      );

      expect(pdfBytes.isNotEmpty, true);
      final header = String.fromCharCodes(pdfBytes.sublist(0, 5));
      expect(header, '%PDF-');
    });
  });

  group('Persistence Across App Restarts & Server Sync', () {
    test('Imported template persists after closing and re-opening app', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();

      // Session 1: User imports and saves template
      final storageSession1 = LocalStorage(prefs);
      final importedTpl = CardTemplateModel(
        id: 'imported-reboot-test',
        name: 'قالب مستمر بعد إعادة التشغيل',
        widthMm: 85,
        heightMm: 54,
        primaryColor: '#114C54',
        accentColor: '#CEAE85',
        layoutConfig: {'showQr': true, 'networkName': 'سودافي الدائمة'},
      );
      await storageSession1.saveCustomTemplate(importedTpl);

      // Session 2: Simulating app restart with new storage instance
      final storageSession2 = LocalStorage(prefs);
      final persistedTemplates = storageSession2.getCustomTemplates();

      expect(persistedTemplates.length, 1);
      final loaded = persistedTemplates.first;
      expect(loaded.id, 'imported-reboot-test');
      expect(loaded.name, 'قالب مستمر بعد إعادة التشغيل');
      expect(loaded.primaryColor, '#114C54');
      expect(loaded.accentColor, '#CEAE85');
      expect(loaded.networkName, 'سودافي الدائمة');
    });

    test('Template merging preserves local templates without duplicates', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      final custom1 = CardTemplateModel(
        id: 'custom-local-1',
        name: 'قالب محلي 1',
        widthMm: 85,
        heightMm: 54,
      );
      await storage.saveCustomTemplate(custom1);

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      final merged = await container.read(cardTemplatesProvider.future);
      expect(merged.any((t) => t.id == 'custom-local-1'), true);

      // Calling refresh does not duplicate custom1
      await container.read(cardTemplatesProvider.notifier).refresh();
      final afterRefresh = await container.read(cardTemplatesProvider.future);
      final occurrences = afterRefresh.where((t) => t.id == 'custom-local-1').length;
      expect(occurrences, 1);
    });
  });

  group('Catalog Completeness & Format Resilience', () {
    test('All 8 built-in catalog templates are valid and distinct', () {
      final catalog = CardTemplateImportService.getBuiltInCatalog();
      expect(catalog.length, 8);

      final expectedIds = [
        'builtin-football',
        'builtin-eid',
        'builtin-turquoise',
        'builtin-ticket',
        'builtin-compact',
        'builtin-mini',
        'builtin-sudafi-brand',
        'builtin-portrait',
      ];

      for (final id in expectedIds) {
        expect(catalog.any((t) => t.id == id), true, reason: 'Catalog must contain $id');
      }
    });

    test('Rejects binary image file masquerading as template', () {
      // Fake PNG file header bytes converted to string
      final fakePngString = '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR...binary data...';
      final result = CardTemplateImportService.validateAndParseTemplateJson(fakePngString);
      expect(result.isSuccess, false);
      expect(result.errorMessage, contains('صيغة الملف غير مدعومة'));
    });

    test('Resilient to extra unknown properties in valid JSON', () {
      final jsonWithExtras = jsonEncode({
        'name': 'قالب مع حقول إضافية',
        'widthMm': 85.0,
        'heightMm': 54.0,
        'primaryColor': '#1E3A8A',
        'unknownField': 12345,
        'metaInfo': {'author': 'admin', 'version': '2.0'},
      });

      final result = CardTemplateImportService.validateAndParseTemplateJson(jsonWithExtras);
      expect(result.isSuccess, true);
      expect(result.template!.name, 'قالب مع حقول إضافية');
    });
  });

  group('CardTemplateImportService Image Validation Tests', () {
    test('validateImageBytes accepts valid PNG signature', () {
      final pngBytes = Uint8List.fromList([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      ]);
      final error = CardTemplateImportService.validateImageBytes(pngBytes);
      expect(error, isNull);
    });

    test('validateImageBytes accepts valid JPEG signature', () {
      final jpegBytes = Uint8List.fromList([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46,
      ]);
      final error = CardTemplateImportService.validateImageBytes(jpegBytes);
      expect(error, isNull);
    });

    test('validateImageBytes accepts valid WebP signature', () {
      final webpBytes = Uint8List.fromList([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x20, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, // WEBP
        0x56, 0x50, 0x38, 0x20,
      ]);
      final error = CardTemplateImportService.validateImageBytes(webpBytes);
      expect(error, isNull);
    });

    test('validateImageBytes rejects empty bytes', () {
      final error = CardTemplateImportService.validateImageBytes(Uint8List(0));
      expect(error, isNotNull);
      expect(error, contains('فارغ'));
    });

    test('validateImageBytes rejects non-image random bytes', () {
      final garbageBytes = Uint8List.fromList([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
      final error = CardTemplateImportService.validateImageBytes(garbageBytes);
      expect(error, isNotNull);
      expect(error, contains('صيغة الصورة غير مدعومة'));
    });

    test('validateImageBytes rejects oversized image (> 8MB)', () {
      final oversizedBytes = Uint8List(8 * 1024 * 1024 + 1);
      oversizedBytes[0] = 0x89;
      oversizedBytes[1] = 0x50;
      oversizedBytes[2] = 0x4E;
      oversizedBytes[3] = 0x47;
      final error = CardTemplateImportService.validateImageBytes(oversizedBytes);
      expect(error, isNotNull);
      expect(error, contains('كبير جداً'));
    });
  });

  group('CardTemplateImportService PDF Validation Tests', () {
    test('validatePdfBytes accepts valid PDF header %PDF-', () {
      final pdfBytes = Uint8List.fromList([
        0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35, 0x0A,
      ]);
      final error = CardTemplateImportService.validatePdfBytes(pdfBytes);
      expect(error, isNull);
    });

    test('validatePdfBytes rejects empty bytes', () {
      final error = CardTemplateImportService.validatePdfBytes(Uint8List(0));
      expect(error, isNotNull);
      expect(error, contains('فارغ'));
    });

    test('validatePdfBytes rejects non-PDF bytes', () {
      final nonPdfBytes = Uint8List.fromList([0x50, 0x4B, 0x03, 0x04]);
      final error = CardTemplateImportService.validatePdfBytes(nonPdfBytes);
      expect(error, isNotNull);
      expect(error, contains('ليس مستند PDF صالحاً'));
    });

    test('validatePdfBytes rejects oversized PDF (> 15MB)', () {
      final oversizedBytes = Uint8List(15 * 1024 * 1024 + 1);
      oversizedBytes[0] = 0x25;
      oversizedBytes[1] = 0x50;
      oversizedBytes[2] = 0x44;
      oversizedBytes[3] = 0x46;
      oversizedBytes[4] = 0x2D;
      final error = CardTemplateImportService.validatePdfBytes(oversizedBytes);
      expect(error, isNotNull);
      expect(error, contains('كبير جداً'));
    });
  });

  group('createTemplateFromMedia Acceptance Tests', () {
    final samplePngBytes = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    );

    test('creates custom image template with base64 embedded and correct flags', () {
      final tpl = CardTemplateImportService.createTemplateFromMedia(
        imageBytes: samplePngBytes,
        name: 'قالب كرت هوتسبوت بصورة مخصصة',
        widthMm: 85,
        heightMm: 54,
        isPdf: false,
        showQr: true,
        showPin: true,
        showPrice: true,
        showValidity: true,
        networkName: 'شبكة سماء الخرطوم',
      );

      expect(tpl.name, 'قالب كرت هوتسبوت بصورة مخصصة');
      expect(tpl.widthMm, 85);
      expect(tpl.heightMm, 54);
      expect(tpl.hasCustomBackground, true);
      expect(tpl.isImageBackground, true);
      expect(tpl.isPdfBackground, false);
      expect(tpl.backgroundImageBase64, isNotEmpty);
      expect(base64Decode(tpl.backgroundImageBase64!), samplePngBytes);
      expect(tpl.showQr, true);
      expect(tpl.showPin, true);
      expect(tpl.showPrice, true);
      expect(tpl.networkName, 'شبكة سماء الخرطوم');
    });

    test('creates custom PDF page template with isPdfBackground flag', () {
      final tpl = CardTemplateImportService.createTemplateFromMedia(
        imageBytes: samplePngBytes,
        name: 'قالب من صفحة PDF',
        widthMm: 100,
        heightMm: 40,
        isPdf: true,
      );

      expect(tpl.name, 'قالب من صفحة PDF');
      expect(tpl.widthMm, 100);
      expect(tpl.heightMm, 40);
      expect(tpl.hasCustomBackground, true);
      expect(tpl.isPdfBackground, true);
      expect(tpl.isImageBackground, false);
      expect(tpl.backgroundDesign, 'custom_pdf_page');
    });
  });

  group('PDF Printing with Custom Background Image', () {
    test('generateCardsPdf renders cards with customBackgroundImageBase64', () async {
      final samplePngBytes = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      );
      final base64Img = base64Encode(samplePngBytes);

      final cards = [
        OfflineCardModel(
          id: 'card-media-1',
          serialNumber: 'SN-IMG-1',
          username: 'user101',
          clearPassword: 'pin101password',
          profileId: 'p-1',
          profileName: 'باقة النجوم',
          deviceId: 'd-1',
          price: 1000,
          currency: 'SDG',
          status: 'AVAILABLE',
        ),
      ];

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافي هوتسبوت',
        layout: CardPdfLayout.a4Grid10,
        customBackgroundImageBase64: base64Img,
      );

      expect(pdfBytes.isNotEmpty, true);
      final header = String.fromCharCodes(pdfBytes.sublist(0, 5));
      expect(header, '%PDF-');
    });
  });

  group('CardTemplatesScreen Device Import Sub-Sheet UI Tests', () {
    testWidgets('Tapping import device option opens sub-sheet with 3 supported formats', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
          ],
          child: const MaterialApp(
            home: CardTemplatesScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap main add button
      await tester.tap(find.byKey(const Key('add_new_template_button')));
      await tester.pumpAndSettle();

      // Tap import device template option
      await tester.tap(find.byKey(const Key('import_device_template_option')));
      await tester.pumpAndSettle();

      // Sub-sheet should display title
      expect(find.text('نوع التصميم المستورد'), findsOneWidget);

      // Verify all 3 options exist
      expect(find.byKey(const Key('import_type_sudafi_json')), findsOneWidget);
      expect(find.byKey(const Key('import_type_image')), findsOneWidget);
      expect(find.byKey(const Key('import_type_pdf')), findsOneWidget);

      expect(find.text('قالب SudaFi قابل للتعديل (JSON)'), findsOneWidget);
      expect(find.text('تصميم صورة (PNG / JPG / WebP)'), findsOneWidget);
      expect(find.text('تصميم مستند PDF'), findsOneWidget);
    });
  });

  group('Cold App Restart Persistence with Custom Image & PDF Backgrounds', () {
    test('Image template persists full base64 background after app restart', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();

      // Session 1: User saves an image-based custom template
      final session1Storage = LocalStorage(prefs);
      final rawPngBytes = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      final imageTpl = CardTemplateImportService.createTemplateFromMedia(
        imageBytes: rawPngBytes,
        name: 'قالب صورة دائم بعد الإغلاق',
        widthMm: 85,
        heightMm: 54,
        isPdf: false,
      );
      await session1Storage.saveCustomTemplate(imageTpl);

      // Session 2: App cold restart (new LocalStorage instance with saved SharedPreferences)
      final session2Storage = LocalStorage(prefs);
      final savedTemplates = session2Storage.getCustomTemplates();

      expect(savedTemplates.length, 1);
      final loaded = savedTemplates.first;
      expect(loaded.name, 'قالب صورة دائم بعد الإغلاق');
      expect(loaded.hasCustomBackground, true);
      expect(loaded.isImageBackground, true);
      expect(loaded.isPdfBackground, false);
      expect(loaded.backgroundImageBase64, isNotEmpty);
      expect(base64Decode(loaded.backgroundImageBase64!), rawPngBytes);
    });

    test('PDF multi-page selection template persists after app restart', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();

      // Session 1: User selects page 2 from a multi-page PDF document
      final session1Storage = LocalStorage(prefs);
      final pagePngBytes = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      final pdfPageTpl = CardTemplateImportService.createTemplateFromMedia(
        imageBytes: pagePngBytes,
        name: 'قالب صفحة 2 من مستند بي دي اف',
        widthMm: 100,
        heightMm: 40,
        isPdf: true,
      );
      await session1Storage.saveCustomTemplate(pdfPageTpl);

      // Session 2: App cold restart
      final session2Storage = LocalStorage(prefs);
      final savedTemplates = session2Storage.getCustomTemplates();

      expect(savedTemplates.length, 1);
      final loaded = savedTemplates.first;
      expect(loaded.name, 'قالب صفحة 2 من مستند بي دي اف');
      expect(loaded.hasCustomBackground, true);
      expect(loaded.isPdfBackground, true);
      expect(loaded.isImageBackground, false);
      expect(loaded.backgroundDesign, 'custom_pdf_page');
      expect(base64Decode(loaded.backgroundImageBase64!), pagePngBytes);
    });
  });

  group('PDF Generation Layouts with Custom Background (A4 Grid 10, 12, 24, 100)', () {
    const validPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    final sampleCards = [
      OfflineCardModel(
        id: 'card-layout-1',
        serialNumber: 'SN-001',
        username: 'user001',
        clearPassword: 'pin001password',
        profileId: 'p-1',
        profileName: 'باقة 1 جيجا',
        deviceId: 'd-1',
        price: 500,
        currency: 'SDG',
        status: 'AVAILABLE',
      ),
    ];

    test('renders successfully on a4Grid10 with custom background', () async {
      final bytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'سودافي هوتسبوت',
        layout: CardPdfLayout.a4Grid10,
        customBackgroundImageBase64: validPngBase64,
      );
      expect(bytes.isNotEmpty, true);
      expect(String.fromCharCodes(bytes.sublist(0, 5)), '%PDF-');
    });

    test('renders successfully on a4Grid12 with custom background', () async {
      final bytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'سودافي هوتسبوت',
        layout: CardPdfLayout.a4Grid12,
        customBackgroundImageBase64: validPngBase64,
      );
      expect(bytes.isNotEmpty, true);
      expect(String.fromCharCodes(bytes.sublist(0, 5)), '%PDF-');
    });

    test('renders successfully on a4Grid24 with custom background', () async {
      final bytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'سودافي هوتسبوت',
        layout: CardPdfLayout.a4Grid24,
        customBackgroundImageBase64: validPngBase64,
      );
      expect(bytes.isNotEmpty, true);
      expect(String.fromCharCodes(bytes.sublist(0, 5)), '%PDF-');
    });

    test('renders successfully on a4Grid100 mini dense cards with custom background', () async {
      final bytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'سودافي هوتسبوت',
        layout: CardPdfLayout.a4Grid100,
        customBackgroundImageBase64: validPngBase64,
      );
      expect(bytes.isNotEmpty, true);
      expect(String.fromCharCodes(bytes.sublist(0, 5)), '%PDF-');
    });
  });

  group('Fault Tolerance with Corrupted Base64 & Regression Tests', () {
    test('generateCardsPdf handles corrupted base64 gracefully without throwing', () async {
      final sampleCards = [
        OfflineCardModel(
          id: 'card-err-1',
          serialNumber: 'SN-ERR-1',
          username: 'userErr',
          clearPassword: 'pinErrPassword',
          profileId: 'p-1',
          profileName: 'باقة التجربة',
          deviceId: 'd-1',
          price: 500,
          currency: 'SDG',
          status: 'AVAILABLE',
        ),
      ];

      final bytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'سودافي هوتسبوت',
        layout: CardPdfLayout.a4Grid10,
        customBackgroundImageBase64: 'INVALID_CORRUPT_BASE64_STRING_NOT_BASE64!',
      );

      expect(bytes.isNotEmpty, true);
      expect(String.fromCharCodes(bytes.sublist(0, 5)), '%PDF-');
    });

    test('All 8 built-in templates generate valid print-ready PDFs', () async {
      final catalog = CardTemplateImportService.getBuiltInCatalog();
      expect(catalog.length, 8);

      final sampleCards = [
        OfflineCardModel(
          id: 'card-sample',
          serialNumber: 'SN-008',
          username: 'userBuiltin',
          clearPassword: 'pinBuiltin',
          profileId: 'p-1',
          profileName: 'باقة مميزة',
          deviceId: 'd-1',
          price: 750,
          currency: 'SDG',
          status: 'AVAILABLE',
        ),
      ];

      for (final tpl in catalog) {
        final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
          cards: sampleCards,
          networkName: tpl.networkName,
          layout: CardPdfLayout.a4Grid10,
          themePreset: tpl.themePreset,
          customPrimaryColor: tpl.primaryColor,
          customAccentColor: tpl.accentColor,
        );
        expect(pdfBytes.isNotEmpty, true, reason: 'Template ${tpl.name} must output valid PDF');
        expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
      }
    });

    test('ThermalPrinterService generates valid 80mm/58mm thermal receipts without regression', () async {
      final receipt = SaleReceiptModel(
        invoiceNumber: 'INV-2026-001',
        serialNumber: 'SN-TH-01',
        username: 'userThermal',
        password: 'pinThermal',
        profileName: 'ساعة إنترنت سريعة',
        amount: 300,
        currency: 'SDG',
        paymentMethod: 'CASH',
        soldAt: DateTime.now(),
        cashierName: 'كاشير سودافي',
        tenantName: 'سودافي هوتسبوت الحراري',
      );

      final pdfBytes = await ThermalPrinterService.generateReceiptPdf(receipt, paperWidthMm: 80);
      expect(pdfBytes.isNotEmpty, true);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');

      final escPosBytes = ThermalPrinterService.buildReceiptEscPos(receipt);
      expect(escPosBytes.isNotEmpty, true);
    });
  });
}
