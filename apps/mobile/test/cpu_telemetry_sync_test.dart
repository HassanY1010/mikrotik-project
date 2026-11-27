import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/services/mikrotik_discovery_service.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeStorage extends LocalStorage {
  _FakeStorage(super.prefs);
  final List<RouterDeviceModel> saved = [];
  int saveCount = 0;

  @override
  Future<void> saveCachedRouters(List<RouterDeviceModel> routers, [String? tenantId]) async {
    saveCount++;
    saved
      ..clear()
      ..addAll(routers);
  }

  @override
  List<RouterDeviceModel> getCachedRouters([String? expectedTenantId]) => saved;
}

class _FakeDiscovery extends MikrotikDiscoveryService {
  final List<int> cpuSequence;
  int _idx = 0;
  int callCount = 0;
  Duration delay = Duration.zero;
  bool shouldFail = false;
  bool shouldThrowTimeout = false;

  _FakeDiscovery(this.cpuSequence);

  @override
  Future<Map<String, dynamic>> fetchLiveCpuAndResourcesLocally({
    required String host,
    required String username,
    required String password,
    int apiPort = 8728,
    int restPort = 80,
    String rosVersion = 'V7',
    bool useSsl = false,
  }) async {
    callCount++;
    if (delay > Duration.zero) {
      await Future.delayed(delay);
    }
    if (shouldThrowTimeout) {
      throw TimeoutException('Simulated router timeout');
    }
    if (shouldFail) {
      return {
        'success': false,
        'code': 'CONNECTION_FAILED',
        'message': 'انقطع الاتصال بالراوتر',
      };
    }
    final cpu = cpuSequence[_idx < cpuSequence.length ? _idx : cpuSequence.length - 1];
    _idx++;
    return {
      'success': true,
      'code': 'CONNECTED_SUCCESS',
      'latencyMs': 12,
      'verifiedAt': DateTime.now().toUtc().toIso8601String(),
      'routerInfo': {
        'cpuLoad': cpu,
        'memoryFree': 500000000,
        'memoryTotal': 1000000000,
        'diskFree': 50000000,
        'diskTotal': 100000000,
        'uptime': '1h',
      },
    };
  }
}

class _TestRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> initial;
  _TestRoutersNotifier(this.initial);

  @override
  Future<List<RouterDeviceModel>> build() async => initial;
}

class _FakeApiClient extends ApiClient {
  final List<Map<String, dynamic>> postedPayloads = [];
  final List<String> postedPaths = [];
  bool failPosts = false;

  _FakeApiClient({required super.localStorage});

  @override
  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    postedPaths.add(path);
    if (data is Map) {
      postedPayloads.add(Map<String, dynamic>.from(data));
    }
    if (failPosts) {
      throw DioException(
        requestOptions: RequestOptions(path: path),
        type: DioExceptionType.connectionError,
      );
    }
    return Response<T>(
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
      data: {'success': true, 'data': {}} as T,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SharedPreferences prefs;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    RouterSyncCoordinator.resetDiagnostics();
  });

  RouterDeviceModel makeRouter({int? cpuLoad = 1}) => RouterDeviceModel(
        id: 'dev-cpu-1',
        name: 'RB750Gr3',
        host: '192.168.88.1',
        username: 'admin',
        apiPort: 8728,
        restPort: 80,
        rosVersion: 'V7',
        isOnline: true,
        status: 'ONLINE',
        cpuLoad: cpuLoad,
      );

  group('CPU Telemetry Sync & Ordering Tests', () {
    test('1 & 2. Sequential CPU readings 1 -> 2 -> 3 -> 4 are all delivered in exact order without dropping', () async {
      final storage = _FakeStorage(prefs);
      final discovery = _FakeDiscovery([1, 2, 3, 4]);
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 0)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);
      notifier.cacheSessionPassword('dev-cpu-1', 'pass123');

      final observed = <int?>[];
      for (int i = 0; i < 4; i++) {
        final updated = await notifier.pollRouterTelemetry('dev-cpu-1');
        observed.add(updated?.cpuLoad);
      }

      expect(observed, equals([1, 2, 3, 4]));
      expect(discovery.callCount, equals(4));
    });

    test('3 & 4. Overlapping poll while slow request is in flight is skipped without stacking', () async {
      final storage = _FakeStorage(prefs);
      final discovery = _FakeDiscovery([10, 20])..delay = const Duration(milliseconds: 120);
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 5)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);
      notifier.cacheSessionPassword('dev-cpu-1', 'pass123');

      final f1 = notifier.pollRouterTelemetry('dev-cpu-1');
      final f2 = notifier.pollRouterTelemetry('dev-cpu-1'); // overlaps f1
      final results = await Future.wait([f1, f2]);

      expect(results[0]?.cpuLoad, equals(10));
      expect(results[1], isNull); // skipped overlap
      expect(discovery.callCount, equals(1));
    });

    test('5 & 8. Out-of-order stale seq response is rejected and never overwrites newer CPU', () async {
      final storage = _FakeStorage(prefs);
      final discovery = _FakeDiscovery([1]);
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 1)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);

      final seqOld = RouterSyncCoordinator.nextSeq('dev-cpu-seq');
      final seqNew = RouterSyncCoordinator.nextSeq('dev-cpu-seq');

      // Newer arrives first with CPU=8
      await notifier.reportLocalTelemetry(
        deviceId: 'dev-cpu-1',
        verificationResult: {
          'success': true,
          'routerInfo': {'cpuLoad': 8},
        },
        reportedHost: '192.168.88.1',
        seq: seqNew,
        skipCloudSync: true,
      );

      // Simulate seqOld recorded on dev-cpu-seq
      RouterSyncCoordinator.recordSeq('dev-cpu-seq', seqNew);
      expect(RouterSyncCoordinator.isSeqStale('dev-cpu-seq', seqOld), isTrue);

      // Also verify reportLocalTelemetry rejects stale seq on same device
      final resStale = await notifier.reportLocalTelemetry(
        deviceId: 'dev-cpu-seq',
        verificationResult: {
          'success': true,
          'routerInfo': {'cpuLoad': 2},
        },
        reportedHost: '192.168.88.1',
        seq: seqOld,
        skipCloudSync: true,
      );
      expect(resStale, isNull);
    });

    test('6. Connection drop clears CPU cleanly and reconnection resumes live CPU updates', () async {
      final storage = _FakeStorage(prefs);
      final discovery = _FakeDiscovery([5, 9]);
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 5)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);
      notifier.cacheSessionPassword('dev-cpu-1', 'pass123');

      final r1 = await notifier.pollRouterTelemetry('dev-cpu-1');
      expect(r1?.cpuLoad, equals(5));
      expect(r1?.isEffectiveOnline, isTrue);

      discovery.shouldFail = true;
      final r2 = await notifier.pollRouterTelemetry('dev-cpu-1');
      expect(r2?.isEffectiveOnline, isFalse);
      expect(r2?.cpuLoad, isNull);

      discovery.shouldFail = false;
      final r3 = await notifier.pollRouterTelemetry('dev-cpu-1');
      expect(r3?.isEffectiveOnline, isTrue);
      expect(r3?.cpuLoad, equals(9));
    });

    test('7. Constant CPU skips redundant disk cache writes', () async {
      final storage = _FakeStorage(prefs);
      final discovery = _FakeDiscovery([4, 4, 4]);
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 4)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);
      notifier.cacheSessionPassword('dev-cpu-1', 'pass123');

      await notifier.pollRouterTelemetry('dev-cpu-1');
      final savesAfterFirst = storage.saveCount;
      await notifier.pollRouterTelemetry('dev-cpu-1');
      await notifier.pollRouterTelemetry('dev-cpu-1');

      expect(storage.saveCount, equals(savesAfterFirst));
    });
  });

  group('CPU Telemetry Diagnostics Instrumentation Tests', () {
    test('D1. Measures rttMs and monotonic deltaMs accurately across consecutive samples', () async {
      final storage = _FakeStorage(prefs);
      final discovery = _FakeDiscovery([10, 11])..delay = const Duration(milliseconds: 40);
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 0)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);
      notifier.cacheSessionPassword('dev-cpu-1', 'pass123');

      await notifier.pollRouterTelemetry('dev-cpu-1');
      final snap1 = RouterSyncCoordinator.getDiagnostics('dev-cpu-1');
      expect(snap1.lastRttMs, greaterThanOrEqualTo(30));
      expect(snap1.lastDeltaMs, isNull);
      expect(snap1.lastSampleMonotonicMs, isNotNull);
      expect(snap1.successCount, equals(1));

      await Future.delayed(const Duration(milliseconds: 30));
      await notifier.pollRouterTelemetry('dev-cpu-1');
      final snap2 = RouterSyncCoordinator.getDiagnostics('dev-cpu-1');
      expect(snap2.lastRttMs, greaterThanOrEqualTo(30));
      expect(snap2.lastDeltaMs, greaterThanOrEqualTo(60));
      expect(snap2.lastSampleMonotonicMs!, greaterThan(snap1.lastSampleMonotonicMs!));
      expect(snap2.successCount, equals(2));
    });

    test('D2. Increments skippedOverlaps counter when overlapping poll cycle is skipped', () async {
      final storage = _FakeStorage(prefs);
      final discovery = _FakeDiscovery([12, 13])..delay = const Duration(milliseconds: 100);
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 5)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);
      notifier.cacheSessionPassword('dev-cpu-1', 'pass123');

      final f1 = notifier.pollRouterTelemetry('dev-cpu-1');
      final f2 = notifier.pollRouterTelemetry('dev-cpu-1');
      final f3 = notifier.pollRouterTelemetry('dev-cpu-1');
      await Future.wait([f1, f2, f3]);

      final diag = RouterSyncCoordinator.getDiagnostics('dev-cpu-1');
      expect(diag.skippedOverlaps, equals(2));
      expect(diag.successCount, equals(1));
    });

    test('D3. Failed and timed-out requests increment failure/timeout counters and never successCount', () async {
      final storage = _FakeStorage(prefs);
      final discovery = _FakeDiscovery([7]);
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 7)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);
      notifier.cacheSessionPassword('dev-cpu-1', 'pass123');

      discovery.shouldFail = true;
      await notifier.pollRouterTelemetry('dev-cpu-1');
      var diag = RouterSyncCoordinator.getDiagnostics('dev-cpu-1');
      expect(diag.successCount, equals(0));
      expect(diag.failureCount, equals(1));
      expect(diag.timeoutCount, equals(0));

      discovery.shouldFail = false;
      discovery.shouldThrowTimeout = true;
      await notifier.pollRouterTelemetry('dev-cpu-1');
      diag = RouterSyncCoordinator.getDiagnostics('dev-cpu-1');
      expect(diag.successCount, equals(0));
      expect(diag.failureCount, equals(2));
      expect(diag.timeoutCount, equals(1));

      discovery.shouldThrowTimeout = false;
      await notifier.pollRouterTelemetry('dev-cpu-1');
      diag = RouterSyncCoordinator.getDiagnostics('dev-cpu-1');
      expect(diag.successCount, equals(1));
      expect(diag.failureCount, equals(2));
      expect(diag.timeoutCount, equals(1));
    });

    test('D4. Diagnostics instrumentation does not alter reading order or displayed CPU values', () async {
      final storage = _FakeStorage(prefs);
      final discovery = _FakeDiscovery([1, 2, 3, 4]);
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 0)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);
      notifier.cacheSessionPassword('dev-cpu-1', 'pass123');

      final observed = <int?>[];
      for (var i = 0; i < 4; i++) {
        final updated = await notifier.pollRouterTelemetry('dev-cpu-1');
        observed.add(updated?.cpuLoad);
      }

      final diag = RouterSyncCoordinator.getDiagnostics('dev-cpu-1');
      expect(observed, equals([1, 2, 3, 4]));
      expect(diag.successCount, equals(4));
      expect(diag.failureCount, equals(0));
      expect(diag.skippedOverlaps, equals(0));
      expect(diag.lastCpuLoad, equals(4));
    });

    test('D5. Flushes cpuDiagnostics batch to existing /devices/:id/local-telemetry endpoint', () async {
      final storage = _FakeStorage(prefs);
      final apiClient = _FakeApiClient(localStorage: storage);
      final discovery = _FakeDiscovery([11, 12]);
      final routerD5 = RouterDeviceModel(
        id: 'dev-cpu-d5',
        name: 'RB750Gr3',
        host: '192.168.88.1',
        username: 'admin',
        apiPort: 8728,
        restPort: 80,
        rosVersion: 'V7',
        isOnline: true,
        status: 'ONLINE',
        cpuLoad: 10,
      );
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          apiClientProvider.overrideWithValue(apiClient),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([routerD5])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);
      notifier.cacheSessionPassword('dev-cpu-d5', 'pass123');

      await notifier.pollRouterTelemetry('dev-cpu-d5');
      await Future<void>.delayed(const Duration(milliseconds: 20));

      expect(apiClient.postedPaths, contains('/devices/dev-cpu-d5/local-telemetry'));
      final sent = apiClient.postedPayloads.last;
      expect(sent['cpuDiagnostics'], isA<List>());
      final batch = List<Map<String, dynamic>>.from(sent['cpuDiagnostics'] as List);
      expect(batch.length, equals(1));
      expect(batch.first['seq'], greaterThanOrEqualTo(1));
      expect(batch.first['status'], equals('OK'));
      expect(batch.first['cpuLoad'], equals(11));
      expect(batch.first['ok'], equals(1));
      expect(batch.first['timestamp'], isA<String>());
    });

    test('D6. Caps offline diagnostic queue at max 20 entries and resumes cleanly after reconnect', () async {
      final storage = _FakeStorage(prefs);
      final apiClient = _FakeApiClient(localStorage: storage)..failPosts = true;
      final discovery = _FakeDiscovery(List.generate(26, (i) => i + 1));
      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          apiClientProvider.overrideWithValue(apiClient),
          mikrotikDiscoveryServiceProvider.overrideWithValue(discovery),
          routersProvider.overrideWith(() => _TestRoutersNotifier([makeRouter(cpuLoad: 0)])),
        ],
      );
      addTearDown(container.dispose);

      await container.read(routersProvider.future);
      final notifier = container.read(routersProvider.notifier);

      // Record 25 samples directly while offline (no cloud flush yet)
      for (var i = 1; i <= 25; i++) {
        RouterSyncCoordinator.recordTelemetrySample(
          deviceId: 'dev-cpu-1',
          seq: i,
          rttMs: 15,
          success: true,
          cpuLoad: i,
        );
      }

      // First flush while offline fails, drains max 20 latest (seqs 6..25) without re-queuing
      await notifier.reportLocalTelemetry(
        deviceId: 'dev-cpu-1',
        verificationResult: {
          'success': true,
          'routerInfo': {'cpuLoad': 25},
        },
        reportedHost: '192.168.88.1',
        skipCloudSync: false,
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final failedPayload = apiClient.postedPayloads.last;
      final failedBatch = List<Map<String, dynamic>>.from(failedPayload['cpuDiagnostics'] as List);
      expect(failedBatch.length, equals(20));
      expect(failedBatch.first['seq'], equals(6));
      expect(failedBatch.last['seq'], equals(25));

      // Reconnect internet and send fresh sample -> only new sample is sent (no old pile-up)
      apiClient.failPosts = false;
      RouterSyncCoordinator.recordTelemetrySample(
        deviceId: 'dev-cpu-1',
        seq: 26,
        rttMs: 18,
        success: true,
        cpuLoad: 26,
      );
      await notifier.reportLocalTelemetry(
        deviceId: 'dev-cpu-1',
        verificationResult: {
          'success': true,
          'routerInfo': {'cpuLoad': 26},
        },
        reportedHost: '192.168.88.1',
        skipCloudSync: false,
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final recoveredPayload = apiClient.postedPayloads.last;
      final recoveredBatch = List<Map<String, dynamic>>.from(recoveredPayload['cpuDiagnostics'] as List);
      expect(recoveredBatch.length, equals(1));
      expect(recoveredBatch.first['seq'], equals(26));
    });
  });
}
