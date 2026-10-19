import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/studio/presentation/card_studio_screen.dart';
import 'package:mobile/features/hotspot_profiles/presentation/create_hotspot_profile_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Hotspot Package Selection & Creation Acceptance Tests', () {
    late LocalStorage storage;

    final initialProfiles = [
      HotspotProfileModel(
        id: 'p1',
        name: '3months',
        displayName: '3 شهور',
        price: 200,
        validity: '90d',
        sessionTimeout: '90d',
        rateLimit: '2M/5M',
        deviceId: 'r1',
      ),
      HotspotProfileModel(
        id: 'p2',
        name: 'weekly',
        displayName: 'باقة أسبوعية',
        price: 5000,
        validity: '7d',
        sessionTimeout: '7d',
        rateLimit: '5M/5M',
        deviceId: 'r1',
      ),
      HotspotProfileModel(
        id: 'p3',
        name: '1hour',
        displayName: 'باقة 1 ساعة',
        price: 200,
        validity: '1h',
        sessionTimeout: '1h',
        rateLimit: '2M/2M',
        deviceId: 'r1',
      ),
    ];

    final testRouters = [
      RouterDeviceModel(
        id: 'r1',
        name: 'Main MikroTik',
        host: '192.168.88.1',
        isOnline: true,
      ),
    ];

    final adminUser = AuthUser(
      id: 'u1',
      email: 'admin@sudafi.net',
      fullName: 'مدير النظام',
      role: 'TENANT_ADMIN',
      tenantId: 'tenant-100',
    );

    final cashierUser = AuthUser(
      id: 'u2',
      email: 'cashier@sudafi.net',
      fullName: 'كاشير الفرع',
      role: 'CASHIER',
      tenantId: 'tenant-100',
    );

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      storage = await LocalStorage.init();
      await storage.saveCachedProfiles(initialProfiles);
      await storage.saveCachedRouters(testRouters);
      await storage.setUser(adminUser);
    });

    testWidgets('1. CardStudioScreen displays ready-made packages and "+ إضافة باقة جديدة" button', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(initialProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Check header button "+ إضافة باقة جديدة"
      expect(find.byKey(const Key('button_add_new_profile')), findsOneWidget);
      expect(find.text('+ إضافة باقة جديدة'), findsWidgets);

      // Check dropdown field
      expect(find.byKey(const Key('hotspot_profile_dropdown')), findsOneWidget);

      // Selected package is displayed
      expect(find.text('3 شهور'), findsWidgets);
      expect(find.text('200 SDG'), findsWidgets);
    });

    testWidgets('2. Opening dropdown displays all ready-made packages AND "+ إضافة باقة جديدة" item at bottom', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(initialProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap dropdown to open it
      await tester.tap(find.byKey(const Key('hotspot_profile_dropdown')));
      await tester.pumpAndSettle();

      // Verify ready-made packages are listed
      expect(find.byKey(const Key('profile_item_p1')), findsWidgets);
      expect(find.byKey(const Key('profile_item_p2')), findsWidgets);
      expect(find.byKey(const Key('profile_item_p3')), findsWidgets);
      expect(find.text('باقة أسبوعية'), findsWidgets);
      expect(find.text('باقة 1 ساعة'), findsWidgets);

      // Verify the add-new-profile item is listed inside the dropdown
      expect(find.byKey(const Key('dropdown_add_new_profile_item')), findsOneWidget);
    });

    testWidgets('3. Clicking "+ إضافة باقة جديدة" opens CreateHotspotProfileScreen with target router pre-selected', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(initialProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap the header "+ إضافة باقة جديدة" button
      await tester.tap(find.byKey(const Key('button_add_new_profile')));
      await tester.pumpAndSettle();

      // Verify we navigated to CreateHotspotProfileScreen
      expect(find.byType(CreateHotspotProfileScreen), findsOneWidget);
      expect(find.text('إنشاء باقة هوتسبوت جديدة'), findsOneWidget);
      expect(find.text('الراوتر المستهدف (RouterOS Target):'), findsOneWidget);
      expect(find.text('Main MikroTik'), findsWidgets);
    });

    testWidgets('4. Newly created profile is immediately selectable and updates card preview without restart', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      final profilesNotifier = _MockProfilesNotifier(List.from(initialProfiles));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => profilesNotifier),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify initial selection is '3 شهور'
      expect(find.text('3 شهور'), findsWidgets);

      // Create new profile object
      final newProfile = HotspotProfileModel(
        id: 'p_vip_gold',
        name: 'vip-5h',
        displayName: 'باقة VIP الذهبية 5 ساعات',
        price: 1500,
        validity: '5h',
        sessionTimeout: '5h',
        rateLimit: '10M/10M',
        deviceId: 'r1',
      );

      // Add to state
      profilesNotifier.addProfile(newProfile);
      await tester.pumpAndSettle();

      // Open dropdown and select the newly created profile
      await tester.tap(find.byKey(const Key('hotspot_profile_dropdown')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('باقة VIP الذهبية 5 ساعات').last);
      await tester.pumpAndSettle();

      // The new package is immediately selected and displayed in preview and dropdown
      expect(find.text('باقة VIP الذهبية 5 ساعات'), findsWidgets);
      expect(find.text('1500 SDG'), findsWidgets);
    });

    testWidgets('5. Unauthorized role (CASHIER) cannot create new package and gets clear snackbar alert', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(cashierUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(initialProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap "+ إضافة باقة جديدة"
      await tester.tap(find.byKey(const Key('button_add_new_profile')));
      await tester.pumpAndSettle();

      // Did not navigate to CreateHotspotProfileScreen
      expect(find.byType(CreateHotspotProfileScreen), findsNothing);

      // Alert snackbar was shown
      expect(
        find.text('عذراً، صلاحيات حسابك الحالية لا تسمح بإنشاء باقات جديدة. يرجى التواصل مع مسؤول النظام.'),
        findsOneWidget,
      );
    });

    testWidgets('6. When profiles are empty, tapping the field invites user to add new profile', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier([])),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.byKey(const Key('empty_profiles_add_button')), findsOneWidget);
      expect(find.text('لا توجد باقات متاحة حالياً. اضغط هنا لإضافة باقة جديدة'), findsOneWidget);

      // Tap empty button navigates to create profile
      await tester.tap(find.byKey(const Key('empty_profiles_add_button')));
      await tester.pumpAndSettle();

      expect(find.byType(CreateHotspotProfileScreen), findsOneWidget);
    });
  });
}

class _MockProfilesNotifier extends CachedProfilesNotifier {
  final List<HotspotProfileModel> initialList;
  _MockProfilesNotifier(this.initialList);

  @override
  List<HotspotProfileModel> build() => initialList;

  @override
  Future<void> fetchProfiles() async {
    // Keep test state without unmocked network calls
  }

  void addProfile(HotspotProfileModel p) {
    state = [p, ...state];
  }
}

class _MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _routers;
  _MockRoutersNotifier(this._routers);

  @override
  Future<List<RouterDeviceModel>> build() async => _routers;
}

class _MockCurrentUserNotifier extends CurrentUserNotifier {
  final AuthUser? _user;
  _MockCurrentUserNotifier(this._user);

  @override
  AuthUser? build() => _user;
}
