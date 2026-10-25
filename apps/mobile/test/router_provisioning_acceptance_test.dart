import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/constants/api_endpoints.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/models/router_provisioning_models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile/features/router_setup/presentation/router_setup_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _routers;
  _MockRoutersNotifier(this._routers);

  @override
  Future<List<RouterDeviceModel>> build() async => _routers;

  @override
  Future<Map<String, dynamic>> testConnectionDirect(Map<String, dynamic> payload) async {
    return {
      'success': true,
      'message': 'تم الاتصال والمصادقة بنجاح مع الراوتر',
      'latencyMs': 14,
      'routerInfo': {
        'model': 'RB750Gr3',
        'rosVersion': '7.12.1',
      },
    };
  }
}

class _MockCurrentUserNotifier extends CurrentUserNotifier {
  @override
  AuthUser? build() {
    return AuthUser(
      id: 'usr-1',
      email: 'admin@sudafi.sd',
      fullName: 'مدير النظام',
      role: 'TENANT_ADMIN',
      tenantId: 'tenant-1',
    );
  }
}

class _MockActiveSessionsNotifier extends ActiveSessionsNotifier {
  @override
  Future<List<ActiveSessionModel>> build() async => [];
}

class _MockFinancialReportNotifier extends FinancialReportNotifier {
  @override
  Future<FinancialReportModel> build() async {
    return FinancialReportModel.fromJson({});
  }
}

class _MockSelectedRouterNotifier extends SelectedRouterNotifier {
  final String? initialId;
  _MockSelectedRouterNotifier({this.initialId});

  @override
  String? build() => initialId;
}

class _MockTenantQuotaNotifier extends TenantQuotaNotifier {
  @override
  Future<TenantQuotaModel?> build() async => null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late LocalStorage storage;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    storage = LocalStorage(prefs);
  });

  final mockRouter1 = RouterDeviceModel(
    id: 'r-001',
    name: 'راوتر البرج الشمالي',
    host: '192.168.10.1',
    apiPort: 8728,
    restPort: 443,
    rosVersion: 'V7',
    useSsl: false,
    username: 'admin',
    status: 'connected',
  );

  final mockRouter2 = RouterDeviceModel(
    id: 'r-002',
    name: 'راوتر السوق المركزي',
    host: '10.0.0.1',
    apiPort: 8728,
    restPort: 443,
    rosVersion: 'V6',
    useSsl: true,
    username: 'sudafi_admin',
    status: 'disconnected',
  );

  group('MikroTik Provisioning - Dashboard Integration & Quick Access', () {
    testWidgets('Dashboard renders «برمجة المايكروتيك» button alongside other quick actions', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      bool provisioningOpened = false;
      bool routerSetupOpened = false;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            routersProvider.overrideWith(() => _MockRoutersNotifier([mockRouter1])),
            selectedRouterIdProvider.overrideWith(() => _MockSelectedRouterNotifier(initialId: 'r-001')),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier()),
            activeSessionsProvider.overrideWith(() => _MockActiveSessionsNotifier()),
            financialReportProvider.overrideWith(() => _MockFinancialReportNotifier()),
            tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: DashboardScreen(
                onOpenRouterSetup: () => routerSetupOpened = true,
                onOpenRouterProvisioning: () => provisioningOpened = true,
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify «برمجة المايكروتيك» is present in the dashboard
      final provisioningFinder = find.text('برمجة المايكروتيك');
      expect(provisioningFinder, findsOneWidget);

      // Verify other quick actions are preserved and NOT removed or modified
      expect(find.text('راوتر MikroTik'), findsOneWidget);
      expect(find.text('الأجهزة المتصلة'), findsOneWidget);
      expect(find.text('النسخ الاحتياطي للمايكروتك'), findsOneWidget);
      expect(find.text('الرادار'), findsOneWidget);

      // Tap on «برمجة المايكروتيك»
      await tester.tap(provisioningFinder);
      await tester.pump();
      expect(provisioningOpened, isTrue);
      expect(routerSetupOpened, isFalse);
    });
  });

  group('MikroTik Provisioning - Router Setup Wizard Step 1 & Account Selection', () {
    testWidgets('Wizard opens in ACCOUNT mode when user has registered routers', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            routersProvider.overrideWith(() => _MockRoutersNotifier([mockRouter1, mockRouter2])),
            selectedRouterIdProvider.overrideWith(() => _MockSelectedRouterNotifier(initialId: 'r-001')),
          ],
          child: const MaterialApp(
            home: RouterSetupScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Title check
      expect(find.text('معالج برمجة وإعداد الراوتر'), findsOneWidget);

      // Mode tabs check
      expect(find.text('راوترات الحساب'), findsOneWidget);
      expect(find.text('البحث التلقائي'), findsOneWidget);
      expect(find.text('إدخال يدوي'), findsOneWidget);

      // Verify registered routers are listed
      expect(find.text('راوتر البرج الشمالي'), findsOneWidget);
      expect(find.text('راوتر السوق المركزي'), findsOneWidget);

      // Verify step 0 requirement note
      expect(find.text('اختبر الاتصال بالمصادقة للمتابعة'), findsOneWidget);
    });

    testWidgets('Wizard with pre-selected router initializes with its details', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            routersProvider.overrideWith(() => _MockRoutersNotifier([mockRouter1])),
          ],
          child: MaterialApp(
            home: RouterSetupScreen(router: mockRouter1),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('معالج برمجة وإعداد الراوتر'), findsOneWidget);
      expect(find.text('راوتر البرج الشمالي'), findsWidgets);
      expect(find.text('اختبار الاتصال والمصادقة الآن'), findsOneWidget);
    });
  });

  group('MikroTik Provisioning - Safety & Verification Constraints', () {
    test('Router discovery endpoint format is correct', () {
      expect(ApiEndpoints.deviceProvisionDiscover('dev-99'), '/devices/dev-99/provision/discover');
      expect(ApiEndpoints.deviceProvisionPreview('dev-99'), '/devices/dev-99/provision/preview');
      expect(ApiEndpoints.deviceProvisionApply('dev-99'), '/devices/dev-99/provision/apply');
    });

    test('ProvisionPreviewResponse accurately detects conflicting subnets and requires approval', () {
      final json = {
        'template': 'CLEAN_SETUP',
        'routerVersion': 'V7',
        'plannedSteps': [
          {'id': '1', 'stage': 'PRE_BACKUP', 'title': 'نسخة احتياطية', 'description': 'حفظ إعدادات الراوتر'},
          {'id': '2', 'stage': 'WAN_CONFIG', 'title': 'تهيئة WAN', 'description': 'DHCP Client'},
        ],
        'generatedCommands': [
          {'stage': 'WAN_CONFIG', 'command': '/ip/dhcp-client/add =interface=ether1', 'description': null},
        ],
        'warnings': [
          {'type': 'WAN_CHANGE', 'severity': 'CRITICAL', 'message': 'قد ينقطع اتصال الإنترنت مؤقتاً', 'suggestedAction': 'تأكد من كابل WAN'},
        ],
        'conflicts': [
          {'resource': 'IP_POOL', 'existingValue': '10.5.50.0/24', 'proposedValue': '10.5.50.0/24', 'details': 'النطاق مستخدم في bridge-lan'},
        ],
        'canProceed': false,
        'requiresCleanConfirmation': true,
        'backupRecommended': true,
      };

      final preview = ProvisionPreviewResponse.fromJson(json);

      expect(preview.canProceed, isFalse);
      expect(preview.requiresCleanConfirmation, isTrue);
      expect(preview.backupRecommended, isTrue);
      expect(preview.warnings.length, 1);
      expect(preview.warnings.first.severity, 'CRITICAL');
      expect(preview.conflicts.length, 1);
      expect(preview.conflicts.first.resource, 'IP_POOL');
    });

    test('ProvisionApplyResult parses multi-point verification flags accurately', () {
      final json = {
        'success': true,
        'deviceId': 'r-001',
        'deviceName': 'Main Core',
        'backupFilename': 'pre-sudafi-backup.backup',
        'executedStages': [
          {'stage': 'PRE_BACKUP', 'command': '/system backup save', 'status': 'SUCCESS', 'timestamp': '2026-10-22T10:00:00Z'},
          {'stage': 'WAN_CONFIG', 'command': '/ip dhcp-client add', 'status': 'SUCCESS', 'timestamp': '2026-10-22T10:00:02Z'},
          {'stage': 'HOTSPOT_PROFILE', 'command': '/ip hotspot profile add', 'status': 'SUCCESS', 'timestamp': '2026-10-22T10:00:05Z'},
        ],
        'verification': {
          'internetReachable': true,
          'wanConfigured': true,
          'defaultRouteActive': true,
          'hotspotOperational': true,
          'pingPacketsReceived': 3,
          'overallStatus': 'VERIFIED_READY',
          'diagnosticsMessage': 'تم التحقق بنجاح من عمل الإنترنت وخادم الهوتسبوت',
        },
      };

      final applyResult = ProvisionApplyResult.fromJson(json);

      expect(applyResult.success, isTrue);
      expect(applyResult.backupFilename, 'pre-sudafi-backup.backup');
      expect(applyResult.executedStages.length, 3);
      expect(applyResult.verification.overallStatus, 'VERIFIED_READY');
      expect(applyResult.verification.internetReachable, isTrue);
      expect(applyResult.verification.hotspotOperational, isTrue);
      expect(applyResult.verification.wanConfigured, isTrue);
      expect(applyResult.verification.defaultRouteActive, isTrue);
    });

    test('ProvisionApplyResult parses intermediate failure, failedStage, and recovery instructions', () {
      final json = {
        'success': false,
        'deviceId': 'r-001',
        'deviceName': 'Main Core',
        'backupFilename': 'pre-sudafi-backup.backup',
        'failedStage': 'WAN_CONFIG',
        'failureReason': 'تعذر تطبيق الأمر [/ip dhcp-client add]: interface ether1 does not exist',
        'recoveryInstructions': 'تم حفظ نسخة احتياطية مسبقاً باسم [pre-sudafi-backup.backup]. يمكنك استعادتها مباشرة عبر قائمة النسخ الاحتياطية أو WinBox.',
        'executedStages': [
          {'stage': 'PRE_BACKUP', 'command': '/system backup save', 'status': 'SUCCESS', 'timestamp': '2026-10-22T10:00:00Z'},
          {'stage': 'WAN_CONFIG', 'command': '/ip dhcp-client add', 'status': 'FAILED', 'error': 'interface ether1 does not exist', 'timestamp': '2026-10-22T10:00:02Z'},
        ],
        'verification': {
          'internetReachable': false,
          'wanConfigured': false,
          'defaultRouteActive': false,
          'hotspotOperational': false,
          'pingPacketsReceived': 0,
          'overallStatus': 'PARTIALLY_VERIFIED',
          'diagnosticsMessage': 'توقف الإعداد عند مرحلة [WAN_CONFIG].',
        },
      };

      final applyResult = ProvisionApplyResult.fromJson(json);

      expect(applyResult.success, isFalse);
      expect(applyResult.failedStage, 'WAN_CONFIG');
      expect(applyResult.failureReason, contains('تعذر تطبيق الأمر'));
      expect(applyResult.recoveryInstructions, contains('pre-sudafi-backup.backup'));
      expect(applyResult.executedStages.length, 2);
      expect(applyResult.executedStages[0].status, 'SUCCESS');
      expect(applyResult.executedStages[1].status, 'FAILED');
      expect(applyResult.verification.overallStatus, 'PARTIALLY_VERIFIED');
    });
  });
}

