import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

class RouterSetupScreen extends ConsumerStatefulWidget {
  final RouterDeviceModel? router;

  const RouterSetupScreen({super.key, this.router});

  @override
  ConsumerState<RouterSetupScreen> createState() => _RouterSetupScreenState();
}

class _RouterSetupScreenState extends ConsumerState<RouterSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _hostController;
  late final TextEditingController _apiPortController;
  late final TextEditingController _restPortController;
  late final TextEditingController _userController;
  final _passController = TextEditingController();

  late String _rosVersion;
  late bool _useSsl;
  bool _obscurePassword = true;

  bool _isTesting = false;
  bool _isSaving = false;
  String? _testResult;
  bool? _testSuccess;
  String? _testStage;
  int? _latencyMs;
  Map<String, dynamic>? _routerMetrics;

  @override
  void initState() {
    super.initState();
    final r = widget.router;
    _nameController = TextEditingController(text: r?.name ?? 'راوتر البرج الرئيسي');
    _hostController = TextEditingController(text: r?.host ?? '192.168.88.1');
    _apiPortController = TextEditingController(text: (r?.apiPort ?? 8728).toString());
    _restPortController = TextEditingController(text: (r?.restPort ?? 443).toString());
    _userController = TextEditingController(text: r?.username ?? 'admin');
    _rosVersion = (r?.rosVersion.toUpperCase().contains('V6') == true) ? 'V6' : 'V7';
    _useSsl = r?.useSsl ?? false;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _hostController.dispose();
    _apiPortController.dispose();
    _restPortController.dispose();
    _userController.dispose();
    _passController.dispose();
    super.dispose();
  }

  void _handleTestConnection() async {
    final host = _hostController.text.trim();
    final user = _userController.text.trim();
    final pass = _passController.text.trim();

    if (host.isEmpty) {
      setState(() {
        _testSuccess = false;
        _testResult = 'يرجى إدخال عنوان IP أو الدومين للراوتر أولاً.';
      });
      return;
    }
    if (user.isEmpty) {
      setState(() {
        _testSuccess = false;
        _testResult = 'يرجى إدخال اسم مستخدم API في الراوتر.';
      });
      return;
    }
    if (pass.isEmpty && widget.router == null) {
      setState(() {
        _testSuccess = false;
        _testResult = 'يرجى إدخال كلمة مرور الراوتر لإجراء المصادقة والفحص الفعلي.';
      });
      return;
    }

    setState(() {
      _isTesting = true;
      _testResult = null;
      _testSuccess = null;
      _testStage = null;
      _latencyMs = null;
      _routerMetrics = null;
    });

    final payload = {
      if (widget.router != null) 'id': widget.router!.id,
      'host': host,
      'apiPort': int.tryParse(_apiPortController.text.trim()) ?? 8728,
      'restPort': int.tryParse(_restPortController.text.trim()) ?? 443,
      'username': user,
      if (pass.isNotEmpty) 'password': pass,
      'rosVersion': _rosVersion,
      'useSsl': _useSsl,
    };

    final result = await ref
        .read(routersProvider.notifier)
        .testConnectionDirect(payload);

    if (!mounted) return;

    final isOk = result['success'] == true;
    final message = result['message']?.toString() ??
        (isOk ? 'تم الاتصال والمصادقة بنجاح' : 'فشل الاتصال بالراوتر');
    final stage = result['stage']?.toString();
    final latency = result['latencyMs'];
    final info = result['routerInfo'] as Map<String, dynamic>?;

    setState(() {
      _isTesting = false;
      _testSuccess = isOk;
      _testStage = stage;
      _testResult = message;
      _latencyMs = latency is num ? latency.toInt() : null;
      _routerMetrics = info;
    });
  }

  void _handleSaveDevice() async {
    if (!_formKey.currentState!.validate()) return;

    final host = _hostController.text.trim();
    final user = _userController.text.trim();
    final pass = _passController.text.trim();

    if (pass.isEmpty && widget.router == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('كلمة المرور مطلوبة لإضافة راوتر جديد وتشفيرها في النظام'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isSaving = true);
    final messenger = ScaffoldMessenger.of(context);

    final payload = {
      'name': _nameController.text.trim(),
      'host': host,
      'apiPort': int.tryParse(_apiPortController.text.trim()) ?? 8728,
      'restPort': int.tryParse(_restPortController.text.trim()) ?? 443,
      'username': user,
      if (pass.isNotEmpty) 'password': pass,
      'rosVersion': _rosVersion,
      'useSsl': _useSsl,
    };

    final result = await ref
        .read(routersProvider.notifier)
        .saveRouter(payload, id: widget.router?.id);

    if (!mounted) return;
    setState(() => _isSaving = false);

    if (result['success'] == true) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            widget.router != null
                ? 'تم تحديث إعدادات الراوتر بنجاح'
                : 'تم حفظ وربط راوتر MikroTik بنجاح وتوثيقه في النظام',
          ),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
      Navigator.pop(context);
    } else {
      messenger.showSnackBar(
        SnackBar(
          content: Text(result['message']?.toString() ?? 'فشل حفظ بيانات الراوتر في الخادم'),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 4),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.router != null;

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Text(
          isEditing ? 'تعديل إعدادات راوتر ميكروتك' : 'إعداد وربط راوتر ميكروتك',
          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Notice banner
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.3)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Icon(Icons.info_outline, color: Color(0xFF38BDF8), size: 24),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'يدعم النظام بروتوكول RouterOS Socket API (8728) و RouterOS v7 REST API (443) مع كشف أوتوماتيكي لمواصفات العتاد والحماية.',
                        style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 18),

              // Router Name
              _buildTextField(
                'اسم الراوتر',
                _nameController,
                Icons.router_outlined,
                validator: (v) => (v == null || v.trim().isEmpty) ? 'اسم الراوتر مطلوب' : null,
              ),
              const SizedBox(height: 14),

              // Host / Domain
              _buildTextField(
                'عنوان IP أو الدومين',
                _hostController,
                Icons.dns_outlined,
                validator: (v) => (v == null || v.trim().isEmpty) ? 'عنوان IP أو اسم النطاق مطلوب' : null,
              ),
              const SizedBox(height: 14),

              // Ports Row
              Row(
                children: [
                  Expanded(
                    child: _buildTextField(
                      'منفذ API',
                      _apiPortController,
                      Icons.cable,
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        final p = int.tryParse(v ?? '');
                        if (p == null || p < 1 || p > 65535) return '1-65535';
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildTextField(
                      'منفذ (v7) REST',
                      _restPortController,
                      Icons.http,
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        final p = int.tryParse(v ?? '');
                        if (p == null || p < 1 || p > 65535) return '1-65535';
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // ROS Version Selector
              const Text('إصدار نظام RouterOS', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: () => setState(() => _rosVersion = 'V6'),
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: _rosVersion == 'V6' ? const Color(0xFFF59E0B) : const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _rosVersion == 'V6' ? const Color(0xFFF59E0B) : const Color(0xFF334155),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.cable, size: 16, color: _rosVersion == 'V6' ? Colors.black : Colors.white70),
                            const SizedBox(width: 6),
                            Text(
                              'RouterOS v6 (Socket)',
                              style: TextStyle(
                                color: _rosVersion == 'V6' ? Colors.black : Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                            if (_rosVersion == 'V6') ...[
                              const SizedBox(width: 4),
                              const Icon(Icons.check, size: 16, color: Colors.black),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: InkWell(
                      onTap: () => setState(() => _rosVersion = 'V7'),
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: _rosVersion == 'V7' ? const Color(0xFFF59E0B) : const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _rosVersion == 'V7' ? const Color(0xFFF59E0B) : const Color(0xFF334155),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.speed, size: 16, color: _rosVersion == 'V7' ? Colors.black : Colors.white70),
                            const SizedBox(width: 6),
                            Text(
                              'RouterOS v7 (REST)',
                              style: TextStyle(
                                color: _rosVersion == 'V7' ? Colors.black : Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                            if (_rosVersion == 'V7') ...[
                              const SizedBox(width: 4),
                              const Icon(Icons.check, size: 16, color: Colors.black),
                            ],
                          ],
                        ),
                      ),
                    ),
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
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildTextField(
                      'كلمة المرور',
                      _passController,
                      Icons.lock_outline,
                      obscureText: _obscurePassword,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility_off : Icons.visibility,
                          color: const Color(0xFF64748B),
                          size: 18,
                        ),
                        onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Use SSL Switch
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          Text('استخدام اتصال آمن ومشفر (SSL / HTTPS)', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                          SizedBox(height: 2),
                          Text('تفعيل تشفير TLS لمنفذ REST (443) أو API-SSL (8729)', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
                        ],
                      ),
                    ),
                    Switch(
                      value: _useSsl,
                      activeThumbColor: const Color(0xFF38BDF8),
                      onChanged: (v) => setState(() => _useSsl = v),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Ping / Test connection Button
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _isTesting ? null : _handleTestConnection,
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Color(0xFF38BDF8)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: _isTesting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)))
                      : const Icon(Icons.network_check, color: Color(0xFF38BDF8)),
                  label: Text(
                    _isTesting ? 'جارِ فحص الاتصال ومصافحة الراوتر...' : 'اختبار الاتصال المباشر (Ping / Handshake)',
                    style: const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold),
                  ),
                ),
              ),

              // Live Diagnostics / Test Result Card
              if (_testResult != null) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: _testSuccess == true
                        ? Colors.green.withValues(alpha: 0.12)
                        : Colors.red.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _testSuccess == true ? Colors.green : Colors.red),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            _testSuccess == true ? Icons.check_circle : Icons.error_outline,
                            color: _testSuccess == true ? Colors.green : Colors.red,
                            size: 22,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _testSuccess == true ? 'نجح اختبار الاتصال والمصادقة' : 'فشل الاتصال بالراوتر',
                              style: TextStyle(
                                color: _testSuccess == true ? Colors.greenAccent : Colors.redAccent,
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          if (_testStage != null)
                            Container(
                              margin: const EdgeInsets.symmetric(horizontal: 6),
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white12,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _testStage!,
                                style: const TextStyle(color: Color(0xFFFBBF24), fontSize: 10, fontWeight: FontWeight.bold),
                              ),
                            ),
                          if (_latencyMs != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.black26,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '${_latencyMs}ms',
                                style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.bold),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _testResult!,
                        style: const TextStyle(color: Colors.white70, fontSize: 12, height: 1.3),
                      ),
                      if (_routerMetrics != null) ...[
                        const SizedBox(height: 10),
                        const Divider(color: Color(0xFF334155), height: 1),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 12,
                          runSpacing: 6,
                          children: [
                            if (_routerMetrics!['model'] != null)
                              Text('الموديل: ${_routerMetrics!['model']}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                            if (_routerMetrics!['version'] != null)
                              Text('الإصدار: ${_routerMetrics!['version']}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                            if (_routerMetrics!['uptime'] != null)
                              Text('مدة العمل: ${_routerMetrics!['uptime']}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                            if (_routerMetrics!['cpuLoad'] != null)
                              Text('استهلاك المعالج: ${_routerMetrics!['cpuLoad']}%', style: const TextStyle(color: Color(0xFF10B981), fontSize: 11)),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 24),

              // Save button
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: _isSaving ? null : _handleSaveDevice,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: _isSaving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Icon(Icons.save, color: Colors.white),
                  label: Text(
                    _isSaving ? 'جارِ حفظ وربط الراوتر...' : (isEditing ? 'حفظ التعديلات' : 'حفظ وربط الراوتر'),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(
    String label,
    TextEditingController controller,
    IconData icon, {
    bool obscureText = false,
    Widget? suffixIcon,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          keyboardType: keyboardType,
          validator: validator,
          style: const TextStyle(color: Colors.white, fontSize: 13),
          decoration: InputDecoration(
            prefixIcon: Icon(icon, color: const Color(0xFF64748B), size: 18),
            suffixIcon: suffixIcon,
            filled: true,
            fillColor: const Color(0xFF1E293B),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF334155))),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF334155))),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF38BDF8))),
            errorStyle: const TextStyle(color: Colors.redAccent, fontSize: 10),
          ),
        ),
      ],
    );
  }
}
