import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/constants/api_endpoints.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/devices/presentation/connected_devices_screen.dart';

class _MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _routers;
  _MockRoutersNotifier(this._routers);

  @override
  Future<List<RouterDeviceModel>> build() async => _routers;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Connected Devices Feature Tests', () {
    test('ApiEndpoints.deviceConnectedDevices formats correct URL', () {
      const routerId = 'router-test-456';
      expect(
        ApiEndpoints.deviceConnectedDevices(routerId),
        '/devices/router-test-456/connected-devices',
      );
    });

    test('ConnectedDeviceModel fromJson parses DHCP lease properly with certainty and sources', () {
      final json = {
        'id': 'BC2411223344',
        'name': 'Samsung-Galaxy-A52',
        'ipAddress': '192.168.88.25',
        'macAddress': 'BC:24:11:22:33:44',
        'interface': 'bridge-lan',
        'status': 'active',
        'isOnline': true,
        'connectionCertainty': 'CONFIRMED_ONLINE',
        'deviceType': 'PHONE',
        'hostName': 'Samsung-Galaxy-A52',
        'vendor': 'Samsung',
        'uptime': '1h 24m',
        'expiresAfter': '23h 36m',
        'source': 'ARP',
        'sources': ['DHCP', 'ARP'],
      };

      final model = ConnectedDeviceModel.fromJson(json);

      expect(model.id, 'BC2411223344');
      expect(model.name, 'Samsung-Galaxy-A52');
      expect(model.ipAddress, '192.168.88.25');
      expect(model.macAddress, 'BC:24:11:22:33:44');
      expect(model.interfaceName, 'bridge-lan');
      expect(model.isOnline, true);
      expect(model.isConfirmedOnline, true);
      expect(model.isLeaseOnly, false);
      expect(model.deviceType, 'PHONE');
      expect(model.isAccessPoint, false);
      expect(model.vendor, 'Samsung');
      expect(model.source, 'ARP');
      expect(model.sources, contains('DHCP'));
      expect(model.sources, contains('ARP'));
    });

    test('ConnectedDeviceModel fromJson correctly identifies Access Point / Antenna', () {
      final json = {
        'id': '002722114455',
        'name': 'NanoStation-M5-TowerNorth',
        'ipAddress': '192.168.88.200',
        'macAddress': '00:27:22:11:44:55',
        'interface': 'ether2',
        'status': 'active',
        'isOnline': true,
        'connectionCertainty': 'CONFIRMED_ONLINE',
        'deviceType': 'ACCESS_POINT',
        'hostName': 'NanoStation-M5-TowerNorth',
        'vendor': 'Ubiquiti',
        'uptime': '45d 12h',
        'age': '30s',
        'source': 'NEIGHBOR',
        'sources': ['NEIGHBOR', 'ARP'],
      };

      final model = ConnectedDeviceModel.fromJson(json);

      expect(model.id, '002722114455');
      expect(model.name, 'NanoStation-M5-TowerNorth');
      expect(model.isAccessPoint, true);
      expect(model.deviceType, 'ACCESS_POINT');
      expect(model.vendor, 'Ubiquiti');
      expect(model.age, '30s');
      expect(model.sources, contains('NEIGHBOR'));
    });

    test('ConnectedDeviceModel handles UNKNOWN devices and lease-only certainty', () {
      final json = {
        'id': 'AA1122334455',
        'name': 'جهاز (AA:11:22:33:44:55)',
        'ipAddress': '192.168.88.99',
        'macAddress': 'AA:11:22:33:44:55',
        'status': 'leased',
        'isOnline': false,
        'connectionCertainty': 'LEASE_ACTIVE',
        'deviceType': 'UNKNOWN',
        'source': 'DHCP',
      };

      final model = ConnectedDeviceModel.fromJson(json);

      expect(model.isAccessPoint, false);
      expect(model.isUnknown, true);
      expect(model.isLeaseOnly, true);
      expect(model.isConfirmedOnline, false);
    });

    test('ConnectedDeviceModel toJson serializes accurately', () {
      const model = ConnectedDeviceModel(
        id: 'dev-1',
        name: 'HP-Laptop-Staff',
        ipAddress: '192.168.88.10',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        interfaceName: 'ether1',
        status: 'active',
        isOnline: true,
        connectionCertainty: 'CONFIRMED_ONLINE',
        deviceType: 'COMPUTER',
        hostName: 'HP-Laptop-Staff',
        vendor: 'HP',
        source: 'ARP',
        sources: ['DHCP', 'ARP'],
      );

      final json = model.toJson();
      expect(json['id'], 'dev-1');
      expect(json['name'], 'HP-Laptop-Staff');
      expect(json['deviceType'], 'COMPUTER');
      expect(json['connectionCertainty'], 'CONFIRMED_ONLINE');
      expect(json['interface'], 'ether1');
      expect(json['source'], 'ARP');
      expect(json['sources'], contains('DHCP'));
    });

    testWidgets('ConnectedDevicesScreen renders router details, KPI counters, search, and device cards', (tester) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final dummyRouter = RouterDeviceModel(
        id: 'router-1',
        name: 'Main Router CCR1009',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        rosVersion: 'v7',
        isOnline: true,
        status: 'ONLINE',
        cpuLoad: 5,
        memoryFreeMb: 512,
        memoryTotalMb: 1024,
        diskFreeMb: 64,
        diskTotalMb: 128,
        uptime: '5d 14h',
        modelName: 'CCR1009-7G-1C-1S+',
        isLocked: false,
        antiTetheringEnabled: true,
      );

      final dummyDevices = [
        const ConnectedDeviceModel(
          id: 'dev-ap',
          name: 'NanoStation M5 (Main AP)',
          ipAddress: '192.168.88.200',
          macAddress: '00:27:22:11:44:55',
          interfaceName: 'ether2',
          status: 'active',
          isOnline: true,
          connectionCertainty: 'CONFIRMED_ONLINE',
          deviceType: 'ACCESS_POINT',
          hostName: 'NanoStation M5',
          vendor: 'Ubiquiti',
          uptime: '12d 4h',
          age: '20s',
          source: 'NEIGHBOR',
          sources: ['NEIGHBOR', 'ARP'],
        ),
        const ConnectedDeviceModel(
          id: 'dev-phone',
          name: 'iPhone 13 - Ahmed',
          ipAddress: '192.168.88.55',
          macAddress: 'AA:BB:CC:11:22:33',
          interfaceName: 'bridge-lan',
          status: 'active',
          isOnline: true,
          connectionCertainty: 'CONFIRMED_ONLINE',
          deviceType: 'PHONE',
          hostName: 'iPhone-Ahmed',
          vendor: 'Apple',
          expiresAfter: '22h 10m',
          source: 'ARP',
          sources: ['DHCP', 'ARP'],
        ),
        const ConnectedDeviceModel(
          id: 'dev-pc',
          name: 'Dell PC - Cashier 1',
          ipAddress: '192.168.88.105',
          macAddress: 'AA:BB:CC:44:55:66',
          interfaceName: 'bridge-lan',
          status: 'leased',
          isOnline: false,
          connectionCertainty: 'LEASE_ACTIVE',
          deviceType: 'COMPUTER',
          hostName: 'DESKTOP-POS1',
          vendor: 'Dell',
          source: 'DHCP',
          sources: ['DHCP'],
        ),
        const ConnectedDeviceModel(
          id: 'dev-unknown',
          name: 'جهاز (11:22:33:44:55:66)',
          ipAddress: '192.168.88.188',
          macAddress: '11:22:33:44:55:66',
          interfaceName: 'bridge-lan',
          status: 'offline',
          isOnline: false,
          connectionCertainty: 'OFFLINE',
          deviceType: 'UNKNOWN',
          source: 'DHCP',
          sources: ['DHCP'],
        ),
      ];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            routersProvider.overrideWith(() => _MockRoutersNotifier([dummyRouter])),
            selectedRouterIdProvider.overrideWith(SelectedRouterNotifier.new),
            connectedDevicesProvider('router-1').overrideWith((ref) => Future.value(dummyDevices)),
          ],
          child: const MaterialApp(
            home: ConnectedDevicesScreen(initialRouterId: 'router-1'),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify Screen Header
      expect(find.text('الأجهزة المتصلة وأجهزة البث'), findsOneWidget);

      // Verify Selected Router Card
      expect(find.text('Main Router CCR1009'), findsWidgets);
      expect(find.text('متصل'), findsWidgets);

      // Verify KPI Summary Counters
      expect(find.text('إجمالي الأجهزة'), findsOneWidget);
      expect(find.text('4'), findsOneWidget); // 4 total devices
      expect(find.text('أجهزة البث'), findsOneWidget);
      expect(find.text('1'), findsWidgets); // 1 AP
      expect(find.text('متصل مؤكد'), findsWidgets);
      expect(find.text('2'), findsWidgets); // 2 confirmed active
      expect(find.text('عقد نشط'), findsWidgets);

      // Verify Filter Chips
      expect(find.text('الكل (4)'), findsOneWidget);
      expect(find.text('أجهزة البث (1)'), findsOneWidget);
      expect(find.text('متصل مؤكد (2)'), findsOneWidget);
      expect(find.text('عقود نشطة (1)'), findsOneWidget);

      // Verify Device Cards
      expect(find.text('NanoStation M5 (Main AP)'), findsOneWidget);
      expect(find.text('جهاز بث'), findsOneWidget);
      expect(find.text('192.168.88.200'), findsOneWidget);
      expect(find.text('00:27:22:11:44:55'), findsOneWidget);
      expect(find.text('الجهة المصنعة: Ubiquiti'), findsOneWidget);
      expect(find.text('المصدر: NEIGHBOR + ARP'), findsOneWidget);

      expect(find.text('iPhone 13 - Ahmed'), findsOneWidget);
      expect(find.text('192.168.88.55'), findsOneWidget);

      expect(find.text('Dell PC - Cashier 1'), findsOneWidget);
      expect(find.text('192.168.88.105'), findsOneWidget);

      expect(find.text('جهاز غير محدد'), findsOneWidget);
    });

    testWidgets('ConnectedDevicesScreen filters by Access Point chip correctly', (tester) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final dummyRouter = RouterDeviceModel(
        id: 'router-1',
        name: 'Main Router CCR1009',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        rosVersion: 'v7',
        isOnline: true,
        status: 'ONLINE',
        cpuLoad: 5,
        memoryFreeMb: 1024,
        memoryTotalMb: 2048,
        diskFreeMb: 100,
        diskTotalMb: 200,
        uptime: '5d',
        modelName: 'CCR1009',
        isLocked: false,
        antiTetheringEnabled: false,
      );

      final dummyDevices = [
        const ConnectedDeviceModel(
          id: 'dev-ap',
          name: 'MikroTik SXT AP',
          ipAddress: '192.168.88.201',
          macAddress: '00:0C:42:11:22:33',
          status: 'active',
          isOnline: true,
          connectionCertainty: 'CONFIRMED_ONLINE',
          deviceType: 'ACCESS_POINT',
          vendor: 'MikroTik',
          source: 'NEIGHBOR',
        ),
        const ConnectedDeviceModel(
          id: 'dev-phone',
          name: 'Galaxy S21',
          ipAddress: '192.168.88.56',
          macAddress: 'AA:11:22:33:44:55',
          status: 'bound',
          isOnline: false,
          connectionCertainty: 'LEASE_ACTIVE',
          deviceType: 'PHONE',
          vendor: 'Samsung',
          source: 'DHCP',
        ),
      ];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            routersProvider.overrideWith(() => _MockRoutersNotifier([dummyRouter])),
            selectedRouterIdProvider.overrideWith(SelectedRouterNotifier.new),
            connectedDevicesProvider('router-1').overrideWith((ref) => Future.value(dummyDevices)),
          ],
          child: const MaterialApp(
            home: ConnectedDevicesScreen(initialRouterId: 'router-1'),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap on 'أجهزة البث (1)' chip
      final apChip = find.text('أجهزة البث (1)');
      expect(apChip, findsOneWidget);
      await tester.tap(apChip);
      await tester.pumpAndSettle();

      // Only AP should appear, phone should disappear
      expect(find.text('MikroTik SXT AP'), findsOneWidget);
      expect(find.text('Galaxy S21'), findsNothing);
    });
  });
}
