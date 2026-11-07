import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/home/presentation/main_navigation_screen.dart';
import 'package:mobile/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile/features/inventory/presentation/cards_store_screen.dart';
import 'package:mobile/features/studio/presentation/card_studio_screen.dart';
import 'package:mobile/features/finance/presentation/finance_reports_screen.dart';
import 'package:mobile/features/profile/presentation/user_profile_screen.dart';

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
    id: 'user-admin-1',
    email: 'admin@sudafi.net',
    role: 'ADMIN',
    fullName: 'مدير النظام',
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
      name: 'Main Router',
      host: '192.168.88.1',
      isOnline: true,
    ),
  ];

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('Bottom Navigation Bar & Tabs Tests', () {
    testWidgets('1. BottomNavigationBar has exactly 5 destinations with correct order and labels', (tester) async {
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

      final navBarFinder = find.byType(NavigationBar);
      expect(navBarFinder, findsOneWidget);

      final navBar = tester.widget<NavigationBar>(navBarFinder);
      expect(navBar.destinations.length, equals(5));

      // Labels check
      final destinations = navBar.destinations.cast<NavigationDestination>();
      expect(destinations[0].label, equals('الرئيسية'));
      expect(destinations[1].label, equals('الكروت'));
      expect(destinations[2].label, equals('إنشاء كروت'));
      expect(destinations[3].label, equals('تقارير'));
      expect(destinations[4].label, equals('المزيد'));

      // Check icons
      expect((destinations[4].icon as Icon).icon, equals(Icons.more_horiz_rounded));
      expect((destinations[4].selectedIcon as Icon).icon, equals(Icons.more_horiz));

      // Verify Radar is NOT in bottom navigation bar
      expect(destinations.any((d) => d.label == 'الرادار'), isFalse);
    });

    testWidgets('2. IndexedStack has the 5 required screens in exact order', (tester) async {
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

      final mainIndexedStackFinder = find.ancestor(
        of: find.byType(DashboardScreen),
        matching: find.byType(IndexedStack),
      );
      expect(mainIndexedStackFinder, findsOneWidget);

      final indexedStack = tester.widget<IndexedStack>(mainIndexedStackFinder);
      expect(indexedStack.children.length, equals(5));

      expect(indexedStack.children[0], isA<DashboardScreen>());
      expect(indexedStack.children[1], isA<CardsStoreScreen>());
      expect(indexedStack.children[2], isA<CardStudioScreen>());
      expect(indexedStack.children[3], isA<FinanceReportsScreen>());
      expect(indexedStack.children[4], isA<UserProfileScreen>());
    });

    testWidgets('3. Tapping "المزيد" navigates to UserProfileScreen (index 4)', (tester) async {
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

      // Tap 'المزيد' in NavigationBar
      final moreFinder = find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('المزيد'),
      );
      await tester.tap(moreFinder);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      final mainIndexedStackFinder = find.byWidgetPredicate(
        (w) => w is IndexedStack && w.children.length == 5,
      );
      final indexedStack = tester.widget<IndexedStack>(mainIndexedStackFinder);
      expect(indexedStack.index, equals(4));

      // Verify UserProfileScreen content is visible (e.g., account/user info)
      expect(find.byType(UserProfileScreen), findsOneWidget);
    });

    testWidgets('4. Tapping "تقارير" navigates to FinanceReportsScreen (index 3)', (tester) async {
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

      // Tap 'تقارير' in NavigationBar
      final reportsFinder = find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('تقارير'),
      );
      await tester.tap(reportsFinder);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      final mainIndexedStackFinder = find.byWidgetPredicate(
        (w) => w is IndexedStack && w.children.length == 5,
      );
      final indexedStack = tester.widget<IndexedStack>(mainIndexedStackFinder);
      expect(indexedStack.index, equals(3));
      expect(find.byType(FinanceReportsScreen), findsOneWidget);
    });
  });
}
