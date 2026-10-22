import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/hotspot_profiles/presentation/create_hotspot_profile_screen.dart';

class MockRoutersNotifier extends RoutersNotifier {
  @override
  Future<List<RouterDeviceModel>> build() {
    return Future.value([
      RouterDeviceModel(
        id: 'router-test-01',
        name: 'Main Core MikroTik',
        host: '192.168.88.1',
        isOnline: true,
      ),
    ]);
  }
}

class MockProfilesNotifier extends CachedProfilesNotifier {
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
      'updateDataLimit': updateDataLimit,
    };
    return {'success': true};
  }
}

void main() {
  late MockProfilesNotifier mockProfilesNotifier;

  setUp(() {
    mockProfilesNotifier = MockProfilesNotifier();
  });

  Widget buildTestWidget({HotspotProfileModel? editProfile, Key? key}) {
    return ProviderScope(
      overrides: [
        routersProvider.overrideWith(() => MockRoutersNotifier()),
        profilesProvider.overrideWith(() => mockProfilesNotifier),
      ],
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: CreateHotspotProfileScreen(
            key: key ?? UniqueKey(),
            editProfile: editProfile,
          ),
        ),
      ),
    );
  }

  Future<void> pumpScreen(WidgetTester tester, {HotspotProfileModel? editProfile}) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(buildTestWidget(editProfile: editProfile));
    // Advance frames to resolve AsyncNotifier future
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pumpAndSettle();
  }

  group('Hotspot Validity Acceptance Tests (Practical UI & Logic)', () {
    testWidgets('1. Create Profile initial state defaults to Day (D) and amount 1 without week option', (tester) async {
      await pumpScreen(tester);

      // Check unit buttons
      expect(find.text('دقيقة'), findsOneWidget);
      expect(find.text('M'), findsOneWidget);
      expect(find.text('ساعة'), findsOneWidget);
      expect(find.text('H'), findsOneWidget);
      expect(find.text('يوم'), findsOneWidget);
      expect(find.text('D'), findsOneWidget);

      // Verify STRICT absence of week option
      expect(find.text('أسبوع'), findsNothing);
      expect(find.text('W'), findsNothing);

      // Verify default amount is 1 and unit indicator is D
      final amountField = tester.widget<TextFormField>(find.byKey(const Key('validity_amount_input')));
      expect(amountField.controller?.text, '1');
      expect(find.text('يوم (D)'), findsOneWidget);
      expect(find.textContaining('1D (يوم واحد)'), findsOneWidget);
    });

    testWidgets('2. Select Minute (M) and enter 30 -> renders 30M and 30 دقيقة', (tester) async {
      await pumpScreen(tester);

      // Tap on Minute (M)
      await tester.tap(find.text('دقيقة'));
      await tester.pumpAndSettle();

      // Enter 30 into amount field
      final amountFieldFinder = find.byKey(const Key('validity_amount_input'));
      await tester.enterText(amountFieldFinder, '30');
      await tester.pumpAndSettle();

      // Check indicator and preview
      expect(find.text('دقيقة (M)'), findsOneWidget);
      expect(find.textContaining('30M (30 دقيقة)'), findsOneWidget);
    });

    testWidgets('3. Select Hour (H) and enter 5 -> renders 5H and 5 ساعات', (tester) async {
      await pumpScreen(tester);

      // Tap on Hour (H)
      await tester.tap(find.text('ساعة'));
      await tester.pumpAndSettle();

      final amountFieldFinder = find.byKey(const Key('validity_amount_input'));
      await tester.enterText(amountFieldFinder, '5');
      await tester.pumpAndSettle();

      expect(find.text('ساعة (H)'), findsOneWidget);
      expect(find.textContaining('5H (5 ساعات)'), findsOneWidget);
    });

    testWidgets('4. Select Day (D) and enter 7 -> renders 7D and 7 أيام', (tester) async {
      await pumpScreen(tester);

      // Tap on Day (D)
      await tester.tap(find.text('يوم'));
      await tester.pumpAndSettle();

      final amountFieldFinder = find.byKey(const Key('validity_amount_input'));
      await tester.enterText(amountFieldFinder, '7');
      await tester.pumpAndSettle();

      expect(find.text('يوم (D)'), findsOneWidget);
      expect(find.textContaining('7D (7 أيام)'), findsOneWidget);
    });

    testWidgets('5. Switching units preserves entered number without data loss', (tester) async {
      await pumpScreen(tester);

      final amountFieldFinder = find.byKey(const Key('validity_amount_input'));
      await tester.enterText(amountFieldFinder, '15');
      await tester.pumpAndSettle();

      // Switch to Minute
      await tester.tap(find.text('دقيقة'));
      await tester.pumpAndSettle();
      final amountFieldM = tester.widget<TextFormField>(amountFieldFinder);
      expect(amountFieldM.controller?.text, '15');
      expect(find.textContaining('15M (15 دقيقة)'), findsOneWidget);

      // Switch to Hour
      await tester.tap(find.text('ساعة'));
      await tester.pumpAndSettle();
      final amountFieldH = tester.widget<TextFormField>(amountFieldFinder);
      expect(amountFieldH.controller?.text, '15');
      expect(find.textContaining('15H (15 ساعة)'), findsOneWidget);

      // Switch to Day
      await tester.tap(find.text('يوم'));
      await tester.pumpAndSettle();
      final amountFieldD = tester.widget<TextFormField>(amountFieldFinder);
      expect(amountFieldD.controller?.text, '15');
      expect(find.textContaining('15D (15 يوم)'), findsOneWidget);
    });

    testWidgets('6. Validation rejects 0, empty, and invalid values', (tester) async {
      await pumpScreen(tester);

      final amountFieldFinder = find.byKey(const Key('validity_amount_input'));

      // Clear text
      await tester.enterText(amountFieldFinder, '');
      await tester.pumpAndSettle();
      expect(find.textContaining('الرجاء كتابة عدد صحيح موجب'), findsOneWidget);

      // Submit form to trigger validator
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();
      expect(find.text('الرجاء إدخال عدد مدة الصلاحية'), findsOneWidget);

      // Enter 0
      await tester.enterText(amountFieldFinder, '0');
      await tester.pumpAndSettle();
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();
      expect(find.text('يجب إدخال عدد صحيح موجب أكبر من الصفر'), findsOneWidget);
    });

    testWidgets('7. Edit mode accurately parses existing 30m, 5h, 7d, and legacy 1w profiles', (tester) async {
      // 7a: 30m profile
      final prof30m = HotspotProfileModel(
        id: 'p-30m',
        name: 'test-30m',
        deviceId: 'router-test-01',
        price: 500,
        validity: '30m',
      );
      await pumpScreen(tester, editProfile: prof30m);
      expect(find.text('دقيقة (M)'), findsOneWidget);
      expect(find.textContaining('30M (30 دقيقة)'), findsOneWidget);

      // 7b: 5h profile
      final prof5h = HotspotProfileModel(
        id: 'p-5h',
        name: 'test-5h',
        deviceId: 'router-test-01',
        price: 500,
        validity: '5h',
      );
      await pumpScreen(tester, editProfile: prof5h);
      expect(find.text('ساعة (H)'), findsOneWidget);
      expect(find.textContaining('5H (5 ساعات)'), findsOneWidget);

      // 7c: 7d profile
      final prof7d = HotspotProfileModel(
        id: 'p-7d',
        name: 'test-7d',
        deviceId: 'router-test-01',
        price: 500,
        validity: '7d',
      );
      await pumpScreen(tester, editProfile: prof7d);
      expect(find.text('يوم (D)'), findsOneWidget);
      expect(find.textContaining('7D (7 أيام)'), findsOneWidget);

      // 7d: legacy 1w profile -> safely converted to 7d
      final prof1w = HotspotProfileModel(
        id: 'p-1w',
        name: 'test-1w',
        deviceId: 'router-test-01',
        price: 500,
        validity: '1w',
      );
      await pumpScreen(tester, editProfile: prof1w);
      expect(find.text('يوم (D)'), findsOneWidget);
      expect(find.textContaining('7D (7 أيام)'), findsOneWidget);
    });

    testWidgets('8. Submit creates profile with unified validity format', (tester) async {
      await pumpScreen(tester);

      // Enter name
      final nameFieldFinder = find.byKey(const Key('profile_name_input'));
      await tester.enterText(nameFieldFinder, 'accept-30m');

      // Select Minute and enter 30
      await tester.tap(find.text('دقيقة'));
      await tester.pumpAndSettle();
      final amountFieldFinder = find.byKey(const Key('validity_amount_input'));
      await tester.enterText(amountFieldFinder, '30');
      await tester.pumpAndSettle();

      // Submit
      await tester.tap(find.text('إنشاء الباقة والمزامنة الآن'));
      await tester.pumpAndSettle();

      expect(mockProfilesNotifier.lastCreatedPayload, isNotNull);
      expect(mockProfilesNotifier.lastCreatedPayload!['name'], 'accept-30m');
      expect(mockProfilesNotifier.lastCreatedPayload!['validity'], '30m');
      expect(mockProfilesNotifier.lastCreatedPayload!['sessionTimeout'], '30m');
    });
  });
}
