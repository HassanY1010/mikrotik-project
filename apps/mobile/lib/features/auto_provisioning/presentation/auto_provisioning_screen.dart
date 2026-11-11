import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../models/auto_provisioning_models.dart';
import '../services/auto_provisioning_service.dart';
import '../widgets/provisioning_common_widgets.dart';

class AutoProvisioningScreen extends ConsumerStatefulWidget {
  final RouterDeviceModel? initialRouter;

  const AutoProvisioningScreen({super.key, this.initialRouter});

  @override
  ConsumerState<AutoProvisioningScreen> createState() =>
      _AutoProvisioningScreenState();
}

class _AutoProvisioningScreenState extends ConsumerState<AutoProvisioningScreen> {
  int _step = 0; // 0: Discovery, 1: Settings, 2: Preview, 3: Live Execution, 4: Result/Backup, 5: History
  String? _selectedDeviceId;
  bool _loading = false;
  String? _errorMessage;

  AutoProvisionDiscoveryReport? _discovery;
  AutoProvisionPlanPreview? _preview;
  AutoProvisionOperationModel? _activeOperation;
  List<AutoProvisionOperationModel> _historyOperations = [];
  List<AutoProvisionBackupItem> _deviceBackups = [];
  Timer? _pollTimer;

  // Dynamic Settings Form State (populated from discovery, never hardcoded router guesses)
  String _template = 'CLEAN_SETUP';
  String _wanInterface = '';
  String _wanMode = 'DHCP';
  bool _enableNat = true;
  bool _confirmWanChange = false;
  final _pppoeUserCtrl = TextEditingController();
  final _pppoePassCtrl = TextEditingController();
  final _staticIpCtrl = TextEditingController();
  final _staticGatewayCtrl = TextEditingController();
  final _bridgeNameCtrl = TextEditingController(text: 'bridge-hotspot');
  final _lanGatewayCtrl = TextEditingController(text: '10.5.50.1/24');
  final _poolRangeCtrl = TextEditingController();
  final List<String> _selectedLanPorts = [];

  // Wireless / WiFi (only applied when discovered device supports WiFi or Wireless)
  bool _wirelessEnabled = false;
  final _wifiSsidCtrl = TextEditingController(text: 'SudaFi-Hotspot');
  final _wifiPassCtrl = TextEditingController();
  final _wifiCountryCtrl = TextEditingController();

  // Hotspot & Queues
  final _hsServerNameCtrl = TextEditingController(text: 'hs-sudafi');
  final _hsDnsNameCtrl = TextEditingController(text: 'login.sudafi.net');
  final _rateLimitCtrl = TextEditingController(text: '2M/5M');
  final _identityCtrl = TextEditingController();

  // Security Policies
  bool _antiTethering = true;
  bool _clientIsolation = true;
  bool _protectManagementAccess = true;
  bool _protectWanAccess = false;
  bool _forceRouterDns = true;
  bool _enforceSingleDevice = true;
  bool _blockUnauthenticatedBypass = true;
  bool _enableQueues = true;
  bool _enableAutoBackupSchedule = false;
  bool _enableNetwatch = false;
  bool _createPreBackup = true;

  AutoProvisioningService get _service => ref.read(autoProvisioningServiceProvider);

  @override
  void initState() {
    super.initState();
    _selectedDeviceId = widget.initialRouter?.id ?? ref.read(selectedRouterIdProvider);
    WidgetsBinding.instance.addPostFrameCallback((_) => _initRouterSelection());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _pppoeUserCtrl.dispose();
    _pppoePassCtrl.dispose();
    _staticIpCtrl.dispose();
    _staticGatewayCtrl.dispose();
    _bridgeNameCtrl.dispose();
    _lanGatewayCtrl.dispose();
    _poolRangeCtrl.dispose();
    _wifiSsidCtrl.dispose();
    _wifiPassCtrl.dispose();
    _wifiCountryCtrl.dispose();
    _hsServerNameCtrl.dispose();
    _hsDnsNameCtrl.dispose();
    _rateLimitCtrl.dispose();
    _identityCtrl.dispose();
    super.dispose();
  }

  void _initRouterSelection() {
    final routers = ref.read(routersProvider).asData?.value ?? [];
    if (_selectedDeviceId == null && routers.isNotEmpty) {
      setState(() => _selectedDeviceId = routers.first.id);
    }
    if (_selectedDeviceId != null) {
      _runDiscovery();
    }
  }

  Future<void> _runDiscovery({bool forceRefresh = false}) async {
    final deviceId = _selectedDeviceId;
    if (deviceId == null || deviceId.isEmpty) return;

    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final report = await _service.discoverRouter(deviceId, forceRefresh: forceRefresh);
      if (!mounted) return;
      _applyDiscoveryDefaults(report);
      setState(() {
        _discovery = report;
        _preview = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _applyDiscoveryDefaults(AutoProvisionDiscoveryReport report) {
    final nonMgmtPhysical = report.interfacesAssessment
        .where((i) =>
            !i.isManagementPath &&
            (i.type == 'ether' || i.type == 'wlan' || i.type == 'wifi' || i.type.contains('sfp')))
        .map((i) => i.name)
        .toList();

    final guessedWan = report.suggestedWanInterface ??
        report.interfacesAssessment.where((i) => i.isWanCandidate).map((i) => i.name).firstOrNull ??
        nonMgmtPhysical.firstOrNull ??
        'ether1';

    _wanInterface = guessedWan;
    _confirmWanChange = !report.wanRoleAmbiguous;
    _selectedLanPorts
      ..clear()
      ..addAll(
        report.suggestedLanInterfaces.where((p) => p != _wanInterface).take(3),
      );

    if (_selectedLanPorts.isEmpty) {
      _selectedLanPorts.addAll(
        nonMgmtPhysical.where((p) => p != _wanInterface).take(2),
      );
    }

    _identityCtrl.text = report.identity.isNotEmpty ? report.identity : report.deviceName;
    _wirelessEnabled = report.capabilities.hasAnyWireless;
  }

  Map<String, dynamic> _buildConfigPayload({bool includeApplyFlags = false}) {
    final payload = <String, dynamic>{
      'template': _template,
      'confirmWanChange': _confirmWanChange,
      'wan': {
        'interface': _wanInterface.trim(),
        'mode': _wanMode,
        'enableNat': _enableNat,
        if (_wanMode == 'PPPOE') ...{
          'pppoeUser': _pppoeUserCtrl.text.trim(),
          'pppoePassword': _pppoePassCtrl.text,
        },
        if (_wanMode == 'STATIC') ...{
          'staticIp': _staticIpCtrl.text.trim(),
          'staticGateway': _staticGatewayCtrl.text.trim(),
        },
      },
      'lan': {
        'bridgeName': _bridgeNameCtrl.text.trim().isEmpty
            ? 'bridge-hotspot'
            : _bridgeNameCtrl.text.trim(),
        'memberInterfaces': List<String>.from(_selectedLanPorts),
        'gatewayIp': _lanGatewayCtrl.text.trim(),
        if (_poolRangeCtrl.text.trim().isNotEmpty) 'poolRange': _poolRangeCtrl.text.trim(),
        'autoMac': true,
      },
      if (_discovery?.capabilities.hasAnyWireless == true)
        'wireless': {
          'enabled': _wirelessEnabled,
          'ssid': _wifiSsidCtrl.text.trim(),
          if (_wifiPassCtrl.text.trim().length >= 8) 'password': _wifiPassCtrl.text.trim(),
          if (_wifiCountryCtrl.text.trim().isNotEmpty) 'country': _wifiCountryCtrl.text.trim(),
          'disableWps': true,
        },
      'hotspot': {
        'serverName': _hsServerNameCtrl.text.trim(),
        'dnsName': _hsDnsNameCtrl.text.trim(),
        'defaultRateLimit': _rateLimitCtrl.text.trim(),
        'sharedUsers': _enforceSingleDevice ? 1 : 2,
      },
      'queues': {'enabled': _enableQueues},
      'system': {
        if (_identityCtrl.text.trim().isNotEmpty) 'identity': _identityCtrl.text.trim(),
        'ntpEnabled': true,
      },
      'scheduler': {
        'enableAutoBackupSchedule': _enableAutoBackupSchedule,
        'autoBackupInterval': '12h',
        'enableNetwatch': _enableNetwatch,
      },
      'securityPolicies': {
        'antiTethering': _antiTethering,
        'clientIsolation': _clientIsolation,
        'protectManagementAccess': _protectManagementAccess,
        'protectWanAccess': _protectWanAccess,
        'forceRouterDns': _forceRouterDns,
        'enforceSingleDevice': _enforceSingleDevice,
        'blockUnauthenticatedBypass': _blockUnauthenticatedBypass,
      },
    };

    if (includeApplyFlags) {
      payload['confirmPlan'] = true;
      payload['createPreBackup'] = _createPreBackup;
      payload['executionMode'] = 'CLOUD';
      if (_preview?.planToken != null) {
        payload['planToken'] = _preview!.planToken;
      }
    }
    return payload;
  }

  Future<void> _generatePreview() async {
    final deviceId = _selectedDeviceId;
    if (deviceId == null) return;

    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final prev = await _service.buildPlanPreview(deviceId, _buildConfigPayload());
      if (!mounted) return;
      setState(() {
        _preview = prev;
        _step = 2;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startApply() async {
    final deviceId = _selectedDeviceId;
    if (deviceId == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.shield_outlined, color: ProvisioningThemeColors.primary),
            SizedBox(width: 8),
            Expanded(child: Text('تأكيد تنفيذ البرمجة الآمنة')),
          ],
        ),
        content: Text(
          'سيقوم النظام بأخذ نسخة احتياطية مشفرة وتنفيذ (${_preview?.totalPlannedCommands ?? 0}) أمراً بالتسلسل مع الحماية التلقائية من فقدان الإدارة.\n\nهل تريد المتابعة؟',
          style: const TextStyle(height: 1.5),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('مراجعة')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: ProvisioningThemeColors.primary),
            child: const Text('بدء التطبيق الآن'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final op = await _service.applyProvisioning(
        deviceId,
        _buildConfigPayload(includeApplyFlags: true),
      );
      if (!mounted) return;
      setState(() {
        _activeOperation = op;
        _step = op.isTerminal ? 4 : 3;
      });
      if (!op.isTerminal) {
        _startPollingOperation(op.id);
      } else {
        await _loadBackupsAndHistory();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _startPollingOperation(String operationId) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(milliseconds: 1200), (_) async {
      try {
        final updated = await _service.getOperationStatus(operationId);
        if (!mounted) return;
        setState(() => _activeOperation = updated);
        if (updated.isTerminal) {
          _pollTimer?.cancel();
          await _loadBackupsAndHistory();
          if (mounted) setState(() => _step = 4);
        }
      } catch (_) {}
    });
  }

  Future<void> _cancelRunningOperation() async {
    final op = _activeOperation;
    if (op == null || op.isTerminal) return;
    setState(() => _loading = true);
    try {
      await _service.cancelOperation(op.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم إرسال أمر الإيقاف الآمن؛ جاري التراجع عن الموارد المضافة.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadBackupsAndHistory() async {
    final deviceId = _selectedDeviceId;
    if (deviceId == null) return;
    try {
      final results = await Future.wait([
        _service.listOperations(deviceId),
        _service.listBackups(deviceId),
      ]);
      if (!mounted) return;
      setState(() {
        _historyOperations = results[0] as List<AutoProvisionOperationModel>;
        _deviceBackups = results[1] as List<AutoProvisionBackupItem>;
      });
    } catch (_) {}
  }

  Future<void> _openHistoryScreen() async {
    setState(() {
      _step = 5;
      _loading = true;
    });
    await _loadBackupsAndHistory();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _downloadBackup(AutoProvisionBackupItem item) async {
    setState(() => _loading = true);
    try {
      final path = await _service.downloadAndSaveBackup(item);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تم حفظ النسخة (${item.fileName}) في: $path'),
          backgroundColor: context.emeraldColor,
          action: SnackBarAction(
            label: 'مشاركة',
            textColor: Colors.white,
            onPressed: () => _service.shareDownloadedBackup(path, item.fileName),
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          backgroundColor: context.roseColor,
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _triggerRestore(AutoProvisionBackupItem item) async {
    final deviceId = _selectedDeviceId;
    if (deviceId == null) return;

    final confirmed = await showRestoreConfirmationDialog(
      context: context,
      backup: item,
      currentModel: _discovery?.capabilities.model,
      currentVersion: _discovery?.capabilities.version,
    );
    if (confirmed != true || !mounted) return;

    setState(() => _loading = true);
    try {
      final res = await _service.restoreBackup(
        deviceId,
        backupId: item.id,
        acknowledgeCompatibilityRisk: true,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['postRebootNotice']?.toString() ?? 'تم بدء الاستعادة وإعادة تشغيل الراوتر.'),
          backgroundColor: ProvisioningThemeColors.primary,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          backgroundColor: context.roseColor,
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final routersAsync = ref.watch(routersProvider);
    final routers = routersAsync.asData?.value ?? [];
    final Color pageBg =
        context.isDarkMode ? context.bgScaffold : ProvisioningThemeColors.creamBg;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: pageBg,
        appBar: AppBar(
          title: const Text('برمجة MikroTik تلقائياً'),
          backgroundColor: context.isDarkMode ? context.bgCard : Colors.white,
          actions: [
            IconButton(
              tooltip: 'سجل البرمجة والنسخ',
              icon: const Icon(Icons.history_rounded),
              onPressed: _selectedDeviceId == null ? null : _openHistoryScreen,
            ),
            IconButton(
              tooltip: 'تحديث اكتشاف الراوتر',
              icon: const Icon(Icons.refresh_rounded),
              onPressed: _loading ? null : () => _runDiscovery(forceRefresh: true),
            ),
          ],
        ),
        body: Column(
          children: [
            ProvisioningStepHeader(
              currentStep: _step,
              hasDiscovery: _discovery != null,
              hasPreview: _preview != null,
              hasOperation: _activeOperation != null,
              onStepTap: (idx) async {
                if (idx == 5) {
                  await _openHistoryScreen();
                } else {
                  setState(() => _step = idx);
                }
              },
            ),
            if (routers.isNotEmpty) _buildRouterSelectorBar(routers),
            if (_loading)
              const LinearProgressIndicator(
                color: ProvisioningThemeColors.primary,
                minHeight: 3,
              ),
            Expanded(
              child: SafeArea(
                top: false,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_errorMessage != null)
                        ProvisioningAlertBanner(
                          title: 'تنبيه',
                          message: _errorMessage!,
                          color: context.roseColor,
                          icon: Icons.error_outline_rounded,
                        ),
                      _buildActiveStepBody(routers),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRouterSelectorBar(List<RouterDeviceModel> routers) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: context.bgCard,
        border: Border(bottom: BorderSide(color: context.borderColor)),
      ),
      child: Row(
        children: [
          const Icon(Icons.router_rounded, size: 18, color: ProvisioningThemeColors.primary),
          const SizedBox(width: 8),
          const Text('الراوتر:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5)),
          const SizedBox(width: 10),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                isExpanded: true,
                value: routers.any((r) => r.id == _selectedDeviceId)
                    ? _selectedDeviceId
                    : routers.first.id,
                items: routers
                    .map(
                      (r) => DropdownMenuItem(
                        value: r.id,
                        child: Text(
                          '${r.name} (${r.host})',
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    )
                    .toList(),
                onChanged: _loading
                    ? null
                    : (val) {
                        if (val == null || val == _selectedDeviceId) return;
                        setState(() {
                          _selectedDeviceId = val;
                          _discovery = null;
                          _preview = null;
                          _activeOperation = null;
                          _step = 0;
                        });
                        _runDiscovery(forceRefresh: true);
                      },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveStepBody(List<RouterDeviceModel> routers) {
    if (routers.isEmpty && _selectedDeviceId == null) {
      return ProvisioningSectionCard(
        title: 'لا توجد أجهزة MikroTik مسجلة',
        icon: Icons.router_outlined,
        child: const Text(
          'أضف جهاز MikroTik أولاً من شاشة إعدادات الراوتر لتفعيل الاكتشاف والبرمجة التلقائية.',
        ),
      );
    }

    switch (_step) {
      case 0:
        return _buildScreen1Discovery();
      case 1:
        return _buildScreen2Settings();
      case 2:
        return _buildScreen3Preview();
      case 3:
        return _buildScreen4Execution();
      case 4:
        return _buildScreen5Result();
      case 5:
      default:
        return _buildScreen6History();
    }
  }

  // ===========================================================================
  // SCREEN 1 — ROUTER DISCOVERY
  // ===========================================================================
  Widget _buildScreen1Discovery() {
    final d = _discovery;
    if (d == null) {
      return ProvisioningSectionCard(
        title: 'اكتشاف الراوتر وتحليل قدراته',
        subtitle: 'قراءة الإصدار والمنافذ والواجهات اللاسلكية وإعدادات الشبكة الحالية بأمان',
        icon: Icons.radar_rounded,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'لا يفترض هذا المحرك وجود منافذ ثابتة أو صيغة موحدة، بل يفحص الجهاز فعلياً قبل بناء أي أمر RouterOS.',
              style: TextStyle(height: 1.5, fontSize: 13),
            ),
            const SizedBox(height: 14),
            ElevatedButton.icon(
              onPressed: _loading ? null : () => _runDiscovery(forceRefresh: true),
              icon: const Icon(Icons.search_rounded),
              label: const Text('بدء الاكتشاف المباشر'),
              style: ElevatedButton.styleFrom(backgroundColor: ProvisioningThemeColors.primary),
            ),
          ],
        ),
      );
    }

    final c = d.capabilities;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProvisioningSectionCard(
          title: '${d.deviceName} (${c.model})',
          subtitle: 'هوية الجهاز: ${d.identity} | المعمارية: ${c.architecture}',
          icon: Icons.memory_rounded,
          trailing: ProvisioningStatusPill(
            label: '${c.osFamily} v${c.version}',
            color: c.osFamily == 'ROS7'
                ? ProvisioningThemeColors.primary
                : ProvisioningThemeColors.gold,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ProvisioningStatusPill(
                    label: '${c.totalPhysicalPorts} منافذ فيزيائية',
                    color: context.skyColor,
                    icon: Icons.cable_rounded,
                  ),
                  ProvisioningStatusPill(
                    label: c.hasAnyWireless
                        ? 'WiFi مدعوم (${c.wirelessStack})'
                        : 'بدون بث لاسلكي (سلكي فقط)',
                    color: c.hasAnyWireless ? context.emeraldColor : context.textSecondary,
                    icon: c.hasAnyWireless ? Icons.wifi_rounded : Icons.wifi_off_rounded,
                  ),
                  ProvisioningStatusPill(
                    label: c.supportsHotspot ? 'Hotspot متاح' : 'Hotspot غير مفعّل',
                    color: c.supportsHotspot ? context.emeraldColor : context.roseColor,
                    icon: Icons.public_rounded,
                  ),
                  ProvisioningStatusPill(
                    label: 'مساحة حرة: ${formatBytesReadable(c.freeHddBytes)}',
                    color: c.hasEnoughDiskForBackup ? context.emeraldColor : context.roseColor,
                    icon: Icons.sd_storage_rounded,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                c.safeModeReason,
                style: TextStyle(fontSize: 11.5, color: context.textSecondary, height: 1.4),
              ),
            ],
          ),
        ),
        if (d.wanRoleAmbiguous)
          ProvisioningAlertBanner(
            title: 'منفذ الإنترنت WAN بحاجة لتأكيد يدوي',
            message:
                'تعذر الجزم بنسبة 100% بواجهة WAN التلقائية؛ يرجى مراجعة اختيار منفذ الإنترنت في الخطوة التالية.',
            color: context.amberColor,
            icon: Icons.help_outline_rounded,
          ),
        ProvisioningSectionCard(
          title: 'الواجهات المكتشفة وتحليل الأدوار (${d.interfacesAssessment.length})',
          icon: Icons.settings_ethernet_rounded,
          child: Column(
            children: d.interfacesAssessment
                .take(16)
                .map(
                  (iface) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: context.bgCardAlt,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: iface.isManagementPath
                            ? ProvisioningThemeColors.gold
                            : context.borderColor,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          iface.type == 'wifi' || iface.type == 'wlan'
                              ? Icons.wifi_rounded
                              : Icons.settings_ethernet,
                          size: 16,
                          color: iface.running
                              ? context.emeraldColor
                              : context.textSecondary,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${iface.name} (${iface.type})',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5),
                              ),
                              if (iface.ipAddresses.isNotEmpty)
                                Text(
                                  iface.ipAddresses.join(' , '),
                                  style: TextStyle(fontSize: 11, color: context.textSecondary),
                                ),
                            ],
                          ),
                        ),
                        ProvisioningStatusPill(
                          label: iface.isManagementPath
                              ? 'مسار الإدارة'
                              : iface.role == 'WAN'
                                  ? 'WAN'
                                  : iface.role == 'LAN'
                                      ? 'LAN'
                                      : iface.role,
                          color: iface.isManagementPath
                              ? ProvisioningThemeColors.gold
                              : iface.role == 'WAN'
                                  ? ProvisioningThemeColors.primary
                                  : context.textSecondary,
                        ),
                      ],
                    ),
                  ),
                )
                .toList(),
          ),
        ),
        ElevatedButton.icon(
          onPressed: () => setState(() => _step = 1),
          icon: const Icon(Icons.arrow_forward_rounded),
          label: const Text('متابعة لإعدادات البرمجة'),
          style: ElevatedButton.styleFrom(backgroundColor: ProvisioningThemeColors.primary),
        ),
      ],
    );
  }

  // ===========================================================================
  // SCREEN 2 — DYNAMIC CAPABILITY-FILTERED CONFIGURATION
  // ===========================================================================
  Widget _buildScreen2Settings() {
    final d = _discovery;
    if (d == null) return _buildScreen1Discovery();

    final portOptions = d.interfacesAssessment
        .where((i) => i.type == 'ether' || i.type == 'wlan' || i.type == 'wifi' || i.type.contains('sfp'))
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProvisioningSectionCard(
          title: 'قالب البرمجة',
          icon: Icons.layers_outlined,
          child: DropdownButtonFormField<String>(
            initialValue: _template,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'اختر أسلوب التطبيق'),
            items: const [
              DropdownMenuItem(
                value: 'CLEAN_SETUP',
                child: Text(
                  'CLEAN_SETUP — تهيئة هوتسبوت متكاملة جديدة',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              DropdownMenuItem(
                value: 'HOTSPOT_ON_EXISTING',
                child: Text(
                  'HOTSPOT_ON_EXISTING — إضافة SudaFi مع الحفاظ على الشبكة الحالية',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
            onChanged: (v) => setState(() => _template = v ?? 'CLEAN_SETUP'),
          ),
        ),
        ProvisioningSectionCard(
          title: 'إعدادات بوابة الإنترنت (WAN)',
          icon: Icons.public_rounded,
          child: Column(
            children: [
              DropdownButtonFormField<String>(
                initialValue: portOptions.any((p) => p.name == _wanInterface)
                    ? _wanInterface
                    : (portOptions.isNotEmpty ? portOptions.first.name : null),
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'واجهة الخروج للإنترنت (WAN)'),
                items: portOptions
                    .map(
                      (p) => DropdownMenuItem(
                        value: p.name,
                        child: Text(
                          p.isManagementPath ? '${p.name} (تُستخدم حالياً للإدارة!)' : p.name,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (v) => setState(() {
                  final nextWan = v ?? _wanInterface;
                  if (nextWan != _wanInterface) {
                    _wanInterface = nextWan;
                    _confirmWanChange = false;
                    _preview = null;
                  }
                  _selectedLanPorts.remove(_wanInterface);
                }),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _wanMode,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'نوع اتصال WAN'),
                items: const [
                  DropdownMenuItem(value: 'DHCP', child: Text('DHCP Client (تلقائي)', overflow: TextOverflow.ellipsis)),
                  DropdownMenuItem(value: 'PPPOE', child: Text('PPPoE Client', overflow: TextOverflow.ellipsis)),
                  DropdownMenuItem(value: 'STATIC', child: Text('Static IP', overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (v) => setState(() {
                  _wanMode = v ?? 'DHCP';
                  _preview = null;
                }),
              ),
              if (_wanMode == 'PPPOE') ...[
                const SizedBox(height: 10),
                TextField(
                  controller: _pppoeUserCtrl,
                  decoration: const InputDecoration(labelText: 'اسم مستخدم PPPoE'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _pppoePassCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'كلمة مرور PPPoE'),
                ),
              ],
              if (_wanMode == 'STATIC') ...[
                const SizedBox(height: 10),
                TextField(
                  controller: _staticIpCtrl,
                  decoration: const InputDecoration(labelText: 'عنوان Static IP (مثال: 192.168.1.50/24)'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _staticGatewayCtrl,
                  decoration: const InputDecoration(labelText: 'البوابة الافتراضية (Gateway IP)'),
                ),
              ],
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _enableNat,
                onChanged: (v) => setState(() => _enableNat = v),
                title: const Text('تفعيل NAT Masquerade تلقائياً'),
              ),
            ],
          ),
        ),
        ProvisioningSectionCard(
          title: 'جسر المشتركين وعنونة LAN',
          subtitle: 'يتم تصفية المنافذ الفيزيائية من قدرات الجهاز المكتشفة فقط',
          icon: Icons.hub_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: _bridgeNameCtrl,
                decoration: const InputDecoration(labelText: 'اسم الجسر (Bridge Name)'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _lanGatewayCtrl,
                decoration: const InputDecoration(labelText: 'عنوان شبكة الهوتسبوت (IPv4/CIDR)'),
              ),
              const SizedBox(height: 10),
              const Text(
                'منافذ شبكة المشتركين (تجنّب منفذ الإدارة):',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: portOptions.where((p) => p.name != _wanInterface).map((p) {
                  final selected = _selectedLanPorts.contains(p.name);
                  return FilterChip(
                    selected: selected,
                    label: Text(
                      p.isManagementPath ? '${p.name} (إدارة)' : p.name,
                      style: TextStyle(
                        color: p.isManagementPath && selected ? context.roseColor : null,
                      ),
                    ),
                    onSelected: (val) => setState(() {
                      if (val) {
                        if (!_selectedLanPorts.contains(p.name)) _selectedLanPorts.add(p.name);
                      } else {
                        _selectedLanPorts.remove(p.name);
                      }
                      _preview = null;
                    }),
                  );
                }).toList(),
              ),
            ],
          ),
        ),
        if (d.capabilities.hasAnyWireless)
          ProvisioningSectionCard(
            title: 'الشبكة اللاسلكية (${d.capabilities.wirelessStack})',
            icon: Icons.wifi_rounded,
            child: Column(
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _wirelessEnabled,
                  onChanged: (v) => setState(() => _wirelessEnabled = v),
                  title: const Text('تفعيل وتهيئة الوايرلس / WiFi'),
                ),
                if (_wirelessEnabled) ...[
                  TextField(
                    controller: _wifiSsidCtrl,
                    decoration: const InputDecoration(labelText: 'اسم الشبكة (SSID)'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _wifiPassCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'كلمة المرور (اتركه فارغاً لبث مفتوح لصفحة الهوتسبوت)',
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _wifiCountryCtrl,
                    decoration: const InputDecoration(
                      labelText: 'النطاق التنظيمي (Country - اختياري)',
                    ),
                  ),
                ],
              ],
            ),
          )
        else
          ProvisioningAlertBanner(
            title: 'بث WiFi غير متاح على هذا الموديل',
            message:
                'جهاز (${d.capabilities.model}) لا يملك واجهة أو حزمة Wireless/WiFi؛ تم إخفاء مرحلة الوايرلس تلقائياً ولن تُرسل أي أوامر غير متوافقة.',
            color: context.skyColor,
            icon: Icons.info_outline_rounded,
          ),
        ProvisioningSectionCard(
          title: 'الهوتسبوت والسرعات والأمان',
          icon: Icons.security_rounded,
          child: Column(
            children: [
              TextField(
                controller: _hsServerNameCtrl,
                decoration: const InputDecoration(labelText: 'اسم خادم الهوتسبوت'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _hsDnsNameCtrl,
                decoration: const InputDecoration(labelText: 'نطاق بوابة الدخول (DNS Name)'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _rateLimitCtrl,
                decoration: const InputDecoration(labelText: 'سرعة البروفايل الافتراضية (Upload/Download)'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _identityCtrl,
                decoration: const InputDecoration(labelText: 'اسم وهوية الراوتر (System Identity)'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _antiTethering,
                onChanged: (v) => setState(() => _antiTethering = v),
                title: const Text('مكافحة مشاركة الإنترنت (Anti-Tethering TTL=1)'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _clientIsolation,
                onChanged: (v) => setState(() => _clientIsolation = v),
                title: const Text('عزل المشتركين عن بعضهم (Bridge Horizon)'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _protectManagementAccess,
                onChanged: (v) => setState(() => _protectManagementAccess = v),
                title: const Text('منع وصول المشتركين لمنافذ الإدارة (Winbox/API/SSH)'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _protectWanAccess,
                onChanged: (v) => setState(() => _protectWanAccess = v),
                title: const Text('حظر منافذ الإدارة من جهة WAN الخارجية'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _forceRouterDns,
                onChanged: (v) => setState(() => _forceRouterDns = v),
                title: const Text('إلزام DNS الراوتر لمنع تجاوز الكاش'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _enforceSingleDevice,
                onChanged: (v) => setState(() => _enforceSingleDevice = v),
                title: const Text('منع استخدام الكارت على أكثر من جهاز (Shared Users = 1)'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _blockUnauthenticatedBypass,
                onChanged: (v) => setState(() => _blockUnauthenticatedBypass = v),
                title: const Text('منع تخطي المصادقة غير المصرح بها'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _enableQueues,
                onChanged: (v) => setState(() => _enableQueues = v),
                title: const Text('إنشاء SFQ لتوزيع الباندويث العادل'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _enableAutoBackupSchedule,
                onChanged: (v) => setState(() => _enableAutoBackupSchedule = v),
                title: const Text('جدولة نسخ احتياطي آمن كل 12 ساعة'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _enableNetwatch,
                onChanged: (v) => setState(() => _enableNetwatch = v),
                title: const Text('تفعيل مراقبة الاتصال (Netwatch)'),
              ),
            ],
          ),
        ),
        ElevatedButton.icon(
          onPressed: _loading ? null : _generatePreview,
          icon: const Icon(Icons.fact_check_outlined),
          label: const Text('توليد ومعاينة خطة البرمجة'),
          style: ElevatedButton.styleFrom(backgroundColor: ProvisioningThemeColors.primary),
        ),
      ],
    );
  }

  // ===========================================================================
  // SCREEN 3 — DIFF & RISK PREVIEW BEFORE APPLY
  // ===========================================================================
  Widget _buildScreen3Preview() {
    final p = _preview;
    if (p == null) {
      return ProvisioningSectionCard(
        title: 'المعاينة غير جاهزة',
        icon: Icons.info_outline,
        child: ElevatedButton(
          onPressed: () => setState(() => _step = 1),
          child: const Text('العودة للإعدادات'),
        ),
      );
    }

    final blocked = !p.canProceed || p.managementSevered;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (blocked)
          ProvisioningAlertBanner(
            title: 'تم إيقاف الخطة تلقائياً لحماية الراوتر',
            message: p.blockedReasons.join('\n'),
            color: context.roseColor,
            icon: Icons.gpp_bad_outlined,
          ),
        if (p.wanConfirmationRequired)
          ProvisioningSectionCard(
            title: 'تأكيد اختيار واجهة WAN',
            icon: Icons.warning_amber_rounded,
            accentColor: context.amberColor,
            child: CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _confirmWanChange,
              onChanged: (v) async {
                setState(() => _confirmWanChange = v ?? false);
                if (v == true) await _generatePreview();
              },
              title: Text(
                p.wanConfirmationReasons.join('\n'),
                style: const TextStyle(fontSize: 12.5),
              ),
            ),
          ),
        ProvisioningSectionCard(
          title: 'ملخص التغييرات (${p.totalPlannedCommands} أمر RouterOS)',
          subtitle: 'التوافق المختار: ${p.osFamily} (${p.rosVersion})',
          icon: Icons.compare_arrows_rounded,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _createPreBackup,
                onChanged: (v) => setState(() => _createPreBackup = v),
                title: const Text('أخذ نسخة احتياطية كاملة (Binary + RSC) قبل التنفيذ'),
              ),
              if (p.newSettings.isNotEmpty) ...[
                const Divider(),
                const SizedBox(height: 6),
                const Text('أبرز الإضافات والتعديلات:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                const SizedBox(height: 4),
                ...p.newSettings.take(8).map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 3),
                        child: Text('• $item', style: const TextStyle(fontSize: 12)),
                      ),
                    ),
              ],
            ],
          ),
        ),
        ...p.stages.map(
          (stage) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ExpansionTile(
              title: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${stage.stepOrder}. ${stage.title}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                    ),
                  ),
                  ProvisioningStatusPill(
                    label: stage.status == 'PLANNED'
                        ? '${stage.commandPreviews.length} أوامر'
                        : translateProvisionStatus(stage.status),
                    color: stage.status == 'PLANNED'
                        ? ProvisioningThemeColors.primary
                        : context.textSecondary,
                  ),
                ],
              ),
              subtitle: Text(
                stage.skipReason ?? stage.description,
                style: TextStyle(fontSize: 11.5, color: context.textSecondary),
              ),
              children: [
                if (stage.commandPreviews.isNotEmpty)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.all(10),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: SelectableText(
                      stage.commandPreviews.join('\n'),
                      textDirection: TextDirection.ltr,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 11.5,
                        color: Color(0xFF93C5FD),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        ElevatedButton.icon(
          onPressed: (_loading || blocked || p.wanConfirmationRequired) ? null : _startApply,
          icon: const Icon(Icons.rocket_launch_rounded),
          label: const Text('تطبيق البرمجة الآن بأمان'),
          style: ElevatedButton.styleFrom(backgroundColor: ProvisioningThemeColors.primary),
        ),
      ],
    );
  }

  // ===========================================================================
  // SCREEN 4 — LIVE EXECUTION & SAFE CANCEL
  // ===========================================================================
  Widget _buildScreen4Execution() {
    final op = _activeOperation;
    if (op == null) return _buildScreen3Preview();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProvisioningSectionCard(
          title: 'التنفيذ المباشر على الراوتر',
          subtitle: 'الحالة: ${translateProvisionStatus(op.status)}',
          icon: Icons.sync_rounded,
          trailing: ProvisioningStatusPill(
            label: '${op.progressPercent}%',
            color: statusColorForProvision(context, op.status),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LinearProgressIndicator(
                value: (op.progressPercent.clamp(0, 100)) / 100.0,
                minHeight: 10,
                borderRadius: BorderRadius.circular(8),
                color: statusColorForProvision(context, op.status),
              ),
              const SizedBox(height: 10),
              Text(
                'تم تنفيذ ${op.succeededCommands} من ${op.totalCommands} | فشل: ${op.failedCommands} | متخطى: ${op.skippedCommands}',
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              if (!op.isTerminal)
                OutlinedButton.icon(
                  onPressed: _loading ? null : _cancelRunningOperation,
                  icon: Icon(Icons.stop_circle_outlined, color: context.roseColor),
                  label: Text('إيقاف آمن والتراجع التلقائي', style: TextStyle(color: context.roseColor)),
                  style: OutlinedButton.styleFrom(side: BorderSide(color: context.roseColor)),
                ),
            ],
          ),
        ),
        ProvisioningSectionCard(
          title: 'تقدم المراحل الـ 12',
          icon: Icons.checklist_rounded,
          child: Column(
            children: op.steps
                .map(
                  (s) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('${s.stepOrder}. ${s.title}', style: const TextStyle(fontSize: 12.5)),
                    subtitle: s.errorMessage != null
                        ? Text(s.errorMessage!, style: TextStyle(fontSize: 11, color: context.roseColor))
                        : null,
                    trailing: ProvisioningStatusPill(
                      label: translateProvisionStatus(s.status),
                      color: statusColorForProvision(context, s.status),
                    ),
                  ),
                )
                .toList(),
          ),
        ),
      ],
    );
  }

  // ===========================================================================
  // SCREEN 5 — RESULT, VERIFICATION & BACKUP RECOVERY
  // ===========================================================================
  Widget _buildScreen5Result() {
    final op = _activeOperation;
    if (op == null) return _buildScreen6History();

    final v = op.verificationResult ?? const <String, dynamic>{};
    final overallStatus = v['overallStatus']?.toString() ?? op.status;
    final backupList = op.backups.isNotEmpty ? op.backups : _deviceBackups;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProvisioningAlertBanner(
          title: 'النتيجة النهائية: ${translateProvisionStatus(op.status)}',
          message: op.failureReason ??
              v['diagnosticsMessage']?.toString() ??
              'اكتملت عملية البرمجة التلقائية والتحقق من الجاهزية.',
          color: statusColorForProvision(context, overallStatus),
          icon: op.status == 'COMPLETED' ? Icons.check_circle_outline_rounded : Icons.error_outline_rounded,
        ),
        ProvisioningSectionCard(
          title: 'نتائج التحقق المستقل بعد التنفيذ',
          icon: Icons.verified_rounded,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ProvisioningStatusPill(
                label: v['wanConfigured'] == true ? 'WAN مفعّل' : 'WAN غير مكتمل',
                color: v['wanConfigured'] == true ? context.emeraldColor : context.roseColor,
              ),
              ProvisioningStatusPill(
                label: v['defaultRouteActive'] == true ? 'المسار الافتراضي نشط' : 'بلا مسار افتراضي',
                color: v['defaultRouteActive'] == true ? context.emeraldColor : context.amberColor,
              ),
              ProvisioningStatusPill(
                label: v['internetReachable'] == true ? 'الإنترنت يعمل (Ping OK)' : 'لا استجابة Ping خارجية',
                color: v['internetReachable'] == true ? context.emeraldColor : context.amberColor,
              ),
              ProvisioningStatusPill(
                label: v['hotspotOperational'] == true ? 'خادم Hotspot نشط' : 'Hotspot متوقف',
                color: v['hotspotOperational'] == true ? context.emeraldColor : context.roseColor,
              ),
            ],
          ),
        ),
        ProvisioningSectionCard(
          title: 'النسخ الاحتياطية الخاصة بالعملية',
          subtitle: 'محفوظة في التخزين السحابي الخاص + متاحة للتنزيل والاستعادة الآمنة',
          icon: Icons.backup_outlined,
          child: backupList.isEmpty
              ? const Text('لا توجد نسخ احتياطية مرتبطة بعد.')
              : Column(
                  children: backupList.take(4).map((b) {
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: Icon(
                          b.backupType == 'RSC_EXPORT'
                              ? Icons.description_outlined
                              : Icons.archive_outlined,
                          color: ProvisioningThemeColors.primary,
                        ),
                        title: Text(b.fileName, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
                        subtitle: Text(
                          '${b.backupType} • ${formatBytesReadable(b.fileSizeBytes)}',
                          style: const TextStyle(fontSize: 11),
                        ),
                        trailing: Wrap(
                          spacing: 4,
                          children: [
                            IconButton(
                              tooltip: 'تحميل وحفظ',
                              icon: const Icon(Icons.download_rounded, size: 20),
                              onPressed: () => _downloadBackup(b),
                            ),
                            if (b.backupType != 'RSC_EXPORT')
                              IconButton(
                                tooltip: 'استعادة النسخة',
                                icon: Icon(Icons.restore_rounded, size: 20, color: context.roseColor),
                                onPressed: () => _triggerRestore(b),
                              ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
        ),
        if (op.commandLogs.isNotEmpty)
          ProvisioningSectionCard(
            title: 'سجل الأوامر المنفذة (${op.commandLogs.length})',
            icon: Icons.terminal_rounded,
            child: Column(
              children: op.commandLogs
                  .map(
                    (c) => ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        '${c.commandOrder}. ${c.description}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        c.commandMasked,
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
                      ),
                      trailing: ProvisioningStatusPill(
                        label: translateProvisionStatus(c.status),
                        color: statusColorForProvision(context, c.status),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
      ],
    );
  }

  // ===========================================================================
  // SCREEN 6 — PROVISIONING HISTORY & RECOVERY ARCHIVE
  // ===========================================================================
  Widget _buildScreen6History() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProvisioningSectionCard(
          title: 'سجل عمليات البرمجة التلقائية',
          icon: Icons.history_rounded,
          child: _historyOperations.isEmpty
              ? const Text('لا توجد عمليات سابقة مسجلة لهذا الراوتر.')
              : Column(
                  children: _historyOperations
                      .map(
                        (op) => Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            onTap: () async {
                              setState(() => _loading = true);
                              try {
                                final full = await _service.getOperationStatus(op.id);
                                if (!mounted) return;
                                setState(() {
                                  _activeOperation = full;
                                  _step = 4;
                                });
                              } finally {
                                if (mounted) setState(() => _loading = false);
                              }
                            },
                            title: Text(
                              'قالب: ${op.template} (${op.succeededCommands}/${op.totalCommands})',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                            ),
                            subtitle: Text(
                              op.failureReason ?? 'اضغط لعرض التفاصيل والسجل والنسخ الاحتياطية',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11.5),
                            ),
                            trailing: ProvisioningStatusPill(
                              label: translateProvisionStatus(op.status),
                              color: statusColorForProvision(context, op.status),
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
        ),
        ProvisioningSectionCard(
          title: 'أرشيف النسخ الاحتياطية للراوتر',
          icon: Icons.folder_zip_outlined,
          child: _deviceBackups.isEmpty
              ? const Text('لا توجد نسخ احتياطية مؤرشفة لهذا الراوتر بعد.')
              : Column(
                  children: _deviceBackups
                      .map(
                        (b) => ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(b.fileName, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
                          subtitle: Text(
                            '${b.backupType} • ${b.routerModel ?? ''} • ${formatBytesReadable(b.fileSizeBytes)}',
                            style: const TextStyle(fontSize: 11),
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.download_rounded, size: 20),
                                onPressed: () => _downloadBackup(b),
                              ),
                              if (b.backupType != 'RSC_EXPORT')
                                IconButton(
                                  icon: Icon(Icons.restore_rounded, size: 20, color: context.roseColor),
                                  onPressed: () => _triggerRestore(b),
                                ),
                            ],
                          ),
                        ),
                      )
                      .toList(),
                ),
        ),
      ],
    );
  }
}
