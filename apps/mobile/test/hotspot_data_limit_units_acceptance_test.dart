import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/hotspot_profiles/presentation/create_hotspot_profile_screen.dart';

class MockProfilesExtendedNotifier extends CachedProfilesNotifier {
  Map<String, dynamic>? lastCreatedPayload;
  Map<String, dynamic>? lastUpdatedPayload;

  @override
  List<HotspotProfileModel> build() => [];

  @override
  Future<void> fetchProfiles() async {}

  @override
  Future<Map<String, dynamic>> createProfile({
    required String name,
    required String deviceId,
    String? displayName,
    String? rateLimit,
    String? sessionTimeout,
    String? validity,
    double? price,
    int? sharedUsers,
    double? dataLimitGb,
    double? dataLimitMb,
  }) async {
    lastCreatedPayload = {
      'name': name,
      'deviceId': deviceId,
      'displayName': displayName,
      'rateLimit': rateLimit,
      'sessionTimeout': sessionTimeout,
      'validity': validity,
      'price': price,
      'sharedUsers': sharedUsers,
      'dataLimitGb': dataLimitGb,
      'dataLimitMb': dataLimitMb,
    };
    return {'success': true};
  }

  @override
  Future<Map<String, dynamic>> updateProfile({
    required String id,
    required String name,
    String? displayName,
    String? rateLimit,
    String? sessionTimeout,
    String? validity,
    double? price,
    int? sharedUsers,
    double? dataLimitGb,
    double? dataLimitMb,
    bool updateDataLimit = false,
  }) async {
    lastUpdatedPayload = {
      'id': id,
      'name': name,
      'displayName': displayName,
      'rateLimit': rateLimit,
      'sessionTimeout': sessionTimeout,
      'validity': validity,
      'price': price,
      'sharedUsers': sharedUsers,
      'dataLimitGb': dataLimitGb,
      'dataLimitMb': dataLimitMb,
      'updateDataLimit': updateDataLimit,
    };
    return {'success': true};
  }
}

class MockRoutersNotifier extends RoutersNotifier {
  final RouterDeviceModel router;
  MockRoutersNotifier(this.router);

  @override
  Future<List<RouterDeviceModel>> build() async => [router];
}

void main() {
  final testRouter = RouterDeviceModel(
    id: 'router-uuid-001',
    name: 'Main RouterOS',
    host: '192.168.88.1',
    isOnline: true,
  );

  Widget buildWidget({
    HotspotProfileModel? editProfile,
    required MockProfilesExtendedNotifier mockNotifier,
  }) {
    return ProviderScope(
      overrides: [
        routersProvider.overrideWith(() => MockRoutersNotifier(testRouter)),
        profilesProvider.overrideWith(() => mockNotifier),
      ],
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: CreateHotspotProfileScreen(
            editProfile: editProfile,
            initialDeviceId: testRouter.id,
          ),
        ),
      ),
    );
  }

  Future<void> pumpScreen(
    WidgetTester tester, {
    HotspotProfileModel? editProfile,
    required MockProfilesExtendedNotifier mockNotifier,
  }) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(buildWidget(
      editProfile: editProfile,
      mockNotifier: mockNotifier,
    ));
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pumpAndSettle();
  }

  group('GB/MB Data Limit & Completely Open Card Acceptance Tests', () {
    testWidgets('1. Create profile with 1 GB data limit sends dataLimitGb: 1.0', (tester) async {
      final mockNotifier = MockProfilesExtendedNotifier();
      await pumpScreen(tester, mockNotifier: mockNotifier);

      await tester.enterText(find.byKey(const Key('profile_name_input')), 'profile-1gb');
      await tester.pump();

      // Enable limited quota
      await tester.tap(find.byKey(const Key('quota_type_limited')));
      await tester.pumpAndSettle();

      // Ensure GB is active and enter 1
      await tester.tap(find.byKey(const Key('unit_selector_gb')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('data_limit_input')), '1');
      await tester.pumpAndSettle();

      // Verify computed bytes preview for 1 GB: 1073741824 bytes
      expect(find.textContaining('1073741824 بايت (1.0 GB)'), findsOneWidget);

      // Submit
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();

      expect(mockNotifier.lastCreatedPayload, isNotNull);
      expect(mockNotifier.lastCreatedPayload!['name'], 'profile-1gb');
      expect(mockNotifier.lastCreatedPayload!['dataLimitGb'], 1.0);
      expect(mockNotifier.lastCreatedPayload!['dataLimitMb'], isNull);
    });

    testWidgets('2. Create profile with 500 MB data limit sends dataLimitMb: 500.0', (tester) async {
      final mockNotifier = MockProfilesExtendedNotifier();
      await pumpScreen(tester, mockNotifier: mockNotifier);

      await tester.enterText(find.byKey(const Key('profile_name_input')), 'profile-500mb');
      await tester.pump();

      // Enable limited quota
      await tester.tap(find.byKey(const Key('quota_type_limited')));
      await tester.pumpAndSettle();

      // Select MB unit
      await tester.tap(find.byKey(const Key('unit_selector_mb')));
      await tester.pumpAndSettle();

      // Tap preset 500 MB
      await tester.tap(find.byKey(const Key('mb_preset_500')));
      await tester.pumpAndSettle();

      // Verify computed bytes preview for 500 MB: 500 * 1024 * 1024 = 524288000 bytes
      expect(find.textContaining('524288000 بايت (500.0 MB)'), findsOneWidget);

      // Submit
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();

      expect(mockNotifier.lastCreatedPayload, isNotNull);
      expect(mockNotifier.lastCreatedPayload!['name'], 'profile-500mb');
      expect(mockNotifier.lastCreatedPayload!['dataLimitMb'], 500.0);
      expect(mockNotifier.lastCreatedPayload!['dataLimitGb'], isNull);
    });

    testWidgets('3. Create completely open card (بدون حد بيانات أو مدة زمنية) sends null validity & null quota', (tester) async {
      final mockNotifier = MockProfilesExtendedNotifier();
      await pumpScreen(tester, mockNotifier: mockNotifier);

      await tester.enterText(find.byKey(const Key('profile_name_input')), 'open-vip-card');
      await tester.pump();

      // Turn on Open Card Switch
      final openCardSwitch = find.byKey(const Key('open_card_switch'));
      expect(openCardSwitch, findsOneWidget);
      await tester.tap(openCardSwitch);
      await tester.pumpAndSettle();

      // Verify warning badges and disabled indicators
      expect(find.textContaining('معطل: تم اختيار كرت مفتوح بدون مدة صلاحية'), findsOneWidget);
      expect(find.textContaining('معطل: تم اختيار كرت مفتوح بدون حد بيانات'), findsOneWidget);
      expect(find.textContaining('المدة في MikroTik: بدون مدة محددة (غير محدودة)'), findsOneWidget);

      // Submit
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();

      expect(mockNotifier.lastCreatedPayload, isNotNull);
      expect(mockNotifier.lastCreatedPayload!['name'], 'open-vip-card');
      expect(mockNotifier.lastCreatedPayload!['sessionTimeout'], isNull);
      expect(mockNotifier.lastCreatedPayload!['validity'], isNull);
      expect(mockNotifier.lastCreatedPayload!['dataLimitGb'], isNull);
      expect(mockNotifier.lastCreatedPayload!['dataLimitMb'], isNull);
    });

    testWidgets('4. Disabling open card re-enables validity and quota inputs', (tester) async {
      final mockNotifier = MockProfilesExtendedNotifier();
      await pumpScreen(tester, mockNotifier: mockNotifier);

      // Turn on then turn off
      final openCardSwitch = find.byKey(const Key('open_card_switch'));
      await tester.tap(openCardSwitch);
      await tester.pumpAndSettle();
      expect(find.textContaining('معطل: تم اختيار كرت مفتوح بدون مدة صلاحية'), findsOneWidget);

      await tester.tap(openCardSwitch);
      await tester.pumpAndSettle();
      expect(find.textContaining('معطل: تم اختيار كرت مفتوح بدون مدة صلاحية'), findsNothing);
      expect(find.byKey(const Key('validity_amount_input')), findsOneWidget);
    });

    testWidgets('5. Edit mode preserves MB unit and open card status correctly', (tester) async {
      final mockNotifier = MockProfilesExtendedNotifier();

      // MB Profile (e.g. 500 MB = 524,288,000 bytes)
      final mbProfile = HotspotProfileModel(
        id: 'prof-mb-1',
        name: 'profile-500mb',
        displayName: 'باقة 500 ميجا',
        deviceId: testRouter.id,
        price: 300,
        validity: '1d',
        dataLimitBytes: 524288000,
      );

      await pumpScreen(tester, editProfile: mbProfile, mockNotifier: mockNotifier);

      // Verify MB unit is auto-selected
      expect(find.textContaining('524288000 بايت (500.0 MB)'), findsOneWidget);

      // Open Profile
      final openProfile = HotspotProfileModel(
        id: 'prof-open-1',
        name: 'profile-open',
        displayName: 'كرت مفتوح',
        deviceId: testRouter.id,
        price: 1000,
        validity: null,
        sessionTimeout: null,
        dataLimitBytes: null,
      );

      expect(openProfile.isOpenCard, isTrue);
      expect(openProfile.formattedDataLimit, 'مفتوح');
      expect(mbProfile.isOpenCard, isFalse);
      expect(mbProfile.formattedDataLimit, '500 MB');
    });
  });
}
