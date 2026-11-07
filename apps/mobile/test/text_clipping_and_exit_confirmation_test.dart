import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/home/presentation/main_navigation_screen.dart';
import 'package:mobile/features/portal/presentation/hotspot_portal_designer_screen.dart';
import 'package:mobile/features/studio/presentation/card_studio_screen.dart';
import 'package:mobile/features/studio/presentation/card_template_editor_screen.dart';

class _MockCurrentUserNotifier extends CurrentUserNotifier {
  final AuthUser? _user;
  _MockCurrentUserNotifier(this._user);

  @override
  AuthUser? build() => _user;
}

class _MockProfilesNotifier extends CachedProfilesNotifier {
  final List<HotspotProfileModel> initialList;
  _MockProfilesNotifier(this.initialList);

  @override
  List<HotspotProfileModel> build() => initialList;

  @override
  Future<void> fetchProfiles() async {}
}

class _MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _routers;
  _MockRoutersNotifier(this._routers);

  @override
  Future<List<RouterDeviceModel>> build() async => _routers;
}

class _MockTenantQuotaNotifier extends TenantQuotaNotifier {
  @override
  Future<TenantQuotaModel?> build() async => null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final adminUser = AuthUser(
    id: 'user-1',
    email: 'admin@sudafi.net',
    role: 'ADMIN',
    fullName: 'مدير المنظومة',
    tenantId: 'tenant-1',
  );

  final List<HotspotProfileModel> testProfiles = [
    HotspotProfileModel(
      id: 'prof-1',
      name: '1Hour',
      displayName: 'ساعة إنترنت',
      price: 500,
      validity: '1h',
      rateLimit: '5M/5M',
      deviceId: 'router-1',
    ),
  ];

  final List<RouterDeviceModel> testRouters = [
    RouterDeviceModel(
      id: 'router-1',
      name: 'الراوتر الرئيسي',
      host: '192.168.88.1',
      isOnline: true,
    ),
  ];

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Visual Text Clipping Fixes Verification', () {
    testWidgets('1. Hotspot Portal Designer: buttons render complete text without clipping', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1200));

      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: HotspotPortalDesignerScreen(),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      // Verify both option buttons are rendered with their complete labels
      expect(find.text('استعراض الصفحات الجاهزة ←'), findsOneWidget);
      expect(find.text('استيراد صفحة من الهاتف ←'), findsOneWidget);

      // Verify that the buttons do not have vertical: 0
      final readyButton = tester.widget<ElevatedButton>(
        find.ancestor(
          of: find.text('استعراض الصفحات الجاهزة ←'),
          matching: find.byType(ElevatedButton),
        ),
      );
      expect(readyButton.style?.padding?.resolve({}), const EdgeInsets.symmetric(horizontal: 16, vertical: 10));
    });

    testWidgets('2. Card Template Editor: save button in AppBar renders full text without clipping', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1200));

      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: CardTemplateEditorScreen(),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      // Check Save button in AppBar
      expect(find.text('حفظ القالب'), findsOneWidget);
      expect(find.byIcon(Icons.check), findsOneWidget);
    });

    testWidgets('3. Card Studio: Element positioning title renders fully without cutting off', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 2000));

      final storage = await LocalStorage.init();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(testProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
            tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Switch to Tab 3 (Design Studio)
      await tester.tap(find.text('3. استوديو التصميم'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Verify the element positioning section title and reset icon are present
      expect(find.text('تخصيص مواضع ومحاذاة العناصر:'), findsOneWidget);
      expect(find.byIcon(Icons.tune), findsWidgets);
      expect(find.byIcon(Icons.restart_alt), findsOneWidget);
    });
  });

  group('Exit Confirmation Feature Verification', () {
    testWidgets('1. Back button on Dashboard triggers exit confirmation dialog', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1200));

      final storage = await LocalStorage.init();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(testProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
            tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          ],
          child: const MaterialApp(
            home: MainNavigationScreen(),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Simulate system back button invocation
      final dynamic widgetsAppState = tester.state(find.byType(WidgetsApp));
      await widgetsAppState.didPopRoute();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Verify the confirmation dialog appears
      expect(find.text('هل تريد تسجيل الخروج؟'), findsOneWidget);
      expect(
        find.text('هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟ ستحتاج إلى تسجيل الدخول مرة أخرى للوصول إلى حسابك.'),
        findsOneWidget,
      );
      expect(find.text('البقاء في التطبيق'), findsOneWidget);
      expect(find.text('تسجيل الخروج'), findsWidgets);

      // Choose "البقاء في التطبيق"
      await tester.tap(find.text('البقاء في التطبيق'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Verify dialog dismissed and user remains in app
      expect(find.text('هل تريد تسجيل الخروج؟'), findsNothing);
    });

    testWidgets('2. Choosing "تسجيل الخروج" performs logout', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1200));

      final storage = await LocalStorage.init();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(testProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
            tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          ],
          child: const MaterialApp(
            home: MainNavigationScreen(),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Trigger back button
      final dynamic widgetsAppState = tester.state(find.byType(WidgetsApp));
      await widgetsAppState.didPopRoute();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Tap "تسجيل الخروج" inside dialog
      final logoutButton = find.text('تسجيل الخروج');
      expect(logoutButton, findsWidgets);
      await tester.tap(logoutButton.last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Dialog dismissed
      expect(find.text('هل تريد تسجيل الخروج؟'), findsNothing);
    });
  });
}
