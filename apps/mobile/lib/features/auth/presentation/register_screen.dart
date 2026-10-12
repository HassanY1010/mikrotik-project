import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/providers.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _tenantNameController = TextEditingController();
  final _slugController = TextEditingController();
  final _fullNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _phoneController = TextEditingController();

  bool _isLoading = false;
  String? _errorMessage;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _tenantNameController.dispose();
    _slugController.dispose();
    _fullNameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _generateSlugFromName(String name) {
    if (_slugController.text.isEmpty || _slugController.text.startsWith('net-')) {
      final sanitized = name
          .trim()
          .toLowerCase()
          .replaceAll(RegExp(r'[^a-z0-9]'), '-')
          .replaceAll(RegExp(r'-+'), '-')
          .replaceAll(RegExp(r'^-|-$'), '');
      if (sanitized.isNotEmpty) {
        _slugController.text = sanitized;
      }
    }
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final apiClient = ref.read(apiClientProvider);

    try {
      final slug = _slugController.text.trim().toLowerCase();
      final email = _emailController.text.trim();

      await apiClient.post(
        ApiEndpoints.register,
        data: {
          'tenantName': _tenantNameController.text.trim(),
          'slug': slug,
          'adminFullName': _fullNameController.text.trim(),
          'adminEmail': email,
          'adminPassword': _passwordController.text,
          if (_phoneController.text.trim().isNotEmpty)
            'adminPhone': _phoneController.text.trim(),
          'currency': 'SDG',
          'planName': 'BASIC',
        },
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم إنشاء حساب شبكتك بنجاح! يمكنك الآن تسجيل الدخول.'),
          backgroundColor: Color(0xFF10B981),
          duration: Duration(seconds: 4),
        ),
      );

      Navigator.of(context).pop(email);
    } on DioException catch (dioErr) {
      String msg = 'فشل إنشاء الحساب، يرجى المحاولة لاحقاً';
      final responseData = dioErr.response?.data;
      if (responseData is Map && responseData['message'] != null) {
        final rawMsg = responseData['message'];
        if (rawMsg is List) {
          msg = rawMsg.join(' | ');
        } else {
          msg = rawMsg.toString();
        }
      } else if (dioErr.response?.statusCode == 409) {
        msg = 'البريد الإلكتروني أو معرّف الشبكة (Slug) مستخدم بالفعل';
      }
      setState(() => _errorMessage = msg);
    } catch (e) {
      setState(() => _errorMessage = 'حدث خطأ: ${e.toString()}');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('تسجيل شبكة جديدة'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFF334155)),
                      ),
                      child: Column(
                        children: [
                          const Icon(
                            Icons.wifi_tethering_rounded,
                            size: 44,
                            color: Color(0xFF38BDF8),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'انضم لمنصة SudaFi',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'أنشئ حساب شبكتك وابدأ إدارة راوترات MikroTik و Starlink',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    if (_errorMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0x26EF4444),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFEF4444)),
                        ),
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13),
                          textAlign: TextAlign.center,
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // اسم الشبكة
                    TextFormField(
                      controller: _tenantNameController,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'اسم الشبكة أو المنشأة *',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                        hintText: 'مثال: شبكة النور هوت سبوت',
                        hintStyle: const TextStyle(color: Color(0xFF64748B)),
                        prefixIcon: const Icon(Icons.business_rounded, color: Color(0xFF38BDF8)),
                        filled: true,
                        fillColor: const Color(0xFF1E293B),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onChanged: _generateSlugFromName,
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return 'اسم الشبكة مطلوب';
                        if (val.trim().length < 3) return 'الاسم يجب أن يكون 3 أحرف على الأقل';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),

                    // معرّف الشبكة (Slug)
                    TextFormField(
                      controller: _slugController,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'معرف الشبكة بالإنجليزية (Slug) *',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                        hintText: 'مثال: al-noor-wifi',
                        hintStyle: const TextStyle(color: Color(0xFF64748B)),
                        prefixIcon: const Icon(Icons.link_rounded, color: Color(0xFF38BDF8)),
                        filled: true,
                        fillColor: const Color(0xFF1E293B),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return 'معرف الشبكة مطلوب';
                        if (!RegExp(r'^[a-z0-9-]+$').hasMatch(val.trim().toLowerCase())) {
                          return 'يسمح فقط بأحرف إنجليزية صغيرة وأرقام وعلامة (-)';
                        }
                        if (val.trim().length < 3) return 'المعرف يجب أن يكون 3 أحرف على الأقل';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),

                    // الاسم الكامل للمالك
                    TextFormField(
                      controller: _fullNameController,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'اسم المسؤول الكامل *',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                        hintText: 'مثال: أحمد محمد علي',
                        hintStyle: const TextStyle(color: Color(0xFF64748B)),
                        prefixIcon: const Icon(Icons.person_rounded, color: Color(0xFF38BDF8)),
                        filled: true,
                        fillColor: const Color(0xFF1E293B),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return 'اسم المسؤول مطلوب';
                        if (val.trim().length < 3) return 'الاسم يجب أن يكون 3 أحرف على الأقل';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),

                    // البريد الإلكتروني
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'البريد الإلكتروني لتسجيل الدخول *',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                        hintText: 'admin@example.com',
                        hintStyle: const TextStyle(color: Color(0xFF64748B)),
                        prefixIcon: const Icon(Icons.email_rounded, color: Color(0xFF38BDF8)),
                        filled: true,
                        fillColor: const Color(0xFF1E293B),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return 'البريد الإلكتروني مطلوب';
                        if (!val.contains('@') || !val.contains('.')) return 'بريد إلكتروني غير صالح';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),

                    // رقم الهاتف
                    TextFormField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'رقم الهاتف (اختياري)',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                        hintText: '+249912345678',
                        hintStyle: const TextStyle(color: Color(0xFF64748B)),
                        prefixIcon: const Icon(Icons.phone_rounded, color: Color(0xFF38BDF8)),
                        filled: true,
                        fillColor: const Color(0xFF1E293B),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                    const SizedBox(height: 14),

                    // كلمة المرور
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'كلمة المرور * (8 خانات على الأقل)',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                        prefixIcon: const Icon(Icons.lock_rounded, color: Color(0xFF38BDF8)),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword ? Icons.visibility_off : Icons.visibility,
                            color: const Color(0xFF94A3B8),
                          ),
                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                        ),
                        filled: true,
                        fillColor: const Color(0xFF1E293B),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      validator: (val) {
                        if (val == null || val.isEmpty) return 'كلمة المرور مطلوبة';
                        if (val.length < 8) return 'كلمة المرور يجب أن تكون 8 خانات على الأقل';
                        return null;
                      },
                    ),
                    const SizedBox(height: 24),

                    // زر التسجيل
                    SizedBox(
                      height: 50,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0284C7),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: _isLoading ? null : _handleRegister,
                        child: _isLoading
                            ? const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              )
                            : const Text(
                                'إنشاء الحساب وبدء التجربة',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // العودة لتسجيل الدخول
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text(
                        'لديك حساب بالفعل؟ تسجيل الدخول',
                        style: TextStyle(color: Color(0xFF38BDF8)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
