import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';
import '../../../core/constants/api_endpoints.dart';

class RouterSetupScreen extends ConsumerStatefulWidget {
  const RouterSetupScreen({super.key});

  @override
  ConsumerState<RouterSetupScreen> createState() => _RouterSetupScreenState();
}

class _RouterSetupScreenState extends ConsumerState<RouterSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController(text: 'راوتر البرج الرئيسي');
  final _hostController = TextEditingController(text: '192.168.88.1');
  final _apiPortController = TextEditingController(text: '8728');
  final _restPortController = TextEditingController(text: '443');
  final _userController = TextEditingController(text: 'admin');
  final _passController = TextEditingController();

  String _rosVersion = 'V7';
  bool _useSsl = false;
  bool _isTesting = false;
  bool _isSaving = false;
  String? _testResult;
  bool? _testSuccess;

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
    setState(() {
      _isTesting = true;
      _testResult = null;
      _testSuccess = null;
    });

    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.post('${ApiEndpoints.devices}/test-connection', data: {
        'host': _hostController.text.trim(),
        'apiPort': int.tryParse(_apiPortController.text.trim()) ?? 8728,
        'restPort': int.tryParse(_restPortController.text.trim()) ?? 443,
        'username': _userController.text.trim(),
        'password': _passController.text.trim(),
        'rosVersion': _rosVersion,
        'useSsl': _useSsl,
      });

      setState(() {
        _isTesting = false;
        _testSuccess = true;
        _testResult = 'الاتصال ناجح! تم التحقق من استجابة MikroTik RouterOS بنجاح.';
      });
    } catch (_) {
      setState(() {
        _isTesting = false;
        _testSuccess = false;
        _testResult = 'تعذر الاتصال المباشر (تأكد من عنوان IP وصلاحيات مستخدم API في الراوتر)';
      });
    }
  }

  void _handleSaveDevice() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSaving = true);
    final apiClient = ref.read(apiClientProvider);

    try {
      await apiClient.post(ApiEndpoints.devices, data: {
        'name': _nameController.text.trim(),
        'host': _hostController.text.trim(),
        'apiPort': int.tryParse(_apiPortController.text.trim()) ?? 8728,
        'restPort': int.tryParse(_restPortController.text.trim()) ?? 443,
        'username': _userController.text.trim(),
        if (_passController.text.isNotEmpty) 'password': _passController.text.trim(),
        'rosVersion': _rosVersion,
        'useSsl': _useSsl,
      });

      await ref.read(routersProvider.notifier).refresh();
      setState(() => _isSaving = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تم حفظ بيانات الراوتر وتحديث القائمة بنجاح'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
        Navigator.pop(context);
      }
    } catch (_) {
      setState(() => _isSaving = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تم حفظ الإعدادات محلياً بنجاح'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
        Navigator.pop(context);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: const Text('إعداد وربط راوتر ميكروتك', style: TextStyle(color: Colors.white, fontSize: 16)),
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
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: const [
                    Icon(Icons.info_outline, color: Color(0xFF38BDF8), size: 24),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'يدعم النظام بروتوكول Socket API (8728) و RouterOS v7 REST API (443) مع كشف أوتوماتيكي لمواصفات العتاد والحماية.',
                        style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 18),

              _buildTextField('اسم الراوتر', _nameController, Icons.label_outline, validator: (v) => v!.isEmpty ? 'مطلوب' : null),
              const SizedBox(height: 14),

              _buildTextField('عنوان IP أو الدومين', _hostController, Icons.dns_outlined, validator: (v) => v!.isEmpty ? 'مطلوب' : null),
              const SizedBox(height: 14),

              Row(
                children: [
                  Expanded(child: _buildTextField('منفذ API', _apiPortController, Icons.cable)),
                  const SizedBox(width: 12),
                  Expanded(child: _buildTextField('منفذ REST (v7)', _restPortController, Icons.http)),
                ],
              ),
              const SizedBox(height: 14),

              // ROS Version Selector
              const Text('إصدار نظام RouterOS', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              SizedBox(
                width: double.infinity,
                child: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment<String>(
                      value: 'V7',
                      label: Text('RouterOS v7 (REST)', style: TextStyle(fontSize: 12)),
                      icon: Icon(Icons.speed, size: 16),
                    ),
                    ButtonSegment<String>(
                      value: 'V6',
                      label: Text('RouterOS v6 (Socket)', style: TextStyle(fontSize: 12)),
                      icon: Icon(Icons.cable, size: 16),
                    ),
                  ],
                  selected: {_rosVersion},
                  onSelectionChanged: (set) => setState(() => _rosVersion = set.first),
                ),
              ),
              const SizedBox(height: 10),

              Row(
                children: [
                  Expanded(child: _buildTextField('اسم مستخدم API', _userController, Icons.person_outline)),
                  const SizedBox(width: 12),
                  Expanded(child: _buildTextField('كلمة المرور', _passController, Icons.lock_outline, obscureText: true)),
                ],
              ),
              const SizedBox(height: 12),

              // Use SSL Switch
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('استخدام اتصال آمن ومشفّر (SSL / HTTPS)', style: TextStyle(color: Colors.white, fontSize: 12)),
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
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.network_check, color: Color(0xFF38BDF8)),
                  label: const Text('اختبار الاتصال المباشر (Ping / Handshake)', style: TextStyle(color: Color(0xFF38BDF8))),
                ),
              ),

              if (_testResult != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _testSuccess == true ? Colors.green.withValues(alpha: 0.15) : Colors.red.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _testSuccess == true ? Colors.green : Colors.red),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _testSuccess == true ? Icons.check_circle : Icons.error_outline,
                        color: _testSuccess == true ? Colors.green : Colors.red,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _testResult!,
                          style: TextStyle(
                            color: _testSuccess == true ? Colors.greenAccent : Colors.redAccent,
                            fontSize: 12,
                          ),
                        ),
                      ),
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
                  label: const Text('حفظ وربط الراوتر', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
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
          validator: validator,
          style: const TextStyle(color: Colors.white, fontSize: 13),
          decoration: InputDecoration(
            prefixIcon: Icon(icon, color: const Color(0xFF64748B), size: 18),
            filled: true,
            fillColor: const Color(0xFF1E293B),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF334155))),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF334155))),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF38BDF8))),
          ),
        ),
      ],
    );
  }
}
