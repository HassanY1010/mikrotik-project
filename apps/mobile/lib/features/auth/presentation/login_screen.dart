import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController(text: 'cashier@demo.com');
  final _passwordController = TextEditingController(text: 'Password123!');
  final _serverUrlController = TextEditingController();
  bool _isLoading = false;
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
      // Save custom base URL if changed
      await storage.setBaseUrl(_serverUrlController.text.trim());

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
      final userJson = payload['user'] as Map<String, dynamic>?;

      if (accessToken == null || userJson == null) {
        throw Exception('استجابة غير صحيحة من الخادم');
      }

      await storage.setToken(accessToken);
      final user = AuthUser.fromJson(userJson);
      await storage.setUser(user);
      ref.read(currentUserProvider.notifier).setUser(user);

      // Pre-fetch profiles into cache
      await ref.read(profilesProvider.notifier).fetchProfiles();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('مرحباً بك، ${user.fullName}'),
            backgroundColor: const Color(0xFF0D9488),
          ),
        );
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'فشل تسجيل الدخول: يرجى التحقق من صحة البيانات والاتصال بالخادم';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _showServerSettingsDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إعدادات الخادم'),
        content: TextField(
          controller: _serverUrlController,
          decoration: const InputDecoration(
            labelText: 'عنوان API للخادم',
            hintText: 'http://192.168.1.100:3000/api/v1',
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
        title: const Text('نظام ميكروتيك - نقطة البيع المحمولة'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            tooltip: 'إعدادات الخادم',
            onPressed: _showServerSettingsDialog,
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(28.0),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Logo / Icon
                      CircleAvatar(
                        radius: 36,
                        backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.15),
                        child: Icon(
                          Icons.wifi_tethering,
                          size: 42,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'تسجيل الدخول للكاشير',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'إدارة مبيعات كروت الهوتسبوت دون اتصال',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: Colors.grey,
                        ),
                      ),
                      const SizedBox(height: 24),

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
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'كلمة المرور',
                          prefixIcon: Icon(Icons.lock_outline),
                        ),
                        validator: (val) {
                          if (val == null || val.isEmpty) return 'يرجى إدخال كلمة المرور';
                          return null;
                        },
                      ),
                      const SizedBox(height: 24),

                      ElevatedButton(
                        onPressed: _isLoading ? null : _handleLogin,
                        child: _isLoading
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('دخول إلى نقطة البيع'),
                      ),
                      const SizedBox(height: 16),
                      TextButton.icon(
                        icon: const Icon(Icons.dns, size: 18),
                        label: const Text('تعديل عنوان السيرفر'),
                        onPressed: _showServerSettingsDialog,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
