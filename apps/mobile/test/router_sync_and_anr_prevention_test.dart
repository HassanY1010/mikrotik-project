import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('RouterSyncCoordinator Tests (Collision Prevention & ANR Mitigation)', () {
    test('Prevents overlapping sync on the same router (Single-flight lock)', () async {
      const deviceId = 'router-1';
      var concurrentAttempts = 0;
      var successfulExecutions = 0;

      final completer = Completer<void>();

      // Launch first sync which stays in flight
      final firstFuture = RouterSyncCoordinator.runLocked(deviceId, () async {
        successfulExecutions++;
        await completer.future;
        return 'done-first';
      });

      // Launch second concurrent sync on same deviceId
      final secondFuture = RouterSyncCoordinator.runLocked(deviceId, () async {
        concurrentAttempts++;
        return 'done-second';
      });

      // Launch third concurrent sync on same deviceId
      final thirdFuture = RouterSyncCoordinator.runLocked(deviceId, () async {
        concurrentAttempts++;
        return 'done-third';
      });

      final secondResult = await secondFuture;
      final thirdResult = await thirdFuture;

      // Second and third should have been cleanly skipped without throwing or blocking
      expect(secondResult, isNull);
      expect(thirdResult, isNull);
      expect(concurrentAttempts, 0);

      // Complete first sync
      completer.complete();
      final firstResult = await firstFuture;

      expect(firstResult, 'done-first');
      expect(successfulExecutions, 1);
      expect(RouterSyncCoordinator.isLocked(deviceId), isFalse);
    });

    test('Allows independent concurrent syncs for multiple routers', () async {
      const deviceA = 'router-A';
      const deviceB = 'router-B';

      final completerA = Completer<void>();
      final completerB = Completer<void>();

      final futureA = RouterSyncCoordinator.runLocked(deviceA, () async {
        await completerA.future;
        return 'result-A';
      });

      final futureB = RouterSyncCoordinator.runLocked(deviceB, () async {
        await completerB.future;
        return 'result-B';
      });

      expect(RouterSyncCoordinator.isLocked(deviceA), isTrue);
      expect(RouterSyncCoordinator.isLocked(deviceB), isTrue);

      completerA.complete();
      completerB.complete();

      expect(await futureA, 'result-A');
      expect(await futureB, 'result-B');

      expect(RouterSyncCoordinator.isLocked(deviceA), isFalse);
      expect(RouterSyncCoordinator.isLocked(deviceB), isFalse);
    });

    test('Timestamp fencing: Discards stale data from older delayed responses', () {
      const deviceId = 'router-seq';

      final t1 = 1000;
      final t2 = 2000;

      // Newer probe completed at t2
      RouterSyncCoordinator.recordCompleted(deviceId, t2);

      // Stale probe started at t1 (< t2) should be rejected
      expect(RouterSyncCoordinator.isStale(deviceId, t1), isTrue);

      // Fresh probe started at t3 (> t2) should be accepted
      final t3 = 3000;
      expect(RouterSyncCoordinator.isStale(deviceId, t3), isFalse);
    });
  });

  group('Router Effective Status & Model Synchronization Tests', () {
    test('Router correctly marks offline and clears live metrics when disconnected', () {
      final onlineRouter = RouterDeviceModel(
        id: 'r1',
        name: 'HAMDI NET',
        host: '192.168.1.114',
        username: 'admin',
        isOnline: true,
        status: 'ONLINE',
        connectivityState: 'ONLINE',
        localStatus: 'ONLINE',
        cpuLoad: 45,
        memoryFreeMb: 128,
        memoryTotalMb: 256,
        diskFreeMb: 32,
        diskTotalMb: 64,
        activeHotspotSessions: 12,
      );

      expect(onlineRouter.isEffectiveOnline, isTrue);

      // When disconnected: status and connectivityState become OFFLINE
      final offlineRouter = onlineRouter.copyWith(
        isOnline: false,
        status: 'OFFLINE',
        connectivityState: 'OFFLINE',
        localStatus: 'OFFLINE',
        clearMetrics: true,
        cpuLoad: null,
        activeHotspotSessions: 0,
        uptime: 'غير متصل',
      );

      expect(offlineRouter.isEffectiveOnline, isFalse);
      expect(offlineRouter.cpuLoad, isNull);
      expect(offlineRouter.activeHotspotSessions, 0);
      expect(offlineRouter.uptime, 'غير متصل');
    });

    test('Router returns to online status upon successful connection probe', () {
      final offlineRouter = RouterDeviceModel(
        id: 'r1',
        name: 'HAMDI NET',
        host: '192.168.1.114',
        username: 'admin',
        isOnline: false,
        status: 'OFFLINE',
        connectivityState: 'OFFLINE',
        localStatus: 'OFFLINE',
      );

      expect(offlineRouter.isEffectiveOnline, isFalse);

      final recoveredRouter = offlineRouter.copyWith(
        isOnline: true,
        status: 'ONLINE',
        connectivityState: 'ONLINE',
        localStatus: 'ONLINE',
        cpuLoad: 15,
        activeHotspotSessions: 5,
        uptime: '1m45s',
      );

      expect(recoveredRouter.isEffectiveOnline, isTrue);
      expect(recoveredRouter.cpuLoad, 15);
      expect(recoveredRouter.activeHotspotSessions, 5);
      expect(recoveredRouter.uptime, '1m45s');
    });
  });

  group('MikroTik Fast Parsing and Discovery Optimization Tests', () {
    test('RouterOS API sentence attr parser correctly decodes return values', () {
      final rawSentence = ['!done', '=ret=4489', '=.tag=1'];
      final attrs = <String, String>{};
      for (var i = 1; i < rawSentence.length; i++) {
        final w = rawSentence[i];
        if (w.startsWith('=')) {
          final eq2 = w.indexOf('=', 1);
          if (eq2 > 1) {
            attrs[w.substring(1, eq2)] = w.substring(eq2 + 1);
          }
        }
      }

      expect(attrs['ret'], '4489');
      expect(int.parse(attrs['ret']!), 4489);
    });

    test('Private IP detection matches all RFC1918 subnets', () {
      expect(RouterDeviceModel.isPrivateHost('192.168.1.114'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('10.0.0.1'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('172.16.0.1'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('172.31.255.254'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('localhost'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('127.0.0.1'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('router.local'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('router.lan'), isTrue);
      expect(RouterDeviceModel.isPrivateHost('197.251.10.5'), isFalse);
    });
  });
}
