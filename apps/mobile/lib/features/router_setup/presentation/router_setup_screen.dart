import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/models/router_provisioning_models.dart';
import '../../../core/providers.dart';
import '../../../core/services/router_provisioning_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/whatsapp_helper.dart';

class RouterSetupScreen extends ConsumerStatefulWidget {
  final RouterDeviceModel? router;

  const RouterSetupScreen({super.key, this.router});

  @override
  ConsumerState<RouterSetupScreen> createState() => _RouterSetupScreenState();
}

class _RouterSetupScreenState extends ConsumerState<RouterSetupScreen> {
  // Stepper state (0 to 5)
  int _currentStep = 0;

  // Step 1: Router Connection & Auth
  final _connectionFormKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _hostController;
  late final TextEditingController _apiPortController;
  late final TextEditingController _restPortController;
  late final TextEditingController _userController;
  final _passController = TextEditingController();

  late String _rosVersion;
  late bool _useSsl;
  bool _obscurePassword = true;
  String? _selectedDeviceId;

  bool _isTesting = false;
  String? _testResult;
  bool? _testSuccess;
  int? _latencyMs;
  Map<String, dynamic>? _routerMetrics;

  // Step 2: Discovery State
  bool _isDiscovering = false;
  String? _discoveryError;
  RouterDiscoverySnapshotModel? _discovery;

  // Step 3: Template & WAN Mode
  String _selectedTemplate = 'CLEAN_SETUP'; // 'CLEAN_SETUP' | 'HOTSPOT_ON_EXISTING' | 'CUSTOM'
  String _selectedWanMode = 'DHCP'; // 'DHCP' | 'PPPOE' | 'STATIC'
  final _pppoeUserController = TextEditingController();
  final _pppoePassController = TextEditingController();
  final _staticIpController = TextEditingController(text: '192.168.1.50/24');
  final _staticGatewayController = TextEditingController(text: '192.168.1.1');
  final _staticDnsController = TextEditingController(text: '8.8.8.8, 1.1.1.1');
  bool _enableNat = true;

  // Step 4: LAN & Hotspot Settings
  String? _selectedWanInterface;
  final Set<String> _selectedLanInterfaces = {};
  final _bridgeNameController = TextEditingController(text: 'bridge-hotspot');
  final _gatewayIpController = TextEditingController(text: '10.5.50.1/24');
  final _poolRangeController = TextEditingController(text: '10.5.50.10-10.5.50.254');
  final _dnsNameController = TextEditingController(text: 'login.sudafi.net');
  final _serverNameController = TextEditingController(text: 'hs-sudafi');
  final _profileNameController = TextEditingController(text: 'hsp-sudafi');

  // Step 5: Preview & Conflict State
  bool _isPreviewing = false;
  String? _previewError;
  ProvisionPreviewResponse? _preview;
  bool _cleanSetupConfirmed = false;
  bool _allowOverwrite = false;
  final bool _updateRouterHostIfChanged = true;

  // Step 6: Execution (Apply) State
  bool _isApplying = false;
  String? _applyError;
  ProvisionApplyResult? _applyResult;

  @override
  void initState() {
    super.initState();
    final r = widget.router;
    final existingRouters = ref.read(routersProvider).asData?.value ?? [];
    final nextIndex = existingRouters.length + 1;

    _selectedDeviceId = r?.id;
    _nameController = TextEditingController(
      text: r?.name ?? (existingRouters.isEmpty ? 'راوتر البرج الرئيسي' : 'راوتر فرعي $nextIndex'),
    );
    _hostController = TextEditingController(text: r?.host ?? '192.168.88.1');
    _apiPortController = TextEditingController(text: (r?.apiPort ?? 8728).toString());
    _restPortController = TextEditingController(text: (r?.restPort ?? 443).toString());
    _userController = TextEditingController(text: r?.username ?? 'admin');
    _rosVersion = (r?.rosVersion.toUpperCase().contains('V6') == true) ? 'V6' : 'V7';
    _useSsl = r?.useSsl ?? false;

    // If router already exists, auto-discover in the background
    if (_selectedDeviceId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _handleFetchDiscovery();
      });
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _hostController.dispose();
    _apiPortController.dispose();
    _restPortController.dispose();
    _userController.dispose();
    _passController.dispose();
    _pppoeUserController.dispose();
    _pppoePassController.dispose();
    _staticIpController.dispose();
    _staticGatewayController.dispose();
    _staticDnsController.dispose();
    _bridgeNameController.dispose();
    _gatewayIpController.dispose();
    _poolRangeController.dispose();
    _dnsNameController.dispose();
    _serverNameController.dispose();
    _profileNameController.dispose();
    super.dispose();
  }

  // ===========================================================================
  // Step 1 Handlers: Test & Save Device
  // ===========================================================================

  Future<void> _handleTestConnection() async {
    final host = _hostController.text.trim();
    final user = _userController.text.trim();
    final pass = _passController.text.trim();

    if (host.isEmpty || user.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('الرجاء إدخال عنوان IP واسم مستخدم الراوتر')),
      );
      return;
    }

    setState(() {
      _isTesting = true;
      _testResult = null;
      _testSuccess = null;
      _latencyMs = null;
      _routerMetrics = null;
    });

    final payload = {
      if (_selectedDeviceId != null) 'id': _selectedDeviceId,
      'host': host,
      'apiPort': int.tryParse(_apiPortController.text.trim()) ?? 8728,
      'restPort': int.tryParse(_restPortController.text.trim()) ?? 443,
      'username': user,
      if (pass.isNotEmpty) 'password': pass,
      'rosVersion': _rosVersion,
      'useSsl': _useSsl,
    };

    final result = await ref.read(routersProvider.notifier).testConnectionDirect(payload);
    if (!mounted) return;

    final isOk = result['success'] == true;
    final msg = result['message']?.toString() ??
        (isOk ? 'تم الاتصال والمصادقة بنجاح مع الراوتر' : 'فشل الاتصال بالراوتر');
    final latency = result['latencyMs'];
    final info = result['routerInfo'] as Map<String, dynamic>?;

    setState(() {
      _isTesting = false;
      _testSuccess = isOk;
      _testResult = msg;
      _latencyMs = latency is num ? latency.toInt() : null;
      _routerMetrics = info;
    });

    if (isOk && _selectedDeviceId == null) {
      // Auto save newly tested device so it gets an ID for discovery
      await _handleSaveNewDeviceSilently();
    }
  }

  Future<void> _handleSaveNewDeviceSilently() async {
    if (_selectedDeviceId != null) return;
    final payload = {
      'name': _nameController.text.trim(),
      'host': _hostController.text.trim(),
      'apiPort': int.tryParse(_apiPortController.text.trim()) ?? 8728,
      'restPort': int.tryParse(_restPortController.text.trim()) ?? 443,
      'username': _userController.text.trim(),
      'password': _passController.text.trim(),
      'rosVersion': _rosVersion,
      'useSsl': _useSsl,
    };

    final saveRes = await ref.read(routersProvider.notifier).saveRouter(payload, id: _selectedDeviceId);
    if (!mounted) return;

    if (saveRes['success'] == true && saveRes['data'] != null) {
      final dev = saveRes['data'] as Map<String, dynamic>;
      setState(() {
        _selectedDeviceId = dev['id']?.toString() ?? _selectedDeviceId;
      });
    }
  }

  // ===========================================================================
  // Step 2 Handlers: Interface Discovery
  // ===========================================================================

  Future<void> _handleFetchDiscovery() async {
    if (_selectedDeviceId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('الرجاء التأكد من فحص وحفظ الراوتر أولاً')),
      );
      return;
    }

    setState(() {
      _isDiscovering = true;
      _discoveryError = null;
    });

    try {
      final service = ref.read(routerProvisioningServiceProvider);
      final snap = await service.discover(_selectedDeviceId!);
      if (!mounted) return;

      setState(() {
        _isDiscovering = false;
        _discovery = snap;

        // Auto-select smart defaults if not set
        if (_selectedWanInterface == null && snap.interfaces.isNotEmpty) {
          final ether1 = snap.interfaces.firstWhere(
            (i) => i.name.toLowerCase() == 'ether1',
            orElse: () => snap.interfaces.first,
          );
          _selectedWanInterface = ether1.name;
        }

        if (_selectedLanInterfaces.isEmpty) {
          for (final iface in snap.interfaces) {
            if (iface.name != _selectedWanInterface && iface.type == 'ether') {
              _selectedLanInterfaces.add(iface.name);
            }
          }
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isDiscovering = false;
        _discoveryError = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  // ===========================================================================
  // Step 5 Handlers: Preview & Conflict Generation
  // ===========================================================================

  Map<String, dynamic> _buildProvisioningPayload() {
    return {
      'template': _selectedTemplate,
      'wan': {
        'interface': _selectedWanInterface ?? 'ether1',
        'mode': _selectedWanMode,
        if (_selectedWanMode == 'PPPOE') 'pppoeUser': _pppoeUserController.text.trim(),
        if (_selectedWanMode == 'PPPOE') 'pppoePassword': _pppoePassController.text.trim(),
        if (_selectedWanMode == 'STATIC') 'staticIp': _staticIpController.text.trim(),
        if (_selectedWanMode == 'STATIC') 'staticGateway': _staticGatewayController.text.trim(),
        if (_selectedWanMode == 'STATIC')
          'staticDns': _staticDnsController.text
              .split(',')
              .map((s) => s.trim())
              .where((s) => s.isNotEmpty)
              .toList(),
        'enableNat': _enableNat,
      },
      'lan': {
        'bridgeName': _bridgeNameController.text.trim().isNotEmpty
            ? _bridgeNameController.text.trim()
            : 'bridge-hotspot',
        'memberInterfaces': _selectedLanInterfaces.toList(),
        'gatewayIp': _gatewayIpController.text.trim(),
        'poolRange': _poolRangeController.text.trim(),
        'dhcpLeaseTime': '1h',
        'dnsServers': [_gatewayIpController.text.trim().split('/')[0], '8.8.8.8'],
      },
      'hotspot': {
        'serverName': _serverNameController.text.trim().isNotEmpty
            ? _serverNameController.text.trim()
            : 'hs-sudafi',
        'profileName': _profileNameController.text.trim().isNotEmpty
            ? _profileNameController.text.trim()
            : 'hsp-sudafi',
        'dnsName': _dnsNameController.text.trim().isNotEmpty
            ? _dnsNameController.text.trim()
            : 'login.sudafi.net',
        'htmlDirectory': 'hotspot',
        'loginBy': 'http-chap,http-pap',
        'defaultRateLimit': '2M/5M',
        'defaultSessionTimeout': '1d',
      },
      'cleanSetupConfirmed': _cleanSetupConfirmed,
      'allowOverwrite': _allowOverwrite,
      'skipBackupOnError': false,
      'updateRouterHostIfChanged': _updateRouterHostIfChanged,
    };
  }

  Future<void> _handleGeneratePreview() async {
    if (_selectedDeviceId == null) return;
    setState(() {
      _isPreviewing = true;
      _previewError = null;
      _preview = null;
    });

    try {
      final service = ref.read(routerProvisioningServiceProvider);
      final payload = _buildProvisioningPayload();
      final previewData = await service.preview(_selectedDeviceId!, payload);
      if (!mounted) return;

      setState(() {
        _isPreviewing = false;
        _preview = previewData;
        if (previewData.requiresCleanConfirmation) {
          _cleanSetupConfirmed = false;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isPreviewing = false;
        _previewError = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  // ===========================================================================
  // Step 6 Handlers: Apply Provisioning Execution
  // ===========================================================================

  Future<void> _handleApplyProvisioning() async {
    if (_selectedDeviceId == null || _preview == null) return;

    if (_preview!.requiresCleanConfirmation && !_cleanSetupConfirmed) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('يجب تأكيد الموافقة على Clean Setup للراوتر المستخدم مسبقاً'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    if (_preview!.conflicts.isNotEmpty && !_allowOverwrite) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('توجد تعارضات شبكية. يجب تفعيل خيار تجاوز وتكييف الإعدادات'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() {
      _isApplying = true;
      _applyError = null;
      _applyResult = null;
    });

    try {
      final service = ref.read(routerProvisioningServiceProvider);
      final payload = _buildProvisioningPayload();

      final result = await service.apply(_selectedDeviceId!, payload);
      if (!mounted) return;

      setState(() {
        _isApplying = false;
        _applyResult = result;
      });

      // Refresh global routers provider
      ref.invalidate(routersProvider);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isApplying = false;
        _applyError = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  // ===========================================================================
  // Build Methods
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: context.bgScaffold,
        appBar: AppBar(
          title: const Text(
            'معالج برمجة وإعداد الراوتر',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          centerTitle: true,
          backgroundColor: context.bgScaffold,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_forward_ios, size: 18),
            onPressed: () => Navigator.of(context).pop(),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.help_outline, size: 22),
              tooltip: 'الدعم الفني',
              onPressed: () => WhatsAppHelper.openWhatsApp(
                type: WhatsAppActionType.support,
                featureName: 'معالج إعداد الراوتر',
                context: context,
              ),
            ),
            const SizedBox(width: 8),
          ],
        ),
        body: SafeArea(
          child: Column(
            children: [
              _buildStepIndicator(),
              Divider(height: 1, color: context.borderColor),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: _buildCurrentStepContent(),
                ),
              ),
              _buildBottomNavigation(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStepIndicator() {
    final steps = [
      {'title': 'الاتصال', 'icon': Icons.router},
      {'title': 'المنافذ', 'icon': Icons.hub},
      {'title': 'القالب', 'icon': Icons.dashboard_customize},
      {'title': 'الشبكة', 'icon': Icons.settings_ethernet},
      {'title': 'المعاينة', 'icon': Icons.preview},
      {'title': 'التنفيذ', 'icon': Icons.check_circle_outline},
    ];

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      color: context.bgCard,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: List.generate(steps.length, (index) {
          final isPassed = index < _currentStep;
          final isCurrent = index == _currentStep;

          Color itemColor = Colors.grey.shade500;
          if (isCurrent) {
            itemColor = const Color(0xFF0284C7);
          } else if (isPassed) {
            itemColor = Colors.green;
          }

          return InkWell(
            onTap: () {
              // Only allow jumping back or forward if allowed
              if (index < _currentStep) {
                setState(() => _currentStep = index);
              }
            },
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: isCurrent
                      ? const Color(0xFF0284C7)
                      : (isPassed ? Colors.green.withValues(alpha: 0.15) : Colors.transparent),
                  child: Icon(
                    isPassed ? Icons.check : (steps[index]['icon'] as IconData),
                    size: 14,
                    color: isCurrent ? Colors.white : itemColor,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  steps[index]['title'] as String,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                    color: isCurrent ? context.textPrimary : context.textSecondary,
                  ),
                ),
              ],
            ),
          );
        }),
      ),
    );
  }

  Widget _buildCurrentStepContent() {
    switch (_currentStep) {
      case 0:
        return _buildStep1Connection();
      case 1:
        return _buildStep2Discovery();
      case 2:
        return _buildStep3TemplatesAndWan();
      case 3:
        return _buildStep4LanAndHotspot();
      case 4:
        return _buildStep5PreviewAndConflicts();
      case 5:
        return _buildStep6ExecutionAndVerification();
      default:
        return const SizedBox();
    }
  }

  // ---------------------------------------------------------------------------
  // Step 1: Router Connection & Auth
  // ---------------------------------------------------------------------------
  Widget _buildStep1Connection() {
    return Form(
      key: _connectionFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildCardHeader(
            icon: Icons.cell_tower,
            title: '1. بيانات الاتصال بالراوتر والمصادقة',
            subtitle: 'قم بإدخال بيانات الاتصال المباشر بالراوتر واختبار المصافحة لربطه بالتطبيق.',
          ),
          const SizedBox(height: 16),

          // Router Name
          _buildTextField(
            'اسم الراوتر في النظام',
            _nameController,
            Icons.label_outline,
            validator: (v) => (v == null || v.trim().isEmpty) ? 'مطلوب' : null,
          ),
          const SizedBox(height: 14),

          // IP Host & API Port Row
          Row(
            children: [
              Expanded(
                flex: 2,
                child: _buildTextField(
                  'عنوان IP أو الدومين',
                  _hostController,
                  Icons.dns_outlined,
                  hintText: '192.168.88.1',
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'مطلوب' : null,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildTextField(
                  'منفذ API',
                  _apiPortController,
                  Icons.numbers,
                  keyboardType: TextInputType.number,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // RouterOS version toggle
          Row(
            children: [
              Expanded(
                child: _buildVersionChip('V7', 'RouterOS v7 (REST/API)', Icons.speed),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildVersionChip('V6', 'RouterOS v6 (Socket)', Icons.cable),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Username & Password Row
          Row(
            children: [
              Expanded(
                child: _buildTextField(
                  'اسم مستخدم API',
                  _userController,
                  Icons.person_outline,
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'مطلوب' : null,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildTextField(
                  'كلمة المرور',
                  _passController,
                  Icons.lock_outline,
                  obscureText: _obscurePassword,
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscurePassword ? Icons.visibility_off : Icons.visibility,
                      size: 18,
                      color: context.textSecondary,
                    ),
                    onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // SSL Toggle
          SwitchListTile(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: BorderSide(color: context.borderColor),
            ),
            tileColor: context.bgCard,
            title: Text(
              'استخدام اتصال مشفر (SSL/TLS)',
              style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.bold),
            ),
            subtitle: Text(
              'تفعيل HTTPS لمنفذ REST (443) أو API-SSL (8729)',
              style: TextStyle(color: context.textSecondary, fontSize: 11),
            ),
            value: _useSsl,
            activeThumbColor: const Color(0xFF0284C7),
            onChanged: (v) => setState(() => _useSsl = v),
          ),
          const SizedBox(height: 18),

          // Test Button
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _isTesting ? null : _handleTestConnection,
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFF0284C7)),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: _isTesting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0284C7)),
                    )
                  : const Icon(Icons.network_check, color: Color(0xFF0284C7)),
              label: Text(
                _isTesting ? 'جارِ فحص الاتصال ومصافحة الراوتر...' : 'اختبار الاتصال المباشر والمصادقة',
                style: const TextStyle(color: Color(0xFF0284C7), fontWeight: FontWeight.bold),
              ),
            ),
          ),

          // Diagnostics Box
          if (_testResult != null) ...[
            const SizedBox(height: 14),
            _buildResultBanner(
              isSuccess: _testSuccess == true,
              title: _testSuccess == true ? 'تم الاتصال والمصادقة بنجاح' : 'فشل فحص الاتصال',
              message: _testResult!,
              latencyMs: _latencyMs,
              metrics: _routerMetrics,
            ),
          ],
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2: Discovery of Interfaces & Network
  // ---------------------------------------------------------------------------
  Widget _buildStep2Discovery() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildCardHeader(
          icon: Icons.hub_outlined,
          title: '2. فحص المنافذ واستكشاف الراوتر',
          subtitle: 'قراءة المنافذ الفيزيائية الحية وحالة التوصيل والجسور وعناوين IP القائمة.',
        ),
        const SizedBox(height: 14),

        if (_isDiscovering) ...[
          const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Column(
                children: [
                  CircularProgressIndicator(color: Color(0xFF0284C7)),
                  SizedBox(height: 14),
                  Text('جارِ فحص منافذ الراوتر وقراءة الجسور والعناوين...'),
                ],
              ),
            ),
          ),
        ] else if (_discoveryError != null) ...[
          _buildResultBanner(
            isSuccess: false,
            title: 'تعذر استكشاف الراوتر',
            message: _discoveryError!,
          ),
          const SizedBox(height: 12),
          Center(
            child: ElevatedButton.icon(
              onPressed: _handleFetchDiscovery,
              icon: const Icon(Icons.refresh),
              label: const Text('إعادة المحاولة'),
            ),
          ),
        ] else if (_discovery != null) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'المنافذ المكتشفة (${_discovery!.interfaces.length}):',
                style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, size: 20),
                tooltip: 'تحديث المنافذ',
                onPressed: _handleFetchDiscovery,
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Interface list
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _discovery!.interfaces.length,
            separatorBuilder: (context, index) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final iface = _discovery!.interfaces[index];
              final isRunning = iface.running;

              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: context.bgCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: context.borderColor),
                ),
                child: Row(
                  children: [
                    Icon(
                      iface.type == 'wlan' ? Icons.wifi : Icons.settings_ethernet,
                      color: isRunning ? Colors.green : Colors.grey,
                      size: 22,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                iface.name,
                                style: TextStyle(
                                  color: context.textPrimary,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: isRunning
                                      ? Colors.green.withValues(alpha: 0.15)
                                      : Colors.grey.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  isRunning ? 'متصل (Link Up)' : 'غير متصل (Down)',
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: isRunning ? Colors.green : Colors.grey,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          if (iface.macAddress != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              'MAC: ${iface.macAddress}',
                              style: TextStyle(color: context.textSecondary, fontSize: 11),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 16),

          // Existing IPs & Hotspots info
          if (_discovery!.ipAddresses.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0284C7).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF0284C7).withValues(alpha: 0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.info_outline, size: 16, color: Color(0xFF38BDF8)),
                      SizedBox(width: 6),
                      Text(
                        'عناوين IP والخدمات المسجلة حالياً على الراوتر:',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF38BDF8)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    children: _discovery!.ipAddresses.map((ip) {
                      return Chip(
                        label: Text('${ip.address} (${ip.interface})', style: const TextStyle(fontSize: 11)),
                        backgroundColor: context.bgCard,
                        side: BorderSide(color: context.borderColor),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          ],
        ] else ...[
          Center(
            child: ElevatedButton.icon(
              onPressed: _handleFetchDiscovery,
              icon: const Icon(Icons.search),
              label: const Text('بدء استكشاف منافذ الراوتر'),
            ),
          ),
        ],
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step 3: Template & WAN Mode Selection
  // ---------------------------------------------------------------------------
  Widget _buildStep3TemplatesAndWan() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildCardHeader(
          icon: Icons.dashboard_customize_outlined,
          title: '3. اختيار قالب الإعداد ونوع اتصال الإنترنت',
          subtitle: 'حدد نوعية الإعداد المناسبة للراوتر وطريقة اتصاله بمزود الخدمة (WAN).',
        ),
        const SizedBox(height: 16),

        Text(
          'اختر قالب الإعداد المناسب:',
          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
        ),
        const SizedBox(height: 8),

        // Template Options
        _buildTemplateCard(
          id: 'CLEAN_SETUP',
          title: 'إعداد راوتر جديد بالكامل (Clean & Complete Setup)',
          description:
              'الموصى به لراوتر جديد: يخصص منفذ 1 للإنترنت (WAN)، ويجمع بقية المنافذ في جسر هوتسبوت موحد (10.5.50.1/24) مع خادم DHCP وصفحة الدخول.',
          badge: 'الأكثر سهولة وموصى به',
          badgeColor: Colors.green,
        ),
        const SizedBox(height: 10),
        _buildTemplateCard(
          id: 'HOTSPOT_ON_EXISTING',
          title: 'تفعيل الهوتسبوت على شبكة قائمة (Add Hotspot)',
          description:
              'يحافظ على إعدادات الإنترنت والتوجيه الحالية كما هي، ويفعل خادم الهوتسبوت على المنافذ المختارة فقط دون أي تعارض.',
          badge: 'غير هدّام',
          badgeColor: Colors.blue,
        ),
        const SizedBox(height: 10),
        _buildTemplateCard(
          id: 'CUSTOM',
          title: 'إعداد مخصص بالكامل (Custom Advanced)',
          description: 'تخصيص كامل لكافة إعدادات WAN، والجسور، ونطاقات DHCP، والدومين يدوياً.',
          badge: 'للمتخصصين',
          badgeColor: Colors.orange,
        ),
        const SizedBox(height: 20),

        Divider(color: context.borderColor),
        const SizedBox(height: 10),

        Text(
          'طريقة اتصال الإنترنت (WAN Connection Mode):',
          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
        ),
        const SizedBox(height: 8),

        Row(
          children: [
            Expanded(child: _buildWanModeChip('DHCP', 'DHCP Client (تلقائي)', Icons.auto_awesome)),
            const SizedBox(width: 8),
            Expanded(child: _buildWanModeChip('PPPOE', 'PPPoE (يوزر وباسورد)', Icons.vpn_key)),
            const SizedBox(width: 8),
            Expanded(child: _buildWanModeChip('STATIC', 'Static IP (ثابت)', Icons.pin)),
          ],
        ),
        const SizedBox(height: 14),

        // Extra WAN inputs if PPPOE
        if (_selectedWanMode == 'PPPOE') ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              children: [
                _buildTextField('اسم مستخدم PPPoE', _pppoeUserController, Icons.person),
                const SizedBox(height: 10),
                _buildTextField('كلمة مرور PPPoE', _pppoePassController, Icons.lock),
              ],
            ),
          ),
        ],

        // Extra WAN inputs if STATIC
        if (_selectedWanMode == 'STATIC') ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              children: [
                _buildTextField('عنوان IP مع القناع', _staticIpController, Icons.dns),
                const SizedBox(height: 10),
                _buildTextField('البوابة الافتراضية (Gateway)', _staticGatewayController, Icons.router),
                const SizedBox(height: 10),
                _buildTextField('خوادم DNS (مفصولة بفاصلة)', _staticDnsController, Icons.public),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),

        // NAT Checkbox
        CheckboxListTile(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(color: context.borderColor),
          ),
          tileColor: context.bgCard,
          title: Text(
            'تفعيل محول العناوين (NAT Masquerade)',
            style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.bold),
          ),
          subtitle: Text(
            'مطلوب لمشاركة الإنترنت من منفذ WAN إلى شبكة المشتركين',
            style: TextStyle(color: context.textSecondary, fontSize: 11),
          ),
          value: _enableNat,
          activeColor: const Color(0xFF0284C7),
          onChanged: (v) => setState(() => _enableNat = v ?? true),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step 4: LAN Ports, Subnet, and Hotspot Setup
  // ---------------------------------------------------------------------------
  Widget _buildStep4LanAndHotspot() {
    final availableIfaces = _discovery?.interfaces.map((i) => i.name).toList() ??
        ['ether1', 'ether2', 'ether3', 'ether4', 'ether5'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildCardHeader(
          icon: Icons.settings_ethernet,
          title: '4. شبكة المشتركين وخادم الهوتسبوت',
          subtitle: 'حدد منفذ الإنترنت الخارجي، ومنافذ توزيع المشتركين، وإعدادات شبكة الهوتسبوت.',
        ),
        const SizedBox(height: 16),

        // Select WAN interface
        Text(
          'منفذ دخول الإنترنت (WAN Interface):',
          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: context.bgCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: context.borderColor),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              isExpanded: true,
              value: _selectedWanInterface,
              hint: const Text('اختر منفذ الإنترنت'),
              items: availableIfaces.map((name) {
                return DropdownMenuItem(
                  value: name,
                  child: Text(name, style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold)),
                );
              }).toList(),
              onChanged: (v) {
                setState(() {
                  _selectedWanInterface = v;
                  // Remove from LAN members if selected as WAN
                  if (v != null) _selectedLanInterfaces.remove(v);
                });
              },
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Select LAN Member Interfaces
        Text(
          'منافذ خروج المشتركين (LAN Member Interfaces):',
          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: availableIfaces.map((port) {
            final isWan = port == _selectedWanInterface;
            final isSelected = _selectedLanInterfaces.contains(port);

            return FilterChip(
              label: Text(port + (isWan ? ' (WAN)' : '')),
              selected: isSelected,
              selectedColor: const Color(0xFF0284C7).withValues(alpha: 0.25),
              checkmarkColor: const Color(0xFF0284C7),
              onSelected: isWan
                  ? null
                  : (selected) {
                      setState(() {
                        if (selected) {
                          _selectedLanInterfaces.add(port);
                        } else {
                          _selectedLanInterfaces.remove(port);
                        }
                      });
                    },
            );
          }).toList(),
        ),
        const SizedBox(height: 16),

        // Subnet and Gateway IP
        Row(
          children: [
            Expanded(
              child: _buildTextField(
                'عنوان بوابة الهوتسبوت',
                _gatewayIpController,
                Icons.router,
                hintText: '10.5.50.1/24',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _buildTextField(
                'نطاق توزيع DHCP',
                _poolRangeController,
                Icons.alt_route,
                hintText: '10.5.50.10-10.5.50.254',
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),

        // Hotspot Domain and Server Name
        Row(
          children: [
            Expanded(
              child: _buildTextField(
                'دومين صفحة الدخول (DNS Name)',
                _dnsNameController,
                Icons.language,
                hintText: 'login.sudafi.net',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _buildTextField(
                'اسم خادم الهوتسبوت',
                _serverNameController,
                Icons.tag,
                hintText: 'hs-sudafi',
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step 5: Preview & Conflict Checks
  // ---------------------------------------------------------------------------
  Widget _buildStep5PreviewAndConflicts() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildCardHeader(
          icon: Icons.preview_outlined,
          title: '5. المعاينة وفحص التعارضات والتحذيرات',
          subtitle: 'مراجعة دقيقة للتغييرات وقائمة أوامر RouterOS والتعارضات الشبكية قبل أي تعديل.',
        ),
        const SizedBox(height: 14),

        if (_isPreviewing) ...[
          const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Column(
                children: [
                  CircularProgressIndicator(color: Color(0xFF0284C7)),
                  SizedBox(height: 12),
                  Text('جارِ تحليل الإعدادات وكشف التعارضات وتوليد الأوامر...'),
                ],
              ),
            ),
          ),
        ] else if (_previewError != null) ...[
          _buildResultBanner(
            isSuccess: false,
            title: 'فشل توليد المعاينة',
            message: _previewError!,
          ),
          const SizedBox(height: 12),
          Center(
            child: ElevatedButton.icon(
              onPressed: _handleGeneratePreview,
              icon: const Icon(Icons.refresh),
              label: const Text('إعادة فحص المعاينة'),
            ),
          ),
        ] else if (_preview != null) ...[
          // Conflicts Card (if any)
          if (_preview!.conflicts.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.red.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.redAccent),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.error_outline, color: Colors.redAccent, size: 20),
                      SizedBox(width: 8),
                      Text(
                        'تم اكتشاف تعارضات شبكية:',
                        style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ..._preview!.conflicts.map((c) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text(
                          '• ${c.details} (القيمة الحالية: ${c.existingValue} | المقترحة: ${c.proposedValue})',
                          style: const TextStyle(fontSize: 11, color: Colors.white70),
                        ),
                      )),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'الموافقة على تجاوز وتكييف هذه التعارضات تلقائياً',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                    value: _allowOverwrite,
                    activeThumbColor: Colors.redAccent,
                    onChanged: (v) => setState(() => _allowOverwrite = v),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Clean Setup In-use warning
          if (_preview!.requiresCleanConfirmation) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.orangeAccent),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.warning_amber_rounded, color: Colors.orangeAccent, size: 20),
                      SizedBox(width: 8),
                      Text(
                        'تأكيد إعداد الراوتر النشط (Clean Setup Required):',
                        style: TextStyle(color: Colors.orangeAccent, fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'الراوتر يحتوي على إعدادات سابقة قيد الاستخدام. اختيار Clean Setup سيقوم بإعادة تشكيل البنية التحتية لشبكة المشتركين.',
                    style: TextStyle(color: Colors.white70, fontSize: 11),
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'أوافق صراحةً على إعادة برمجة الراوتر وفق القالب الجديد',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                    value: _cleanSetupConfirmed,
                    activeThumbColor: Colors.orangeAccent,
                    onChanged: (v) => setState(() => _cleanSetupConfirmed = v),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Planned Steps Overview
          Text(
            'مراحل التنفيذ المخططة (${_preview!.plannedSteps.length}):',
            style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
          ),
          const SizedBox(height: 8),

          ..._preview!.plannedSteps.map((step) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: context.bgCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: context.borderColor),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.arrow_left, color: Color(0xFF0284C7)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(step.title, style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                          const SizedBox(height: 2),
                          Text(step.description, style: TextStyle(color: context.textSecondary, fontSize: 11)),
                        ],
                      ),
                    ),
                  ],
                ),
              )),
          const SizedBox(height: 14),

          // RouterOS Generated Commands preview (collapsible)
          Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text(
                'عرض أوامر RouterOS الفعلية (RouterOS Script)',
                style: TextStyle(color: Color(0xFF38BDF8), fontSize: 12, fontWeight: FontWeight.bold),
              ),
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: _preview!.generatedCommands
                        .map((c) => Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Text(
                                c.command,
                                style: const TextStyle(
                                  color: Color(0xFF10B981),
                                  fontFamily: 'monospace',
                                  fontSize: 10,
                                ),
                              ),
                            ))
                        .toList(),
                  ),
                ),
              ],
            ),
          ),
        ] else ...[
          Center(
            child: ElevatedButton.icon(
              onPressed: _handleGeneratePreview,
              icon: const Icon(Icons.preview),
              label: const Text('توليد فحص المعاينة الآن'),
            ),
          ),
        ],
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step 6: Execution & Diagnostics
  // ---------------------------------------------------------------------------
  Widget _buildStep6ExecutionAndVerification() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildCardHeader(
          icon: Icons.rocket_launch_outlined,
          title: '6. تنفيذ البرمجة والتشخيص المباشر',
          subtitle: 'تطبيق الأوامر تسلسلياً مع أخذ نسخة احتياطية فورية وفحص شامل لجاهزية الإنترنت والهوتسبوت.',
        ),
        const SizedBox(height: 16),

        if (_isApplying) ...[
          Center(
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: context.bgCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF0284C7)),
              ),
              child: const Column(
                children: [
                  CircularProgressIndicator(color: Color(0xFF0284C7)),
                  SizedBox(height: 16),
                  Text(
                    'جارِ تطبيق الإعدادات على راوتر MikroTik...',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'يتم أخذ نسخة احتياطية، وإنشاء الجسر، وضبط الإنترنت وخادم الهوتسبوت وفحص الاتصال.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
        ] else if (_applyError != null) ...[
          _buildResultBanner(
            isSuccess: false,
            title: 'فشل تنفيذ برمجة الراوتر',
            message: _applyError!,
          ),
          const SizedBox(height: 16),
          Center(
            child: ElevatedButton.icon(
              onPressed: _handleApplyProvisioning,
              icon: const Icon(Icons.replay),
              label: const Text('إعادة المحاولة بحذر'),
            ),
          ),
        ] else if (_applyResult != null) ...[
          _buildProvisionResultDetails(_applyResult!),
        ] else ...[
          // Pre-apply summary confirmation card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.shield_outlined, color: Colors.green),
                    SizedBox(width: 8),
                    Text(
                      'إجراءات السلامة المفعلة تلقائياً:',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text('• سيتم إنشاء نسخة احتياطية (Backup) في ذاكرة الراوتر قبل البدء مباشرة.', style: TextStyle(fontSize: 11)),
                const SizedBox(height: 4),
                const Text('• سيتم فحص الإنترنت وخادم الهوتسبوت بعد التطبيق للتحقق من الجاهزية.', style: TextStyle(fontSize: 11)),
                const SizedBox(height: 4),
                const Text('• يتم حفظ بروفايل الهوتسبوت في حسابك لتتمكن من طباعة الكروت فوراً.', style: TextStyle(fontSize: 11)),
                const SizedBox(height: 20),

                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: _handleApplyProvisioning,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green.shade700,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.play_arrow, color: Colors.white),
                    label: const Text(
                      'تأكيد وبدء برمجة الراوتر الآن',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildProvisionResultDetails(ProvisionApplyResult res) {
    final verif = res.verification;
    final isSuccess = res.success;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildResultBanner(
          isSuccess: isSuccess,
          title: isSuccess ? 'تمت برمجة وتشغيل الراوتر بنجاح!' : 'فشل تنفيذ البرمجة جزئياً',
          message: isSuccess
            ? 'تم تطبيق إعدادات الشبكة وخادم الهوتسبوت بالكامل وربط الراوتر بالنظام.'
            : (res.failureReason ?? 'حدث خطأ أثناء تطبيق الأوامر على الراوتر.'),
        ),
        const SizedBox(height: 14),

        // Backup details
        if (res.backupFilename != null) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.blue.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.backup_outlined, size: 20, color: Colors.blue),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'تم حفظ نسخة احتياطية مسبقة: ${res.backupFilename}',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
        ],

        // Multi-point verification badges
        Text(
          'نتائج الفحص والتشخيص الميداني:',
          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
        ),
        const SizedBox(height: 8),

        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: context.bgCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: context.borderColor),
          ),
          child: Column(
            children: [
              _buildVerifItem(
                title: 'حالة وصول الإنترنت الخارجي',
                isOk: verif.internetReachable,
                details: verif.internetReachable ? 'استجاب فحص Ping بنجاح' : 'تعذر وصول الإنترنت عبر منفذ WAN',
              ),
              const Divider(height: 16),
              _buildVerifItem(
                title: 'تكوين منفذ الإنترنت (WAN)',
                isOk: verif.wanConfigured,
                details: verif.wanConfigured ? 'تم تعيين عنوان IP صالح لمنفذ WAN' : 'لم يحصل المنفذ على عنوان IP',
              ),
              const Divider(height: 16),
              _buildVerifItem(
                title: 'المسار الافتراضي (Default Route)',
                isOk: verif.defaultRouteActive,
                details: verif.defaultRouteActive ? 'مسار 0.0.0.0/0 مفعل ونشط' : 'المسار غير متوفر',
              ),
              const Divider(height: 16),
              _buildVerifItem(
                title: 'خادم الهوتسبوت (Hotspot Server)',
                isOk: verif.hotspotOperational,
                details: verif.hotspotOperational ? 'الخادم يعمل وجاهز لاستقبال المشتركين' : 'خادم الهوتسبوت معطل',
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Done button
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton.icon(
            onPressed: () {
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0284C7),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.done_all, color: Colors.white),
            label: const Text(
              'الانتهاء والعودة إلى لوحة التحكم',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildVerifItem({
    required String title,
    required bool isOk,
    required String details,
  }) {
    return Row(
      children: [
        Icon(
          isOk ? Icons.check_circle : Icons.cancel,
          color: isOk ? Colors.green : Colors.red,
          size: 18,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: TextStyle(color: context.textPrimary, fontSize: 12, fontWeight: FontWeight.bold)),
              Text(details, style: TextStyle(color: context.textSecondary, fontSize: 10)),
            ],
          ),
        ),
      ],
    );
  }

  // ===========================================================================
  // Step Navigation Controls
  // ===========================================================================
  Widget _buildBottomNavigation() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: context.bgCard,
        border: Border(top: BorderSide(color: context.borderColor)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          if (_currentStep > 0 && !_isApplying)
            OutlinedButton.icon(
              onPressed: () => setState(() => _currentStep--),
              icon: const Icon(Icons.arrow_forward, size: 16),
              label: const Text('السابق'),
            )
          else
            const SizedBox(),

          if (_currentStep < 5)
            ElevatedButton.icon(
              onPressed: _canAdvance() ? _handleNextStep : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0284C7),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              icon: const Icon(Icons.arrow_back, size: 16, color: Colors.white),
              label: const Text('التالي', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
        ],
      ),
    );
  }

  bool _canAdvance() {
    if (_currentStep == 0) {
      return _selectedDeviceId != null || _testSuccess == true;
    }
    if (_currentStep == 1) {
      return _discovery != null;
    }
    if (_currentStep == 3) {
      return _selectedWanInterface != null && _selectedLanInterfaces.isNotEmpty;
    }
    return true;
  }

  void _handleNextStep() async {
    if (_currentStep == 0) {
      if (_selectedDeviceId == null) {
        await _handleSaveNewDeviceSilently();
      }
      setState(() => _currentStep = 1);
      if (_discovery == null) {
        _handleFetchDiscovery();
      }
    } else if (_currentStep == 1) {
      setState(() => _currentStep = 2);
    } else if (_currentStep == 2) {
      setState(() => _currentStep = 3);
    } else if (_currentStep == 3) {
      setState(() => _currentStep = 4);
      _handleGeneratePreview();
    } else if (_currentStep == 4) {
      setState(() => _currentStep = 5);
    }
  }

  // ===========================================================================
  // Shared Components & Helpers
  // ===========================================================================

  Widget _buildCardHeader({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: const Color(0xFF0284C7).withValues(alpha: 0.15),
            child: Icon(icon, color: const Color(0xFF0284C7), size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: context.textPrimary,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: context.textSecondary,
                    fontSize: 11,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTextField(
    String label,
    TextEditingController controller,
    IconData icon, {
    String? hintText,
    TextInputType? keyboardType,
    bool obscureText = false,
    Widget? suffixIcon,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      validator: validator,
      style: TextStyle(color: context.textPrimary, fontSize: 13),
      decoration: InputDecoration(
        labelText: label,
        hintText: hintText,
        prefixIcon: Icon(icon, size: 18, color: context.textSecondary),
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: context.bgCard,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: context.borderColor)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: context.borderColor)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF0284C7), width: 1.5)),
      ),
    );
  }

  Widget _buildVersionChip(String version, String title, IconData icon) {
    final isSelected = _rosVersion == version;
    return InkWell(
      onTap: () => setState(() => _rosVersion = version),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF0284C7) : context.bgCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isSelected ? const Color(0xFF0284C7) : context.borderColor),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 16, color: isSelected ? Colors.white : context.textSecondary),
            const SizedBox(width: 6),
            Text(
              title,
              style: TextStyle(
                color: isSelected ? Colors.white : context.textPrimary,
                fontWeight: FontWeight.bold,
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTemplateCard({
    required String id,
    required String title,
    required String description,
    required String badge,
    required Color badgeColor,
  }) {
    final isSelected = _selectedTemplate == id;

    return InkWell(
      onTap: () => setState(() => _selectedTemplate = id),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF0284C7).withValues(alpha: 0.1) : context.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? const Color(0xFF0284C7) : context.borderColor,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
                  color: isSelected ? const Color(0xFF0284C7) : Colors.grey,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: badgeColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    badge,
                    style: TextStyle(color: badgeColor, fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              description,
              style: TextStyle(color: context.textSecondary, fontSize: 11, height: 1.3),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWanModeChip(String mode, String label, IconData icon) {
    final isSelected = _selectedWanMode == mode;
    return InkWell(
      onTap: () => setState(() => _selectedWanMode = mode),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF0284C7) : context.bgCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isSelected ? const Color(0xFF0284C7) : context.borderColor),
        ),
        child: Column(
          children: [
            Icon(icon, size: 16, color: isSelected ? Colors.white : context.textSecondary),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: isSelected ? Colors.white : context.textPrimary,
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResultBanner({
    required bool isSuccess,
    required String title,
    required String message,
    int? latencyMs,
    Map<String, dynamic>? metrics,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isSuccess ? Colors.green.withValues(alpha: 0.12) : Colors.red.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isSuccess ? Colors.green : Colors.red),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isSuccess ? Icons.check_circle : Icons.error_outline,
                color: isSuccess ? Colors.green : Colors.red,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: isSuccess ? Colors.greenAccent : Colors.redAccent,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ),
              if (latencyMs != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(6)),
                  child: Text('${latencyMs}ms', style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11)),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(message, style: TextStyle(color: context.textPrimary, fontSize: 11, height: 1.3)),
          if (metrics != null) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                if (metrics['model'] != null)
                  Text('الموديل: ${metrics['model']}', style: TextStyle(fontSize: 11, color: context.textPrimary)),
                if (metrics['version'] != null)
                  Text('الإصدار: ${metrics['version']}', style: TextStyle(fontSize: 11, color: context.textSecondary)),
                if (metrics['cpuLoad'] != null)
                  Text('المعالج: ${metrics['cpuLoad']}%', style: const TextStyle(fontSize: 11, color: Colors.green)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
