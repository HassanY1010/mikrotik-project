import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/constants/api_endpoints.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/auto_provisioning/models/auto_provisioning_models.dart';
import 'package:mobile/features/auto_provisioning/presentation/auto_provisioning_screen.dart';
import 'package:mobile/features/auto_provisioning/services/auto_provisioning_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _routers;
  _MockRoutersNotifier(this._routers);

  @override
  Future<List<RouterDeviceModel>> build() async => _routers;
}

class _MockSelectedRouterNotifier extends SelectedRouterNotifier {
  final String? _id;
  _MockSelectedRouterNotifier(this._id);

  @override
  String? build() => _id;
}

class _FakeAutoProvisioningService extends AutoProvisioningService {
  final AutoProvisionDiscoveryReport report;
  final AutoProvisionPlanPreview preview;

  _FakeAutoProvisioningService({
    required this.report,
    required this.preview,
    required super.apiClient,
  });

  @override
  Future<AutoProvisionDiscoveryReport> discoverRouter(
    String deviceId, {
    bool forceRefresh = false,
  }) async =>
      report;

  @override
  Future<AutoProvisionPlanPreview> buildPlanPreview(
    String deviceId,
    Map<String, dynamic> configPayload,
  ) async =>
      preview;

  @override
  Future<List<AutoProvisionOperationModel>> listOperations(String deviceId) async => [
        const AutoProvisionOperationModel(
          id: 'op-hist-1',
          deviceId: 'dev-1',
          status: 'COMPLETED',
          template: 'CLEAN_SETUP',
          progressPercent: 100,
          totalSteps: 12,
          totalCommands: 15,
          succeededCommands: 15,
          failedCommands: 0,
          skippedCommands: 0,
          steps: [],
          commandLogs: [],
          backups: [],
        ),
      ];

  @override
  Future<List<AutoProvisionBackupItem>> listBackups(String deviceId) async => const [];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late LocalStorage storage;
  late ApiClient apiClient;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    storage = LocalStorage(prefs);
    apiClient = ApiClient(localStorage: storage);
  });

  final testRouter = RouterDeviceModel(
    id: 'dev-1',
    name: 'راوتر المختبر',
    host: '192.168.88.1',
    apiPort: 8728,
    restPort: 443,
    rosVersion: 'V7',
    useSsl: false,
    username: 'admin',
    status: 'connected',
  );

  AutoProvisionDiscoveryReport makeReport({required bool hasWifi}) {
    return AutoProvisionDiscoveryReport(
      deviceId: 'dev-1',
      deviceName: 'راوتر المختبر',
      host: '192.168.88.1',
      identity: 'SudaFi-Lab',
      uptime: '2d4h',
      freeMemoryBytes: 200 * 1024 * 1024,
      totalMemoryBytes: 256 * 1024 * 1024,
      freeHddBytes: 32 * 1024 * 1024,
      totalHddBytes: 64 * 1024 * 1024,
      capabilities: AutoProvisionCapabilities(
        osFamily: 'ROS7',
        version: '7.15.2',
        majorVersion: 7,
        minorVersion: 15,
        boardName: hasWifi ? 'hAP ax2' : 'RB750Gr3',
        model: hasWifi ? 'hAP ax2' : 'hEX',
        architecture: hasWifi ? 'arm64' : 'mmips',
        supportsHotspot: true,
        wirelessStack: hasWifi ? 'WIFI_QCOM' : 'NONE',
        supportsWireless: false,
        supportsWifi: hasWifi,
        ntpStack: 'NTP_V7',
        supportsNtpServersTable: true,
        supportsQueueTypes: true,
        supportsScheduler: true,
        supportsNetwatch: true,
        supportsRscExport: true,
        supportsBinaryBackup: true,
        supportsRestApi: true,
        supportsSafeModeInCurrentSession: false,
        safeModeReason: 'الحماية عبر النسخ الاحتياطي والتراجع التتبعي',
        hasEnoughDiskForBackup: true,
        freeHddBytes: 32 * 1024 * 1024,
        ethernetPorts: const ['ether1', 'ether2', 'ether3', 'ether4', 'ether5'],
        sfpPorts: const [],
        totalPhysicalPorts: 5,
        wirelessInterfaceNames: const [],
        wifiInterfaceNames: hasWifi ? const ['wifi1'] : const [],
        compatibilityStatus: 'COMPATIBLE',
        compatibilitySummary: 'متوافق بالكامل',
        warnings: const [],
      ),
      interfacesAssessment: const [
        DiscoveredInterfaceAssessment(
          name: 'ether1',
          type: 'ether',
          enabled: true,
          running: true,
          hasIp: false,
          ipAddresses: [],
          bridged: false,
          role: 'WAN',
          confidence: 'CONFIRMED',
          isWanCandidate: true,
          isLanCandidate: false,
          isManagementPath: false,
          hasExistingConfig: true,
          reasons: ['Default route egress'],
        ),
        DiscoveredInterfaceAssessment(
          name: 'ether2',
          type: 'ether',
          enabled: true,
          running: true,
          hasIp: false,
          ipAddresses: [],
          bridged: false,
          role: 'LAN',
          confidence: 'INFERRED',
          isWanCandidate: false,
          isLanCandidate: true,
          isManagementPath: false,
          hasExistingConfig: false,
          reasons: [],
        ),
        DiscoveredInterfaceAssessment(
          name: 'ether5',
          type: 'ether',
          enabled: true,
          running: true,
          hasIp: true,
          ipAddresses: ['192.168.88.1/24'],
          bridged: false,
          role: 'MANAGEMENT',
          confidence: 'CONFIRMED',
          isWanCandidate: false,
          isLanCandidate: false,
          isManagementPath: true,
          hasExistingConfig: true,
          reasons: ['Active management session'],
        ),
      ],
      wanRoleAmbiguous: false,
      suggestedWanInterface: 'ether1',
      suggestedLanInterfaces: const ['ether2'],
      managementInterface: 'ether5',
      snapshotHash: 'abc123',
      discoveredAt: '2026-11-11T00:00:00Z',
      bridges: const [],
      hotspotServers: const [],
      ipAddresses: const [],
    );
  }

  const fakePreview = AutoProvisionPlanPreview(
    planId: 'plan-1',
    planHash: 'hash-1',
    osFamily: 'ROS7',
    rosVersion: '7.15.2',
    canProceed: true,
    wanConfirmationRequired: false,
    wanConfirmationReasons: [],
    managementSevered: false,
    blockedReasons: [],
    warnings: [],
    currentSettings: ['ether1 DHCP'],
    newSettings: ['إنشاء جسر bridge-hotspot', 'تفعيل هوتسبوت hs-sudafi'],
    riskNotes: [],
    stages: [
      PlannedProvisionStageModel(
        stepOrder: 1,
        stage: 'WAN',
        title: 'إعداد بوابة الإنترنت',
        description: 'DHCP on ether1',
        status: 'PLANNED',
        expectedResult: 'WAN up',
        riskLevel: 'LOW',
        addedItems: ['DHCP Client'],
        changedItems: [],
        skippedItems: [],
        commandPreviews: ['/ip dhcp-client add interface=ether1'],
      ),
    ],
    totalPlannedCommands: 1,
    planToken: {'canonicalPayload': 'SUDAFI', 'signature': 'sig'},
  );

  test('API endpoints match backend /mikrotik-provisioning routes accurately', () {
    expect(ApiEndpoints.autoProvisionDiscover('dev-1'), '/mikrotik-provisioning/devices/dev-1/discover');
    expect(ApiEndpoints.autoProvisionApply('dev-1'), '/mikrotik-provisioning/devices/dev-1/apply');
    expect(ApiEndpoints.autoProvisionBackupDownload('bk-1'), '/mikrotik-provisioning/backups/bk-1/download');
    expect(ApiEndpoints.autoProvisionOperationCancel('op-1'), '/mikrotik-provisioning/operations/op-1/cancel');
  });

  testWidgets('Screen 1 -> Screen 2 filters out WiFi controls on wired-only router and transitions to Preview (Screen 3)', (tester) async {
    final wiredReport = makeReport(hasWifi: false);
    final fakeSvc = _FakeAutoProvisioningService(
      report: wiredReport,
      preview: fakePreview,
      apiClient: apiClient,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          routersProvider.overrideWith(() => _MockRoutersNotifier([testRouter])),
          selectedRouterIdProvider.overrideWith(() => _MockSelectedRouterNotifier('dev-1')),
          autoProvisioningServiceProvider.overrideWithValue(fakeSvc),
        ],
        child: MaterialApp(
          home: AutoProvisioningScreen(initialRouter: testRouter),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Screen 1 shows discovered hardware & wired-only badge
    expect(find.text('برمجة MikroTik تلقائياً'), findsOneWidget);
    expect(find.textContaining('hEX'), findsOneWidget);
    expect(find.textContaining('بدون بث لاسلكي'), findsOneWidget);

    // Navigate to Screen 2 (Settings)
    await tester.ensureVisible(find.text('متابعة لإعدادات البرمجة'));
    await tester.tap(find.text('متابعة لإعدادات البرمجة'));
    await tester.pumpAndSettle();

    // Wired-only model hides WiFi SSID input & shows clear info banner
    await tester.ensureVisible(find.textContaining('بث WiFi غير متاح'));
    expect(find.textContaining('بث WiFi غير متاح'), findsOneWidget);
    expect(find.text('اسم الشبكة (SSID)'), findsNothing);

    // Generate Plan Preview (Screen 3)
    await tester.ensureVisible(find.text('توليد ومعاينة خطة البرمجة'));
    await tester.tap(find.text('توليد ومعاينة خطة البرمجة'));
    await tester.pumpAndSettle();

    expect(find.textContaining('ملخص التغييرات'), findsOneWidget);
    expect(find.text('تطبيق البرمجة الآن بأمان'), findsOneWidget);
  });

  testWidgets('Screen 2 shows WiFi controls when discovered router supports wifi-qcom', (tester) async {
    final wifiReport = makeReport(hasWifi: true);
    final fakeSvc = _FakeAutoProvisioningService(
      report: wifiReport,
      preview: fakePreview,
      apiClient: apiClient,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          routersProvider.overrideWith(() => _MockRoutersNotifier([testRouter])),
          selectedRouterIdProvider.overrideWith(() => _MockSelectedRouterNotifier('dev-1')),
          autoProvisioningServiceProvider.overrideWithValue(fakeSvc),
        ],
        child: MaterialApp(
          home: AutoProvisioningScreen(initialRouter: testRouter),
        ),
      ),
    );

    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('متابعة لإعدادات البرمجة'));
    await tester.tap(find.text('متابعة لإعدادات البرمجة'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.textContaining('WIFI_QCOM'));
    expect(find.textContaining('WIFI_QCOM'), findsOneWidget);
    expect(find.text('اسم الشبكة (SSID)'), findsOneWidget);
  });
}
