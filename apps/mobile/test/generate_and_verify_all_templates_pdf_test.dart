import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';
import 'package:mobile/core/services/card_template_import_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('Generate and verify physical PDF files for all 8 distinct templates', () async {
    final catalog = CardTemplateImportService.getBuiltInCatalog();
    final outDir = Directory('test_output_templates');
    if (!outDir.existsSync()) {
      outDir.createSync(recursive: true);
    }

    final testCards = List.generate(
      10,
      (i) => OfflineCardModel(
        id: 'card-$i',
        serialNumber: 'SN-2026-${(i + 1).toString().padLeft(4, "0")}',
        username: 'USER${1000 + i}',
        clearPassword: 'PASS${2000 + i}',
        profileId: 'prof-test',
        profileName: 'باقة 1 جيجا فائق السرعة',
        deviceId: 'dev-1',
        price: 500,
        currency: 'SDG',
      ),
    );

    final Map<String, int> fileSizes = {};

    for (final tpl in catalog) {
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: testCards,
        networkName: tpl.layoutConfig['networkName'] as String? ?? 'سودافاي | SudaFi Net',
        supportPhone: tpl.layoutConfig['supportPhone'] as String? ?? '0912345678',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'BATCH-VERIFY-${tpl.id}',
        template: tpl,
        elementsLayout: tpl.elementsLayout,
        themePreset: tpl.themePreset,
        customPrimaryColor: tpl.primaryColor,
        customAccentColor: tpl.accentColor,
      );

      final filePath = '${outDir.path}/${tpl.id}.pdf';
      final file = File(filePath);
      file.writeAsBytesSync(pdfBytes);

      expect(file.existsSync(), isTrue);
      expect(file.lengthSync(), greaterThan(2000));
      fileSizes[tpl.id] = file.lengthSync();

      // ignore: avoid_print
      print('Verified template ${tpl.name} [${tpl.themePreset}]: ${file.lengthSync()} bytes -> $filePath');
    }

    // Verify all 8 primary styles have been generated
    expect(fileSizes.containsKey('builtin-geometric'), isTrue);
    expect(fileSizes.containsKey('builtin-modern'), isTrue);
    expect(fileSizes.containsKey('builtin-corporate-isp'), isTrue);
    expect(fileSizes.containsKey('builtin-minimalist'), isTrue);
    expect(fileSizes.containsKey('builtin-tech-circuit'), isTrue);
    expect(fileSizes.containsKey('builtin-luxury-royal'), isTrue);
    expect(fileSizes.containsKey('builtin-creative-split'), isTrue);
    expect(fileSizes.containsKey('builtin-sudafi-brand'), isTrue);
  });
}

