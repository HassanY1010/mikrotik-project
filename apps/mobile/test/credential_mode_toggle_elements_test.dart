import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/studio/presentation/card_studio_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SharedPreferences prefs;
  late LocalStorage storage;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    storage = LocalStorage(prefs);
  });

  List<OfflineCardModel> createTestCards(int count, {required int credentialMode}) {
    return List.generate(count, (i) {
      final idx = i + 1;
      final username = '${849200 + idx}';
      String? password;
      if (credentialMode == 0) {
        password = username; // Mode 0: PIN
      } else if (credentialMode == 1) {
        password = '${1000 + idx}'; // Mode 1: U + P
      } else {
        password = null; // Mode 2: User only
      }

      return OfflineCardModel(
        id: 'card-$idx',
        serialNumber: 'SN-2026-${idx.toString().padLeft(4, "0")}',
        username: username,
        clearPassword: password,
        profileId: 'prof-test',
        profileName: 'باقة تجريبية 500 SDG',
        deviceId: 'dev-1',
        price: 500,
        currency: 'SDG',
      );
    });
  }

  group('Dynamic Show/Hide Credential Elements in CardPdfGeneratorService', () {
    test('Mode 0 (PIN موحد): generateCardsPdf with showPin true and false', () async {
      final cards = createTestCards(10, credentialMode: 0);

      // 1. With PIN shown
      final pdfBytesWithPin = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        showPin: true,
      );
      expect(pdfBytesWithPin, isNotNull);
      expect(pdfBytesWithPin.length, greaterThan(1000));
      expect(String.fromCharCodes(pdfBytesWithPin.take(5)), equals('%PDF-'));

      // 2. With PIN hidden
      final pdfBytesWithoutPin = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي | SudaFi Net',
        showPin: false,
      );
      expect(pdfBytesWithoutPin, isNotNull);
      expect(pdfBytesWithoutPin.length, greaterThan(1000));
      expect(String.fromCharCodes(pdfBytesWithoutPin.take(5)), equals('%PDF-'));
    });

    test('Mode 1 (U + P): independent show/hide for U: and P:', () async {
      final cards = createTestCards(10, credentialMode: 1);

      // Both U and P shown
      final pdfBoth = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUsername: true,
        showPassword: true,
      );
      expect(pdfBoth, isNotNull);
      expect(String.fromCharCodes(pdfBoth.take(5)), equals('%PDF-'));

      // Only U shown (P hidden)
      final pdfUOnly = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUsername: true,
        showPassword: false,
      );
      expect(pdfUOnly, isNotNull);
      expect(String.fromCharCodes(pdfUOnly.take(5)), equals('%PDF-'));

      // Only P shown (U hidden)
      final pdfPOnly = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUsername: false,
        showPassword: true,
      );
      expect(pdfPOnly, isNotNull);
      expect(String.fromCharCodes(pdfPOnly.take(5)), equals('%PDF-'));

      // Neither shown (both hidden)
      final pdfNeither = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUsername: false,
        showPassword: false,
      );
      expect(pdfNeither, isNotNull);
      expect(String.fromCharCodes(pdfNeither.take(5)), equals('%PDF-'));
    });

    test('Mode 2 (USER only): generateCardsPdf with showUserOnly true and false', () async {
      final cards = createTestCards(10, credentialMode: 2);

      // User only shown
      final pdfUserShown = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUserOnly: true,
      );
      expect(pdfUserShown, isNotNull);
      expect(String.fromCharCodes(pdfUserShown.take(5)), equals('%PDF-'));

      // User only hidden
      final pdfUserHidden = await CardPdfGeneratorService.generateCardsPdf(
        cards: cards,
        networkName: 'سودافاي',
        showUserOnly: false,
      );
      expect(pdfUserHidden, isNotNull);
      expect(String.fromCharCodes(pdfUserHidden.take(5)), equals('%PDF-'));
    });

    test('CardTemplateModel reads showPin, showUsername, showPassword, showUserOnly from layoutConfig', () {
      final tpl = CardTemplateModel(
        id: 'test-tpl-cred',
        name: 'قالب اختبار بيانات الدخول',
        layoutConfig: {
          'showPin': false,
          'showUsername': true,
          'showPassword': false,
          'showUserOnly': true,
        },
      );

      expect(tpl.showPin, isFalse);
      expect(tpl.showUsername, isTrue);
      expect(tpl.showPassword, isFalse);
      expect(tpl.showUserOnly, isTrue);
    });
  });

  group('Studio UI Dynamic Credential Toggle Elements', () {
    testWidgets('Mode 0 (PIN): shows PIN: toggle, does not show U:, P:, or USER:', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: CardStudioScreen(),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Navigate to Tab 3 (استوديو التصميم)
      final tab3Finder = find.byIcon(Icons.palette_outlined);
      expect(tab3Finder, findsOneWidget);
      await tester.tap(tab3Finder);
      await tester.pumpAndSettle();

      // Check that 'PIN:' toggle is present in Mode 0 (default mode)
      expect(find.text('PIN:'), findsWidgets);

      // Check that 'U:', 'P:', and 'USER:' toggles are NOT present in Mode 0
      expect(find.text('U:'), findsNothing);
      expect(find.text('P:'), findsNothing);
      expect(find.text('USER:'), findsNothing);
    });

    testWidgets('Switching to Mode 1 (User + Pass) dynamically shows U: and P:, hides PIN: and USER:', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: CardStudioScreen(),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tab 1 (البيانات والكمية) is active by default. Tap Mode 1 (اسم + كلمة مرور)
      final mode1Finder = find.text('اسم + كلمة مرور');
      expect(mode1Finder, findsOneWidget);
      await tester.tap(mode1Finder);
      await tester.pumpAndSettle();

      // Navigate to Tab 3 (استوديو التصميم)
      final tab3Finder = find.byIcon(Icons.palette_outlined);
      await tester.tap(tab3Finder);
      await tester.pumpAndSettle();

      // Check that U: and P: toggles are present
      expect(find.text('U:'), findsWidgets);
      expect(find.text('P:'), findsWidgets);

      // Check that PIN: and USER: are NOT present
      expect(find.text('PIN:'), findsNothing);
      expect(find.text('USER:'), findsNothing);
    });

    testWidgets('Switching to Mode 2 (User only) dynamically shows USER:, hides PIN:, U:, and P:', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: CardStudioScreen(),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap Mode 2 (مستخدم فقط) in Tab 1
      final mode2Finder = find.text('مستخدم فقط');
      expect(mode2Finder, findsOneWidget);
      await tester.tap(mode2Finder);
      await tester.pumpAndSettle();

      // Navigate to Tab 3 (استوديو التصميم)
      final tab3Finder = find.byIcon(Icons.palette_outlined);
      await tester.tap(tab3Finder);
      await tester.pumpAndSettle();

      // Check that USER: toggle is present
      expect(find.text('USER:'), findsWidgets);

      // Check that PIN:, U:, and P: are NOT present
      expect(find.text('PIN:'), findsNothing);
      expect(find.text('U:'), findsNothing);
      expect(find.text('P:'), findsNothing);
    });
  });
}
