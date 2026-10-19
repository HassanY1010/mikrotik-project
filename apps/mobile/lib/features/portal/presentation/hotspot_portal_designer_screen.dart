// ignore_for_file: deprecated_member_use
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';

class HotspotPortalDesignerScreen extends ConsumerStatefulWidget {
  const HotspotPortalDesignerScreen({super.key});

  @override
  ConsumerState<HotspotPortalDesignerScreen> createState() => _HotspotPortalDesignerScreenState();
}

class _HotspotPortalDesignerScreenState extends ConsumerState<HotspotPortalDesignerScreen> {
  // Form Controllers
  final _nameController = TextEditingController(text: 'التصميم الافتراضي');
  final _networkNameController = TextEditingController(text: 'شبكة SudaFi الفضائية');
  final _titleController = TextEditingController(text: 'تسجيل الدخول إلى الشبكة');
  final _subtitleController = TextEditingController(text: 'أدخل كود الكرت للاتصال السريع بالإنترنت');
  final _logoUrlController = TextEditingController();
  final _primaryColorController = TextEditingController(text: '#0EA5E9');
  final _accentColorController = TextEditingController(text: '#0284C7');
  final _backgroundColorController = TextEditingController(text: '#0F172A');
  final _cardColorController = TextEditingController(text: '#1E293B');
  final _textColorController = TextEditingController(text: '#F8FAFC');
  final _phoneController = TextEditingController(text: '+249 123 456 789');
  final _termsController = TextEditingController(text: 'الاستخدام مخصص لعملاء الشبكة وفق الشروط');
  final _footerController = TextEditingController(text: 'مدعوم بواسطة منصة SudaFi');
  final _cssController = TextEditingController();

  String _selectedPreset = 'MODERN_DARK';
  String _loginMethod = 'VOUCHER_CODE';
  String? _templateId;
  bool _isSaving = false;
  bool _isLoading = false;

  final Map<String, Map<String, String>> _presets = {
    'MODERN_DARK': {
      'label': 'الوضع الداكن (Modern Dark)',
      'primary': '#0EA5E9',
      'accent': '#0284C7',
      'bg': '#0F172A',
      'card': '#1E293B',
      'text': '#F8FAFC',
      'subtitle': 'أدخل كود الكرت للاتصال السريع بالإنترنت',
    },
    'STARLINK_CYAN': {
      'label': 'سماوي فضائي (Starlink Cyan)',
      'primary': '#06B6D4',
      'accent': '#0891B2',
      'bg': '#082F49',
      'card': '#0C4A6E',
      'text': '#F0FDFA',
      'subtitle': 'إنترنت فائق السرعة عبر Starlink',
    },
    'SUNSET_GOLD': {
      'label': 'الذهبي الدافئ (Sunset Gold)',
      'primary': '#F59E0B',
      'accent': '#D97706',
      'bg': '#1C1917',
      'card': '#292524',
      'text': '#FEF3C7',
      'subtitle': 'أدخل بيانات الحساب لبدء التصفح الفوري',
    },
    'MINIMAL_LIGHT': {
      'label': 'الأبيض الهادئ (Minimal Clean)',
      'primary': '#2563EB',
      'accent': '#10B981',
      'bg': '#F8FAFC',
      'card': '#FFFFFF',
      'text': '#0F172A',
      'subtitle': 'أدخل رقم الكرت لبدء التصفح الفوري',
    },
  };

  @override
  void initState() {
    super.initState();
    _loadInitialTemplate();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _networkNameController.dispose();
    _titleController.dispose();
    _subtitleController.dispose();
    _logoUrlController.dispose();
    _primaryColorController.dispose();
    _accentColorController.dispose();
    _backgroundColorController.dispose();
    _cardColorController.dispose();
    _textColorController.dispose();
    _phoneController.dispose();
    _termsController.dispose();
    _footerController.dispose();
    _cssController.dispose();
    super.dispose();
  }

  Future<void> _loadInitialTemplate() async {
    setState(() => _isLoading = true);
    try {
      final apiClient = ref.read(apiClientProvider);
      final res = await apiClient.get(ApiEndpoints.portalTemplates);
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      if (list is List && list.isNotEmpty) {
        final t = HotspotPortalConfigModel.fromJson(Map<String, dynamic>.from(list.first));
        setState(() {
          _templateId = t.id;
          _nameController.text = t.name;
          _selectedPreset = t.themePreset;
          _networkNameController.text = t.networkName;
          _titleController.text = t.title;
          _subtitleController.text = t.subtitle;
          _logoUrlController.text = t.logoUrl ?? '';
          _primaryColorController.text = t.primaryColor;
          _accentColorController.text = t.accentColor;
          _backgroundColorController.text = t.backgroundColor;
          _cardColorController.text = t.cardColor;
          _textColorController.text = t.textColor;
          _loginMethod = t.loginMethod;
          _phoneController.text = t.contactPhone ?? '';
          _termsController.text = t.termsText ?? '';
          _footerController.text = t.footerText ?? '';
          _cssController.text = t.customCss ?? '';
        });
      }
    } catch (_) {
      // Keep default values
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _applyPreset(String presetKey) {
    final preset = _presets[presetKey];
    if (preset == null) return;
    setState(() {
      _selectedPreset = presetKey;
      _primaryColorController.text = preset['primary']!;
      _accentColorController.text = preset['accent']!;
      _backgroundColorController.text = preset['bg']!;
      _cardColorController.text = preset['card']!;
      _textColorController.text = preset['text']!;
      _subtitleController.text = preset['subtitle']!;
    });
  }

  Color _parseHex(String hex, Color fallback) {
    try {
      final cleaned = hex.replaceAll('#', '').trim();
      if (cleaned.length == 6) {
        return Color(int.parse('FF$cleaned', radix: 16));
      } else if (cleaned.length == 8) {
        return Color(int.parse(cleaned, radix: 16));
      }
    } catch (_) {}
    return fallback;
  }

  Future<void> _handleSaveTemplate() async {
    setState(() => _isSaving = true);
    final apiClient = ref.read(apiClientProvider);

    final payload = {
      'name': _nameController.text.trim(),
      'themePreset': _selectedPreset,
      'networkName': _networkNameController.text.trim(),
      'title': _titleController.text.trim(),
      'subtitle': _subtitleController.text.trim(),
      if (_logoUrlController.text.trim().isNotEmpty) 'logoUrl': _logoUrlController.text.trim(),
      'primaryColor': _primaryColorController.text.trim(),
      'accentColor': _accentColorController.text.trim(),
      'backgroundColor': _backgroundColorController.text.trim(),
      'cardColor': _cardColorController.text.trim(),
      'textColor': _textColorController.text.trim(),
      'loginMethod': _loginMethod,
      if (_phoneController.text.trim().isNotEmpty) 'contactPhone': _phoneController.text.trim(),
      if (_termsController.text.trim().isNotEmpty) 'termsText': _termsController.text.trim(),
      if (_footerController.text.trim().isNotEmpty) 'footerText': _footerController.text.trim(),
      if (_cssController.text.trim().isNotEmpty) 'customCss': _cssController.text.trim(),
      'isDefault': true,
    };

    try {
      if (_templateId != null) {
        await apiClient.patch('${ApiEndpoints.portalTemplates}/$_templateId', data: payload);
      } else {
        final res = await apiClient.post(ApiEndpoints.portalTemplates, data: payload);
        final raw = res.data;
        final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
        if (data is Map && data['id'] != null) {
          _templateId = data['id'].toString();
        }
      }
      ref.invalidate(portalTemplatesProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تم حفظ تصميم صفحة تسجيل الدخول بنجاح!'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('فشل في حفظ التصميم: $e'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _showLivePreview() {
    final bgColor = _parseHex(_backgroundColorController.text, const Color(0xFF0F172A));
    final cardColor = _parseHex(_cardColorController.text, const Color(0xFF1E293B));
    final primaryColor = _parseHex(_primaryColorController.text, const Color(0xFF0EA5E9));
    final textColor = _parseHex(_textColorController.text, const Color(0xFFF8FAFC));

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        contentPadding: const EdgeInsets.all(16),
        title: Row(
          children: [
            const Icon(Icons.preview_rounded, color: Color(0xFF38BDF8), size: 22),
            const SizedBox(width: 8),
            Text('معاينة حية لصفحة الدخول', style: TextStyle(color: ctx.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
            const Spacer(),
            IconButton(
              icon: Icon(Icons.close, color: ctx.textSecondary),
              onPressed: () => Navigator.pop(ctx),
            ),
          ],
        ),
        content: Container(
          width: 320,
          constraints: const BoxConstraints(maxHeight: 520),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(0.1)),
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Network Name Badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: primaryColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.wifi, size: 14, color: primaryColor),
                      const SizedBox(width: 6),
                      Text(
                        _networkNameController.text,
                        style: TextStyle(color: primaryColor, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Card Container
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: cardColor,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.25),
                        blurRadius: 16,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      if (_logoUrlController.text.trim().isNotEmpty) ...[
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            _logoUrlController.text.trim(),
                            width: 60,
                            height: 60,
                            errorBuilder: (context, error, stackTrace) => const Icon(Icons.image_not_supported, size: 40, color: Colors.grey),
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      Text(
                        _titleController.text,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _subtitleController.text,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: textColor.withOpacity(0.7), fontSize: 12),
                      ),
                      const SizedBox(height: 16),

                      // Input Fields
                      if (_loginMethod == 'VOUCHER_CODE') ...[
                        TextField(
                          enabled: false,
                          decoration: InputDecoration(
                            hintText: 'أدخل كود الكرت (مثال: 78945612)',
                            hintStyle: TextStyle(color: textColor.withOpacity(0.4), fontSize: 13),
                            prefixIcon: Icon(Icons.credit_card, color: primaryColor, size: 18),
                            filled: true,
                            fillColor: Colors.black.withOpacity(0.2),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                          ),
                        ),
                      ] else ...[
                        TextField(
                          enabled: false,
                          decoration: InputDecoration(
                            hintText: 'اسم المستخدم',
                            hintStyle: TextStyle(color: textColor.withOpacity(0.4), fontSize: 13),
                            prefixIcon: Icon(Icons.person, color: primaryColor, size: 18),
                            filled: true,
                            fillColor: Colors.black.withOpacity(0.2),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          enabled: false,
                          decoration: InputDecoration(
                            hintText: 'كلمة المرور',
                            hintStyle: TextStyle(color: textColor.withOpacity(0.4), fontSize: 13),
                            prefixIcon: Icon(Icons.lock, color: primaryColor, size: 18),
                            filled: true,
                            fillColor: Colors.black.withOpacity(0.2),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                          ),
                        ),
                      ],
                      const SizedBox(height: 14),

                      // Submit Button
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 11),
                        decoration: BoxDecoration(
                          color: primaryColor,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        alignment: Alignment.center,
                        child: const Text(
                          'تسجيل الدخول والاتصال',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ),

                      if (_phoneController.text.isNotEmpty || _termsController.text.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        Divider(color: Colors.white.withOpacity(0.1)),
                        if (_phoneController.text.isNotEmpty)
                          Text('خدمة العملاء: ${_phoneController.text}', style: TextStyle(color: textColor.withOpacity(0.6), fontSize: 11)),
                        if (_termsController.text.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(_termsController.text, textAlign: TextAlign.center, style: TextStyle(color: textColor.withOpacity(0.5), fontSize: 10)),
                          ),
                      ],
                    ],
                  ),
                ),

                if (_footerController.text.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(_footerController.text, style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showPublishDialog() {
    final routersAsync = ref.read(routersProvider);
    final routers = routersAsync.value ?? [];

    if (routers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('لا توجد راوترات مضافة لنشر التصميم عليها')),
      );
      return;
    }

    String selectedDeviceId = routers.first.id;
    final dirController = TextEditingController(text: 'hotspot');
    final profileController = TextEditingController(text: 'hsprof1');
    String? currentCommandId;
    String commandStatus = 'IDLE';
    String? commandError;
    Timer? pollTimer;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) {
          void stopPolling() {
            pollTimer?.cancel();
            pollTimer = null;
          }

          void startPolling(String cmdId) {
            int attempts = 0;
            pollTimer = Timer.periodic(const Duration(seconds: 2), (t) async {
              attempts++;
              try {
                final apiClient = ref.read(apiClientProvider);
                final res = await apiClient.get(ApiEndpoints.agentCommandStatus(cmdId));
                final raw = res.data;
                final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
                if (data is Map) {
                  final status = data['status']?.toString() ?? 'PENDING';
                  final err = data['errorMessage']?.toString();
                  setDialogState(() {
                    commandStatus = status;
                    commandError = err;
                  });

                  if (status == 'COMPLETED' || status == 'FAILED' || status == 'EXPIRED') {
                    stopPolling();
                  }
                }
              } catch (_) {}

              if (attempts >= 15) {
                stopPolling();
                if (commandStatus == 'PENDING' || commandStatus == 'DISPATCHED') {
                  setDialogState(() {
                    commandStatus = 'TIMEOUT';
                    commandError = 'استغرق التنفيذ وقتاً أطول من المتوقع، يرجى مراجعة حالة الوكيل';
                  });
                }
              }
            });
          }

          Future<void> doPublish() async {
            setDialogState(() {
              commandStatus = 'DISPATCHING';
              commandError = null;
            });

            try {
              // 1. Save template first
              await _handleSaveTemplate();

              // 2. Dispatch publish command to API
              final apiClient = ref.read(apiClientProvider);
              final res = await apiClient.post(
                ApiEndpoints.portalPublish(selectedDeviceId),
                data: {
                  if (_templateId != null) 'templateId': _templateId,
                  'directoryName': dirController.text.trim().isEmpty ? 'hotspot' : dirController.text.trim(),
                  if (profileController.text.trim().isNotEmpty) 'applyToProfile': profileController.text.trim(),
                },
              );

              final raw = res.data;
              final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
              final cmdId = data['queuedCommandId']?.toString() ?? data['operationId']?.toString();

              if (cmdId != null) {
                setDialogState(() {
                  currentCommandId = cmdId;
                  commandStatus = 'DISPATCHED';
                });
                startPolling(cmdId);
              } else {
                setDialogState(() {
                  commandStatus = 'FAILED';
                  commandError = 'لم يتم استلام معرف الأمر من الخادم';
                });
              }
            } catch (e) {
              setDialogState(() {
                commandStatus = 'FAILED';
                commandError = e.toString();
              });
            }
          }

          Color getStatusColor() {
            switch (commandStatus) {
              case 'COMPLETED':
                return const Color(0xFF10B981);
              case 'FAILED':
              case 'TIMEOUT':
                return const Color(0xFFEF4444);
              case 'DISPATCHING':
              case 'DISPATCHED':
              case 'PENDING':
                return const Color(0xFFF59E0B);
              default:
                return const Color(0xFF94A3B8);
            }
          }

          String getStatusText() {
            switch (commandStatus) {
              case 'IDLE':
                return 'جاهز للنشر';
              case 'DISPATCHING':
                return 'جاري إرسال الأمر إلى المنظومة...';
              case 'DISPATCHED':
              case 'PENDING':
                return 'في طابور وكيل LAN (بانتظار تنفيذ الراوتر)...';
              case 'COMPLETED':
                return 'تم النشر وتثبيت الصفحة بنجاح على الراوتر!';
              case 'FAILED':
                return 'فشل النشر على الراوتر';
              case 'TIMEOUT':
                return 'انتهت مهلة المتابعة';
              default:
                return commandStatus;
            }
          }

          return AlertDialog(
            backgroundColor: context.bgCard,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: context.borderColor),
            ),
            title: Row(
              children: [
                const Icon(Icons.router_rounded, color: Color(0xFF0EA5E9)),
                const SizedBox(width: 8),
                Text('نشر التصميم إلى راوتر ميكروتك', style: TextStyle(color: context.textPrimary, fontSize: 16)),
              ],
            ),
            content: SizedBox(
              width: 320,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('اختر الراوتر المستهدف:', style: TextStyle(color: context.textSecondary, fontSize: 12)),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: selectedDeviceId,
                      dropdownColor: context.bgCard,
                      style: TextStyle(color: context.textPrimary, fontSize: 13),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: context.bgScaffold,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                      items: routers.map((r) {
                        return DropdownMenuItem(
                          value: r.id,
                          child: Text('${r.name} (${r.host})', overflow: TextOverflow.ellipsis),
                        );
                      }).toList(),
                      onChanged: commandStatus == 'DISPATCHING' || commandStatus == 'DISPATCHED'
                          ? null
                          : (val) {
                              if (val != null) setDialogState(() => selectedDeviceId = val);
                            },
                    ),
                    const SizedBox(height: 12),

                    Text('مجلد الراوتر (html-directory):', style: TextStyle(color: context.textSecondary, fontSize: 12)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: dirController,
                      style: TextStyle(color: context.textPrimary, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: 'hotspot',
                        hintStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                        filled: true,
                        fillColor: context.bgScaffold,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                    ),
                    const SizedBox(height: 12),

                    Text('بروفايل الهوتسبوت لتطبيق الصفحة عليه:', style: TextStyle(color: context.textSecondary, fontSize: 12)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: profileController,
                      style: TextStyle(color: context.textPrimary, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: 'hsprof1',
                        hintStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                        filled: true,
                        fillColor: context.bgScaffold,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: context.borderColor),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Real Status Monitor
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: context.bgCardAlt,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: getStatusColor().withOpacity(0.3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(color: getStatusColor(), shape: BoxShape.circle),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  getStatusText(),
                                  style: TextStyle(color: getStatusColor(), fontSize: 12, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ),
                          if (currentCommandId != null) ...[
                            const SizedBox(height: 4),
                            Text('معرف الأمر: $currentCommandId', style: TextStyle(color: context.textSecondary, fontSize: 10)),
                          ],
                          if (commandError != null) ...[
                            const SizedBox(height: 6),
                            Text('الخطأ: $commandError', style: const TextStyle(color: Color(0xFFEF4444), fontSize: 11)),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  stopPolling();
                  Navigator.pop(ctx);
                },
                child: Text('إغلاق', style: TextStyle(color: context.textSecondary)),
              ),
              ElevatedButton.icon(
                onPressed: (commandStatus == 'DISPATCHING' || commandStatus == 'DISPATCHED' || commandStatus == 'PENDING')
                    ? null
                    : doPublish,
                icon: const Icon(Icons.cloud_upload_rounded, size: 16),
                label: const Text('نشر إلى الراوتر الآن'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0EA5E9),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: Text('مصمم صفحات HotSpot', style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 17)),
        actions: [
          IconButton(
            icon: const Icon(Icons.remove_red_eye_outlined),
            tooltip: 'معاينة حية',
            onPressed: _showLivePreview,
          ),
          IconButton(
            icon: _isSaving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.save_rounded),
            tooltip: 'حفظ التصميم',
            onPressed: _isSaving ? null : _handleSaveTemplate,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Action Banner
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF0284C7), Color(0xFF0EA5E9)],
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.palette_rounded, color: Colors.white, size: 32),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('تخصيص صفحة الدخول للعملاء', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                              Text('صمم الهوية البصرية وانشرها مباشرة للراوتر عبر وكيل LAN', style: TextStyle(color: Colors.white70, fontSize: 11)),
                            ],
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: _showPublishDialog,
                          icon: const Icon(Icons.send_rounded, size: 14),
                          label: const Text('نشر للراوتر'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: context.isDarkMode ? const Color(0xFF0F172A) : const Color(0xFF0284C7),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Presets Section
                  _buildSectionTitle('القوالب الجاهزة (Theme Presets)'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _presets.entries.map((e) {
                      final isSelected = _selectedPreset == e.key;
                      return ChoiceChip(
                        label: Text(e.value['label']!),
                        selected: isSelected,
                        onSelected: (_) => _applyPreset(e.key),
                        selectedColor: const Color(0xFF0EA5E9),
                        backgroundColor: context.bgCard,
                        labelStyle: TextStyle(
                          color: isSelected ? Colors.white : context.textSecondary,
                          fontSize: 12,
                          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 18),

                  // Basic Branding Section
                  _buildSectionTitle('الهوية والنصوص الأساسية'),
                  const SizedBox(height: 8),
                  _buildTextField(_nameController, 'اسم التصميم الداخلي', 'التصميم الافتراضي'),
                  _buildTextField(_networkNameController, 'اسم الشبكة (SSID)', 'شبكة SudaFi الفضائية'),
                  _buildTextField(_titleController, 'عنوان الترحيب الرئيسي', 'تسجيل الدخول إلى الشبكة'),
                  _buildTextField(_subtitleController, 'النص الفرعي / الإرشادي', 'أدخل كود الكرت للاتصال'),
                  _buildTextField(_logoUrlController, 'رابط الشعار (Logo URL)', 'https://example.com/logo.png'),
                  const SizedBox(height: 18),

                  // Colors Section
                  _buildSectionTitle('الألوان والمظهر البصري (Hex Colors)'),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: _buildTextField(_primaryColorController, 'اللون الأساسي', '#0EA5E9')),
                      const SizedBox(width: 8),
                      Expanded(child: _buildTextField(_accentColorController, 'اللون الثانوي', '#0284C7')),
                    ],
                  ),
                  Row(
                    children: [
                      Expanded(child: _buildTextField(_backgroundColorController, 'لون الخلفية', '#0F172A')),
                      const SizedBox(width: 8),
                      Expanded(child: _buildTextField(_cardColorController, 'لون البطاقة', '#1E293B')),
                    ],
                  ),
                  _buildTextField(_textColorController, 'لون النصوص', '#F8FAFC'),
                  const SizedBox(height: 18),

                  // Login Mode Section
                  _buildSectionTitle('طريقة تسجيل دخول العميل'),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: context.bgCard,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: context.borderColor),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _loginMethod,
                        isExpanded: true,
                        dropdownColor: context.bgCard,
                        style: TextStyle(color: context.textPrimary, fontSize: 13),
                        items: const [
                          DropdownMenuItem(
                            value: 'VOUCHER_CODE',
                            child: Text('كود الكرت فقط (حقل رقم الكرت السريع)'),
                          ),
                          DropdownMenuItem(
                            value: 'USERNAME_PASSWORD',
                            child: Text('اسم مستخدم وكلمة مرور (لحسابات Hotspot المزدوجة)'),
                          ),
                        ],
                        onChanged: (val) {
                          if (val != null) setState(() => _loginMethod = val);
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Support & Footer Section
                  _buildSectionTitle('بيانات الدعم وشروط الاستخدام'),
                  const SizedBox(height: 8),
                  _buildTextField(_phoneController, 'رقم هاتف الدعم الفني', '+249 123 456 789'),
                  _buildTextField(_termsController, 'نص الشروط والأحكام', 'الاستخدام مخصص لعملاء الشبكة'),
                  _buildTextField(_footerController, 'النص السفلي (Footer)', 'مدعوم بواسطة منصة SudaFi'),
                  _buildTextField(_cssController, 'تخصيص CSS إضافي (متقدم)', 'body { font-size: 14px; }', maxLines: 3),
                  const SizedBox(height: 24),

                  // Bottom Action Buttons
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _showLivePreview,
                          icon: const Icon(Icons.remove_red_eye_outlined),
                          label: const Text('معاينة حية'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF38BDF8),
                            side: const BorderSide(color: Color(0xFF38BDF8)),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: _isSaving ? null : _handleSaveTemplate,
                          icon: _isSaving
                              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.save_rounded),
                          label: const Text('حفظ التصميم'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF0EA5E9),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: TextStyle(
        color: context.textSecondary,
        fontSize: 13,
        fontWeight: FontWeight.bold,
      ),
    );
  }

  Widget _buildTextField(TextEditingController controller, String label, String placeholder, {int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: context.textPrimary, fontSize: 12)),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            maxLines: maxLines,
            style: TextStyle(color: context.textPrimary, fontSize: 13),
            decoration: InputDecoration(
              hintText: placeholder,
              hintStyle: TextStyle(color: context.textSecondary, fontSize: 13),
              filled: true,
              fillColor: context.bgCard,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: context.borderColor),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: context.borderColor),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: Color(0xFF0EA5E9)),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
        ],
      ),
    );
  }
}
