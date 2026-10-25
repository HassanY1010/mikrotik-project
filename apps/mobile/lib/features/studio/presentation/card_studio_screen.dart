import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/services/card_pdf_generator_service.dart';
import '../../../core/theme/app_theme.dart';
import 'card_templates_screen.dart';
import '../../../core/widgets/whatsapp_button.dart';
import '../../../core/utils/whatsapp_helper.dart';
import '../../../core/utils/validity_helper.dart';
import '../../hotspot_profiles/presentation/create_hotspot_profile_screen.dart';

class CardStudioScreen extends ConsumerStatefulWidget {
  final VoidCallback? onBatchCreated;

  const CardStudioScreen({super.key, this.onBatchCreated});

  @override
  ConsumerState<CardStudioScreen> createState() => _CardStudioScreenState();
}

class _CardStudioScreenState extends ConsumerState<CardStudioScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // 1. Generation & Quantity Settings
  int _selectedQuantity = 50;
  final List<int> _quantityOptions = [10, 50, 100, 250, 500, 1000];
  String? _selectedProfileId;
  final TextEditingController _prefixController = TextEditingController(text: '');
  int _usernameLength = 8;
  String _usernamePattern = 'NUMERIC'; // NUMERIC, ALPHANUMERIC, ALPHABETIC, HEX

  // Credential Mode: 0 = PIN موحد (User=Pass), 1 = User + Pass منفصلين, 2 = بدون كلمة مرور (User only)
  int _credentialMode = 0;
  int _passwordLength = 4;
  String _passwordPattern = 'NUMERIC'; // NUMERIC, ALPHANUMERIC, ALPHABETIC
  bool _enableSerialNumbers = true;

  // 2. Multi-Constraint Limits & Validity Settings
  bool _limitUptimeEnabled = false;
  int _limitUptimeValue = 4;
  String _limitUptimeUnit = 'h'; // m, h, d

  bool _limitDataQuotaEnabled = false;
  int _limitDataQuotaValue = 2;
  String _limitDataQuotaUnit = 'GB'; // GB, MB

  bool _validityDaysEnabled = false;
  int _validityDaysValue = 30;

  // 3. Design Studio & Template Settings
  final String _selectedThemePreset = 'FOOTBALL';
  CardTemplateModel? _selectedCustomTemplate;
  final TextEditingController _networkNameController = TextEditingController(text: 'سودافاي | SudaFi Net');
  final TextEditingController _headerTitleController = TextEditingController(text: 'كرت إنترنت فائق السرعة');
  final TextEditingController _instructionsController = TextEditingController(text: 'امسح رمز QR أو أدخل الرمز للدخول');
  final TextEditingController _supportPhoneController = TextEditingController(text: '');

  Uint8List? _pickedImageBytes;
  String? _pickedImageBase64;
  int _cardWidthMm = 85;
  int _cardHeightMm = 54;

  bool _showQr = true;
  bool _showPrice = true;
  bool _showSpeed = true;
  bool _showValidity = true;
  bool _showQuota = true;
  bool _showSerial = true;

  Color? _customPrimaryColor;
  Color? _customAccentColor;

  // 4. Printing layout
  CardPdfLayout _selectedPrintLayout = CardPdfLayout.a4Grid10;

  bool _isGenerating = false;

  final Map<String, _ThemeConfig> _themes = {
    'FOOTBALL': _ThemeConfig('ثيم كرة القدم الذهبي', const Color(0xFF065F46), const Color(0xFFF59E0B), Icons.sports_soccer),
    'EID_MUBARAK': _ThemeConfig('عيد مبارك الملكي', const Color(0xFF1E3A8A), const Color(0xFFD97706), Icons.nights_stay),
    'TURQUOISE': _ThemeConfig('الفيروزي الحديث', const Color(0xFF0F766E), const Color(0xFF06B6D4), Icons.wifi),
    'TICKET': _ThemeConfig('تذكرة كلاسيكية', const Color(0xFF4338CA), const Color(0xFFEC4899), Icons.confirmation_number),
    'COMPACT': _ThemeConfig('مدمج أنيق', const Color(0xFF334155), const Color(0xFF64748B), Icons.grid_view),
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _prefixController.dispose();
    _networkNameController.dispose();
    _headerTitleController.dispose();
    _instructionsController.dispose();
    _supportPhoneController.dispose();
    super.dispose();
  }

  void _loadData() {
    ref.read(profilesProvider.notifier).fetchProfiles();
    ref.read(cardTemplatesProvider.notifier).refresh();
    ref.invalidate(routersProvider);
  }

  Future<void> _handleAddNewProfile() async {
    final currentUser = ref.read(currentUserProvider);
    final role = currentUser?.role.toUpperCase() ?? '';
    final isAllowed = role == 'SUPER_ADMIN' ||
        role == 'OWNER' ||
        role == 'TENANT_ADMIN' ||
        role == 'ADMIN' ||
        role == 'MANAGER';
    if (!isAllowed && role.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('عذراً، صلاحيات حسابك الحالية لا تسمح بإنشاء باقات جديدة. يرجى التواصل مع مسؤول النظام.'),
          backgroundColor: Color(0xFFDC2626),
        ),
      );
      return;
    }

    final routers = ref.read(routersProvider).asData?.value ?? [];
    final selectedRouterId = ref.read(selectedRouterIdProvider) ?? (routers.isNotEmpty ? routers.first.id : null);

    final createdResult = await Navigator.push<dynamic>(
      context,
      MaterialPageRoute(
        builder: (_) => CreateHotspotProfileScreen(
          initialDeviceId: selectedRouterId,
        ),
      ),
    );

    if (createdResult != null && createdResult != false) {
      await ref.read(profilesProvider.notifier).fetchProfiles();
      final updatedProfiles = ref.read(profilesProvider);

      if (mounted) {
        if (createdResult is String && updatedProfiles.any((p) => p.id == createdResult)) {
          setState(() {
            _selectedProfileId = createdResult;
          });
        } else if (updatedProfiles.isNotEmpty) {
          setState(() {
            _selectedProfileId = updatedProfiles.first.id;
          });
        }
      }
    }
  }

  void _handleCustomQuantity() async {
    final controller = TextEditingController(text: _selectedQuantity.toString());
    final result = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('تحديد كمية مخصصة', style: TextStyle(color: context.textPrimary, fontSize: 16)),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          autofocus: true,
          style: TextStyle(color: context.textPrimary, fontSize: 16),
          decoration: InputDecoration(
            hintText: 'أدخل عدد الكروت (1 - 5000)',
            hintStyle: TextStyle(color: context.textMuted),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () {
              final val = int.tryParse(controller.text.trim());
              if (val != null && val > 0 && val <= 5000) {
                Navigator.pop(ctx, val);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('الرجاء إدخال رقم صحيح بين 1 و 5000')),
                );
              }
            },
            child: const Text('تأكيد'),
          ),
        ],
      ),
    );

    if (result != null) {
      setState(() => _selectedQuantity = result);
    }
  }

  Future<void> _pickBackgroundImageFromPhone() async {
    try {
      final res = await FilePicker.pickFiles(
        type: FileType.image,
        withData: true,
      );
      if (res != null && res.files.isNotEmpty) {
        final file = res.files.first;
        Uint8List? bytes = file.bytes;
        if (bytes == null && file.path != null) {
          bytes = await File(file.path!).readAsBytes();
        }
        if (bytes != null) {
          final b64 = base64Encode(bytes);
          setState(() {
            _pickedImageBytes = bytes;
            _pickedImageBase64 = b64;
          });
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('تم تحميل صورة الخلفية بنجاح وتطبيقها على المعاينة والطباعة! 🎨'),
                backgroundColor: Color(0xFF10B981),
              ),
            );
          }
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر تحميل الصورة: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _removeBackgroundImage() {
    setState(() {
      _pickedImageBytes = null;
      _pickedImageBase64 = null;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('تمت إزالة صورة الخلفية المخصصة')),
    );
  }

  Future<void> _saveCurrentDesignAsTemplate() async {
    final nameCtrl = TextEditingController(text: 'قالب كروت ${_selectedThemePreset}_${DateTime.now().minute}');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('حفظ التصميم كقالب جديد', style: TextStyle(color: context.textPrimary, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              autofocus: true,
              style: TextStyle(color: context.textPrimary),
              decoration: const InputDecoration(labelText: 'اسم القالب'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حفظ')),
        ],
      ),
    );

    if (confirmed == true && nameCtrl.text.trim().isNotEmpty) {
      final currentTheme = _themes[_selectedThemePreset] ?? _themes['FOOTBALL']!;
      final primaryHex = _customPrimaryColor != null
          ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
          : '#${currentTheme.primaryColor.toARGB32().toRadixString(16).substring(2)}';
      final accentHex = _customAccentColor != null
          ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
          : '#${currentTheme.accentColor.toARGB32().toRadixString(16).substring(2)}';

      final newTpl = CardTemplateModel(
        id: '',
        name: nameCtrl.text.trim(),
        widthMm: _cardWidthMm,
        heightMm: _cardHeightMm,
        themePreset: _selectedThemePreset,
        primaryColor: primaryHex,
        accentColor: accentHex,
        layoutConfig: {
          'networkName': _networkNameController.text.trim(),
          'headerTitle': _headerTitleController.text.trim(),
          'instructions': _instructionsController.text.trim(),
          'supportPhone': _supportPhoneController.text.trim(),
          'showQr': _showQr,
          'showPrice': _showPrice,
          'showSpeed': _showSpeed,
          'showValidity': _showValidity,
          'showQuota': _showQuota,
          'showPin': true,
          if (_pickedImageBase64 != null) 'backgroundImageBase64': _pickedImageBase64,
        },
      );

      final res = await ref.read(cardTemplatesProvider.notifier).createTemplate(newTpl);
      if (mounted) {
        if (res['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('تم حفظ قالب الكروت الجديد بنجاح!'), backgroundColor: Color(0xFF10B981)),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(res['message']?.toString() ?? 'فشل حفظ القالب'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }

  void _showPreGenerationConfirmationSheet(List<HotspotProfileModel> profiles, List<RouterDeviceModel> routers) {
    if (profiles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('الرجاء الانتظار حتى تحميل الباقات أو إنشاء باقة أولاً')),
      );
      return;
    }

    final selectedProfile = profiles.firstWhere(
      (p) => p.id == _selectedProfileId,
      orElse: () => profiles.first,
    );

    final selectedRouterId = ref.read(selectedRouterIdProvider) ??
        (routers.isNotEmpty ? routers.first.id : null);
    final selectedRouter = routers.firstWhere(
      (r) => r.id == selectedRouterId,
      orElse: () => RouterDeviceModel(id: '', name: 'غير محدد', host: '', isOnline: false),
    );

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.bgCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF2563EB).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.verified_outlined, color: Color(0xFF38BDF8), size: 22),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'مراجعة وتأكيد إعدادات الدفعة',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: context.textPrimary,
                          ),
                        ),
                        const Text(
                          'تأكد من مطابقة المعايير قبل التوليد والتطبيق على الراوتر',
                          style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: Column(
                  children: [
                    _buildReviewRow('الراوتر المستهدف', selectedRouter.name, icon: Icons.router),
                    _buildReviewRow('باقة الهوتسبوت', selectedProfile.displayName ?? selectedProfile.name, icon: Icons.wifi),
                    _buildReviewRow('الكمية الإجمالية', '$_selectedQuantity كرت', highlight: true),
                    _buildReviewRow('السعر الإجمالي', '${(_selectedQuantity * selectedProfile.price).toStringAsFixed(0)} SDG', highlight: true),
                    const Divider(color: Color(0xFF334155), height: 16),
                    _buildReviewRow(
                      'نمط الحسابات',
                      _credentialMode == 0
                          ? 'PIN موحد (User=Pass)'
                          : (_credentialMode == 2 ? 'اسم مستخدم فقط (بدون باسورد)' : 'اسم وكلمة مرور منفصلين'),
                    ),
                    _buildReviewRow(
                      'صيغة اسم المستخدم',
                      'طول: $_usernameLength • نوع: $_usernamePattern${_prefixController.text.trim().isNotEmpty ? " • بادئة: ${_prefixController.text.trim()}" : ""}',
                    ),
                    if (_credentialMode == 1)
                      _buildReviewRow(
                        'صيغة كلمة المرور',
                        'طول: $_passwordLength • نوع: $_passwordPattern',
                      ),
                    const Divider(color: Color(0xFF334155), height: 16),
                    _buildReviewRow(
                      'مدة الاتصال (Session/Uptime)',
                      _limitUptimeEnabled ? '$_limitUptimeValue ${_limitUptimeUnit == "h" ? "ساعات" : (_limitUptimeUnit == "m" ? "دقائق" : "أيام")}' : 'وفق باقة الراوتر (${selectedProfile.sessionTimeout ?? "افتراضي"})',
                    ),
                    _buildReviewRow(
                      'حد استهلاك البيانات',
                      _limitDataQuotaEnabled ? '$_limitDataQuotaValue $_limitDataQuotaUnit' : 'وفق الباقة (${selectedProfile.formattedDataLimit})',
                    ),
                    _buildReviewRow(
                      'صلاحية الحساب',
                      _validityDaysEnabled ? '$_validityDaysValue يوم' : 'وفق الباقة (${formatValidityArabic(selectedProfile.validity)})',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _isGenerating
                    ? null
                    : () {
                        Navigator.pop(ctx);
                        _handleGenerateBatch(profiles, routers);
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(Icons.bolt, color: Colors.white),
                label: const Text(
                  'تأكيد وتوليد الدفعة الآن',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReviewRow(String title, String value, {bool highlight = false, IconData? icon}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: const Color(0xFF94A3B8)),
                const SizedBox(width: 6),
              ],
              Text(title, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
            ],
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                color: highlight ? const Color(0xFF38BDF8) : Colors.white,
                fontWeight: highlight ? FontWeight.bold : FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _handleGenerateBatch(List<HotspotProfileModel> profiles, List<RouterDeviceModel> routers) async {
    if (_isGenerating) return;

    var quota = ref.read(tenantQuotaProvider).asData?.value;
    if (quota == null) {
      try {
        quota = await ref.read(tenantQuotaProvider.notifier).fetchFresh();
      } catch (_) {}
    }
    if (!mounted) return;
    final user = ref.read(currentUserProvider);
    final isSuperAdmin = user?.role.toUpperCase() == 'SUPER_ADMIN';
    final status = quota?.status ?? user?.subscriptionStatus ?? 'NONE';
    if (!isSuperAdmin && status != 'ACTIVE' && status != 'TRIAL' && user?.subscriptionPlan == null) {
      final isExpired = status == 'EXPIRED';
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: const [
              Icon(Icons.lock_outline_rounded, color: Color(0xFFF59E0B), size: 24),
              SizedBox(width: 8),
              Text(
                'تفعيل الاشتراك مطلوب',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: Text(
            isExpired
                ? 'انتهت صلاحية باقة هذه الشبكة. يرجى تجديد الاشتراك مع إدارة المنصة لتتمكن من استئناف توليد وطباعة الكروت.'
                : 'حساب هذه الشبكة غير مرتبط بباقة نشطة حالياً. يرجى التواصل مع إدارة المنصة (Super Admin) لتفعيل باقة الاشتراك وتحديد حصص الكروت.',
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13, height: 1.4),
          ),
          actionsPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          actions: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                WhatsAppButton(
                  type: WhatsAppActionType.subscription,
                  label: isExpired ? 'تجديد الاشتراك عبر واتساب' : 'طلب تفعيل الاشتراك عبر واتساب',
                  planName: quota?.planNameAr ?? quota?.planName,
                  featureName: 'توليد كروت الهوتسبوت',
                  fontSize: 12,
                  showPhonePill: true,
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
                ),
              ],
            ),
          ],
        ),
      );
      return;
    }

    if (profiles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('الرجاء الانتظار حتى تحميل الباقات أو إنشاء باقة أولاً')),
      );
      return;
    }

    final selectedProfile = profiles.firstWhere(
      (p) => p.id == _selectedProfileId,
      orElse: () => profiles.first,
    );

    final selectedRouterId = ref.read(selectedRouterIdProvider) ??
        (routers.isNotEmpty ? routers.first.id : null);

    setState(() => _isGenerating = true);
    final apiClient = ref.read(apiClientProvider);

    try {
      final payload = <String, dynamic>{
        'profileId': selectedProfile.id,
        'quantity': _selectedQuantity,
        'totalCards': _selectedQuantity,
        'themePreset': _selectedThemePreset,
        'length': _usernameLength,
        'pattern': _usernamePattern,
      };

      if (_prefixController.text.trim().isNotEmpty) {
        payload['prefix'] = _prefixController.text.trim();
      }

      if (_credentialMode == 0) {
        payload['singleCredential'] = true;
        payload['singleUserPin'] = true;
      } else if (_credentialMode == 2) {
        payload['singleCredential'] = false;
        payload['passwordPattern'] = 'NONE';
      } else {
        payload['singleCredential'] = false;
        payload['passwordLength'] = _passwordLength;
        payload['passwordPattern'] = _passwordPattern;
      }

      if (_limitUptimeEnabled) {
        payload['timeLimit'] = '$_limitUptimeValue$_limitUptimeUnit';
      }

      if (_limitDataQuotaEnabled) {
        final mb = _limitDataQuotaUnit == 'GB' ? _limitDataQuotaValue * 1024 : _limitDataQuotaValue;
        payload['dataLimitMb'] = mb;
      }

      if (_validityDaysEnabled) {
        payload['validityDays'] = _validityDaysValue;
      }

      if (_selectedCustomTemplate != null && _selectedCustomTemplate!.id.trim().isNotEmpty) {
        payload['templateId'] = _selectedCustomTemplate!.id.trim();
      }

      if (selectedRouterId != null) {
        payload['deviceId'] = selectedRouterId;
      }

      final res = await apiClient.post(ApiEndpoints.cardBatches, data: payload);

      setState(() => _isGenerating = false);

      if (mounted) {
        final data = res.data;
        final responseData = (data is Map && data['data'] != null)
            ? data['data']
            : (data is Map ? data : <String, dynamic>{});

        final batchObj = (responseData is Map && responseData['batch'] != null)
            ? responseData['batch']
            : responseData;

        final batchId = (batchObj is Map && batchObj['batchNumber'] != null)
            ? batchObj['batchNumber'].toString()
            : (batchObj is Map && batchObj['id'] != null)
                ? batchObj['id'].toString()
                : 'BATCH-${DateTime.now().millisecondsSinceEpoch}';

        final bool syncedToRouter = (responseData is Map && responseData['syncedToRouter'] == true) ||
            (batchObj is Map && batchObj['syncedToRouter'] == true);
        final String routerSyncStatus = (responseData is Map && responseData['routerSyncStatus'] != null)
            ? responseData['routerSyncStatus'].toString()
            : (batchObj is Map && batchObj['routerSyncStatus'] != null
                ? batchObj['routerSyncStatus'].toString()
                : (syncedToRouter ? 'SYNCED' : 'PENDING_OFFLINE'));
        final int syncedCount = (responseData is Map && responseData['syncedCount'] != null)
            ? int.tryParse(responseData['syncedCount'].toString()) ?? 0
            : (batchObj is Map && batchObj['syncedCount'] != null
                ? int.tryParse(batchObj['syncedCount'].toString()) ?? 0
                : (syncedToRouter ? _selectedQuantity : 0));
        final int failedCount = (responseData is Map && responseData['failedCount'] != null)
            ? int.tryParse(responseData['failedCount'].toString()) ?? 0
            : (batchObj is Map && batchObj['failedCount'] != null
                ? int.tryParse(batchObj['failedCount'].toString()) ?? 0
                : 0);
        final String? routerError = responseData is Map
            ? (responseData['syncError']?.toString() ?? responseData['routerError']?.toString())
            : (batchObj is Map ? batchObj['syncError']?.toString() : null);

        // Parse real cards returned from database
        final List<OfflineCardModel> generatedCards = [];
        if (responseData is Map && responseData['cards'] is List) {
          for (final c in responseData['cards'] as List) {
            if (c is Map<String, dynamic>) {
              generatedCards.add(OfflineCardModel.fromJson(c));
            }
          }
        }

        // Store generated cards locally so Cards Store and POS instantly reflect them
        if (generatedCards.isNotEmpty) {
          await ref.read(localStorageProvider).addOfflineCards(generatedCards);
          ref.read(offlineCardsProvider.notifier).refresh();
        }

        // Invalidate quota provider so remaining quota dynamically updates
        ref.invalidate(tenantQuotaProvider);

        _showBatchSuccessAndManagementDialog(
          batchId: batchId,
          profile: selectedProfile,
          quantity: generatedCards.isNotEmpty ? generatedCards.length : _selectedQuantity,
          cards: generatedCards,
          syncedToRouter: syncedToRouter,
          routerSyncStatus: routerSyncStatus,
          syncedCount: syncedCount,
          failedCount: failedCount,
          routerError: routerError,
        );
      }
    } catch (e) {
      setState(() => _isGenerating = false);
      if (mounted) {
        String errorMessage = 'تعذر الاتصال بالخادم وتوليد الدفعة';
        if (e is DioException) {
          final resData = e.response?.data;
          if (resData is Map) {
            final errObj = resData['error'];
            if (errObj is Map) {
              final details = errObj['details'];
              final msg = errObj['message']?.toString();
              if (details is List && details.isNotEmpty) {
                final listStr = details.map((d) => '• $d').join('\n');
                errorMessage = (msg != null && msg.isNotEmpty && msg != 'Validation failed')
                    ? '$msg\n$listStr'
                    : 'فشل التحقق من البيانات:\n$listStr';
              } else if (msg != null && msg.isNotEmpty) {
                errorMessage = msg;
              } else {
                errorMessage = errObj.toString();
              }
            } else if (resData['message'] is List) {
              final listStr = (resData['message'] as List).map((d) => '• $d').join('\n');
              errorMessage = 'فشل التحقق من البيانات:\n$listStr';
            } else if (resData['message'] != null) {
              errorMessage = resData['message'].toString();
            } else if (resData['error'] != null) {
              errorMessage = resData['error'].toString();
            }
          } else if (e.message != null && e.message!.isNotEmpty) {
            errorMessage = e.message!;
          }
        } else {
          errorMessage = e.toString();
        }

        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: context.bgCard,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Row(
              children: [
                const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 24),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'فشل توليد الدفعة',
                    style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            content: Text(
              errorMessage,
              style: TextStyle(color: context.textSecondary, fontSize: 13),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('حسناً', style: TextStyle(color: Color(0xFF38BDF8))),
              ),
            ],
          ),
        );
      }
    }
  }

  Future<void> _exportCardsToCsv(List<OfflineCardModel> cards, String batchId) async {
    try {
      final buffer = StringBuffer();
      buffer.writeln('Serial,Username,Password,Profile,Price,Currency,Created');
      final nowStr = DateTime.now().toIso8601String();
      for (final c in cards) {
        final pwd = c.clearPassword ?? '';
        buffer.writeln('${c.serialNumber},${c.username},$pwd,${c.profileName},${c.price},${c.currency},${c.soldAt?.toIso8601String() ?? nowStr}');
      }

      final tempDir = await getTemporaryDirectory();
      final file = File('${tempDir.path}/Hotspot_Batch_$batchId.csv');
      await file.writeAsString(buffer.toString());

      await Share.shareXFiles(
        [XFile(file.path)],
        text: 'بيانات كروت دفعة $batchId - عدد الكروت: ${cards.length}',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر تصدير الملف: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _showBatchSuccessAndManagementDialog({
    required String batchId,
    required HotspotProfileModel profile,
    required int quantity,
    required List<OfflineCardModel> cards,
    required bool syncedToRouter,
    String routerSyncStatus = 'SYNCED',
    int syncedCount = 0,
    int failedCount = 0,
    String? routerError,
  }) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: context.bgCard,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              const Icon(Icons.check_circle, color: Color(0xFF10B981), size: 24),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'تم إنشاء الدفعة بنجاح! 📄',
                  style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF334155)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('معرف الدفعة: $batchId', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                        const SizedBox(height: 4),
                        Text('العدد الفعلي: $quantity كرت  •  الباقة: ${profile.displayName ?? profile.name}',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                        Text('الإجمالي: ${(quantity * profile.price).toStringAsFixed(0)} SDG',
                            style: const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 8),
                        // Real MikroTik Sync Status Indicator
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          decoration: BoxDecoration(
                            color: syncedToRouter
                                ? const Color(0xFF059669).withValues(alpha: 0.2)
                                : (routerSyncStatus == 'PARTIAL'
                                    ? const Color(0xFFD97706).withValues(alpha: 0.2)
                                    : (routerSyncStatus == 'FAILED'
                                        ? const Color(0xFFEF4444).withValues(alpha: 0.2)
                                        : const Color(0xFF0284C7).withValues(alpha: 0.2))),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: syncedToRouter
                                  ? const Color(0xFF10B981)
                                  : (routerSyncStatus == 'PARTIAL'
                                      ? const Color(0xFFF59E0B)
                                      : (routerSyncStatus == 'FAILED'
                                          ? const Color(0xFFEF4444)
                                          : const Color(0xFF0284C7))),
                              width: 1,
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                syncedToRouter
                                    ? Icons.router
                                    : (routerSyncStatus == 'FAILED'
                                        ? Icons.sync_problem_rounded
                                        : (routerSyncStatus == 'PARTIAL'
                                            ? Icons.published_with_changes
                                            : Icons.cloud_done)),
                                size: 18,
                                color: syncedToRouter
                                    ? const Color(0xFF34D399)
                                    : (routerSyncStatus == 'FAILED'
                                        ? const Color(0xFFF87171)
                                        : const Color(0xFFFBBF24)),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  syncedToRouter
                                      ? 'تم تفعيل جميع الكروت ومزامنتها على راوتر MikroTik بنجاح ($syncedCount كرت).'
                                      : (routerSyncStatus == 'PARTIAL'
                                          ? 'مزامنة جزئية: تم تفعيل $syncedCount كرت على الراوتر، وفشل $failedCount كرت. الكروت محفوظة بالسحابة وقابلة لإعادة المزامنة.'
                                          : (routerSyncStatus == 'FAILED'
                                              ? 'فشلت المزامنة المباشرة مع الراوتر ($routerError). الكروت محفوظة بالسحابة ويمكنك إعادة مزامنتها لاحقاً.'
                                              : 'الراوتر غير متصل حالياً (OFFLINE). تم حفظ الكروت بالسحابة وهي جاهزة للطباعة والمزامنة فور الاتصال.')),
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: syncedToRouter
                                        ? const Color(0xFF34D399)
                                        : (routerSyncStatus == 'FAILED'
                                            ? const Color(0xFFF87171)
                                            : const Color(0xFFFBBF24)),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Quick Action Buttons (CSV + PDF + Print)
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF10B981),
                            side: const BorderSide(color: Color(0xFF10B981)),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          icon: const Icon(Icons.table_chart_outlined, size: 16),
                          label: const Text('تصدير CSV / Excel', style: TextStyle(fontSize: 11)),
                          onPressed: () => _exportCardsToCsv(cards, batchId),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF38BDF8),
                            side: const BorderSide(color: Color(0xFF38BDF8)),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          icon: const Icon(Icons.print, size: 16),
                          label: const Text('معاينة وطباعة', style: TextStyle(fontSize: 11)),
                          onPressed: () async {
                            Navigator.pop(ctx);
                            widget.onBatchCreated?.call();
                            try {
                              await CardPdfGeneratorService.previewAndPrint(
                                cards: cards,
                                networkName: _networkNameController.text.trim().isNotEmpty
                                    ? _networkNameController.text.trim()
                                    : 'سودافاي | SudaFi Net',
                                supportPhone: _supportPhoneController.text.trim(),
                                layout: _selectedPrintLayout,
                                batchNumber: batchId,
                                themePreset: _selectedThemePreset,
                                customPrimaryColor: _customPrimaryColor != null
                                    ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
                                    : _selectedCustomTemplate?.primaryColor,
                                customAccentColor: _customAccentColor != null
                                    ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
                                    : _selectedCustomTemplate?.accentColor,
                                customBackgroundImageBase64: _pickedImageBase64 ?? _selectedCustomTemplate?.backgroundImageBase64,
                                customBackgroundImageBytes: _pickedImageBytes,
                                showQr: _showQr,
                                showPrice: _showPrice,
                                showSerial: _showSerial,
                                instructions: _instructionsController.text.trim(),
                              );
                            } catch (err) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('تعذر فتح نافذة الطباعة: $err'), backgroundColor: Colors.red),
                                );
                              }
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0D9488),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 11),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    icon: const Icon(Icons.share, size: 18),
                    label: const Text(
                      'مشاركة PDF لمركز الطباعة (WhatsApp / ملفات)',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                    onPressed: () async {
                      Navigator.pop(ctx);
                      widget.onBatchCreated?.call();
                      try {
                        await CardPdfGeneratorService.shareCardsPdf(
                          cards: cards,
                          networkName: _networkNameController.text.trim().isNotEmpty
                              ? _networkNameController.text.trim()
                              : 'سودافاي | SudaFi Net',
                          supportPhone: _supportPhoneController.text.trim(),
                          layout: _selectedPrintLayout,
                          batchNumber: batchId,
                          themePreset: _selectedThemePreset,
                          customPrimaryColor: _customPrimaryColor != null
                              ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
                              : _selectedCustomTemplate?.primaryColor,
                          customAccentColor: _customAccentColor != null
                              ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
                              : _selectedCustomTemplate?.accentColor,
                          customBackgroundImageBase64: _pickedImageBase64 ?? _selectedCustomTemplate?.backgroundImageBase64,
                          customBackgroundImageBytes: _pickedImageBytes,
                          showQr: _showQr,
                          showPrice: _showPrice,
                          showSerial: _showSerial,
                          instructions: _instructionsController.text.trim(),
                        );
                      } catch (err) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('تعذر استخراج ملف الـ PDF: $err'), backgroundColor: Colors.red),
                          );
                        }
                      }
                    },
                  ),
                  const SizedBox(height: 14),

                  // Cards List Preview
                  if (cards.isNotEmpty) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'قائمة الحسابات الناتجة (${cards.length} كرت):',
                          style: const TextStyle(color: Color(0xFFE2E8F0), fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          'انقر للنسخ',
                          style: TextStyle(color: context.textMuted, fontSize: 10),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Container(
                      height: 160,
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFF334155)),
                      ),
                      child: ListView.separated(
                        itemCount: cards.length,
                        separatorBuilder: (_, _) => const Divider(color: Color(0xFF1E293B), height: 1),
                        itemBuilder: (cContext, idx) {
                          final c = cards[idx];
                          final hasPin = c.clearPassword != null && c.clearPassword!.isNotEmpty && c.clearPassword != c.username;
                          return ListTile(
                            dense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                            title: Row(
                              children: [
                                Text(
                                  '#${idx + 1}',
                                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    hasPin ? 'مستخدم: ${c.username}  |  رمز: ${c.clearPassword}' : 'رمز الدخول (PIN): ${c.username}',
                                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.copy, size: 14, color: Color(0xFF38BDF8)),
                              tooltip: 'نسخ بيانات الدخول',
                              onPressed: () {
                                final text = hasPin ? 'اسم المستخدم: ${c.username}\nكلمة المرور: ${c.clearPassword}' : 'رمز الدخول: ${c.username}';
                                Clipboard.setData(ClipboardData(text: text));
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('تم نسخ بيانات الكرت إلى الحافظة!'), duration: Duration(seconds: 1)),
                                );
                              },
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                widget.onBatchCreated?.call();
              },
              child: const Text('إغلاق والعودة', style: TextStyle(color: Color(0xFF94A3B8))),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profiles = ref.watch(profilesProvider);
    final routersAsync = ref.watch(routersProvider);
    final routers = routersAsync.asData?.value ?? [];
    final selectedRouterId = ref.watch(selectedRouterIdProvider) ?? (routers.isNotEmpty ? routers.first.id : null);

    if ((_selectedProfileId == null || !profiles.any((p) => p.id == _selectedProfileId)) && profiles.isNotEmpty) {
      _selectedProfileId = profiles.first.id;
    }

    final currentProfile = profiles.isNotEmpty
        ? profiles.firstWhere(
            (p) => p.id == _selectedProfileId,
            orElse: () => profiles.first,
          )
        : null;

    final currentTheme = _themes[_selectedThemePreset] ?? _themes['FOOTBALL']!;

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFF8B5CF6).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.auto_awesome, color: Color(0xFFA78BFA), size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'إنشاء كروت',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: context.textPrimary,
                  ),
                ),
                const Text(
                  'استوديو متكامل: توليد، قيود، تصميم وطباعة',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
            tooltip: 'تحديث الباقات والأجهزة',
            onPressed: _loadData,
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          indicatorColor: const Color(0xFF38BDF8),
          indicatorWeight: 3,
          labelColor: const Color(0xFF38BDF8),
          unselectedLabelColor: const Color(0xFF94A3B8),
          labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
          tabs: const [
            Tab(icon: Icon(Icons.layers_outlined, size: 18), text: '1. إعدادات الكروت'),
            Tab(icon: Icon(Icons.speed, size: 18), text: '2. القيود والصلاحية'),
            Tab(icon: Icon(Icons.palette_outlined, size: 18), text: '3. استوديو التصميم'),
            Tab(icon: Icon(Icons.print_outlined, size: 18), text: '4. الطباعة والتصدير'),
          ],
        ),
      ),
      body: Column(
        children: [
          // Dynamic SaaS Quota Banner (pinned at top)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: _buildQuotaBanner(),
          ),

          // Tab Views
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                // Tab 1: Generation & Accounts
                _buildTab1GenerationSettings(profiles, routers, selectedRouterId, currentProfile),

                // Tab 2: Limits, Validity & Quotas
                _buildTab2LimitsAndValidity(currentProfile),

                // Tab 3: Design Studio & Live Preview
                _buildTab3DesignStudio(currentProfile, currentTheme),

                // Tab 4: Printing & PDF Export
                _buildTab4PrintingAndExport(currentProfile, currentTheme),
              ],
            ),
          ),

          // Persistent Bottom Review & Generate Bar
          _buildPersistentBottomBar(profiles, routers, currentProfile),
        ],
      ),
    );
  }

  // --- TAB 1: GENERATION SETTINGS ---
  Widget _buildTab1GenerationSettings(
    List<HotspotProfileModel> profiles,
    List<RouterDeviceModel> routers,
    String? selectedRouterId,
    HotspotProfileModel? currentProfile,
  ) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. Router Target Selector
          if (routers.isNotEmpty) ...[
            Text(
              'راوتر MikroTik المستهدف',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              decoration: BoxDecoration(
                color: context.bgCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: context.borderColor),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: selectedRouterId,
                  dropdownColor: context.bgCard,
                  isExpanded: true,
                  style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold),
                  items: routers.map((r) {
                    final isOnline = r.status.toUpperCase() == 'ONLINE' || r.isOnline;
                    return DropdownMenuItem<String>(
                      value: r.id,
                      child: Row(
                        children: [
                          Icon(
                            Icons.router,
                            size: 16,
                            color: isOnline ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
                          ),
                          const SizedBox(width: 8),
                          Expanded(child: Text(r.name, overflow: TextOverflow.ellipsis)),
                          Text(
                            isOnline ? 'متصل' : 'غير متصل',
                            style: TextStyle(
                              fontSize: 11,
                              color: isOnline ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                  onChanged: (id) {
                    if (id != null) {
                      ref.read(selectedRouterIdProvider.notifier).select(id);
                    }
                  },
                ),
              ),
            ),
            const SizedBox(height: 18),
          ],

          // 2. Profile Selection Dropdown (Preserving all test keys!)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'اختر باقة الهوتسبوت',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              TextButton.icon(
                key: const Key('button_add_new_profile'),
                icon: const Icon(Icons.add_circle_outline_rounded, size: 16, color: Color(0xFF10B981)),
                label: const Text(
                  '+ إضافة باقة جديدة',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF10B981)),
                ),
                onPressed: _handleAddNewProfile,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: profiles.isEmpty
                ? InkWell(
                    key: const Key('empty_profiles_add_button'),
                    onTap: _handleAddNewProfile,
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: const [
                          Expanded(
                            child: Text(
                              'لا توجد باقات متاحة حالياً. اضغط هنا لإضافة باقة جديدة',
                              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                            ),
                          ),
                          Icon(Icons.add_circle_outline_rounded, color: Color(0xFF10B981), size: 20),
                        ],
                      ),
                    ),
                  )
                : DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      key: const Key('hotspot_profile_dropdown'),
                      value: _selectedProfileId,
                      dropdownColor: const Color(0xFF1E293B),
                      isExpanded: true,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      items: [
                        ...profiles.map((p) {
                          return DropdownMenuItem<String>(
                            key: Key('profile_item_${p.id}'),
                            value: p.id,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Flexible(
                                        child: Text(
                                          p.displayName ?? p.name,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      if (!p.isUnlimited && p.quotaGb != null) ...[
                                        const SizedBox(width: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFEC4899).withValues(alpha: 0.15),
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: Text(
                                            '${p.quotaGb! % 1 == 0 ? p.quotaGb!.toInt() : p.quotaGb!.toStringAsFixed(1)} GB',
                                            style: const TextStyle(
                                              color: Color(0xFFF472B6),
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                Text(
                                  '${p.price.toStringAsFixed(0)} SDG',
                                  style: const TextStyle(color: Color(0xFF38BDF8)),
                                ),
                              ],
                            ),
                          );
                        }),
                        DropdownMenuItem<String>(
                          key: const Key('dropdown_add_new_profile_item'),
                          value: '__ADD_NEW_PROFILE__',
                          child: Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: const BoxDecoration(
                              border: Border(
                                top: BorderSide(color: Color(0xFF334155), width: 1),
                              ),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: const [
                                Icon(Icons.add_circle_outline_rounded, color: Color(0xFF10B981), size: 18),
                                SizedBox(width: 8),
                                Text(
                                  '+ إضافة باقة جديدة',
                                  style: TextStyle(
                                    color: Color(0xFF10B981),
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                      onChanged: (id) {
                        if (id == '__ADD_NEW_PROFILE__') {
                          _handleAddNewProfile();
                        } else if (id != null) {
                          setState(() => _selectedProfileId = id);
                        }
                      },
                    ),
                  ),
          ),

          const SizedBox(height: 18),

          // 3. Batch Quantity Selection
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'الكمية المطلوبة للدفعة',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              TextButton(
                onPressed: _handleCustomQuantity,
                child: const Text('كمية مخصصة...', style: TextStyle(color: Color(0xFF38BDF8), fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ..._quantityOptions.map((qty) {
                  final isSelected = _selectedQuantity == qty;
                  return Padding(
                    padding: const EdgeInsets.only(left: 8.0),
                    child: ChoiceChip(
                      label: Text('$qty كرت'),
                      selected: isSelected,
                      selectedColor: const Color(0xFF2563EB),
                      backgroundColor: const Color(0xFF1E293B),
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                        fontWeight: FontWeight.bold,
                      ),
                      onSelected: (_) => setState(() => _selectedQuantity = qty),
                    ),
                  );
                }),
                if (!_quantityOptions.contains(_selectedQuantity))
                  Padding(
                    padding: const EdgeInsets.only(left: 8.0),
                    child: ChoiceChip(
                      label: Text('$_selectedQuantity كرت (مخصص)'),
                      selected: true,
                      selectedColor: const Color(0xFF0D9488),
                      backgroundColor: const Color(0xFF1E293B),
                      labelStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      onSelected: (_) {},
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // 4. Credential Mode Selector
          const Text(
            'طريقة تسجيل الدخول وكلمة المرور',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Row(
              children: [
                _buildModeSegment(0, 'رمز PIN موحد', 'User = Pass'),
                _buildModeSegment(1, 'اسم + كلمة مرور', 'منفصلين'),
                _buildModeSegment(2, 'مستخدم فقط', 'بدون باسورد'),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // 5. Username Code Format & Generation
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'تخصيص اسم المستخدم (Username / Code)',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _prefixController,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: InputDecoration(
                    labelText: 'بادئة اسم المستخدم (اختياري، مثلاً: NET- أو 249-)',
                    labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                    filled: true,
                    fillColor: const Color(0xFF0F172A),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'طول اسم المستخدم: $_usernameLength خانات',
                        style: const TextStyle(color: Color(0xFFE2E8F0), fontSize: 12),
                      ),
                    ),
                    Slider(
                      value: _usernameLength.toDouble(),
                      min: 4,
                      max: 16,
                      divisions: 12,
                      label: '$_usernameLength',
                      onChanged: (v) => setState(() => _usernameLength = v.round()),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'صيغة محارف اسم المستخدم:',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _buildPatternChip('أرقام فقط (0-9)', 'NUMERIC', _usernamePattern, (v) => setState(() => _usernamePattern = v)),
                    _buildPatternChip('أرقام وأحرف', 'ALPHANUMERIC', _usernamePattern, (v) => setState(() => _usernamePattern = v)),
                    _buildPatternChip('أحرف فقط (A-Z)', 'ALPHABETIC', _usernamePattern, (v) => setState(() => _usernamePattern = v)),
                    _buildPatternChip('نظام ست عشري (HEX)', 'HEX', _usernamePattern, (v) => setState(() => _usernamePattern = v)),
                  ],
                ),
              ],
            ),
          ),

          // 6. Separate Password Settings (shown only when Mode 1 is active)
          if (_credentialMode == 1) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'تخصيص كلمة المرور المنفصلة (Password)',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'طول كلمة المرور: $_passwordLength خانات',
                          style: const TextStyle(color: Color(0xFFE2E8F0), fontSize: 12),
                        ),
                      ),
                      Slider(
                        value: _passwordLength.toDouble(),
                        min: 4,
                        max: 16,
                        divisions: 12,
                        label: '$_passwordLength',
                        onChanged: (v) => setState(() => _passwordLength = v.round()),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _buildPatternChip('أرقام فقط', 'NUMERIC', _passwordPattern, (v) => setState(() => _passwordPattern = v)),
                      _buildPatternChip('أرقام وأحرف', 'ALPHANUMERIC', _passwordPattern, (v) => setState(() => _passwordPattern = v)),
                      _buildPatternChip('أحرف فقط', 'ALPHABETIC', _passwordPattern, (v) => setState(() => _passwordPattern = v)),
                    ],
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 16),

          // 7. Serial Numbers Setting
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text(
                      'توليد أرقام تسلسلية فريدة (Serial Number)',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                    Text(
                      'رقم مسلسل غير مكرر لكل كرت لتسهيل تتبع المبيعات والتدقيق',
                      style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                    ),
                  ],
                ),
                Switch(
                  value: _enableSerialNumbers,
                  activeThumbColor: const Color(0xFF38BDF8),
                  onChanged: (v) => setState(() => _enableSerialNumbers = v),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildModeSegment(int mode, String title, String subtitle) {
    final isSelected = _credentialMode == mode;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _credentialMode = mode),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF2563EB) : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            children: [
              Text(
                title,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                ),
              ),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 10,
                  color: isSelected ? Colors.white70 : const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPatternChip(String label, String value, String current, Function(String) onSelect) {
    final isSelected = current == value;
    return ChoiceChip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      selected: isSelected,
      selectedColor: const Color(0xFF2563EB),
      backgroundColor: const Color(0xFF0F172A),
      labelStyle: TextStyle(
        color: isSelected ? Colors.white : const Color(0xFF94A3B8),
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
      onSelected: (val) {
        if (val) onSelect(value);
      },
    );
  }

  // --- TAB 2: LIMITS & VALIDITY ---
  Widget _buildTab2LimitsAndValidity(HotspotProfileModel? profile) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Informational Alert Card
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF0284C7).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF0284C7).withValues(alpha: 0.3)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Icon(Icons.info_outline, color: Color(0xFF38BDF8), size: 20),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'المنظومة تدعم تطبيق القيود المتعددة (Multi-Constraint) بشكل متزامن. كل قيد يتم تفعيله هنا يُترجم إلى أمر RouterOS مباشر (مثل limit-uptime و limit-bytes-total) وتاريخ انتهاء الصلاحية.',
                    style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 11, height: 1.4),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 18),

          // 1. Session / Uptime Limit
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'مدة الاستخدام / الاتصال (Session Uptime)',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Text(
                          'الحد الأقصى للوقت الفعلي المتصل بالإنترنت',
                          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                        ),
                      ],
                    ),
                    Switch(
                      value: _limitUptimeEnabled,
                      activeThumbColor: const Color(0xFF38BDF8),
                      onChanged: (v) => setState(() => _limitUptimeEnabled = v),
                    ),
                  ],
                ),
                if (_limitUptimeEnabled) ...[
                  const Divider(color: Color(0xFF334155), height: 16),
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: TextFormField(
                          initialValue: '$_limitUptimeValue',
                          keyboardType: TextInputType.number,
                          style: const TextStyle(color: Colors.white, fontSize: 14),
                          decoration: const InputDecoration(
                            labelText: 'المدة الرقمية',
                            contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          ),
                          onChanged: (v) {
                            final n = int.tryParse(v);
                            if (n != null && n > 0) _limitUptimeValue = n;
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 3,
                        child: DropdownButtonFormField<String>(
                          initialValue: _limitUptimeUnit,
                          dropdownColor: const Color(0xFF1E293B),
                          decoration: const InputDecoration(
                            labelText: 'الوحدة',
                            contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          ),
                          items: const [
                            DropdownMenuItem(value: 'm', child: Text('دقائق (Minutes)')),
                            DropdownMenuItem(value: 'h', child: Text('ساعات (Hours)')),
                            DropdownMenuItem(value: 'd', child: Text('أيام (Days)')),
                          ],
                          onChanged: (v) {
                            if (v != null) setState(() => _limitUptimeUnit = v);
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 16),

          // 2. Data Limit Quota
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'حد استهلاك البيانات (Data Quota)',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Text(
                          'حجم التنزيل والرفع المسموح به (limit-bytes-total)',
                          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                        ),
                      ],
                    ),
                    Switch(
                      value: _limitDataQuotaEnabled,
                      activeThumbColor: const Color(0xFF38BDF8),
                      onChanged: (v) => setState(() => _limitDataQuotaEnabled = v),
                    ),
                  ],
                ),
                if (_limitDataQuotaEnabled) ...[
                  const Divider(color: Color(0xFF334155), height: 16),
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: TextFormField(
                          initialValue: '$_limitDataQuotaValue',
                          keyboardType: TextInputType.number,
                          style: const TextStyle(color: Colors.white, fontSize: 14),
                          decoration: const InputDecoration(
                            labelText: 'الحجم',
                            contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          ),
                          onChanged: (v) {
                            final n = int.tryParse(v);
                            if (n != null && n > 0) _limitDataQuotaValue = n;
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 3,
                        child: DropdownButtonFormField<String>(
                          initialValue: _limitDataQuotaUnit,
                          dropdownColor: const Color(0xFF1E293B),
                          decoration: const InputDecoration(
                            labelText: 'وحدة السعة',
                            contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          ),
                          items: const [
                            DropdownMenuItem(value: 'GB', child: Text('جيجابايت (GB)')),
                            DropdownMenuItem(value: 'MB', child: Text('ميجابايت (MB)')),
                          ],
                          onChanged: (v) {
                            if (v != null) setState(() => _limitDataQuotaUnit = v);
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 16),

          // 3. Account Validity Days
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'مدة صلاحية الحساب (Account Validity)',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Text(
                          'عمر الكرت من تاريخ الإنشاء أو التفعيل الأول',
                          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                        ),
                      ],
                    ),
                    Switch(
                      value: _validityDaysEnabled,
                      activeThumbColor: const Color(0xFF38BDF8),
                      onChanged: (v) => setState(() => _validityDaysEnabled = v),
                    ),
                  ],
                ),
                if (_validityDaysEnabled) ...[
                  const Divider(color: Color(0xFF334155), height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          initialValue: '$_validityDaysValue',
                          keyboardType: TextInputType.number,
                          style: const TextStyle(color: Colors.white, fontSize: 14),
                          decoration: const InputDecoration(
                            labelText: 'عدد الأيام (Days)',
                            contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          ),
                          onChanged: (v) {
                            final n = int.tryParse(v);
                            if (n != null && n > 0) _validityDaysValue = n;
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  // --- TAB 3: DESIGN STUDIO & LIVE PREVIEW ---
  Widget _buildTab3DesignStudio(HotspotProfileModel? profile, _ThemeConfig theme) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Live Interactive Card Preview (prominently at top of studio)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'المعاينة الحية للكرت (Live Preview)',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              Text(
                '$_cardWidthMm×$_cardHeightMm mm',
                style: const TextStyle(fontSize: 11, color: Color(0xFF38BDF8), fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _buildLiveCardPreview(profile, theme),

          const SizedBox(height: 18),

          // Background Image Picker From Phone
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'خلفية الكرت وشعار الشبكة:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0F766E),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        icon: const Icon(Icons.add_photo_alternate_outlined, size: 18),
                        label: Text(
                          _pickedImageBytes != null ? 'استبدال صورة الخلفية' : 'اختيار صورة خلفية من الهاتف',
                          style: const TextStyle(fontSize: 12),
                        ),
                        onPressed: _pickBackgroundImageFromPhone,
                      ),
                    ),
                    if (_pickedImageBytes != null) ...[
                      const SizedBox(width: 8),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444)),
                        tooltip: 'حذف الخلفية المخصصة',
                        onPressed: _removeBackgroundImage,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Custom Texts (Network Name, Title, Instructions)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'نصوص وعناوين الكرت المطبوع:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _networkNameController,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: const InputDecoration(labelText: 'اسم الشبكة المطبوع'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _headerTitleController,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: const InputDecoration(labelText: 'عنوان رأس الكرت'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _supportPhoneController,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: const InputDecoration(labelText: 'رقم هاتف الدعم الفني / المبيعات'),
                  onChanged: (_) => setState(() {}),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Element Visibility Toggles
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'إظهار وإخفاء عناصر الكرت:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: [
                    _buildToggle('رمز QR', _showQr, (v) => setState(() => _showQr = v)),
                    _buildToggle('السعر', _showPrice, (v) => setState(() => _showPrice = v)),
                    _buildToggle('السرعة', _showSpeed, (v) => setState(() => _showSpeed = v)),
                    _buildToggle('الصلاحية', _showValidity, (v) => setState(() => _showValidity = v)),
                    _buildToggle('السعة', _showQuota, (v) => setState(() => _showQuota = v)),
                    _buildToggle('السيريال', _showSerial, (v) => setState(() => _showSerial = v)),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Card Dimensions Presets
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'أبعاد الكرت التناسبية:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  children: [
                    _buildDimPreset('بطاقة قياسية (85×54)', 85, 54),
                    _buildDimPreset('تذكرة (100×40)', 100, 40),
                    _buildDimPreset('مدمج (70×35)', 70, 35),
                    _buildDimPreset('مصغر (50×30)', 50, 30),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Save Template Action Button
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF38BDF8),
                side: const BorderSide(color: Color(0xFF38BDF8)),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              icon: const Icon(Icons.bookmark_add_outlined, size: 18),
              label: const Text('حفظ هذا التصميم كقالب مخصص'),
              onPressed: _saveCurrentDesignAsTemplate,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToggle(String label, bool value, Function(bool) onChanged) {
    return FilterChip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      selected: value,
      selectedColor: const Color(0xFF2563EB).withValues(alpha: 0.3),
      checkmarkColor: const Color(0xFF38BDF8),
      onSelected: onChanged,
    );
  }

  Widget _buildDimPreset(String label, int w, int h) {
    final isSelected = _cardWidthMm == w && _cardHeightMm == h;
    return ChoiceChip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      selected: isSelected,
      selectedColor: const Color(0xFF2563EB),
      onSelected: (val) {
        if (val) setState(() { _cardWidthMm = w; _cardHeightMm = h; });
      },
    );
  }

  // --- TAB 4: PRINTING & PDF EXPORT ---
  Widget _buildTab4PrintingAndExport(HotspotProfileModel? profile, _ThemeConfig theme) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'تنسيق ورق الطباعة A4 المعتمد:',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 10),
          RadioGroup<CardPdfLayout>(
            groupValue: _selectedPrintLayout,
            onChanged: (v) {
              if (v != null) setState(() => _selectedPrintLayout = v);
            },
            child: Column(
              children: [
                _buildPrintLayoutCard(
                  CardPdfLayout.a4Grid10,
                  '10 كروت في الصفحة (2×5)',
                  'حجم بطاقة الهوية المميز مع رمز QR كبير ومعلومات كاملة. أنسب خيار للمطابع والمكتبات.',
                  Icons.grid_view,
                ),
                const SizedBox(height: 8),
                _buildPrintLayoutCard(
                  CardPdfLayout.a4Grid12,
                  '12 كرت في الصفحة (3×4)',
                  'تخطيط كروت قياسي متوازن للمقاهي والشبكات المتوسطة.',
                  Icons.view_module,
                ),
                const SizedBox(height: 8),
                _buildPrintLayoutCard(
                  CardPdfLayout.a4Grid24,
                  '24 كرت في الصفحة (3×8)',
                  'تخطيط اقتصادي عالي الكفاءة يقلل استهلاك الورق إلى النصف.',
                  Icons.apps,
                ),
                const SizedBox(height: 8),
                _buildPrintLayoutCard(
                  CardPdfLayout.a4Grid100,
                  '100 كرت في الصفحة (5×20)',
                  'شريط أكواد مكثف جداً للدفوعات الكبيرة وتوزيع الأكواد السريعة.',
                  Icons.line_weight,
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Template Manager Jump
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text('استوديو تصاميم وقوالب الكروت', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                    Text('إدارة القوالب السحابية والقوالب المحفوظة للشبكة', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  ],
                ),
                TextButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const CardTemplatesScreen()),
                    );
                  },
                  child: const Text('فتح الاستوديو', style: TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPrintLayoutCard(CardPdfLayout layout, String title, String subtitle, IconData icon) {
    final isSelected = _selectedPrintLayout == layout;
    return GestureDetector(
      onTap: () => setState(() => _selectedPrintLayout = layout),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF1E3A8A).withValues(alpha: 0.3) : const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? const Color(0xFF38BDF8) : const Color(0xFF334155),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? const Color(0xFF38BDF8) : const Color(0xFF94A3B8), size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: isSelected ? Colors.white : const Color(0xFFE2E8F0), fontWeight: FontWeight.bold, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                ],
              ),
            ),
            Radio<CardPdfLayout>(
              value: layout,
              activeColor: const Color(0xFF38BDF8),
            ),
          ],
        ),
      ),
    );
  }

  // --- PERSISTENT BOTTOM BAR ---
  Widget _buildPersistentBottomBar(
    List<HotspotProfileModel> profiles,
    List<RouterDeviceModel> routers,
    HotspotProfileModel? profile,
  ) {
    final priceTotal = profile != null ? (_selectedQuantity * profile.price).toStringAsFixed(0) : '0';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        border: const Border(top: BorderSide(color: Color(0xFF334155), width: 1)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '$_selectedQuantity كرت • $priceTotal SDG',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                ),
                Text(
                  profile?.displayName ?? profile?.name ?? 'باقة الهوتسبوت',
                  style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11),
                ),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: SizedBox(
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: _isGenerating ? null : () => _showPreGenerationConfirmationSheet(profiles, routers),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    disabledBackgroundColor: const Color(0xFF1E3A8A),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 3,
                  ),
                  icon: _isGenerating
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Icon(Icons.bolt, color: Colors.white, size: 20),
                  label: Text(
                    _isGenerating ? 'جاري المعالجة...' : 'معاينة وتوليد الدفعة',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- LIVE CARD PREVIEW WIDGET ---
  Widget _buildLiveCardPreview(HotspotProfileModel? profile, _ThemeConfig theme) {
    final profileTitle = profile != null ? (profile.displayName ?? profile.name) : 'باقة هوتسبوت قياسية';
    final priceText = profile != null ? '${profile.price.toStringAsFixed(0)} SDG' : '--- SDG';
    final validityText = _validityDaysEnabled ? '$_validityDaysValue يوم' : formatValidityArabic(profile?.validity);
    final speedText = profile?.rateLimit ?? '4M/2M';
    final quotaText = _limitDataQuotaEnabled ? '$_limitDataQuotaValue $_limitDataQuotaUnit' : (profile?.formattedDataLimit ?? "مفتوح");

    Uint8List? bgImgBytes = _pickedImageBytes;
    if (bgImgBytes == null && _selectedCustomTemplate?.backgroundImageBase64 != null) {
      try {
        bgImgBytes = base64Decode(_selectedCustomTemplate!.backgroundImageBase64!);
      } catch (_) {}
    }

    final cardPrimary = _customPrimaryColor ?? theme.primaryColor;
    final cardAccent = _customAccentColor ?? theme.accentColor;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: cardPrimary,
        image: bgImgBytes != null
            ? DecorationImage(
                image: MemoryImage(bgImgBytes),
                fit: BoxFit.cover,
                colorFilter: ColorFilter.mode(
                  Colors.black.withValues(alpha: 0.35),
                  BlendMode.darken,
                ),
              )
            : null,
        gradient: bgImgBytes == null
            ? LinearGradient(
                colors: [cardPrimary, cardPrimary.withValues(alpha: 0.85)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : null,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: cardPrimary.withValues(alpha: 0.4),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
        border: Border.all(color: cardAccent.withValues(alpha: 0.5), width: 1.5),
      ),
      child: Column(
        children: [
          // Header Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(theme.icon, color: cardAccent, size: 18),
                    const SizedBox(width: 6),
                    Text(
                      _networkNameController.text.trim().isNotEmpty ? _networkNameController.text.trim() : 'سودافاي | SudaFi Net',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
                if (_showPrice)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: cardAccent, width: 1),
                    ),
                    child: Text(
                      priceText,
                      style: TextStyle(
                        color: cardAccent,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ),
              ],
            ),
          ),

          const Divider(color: Colors.white24, height: 1),

          // Card Body
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profileTitle,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${_showValidity ? "الصلاحية: $validityText • " : ""}${_showSpeed ? "السرعة: $speedText • " : ""}${_showQuota ? "السعة: $quotaText" : ""}',
                        style: const TextStyle(color: Colors.white70, fontSize: 10),
                      ),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          _credentialMode == 0
                              ? 'PIN: ${_prefixController.text.trim()}849204'
                              : (_credentialMode == 2
                                  ? 'USER: ${_prefixController.text.trim()}849204'
                                  : 'U: ${_prefixController.text.trim()}849204 | P: 1039'),
                          style: TextStyle(
                            color: cardPrimary,
                            fontWeight: FontWeight.w900,
                            letterSpacing: _credentialMode == 0 ? 1.5 : 0.8,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      if (_showSerial) ...[
                        const SizedBox(height: 4),
                        Text(
                          'S/N: 20261024-001',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 9),
                        ),
                      ],
                    ],
                  ),
                ),
                if (_showQr)
                  Container(
                    width: 58,
                    height: 58,
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Center(
                      child: Icon(Icons.qr_code_2, size: 50, color: Colors.black),
                    ),
                  ),
              ],
            ),
          ),

          // Footer
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.25),
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(16),
                bottomRight: Radius.circular(16),
              ),
            ),
            child: Text(
              _instructionsController.text.trim().isNotEmpty
                  ? _instructionsController.text.trim()
                  : 'امسح رمز QR للاتصال المباشر بشبكة الواي فاي',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 10),
            ),
          ),
        ],
      ),
    );
  }

  // --- SAAS QUOTA BANNER ---
  Widget _buildQuotaBanner() {
    final quotaAsync = ref.watch(tenantQuotaProvider);
    final user = ref.watch(currentUserProvider);
    if (user?.role.toUpperCase() == 'SUPER_ADMIN') {
      return const SizedBox.shrink();
    }
    return quotaAsync.when(
      data: (quota) {
        final status = quota?.status ?? user?.subscriptionStatus ?? 'NONE';
        if (status == 'ACTIVE' || status == 'TRIAL') {
          return const SizedBox.shrink();
        }
        final isNotSubscribed = (status == 'NONE' || quota == null) && user?.subscriptionPlan == null;
        final isExpired = status == 'EXPIRED';
        final isSuspended = status == 'SUSPENDED';

        if (isNotSubscribed || isExpired || isSuspended) {
          final isWarning = isExpired || isSuspended;
          final color = isWarning ? const Color(0xFFEF4444) : const Color(0xFFF59E0B);
          final text = isExpired
              ? 'تنبيه: انتهت صلاحية باقة الشبكة • يتطلب تجديد الاشتراك لتوليد الكروت'
              : (isSuspended
                  ? 'تنبيه: اشتراك الشبكة معلق مؤقتاً • لا يمكن توليد الكروت'
                  : 'تنبيه: حساب الشبكة غير مشترك حالياً • يتطلب تفعيل الاشتراك لتوليد الكروت');

          return Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: color.withValues(alpha: 0.35)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(
                      isWarning ? Icons.warning_amber_rounded : Icons.info_outline_rounded,
                      color: color,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        text,
                        style: TextStyle(
                          color: isWarning ? const Color(0xFFFCA5A5) : const Color(0xFFFDE68A),
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                WhatsAppButton(
                  type: isSuspended ? WhatsAppActionType.support : WhatsAppActionType.subscription,
                  label: isExpired
                      ? 'تجديد الاشتراك عبر واتساب'
                      : (isSuspended ? 'تواصل مع الدعم الفني' : 'طلب تفعيل الاشتراك لتوليد الكروت'),
                  planName: quota?.planNameAr ?? quota?.planName,
                  featureName: 'توليد كروت الهوتسبوت',
                  fontSize: 11,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                ),
              ],
            ),
          );
        }

        final planName = quota?.planNameAr ?? quota?.planName ?? user?.subscriptionPlanAr ?? user?.subscriptionPlan ?? 'الباقة النشطة';
        final isUnlimited = quota?.isUnlimited ?? true;
        final limit = quota?.cardLimit;
        final used = quota?.usedCards ?? 0;
        final remaining = quota?.remainingCards ?? (limit != null ? limit - used : 0);

        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: (!isUnlimited && limit != null && remaining < 100)
                  ? const Color(0xFFEF4444)
                  : const Color(0xFF0284C7).withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            children: [
              const Icon(Icons.credit_card_outlined, color: Color(0xFF38BDF8), size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isUnlimited
                      ? 'الباقة: $planName • حصة الكروت: غير محدودة'
                      : 'الباقة: $planName • الرصيد المتبقي: $remaining من أصل $limit كرت',
                  style: const TextStyle(color: Color(0xFFE2E8F0), fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
              if (!isUnlimited && limit != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: remaining > 0
                        ? const Color(0xFF10B981).withValues(alpha: 0.2)
                        : const Color(0xFFEF4444).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    remaining > 0 ? 'متاح للتوليد' : 'الحصة مستنفدة',
                    style: TextStyle(
                      color: remaining > 0 ? const Color(0xFF34D399) : const Color(0xFFF87171),
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
            ],
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (err, stack) => const SizedBox.shrink(),
    );
  }
}

class _ThemeConfig {
  final String name;
  final Color primaryColor;
  final Color accentColor;
  final IconData icon;

  _ThemeConfig(this.name, this.primaryColor, this.accentColor, this.icon);
}
