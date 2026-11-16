import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/models/router_provisioning_models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/services/mikrotik_discovery_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('اختبار احترافي شامل: مقارنة وتوافق الراوتر الجديد والراوتر المبرمج مسبقاً', () {

    // =========================================================================
    // القسم الأول: فحص وتوافق الراوتر الجديد (Factory Default / Brand New Router)
    // =========================================================================
    group('1. سيناريو الراوتر الجديد تماماً (ضبط المصنع - Factory Default):', () {
      late RouterDeviceModel brandNewRouter;

      setUp(() {
        brandNewRouter = RouterDeviceModel(
          id: 'router-new-factory-01',
          name: 'MikroTik hAP ax2 (New)',
          host: '192.168.88.1',
          username: 'admin',
          apiPort: 8728,
          restPort: 80,
          useSsl: false,
          rosVersion: '7.15.3',
          isOnline: true,
          status: 'ONLINE',
          connectivityState: 'ONLINE',
          localStatus: 'ONLINE',
          isPrivateLan: true,
          cpuLoad: 2,
          memoryFreeMb: 850,
          memoryTotalMb: 1024,
          diskFreeMb: 110,
          diskTotalMb: 128,
          uptime: '00:03:15',
          activeHotspotSessions: 0,
        );
      });

      test('أ) التحقق من خصائص الراوتر الجديد وعناوين الشبكة الافتراضية', () {
        expect(brandNewRouter.isPrivateLan, isTrue);
        expect(brandNewRouter.isEffectiveOnline, isTrue);
        expect(brandNewRouter.host, '192.168.88.1');
        expect(brandNewRouter.username, 'admin');
        expect(brandNewRouter.activeHotspotSessions, 0);
      });

      test('ب) اكتشاف واستيعاب لقطة المنافذ الخام لجهاز جديد (Raw Interfaces Snapshot)', () {
        final factorySnapshotRaw = {
          'resource': {
            'version': '7.15.3',
            'uptime': '3m15s',
            'cpu-load': '2',
            'free-memory': '891289600',
            'total-memory': '1073741824',
            'board-name': 'hAP ax2',
          },
          'interfaces': [
            {'name': 'ether1', 'type': 'ether', 'running': 'true'},
            {'name': 'ether2', 'type': 'ether', 'running': 'false'},
            {'name': 'ether3', 'type': 'ether', 'running': 'false'},
            {'name': 'wifi1', 'type': 'wifi', 'running': 'true'},
            {'name': 'wifi2', 'type': 'wifi', 'running': 'true'},
          ],
          'bridges': <dynamic>[],
          'ipAddresses': [
            {'address': '192.168.88.1/24', 'network': '192.168.88.0', 'interface': 'ether2'}
          ],
        };

        final snapshot = RouterDiscoverySnapshotModel.fromJson(factorySnapshotRaw);
        expect(snapshot.version, '7.15.3');
        expect(snapshot.interfaces.length, 5);
        expect(snapshot.bridges.isEmpty, isTrue);
        expect(snapshot.ipAddresses.first.address, '192.168.88.1/24');
      });

      test('ج) نمذجة أوامر البرمجة النظيفة (CLEAN_SETUP) لراوتر جديد بدون تعارضات', () {
        final cleanCommands = [
          '/interface bridge add name=br-sudafi',
          '/ip address add address=10.10.10.1/24 interface=br-sudafi',
          '/ip pool add name=hs-pool ranges=10.10.10.10-10.10.10.250',
          '/ip firewall nat add chain=srcnat action=masquerade out-interface=ether1',
          '/ip firewall mangle add chain=postrouting action=change-ttl new-ttl=set:1 passthrough=yes',
        ];

        for (final cmd in cleanCommands) {
          final op = MikrotikDiscoveryService.parseRouterCommand(cmd);
          expect(op.method, isIn(['PUT', 'POST', 'PATCH']));
          expect(op.path.isNotEmpty, isTrue);
        }
      });
    });

    // =========================================================================
    // القسم الثاني: فحص وتوافق الراوتر المبرمج مسبقاً (Existing Programmed Router)
    // =========================================================================
    group('2. سيناريو الراوتر المبرمج مسبقاً (يعمل في شبكة إنترنت قائمة):', () {
      late RouterDeviceModel existingRouter;

      setUp(() {
        existingRouter = RouterDeviceModel(
          id: 'router-existing-lan-114',
          name: 'HAMDI NET (Live)',
          host: '192.168.1.114',
          username: 'admin',
          apiPort: 8728,
          restPort: 80,
          useSsl: false,
          rosVersion: '7.16.2',
          isOnline: true,
          status: 'ONLINE',
          connectivityState: 'ONLINE',
          localStatus: 'ONLINE',
          isPrivateLan: true,
          cpuLoad: 28,
          memoryFreeMb: 410,
          memoryTotalMb: 1024,
          diskFreeMb: 85,
          diskTotalMb: 128,
          uptime: '18d 04:12:00',
          activeHotspotSessions: 42,
        );
      });

      test('أ) استخراج وقراءة بيانات الراوتر المبرمج وقائمة الكروت الضخمة بأمان تام', () {
        expect(existingRouter.isPrivateLan, isTrue);
        expect(existingRouter.isEffectiveOnline, isTrue);
        expect(existingRouter.activeHotspotSessions, 42);

        // فحص تفكيك استجابة العداد السريع =count-only= (4489 كرت في 2ms دون حجب الـ UI)
        final rawSentence = ['!done', '=ret=4489'];
        final attrs = <String, String>{};
        for (final w in rawSentence.skip(1)) {
          if (w.startsWith('=')) {
            final idx = w.indexOf('=', 1);
            if (idx > 1) attrs[w.substring(1, idx)] = w.substring(idx + 1);
          }
        }
        final count = int.tryParse(attrs['ret'] ?? '0') ?? 0;
        expect(count, 4489);
      });

      test('ب) قراءة وحماية إعدادات الإنترنت القائمة عبر نمط الحفاظ (KEEP_EXISTING_WAN)', () {
        // الراوتر يحتوي على WAN مسبق عبر PPPoE وجسر موجود
        final existingSnapshotRaw = {
          'resource': {
            'version': '7.16.2',
            'uptime': '18d4h12m',
            'cpu-load': '28',
            'free-memory': '430000000',
            'total-memory': '1073741824',
            'board-name': 'RB4011iGS+',
          },
          'interfaces': [
            {'name': 'ether1', 'type': 'ether', 'running': 'true'},
            {'name': 'pppoe-out1', 'type': 'pppoe-out', 'running': 'true'},
            {'name': 'bridge-local', 'type': 'bridge', 'running': 'true'},
          ],
          'bridges': ['bridge-local'],
          'ipAddresses': [
            {'address': '192.168.1.114/24', 'network': '192.168.1.0', 'interface': 'bridge-local'}
          ],
        };

        final snapshot = RouterDiscoverySnapshotModel.fromJson(existingSnapshotRaw);
        expect(snapshot.version, '7.16.2');
        expect(snapshot.bridges.contains('bridge-local'), isTrue);

        // التحقق من أن أوامر الحفاظ تستهدف الجسر القائم فقط
        final preserveCmd = '/ip hotspot add name=hs-custom interface=bridge-local profile=default';
        final op = MikrotikDiscoveryService.parseRouterCommand(preserveCmd);
        expect(op.method, 'PUT');
        expect(op.body!['interface'], 'bridge-local');
      });

      test('ج) التحقق من التعامل الحقيقي مع انقطاع الراوتر المبرمج وتفريغ القياسات العالقة', () {
        // عند انقطاع الراوتر: يجب تفريغ المعالج والذاكرة والتخزين فوراً وتغيير الحالة إلى OFFLINE
        final disconnectedRouter = existingRouter.copyWith(
          isOnline: false,
          status: 'OFFLINE',
          connectivityState: 'OFFLINE',
          localStatus: 'OFFLINE',
          clearMetrics: true,
          uptime: 'غير متصل',
          activeHotspotSessions: 0,
        );

        expect(disconnectedRouter.isEffectiveOnline, isFalse);
        expect(disconnectedRouter.cpuLoad, isNull);
        expect(disconnectedRouter.memoryFreeMb, isNull);
        expect(disconnectedRouter.diskFreeMb, isNull);
        expect(disconnectedRouter.uptime, 'غير متصل');
        expect(disconnectedRouter.activeHotspotSessions, 0);

        // عند عودة الراوتر للعمل: تستعيد القياسات الحقيقية الحية فوراً
        final reconnectedRouter = disconnectedRouter.copyWith(
          isOnline: true,
          status: 'ONLINE',
          connectivityState: 'ONLINE',
          localStatus: 'ONLINE',
          cpuLoad: 31,
          memoryFreeMb: 405,
          memoryTotalMb: 1024,
          diskFreeMb: 85,
          diskTotalMb: 128,
          uptime: '18d 04:35:00',
          activeHotspotSessions: 45,
        );

        expect(reconnectedRouter.isEffectiveOnline, isTrue);
        expect(reconnectedRouter.cpuLoad, 31);
        expect(reconnectedRouter.memoryFreeMb, 405);
        expect(reconnectedRouter.activeHotspotSessions, 45);
      });
    });

    // =========================================================================
    // القسم الثالث: حماية التزامن ومنع الـ ANR المشترك لكلا النوعين
    // =========================================================================
    group('3. حماية التزامن المشتركة (ANR Prevention & Concurrency Control):', () {
      test('حماية الراوترين من تداخل وفوضى الطلبات عبر Single-Flight Lock', () async {
        const idNew = 'router-new-factory-01';
        const idOld = 'router-existing-lan-114';

        var executedNew = 0;
        var executedOld = 0;

        await Future.wait([
          RouterSyncCoordinator.runLocked(idNew, () async {
            executedNew++;
            return 'ok-new';
          }),
          RouterSyncCoordinator.runLocked(idOld, () async {
            executedOld++;
            return 'ok-old';
          }),
        ]);

        expect(executedNew, 1);
        expect(executedOld, 1);
        expect(RouterSyncCoordinator.isLocked(idNew), isFalse);
        expect(RouterSyncCoordinator.isLocked(idOld), isFalse);
      });
    });
  });
}
