import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/services/mikrotik_discovery_service.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/router_setup/presentation/router_setup_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _StubHttpClientAdapter implements HttpClientAdapter {
  final FutureOr<ResponseBody> Function(RequestOptions options) onFetch;

  _StubHttpClientAdapter(this.onFetch);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return onFetch(options);
  }

  @override
  void close({bool force = false}) {}
}

class _FakeDiscoveryService extends MikrotikDiscoveryService {
  final List<DiscoveredRouterModel> fakeDiscovered;

  _FakeDiscoveryService(this.fakeDiscovered);

  @override
  Stream<DiscoveredRouterModel> discoverStream({
    Duration timeout = const Duration(seconds: 10),
    void Function(double progress, String status)? onProgress,
  }) async* {
    onProgress?.call(1.0, 'تم الفحص');
    for (final r in fakeDiscovered) {
      yield r;
    }
  }

  @override
  Future<Map<String, dynamic>> verifyCredentialsLocally({
    required String host,
    required String username,
    required String password,
    int apiPort = 8728,
    int restPort = 80,
    String rosVersion = 'V7',
    bool useSsl = false,
  }) async {
    return {
      'success': true,
      'latencyMs': 42,
      'message': 'تم الاتصال والمصادقة محلياً من الهاتف بنجاح',
      'routerInfo': {
        'model': 'hAP ax^2',
        'version': '7.23.8 (long-term)',
        'cpuLoad': 2,
      },
    };
  }
}

class _FakeSaveRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> initialRouters;
  final List<Map<String, dynamic>> saveCalls = [];
  bool failNextSaveWithNetworkError = false;

  _FakeSaveRoutersNotifier(this.initialRouters);

  @override
  Future<List<RouterDeviceModel>> build() async => initialRouters;

  @override
  Future<Map<String, dynamic>> saveRouter(Map<String, dynamic> data, {String? id}) async {
    saveCalls.add({'id': id, 'data': data});
    if (failNextSaveWithNetworkError) {
      return {
        'success': false,
        'isNetworkError': true,
        'message': 'تعذر الوصول إلى سيرفر النظام لحفظ الراوتر — تأكد من توفر إنترنت على الهاتف ثم أعد المحاولة.',
      };
    }

    final savedId = id ?? 'new-router-uuid';
    return {
      'success': true,
      'data': {
        'id': savedId,
        'name': data['name'] ?? 'Router',
        'host': data['host'],
        'apiPort': data['apiPort'] ?? 8728,
        'restPort': data['restPort'] ?? 80,
        'useSsl': data['useSsl'] ?? false,
        'username': data['username'] ?? 'admin',
        'rosVersion': data['rosVersion'] ?? 'V7',
      },
    };
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('parseApiError & RoutersNotifier.saveRouter resilience', () {
    test('parseApiError reads top-level message, nested error.message, arrays, and network timeouts cleanly', () {
      final topLevelErr = DioException(
        requestOptions: RequestOptions(path: '/devices'),
        response: Response(
          requestOptions: RequestOptions(path: '/devices'),
          statusCode: 409,
          data: {
            'success': false,
            'message': 'الراوتر مسجل مسبقاً',
            'error': {'code': 'DEVICE_EXISTS', 'message': 'رسالة داخلية'},
          },
        ),
      );
      expect(parseApiError(topLevelErr, fallback: 'fallback').message, 'الراوتر مسجل مسبقاً');

      final nestedOnlyErr = DioException(
        requestOptions: RequestOptions(path: '/devices'),
        response: Response(
          requestOptions: RequestOptions(path: '/devices'),
          statusCode: 403,
          data: {
            'success': false,
            'error': {'code': 'ROUTER_LIMIT_EXCEEDED', 'message': 'تم الوصول للحد الأقصى للراوترات في باقتك'},
          },
        ),
      );
      final parsedNested = parseApiError(nestedOnlyErr, fallback: 'fallback');
      expect(parsedNested.message, 'تم الوصول للحد الأقصى للراوترات في باقتك');
      expect(parsedNested.isNetworkError, isFalse);

      final arrayErr = DioException(
        requestOptions: RequestOptions(path: '/devices'),
        response: Response(
          requestOptions: RequestOptions(path: '/devices'),
          statusCode: 400,
          data: {
            'error': {'message': ['host required', 'name required']},
          },
        ),
      );
      expect(parseApiError(arrayErr, fallback: 'fallback').message, 'host required | name required');

      final offlineErr = DioException(
        requestOptions: RequestOptions(path: '/devices'),
        type: DioExceptionType.connectionError,
        message: 'SocketException: Failed host lookup',
      );
      final parsedOffline = parseApiError(offlineErr, fallback: 'fallback');
      expect(parsedOffline.isNetworkError, isTrue);
      expect(parsedOffline.message, contains('اتصال بالإنترنت'));
    });

    test('saveRouter preserves success even when follow-up GET /devices refresh fails, and surfaces nested error.message', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);
      await storage.setToken('jwt-test-token');

      bool rejectPostWith403 = false;

      final apiClient = ApiClient(localStorage: storage);
      apiClient.dio.httpClientAdapter = _StubHttpClientAdapter((options) async {
        if (options.method == 'POST' && options.path.contains('devices')) {
          if (rejectPostWith403) {
            return ResponseBody.fromString(
              jsonEncode({
                'success': false,
                'error': {
                  'code': 'ROUTER_LIMIT_EXCEEDED',
                  'message': 'تم الوصول للحد الأقصى للراوترات في باقتك',
                },
              }),
              403,
              headers: {
                Headers.contentTypeHeader: [Headers.jsonContentType],
              },
            );
          }
          return ResponseBody.fromString(
            jsonEncode({
              'success': true,
              'data': {
                'id': 'saved-device-99',
                'name': 'FASTT NET',
                'host': '192.168.1.147',
                'apiPort': 8728,
                'restPort': 80,
                'useSsl': false,
                'username': 'admin',
                'rosVersion': 'V7',
                'status': 'OFFLINE',
              },
            }),
            201,
            headers: {
              Headers.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        }

        if (options.method == 'GET' && options.path.contains('devices')) {
          throw DioException(
            requestOptions: options,
            type: DioExceptionType.connectionTimeout,
          );
        }

        return ResponseBody.fromString('{}', 200);
      });

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          apiClientProvider.overrideWithValue(apiClient),
        ],
      );
      addTearDown(container.dispose);

      // 1. Save succeeds even if follow-up GET /devices times out
      final okRes = await container.read(routersProvider.notifier).saveRouter({
        'name': 'FASTT NET',
        'host': '192.168.1.147',
        'apiPort': 8728,
        'restPort': 80,
        'username': 'admin',
        'password': 'MIX25110',
        'rosVersion': 'V7',
        'useSsl': false,
      });
      expect(okRes['success'], isTrue);
      expect(container.read(routersProvider).asData?.value.any((r) => r.id == 'saved-device-99'), isTrue);

      // 2. When server returns 403 nested error.message without top-level message, saveRouter extracts exact Arabic text
      rejectPostWith403 = true;
      final errRes = await container.read(routersProvider.notifier).saveRouter({
        'name': 'Router 2',
        'host': '192.168.1.148',
        'username': 'admin',
        'password': '123',
      });
      expect(errRes['success'], isFalse);
      expect(errRes['isNetworkError'], isFalse);
      expect(errRes['message'], 'تم الوصول للحد الأقصى للراوترات في باقتك');
    });
  });

  group('RouterSetupScreen Step 1 target separation & save error recovery', () {
    testWidgets('switching to "إضافة كراوتر جديد منفصل" clears old device ID, and preserves green local test card when server save fails', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      final existingRouter = RouterDeviceModel(
        id: 'existing-r1',
        name: 'Old Tower',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 80,
        rosVersion: 'V7',
        useSsl: false,
        username: 'admin',
      );
      final fakeNotifier = _FakeSaveRoutersNotifier([existingRouter])..failNextSaveWithNetworkError = true;
      final fakeDiscovery = _FakeDiscoveryService([
        const DiscoveredRouterModel(
          ip: '192.168.1.147',
          identity: 'FASTT NET',
          openPorts: [80, 8728],
          rosVersion: 'V7',
        ),
      ]);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            routersProvider.overrideWith(() => fakeNotifier),
            mikrotikDiscoveryServiceProvider.overrideWithValue(fakeDiscovery),
          ],
          child: const MaterialApp(
            home: RouterSetupScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Switch to Manual Mode while existingRouter is initially selected
      await tester.tap(find.text('إدخال يدوي'));
      await tester.pumpAndSettle();

      expect(find.textContaining('سيتم تحديث الراوتر المحفوظ [Old Tower]'), findsOneWidget);
      expect(find.text('إضافة كراوتر جديد منفصل'), findsOneWidget);

      // Tap "إضافة كراوتر جديد منفصل" to detach from existing-r1
      await tester.tap(find.text('إضافة كراوتر جديد منفصل'));
      await tester.pumpAndSettle();

      expect(find.text('سيتم إضافة هذا الجهاز كراوتر جديد منفصل في الحساب'), findsOneWidget);

      // Enter password and new host so local test runs
      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(1), '192.168.1.147');
      await tester.enterText(fields.at(4), 'MIX25110');

      await tester.ensureVisible(find.text('اختبار الاتصال المباشر والمصادقة'));
      await tester.tap(find.text('اختبار الاتصال المباشر والمصادقة'));
      await tester.pumpAndSettle();

      // Must call POST (id: null) rather than PATCH existing-r1
      expect(fakeNotifier.saveCalls.length, 1);
      expect(fakeNotifier.saveCalls.first['id'], isNull);

      // Green router test result MUST remain intact while distinct Server Save Error card shows Retry button
      expect(find.text('تم الاتصال والمصادقة بنجاح'), findsOneWidget);
      expect(find.text('فشل فحص الاتصال'), findsNothing);
      expect(find.text('تعذر الوصول إلى السيرفر لحفظ الراوتر'), findsOneWidget);
      expect(find.text('إعادة محاولة الحفظ في السيرفر'), findsOneWidget);
      expect(find.text('أكمل حفظ الراوتر في السيرفر للمتابعة'), findsOneWidget);

      // Now restore network and tap Retry -> must succeed and enable Next step
      fakeNotifier.failNextSaveWithNetworkError = false;
      await tester.ensureVisible(find.text('إعادة محاولة الحفظ في السيرفر'));
      await tester.tap(find.text('إعادة محاولة الحفظ في السيرفر'));
      await tester.pumpAndSettle();

      expect(fakeNotifier.saveCalls.length, 2);
      expect(fakeNotifier.saveCalls.last['id'], isNull);
      expect(find.text('تعذر الوصول إلى السيرفر لحفظ الراوتر'), findsNothing);
      expect(find.text('أكمل حفظ الراوتر في السيرفر للمتابعة'), findsNothing);
    });

    testWidgets('selecting an unmatched discovered router automatically switches to new-router mode instead of overwriting saved router', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      final existingRouter = RouterDeviceModel(
        id: 'existing-r1',
        name: 'Old Tower',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 80,
        rosVersion: 'V7',
        useSsl: false,
        username: 'admin',
      );
      final fakeNotifier = _FakeSaveRoutersNotifier([existingRouter]);
      final fakeDiscovery = _FakeDiscoveryService([
        const DiscoveredRouterModel(
          ip: '192.168.1.147',
          identity: 'FASTT NET',
          openPorts: [80, 8728],
          rosVersion: 'V7',
        ),
      ]);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            routersProvider.overrideWith(() => fakeNotifier),
            mikrotikDiscoveryServiceProvider.overrideWithValue(fakeDiscovery),
          ],
          child: const MaterialApp(
            home: RouterSetupScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Switch to Discovery tab, scan, and select FASTT NET (192.168.1.147)
      await tester.tap(find.text('البحث التلقائي'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('البحث عن راوترات MikroTik على الشبكة'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('اختيار هذا الراوتر وإضافته'));
      await tester.tap(find.text('اختيار هذا الراوتر وإضافته'));
      await tester.pumpAndSettle();

      // Must NOT stay bound to Old Tower (existing-r1)!
      expect(find.text('سيتم إضافة هذا الجهاز كراوتر جديد منفصل في الحساب'), findsOneWidget);
      expect(find.textContaining('سيتم تحديث الراوتر المحفوظ [Old Tower]'), findsNothing);
    });
  });
}
