import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/hotspot_profiles/presentation/create_hotspot_profile_screen.dart';

class _MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _routers;
  _MockRoutersNotifier(this._routers);

  @override
  Future<List<RouterDeviceModel>> build() async => _routers;
}

class MockProfilesNotifier extends CachedProfilesNotifier {
  Map<String, dynamic>? lastPayload;
  bool shouldSucceed = true;
  String? mockErrorMessage;

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
    lastPayload = {
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

    if (shouldSucceed) {
      return {
        'success': true,
        'profile': {
          'id': 'profile-3gb-test-id',
          'name': name,
          'displayName': displayName,
          'deviceId': deviceId,
          'price': price,
          'sharedUsers': sharedUsers,
          'dataLimitGb': dataLimitGb,
          'dataLimitBytes': 3221225472,
        },
      };
    } else {
      return {
        'success': false,
        'message': mockErrorMessage ?? 'An internal server error occurred. Please contact support.',
      };
    }
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Create Hotspot Profile with 3 GB data limit, 500 SDG price, and 1 shared user',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final storage = LocalStorage(prefs);

    final mockNotifier = MockProfilesNotifier();
    final mockRouter = RouterDeviceModel(
      id: 'dev-1',
      name: 'Main Router',
      host: '192.168.88.1',
      isOnline: true,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          profilesProvider.overrideWith(() => mockNotifier),
          routersProvider.overrideWith(() => _MockRoutersNotifier([mockRouter])),
        ],
        child: const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: CreateHotspotProfileScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // 1. Enter profile name
    final nameField = find.byKey(const Key('profile_name_input'));
    expect(nameField, findsOneWidget);
    await tester.enterText(nameField, '3gb-package');
    await tester.pumpAndSettle();

    // 2. Select limited quota
    final quotaOption = find.byKey(const Key('quota_type_limited'));
    expect(quotaOption, findsOneWidget);
    await tester.tap(quotaOption);
    await tester.pumpAndSettle();

    // 3. Ensure GB is selected
    final gbUnit = find.byKey(const Key('unit_selector_gb'));
    expect(gbUnit, findsOneWidget);
    await tester.tap(gbUnit);
    await tester.pumpAndSettle();

    // 4. Enter 3 GB in the data limit input
    final dataLimitInput = find.byKey(const Key('data_limit_input'));
    expect(dataLimitInput, findsOneWidget);
    await tester.enterText(dataLimitInput, '3');
    await tester.pumpAndSettle();

    // 5. Verify computed preview: 3221225472 bytes (3.0 GB)
    expect(find.textContaining('3221225472 بايت (3.0 GB)'), findsOneWidget);

    // 6. Submit form
    final submitButton = find.text('إنشاء الباقة والمزامنة الآن');
    expect(submitButton, findsOneWidget);
    await tester.tap(submitButton);
    await tester.pumpAndSettle();

    // Verify sent payload matches requirement
    expect(mockNotifier.lastPayload, isNotNull);
    expect(mockNotifier.lastPayload!['name'], '3gb-package');
    expect(mockNotifier.lastPayload!['dataLimitGb'], 3.0);
    expect(mockNotifier.lastPayload!['dataLimitMb'], isNull);
    expect(mockNotifier.lastPayload!['price'], 500.0);
    expect(mockNotifier.lastPayload!['sharedUsers'], 1);
  });

  testWidgets('Displays error SnackBar gracefully when server returns error',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final storage = LocalStorage(prefs);

    final mockNotifier = MockProfilesNotifier();
    mockNotifier.shouldSucceed = false;
    mockNotifier.mockErrorMessage = 'خطأ في توافق مخطط قاعدة البيانات، يرجى تحديث النظام';

    final mockRouter = RouterDeviceModel(
      id: 'dev-1',
      name: 'Main Router',
      host: '192.168.88.1',
      isOnline: true,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          profilesProvider.overrideWith(() => mockNotifier),
          routersProvider.overrideWith(() => _MockRoutersNotifier([mockRouter])),
        ],
        child: const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: CreateHotspotProfileScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('profile_name_input')), 'fail-test');
    await tester.pumpAndSettle();

    final submitButton = find.text('إنشاء الباقة والمزامنة الآن');
    await tester.tap(submitButton);
    await tester.pump();

    // Verify error SnackBar is displayed without popping screen
    expect(find.text('خطأ في توافق مخطط قاعدة البيانات، يرجى تحديث النظام'), findsOneWidget);
  });
}
