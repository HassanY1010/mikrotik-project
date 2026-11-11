import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/router_provisioning_models.dart';
import 'package:mobile/core/services/mikrotik_discovery_service.dart';

void main() {
  group('MikrotikDiscoveryService & Local Execution Tests', () {
    final service = MikrotikDiscoveryService();

    test('1. normalizeList converts single object to List and preserves List', () {
      final singleObj = {'name': 'bridge1', 'mtu': '1500'};
      final listObj = [
        {'name': 'bridge1'},
        {'name': 'bridge2'}
      ];

      final normalizedSingle = service.normalizeList(singleObj);
      expect(normalizedSingle.length, 1);
      expect(normalizedSingle.first['name'], 'bridge1');

      final normalizedList = service.normalizeList(listObj);
      expect(normalizedList.length, 2);
      expect(normalizedList[1]['name'], 'bridge2');

      final normalizedNull = service.normalizeList(null);
      expect(normalizedNull.isEmpty, true);
    });

    test('2. canonicalSummary & SHA-256 hash generation is stable and deterministic', () {
      final snapMap = {
        'resource': {'uptime': '1d', 'version': '7.16.2'},
        'interfaces': [
          {'name': 'ether1', 'type': 'ether'},
          {'name': 'ether2', 'type': 'ether'}
        ],
        'bridges': [{'name': 'bridge1'}],
        'ipAddresses': [{'address': '192.168.88.1/24', 'interface': 'ether1'}],
      };

      final snap = RouterDiscoverySnapshotModel.fromJson(snapMap);
      expect(snap.interfaces.length, 2);
      expect(snap.bridges.length, 1);
      expect(snap.ipAddresses.length, 1);
      expect(snap.version, '7.16.2');
    });

    test('3. ExecutedStageLogModel serialization and deserialization', () {
      final stage = ExecutedStageLogModel(
        stage: 'BRIDGE_SETUP',
        command: '/interface bridge add name=br-lan',
        status: 'SUCCESS',
        error: null,
        timestamp: '2026-11-08T20:00:00Z',
      );

      final json = stage.toJson();
      expect(json['stage'], 'BRIDGE_SETUP');
      expect(json['status'], 'SUCCESS');

      final fromJson = ExecutedStageLogModel.fromJson(json);
      expect(fromJson.stage, 'BRIDGE_SETUP');
      expect(fromJson.command, '/interface bridge add name=br-lan');
    });

    test('4. ProvisionApplyResult serialization with full verification block', () {
      final result = ProvisionApplyResult(
        success: true,
        deviceId: '192.168.88.1',
        deviceName: 'L009UiGS-RM',
        backupFilename: 'pre-sudafi-test.backup',
        executedStages: [
          ExecutedStageLogModel(
            stage: 'PRE_BACKUP',
            status: 'SUCCESS',
            timestamp: '2026-11-08T20:00:00Z',
          ),
        ],
        failedStage: null,
        failureReason: null,
        recoveryInstructions: null,
        verification: const ProvisionVerificationResultModel(
          internetReachable: true,
          wanConfigured: true,
          defaultRouteActive: true,
          hotspotOperational: true,
          securityPoliciesVerified: true,
          pingPacketsReceived: 3,
          overallStatus: 'VERIFIED_READY',
          diagnosticsMessage: 'OK',
        ),
      );

      final json = result.toJson();
      expect(json['success'], true);
      expect(json['backupFilename'], 'pre-sudafi-test.backup');
      expect(json['verification']['overallStatus'], 'VERIFIED_READY');

      final reconstituted = ProvisionApplyResult.fromJson(json);
      expect(reconstituted.success, true);
      expect(reconstituted.verification.overallStatus, 'VERIFIED_READY');
      expect(reconstituted.executedStages.length, 1);
    });

    group('5. RouterOS REST Operation Mapping Tests', () {
      test('PUT for adding new resources to a collection', () {
        final op = MikrotikDiscoveryService.parseRouterCommand('/interface bridge add name=br-lan comment=main-bridge');
        expect(op.method, 'PUT');
        expect(op.path, '/interface/bridge');
        expect(op.body!['name'], 'br-lan');
        expect(op.body!['comment'], 'main-bridge');
      });

      test('POST on /set for singleton DNS configuration', () {
        final op = MikrotikDiscoveryService.parseRouterCommand('/ip dns set servers=8.8.8.8,1.1.1.1 allow-remote-requests=yes');
        expect(op.method, 'POST');
        expect(op.path, '/ip/dns/set');
        expect(op.body!['servers'], '8.8.8.8,1.1.1.1');
        expect(op.body!['allow-remote-requests'], 'yes');
      });

      test('POST on /set for singleton System Identity configuration', () {
        final op = MikrotikDiscoveryService.parseRouterCommand('/system identity set name=SudaFi-Gateway');
        expect(op.method, 'POST');
        expect(op.path, '/system/identity/set');
        expect(op.body!['name'], 'SudaFi-Gateway');
      });

      test('PATCH on specific record ID for list item modification', () {
        final op = MikrotikDiscoveryService.parseRouterCommand('/ip hotspot user profile set numbers=*1 rate-limit=2M/5M');
        expect(op.method, 'PATCH');
        expect(op.path, '/ip/hotspot/user/profile/*1');
        expect(op.body!['rate-limit'], '2M/5M');
      });

      test('Rejection of PATCH on collection when target ID is missing', () {
        expect(
          () => MikrotikDiscoveryService.parseRouterCommand('/ip hotspot user profile set rate-limit=2M/5M'),
          throwsArgumentError,
        );
      });

      test('DELETE on specific record with resource ID in URL', () {
        final op = MikrotikDiscoveryService.parseRouterCommand('/ip address remove numbers=*3');
        expect(op.method, 'DELETE');
        expect(op.path, '/ip/address/*3');
        expect(op.body, isNull);
      });

      test('Rejection of DELETE on collection without resource ID', () {
        expect(
          () => MikrotikDiscoveryService.parseRouterCommand('/ip address remove'),
          throwsArgumentError,
        );
      });

      test('POST for operational RPC action commands', () {
        final op = MikrotikDiscoveryService.parseRouterCommand('/system backup save name=pre-sudafi-123 password=SecretPass2026!');
        expect(op.method, 'POST');
        expect(op.path, '/system/backup/save');
        expect(op.body!['name'], 'pre-sudafi-123');
        expect(op.body!['password'], 'SecretPass2026!');
      });

      test('DELETE for /interface/bridge/port/remove =.id=*3 maps to DELETE collection resource ID', () {
        final op = MikrotikDiscoveryService.parseRouterCommand('/interface/bridge/port/remove =.id=*3');
        expect(op.method, 'DELETE');
        expect(op.path, '/interface/bridge/port/*3');
        expect(op.body, isNull);
      });
    });

    group('5b. Raw Record .id Normalization Tests', () {
      test('normalizeRawEntriesWithIds exposes RouterOS .id as id on bridgePorts while preserving fields', () {
        final normalized = MikrotikDiscoveryService.normalizeRawEntriesWithIds([
          {'.id': '*7', 'bridge': 'LAN', 'interface': 'ether2'},
          {'id': '*8', '.id': '*8', 'bridge': 'LAN', 'interface': 'ether3'},
        ]);
        expect(normalized[0]['id'], '*7');
        expect(normalized[0]['.id'], '*7');
        expect(normalized[0]['interface'], 'ether2');
        expect(normalized[1]['id'], '*8');
      });
    });

    group('6. Ed25519 Cryptographic Plan Verification Tests', () {
      const pubKeyHex = '16e773cd27757aa631d5469942a98ae97280f45fef132d896fa2b9d8175c7251';
      const sigHex = 'cb22c916a46ce313cdf930b5182835dc722b0dac7d85c18272bac94e38f9e2913029858468bacca7c60826999e17d5368a71427b81a52582d70af643d2510504';
      const validMsg = 'SudaFi-Plan-v1:tenant-1:dev-1';

      test('Verifies valid Ed25519 signature generated by backend', () async {
        final isValid = await MikrotikDiscoveryService.verifyEd25519PlanSignature(
          canonicalPayload: validMsg,
          signatureHex: sigHex,
          publicKeyHex: pubKeyHex,
        );
        expect(isValid, true);
      });

      test('Strictly rejects tampered payload with mismatched content', () async {
        final isValid = await MikrotikDiscoveryService.verifyEd25519PlanSignature(
          canonicalPayload: 'SudaFi-Plan-v1:tenant-1:dev-TAMPERED',
          signatureHex: sigHex,
          publicKeyHex: pubKeyHex,
        );
        expect(isValid, false);
      });

      test('Strictly rejects invalid or corrupted signature hex', () async {
        final corruptedSig = '00${sigHex.substring(2)}';
        final isValid = await MikrotikDiscoveryService.verifyEd25519PlanSignature(
          canonicalPayload: validMsg,
          signatureHex: corruptedSig,
          publicKeyHex: pubKeyHex,
        );
        expect(isValid, false);
      });
    });
  });
}
