import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/radar/presentation/radar_screen.dart';

void main() {
  group('ActiveSessionModel Tests', () {
    test('should parse enriched JSON accurately', () {
      final json = {
        'id': '*1',
        'user': 'voucher-7788',
        'address': '192.168.88.100',
        'macAddress': 'AA:BB:CC:DD:EE:FF',
        'uptime': '25 د 10 ث',
        'uptimeSeconds': 1510,
        'bytesIn': 20971520, // 20 MB
        'bytesOut': 83886080, // 80 MB
        'sessionId': '81a00001',
        'server': 'hotspot1',
        'loginBy': 'http-chap',
        'deviceId': 'dev-1',
        'deviceName': 'Main-Router',
        'routerStatus': 'online',
        'profileName': '5Mbps_Plan',
        'rateLimit': '2M/5M',
        'downloadSpeedLimit': '5 Mbps',
        'uploadSpeedLimit': '2 Mbps',
        'isUnlimitedSpeed': false,
        'totalQuotaBytes': 524288000, // 500 MB
        'consumedBytes': 104857600, // 100 MB
        'remainingBytes': 419430400, // 400 MB
        'consumptionPercentage': 20.0,
        'isUnlimitedQuota': false,
        'isQuotaExhausted': false,
        'isUnknownQuota': false,
        'timeLimit': '2h',
        'sessionTimeLeft': '1 س 34 د',
        'remainingTimeSeconds': 5640,
        'expiresAt': '2026-10-30T12:00:00.000Z',
        'isUnlimitedTime': false,
        'isExpired': false,
        'connectionStatus': 'connected',
        'lastSeen': '2026-10-23T14:00:00.000Z',
      };

      final session = ActiveSessionModel.fromJson(json);

      expect(session.id, '*1');
      expect(session.user, 'voucher-7788');
      expect(session.address, '192.168.88.100');
      expect(session.macAddress, 'AA:BB:CC:DD:EE:FF');
      expect(session.profileName, '5Mbps_Plan');
      expect(session.deviceName, 'Main-Router');
      expect(session.downloadSpeedLimit, '5 Mbps');
      expect(session.uploadSpeedLimit, '2 Mbps');
      expect(session.formattedSpeed, '↓ 5 Mbps | ↑ 2 Mbps');
      expect(session.formattedConsumed, '100 MB');
      expect(session.formattedTotalQuota, '500 MB');
      expect(session.formattedRemaining, '400 MB');
      expect(session.consumptionPercentage, 20.0);
      expect(session.isQuotaExhausted, false);
      expect(session.isUnlimitedQuota, false);
      expect(session.isUnknownQuota, false);
      expect(session.isExpired, false);
      expect(session.connectionStatus, 'connected');
    });

    test('should handle unlimited and unknown quota edge cases properly', () {
      final unlimitedJson = {
        'id': '*2',
        'user': 'vip-open',
        'address': '192.168.88.101',
        'macAddress': '11:22:33:44:55:66',
        'uptime': '1h',
        'bytesIn': 50000000,
        'bytesOut': 150000000,
        'isUnlimitedQuota': true,
        'isUnlimitedSpeed': true,
        'isUnlimitedTime': true,
      };

      final unlimitedSession = ActiveSessionModel.fromJson(unlimitedJson);
      expect(unlimitedSession.formattedRemaining, 'مفتوحة');
      expect(unlimitedSession.formattedTotalQuota, 'غير محدودة');
      expect(unlimitedSession.formattedSpeed, 'غير محددة');
      expect(unlimitedSession.formattedRemainingTime, 'غير محدودة زمنيًا');

      final unknownJson = {
        'id': '*3',
        'user': 'guest-mac',
        'address': '192.168.88.102',
        'macAddress': '77:88:99:AA:BB:CC',
        'uptime': '5m',
        'isUnknownQuota': true,
      };

      final unknownSession = ActiveSessionModel.fromJson(unknownJson);
      expect(unknownSession.formattedRemaining, 'غير متاح');
      expect(unknownSession.formattedTotalQuota, 'غير متاح');
    });

    test('should handle exhausted quota edge case properly', () {
      final exhaustedJson = {
        'id': '*4',
        'user': 'expired-voucher',
        'address': '192.168.88.103',
        'macAddress': '99:88:77:66:55:44',
        'uptime': '45m',
        'totalQuotaBytes': 104857600,
        'consumedBytes': 104857600,
        'remainingBytes': 0,
        'consumptionPercentage': 100.0,
        'isQuotaExhausted': true,
      };

      final exhaustedSession = ActiveSessionModel.fromJson(exhaustedJson);
      expect(exhaustedSession.isQuotaExhausted, true);
      expect(exhaustedSession.formattedRemaining, 'منتهية (0 MB)');
    });
  });

  group('RadarScreen Widget Tests', () {
    testWidgets('should render RadarScreen header, pulse, and session cards', (tester) async {
      final mockSession = ActiveSessionModel(
        id: '*1',
        user: 'voucher-101',
        address: '192.168.88.50',
        macAddress: 'AA:BB:CC:DD:EE:01',
        uptime: '15 د 30 ث',
        uptimeSeconds: 930,
        bytesIn: 10485760,
        bytesOut: 41943040,
        deviceId: 'device-1',
        deviceName: 'Main Router',
        profileName: 'Profile_VIP',
        downloadSpeedLimit: '5 Mbps',
        uploadSpeedLimit: '2 Mbps',
        totalQuotaBytes: 524288000,
        consumedBytes: 52428800,
        remainingBytes: 471859200,
        consumptionPercentage: 10.0,
        connectionStatus: 'connected',
      );

      final mockRouter = RouterDeviceModel(
        id: 'device-1',
        name: 'Main Router',
        host: '192.168.88.1',
        isOnline: true,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            activeSessionsProvider.overrideWith(() => _MockActiveSessionsNotifier([mockSession])),
            routersProvider.overrideWith(() => _MockRoutersNotifier([mockRouter])),
            selectedRouterIdProvider.overrideWith(() => _MockSelectedRouterNotifier('device-1')),
            radarLastUpdatedProvider.overrideWith(() => _MockRadarLastUpdatedNotifier(DateTime(2026, 10, 23, 14, 30))),
          ],
          child: const MaterialApp(
            home: RadarScreen(),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      // Check title and header
      expect(find.text('رادار المشتركين المتصلين'), findsOneWidget);
      expect(find.text('1 مشترك متصل الآن'), findsOneWidget);

      // Check session card details
      expect(find.text('voucher-101'), findsOneWidget);
      expect(find.text('Main Router'), findsWidgets);
      expect(find.text('Profile_VIP'), findsOneWidget);
      expect(find.text('IP: 192.168.88.50'), findsOneWidget);
      expect(find.text('AA:BB:CC:DD:EE:01'), findsOneWidget);
      expect(find.text('المتبقي: 450 MB'), findsOneWidget);
      expect(find.text('المستهلك: 50 MB'), findsOneWidget);
      expect(find.text('الجلسة: 15 د 30 ث'), findsOneWidget);

      // Tap on Expandable details
      expect(find.text('عرض التفاصيل الإضافية'), findsOneWidget);
      await tester.tap(find.text('عرض التفاصيل الإضافية'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      expect(find.text('طي التفاصيل الإضافية'), findsOneWidget);
      expect(find.text('خادم الهوتسبوت:'), findsOneWidget);
    });
  });
}

class _MockActiveSessionsNotifier extends ActiveSessionsNotifier {
  final List<ActiveSessionModel> _mockList;
  _MockActiveSessionsNotifier(this._mockList);

  @override
  Future<List<ActiveSessionModel>> build() async => _mockList;
}

class _MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _mockRouters;
  _MockRoutersNotifier(this._mockRouters);

  @override
  Future<List<RouterDeviceModel>> build() async => _mockRouters;
}

class _MockSelectedRouterNotifier extends SelectedRouterNotifier {
  final String? _initial;
  _MockSelectedRouterNotifier(this._initial);

  @override
  String? build() => _initial;
}

class _MockRadarLastUpdatedNotifier extends RadarLastUpdatedNotifier {
  final DateTime? _initial;
  _MockRadarLastUpdatedNotifier(this._initial);

  @override
  DateTime? build() => _initial;
}
