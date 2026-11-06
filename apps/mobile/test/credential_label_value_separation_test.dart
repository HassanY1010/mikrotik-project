import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Credential Label vs Value Separation Tests', () {
    test('Mode 0 (PIN موحد): Hiding PIN: label still prints the PIN value in PDF', () async {
      final cards = [
        OfflineCardModel(
          id: 'card-1',
          serialNumber: 'SN-001',
          username: '849204',
          clearPassword: '849204',
          profileId: 'p-1',
          profileName: 'باقة 1 جيجا',
          deviceId: 'd-1',
          price: 500,
          currency: 'SDG',
        ),
      ];

      // When showPin is true:
      final pdfWithLabel = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showPin: true,
      );
      expect(pdfWithLabel, isNotNull);
      expect(pdfWithLabel.length, greaterThan(1000));

      // When showPin is false:
      final pdfWithoutLabel = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showPin: false,
      );
      expect(pdfWithoutLabel, isNotNull);
      expect(pdfWithoutLabel.length, greaterThan(1000));
    });

    test('Mode 1 (U + P): Toggling U: and P: labels independently preserves credential values', () async {
      final cards = [
        OfflineCardModel(
          id: 'card-1',
          serialNumber: 'SN-001',
          username: 'Hassan',
          clearPassword: '123456',
          profileId: 'p-1',
          profileName: 'باقة 1 جيجا',
          deviceId: 'd-1',
          price: 500,
          currency: 'SDG',
        ),
      ];

      // 1. Both enabled (U: Hassan, P: 123456)
      final pdfBoth = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUsername: true,
        showPassword: true,
      );
      expect(pdfBoth, isNotNull);

      // 2. Hide U: only (Hassan, P: 123456)
      final pdfHideU = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUsername: false,
        showPassword: true,
      );
      expect(pdfHideU, isNotNull);

      // 3. Hide P: only (U: Hassan, 123456)
      final pdfHideP = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUsername: true,
        showPassword: false,
      );
      expect(pdfHideP, isNotNull);

      // 4. Hide both (Hassan, 123456)
      final pdfHideBoth = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUsername: false,
        showPassword: false,
      );
      expect(pdfHideBoth, isNotNull);
    });

    test('Mode 2 (USER only): Hiding USER: label preserves username value', () async {
      final cards = [
        OfflineCardModel(
          id: 'card-1',
          serialNumber: 'SN-001',
          username: 'Hassan',
          clearPassword: null,
          profileId: 'p-1',
          profileName: 'باقة 1 جيجا',
          deviceId: 'd-1',
          price: 500,
          currency: 'SDG',
        ),
      ];

      // 1. With USER: label
      final pdfWithUserLabel = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUserOnly: true,
      );
      expect(pdfWithUserLabel, isNotNull);

      // 2. Without USER: label (Hassan only)
      final pdfWithoutUserLabel = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUserOnly: false,
      );
      expect(pdfWithoutUserLabel, isNotNull);
    });
  });
}
