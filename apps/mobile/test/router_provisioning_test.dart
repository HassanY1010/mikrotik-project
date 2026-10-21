import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/router_provisioning_models.dart';
import 'package:mobile/core/constants/api_endpoints.dart';

void main() {
  group('Router Provisioning Models - JSON Serialization & Parsing (Phase 2)', () {
    test('RouterDiscoverySnapshotModel parses full backend response correctly', () {
      final backendJson = {
        'resource': {
          'version': '7.12.1',
          'cpuLoad': 14,
          'uptime': '3d 12:45:00',
        },
        'interfaces': [
          {
            'name': 'ether1',
            'type': 'ether',
            'running': true,
            'disabled': false,
            'macAddress': '48:8F:5A:11:22:33',
            'comment': 'WAN Gateway uplink',
          },
          {
            'name': 'ether2',
            'type': 'ether',
            'running': true,
            'disabled': false,
            'macAddress': '48:8F:5A:11:22:34',
            'comment': 'LAN subscriber port',
          },
          {
            'name': 'ether3',
            'type': 'ether',
            'running': false,
            'disabled': true,
            'macAddress': '48:8F:5A:11:22:35',
            'comment': null,
          },
        ],
        'bridges': [
          {'name': 'bridge-lan'},
        ],
        'ipAddresses': [
          {'address': '192.168.88.1/24', 'interface': 'bridge-lan', 'disabled': false},
        ],
        'dhcpServers': [
          {'name': 'dhcp-default', 'interface': 'bridge-lan', 'disabled': false},
        ],
        'hotspotServers': [
          {'name': 'hs-default', 'interface': 'bridge-lan', 'profile': 'hsp-1', 'disabled': false},
        ],
      };

      final discovery = RouterDiscoverySnapshotModel.fromJson(backendJson);

      expect(discovery.version, '7.12.1');
      expect(discovery.cpuLoad, 14);
      expect(discovery.uptime, '3d 12:45:00');

      expect(discovery.interfaces.length, 3);
      expect(discovery.interfaces[0].name, 'ether1');
      expect(discovery.interfaces[0].running, true);
      expect(discovery.interfaces[0].disabled, false);
      expect(discovery.interfaces[2].disabled, true);

      expect(discovery.bridges.length, 1);
      expect(discovery.bridges.first, 'bridge-lan');

      expect(discovery.ipAddresses.length, 1);
      expect(discovery.ipAddresses.first.address, '192.168.88.1/24');

      expect(discovery.hotspotServers.length, 1);
      expect(discovery.hotspotServers.first, 'hs-default');
    });

    test('ProvisionPreviewResponse parses planned steps, conflicts, and warnings correctly', () {
      final backendPreviewJson = {
        'template': 'HOTSPOT_ON_EXISTING',
        'routerVersion': 'V7',
        'plannedSteps': [
          {
            'id': 'step-1',
            'stage': 'LAN_BRIDGE',
            'title': 'إنشاء جسر الشبكة المحلية',
            'description': 'إنشاء bridge-hotspot وربط ether2 و ether3',
          },
          {
            'id': 'step-2',
            'stage': 'HOTSPOT_SERVER',
            'title': 'إعداد خادم الهوتسبوت',
            'description': 'إعداد hs-sudafi بعنوان 10.5.50.1/24',
          },
        ],
        'generatedCommands': [
          {
            'stage': 'LAN_BRIDGE',
            'command': '/interface bridge add name=bridge-hotspot comment="SudaFi Managed Bridge"',
            'description': 'إضافة الجسر',
          },
          {
            'stage': 'LAN_BRIDGE',
            'command': '/interface bridge port add bridge=bridge-hotspot interface=ether2',
            'description': 'ربط منفذ ether2',
          },
        ],
        'warnings': [
          {
            'type': 'LAN_OVERWRITE',
            'severity': 'WARNING',
            'message': 'سيتم نقل المنافذ المحددة إلى الجسر الجديد',
            'suggestedAction': 'تأكد من عدم وجود خادم إدارة على هذه المنافذ',
          },
        ],
        'conflicts': [
          {
            'resource': '10.5.50.0/24',
            'existingValue': 'bridge-lan',
            'proposedValue': 'bridge-hotspot',
            'details': 'العنوان 10.5.50.0/24 يتعارض مع شبكة موجودة مسبقًا',
          },
        ],
        'canProceed': true,
        'requiresCleanConfirmation': false,
        'backupRecommended': true,
      };

      final preview = ProvisionPreviewResponse.fromJson(backendPreviewJson);

      expect(preview.template, 'HOTSPOT_ON_EXISTING');
      expect(preview.routerVersion, 'V7');
      expect(preview.plannedSteps.length, 2);
      expect(preview.plannedSteps[0].stage, 'LAN_BRIDGE');
      expect(preview.generatedCommands.length, 2);
      expect(preview.warnings.length, 1);
      expect(preview.warnings.first.type, 'LAN_OVERWRITE');
      expect(preview.warnings.first.severity, 'WARNING');
      expect(preview.conflicts.length, 1);
      expect(preview.conflicts.first.resource, '10.5.50.0/24');
      expect(preview.conflicts.first.details, contains('يتعارض مع شبكة موجودة'));
      expect(preview.canProceed, true);
      expect(preview.requiresCleanConfirmation, false);
      expect(preview.backupRecommended, true);
    });

    test('ProvisionApplyResult parses stages and multi-point verification correctly', () {
      final backendApplyJson = {
        'success': true,
        'deviceId': 'dev-mikrotik-01',
        'deviceName': 'Core-Router-RB750Gr3',
        'backupFilename': 'pre-sudafi-1729000000000.backup',
        'executedStages': [
          {
            'stage': 'BACKUP',
            'status': 'SUCCESS',
            'command': '/system backup save name=pre-sudafi-1729000000000',
            'timestamp': '2026-10-21T07:00:01Z',
          },
          {
            'stage': 'WAN_SETUP',
            'status': 'SUCCESS',
            'command': '/ip dhcp-client add interface=ether1',
            'timestamp': '2026-10-21T07:00:03Z',
          },
          {
            'stage': 'LAN_BRIDGE',
            'status': 'SUCCESS',
            'command': '/interface bridge add name=bridge-hotspot',
            'timestamp': '2026-10-21T07:00:05Z',
          },
          {
            'stage': 'HOTSPOT_SETUP',
            'status': 'SUCCESS',
            'command': '/ip hotspot add name=hs-sudafi',
            'timestamp': '2026-10-21T07:00:07Z',
          },
          {
            'stage': 'VERIFICATION',
            'status': 'SUCCESS',
            'timestamp': '2026-10-21T07:00:09Z',
          },
        ],
        'verification': {
          'internetReachable': true,
          'wanConfigured': true,
          'defaultRouteActive': true,
          'hotspotOperational': true,
          'pingPacketsReceived': 4,
          'overallStatus': 'VERIFIED_READY',
          'diagnosticsMessage': 'جميع الفحوصات الفنية لـ WAN وRoute وPing وHotspot نجحت بالكامل',
        },
      };

      final result = ProvisionApplyResult.fromJson(backendApplyJson);

      expect(result.success, true);
      expect(result.deviceId, 'dev-mikrotik-01');
      expect(result.deviceName, 'Core-Router-RB750Gr3');
      expect(result.backupFilename, 'pre-sudafi-1729000000000.backup');
      expect(result.executedStages.length, 5);
      expect(result.executedStages.first.stage, 'BACKUP');
      expect(result.executedStages.first.status, 'SUCCESS');

      expect(result.verification.internetReachable, true);
      expect(result.verification.wanConfigured, true);
      expect(result.verification.defaultRouteActive, true);
      expect(result.verification.hotspotOperational, true);
      expect(result.verification.pingPacketsReceived, 4);
      expect(result.verification.overallStatus, 'VERIFIED_READY');
      expect(result.verification.diagnosticsMessage, contains('نجحت بالكامل'));
    });

    test('ProvisionApplyResult detects partial failure and non-automated rollback', () {
      final backendApplyFailJson = {
        'success': false,
        'deviceId': 'dev-mikrotik-01',
        'deviceName': 'Core-Router-RB750Gr3',
        'backupFilename': 'pre-sudafi-1729000000000.backup',
        'executedStages': [
          {
            'stage': 'BACKUP',
            'status': 'SUCCESS',
            'command': '/system backup save name=pre-sudafi-1729000000000',
            'timestamp': '2026-10-21T07:00:01Z',
          },
          {
            'stage': 'LAN_BRIDGE',
            'status': 'FAILED',
            'error': 'فشل إضافة منفذ ether2 إلى bridge-hotspot (failure: already member)',
            'timestamp': '2026-10-21T07:00:04Z',
          },
        ],
        'failedStage': 'LAN_BRIDGE',
        'failureReason': 'فشل إضافة منفذ ether2 إلى bridge-hotspot (failure: already member)',
        'recoveryInstructions': 'النسخة الاحتياطية متوفرة على الراوتر باسم pre-sudafi-1729000000000.backup ويمكن استعادتها يدويًا عبر WinBox أو أمر /system backup load.',
        'verification': {
          'internetReachable': false,
          'wanConfigured': false,
          'defaultRouteActive': false,
          'hotspotOperational': false,
          'pingPacketsReceived': 0,
          'overallStatus': 'VERIFICATION_FAILED',
          'diagnosticsMessage': 'فشلت التهيئة أثناء مرحلة LAN_BRIDGE',
        },
      };

      final result = ProvisionApplyResult.fromJson(backendApplyFailJson);

      expect(result.success, false);
      expect(result.backupFilename, 'pre-sudafi-1729000000000.backup');
      expect(result.failedStage, 'LAN_BRIDGE');
      expect(result.failureReason, contains('already member'));
      expect(result.recoveryInstructions, contains('يدويًا'));
      expect(result.verification.internetReachable, false);
      expect(result.verification.overallStatus, 'VERIFICATION_FAILED');
      expect(result.backupFilename, isNotNull);
    });
  });

  group('API Endpoints Validation', () {
    test('Provisioning endpoints match backend device routes', () {
      expect(ApiEndpoints.deviceProvisionDiscover('dev-1'), '/devices/dev-1/provision/discover');
      expect(ApiEndpoints.deviceProvisionPreview('dev-1'), '/devices/dev-1/provision/preview');
      expect(ApiEndpoints.deviceProvisionApply('dev-1'), '/devices/dev-1/provision/apply');
    });
  });
}
