import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import 'register_screen.dart';
import 'forgot_password_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _serverUrlController = TextEditingController();
  bool _isLoading = false;
  bool _obscurePassword = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final storage = ref.read(localStorageProvider);
    _serverUrlController.text = storage.getBaseUrl();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _serverUrlController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final storage = ref.read(localStorageProvider);
    final apiClient = ref.read(apiClientProvider);

    try {
      // Save custom base URL if changed, or ensure default
      final currentUrl = _serverUrlController.text.trim();
      final effectiveUrl = currentUrl.isNotEmpty ? currentUrl : ApiEndpoints.defaultBaseUrl;
      await storage.setBaseUrl(effectiveUrl);
      _serverUrlController.text = effectiveUrl;

      final response = await apiClient.post(
        ApiEndpoints.login,
        data: {
          'email': _emailController.text.trim(),
          'password': _passwordController.text,
        },
      );

      final data = response.data;
      final payload = (data is Map && data['data'] != null) ? data['data'] : data;

      final accessToken = payload['accessToken'] as String?;
      final refreshToken = payload['refreshToken'] as String?;
      final userJson = payload['user'] as Map<String, dynamic>?;

      if (accessToken == null || userJson == null) {
        throw Exception('استجابة غير صحيحة من الخادم');
      }

      await storage.setToken(accessToken);
      if (refreshToken != null && refreshToken.isNotEmpty) {
        await storage.setRefreshToken(refreshToken);
      }
      final user = AuthUser.fromJson(userJson);
      await storage.setUser(user);
      ref.read(currentUserProvider.notifier).setUser(user);

      // Pre-fetch profiles and routers into cache safely without blocking login
      try {
        await ref.read(profilesProvider.notifier).fetchProfiles();
      } catch (_) {}
      try {
        await ref.read(routersProvider.notifier).refresh();
      } catch (_) {}

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('مرحباً بك، ${user.fullName}'),
            backgroundColor: AppTheme.primary,
          ),
        );
      }
    } catch (e) {
      String msg = 'فشل تسجيل الدخول: يرجى التحقق من صحة البيانات والاتصال بالخادم';
      if (e is DioException) {
        if (e.response?.statusCode == 401) {
          msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التأكد من صحة البيانات.';
        } else if (e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout) {
          msg = 'الخادم السحابي استغرق وقتاً للاستجابة. يرجى المحاولة مرة ثانية الآن.';
        } else if (e.type == DioExceptionType.connectionError) {
          msg = 'تعذر الاتصال بالخادم. يرجى التأكد من اتصال الهاتف بالإنترنت وعنوان السيرفر.';
        } else if (e.response != null && e.response?.data is Map) {
          final errorData = e.response!.data as Map;
          if (errorData['error'] != null && errorData['error']['message'] != null) {
            msg = errorData['error']['message'].toString();
          } else if (errorData['message'] != null) {
            msg = errorData['message'].toString();
          }
        }
      } else {
        msg = e.toString();
      }
      setState(() {
        _errorMessage = msg;
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void showServerSettingsDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إعدادات الخادم'),
        content: TextField(
          controller: _serverUrlController,
          decoration: const InputDecoration(
            labelText: 'عنوان API للخادم',
            hintText: 'https://mikrotik-api-yn0e.onrender.com/api/v1',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () {
              ref.read(localStorageProvider).setBaseUrl(_serverUrlController.text.trim());
              Navigator.pop(ctx);
            },
            child: const Text('حفظ'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('سودافاي | SudaFi'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: Icon(
              ref.watch(themeModeProvider) == ThemeMode.light
                  ? Icons.dark_mode_outlined
                  : Icons.light_mode_outlined,
            ),
            tooltip: 'تبديل المظهر (فاتح / داكن)',
            onPressed: () {
              ref.read(themeModeProvider.notifier).toggleTheme();
            },
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Card(
              elevation: 8,
              clipBehavior: Clip.antiAlias,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // SudaFi Official Branding Banner
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topRight,
                        end: Alignment.bottomLeft,
                        colors: [
                          AppTheme.primaryDark,
                          AppTheme.primary,
                        ],
                      ),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Official SudaFi App Icon Mark
                        Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(18),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.25),
                                blurRadius: 8,
                                offset: const Offset(0, 3),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(16),
                            child: Image.asset(
                              'assets/images/sudafi_icon.png',
                              height: 72,
                              width: 72,
                              fit: BoxFit.contain,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'سودافاي | SudaFi',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'منظومة إدارة شبكات ميكروتك والهوتسبوت الذكية',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: AppTheme.accent,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),

                  Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'تسجيل الدخول للنظام',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'إدارة مبيعات كروت الهوتسبوت ومزامنة الراوتر',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: Colors.grey,
                            ),
                          ),
                          const SizedBox(height: 20),

                      if (_errorMessage != null) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.red.shade900.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.red.shade400),
                          ),
                          child: Text(
                            _errorMessage!,
                            style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        style: TextStyle(color: context.textPrimary, fontSize: 14),
                        decoration: const InputDecoration(
                          labelText: 'البريد الإلكتروني',
                          prefixIcon: Icon(Icons.email_outlined),
                        ),
                        validator: (val) {
                          if (val == null || val.trim().isEmpty) return 'يرجى إدخال البريد الإلكتروني';
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      TextFormField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        style: TextStyle(color: context.textPrimary, fontSize: 14),
                        decoration: InputDecoration(
                          labelText: 'كلمة المرور',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword ? Icons.visibility_off : Icons.visibility,
                              color: Colors.grey,
                              size: 20,
                            ),
                            onPressed: () {
                              setState(() {
                                _obscurePassword = !_obscurePassword;
                              });
                            },
                          ),
                        ),
                        validator: (val) {
                          if (val == null || val.isEmpty) return 'يرجى إدخال كلمة المرور';
                          return null;
                        },
                      ),
                      const SizedBox(height: 8),

                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          onPressed: () async {
                            final resetEmail = await Navigator.push<String>(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ForgotPasswordScreen(
                                  initialEmail: _emailController.text.trim(),
                                ),
                              ),
                            );
                            if (resetEmail != null && resetEmail.isNotEmpty) {
                              _emailController.text = resetEmail;
                              _passwordController.clear();
                            }
                          },
                          child: const Text(
                            'نسيت كلمة المرور؟',
                            style: TextStyle(
                              color: Color(0xFF0D9488),
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),

                      ElevatedButton(
                        onPressed: _isLoading ? null : _handleLogin,
                        child: _isLoading
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('تسجيل الدخول'),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                        label: const Text('صاحب شبكة جديد؟ إنشاء حساب الآن'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF38BDF8),
                          side: const BorderSide(color: Color(0xFF0284C7)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () async {
                          final registeredEmail = await Navigator.push<String>(
                            context,
                            MaterialPageRoute(builder: (_) => const RegisterScreen()),
                          );
                          if (registeredEmail != null && registeredEmail.isNotEmpty) {
                            _emailController.text = registeredEmail;
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  ),
);
  }
}
