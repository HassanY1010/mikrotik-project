import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/hotspot_profiles/presentation/create_hotspot_profile_screen.dart';

class MockProfilesQuotaNotifier extends CachedProfilesNotifier {
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
      'updateDataLimit': updateDataLimit,
    };
    return {'success': true};
  }
}

class MockRoutersNotifier extends RoutersNotifier {
  final RouterDeviceModel router;
  MockRoutersNotifier(this.router);

  @override
  Future<List<RouterDeviceModel>> build() => Future.value([router]);
}

void main() {
  final testRouter = RouterDeviceModel(
    id: 'router-123',
    name: 'Main Router',
    host: '192.168.88.1',
    isOnline: true,
  );

  Widget createTestWidget({
    HotspotProfileModel? editProfile,
    required MockProfilesQuotaNotifier mockNotifier,
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
    required MockProfilesQuotaNotifier mockNotifier,
  }) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(createTestWidget(
      editProfile: editProfile,
      mockNotifier: mockNotifier,
    ));
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pumpAndSettle();
  }

  group('Hotspot Package Quota Type (باقة مفتوحة vs باقة محددة بالجيجابايت)', () {
    testWidgets('1. Create Unlimited Profile (باقة مفتوحة) hides GB field and submits dataLimitGb: null', (tester) async {
      final mockNotifier = MockProfilesQuotaNotifier();
      await pumpScreen(tester, mockNotifier: mockNotifier);

      // Enter profile name
      await tester.enterText(find.byKey(const Key('profile_name_input')), 'unlimited-1day');
      await tester.pump();

      // Verify "باقة مفتوحة" is selected by default
      expect(find.byKey(const Key('quota_type_unlimited')), findsOneWidget);
      expect(find.byKey(const Key('quota_type_limited')), findsOneWidget);

      // Verify GB input field is hidden
      expect(find.byKey(const Key('data_limit_gb_input')), findsNothing);
      expect(find.textContaining('باقة مفتوحة: تمنح المستخدم إمكانية استخدام الإنترنت دون فرض حد أقصى'), findsOneWidget);

      // Submit form
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();

      // Verify payload has dataLimitGb == null
      expect(mockNotifier.lastCreatedPayload, isNotNull);
      expect(mockNotifier.lastCreatedPayload!['name'], 'unlimited-1day');
      expect(mockNotifier.lastCreatedPayload!['dataLimitGb'], isNull);
    });

    testWidgets('2. Create Limited Profile (5 GB) displays GB field, validates > 0, and submits 5.0 GB', (tester) async {
      final mockNotifier = MockProfilesQuotaNotifier();
      await pumpScreen(tester, mockNotifier: mockNotifier);

      // Enter profile name
      await tester.enterText(find.byKey(const Key('profile_name_input')), 'limited-5gb');
      await tester.pump();

      // Select "باقة محددة (GB)"
      await tester.tap(find.byKey(const Key('quota_type_limited')));
      await tester.pumpAndSettle();

      // Verify GB input field is now visible
      expect(find.byKey(const Key('data_limit_gb_input')), findsOneWidget);
      expect(find.byKey(const Key('gb_preset_5')), findsOneWidget);

      // Test validation: clear input and attempt submit
      await tester.enterText(find.byKey(const Key('data_limit_gb_input')), '');
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();
      expect(find.text('الرجاء إدخال حجم البيانات بالجيجابايت'), findsOneWidget);

      // Test validation: enter 0
      await tester.enterText(find.byKey(const Key('data_limit_gb_input')), '0');
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();
      expect(find.text('يجب أن يكون حجم البيانات أكبر من صفر'), findsOneWidget);

      // Enter 5 GB (or click 5 GB preset)
      await tester.tap(find.byKey(const Key('gb_preset_5')));
      await tester.pumpAndSettle();

      // Verify computed preview note shows accurate bytes calculation (5 * 1024^3 = 5368709120)
      expect(find.textContaining('5368709120 بايت (5.0 GB)'), findsOneWidget);
      expect(find.textContaining('limit-bytes-total'), findsOneWidget);

      // Submit form
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();

      // Verify payload
      expect(mockNotifier.lastCreatedPayload, isNotNull);
      expect(mockNotifier.lastCreatedPayload!['name'], 'limited-5gb');
      expect(mockNotifier.lastCreatedPayload!['dataLimitGb'], 5.0);
    });

    testWidgets('3. Edit profile: switches between unlimited and 10 GB limited and updates dataLimitGb', (tester) async {
      final mockNotifier = MockProfilesQuotaNotifier();

      // Start with an existing unlimited profile
      final existingProfile = HotspotProfileModel(
        id: 'prof-existing-1',
        name: 'old-unlimited-profile',
        displayName: 'باقة قديمة مفتوحة',
        deviceId: testRouter.id,
        price: 500,
        validity: '1d',
        dataLimitBytes: null,
        dataLimitGb: null,
      );

      await pumpScreen(
        tester,
        editProfile: existingProfile,
        mockNotifier: mockNotifier,
      );

      // Confirm starts in Unlimited mode
      expect(find.byKey(const Key('data_limit_gb_input')), findsNothing);

      // Switch to Limited
      await tester.tap(find.byKey(const Key('quota_type_limited')));
      await tester.pumpAndSettle();

      // Enter 10 GB
      await tester.tap(find.byKey(const Key('gb_preset_10')));
      await tester.pumpAndSettle();

      // Save edits
      await tester.tap(find.text('حفظ تعديلات الباقة'));
      await tester.pumpAndSettle();

      // Verify updated payload
      expect(mockNotifier.lastUpdatedPayload, isNotNull);
      expect(mockNotifier.lastUpdatedPayload!['id'], 'prof-existing-1');
      expect(mockNotifier.lastUpdatedPayload!['dataLimitGb'], 10.0);
      expect(mockNotifier.lastUpdatedPayload!['updateDataLimit'], isTrue);
    });

    testWidgets('6. Backward Compatibility: Old profiles without quota fields are treated as unlimited', (tester) async {
      // Mock an old JSON response from backend prior to this feature
      final oldJson = {
        'id': 'legacy-profile-99',
        'name': '1day-unlimited',
        'displayName': 'باقة 1 يوم',
        'deviceId': 'router-123',
        'price': 1200,
        'validity': '1d',
        'sessionTimeout': '1d',
        'rateLimit': '2M/2M',
        'availableCards': 15,
        // No dataLimitBytes or dataLimitGb in legacy response!
      };

      final profile = HotspotProfileModel.fromJson(oldJson);
      expect(profile.isUnlimited, isTrue);
      expect(profile.dataLimitBytes, isNull);
      expect(profile.dataLimitGb, isNull);
      expect(profile.quotaGb, isNull);

      // And a new profile with 5 GB
      final limitedJson = {
        'id': 'new-profile-5gb',
        'name': 'daily-5gb',
        'displayName': 'باقة 5 جيجا يومية',
        'deviceId': 'router-123',
        'price': 1500,
        'validity': '1d',
        'dataLimitBytes': 5368709120, // 5 GB in bytes
      };

      final limitedProfile = HotspotProfileModel.fromJson(limitedJson);
      expect(limitedProfile.isUnlimited, isFalse);
      expect(limitedProfile.dataLimitBytes, 5368709120);
      expect(limitedProfile.quotaGb, 5.0);
    });
  });
}
