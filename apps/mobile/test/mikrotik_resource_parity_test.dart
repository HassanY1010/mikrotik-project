import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/mikrotik_discovery_service.dart';

void main() {
  group('MikroTik Resource Normalization & Parity Tests', () {
    test('1. Normalizes RouterOS v7 JSON List response containing Map', () {
      final v7ListResponse = [
        {
          'uptime': '2w3d14h20m',
          'version': '7.16',
          'cpu-load': 7,
          'free-memory': '343932928',
          'total-memory': '536870912',
          'free-hdd-space': '87241523',
          'total-hdd-space': '134217728',
          'board-name': 'L009UiGS-2HaxD',
        }
      ];

      final normalized = MikrotikDiscoveryService.normalizeResourceResponse(v7ListResponse);

      expect(normalized, isA<Map<String, dynamic>>());
      expect(normalized['cpu-load'], equals(7));
      expect(normalized['free-memory'], equals('343932928'));
      expect(normalized['total-memory'], equals('536870912'));
      expect(normalized['free-hdd-space'], equals('87241523'));
      expect(normalized['total-hdd-space'], equals('134217728'));
      expect(normalized['board-name'], equals('L009UiGS-2HaxD'));
    });

    test('2. Normalizes JSON Map response', () {
      final mapResponse = {
        'uptime': '1d2h',
        'version': '7.15',
        'cpu-load': 11,
        'free-memory': 343932928,
        'total-memory': 536870912,
        'free-hdd-space': 87241523,
        'total-hdd-space': 134217728,
      };

      final normalized = MikrotikDiscoveryService.normalizeResourceResponse(mapResponse);

      expect(normalized['cpu-load'], equals(11));
      expect(normalized['total-memory'], equals(536870912));
    });

    test('3. Handles Empty response safely without crashing', () {
      expect(MikrotikDiscoveryService.normalizeResourceResponse(null), isEmpty);
      expect(MikrotikDiscoveryService.normalizeResourceResponse([]), isEmpty);
      expect(MikrotikDiscoveryService.normalizeResourceResponse({}), isEmpty);
    });

    test('4. Handles Invalid response formats safely', () {
      expect(MikrotikDiscoveryService.normalizeResourceResponse('not a json map'), isEmpty);
      expect(MikrotikDiscoveryService.normalizeResourceResponse([123, 456]), isEmpty);
      expect(MikrotikDiscoveryService.normalizeResourceResponse(['invalid string inside list']), isEmpty);
      expect(MikrotikDiscoveryService.normalizeResourceResponse(42), isEmpty);
    });

    test('5. Handles Missing resource fields gracefully', () {
      // Missing cpu-load and free-hdd-space
      final partialResponse = [
        {
          'version': '7.16',
          'free-memory': '200000000',
          'total-memory': '500000000',
        }
      ];

      final normalized = MikrotikDiscoveryService.normalizeResourceResponse(partialResponse);
      expect(normalized['cpu-load'], isNull);
      expect(normalized['free-hdd-space'], isNull);
      expect(normalized['total-memory'], equals('500000000'));
    });

    test('6. RAM Usage calculation exactly matches WinBox formula: (Total - Free) / Total * 100', () {
      // Example: Router with 512MB RAM and 328MB Free (WinBox shows 36%)
      const totalBytes = 536870912; // 512 MB
      const freeBytes = 343932928; // ~328 MB free
      // Used = 192937984 bytes -> 192937984 / 536870912 = 0.359375 -> 36%

      final model = RouterDeviceModel(
        id: 'dev-1',
        name: 'MikroTik L009',
        host: '192.168.1.147',
        isOnline: true,
        memoryTotal: totalBytes,
        memoryFree: freeBytes,
      );

      expect(model.effectiveMemoryUsagePercent, equals(36));
    });

    test('7. DISK Usage calculation with byte-level precision eliminates rounding distortion (35% vs 38%)', () {
      // In L009/hEX flash: 128 MB flash, 83.2 MB free
      const totalHddBytes = 134217728; // 128 MB
      const freeHddBytes = 87241523; // ~83.2 MB
      // Used = 46976205 bytes -> 46976205 / 134217728 = 0.34999 -> 35%
      
      final model = RouterDeviceModel(
        id: 'dev-1',
        name: 'MikroTik L009',
        host: '192.168.1.147',
        isOnline: true,
        diskTotal: totalHddBytes,
        diskFree: freeHddBytes,
      );

      // Must be 35%, exactly matching WinBox
      expect(model.effectiveDiskUsagePercent, equals(35));
    });

    test('8. CPU load uses canonical RouterOS cpu-load directly without distortion (e.g. 7%)', () {
      final model = RouterDeviceModel(
        id: 'dev-1',
        name: 'MikroTik L009',
        host: '192.168.1.147',
        isOnline: true,
        cpuLoad: 7,
      );

      expect(model.cpuLoad, equals(7));
    });

    test('9. Boundary and clamping verification: strictly between 0 and 100%, no negative or overflow', () {
      final overflowModel = RouterDeviceModel(
        id: 'dev-2',
        name: 'Overflow Test',
        host: '192.168.1.1',
        isOnline: true,
        memoryUsagePercent: 120,
        diskUsagePercent: -15,
      );

      expect(overflowModel.effectiveMemoryUsagePercent, equals(100));
      expect(overflowModel.effectiveDiskUsagePercent, equals(0));

      final negativeUsedModel = RouterDeviceModel(
        id: 'dev-3',
        name: 'Negative Used Test',
        host: '192.168.1.1',
        isOnline: true,
        memoryTotal: 100,
        memoryFree: 150, // free > total anomaly
        diskTotal: 100,
        diskFree: -50,
      );

      expect(negativeUsedModel.effectiveMemoryUsagePercent, equals(0));
      expect(negativeUsedModel.effectiveDiskUsagePercent, equals(100));
    });

    test('10. RouterDeviceModel fromJson correctly parses raw bytes from normalized response and computes exact percentages', () {
      final json = {
        'id': 'l009-uuid',
        'name': 'HAMDI N',
        'host': '192.168.1.147',
        'status': 'ONLINE',
        'isOnline': true,
        'cpuLoad': 7,
        'memoryTotal': 536870912,
        'memoryFree': 343932928,
        'diskTotal': 134217728,
        'diskFree': 87241523,
      };

      final parsed = RouterDeviceModel.fromJson(json);

      expect(parsed.cpuLoad, equals(7));
      expect(parsed.effectiveMemoryUsagePercent, equals(36));
      expect(parsed.effectiveDiskUsagePercent, equals(35));
      expect(parsed.memoryTotalMb, equals(512));
      expect(parsed.diskTotalMb, equals(128));
    });
  });
}
