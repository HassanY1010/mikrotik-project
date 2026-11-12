import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/services/mikrotik_discovery_service.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/dashboard/presentation/dashboard_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _AllowLocalHttpOverrides extends HttpOverrides {}

class _StubAdapter implements HttpClientAdapter {
  final FutureOr<ResponseBody> Function(RequestOptions options) handler;
  _StubAdapter(this.handler);

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

ResponseBody _jsonBody(Map<String, dynamic> payload, {int statusCode = 200}) {
  return ResponseBody.fromString(
    jsonEncode(payload),
    statusCode,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

List<int> _encodeApiWord(String word) {
  final bytes = utf8.encode(word);
  final len = bytes.length;
  if (len < 0x80) {
    return [len, ...bytes];
  }
  return [((len >> 8) | 0x80), (len & 0xff), ...bytes];
}

List<int> _encodeSentence(List<String> words) {
  final out = <int>[];
  for (final w in words) {
    out.addAll(_encodeApiWord(w));
  }
  out.add(0);
  return out;
}

class _MockRouterOsBinaryServer {
  late final ServerSocket _server;
  final bool legacyMd5;
  final String expectedUser;
  final String expectedPassword;
  final Map<String, String> resourceAttrs;
  final List<Map<String, String>> activeSessions;
  final String challengeHex = '0102030405060708090a0b0c0d0e0f10';

  int get port => _server.port;

  _MockRouterOsBinaryServer({
    required this.legacyMd5,
    this.expectedUser = 'admin',
    this.expectedPassword = 'secret',
    Map<String, String>? resourceAttrs,
    this.activeSessions = const [],
  }) : resourceAttrs = resourceAttrs ??
            {
              'board-name': legacyMd5 ? 'RB951Ui-2HnD' : 'hAP ax^2',
              'version': legacyMd5 ? '6.49.10 (long-term)' : '7.16.1 (stable)',
              'cpu-load': '19',
              'free-memory': '${256 * 1024 * 1024}',
              'total-memory': '${512 * 1024 * 1024}',
              'free-hdd-space': '${40 * 1024 * 1024}',
              'total-hdd-space': '${128 * 1024 * 1024}',
              'uptime': '2d04:10:00',
            };

  Future<void> start() async {
    _server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    _server.listen(_handleClient);
  }

  Future<void> stop() async {
    await _server.close();
  }

  void _handleClient(Socket socket) {
    final buffer = <int>[];
    socket.listen(
      (chunk) {
        buffer.addAll(chunk);
        while (true) {
          final sentence = _tryConsumeSentence(buffer);
          if (sentence == null) break;
          _processSentence(socket, sentence);
        }
      },
      onError: (_) {},
    );
  }

  List<String>? _tryConsumeSentence(List<int> buf) {
    var offset = 0;
    final words = <String>[];
    while (true) {
      if (offset >= buf.length) return null;
      final first = buf[offset];
      if (first == 0) {
        buf.removeRange(0, offset + 1);
        return words;
      }
      int len;
      int headerLen;
      if ((first & 0x80) == 0) {
        len = first;
        headerLen = 1;
      } else {
        if (offset + 1 >= buf.length) return null;
        len = ((first & 0x3f) << 8) | buf[offset + 1];
        headerLen = 2;
      }
      if (offset + headerLen + len > buf.length) return null;
      final wordBytes = buf.sublist(offset + headerLen, offset + headerLen + len);
      words.add(utf8.decode(wordBytes, allowMalformed: true));
      offset += headerLen + len;
    }
  }

  void _processSentence(Socket socket, List<String> words) {
    if (words.isEmpty) return;
    final cmd = words.first;
    final attrs = <String, String>{};
    for (final w in words.skip(1)) {
      if (w.startsWith('=')) {
        final idx = w.indexOf('=', 1);
        if (idx > 1) {
          attrs[w.substring(1, idx)] = w.substring(idx + 1);
        }
      }
    }

    if (cmd == '/login') {
      if (attrs.isEmpty) {
        // Discovery probe
        socket.add(_encodeSentence(['!trap', '=message=not logged in']));
        socket.add(_encodeSentence(['!done']));
        return;
      }
      if (legacyMd5 && !attrs.containsKey('response')) {
        socket.add(_encodeSentence(['!done', '=ret=$challengeHex']));
        return;
      }
      if (legacyMd5 && attrs.containsKey('response')) {
        final challengeBytes = <int>[];
        for (var i = 0; i + 1 < challengeHex.length; i += 2) {
          challengeBytes.add(int.parse(challengeHex.substring(i, i + 2), radix: 16));
        }
        final digest = md5.convert([0, ...utf8.encode(expectedPassword), ...challengeBytes]).toString();
        if (attrs['name'] == expectedUser && attrs['response'] == '00$digest') {
          socket.add(_encodeSentence(['!done']));
        } else {
          socket.add(_encodeSentence(['!trap', '=message=invalid user name or password']));
          socket.add(_encodeSentence(['!done']));
        }
        return;
      }
      if (attrs['name'] == expectedUser && attrs['password'] == expectedPassword) {
        socket.add(_encodeSentence(['!done']));
      } else {
        socket.add(_encodeSentence(['!trap', '=message=invalid user name or password']));
        socket.add(_encodeSentence(['!done']));
      }
      return;
    }

    if (cmd == '/system/resource/print') {
      final reWords = ['!re', ...resourceAttrs.entries.map((e) => '=${e.key}=${e.value}')];
      socket.add(_encodeSentence(reWords));
      socket.add(_encodeSentence(['!done']));
      return;
    }

    if (cmd == '/ip/hotspot/active/print') {
      for (final s in activeSessions) {
        socket.add(_encodeSentence(['!re', ...s.entries.map((e) => '=${e.key}=${e.value}')]));
      }
      socket.add(_encodeSentence(['!done']));
      return;
    }

    socket.add(_encodeSentence(['!done']));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Stage 3 Hardening: Connectivity Unification, Local Telemetry & ROS 6/7 Verification', () {
    test('unwrapApiEnvelope handles TransformInterceptor envelopes and rejects false HTTP 200 payloads', () {
      final wrappedFailure = {
        'success': true,
        'data': {
          'success': false,
          'code': 'CLOUD_UNREACHABLE_PRIVATE_LAN',
          'isPrivateLan': true,
          'localPreserved': true,
          'message': 'تعذر الفحص من السحابة لعنوان خاص',
        },
      };

      final unwrapped = unwrapApiEnvelope(wrappedFailure);
      expect(unwrapped['success'], isFalse);
      expect(unwrapped['code'], 'CLOUD_UNREACHABLE_PRIVATE_LAN');
      expect(unwrapped['localPreserved'], isTrue);
      expect(unwrapped['isPrivateLan'], isTrue);

      final wrappedSuccess = {
        'success': true,
        'data': {
          'success': true,
          'latencyMs': 14,
          'message': 'تم الاتصال بنجاح',
        },
      };
      final unwrappedOk = unwrapApiEnvelope(wrappedSuccess);
      expect(unwrappedOk['success'], isTrue);
      expect(unwrappedOk['latencyMs'], 14);
    });

    test('RouterDeviceModel accurately identifies RFC1918/private LAN hosts and preserves RAM/Disk across LocalStorage round-trip', () async {
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();

      expect(RouterDeviceModel.isPrivateHost('192.168.88.1'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('10.5.50.1'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('172.16.0.1'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('172.31.255.1'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('172.15.0.1'), isFalse);
      expect(RouterDeviceModel.isPrivateHost('172.32.0.1'), isFalse);
      expect(RouterDeviceModel.isPrivateHost('198.51.100.10'), isFalse);

      final apiModel = RouterDeviceModel.fromJson({
        'id': 'dev-1',
        'name': 'FASTT NET',
        'host': '192.168.88.1',
        'rosVersion': 'V7',
        'isOnline': true,
        'status': 'ONLINE',
        'connectivityState': 'ONLINE',
        'localStatus': 'ONLINE',
        'cloudStatus': 'UNREACHABLE_PRIVATE_LAN',
        'lastVerifiedSource': 'LOCAL_LAN',
        'cpuLoad': 22,
        'memoryFree': 512 * 1024 * 1024,
        'memoryTotal': 1024 * 1024 * 1024,
        'diskFree': 64 * 1024 * 1024,
        'diskTotal': 128 * 1024 * 1024,
        'uptime': '1d05:30:00',
        'activeHotspotSessions': 8,
      });

      await storage.saveCachedRouters([apiModel]);
      final restored = storage.getCachedRouters();
      expect(restored, hasLength(1));
      expect(restored.first.memoryFreeMb, 512);
      expect(restored.first.memoryTotalMb, 1024);
      expect(restored.first.diskFreeMb, 64);
      expect(restored.first.diskTotalMb, 128);
      expect(restored.first.cpuLoad, 22);
      expect(restored.first.uptime, '1d05:30:00');
      expect(restored.first.lastVerifiedSource, 'LOCAL_LAN');
      expect(restored.first.activeHotspotSessions, 8);
    });

    test('MikrotikDiscoveryService verifies ROS 7 REST locally with full CPU/RAM/Disk/Uptime and active sessions', () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        try {
          server.listen((HttpRequest req) async {
            final auth = req.headers.value('authorization');
            final expected = 'Basic ${base64Encode(utf8.encode('admin:pass7'))}';
            if (auth != expected) {
              req.response.statusCode = 401;
              await req.response.close();
              return;
            }
            if (req.uri.path == '/rest/system/resource') {
              req.response
                ..statusCode = 200
                ..headers.contentType = ContentType.json
                ..write(jsonEncode({
                  'board-name': 'L009UiGS-RM',
                  'version': '7.16.2 (stable)',
                  'cpu-load': '14',
                  'free-memory': '${256 * 1024 * 1024}',
                  'total-memory': '${512 * 1024 * 1024}',
                  'free-hdd-space': '${48 * 1024 * 1024}',
                  'total-hdd-space': '${128 * 1024 * 1024}',
                  'uptime': '3d02:11:45',
                }));
            } else if (req.uri.path == '/rest/ip/hotspot/active') {
              req.response
                ..statusCode = 200
                ..headers.contentType = ContentType.json
                ..write(jsonEncode([
                  {'.id': '*1', 'user': 'card100', 'address': '10.5.50.25', 'mac-address': 'AA:BB:CC:DD:EE:FF', 'uptime': '10m', 'bytes-in': '1024', 'bytes-out': '2048'},
                  {'.id': '*2', 'user': 'card101', 'address': '10.5.50.26', 'mac-address': '11:22:33:44:55:66', 'uptime': '5m', 'bytes-in': '512', 'bytes-out': '1024'},
                ]));
            } else {
              req.response.statusCode = 404;
            }
            await req.response.close();
          });

          final discovery = MikrotikDiscoveryService();
          final res = await discovery.verifyCredentialsLocally(
            host: '127.0.0.1',
            username: 'admin',
            password: 'pass7',
            restPort: server.port,
            apiPort: 1,
            rosVersion: 'V7',
          );

          expect(res['success'], isTrue);
          final info = res['routerInfo'] as Map<String, dynamic>;
          expect(info['modelName'], 'L009UiGS-RM');
          expect(info['cpuLoad'], 14);
          expect(info['memoryFree'], 256 * 1024 * 1024);
          expect(info['memoryTotal'], 512 * 1024 * 1024);
          expect(info['diskFree'], 48 * 1024 * 1024);
          expect(info['diskTotal'], 128 * 1024 * 1024);
          expect(info['uptime'], '3d02:11:45');
          expect(info['activeHotspotSessions'], 2);

          // Invalid password rejected accurately
          final bad = await discovery.verifyCredentialsLocally(
            host: '127.0.0.1',
            username: 'admin',
            password: 'wrong',
            restPort: server.port,
            apiPort: 1,
            rosVersion: 'V7',
          );
          expect(bad['success'], isFalse);
          expect(bad['code'], 'INVALID_CREDENTIALS');
        } finally {
          await server.close(force: true);
        }
      }, _AllowLocalHttpOverrides());
    });

    test('MikrotikDiscoveryService verifies ROS 6 Binary API (MD5 Challenge-Response) and fetches local active sessions', () async {
      final binServer = _MockRouterOsBinaryServer(
        legacyMd5: true,
        expectedUser: 'admin',
        expectedPassword: 'ros6password',
        activeSessions: [
          {
            '.id': '*A1',
            'user': 'legacy_user_1',
            'address': '192.168.88.50',
            'mac-address': 'AA:11:BB:22:CC:33',
            'uptime': '25m',
            'bytes-in': '4096',
            'bytes-out': '8192',
          },
        ],
      );
      await binServer.start();
      addTearDown(() => binServer.stop());

      final discovery = MikrotikDiscoveryService();
      final ok = await discovery.verifyCredentialsLocally(
        host: '127.0.0.1',
        username: 'admin',
        password: 'ros6password',
        apiPort: binServer.port,
        rosVersion: 'V6',
      );

      expect(ok['success'], isTrue);
      final info = ok['routerInfo'] as Map<String, dynamic>;
      expect(info['modelName'], 'RB951Ui-2HnD');
      expect(info['rosVersion'], 'V6');
      expect(info['cpuLoad'], 19);
      expect(info['uptime'], '2d04:10:00');
      expect(info['activeHotspotSessions'], 1);

      final bad = await discovery.verifyCredentialsLocally(
        host: '127.0.0.1',
        username: 'admin',
        password: 'wrong-password',
        apiPort: binServer.port,
        rosVersion: 'V6',
      );
      expect(bad['success'], isFalse);
      expect(bad['code'], 'INVALID_CREDENTIALS');

      final sessions = await discovery.fetchLocalActiveSessions(
        device: RouterDeviceModel(
          id: 'r-v6',
          name: 'Legacy ROS6',
          host: '127.0.0.1',
          apiPort: binServer.port,
          rosVersion: 'V6',
        ),
        password: 'ros6password',
      );
      expect(sessions, hasLength(1));
      expect(sessions.first['user'], 'legacy_user_1');
    });

    test('RoutersNotifier.testConnection preserves local ONLINE state on CLOUD_UNREACHABLE_PRIVATE_LAN & uploads local-telemetry when session password is cached', () async {
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();
      final apiClient = ApiClient(localStorage: storage);

      var cloudTestCalls = 0;
      Map<String, dynamic>? uploadedTelemetry;

      final deviceJson = {
        'id': 'dev-lan-1',
        'name': 'FASTT NET',
        'host': '127.0.0.1',
        'apiPort': 8728,
        'restPort': 80,
        'useSsl': false,
        'username': 'admin',
        'rosVersion': 'V6',
        'isOnline': true,
        'status': 'ONLINE',
        'connectivityState': 'ONLINE',
        'isPrivateLan': true,
        'localStatus': 'ONLINE',
        'cloudStatus': 'UNREACHABLE_PRIVATE_LAN',
        'lastVerifiedSource': 'LOCAL_LAN',
        'cpuLoad': 12,
        'memoryFree': 256 * 1024 * 1024,
        'memoryTotal': 512 * 1024 * 1024,
        'diskFree': 40 * 1024 * 1024,
        'diskTotal': 128 * 1024 * 1024,
        'uptime': '1d',
      };

      final binServer = _MockRouterOsBinaryServer(
        legacyMd5: true,
        expectedUser: 'admin',
        expectedPassword: 'lan-password',
      );
      await binServer.start();
      addTearDown(() => binServer.stop());
      deviceJson['apiPort'] = binServer.port;

      apiClient.dio.httpClientAdapter = _StubAdapter((options) {
        if (options.path.contains('local-telemetry')) {
          uploadedTelemetry = Map<String, dynamic>.from(options.data as Map);
          return _jsonBody({
            'success': true,
            'data': {
              ...deviceJson,
              'cpuLoad': uploadedTelemetry!['cpuLoad'],
              'uptime': uploadedTelemetry!['uptime'],
            },
          });
        }
        if (options.path.contains('test-connection')) {
          cloudTestCalls++;
          return _jsonBody({
            'success': true,
            'data': {
              'success': false,
              'code': 'CLOUD_UNREACHABLE_PRIVATE_LAN',
              'isPrivateLan': true,
              'localPreserved': true,
              'message': 'تعذر الاتصال من السحابة لعنوان خاص؛ تم الإبقاء على آخر حالة محلية مؤكدة.',
            },
          });
        }
        if (options.path == 'devices' || options.path.endsWith('/devices')) {
          return _jsonBody({'success': true, 'data': [deviceJson]});
        }
        return _jsonBody({'success': true, 'data': []});
      });

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          apiClientProvider.overrideWithValue(apiClient),
        ],
      );
      addTearDown(() {
        RoutersNotifier.clearSessionPasswords();
        container.dispose();
      });

      final initialDevices = await container.read(routersProvider.future);
      expect(initialDevices, hasLength(1));

      // Case A: Without cached password & unreachable local socket port -> cloud returns CLOUD_UNREACHABLE_PRIVATE_LAN
      // First ensure even if cloud fails private LAN, device stays ONLINE in provider!
      final cloudPreservedRes = await container.read(routersProvider.notifier).testConnection('dev-lan-1');
      // 127.0.0.1 binds to real binServer port so localReachability probe succeeds too!
      expect(cloudPreservedRes['success'], isTrue);
      expect(container.read(routersProvider).asData!.value.first.isEffectiveOnline, isTrue);

      // Case B: With cached session password -> authenticates locally FIRST & skips failing cloud call
      cloudTestCalls = 0;
      container.read(routersProvider.notifier).cacheSessionPassword('dev-lan-1', 'lan-password');
      final localAuthRes = await container.read(routersProvider.notifier).testConnection('dev-lan-1');

      expect(cloudTestCalls, 0);
      expect(localAuthRes['success'], isTrue);
      expect(localAuthRes['source'], 'LOCAL_LAN');
      expect(uploadedTelemetry, isNotNull);
      expect(uploadedTelemetry!['isOnline'], isTrue);
      expect(uploadedTelemetry!['cpuLoad'], 19);
      expect(uploadedTelemetry!['uptime'], '2d04:10:00');
      expect(container.read(routersProvider).asData!.value.first.cpuLoad, 19);
    });

    test('Public IP disconnect marks ERROR & reconnect restores ONLINE + saveRouter caches updated password', () async {
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();
      final apiClient = ApiClient(localStorage: storage);
      RoutersNotifier.clearSessionPasswords();

      var serverOnline = false;
      var deviceJson = <String, dynamic>{
        'id': 'dev-pub-1',
        'name': 'Public Cloud Router',
        'host': '203.0.113.10',
        'apiPort': 8728,
        'restPort': 443,
        'useSsl': true,
        'rosVersion': 'V7',
        'username': 'admin',
        'isOnline': true,
        'status': 'ONLINE',
        'connectivityState': 'ONLINE',
        'isPrivateLan': false,
        'localStatus': 'UNKNOWN',
        'cloudStatus': 'ONLINE',
        'lastVerifiedSource': 'CLOUD',
        'cpuLoad': 10,
        'uptime': '1d00:00:00',
      };

      apiClient.dio.httpClientAdapter = _StubAdapter((options) {
        if (options.path.contains('test-connection')) {
          if (!serverOnline) {
            deviceJson = {
              ...deviceJson,
              'isOnline': false,
              'status': 'ERROR',
              'connectivityState': 'ERROR',
              'cloudStatus': 'ERROR',
              'lastError': 'Connection refused',
            };
            return _jsonBody({
              'success': true,
              'data': {
                'success': false,
                'code': 'CONNECTION_FAILED',
                'isPrivateLan': false,
                'message': 'Connection refused',
              },
            });
          }
          deviceJson = {
            ...deviceJson,
            'isOnline': true,
            'status': 'ONLINE',
            'connectivityState': 'ONLINE',
            'cloudStatus': 'ONLINE',
            'lastVerifiedSource': 'CLOUD',
            'lastError': null,
            'cpuLoad': 27,
            'uptime': '3d02:15:00',
          };
          return _jsonBody({
            'success': true,
            'data': {
              'success': true,
              'source': 'CLOUD',
              'device': deviceJson,
            },
          });
        }
        if (options.method == 'PATCH' && options.path.contains('devices/dev-pub-1')) {
          final patchData = Map<String, dynamic>.from(options.data as Map);
          deviceJson = {
            ...deviceJson,
            'name': patchData['name'] ?? deviceJson['name'],
          };
          return _jsonBody({'success': true, 'data': deviceJson});
        }
        if (options.path == 'devices' || options.path.endsWith('/devices')) {
          return _jsonBody({'success': true, 'data': [deviceJson]});
        }
        return _jsonBody({'success': true, 'data': []});
      });

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          apiClientProvider.overrideWithValue(apiClient),
        ],
      );
      addTearDown(() {
        RoutersNotifier.clearSessionPasswords();
        container.dispose();
      });

      await container.read(routersProvider.future);

      // 1) Disconnect on HTTP 200 with { success: false } must mark router ERROR, not ONLINE
      serverOnline = false;
      final disconnectRes = await container.read(routersProvider.notifier).testConnection('dev-pub-1');
      expect(disconnectRes['success'], isFalse);
      final disconnectedRouter = container.read(routersProvider).asData!.value.first;
      expect(disconnectedRouter.isEffectiveOnline, isFalse);
      expect(disconnectedRouter.status, 'ERROR');

      // 2) Reconnect recovery restores ONLINE and updates telemetry
      serverOnline = true;
      final reconnectRes = await container.read(routersProvider.notifier).testConnection('dev-pub-1');
      expect(reconnectRes['success'], isTrue);
      final recoveredRouter = container.read(routersProvider).asData!.value.first;
      expect(recoveredRouter.isEffectiveOnline, isTrue);
      expect(recoveredRouter.status, 'ONLINE');
      expect(recoveredRouter.cpuLoad, 27);
      expect(recoveredRouter.uptime, '3d02:15:00');

      // 3) saveRouter password update caches new session password immediately
      final saveRes = await container.read(routersProvider.notifier).saveRouter(
        {
          'name': 'Public Cloud Router Updated',
          'host': '203.0.113.10',
          'username': 'admin',
          'password': 'rotated-secret-password',
        },
        id: 'dev-pub-1',
      );
      expect(saveRes['success'], isTrue);
      expect(container.read(routersProvider).asData!.value.first.name, 'Public Cloud Router Updated');
      expect(container.read(routersProvider.notifier).getSessionPassword('dev-pub-1'), 'rotated-secret-password');
    });

    testWidgets('DashboardScreen keeps router status متصل & displays channel label + real telemetry even if sessionsAsync errors', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();
      final apiClient = ApiClient(localStorage: storage);

      apiClient.dio.httpClientAdapter = _StubAdapter((options) {
        if (options.path == 'devices' || options.path.endsWith('/devices')) {
          return _jsonBody({
            'success': true,
            'data': [
              {
                'id': 'dev-ui-1',
                'name': 'FASTT NET',
                'host': '192.168.88.1',
                'rosVersion': 'V7',
                'isOnline': true,
                'status': 'ONLINE',
                'connectivityState': 'ONLINE',
                'isPrivateLan': true,
                'localStatus': 'ONLINE',
                'cloudStatus': 'UNREACHABLE_PRIVATE_LAN',
                'lastVerifiedSource': 'LOCAL_LAN',
                'cpuLoad': 24,
                'memoryFree': 512 * 1024 * 1024,
                'memoryTotal': 1024 * 1024 * 1024,
                'diskFree': 64 * 1024 * 1024,
                'diskTotal': 128 * 1024 * 1024,
                'uptime': '2d04:10:00',
                'modelName': 'hAP ax^2',
              },
            ],
          });
        }
        if (options.path.contains('hotspot/sessions')) {
          return _jsonBody({'success': false, 'message': 'Cloud timeout'}, statusCode: 502);
        }
        if (options.path.contains('analytics/financial-report')) {
          return _jsonBody({
            'success': true,
            'data': {
              'todayRevenue': 0,
              'todaySalesCount': 0,
              'currency': 'SDG',
            },
          });
        }
        return _jsonBody({'success': true, 'data': []});
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            apiClientProvider.overrideWithValue(apiClient),
          ],
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: DashboardScreen(),
            ),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      expect(find.text('متصل'), findsOneWidget);
      expect(find.text('تحقق محلي عبر الشبكة (LAN)'), findsOneWidget);
      expect(find.text('24%'), findsOneWidget);
      expect(find.text('العمل: 2d04:10:00'), findsOneWidget);
      expect(find.text('غير متصل'), findsNothing);
    });
  });
}
