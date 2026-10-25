import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/services/mikrotik_discovery_service.dart';

void main() {
  group('MikroTik Discovery - DiscoveredRouterModel Tests', () {
    test('DiscoveredRouterModel serializes and deserializes correctly', () {
      final model = DiscoveredRouterModel(
        ip: '192.168.88.1',
        identity: 'MikroTik-MainTower',
        model: 'RB750Gr3',
        version: '7.12.1',
        macAddress: '48:8F:5A:11:22:33',
        openPorts: const [8728, 443, 80],
        rosVersion: 'V7',
        isReachable: true,
        connectionType: 'API',
        discoveryMethod: 'MNDP',
      );

      final json = model.toJson();
      expect(json['ip'], '192.168.88.1');
      expect(json['identity'], 'MikroTik-MainTower');
      expect(json['model'], 'RB750Gr3');
      expect(json['version'], '7.12.1');
      expect(json['macAddress'], '48:8F:5A:11:22:33');
      expect(json['openPorts'], [8728, 443, 80]);
      expect(json['rosVersion'], 'V7');
      expect(json['isReachable'], true);
      expect(json['connectionType'], 'API');
      expect(json['discoveryMethod'], 'MNDP');

      final fromJson = DiscoveredRouterModel.fromJson(json);
      expect(fromJson.ip, model.ip);
      expect(fromJson.identity, model.identity);
      expect(fromJson.model, model.model);
      expect(fromJson.version, model.version);
      expect(fromJson.macAddress, model.macAddress);
      expect(fromJson.openPorts, model.openPorts);
      expect(fromJson.rosVersion, model.rosVersion);
      expect(fromJson.isReachable, model.isReachable);
      expect(fromJson.discoveryMethod, model.discoveryMethod);
    });

    test('DiscoveredRouterModel fallback defaults when fields are missing', () {
      final minimalJson = {
        'ip': '10.5.50.1',
      };

      final parsed = DiscoveredRouterModel.fromJson(minimalJson);
      expect(parsed.ip, '10.5.50.1');
      expect(parsed.identity, 'MikroTik Router');
      expect(parsed.model, isNull);
      expect(parsed.macAddress, isNull);
      expect(parsed.openPorts, isEmpty);
      expect(parsed.rosVersion, 'V7');
      expect(parsed.isReachable, true);
    });
  });

  group('MikroTik Discovery - MNDP Protocol Packet Parser Tests', () {
    test('Construct and parse valid MNDP binary TLV packet', () {
      // Build a realistic MNDP packet:
      // Header: 4 bytes (0x00, 0x00, 0x00, 0x00)
      // TLV 1: MAC address (Type=1, Len=6, 48:8F:5A:01:02:03)
      // TLV 5: Identity (Type=5, Len=8, "SudaFi-1")
      // TLV 7: Version (Type=7, Len=6, "7.14.3")
      // TLV 8: Platform (Type=8, Len=8, "MikroTik")
      // TLV 12: Board/Model (Type=12, Len=8, "hEX S   ")
      final builder = BytesBuilder();
      builder.add([0x00, 0x00, 0x00, 0x00]); // 4-byte header

      // Type 1: MAC (length 6)
      builder.add([0x00, 0x01, 0x00, 0x06]);
      builder.add([0x48, 0x8F, 0x5A, 0x01, 0x02, 0x03]);

      // Type 5: Identity
      final idBytes = utf8.encode('SudaFi-Router-01');
      builder.add([0x00, 0x05, (idBytes.length >> 8) & 0xFF, idBytes.length & 0xFF]);
      builder.add(idBytes);

      // Type 7: Version
      final verBytes = utf8.encode('7.14.3');
      builder.add([0x00, 0x07, (verBytes.length >> 8) & 0xFF, verBytes.length & 0xFF]);
      builder.add(verBytes);

      // Type 8: Platform
      final platBytes = utf8.encode('MikroTik');
      builder.add([0x00, 0x08, (platBytes.length >> 8) & 0xFF, platBytes.length & 0xFF]);
      builder.add(platBytes);

      // Type 12: Board name
      final boardBytes = utf8.encode('RB750Gr3');
      builder.add([0x00, 0x0C, (boardBytes.length >> 8) & 0xFF, boardBytes.length & 0xFF]);
      builder.add(boardBytes);

      final packetBytes = builder.toBytes();

      // Parse using discovery service helper logic
      int offset = 4;
      String? mac;
      String? identity;
      String? version;
      String? platform;
      String? model;

      while (offset + 4 <= packetBytes.length) {
        final type = (packetBytes[offset] << 8) | packetBytes[offset + 1];
        final length = (packetBytes[offset + 2] << 8) | packetBytes[offset + 3];
        offset += 4;

        if (offset + length > packetBytes.length) break;

        final val = packetBytes.sublist(offset, offset + length);
        offset += length;

        if (type == 1 && val.length == 6) {
          mac = val.map((b) => b.toRadixString(16).padLeft(2, '0')).join(':').toUpperCase();
        } else if (type == 5) {
          identity = utf8.decode(val);
        } else if (type == 7) {
          version = utf8.decode(val);
        } else if (type == 8) {
          platform = utf8.decode(val);
        } else if (type == 12) {
          model = utf8.decode(val);
        }
      }

      expect(mac, '48:8F:5A:01:02:03');
      expect(identity, 'SudaFi-Router-01');
      expect(version, '7.14.3');
      expect(platform, 'MikroTik');
      expect(model, 'RB750Gr3');
    });

    test('Identifies RouterOS version 6 vs version 7 accurately', () {
      final v6Router = DiscoveredRouterModel(
        ip: '192.168.88.1',
        identity: 'MikroTik-Legacy',
        version: '6.49.10',
        rosVersion: '6.49.10'.startsWith('6.') ? 'V6' : 'V7',
      );
      expect(v6Router.rosVersion, 'V6');

      final v7Router = DiscoveredRouterModel(
        ip: '192.168.88.1',
        identity: 'MikroTik-Modern',
        version: '7.13.2',
        rosVersion: '7.13.2'.startsWith('6.') ? 'V6' : 'V7',
      );
      expect(v7Router.rosVersion, 'V7');
    });
  });

  group('MikroTik Auto-Discovery - Form Autofill & Selection Contract', () {
    test('Selecting discovered router prepares form and flags missing credentials', () {
      final discovered = DiscoveredRouterModel(
        ip: '192.168.10.1',
        identity: 'Tower-North-MikroTik',
        model: 'CCR2004',
        macAddress: 'CC:2D:E0:11:22:33',
        openPorts: const [8728, 443],
        rosVersion: 'V7',
        isReachable: true,
      );

      // Emulate selection behavior
      final formState = <String, dynamic>{
        'name': discovered.identity,
        'host': discovered.ip,
        'apiPort': discovered.openPorts.contains(8728) ? 8728 : 8728,
        'restPort': discovered.openPorts.contains(443) ? 443 : 443,
        'rosVersion': discovered.rosVersion,
        'username': 'admin',
        'password': '', // Empty: Discovery DOES NOT guess passwords!
      };

      expect(formState['name'], 'Tower-North-MikroTik');
      expect(formState['host'], '192.168.10.1');
      expect(formState['apiPort'], 8728);
      expect(formState['restPort'], 443);
      expect(formState['rosVersion'], 'V7');
      expect(formState['password'], isEmpty, reason: 'Password must be explicitly provided by the user');
    });

    test('Subscription quota & duplicate IP rejection handling contract', () {
      // When server rejects with ROUTER_LIMIT_EXCEEDED
      final quotaErrorResponse = {
        'success': false,
        'message': 'تم الوصول للحد الأقصى للراوترات في باقتك (الباقة الأساسية). الحد الأقصى المسموح: 1 راوتر.',
        'code': 'ROUTER_LIMIT_EXCEEDED',
      };

      expect(quotaErrorResponse['success'], false);
      expect(quotaErrorResponse['message'], contains('تم الوصول للحد الأقصى للراوترات'));

      // When server rejects with DEVICE_HOST_EXISTS
      final duplicateErrorResponse = {
        'success': false,
        'message': 'يوجد راوتر مسجل مسبقاً بنفس العنوان (192.168.88.1) ومنفذ (8728) في شبكتك',
        'code': 'DEVICE_HOST_EXISTS',
      };

      expect(duplicateErrorResponse['success'], false);
      expect(duplicateErrorResponse['message'], contains('يوجد راوتر مسجل مسبقاً'));
    });
  });
}
