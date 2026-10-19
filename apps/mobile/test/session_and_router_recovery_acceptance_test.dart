import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dio/dio.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/dashboard/presentation/dashboard_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Session & Router Recovery Acceptance Tests', () {
    late LocalStorage storage;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      storage = await LocalStorage.init();
    });

    test('1. LocalStorage properly stores, retrieves, and clears refreshToken, cached routers, and selectedRouterId', () async {
      // Refresh token
      expect(storage.getRefreshToken(), isNull);
      await storage.setRefreshToken('test-refresh-token-123');
      expect(storage.getRefreshToken(), 'test-refresh-token-123');

      // Selected router id
      expect(storage.getSelectedRouterId(), isNull);
      await storage.setSelectedRouterId('router-02');
      expect(storage.getSelectedRouterId(), 'router-02');

      // Cached routers
      expect(storage.getCachedRouters(), isEmpty);
      final testRouters = [
        RouterDeviceModel(id: 'r1', name: 'Core Router 1', host: '192.168.1.1', isOnline: true),
        RouterDeviceModel(id: 'r2', name: 'Core Router 2', host: '192.168.1.2', isOnline: false),
        RouterDeviceModel(id: 'r3', name: 'Tower 3', host: '192.168.1.3', isOnline: true),
        RouterDeviceModel(id: 'r4', name: 'Branch 4', host: '192.168.1.4', isOnline: true),
      ];
      await storage.saveCachedRouters(testRouters);

      final retrieved = storage.getCachedRouters();
      expect(retrieved.length, 4);
      expect(retrieved[0].name, 'Core Router 1');
      expect(retrieved[3].name, 'Branch 4');

      // Clear auth wipes tokens but preserves cached offline data safely
      await storage.clearAuth();
      expect(storage.getToken(), isNull);
      expect(storage.getRefreshToken(), isNull);
    });

    test('2. ApiClient interceptor automatically refreshes expired access token on 401 and retries original request', () async {
      await storage.setToken('expired-access-token');
      await storage.setRefreshToken('valid-refresh-token');

      final client = ApiClient(localStorage: storage);
      int refreshCallCount = 0;
      int resourceCallCount = 0;

      // Mock HTTP adapter
      client.dio.httpClientAdapter = _MockHttpClientAdapter((options) {
        if (options.path.contains('devices')) {
          resourceCallCount++;
          final authHeader = options.headers['Authorization'] as String?;
          if (authHeader == 'Bearer new-rotated-access-token') {
            return ResponseBody.fromString(
              '{"data": [{"id": "r1", "name": "MikroTik-01", "host": "10.0.0.1", "isOnline": true}]}',
              200,
              headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
            );
          }
          return ResponseBody.fromString(
            '{"statusCode": 401, "message": "jwt expired"}',
            401,
            headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
          );
        }
        return ResponseBody.fromString('{}', 404);
      });

      final refreshDio = client.refreshDio;
      refreshDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        if (options.path.contains('auth/refresh')) {
          refreshCallCount++;
          return ResponseBody.fromString(
            '{"accessToken": "new-rotated-access-token", "refreshToken": "new-rotated-refresh-token"}',
            200,
            headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
          );
        }
        return ResponseBody.fromString('{}', 404);
      });

      final response = await client.get('/devices');

      expect(response.statusCode, 200);
      expect(refreshCallCount, 1);
      expect(resourceCallCount, 2); // First failed 401, second succeeded after refresh
      expect(storage.getToken(), 'new-rotated-access-token');
      expect(storage.getRefreshToken(), 'new-rotated-refresh-token');
    });

    test('3. Concurrent 401 requests trigger exactly ONE refresh operation via Mutex without race conditions', () async {
      await storage.setToken('expired-token');
      await storage.setRefreshToken('valid-refresh');

      final client = ApiClient(localStorage: storage);
      int refreshCallCount = 0;

      client.dio.httpClientAdapter = _MockHttpClientAdapter((options) {
        final authHeader = options.headers['Authorization'] as String?;
        if (authHeader == 'Bearer fresh-token') {
          return ResponseBody.fromString(
            '{"data": "success for ${options.path}"}',
            200,
            headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
          );
        }
        return ResponseBody.fromString(
          '{"statusCode": 401, "message": "jwt expired"}',
          401,
          headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
        );
      });

      final refreshDio = client.refreshDio;
      refreshDio.httpClientAdapter = _MockHttpClientAdapter((options) async {
        refreshCallCount++;
        // Simulate real network delay for refresh
        await Future.delayed(const Duration(milliseconds: 50));
        return ResponseBody.fromString(
          '{"accessToken": "fresh-token", "refreshToken": "fresh-refresh"}',
          200,
          headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
        );
      });

      // Fire 5 concurrent requests simultaneously
      final results = await Future.wait([
        client.get('/devices'),
        client.get('/auth/me'),
        client.get('/sales/daily-report'),
        client.get('/hotspot/sessions'),
        client.get('/cards'),
      ]);

      expect(results.length, 5);
      for (final r in results) {
        expect(r.statusCode, 200);
      }
      // Crucial: exactly ONE refresh call must have been made despite 5 concurrent 401s!
      expect(refreshCallCount, 1);
      expect(storage.getToken(), 'fresh-token');
    });

    test('4. When refresh token itself is expired/revoked, onSessionExpired is called and auth is cleared', () async {
      await storage.setToken('expired-token');
      await storage.setRefreshToken('expired-refresh-token');

      bool sessionExpiredFired = false;
      final client = ApiClient(
        localStorage: storage,
        onSessionExpired: () {
          sessionExpiredFired = true;
        },
      );

      client.dio.httpClientAdapter = _MockHttpClientAdapter((options) {
        return ResponseBody.fromString(
          '{"statusCode": 401, "message": "jwt expired"}',
          401,
          headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
        );
      });

      final refreshDio = client.refreshDio;
      refreshDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        return ResponseBody.fromString(
          '{"statusCode": 401, "message": "Refresh token has expired"}',
          401,
          headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
        );
      });

      expect(
        () => client.get('/devices'),
        throwsA(isA<DioException>()),
      );

      // Verify clean session logout handling
      await Future.delayed(const Duration(milliseconds: 20));
      expect(sessionExpiredFired, isTrue);
      expect(storage.getToken(), isNull);
      expect(storage.getRefreshToken(), isNull);
    });

    test('5. RoutersNotifier preserves cached routers on network failure and does not return empty list', () async {
      // Pre-seed local cache with 3 routers
      final cached = [
        RouterDeviceModel(id: 'r1', name: 'Station-01', host: '172.16.0.1', isOnline: true),
        RouterDeviceModel(id: 'r2', name: 'Station-02', host: '172.16.0.2', isOnline: false),
        RouterDeviceModel(id: 'r3', name: 'Station-03', host: '172.16.0.3', isOnline: true),
      ];
      await storage.saveCachedRouters(cached);
      await storage.setSelectedRouterId('r2');

      final client = ApiClient(localStorage: storage);
      // Simulate network disconnection
      client.dio.httpClientAdapter = _MockHttpClientAdapter((options) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
          error: 'Connection refused',
        );
      });

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          apiClientProvider.overrideWithValue(client),
        ],
      );
      addTearDown(container.dispose);

      // Fetch routers should gracefully fallback to cached routers
      final routers = await container.read(routersProvider.future);
      expect(routers.length, 3);
      expect(routers[0].name, 'Station-01');
      expect(container.read(selectedRouterIdProvider), 'r2');
    });

    testWidgets('6. DashboardScreen displays error card on network failure, NEVER "لم يتم ربط راوتر نشط"', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      // Provider container where routersProvider is in error state with no cache
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          routersProvider.overrideWith(() => _ErrorRoutersNotifier()),
          selectedRouterIdProvider.overrideWith(() => _MockSelectedRouterNotifier()),
          activeSessionsProvider.overrideWith(() => _MockActiveSessionsNotifier()),
          financialReportProvider.overrideWith(() => _MockFinancialReportNotifier()),
          tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          currentUserProvider.overrideWith(() => _MockCurrentUserNotifier()),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: DashboardScreen(),
            ),
          ),
        ),
      );

      for (int i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pumpAndSettle();

      // Expect specific error banner
      expect(find.text('تعذر تحديث بيانات أجهزة الراوتر'), findsOneWidget);
      expect(find.text('إعادة المحاولة'), findsOneWidget);

      // STRICT CHECK: The misleading "لم يتم ربط راوتر نشط" card MUST NOT be shown!
      expect(find.text('لم يتم ربط راوتر نشط'), findsNothing);
    });

    testWidgets('7. DashboardScreen displays 4 routers and active status when data loads successfully', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      final fourRouters = [
        RouterDeviceModel(id: 'r1', name: 'Main Core', host: '192.168.88.1', isOnline: true, cpuLoad: 24, rosVersion: 'V7'),
        RouterDeviceModel(id: 'r2', name: 'East Tower', host: '192.168.88.2', isOnline: false, rosVersion: 'V7'),
        RouterDeviceModel(id: 'r3', name: 'West Tower', host: '192.168.88.3', isOnline: true, cpuLoad: 12, rosVersion: 'V7'),
        RouterDeviceModel(id: 'r4', name: 'Market Hub', host: '192.168.88.4', isOnline: true, cpuLoad: 35, rosVersion: 'V7'),
      ];

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          routersProvider.overrideWith(() => _SuccessRoutersNotifier(fourRouters)),
          selectedRouterIdProvider.overrideWith(() => _MockSelectedRouterNotifier(initialId: 'r1')),
          activeSessionsProvider.overrideWith(() => _MockActiveSessionsNotifier()),
          financialReportProvider.overrideWith(() => _MockFinancialReportNotifier()),
          tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          currentUserProvider.overrideWith(() => _MockCurrentUserNotifier()),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: DashboardScreen(),
            ),
          ),
        ),
      );

      for (int i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pumpAndSettle();

      // Verify router header and health card are rendered
      expect(find.text('Main Core (192.168.88.1)'), findsOneWidget);
      expect(find.text('المعالج CPU'), findsOneWidget);
      expect(find.text('24%'), findsOneWidget);
      expect(find.text('الذاكرة RAM'), findsOneWidget);
      expect(find.text('القرص DISK'), findsOneWidget);
      expect(find.text('متصل'), findsOneWidget);
      expect(find.text('لم يتم ربط راوتر نشط'), findsNothing);
    });

    testWidgets('8. DashboardScreen ONLY displays "لم يتم ربط راوتر نشط" when account genuinely has 0 routers', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          routersProvider.overrideWith(() => _SuccessRoutersNotifier([])),
          selectedRouterIdProvider.overrideWith(() => _MockSelectedRouterNotifier(initialId: null)),
          activeSessionsProvider.overrideWith(() => _MockActiveSessionsNotifier()),
          financialReportProvider.overrideWith(() => _MockFinancialReportNotifier()),
          tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          currentUserProvider.overrideWith(() => _MockCurrentUserNotifier()),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: DashboardScreen(),
            ),
          ),
        ),
      );

      for (int i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pumpAndSettle();

      // Only on confirmed empty data list:
      expect(find.text('لم يتم ربط راوتر نشط'), findsOneWidget);
      expect(find.text('تهيئة'), findsOneWidget);
    });
  });
}

class _MockHttpClientAdapter implements HttpClientAdapter {
  final FutureOr<ResponseBody> Function(RequestOptions options) handler;

  _MockHttpClientAdapter(this.handler);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

class _ErrorRoutersNotifier extends RoutersNotifier {
  @override
  Future<List<RouterDeviceModel>> build() async {
    throw Exception('Connection failed');
  }
}

class _SuccessRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> routers;
  _SuccessRoutersNotifier(this.routers);

  @override
  Future<List<RouterDeviceModel>> build() async {
    return routers;
  }
}

class _MockSelectedRouterNotifier extends SelectedRouterNotifier {
  final String? initialId;
  _MockSelectedRouterNotifier({this.initialId});

  @override
  String? build() => initialId;
}

class _MockCurrentUserNotifier extends CurrentUserNotifier {
  @override
  AuthUser? build() {
    return AuthUser(
      id: 'usr-1',
      email: 'admin@sudafi.sd',
      fullName: 'مدير النظام',
      role: 'TENANT_ADMIN',
      tenantId: 'tenant-1',
    );
  }
}

class _MockActiveSessionsNotifier extends ActiveSessionsNotifier {
  @override
  Future<List<ActiveSessionModel>> build() async => [];
}

class _MockFinancialReportNotifier extends FinancialReportNotifier {
  @override
  Future<FinancialReportModel> build() async {
    return FinancialReportModel.fromJson({});
  }
}

class _MockTenantQuotaNotifier extends TenantQuotaNotifier {
  @override
  Future<TenantQuotaModel?> build() async => null;
}

