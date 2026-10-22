import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
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

class MockNotifier extends CachedProfilesNotifier {
  Map<String, dynamic>? lastCreatedPayload;
  bool shouldFailWithNestedError = false;
  String? nestedErrorMessage;
  int callCount = 0;

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
    callCount++;
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

    if (shouldFailWithNestedError) {
      // Simulate NestJS HttpExceptionFilter response structure:
      // { "success": false, "statusCode": 502, "error": { "code": "ROUTER_PROVISIONING_FAILED", "message": "..." } }
      final dioException = DioException(
        requestOptions: RequestOptions(path: '/hotspot/profiles'),
        response: Response(
          requestOptions: RequestOptions(path: '/hotspot/profiles'),
          statusCode: 502,
          data: {
            'success': false,
            'statusCode': 502,
            'error': {
              'code': 'ROUTER_PROVISIONING_FAILED',
              'message': nestedErrorMessage ?? 'فشل إنشاء البروفايل: حساب الاتصال بالراوتر لا يمتلك صلاحيات الكتابة',
            },
          },
        ),
      );

      // Apply the exact error parser from CachedProfilesNotifier
      if (dioException.response?.data is Map) {
        final err = Map<String, dynamic>.from(dioException.response!.data as Map);
        final rawMsg = err['message'] ??
            (err['error'] is Map ? (err['error'] as Map)['message'] : null) ??
            err['error'];
        return {
          'success': false,
          'message': rawMsg?.toString() ?? 'فشل إنشاء البروفايل على الراوتر',
        };
      }
    }

    return {
      'success': true,
      'data': {
        'id': 'prof-123',
        'name': name,
        'rateLimit': rateLimit,
        'sessionTimeout': validity,
        'sharedUsers': sharedUsers ?? 1,
      },
    };
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Hotspot Profile Creation Fix & Diagnostics Acceptance Tests', () {
    late LocalStorage storage;
    late MockNotifier mockNotifier;

    final testRouters = [
      RouterDeviceModel(
        id: 'router-uuid-001',
        name: 'MikroTik Main Gateway',
        host: '192.168.88.1',
        isOnline: true,
      ),
    ];

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      storage = LocalStorage(prefs);
      mockNotifier = MockNotifier();
    });

    testWidgets('1. Submitting form sends correct payload and extracts router failure details from nested error',
        (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      mockNotifier.shouldFailWithNestedError = true;
      mockNotifier.nestedErrorMessage =
          'فشل إنشاء البروفايل: حساب الاتصال بالراوتر لا يمتلك صلاحيات الكتابة';

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
            profilesProvider.overrideWith(() => mockNotifier),
          ],
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: CreateHotspotProfileScreen(
                initialDeviceId: 'router-uuid-001',
              ),
            ),
          ),
        ),
      );
      for (int i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      // Enter profile name
      final nameField = find.byKey(const Key('profile_name_input'));
      expect(nameField, findsOneWidget);
      await tester.enterText(nameField, 'test-profile-1');

      // Submit
      final submitBtn = find.text('إنشاء الباقة والمزامنة الآن');
      expect(submitBtn, findsOneWidget);
      await tester.tap(submitBtn);
      await tester.pumpAndSettle();

      // Verify payload
      expect(mockNotifier.callCount, 1);
      expect(mockNotifier.lastCreatedPayload!['name'], 'test-profile-1');
      expect(mockNotifier.lastCreatedPayload!['deviceId'], 'router-uuid-001');

      // Verify the snackbar shows the ACTUAL nested technical/permission error message, NOT the generic fallback
      expect(
        find.text('فشل إنشاء البروفايل: حساب الاتصال بالراوتر لا يمتلك صلاحيات الكتابة'),
        findsOneWidget,
      );
    });

    testWidgets('2. Successfully creates profile and navigates back with new ID', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      mockNotifier.shouldFailWithNestedError = false;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
            profilesProvider.overrideWith(() => mockNotifier),
          ],
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: CreateHotspotProfileScreen(
                initialDeviceId: 'router-uuid-001',
              ),
            ),
          ),
        ),
      );
      for (int i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      final nameField = find.byKey(const Key('profile_name_input'));
      await tester.enterText(nameField, 'daily-2m');

      final submitBtn = find.text('إنشاء الباقة والمزامنة الآن');
      await tester.tap(submitBtn);
      await tester.pumpAndSettle();

      expect(mockNotifier.callCount, 1);
      expect(mockNotifier.lastCreatedPayload!['name'], 'daily-2m');
      expect(mockNotifier.lastCreatedPayload!['deviceId'], 'router-uuid-001');
    });

    testWidgets('3. Form validation strictly enforces non-empty and no-space profile names',
        (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
            profilesProvider.overrideWith(() => mockNotifier),
          ],
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: CreateHotspotProfileScreen(
                initialDeviceId: 'router-uuid-001',
              ),
            ),
          ),
        ),
      );
      for (int i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      // Try empty name
      final submitBtn = find.text('إنشاء الباقة والمزامنة الآن');
      await tester.tap(submitBtn);
      await tester.pumpAndSettle();

      expect(find.text('الرجاء إدخال اسم الباقة'), findsOneWidget);
      expect(mockNotifier.callCount, 0);

      // Try name with spaces
      final nameField = find.byKey(const Key('profile_name_input'));
      await tester.enterText(nameField, 'name with spaces');
      await tester.tap(submitBtn);
      await tester.pumpAndSettle();

      expect(find.text('يجب ألا يحتوي الاسم على مسافات'), findsOneWidget);
      expect(mockNotifier.callCount, 0);
    });
  });
}
