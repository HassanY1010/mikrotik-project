import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/services/mikrotik_discovery_service.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/auto_provisioning/models/auto_provisioning_models.dart';
import 'package:mobile/features/auto_provisioning/widgets/provisioning_common_widgets.dart';
import 'package:mobile/features/router_setup/presentation/router_setup_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

Uint8List _encodeApiWord(String w) {
  final data = utf8.encode(w);
  final len = data.length;
  final b = BytesBuilder(copy: false);
  if (len < 0x80) {
    b.addByte(len);
  } else {
    final v = len | 0x8000;
    b.add([(v >> 8) & 0xFF, v & 0xFF]);
  }
  b.add(data);
  return b.toBytes();
}

Uint8List _encodeApiSentence(List<String> words) {
  final b = BytesBuilder(copy: false);
  for (final w in words) {
    b.add(_encodeApiWord(w));
  }
  b.addByte(0);
  return b.toBytes();
}

List<List<String>> _decodeSentencesFromBuffer(List<int> buf) {
  final sentences = <List<String>>[];
  var words = <String>[];
  var pos = 0;
  while (pos < buf.length) {
    final first = buf[pos];
    int len;
    int hdr;
    if ((first & 0x80) == 0) {
      len = first;
      hdr = 1;
    } else if ((first & 0xC0) == 0x80 && pos + 1 < buf.length) {
      len = ((first & ~0x80) << 8) + buf[pos + 1];
      hdr = 2;
    } else {
      break;
    }
    pos += hdr;
    if (len == 0) {
      sentences.add(words);
      words = <String>[];
      continue;
    }
    if (pos + len > buf.length) break;
    words.add(utf8.decode(buf.sublist(pos, pos + len), allowMalformed: true));
    pos += len;
  }
  return sentences;
}

class _StubRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _routers;
  bool testDirectCalled = false;
  Map<String, dynamic>? lastPayload;

  _StubRoutersNotifier(this._routers);

  @override
  Future<List<RouterDeviceModel>> build() async => _routers;

  @override
  Future<Map<String, dynamic>> testConnectionDirect(Map<String, dynamic> payload) async {
    testDirectCalled = true;
    lastPayload = payload;
    return {
      'success': true,
      'message': 'تم الاتصال عبر الخادم بنجاح',
      'latencyMs': 18,
      'routerInfo': {
        'model': 'hAP ax2',
        'version': '7.16.2 (stable)',
        'rosVersion': '7.16.2 (stable)',
      },
    };
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('MikrotikDiscoveryService Local ROS7 Binary API Loopback Tests', () {
    test('authenticates over Binary API (port 8728 framing) when HTTP REST is closed and reports real ROS 7 version', () async {
      final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(server.close);

      // Reserve an unused closed HTTP REST port
      final closedHttp = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      final unusedRestPort = closedHttp.port;
      await closedHttp.close();

      server.listen((Socket client) {
        final rx = <int>[];
        var handledSentences = 0;
        client.listen((chunk) {
          rx.addAll(chunk);
          final sentences = _decodeSentencesFromBuffer(rx);
          while (handledSentences < sentences.length) {
            final s = sentences[handledSentences++];
            if (s.isEmpty) continue;
            if (s.first == '/login') {
              client.add(_encodeApiSentence(['!done']));
            } else if (s.first == '/system/resource/print') {
              client.add(_encodeApiSentence([
                '!re',
                '=version=7.16.2 (stable)',
                '=board-name=hAP ax2',
                '=model=hAP ax2',
              ]));
              client.add(_encodeApiSentence(['!done']));
            }
          }
        });
      });

      final service = MikrotikDiscoveryService();
      final res = await service.verifyCredentialsLocally(
        host: '127.0.0.1',
        username: 'admin',
        password: 'RealPassword#1',
        apiPort: server.port,
        restPort: unusedRestPort,
        rosVersion: 'V7',
        useSsl: false,
      );

      expect(res['success'], isTrue);
      expect(res['message'], contains('API'));
      expect((res['routerInfo'] as Map)['version'], '7.16.2 (stable)');
      expect((res['routerInfo'] as Map)['model'], 'hAP ax2');
    });

    test('rejects invalid credentials on Binary API (!trap invalid user name or password)', () async {
      final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(server.close);

      final closedHttp = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      final unusedRestPort = closedHttp.port;
      await closedHttp.close();

      server.listen((Socket client) {
        final rx = <int>[];
        var handledSentences = 0;
        client.listen((chunk) {
          rx.addAll(chunk);
          final sentences = _decodeSentencesFromBuffer(rx);
          while (handledSentences < sentences.length) {
            final s = sentences[handledSentences++];
            if (s.isNotEmpty && s.first == '/login') {
              client.add(_encodeApiSentence(['!trap', '=message=invalid user name or password']));
              client.add(_encodeApiSentence(['!done']));
            }
          }
        });
      });

      final service = MikrotikDiscoveryService();
      final res = await service.verifyCredentialsLocally(
        host: '127.0.0.1',
        username: 'admin',
        password: 'WrongPassword',
        apiPort: server.port,
        restPort: unusedRestPort,
        rosVersion: 'V7',
        useSsl: false,
      );

      expect(res['success'], isFalse);
      expect(res['message'], isNotEmpty);
    });
  });

  group('AutoProvisioning ROLLED_BACK / DEGRADED State & Legacy RouterSetupScreen ROS7 Setup Tests', () {
    test('AutoProvisionOperationModel marks ROLLED_BACK and FAILED as terminal statuses', () {
      final rolledBack = AutoProvisionOperationModel.fromJson({
        'id': 'op-rb',
        'deviceId': 'dev-1',
        'template': 'CLEAN_SETUP',
        'status': 'ROLLED_BACK',
        'progressPercent': 100,
        'totalSteps': 5,
        'totalCommands': 10,
        'succeededCommands': 4,
        'failedCommands': 1,
        'skippedCommands': 5,
      });
      expect(rolledBack.isTerminal, isTrue);
      expect(rolledBack.status, 'ROLLED_BACK');
    });

    testWidgets('Status badge & helpers render Arabic ROLLED_BACK and DEGRADED status cleanly', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => Column(
                children: [
                  ProvisioningStatusPill(
                    label: translateProvisionStatus('ROLLED_BACK'),
                    color: statusColorForProvision(context, 'ROLLED_BACK'),
                  ),
                  ProvisioningStatusPill(
                    label: translateProvisionStatus('DEGRADED'),
                    color: statusColorForProvision(context, 'DEGRADED'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      expect(translateProvisionStatus('ROLLED_BACK'), contains('تراجع'));
      expect(find.text(translateProvisionStatus('ROLLED_BACK')), findsOneWidget);
      expect(find.text(translateProvisionStatus('DEGRADED')), findsOneWidget);
    });

    testWidgets('RouterSetupScreen ACCOUNT mode with ROS7 & empty local password routes test through Backend without downgrading to V6', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      final ros7Router = RouterDeviceModel(
        id: 'r-ros7',
        name: 'ROS7 Lab',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        rosVersion: 'V7',
        useSsl: false,
        username: 'admin',
        status: 'offline',
      );
      final stubNotifier = _StubRoutersNotifier([ros7Router]);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            routersProvider.overrideWith(() => stubNotifier),
          ],
          child: MaterialApp(
            home: RouterSetupScreen(router: ros7Router),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // «التالي» must NOT bypass connection test on Step 0
      expect(find.text('اختبر الاتصال بالمصادقة للمتابعة'), findsOneWidget);

      // Tap «اختبار الاتصال والمصادقة الآن» -> since password field is empty in ACCOUNT mode, must call backend testConnectionDirect even on private LAN IP!
      await tester.ensureVisible(find.text('اختبار الاتصال والمصادقة الآن'));
      await tester.tap(find.text('اختبار الاتصال والمصادقة الآن'));
      await tester.pumpAndSettle();

      expect(stubNotifier.testDirectCalled, isTrue);
      expect(stubNotifier.lastPayload?['rosVersion'], 'V7');
      expect(find.textContaining('تم الاتصال عبر الخادم بنجاح'), findsWidgets);
    });
  });
}
