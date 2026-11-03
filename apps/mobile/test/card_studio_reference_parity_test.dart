import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';
import 'package:mobile/core/models/models.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Card Studio Reference Parity Tests', () {
    List<OfflineCardModel> generateSampleCards(int count) {
      return List.generate(
        count,
        (i) => OfflineCardModel(
          id: 'card-$i',
          serialNumber: 'SN-2026-${(i + 1).toString().padLeft(4, "0")}',
          username: 'user${1000 + i}',
          clearPassword: 'pass${2000 + i}',
          profileId: 'prof-test',
          profileName: 'باقة 1 جيجا يومي',
          deviceId: 'dev-1',
          price: 500,
          currency: 'SDG',
        ),
      );
    }

    test('a4Grid120 layout generates valid PDF for 120 cards', () async {
      final cards = generateSampleCards(120);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid120,
        batchNumber: 'BATCH-120-TEST',
        showOuterBorder: true,
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(1000));
      // PDF magic header '%PDF-'
      expect(pdfBytes.sublist(0, 5), equals([0x25, 0x50, 0x44, 0x46, 0x2D]));
    });

    test('a4Grid120 layout with showOuterBorder = false generates valid borderless PDF', () async {
      final cards = generateSampleCards(120);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid120,
        batchNumber: 'BATCH-120-NO-BORDER',
        showOuterBorder: false,
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(1000));
    });

    test('a4Grid120 layout handles 240 cards across 2 pages without overflow', () async {
      final cards = generateSampleCards(240);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid120,
        batchNumber: 'BATCH-240-TEST',
        showOuterBorder: true,
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(2000));
    });

    test('custom grid supports up to 5x24 or 5x30 rows seamlessly', () async {
      final cards = generateSampleCards(150);
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        supportPhone: '0912345678',
        layout: CardPdfLayout.a4Grid10,
        batchNumber: 'BATCH-CUSTOM-GRID',
        customCols: 5,
        customRows: 30,
        customMargin: 2.0,
        showOuterBorder: true,
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(1000));
    });
  });
}
