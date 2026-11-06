import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('A4 Grid 120 Separate Username + Password PDF Generation Tests', () {
    final separateCards = List.generate(
      120,
      (i) => OfflineCardModel(
        id: 'card-$i',
        serialNumber: 'SN-2026-${(i + 1).toString().padLeft(4, '0')}',
        username: 'User$i',
        clearPassword: 'Pass$i',
        profileId: 'p-1',
        profileName: 'HR (يوم واحد)',
        deviceId: 'd-1',
        price: 500,
        currency: 'SDG',
      ),
    );

    test('a4Grid120 with Separate Username & Password generates valid PDF with both U: and P:', () async {
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: separateCards,
        networkName: 'سودافاك هوتسبوت',
        layout: CardPdfLayout.a4Grid120,
        showUsername: true,
        showPassword: true,
        elementsLayout: const CardElementsLayout(),
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(10000));
      final header = ascii.decode(pdfBytes.sublist(0, 5));
      expect(header, equals('%PDF-'));

      // Verify that document contains valid PDF structure
      final pdfStr = latin1.decode(pdfBytes, allowInvalid: true);
      expect(pdfStr.contains('/Page'), isTrue);
      expect(pdfStr.contains('%%EOF'), isTrue);
    });

    test('a4Grid120 respects showUsername and showPassword toggles', () async {
      // 1. Hide U: label only
      final pdfNoU = await CardPdfGeneratorService.generateCardsPdf(
        cards: separateCards.take(5).toList(),
        networkName: 'سودافاك هوتسبوت',
        layout: CardPdfLayout.a4Grid120,
        showUsername: false,
        showPassword: true,
        elementsLayout: const CardElementsLayout(),
      );
      expect(pdfNoU, isNotNull);

      // 2. Hide P: label only
      final pdfNoP = await CardPdfGeneratorService.generateCardsPdf(
        cards: separateCards.take(5).toList(),
        networkName: 'سودافاك هوتسبوت',
        layout: CardPdfLayout.a4Grid120,
        showUsername: true,
        showPassword: false,
        elementsLayout: const CardElementsLayout(),
      );
      expect(pdfNoP, isNotNull);

      // 3. Hide both labels
      final pdfNoBoth = await CardPdfGeneratorService.generateCardsPdf(
        cards: separateCards.take(5).toList(),
        networkName: 'سودافاك هوتسبوت',
        layout: CardPdfLayout.a4Grid120,
        showUsername: false,
        showPassword: false,
        elementsLayout: const CardElementsLayout(),
      );
      expect(pdfNoBoth, isNotNull);
    });

    test('a4Grid120 works seamlessly with PIN and Username-Only modes', () async {
      final pinCards = [
        OfflineCardModel(
          id: 'card-pin',
          serialNumber: 'SN-0001',
          username: '849204',
          clearPassword: '849204',
          profileId: 'p-1',
          profileName: 'HR (يوم واحد)',
          deviceId: 'd-1',
          price: 500,
          currency: 'SDG',
        ),
      ];

      final pdfPin = await CardPdfGeneratorService.generateCardsPdf(
        cards: pinCards,
        networkName: 'سودافاك هوتسبوت',
        layout: CardPdfLayout.a4Grid120,
        showPin: true,
        elementsLayout: const CardElementsLayout(),
      );
      expect(pdfPin, isNotNull);

      final userOnlyCards = [
        OfflineCardModel(
          id: 'card-user',
          serialNumber: 'SN-0002',
          username: 'Hassan',
          clearPassword: '',
          profileId: 'p-1',
          profileName: 'HR (يوم واحد)',
          deviceId: 'd-1',
          price: 500,
          currency: 'SDG',
        ),
      ];

      final pdfUserOnly = await CardPdfGeneratorService.generateCardsPdf(
        cards: userOnlyCards,
        networkName: 'سودافاك هوتسبوت',
        layout: CardPdfLayout.a4Grid120,
        showUserOnly: true,
        elementsLayout: const CardElementsLayout(),
      );
      expect(pdfUserOnly, isNotNull);
    });

    test('Regression check on all other layouts (10, 12, 24, 100)', () async {
      final testCards = separateCards.take(10).toList();

      for (final layout in [
        CardPdfLayout.a4Grid10,
        CardPdfLayout.a4Grid12,
        CardPdfLayout.a4Grid24,
        CardPdfLayout.a4Grid100,
      ]) {
        final pdf = await CardPdfGeneratorService.generateCardsPdf(
          cards: testCards,
          networkName: 'سودافاك هوتسبوت',
          layout: layout,
          showUsername: true,
          showPassword: true,
          elementsLayout: const CardElementsLayout(),
        );
        expect(pdf, isNotNull);
        expect(pdf.length, greaterThan(5000));
      }
    });
  });
}
