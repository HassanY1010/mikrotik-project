import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/router_provisioning_models.dart';
import 'package:mobile/core/constants/api_endpoints.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/services/router_provisioning_service.dart';
import 'package:mobile/core/storage/local_storage.dart';

class _StubHttpClientAdapter implements HttpClientAdapter {
  final FutureOr<ResponseBody> Function(RequestOptions options) onFetch;

  _StubHttpClientAdapter(this.onFetch);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return onFetch(options);
  }

  @override
  void close({bool force = false}) {}
}

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

    test('SecurityPoliciesConfigModel serializes and copies with overrides correctly', () {
      const config = SecurityPoliciesConfigModel();
      expect(config.antiTethering, true);
      expect(config.clientIsolation, true);
      expect(config.protectManagementAccess, true);
      expect(config.forceRouterDns, true);
      expect(config.enforceSingleDevice, true);
      expect(config.blockUnauthenticatedBypass, true);

      final json = config.toJson();
      expect(json['antiTethering'], true);
      expect(json['clientIsolation'], true);

      final modified = config.copyWith(antiTethering: false, forceRouterDns: false);
      expect(modified.antiTethering, false);
      expect(modified.clientIsolation, true);
      expect(modified.forceRouterDns, false);
    });

    test('ProvisionPreviewResponse parses securityPoliciesReport with realistic effects and limits', () {
      final previewWithSecurityJson = {
        'template': 'CLEAN_SETUP',
        'routerVersion': 'V7',
        'plannedSteps': [],
        'generatedCommands': [],
        'warnings': [],
        'conflicts': [],
        'canProceed': true,
        'requiresCleanConfirmation': false,
        'backupRecommended': true,
        'securityPoliciesReport': [
          {
            'id': 'ANTI_TETHERING',
            'name': 'الحد من مشاركة الاتصال وتمريره (Anti-Tethering / TTL Lock)',
            'category': 'SHARING_PREVENTION',
            'status': 'PROPOSED',
            'isSupported': true,
            'description': 'تثبيت قيمة TTL=1 على الحزم المتجهة للمشتركين',
            'realisticEffect': 'يمنع بث الإنترنت عبر Mobile Hotspot ومشاركة USB/Bluetooth للأجهزة غير المروتة',
            'knownLimitations': 'لا يمنع الأجهزة المروتة (Rooted Android)',
          },
          {
            'id': 'CLIENT_ISOLATION',
            'name': 'عزل أجهزة المشتركين (Client Port Isolation)',
            'category': 'SHARING_PREVENTION',
            'status': 'ACTIVE_ON_ROUTER',
            'isSupported': true,
            'description': 'عزل المنافذ (Horizon=1)',
            'realisticEffect': 'يمنع التواصل المباشر وتطبيقات البروكسي المحلية',
            'knownLimitations': 'يطبق على المنافذ السلكية ويتطلب تفعيل عزل AP',
          },
        ],
      };

      final preview = ProvisionPreviewResponse.fromJson(previewWithSecurityJson);
      expect(preview.securityPoliciesReport.length, 2);
      expect(preview.securityPoliciesReport[0].id, 'ANTI_TETHERING');
      expect(preview.securityPoliciesReport[0].status, 'PROPOSED');
      expect(preview.securityPoliciesReport[0].realisticEffect, contains('Mobile Hotspot'));
      expect(preview.securityPoliciesReport[0].knownLimitations, contains('Rooted Android'));
      expect(preview.securityPoliciesReport[1].status, 'ACTIVE_ON_ROUTER');
    });
  });

  group('API Endpoints Validation', () {
    test('Provisioning endpoints match backend device routes', () {
      expect(ApiEndpoints.deviceProvisionDiscover('dev-1'), '/devices/dev-1/provision/discover');
      expect(ApiEndpoints.deviceProvisionPreview('dev-1'), '/devices/dev-1/provision/preview');
      expect(ApiEndpoints.deviceProvisionApply('dev-1'), '/devices/dev-1/provision/apply');
    });
  });

  group('RouterProvisioningService - TransformInterceptor Envelope Handling', () {
    late LocalStorage storage;

    setUp(() async {
      TestWidgetsFlutterBinding.ensureInitialized();
      SharedPreferences.setMockInitialValues({});
      storage = await LocalStorage.init();
    });

    RouterProvisioningService buildServiceWithResponse(
      FutureOr<ResponseBody> Function(RequestOptions options) handler,
    ) {
      final apiClient = ApiClient(localStorage: storage);
      apiClient.dio.httpClientAdapter = _StubHttpClientAdapter(handler);
      return RouterProvisioningService(apiClient);
    }

    ResponseBody jsonResponse(Object body, {int statusCode = 200}) {
      return ResponseBody.fromString(
        jsonEncode(body),
        statusCode,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }

    test('preview() unwraps { success, data, timestamp } envelope from TransformInterceptor', () async {
      final service = buildServiceWithResponse((options) {
        expect(options.path, contains('devices/dev-7/provision/preview'));
        return jsonResponse({
          'success': true,
          'data': {
            'template': 'CLEAN_SETUP',
            'routerVersion': 'V7',
            'plannedSteps': [
              {
                'id': 'step-1',
                'stage': 'PRE_BACKUP',
                'title': 'نسخة احتياطية',
                'description': 'حفظ نسخة قبل التعديل',
              },
              {
                'id': 'step-2',
                'stage': 'LAN_BRIDGE',
                'title': 'جسر الشبكة المحلية',
                'description': 'إنشاء bridge-hotspot',
              },
            ],
            'generatedCommands': [
              {
                'stage': 'LAN_BRIDGE',
                'command': '/interface/bridge/add name=bridge-hotspot',
                'description': 'إضافة الجسر',
              },
            ],
            'securityPoliciesReport': [],
            'warnings': [],
            'conflicts': [],
            'canProceed': true,
            'requiresCleanConfirmation': true,
            'backupRecommended': true,
            'planToken': {
              'tenantId': 't-1',
              'deviceId': 'dev-7',
              'signature': 'sig-abc',
            },
          },
          'timestamp': '2026-11-11T10:20:00.000Z',
        });
      });

      final preview = await service.preview('dev-7', {'template': 'CLEAN_SETUP'});

      expect(preview.canProceed, isTrue);
      expect(preview.requiresCleanConfirmation, isTrue);
      expect(preview.plannedSteps.length, 2);
      expect(preview.generatedCommands.length, 1);
      expect(preview.generatedCommands.first.command, contains('bridge-hotspot'));
      expect(preview.planToken?['signature'], 'sig-abc');
    });

    test('discover() unwraps { success, data, timestamp } envelope correctly', () async {
      final service = buildServiceWithResponse((options) {
        expect(options.path, contains('devices/dev-7/provision/discover'));
        return jsonResponse({
          'success': true,
          'data': {
            'resource': {'version': '7.19.1', 'cpuLoad': 5, 'uptime': '1h'},
            'interfaces': [
              {'name': 'ether1', 'type': 'ether', 'running': true, 'disabled': false},
              {'name': 'ether2', 'type': 'ether', 'running': true, 'disabled': false},
            ],
            'bridges': [
              {'name': 'bridge'},
            ],
            'ipAddresses': [
              {'address': '192.168.88.1/24', 'interface': 'bridge', 'disabled': false},
            ],
            'hotspotServers': [],
          },
          'timestamp': '2026-11-11T10:20:00.000Z',
        });
      });

      final snapshot = await service.discover('dev-7');

      expect(snapshot.version, '7.19.1');
      expect(snapshot.interfaces.length, 2);
      expect(snapshot.bridges, ['bridge']);
      expect(snapshot.ipAddresses.first.address, '192.168.88.1/24');
    });

    test('apply() handles both direct (unwrapped) and { success, data } responses', () async {
      final directService = buildServiceWithResponse((_) {
        return jsonResponse({
          'success': true,
          'deviceId': 'dev-7',
          'deviceName': 'L009UiGS',
          'executedStages': [
            {
              'stage': 'PRE_BACKUP',
              'status': 'SUCCESS',
              'timestamp': '2026-11-11T10:20:01.000Z',
            },
          ],
          'verification': {
            'internetReachable': true,
            'wanConfigured': true,
            'defaultRouteActive': true,
            'hotspotOperational': true,
            'overallStatus': 'VERIFIED_READY',
            'diagnosticsMessage': 'تم التحقق بنجاح',
          },
        });
      });

      final directResult = await directService.apply('dev-7', {'template': 'CLEAN_SETUP'});
      expect(directResult.success, isTrue);
      expect(directResult.deviceId, 'dev-7');
      expect(directResult.executedStages.length, 1);
      expect(directResult.verification.overallStatus, 'VERIFIED_READY');

      final wrappedService = buildServiceWithResponse((_) {
        return jsonResponse({
          'success': true,
          'data': {
            'success': true,
            'deviceId': 'dev-7',
            'deviceName': 'L009UiGS',
            'executedStages': [
              {
                'stage': 'VERIFICATION',
                'status': 'SUCCESS',
                'timestamp': '2026-11-11T10:20:02.000Z',
              },
            ],
            'verification': {
              'internetReachable': true,
              'wanConfigured': true,
              'defaultRouteActive': true,
              'hotspotOperational': true,
              'overallStatus': 'VERIFIED_READY',
              'diagnosticsMessage': 'جاهز',
            },
          },
          'timestamp': '2026-11-11T10:20:02.000Z',
        });
      });

      final wrappedResult = await wrappedService.apply('dev-7', {'template': 'CLEAN_SETUP'});
      expect(wrappedResult.success, isTrue);
      expect(wrappedResult.deviceName, 'L009UiGS');
      expect(wrappedResult.executedStages.length, 1);
      expect(wrappedResult.verification.overallStatus, 'VERIFIED_READY');
    });

    test('preview() rejects wrapped null data payload explicitly instead of silently returning empty preview', () async {
      final service = buildServiceWithResponse((_) {
        return jsonResponse({
          'success': true,
          'data': null,
          'timestamp': '2026-11-11T10:20:00.000Z',
        });
      });

      await expectLater(
        () => service.preview('dev-7', {'template': 'CLEAN_SETUP'}),
        throwsA(isA<Exception>()),
      );
    });
  });
}

