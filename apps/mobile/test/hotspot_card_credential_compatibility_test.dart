import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/studio/presentation/card_studio_screen.dart';

class _MockProfilesNotifier extends CachedProfilesNotifier {
  @override
  List<HotspotProfileModel> build() => [];

  @override
  Future<void> fetchProfiles() async {}
}

class _MockRoutersNotifier extends RoutersNotifier {
  @override
  Future<List<RouterDeviceModel>> build() async => [];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Hotspot Portal & Card Studio Credential Compatibility Tests', () {
    late LocalStorage storage;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      storage = LocalStorage(prefs);
    });

    test('LocalStorage stores and retrieves hotspot login method correctly', () async {
      expect(storage.getHotspotLoginMethod(), isNull);

      await storage.setHotspotLoginMethod('VOUCHER');
      expect(storage.getHotspotLoginMethod(), 'VOUCHER');

      await storage.setHotspotLoginMethod('USER_PASS');
      expect(storage.getHotspotLoginMethod(), 'USER_PASS');

      await storage.setHotspotLoginMethod('BOTH');
      expect(storage.getHotspotLoginMethod(), 'BOTH');
    });

    testWidgets('CardStudioScreen auto-aligns to USER_PASS when hotspot is configured for user & pass',
        (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await storage.setHotspotLoginMethod('USER_PASS');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            profilesProvider.overrideWith(() => _MockProfilesNotifier()),
            routersProvider.overrideWith(() => _MockRoutersNotifier()),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: CardStudioScreen(),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Should show compatible banner for USER_PASS
      expect(find.text('متطابق مع صفحة الهوتسبوت (اسم مستخدم وكلمة مرور)'), findsOneWidget);
      expect(
        find.text('صفحة تسجيل الدخول في الراوتر مضبوطة على استقبال اسم المستخدم وكلمة المرور.'),
        findsOneWidget,
      );
    });

    testWidgets('CardStudioScreen auto-aligns to VOUCHER when hotspot is configured for PIN only',
        (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await storage.setHotspotLoginMethod('VOUCHER');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            profilesProvider.overrideWith(() => _MockProfilesNotifier()),
            routersProvider.overrideWith(() => _MockRoutersNotifier()),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: CardStudioScreen(),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Should show compatible banner for VOUCHER
      expect(find.text('متطابق مع صفحة الهوتسبوت (رقم الكرت فقط / PIN)'), findsOneWidget);
    });

    testWidgets('CardStudioScreen shows warning when user selects Mode 1 while hotspot is VOUCHER and allows 1-tap sync',
        (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await storage.setHotspotLoginMethod('VOUCHER');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            profilesProvider.overrideWith(() => _MockProfilesNotifier()),
            routersProvider.overrideWith(() => _MockRoutersNotifier()),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: CardStudioScreen(),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Switch to Mode 1 (اسم + كلمة مرور)
      await tester.tap(find.text('اسم + كلمة مرور'));
      await tester.pumpAndSettle();

      // Mismatch warning should now be visible
      expect(find.text('تنبيه: صفحة الهوتسبوت تطلب كود الكرت فقط (PIN)!'), findsOneWidget);
      expect(find.text('تحديث صفحة الهوتسبوت لتصبح متوافقة بنقرة واحدة'), findsOneWidget);

      // Tap 1-tap sync button
      await tester.tap(find.text('تحديث صفحة الهوتسبوت لتصبح متوافقة بنقرة واحدة'));
      await tester.pumpAndSettle();

      // Local storage should now be updated to USER_PASS
      expect(storage.getHotspotLoginMethod(), 'USER_PASS');

      // Banner should update to green matched status
      expect(find.text('متطابق مع صفحة الهوتسبوت (اسم مستخدم وكلمة مرور)'), findsOneWidget);
    });

    testWidgets('CardStudioScreen shows 100% Dual Mode verified banner when hotspot is BOTH',
        (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await storage.setHotspotLoginMethod('BOTH');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            profilesProvider.overrideWith(() => _MockProfilesNotifier()),
            routersProvider.overrideWith(() => _MockRoutersNotifier()),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: CardStudioScreen(),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('متوافق 100% مع صفحة الهوتسبوت (الوضع المزدوج)'), findsOneWidget);
      expect(
        find.text('صفحة الهوتسبوت لديك تدعم كروت الـ PIN وكروت اسم المستخدم + كلمة المرور في آن واحد.'),
        findsOneWidget,
      );
    });
  });
}
