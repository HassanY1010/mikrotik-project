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
import '../../../core/storage/local_storage.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/services/card_pdf_generator_service.dart';
import '../../../core/services/card_template_import_service.dart';
import '../../../core/theme/app_theme.dart';
import 'card_templates_screen.dart';
import 'pdf_viewer_screen.dart';
import '../../../core/widgets/whatsapp_button.dart';
import '../../../core/widgets/card_pattern_overlay.dart';
import '../../../core/widgets/interactive_3d_card_simulator.dart';
import '../../../core/utils/whatsapp_helper.dart';
import '../../../core/utils/validity_helper.dart';
import '../../hotspot_profiles/presentation/create_hotspot_profile_screen.dart';

class CardStudioScreen extends ConsumerStatefulWidget {
  final VoidCallback? onBatchCreated;
  final CardTemplateModel? initialTemplate;

  const CardStudioScreen({
    super.key,
    this.onBatchCreated,
    this.initialTemplate,
  });

  @override
  ConsumerState<CardStudioScreen> createState() => _CardStudioScreenState();
}

class _CardStudioScreenState extends ConsumerState<CardStudioScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // 1. Generation & Quantity Settings
  int _selectedQuantity = 50;
  final List<int> _quantityOptions = [10, 50, 100, 120, 250, 500, 1000];
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
  String _selectedThemePreset = 'FOOTBALL';
  CardTemplateModel? _selectedCustomTemplate;
  bool _useCustomTemplate = false;
  final TextEditingController _networkNameController = TextEditingController(text: 'سودافاي | SudaFi Net');
  final TextEditingController _headerTitleController = TextEditingController(text: 'كرت إنترنت فائق السرعة');
  final TextEditingController _instructionsController = TextEditingController(text: 'امسح رمز QR أو أدخل الرمز للدخول');
  final TextEditingController _supportPhoneController = TextEditingController(text: '');
  final TextEditingController _salesPhoneController = TextEditingController(text: '');

  Uint8List? _pickedImageBytes;
  String? _pickedImageBase64;
  int _cardWidthMm = 85;
  int _cardHeightMm = 54;

  bool _showQr = true;
  bool _enableCardQrRegistration = true;
  bool _showPrice = true;
  bool _showSpeed = true;
  bool _showValidity = true;
  bool _showQuota = true;
  bool _showSerial = true;
  bool _showOuterBorder = true;
  bool _showNetworkName = true;
  bool _showProfileName = true;
  bool _showCredentials = true;
  bool _showInstructions = true;

  Color? _customPrimaryColor;
  Color? _customAccentColor;
  Color? _customHeaderTextColor;
  Color? _customBodyTextColor;
  Color? _customUsernameColor;
  Color? _customPasswordColor;
  Color? _customPinColor;
  Color? _customBorderColor;
  Color? _customSecondaryColor;
  Color? _customCardBgColor;
  Color? _customPriceTextColor;
  Color? _customPriceBgColor;

  CardColorCustomization _getEffectiveCustomColors() {
    String? toHex(Color? c) => c != null ? '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}' : null;
    return CardColorCustomization(
      headerTextColor: toHex(_customHeaderTextColor),
      bodyTextColor: toHex(_customBodyTextColor),
      usernameColor: toHex(_customUsernameColor),
      passwordColor: toHex(_customPasswordColor),
      pinColor: toHex(_customPinColor),
      borderColor: toHex(_customBorderColor),
      secondaryColor: toHex(_customSecondaryColor),
      cardBackgroundColor: toHex(_customCardBgColor),
      priceTextColor: toHex(_customPriceTextColor),
      priceBackgroundColor: toHex(_customPriceBgColor),
    );
  }

  void _saveColorsToStorage() {
    try {
      final cust = _getEffectiveCustomColors();
      ref.read(localStorageProvider).setStudioCustomColors(cust.toMap());
    } catch (_) {}
  }

  CardElementsLayout _elementsLayout = const CardElementsLayout();
  CardPatternType _selectedPatternOverlay = CardPatternType.none;
  double _selectedPatternOpacity = 0.12;

  // 4. Printing layout & orientation & custom grid
  CardPdfLayout _selectedPrintLayout = CardPdfLayout.a4Grid10;
  bool _isPrintLandscape = false;
  bool _isCustomPrintGrid = false;
  int _customGridCols = 3;
  int _customGridRows = 4;
  double _customGridMargin = 3.0;

  int get _effectiveCardsPerPage {
    if (_isCustomPrintGrid && _customGridCols > 0 && _customGridRows > 0) {
      return _customGridCols * _customGridRows;
    }
    switch (_selectedPrintLayout) {
      case CardPdfLayout.a4Grid10:
        return 10;
      case CardPdfLayout.a4Grid12:
        return 12;
      case CardPdfLayout.a4Grid24:
        return 24;
      case CardPdfLayout.a4Grid100:
        return 100;
      case CardPdfLayout.a4Grid120:
        return 120;
    }
  }

  int get _effectiveTotalPages {
    final cpp = _effectiveCardsPerPage;
    return (_selectedQuantity / cpp).ceil().clamp(1, 9999);
  }

  // Undo history for design adjustments
  final List<_DesignSnapshot> _designUndoStack = [];

  bool _isGenerating = false;

  final Map<String, _ThemeConfig> _themes = {
    'GEOMETRIC': _ThemeConfig('هندسي ديناميكي', const Color(0xFF0F172A), const Color(0xFFF59E0B), Icons.architecture),
    'MODERN': _ThemeConfig('عصري عائم', const Color(0xFF0D9488), const Color(0xFF06B6D4), Icons.auto_awesome),
    'CORPORATE_ISP': _ThemeConfig('مزود خدمة احترافي ISP Pro', const Color(0xFF1E3A8A), const Color(0xFF2563EB), Icons.business_center),
    'MINIMALIST': _ThemeConfig('بسيط وأنيق Clean Minimal', const Color(0xFF1E293B), const Color(0xFF64748B), Icons.crop_portrait),
    'TECH_CIRCUIT': _ThemeConfig('تقني ودوائر إلكترونية', const Color(0xFF090D16), const Color(0xFF00FFCC), Icons.memory),
    'LUXURY_ROYAL': _ThemeConfig('ملكي فاخر وذهبي', const Color(0xFF1A102F), const Color(0xFFD4AF37), Icons.workspace_premium),
    'CREATIVE_ASYMMETRIC': _ThemeConfig('إبداعي غير متماثل', const Color(0xFF4F46E5), const Color(0xFFEC4899), Icons.dashboard_customize),
    'FOOTBALL': _ThemeConfig('ثيم كرة القدم الذهبي', const Color(0xFF065F46), const Color(0xFFF59E0B), Icons.sports_soccer),
    'EID_MUBARAK': _ThemeConfig('عيد مبارك الملكي', AppTheme.primary, const Color(0xFFD97706), Icons.nights_stay),
    'TURQUOISE': _ThemeConfig('الفيروزي الحديث', const Color(0xFF0F766E), const Color(0xFF06B6D4), Icons.wifi),
    'TICKET': _ThemeConfig('تذكرة كلاسيكية', const Color(0xFF4338CA), const Color(0xFFEC4899), Icons.confirmation_number),
    'COMPACT': _ThemeConfig('مدمج أنيق', const Color(0xFF334155), const Color(0xFF64748B), Icons.grid_view),
    'CYBERPUNK': _ThemeConfig('الألعاب والجيمنج الرقمي', const Color(0xFF090D16), const Color(0xFF00FFCC), Icons.sports_esports),
    'ARTISAN_COFFEE': _ThemeConfig('المقاهي والمطاعم الكلاسيكي', const Color(0xFF3E2723), const Color(0xFFD7CCC8), Icons.local_cafe),
    'RAMADAN': _ThemeConfig('رمضان المبارك والأعياد', const Color(0xFF0B192C), const Color(0xFFF1C40F), Icons.nights_stay),
    'ACADEMIC': _ThemeConfig('الدراسة والجامعات', const Color(0xFF1E293B), const Color(0xFF38BDF8), Icons.school),
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    try {
      final storage = ref.read(localStorageProvider);
      _enableCardQrRegistration = storage.getCardQrRegistrationEnabled();
      final savedQty = storage.getStudioQuantity();
      if (savedQty != null && savedQty > 0) {
        _selectedQuantity = savedQty;
      }
      final savedCredMode = storage.getStudioCredentialMode();
      if (savedCredMode != null) {
        _credentialMode = savedCredMode;
      } else {
        final activeLoginMethod = storage.getHotspotLoginMethod();
        if (activeLoginMethod == 'USER_PASS') {
          _credentialMode = 1; // اسم مستخدم + كلمة مرور منفصلين
        } else {
          _credentialMode = 0; // رمز PIN موحد (User=Pass)
        }
      }
      final savedLayoutStr = storage.getStudioPrintLayout();
      if (savedLayoutStr != null) {
        _selectedPrintLayout = CardPdfLayout.values.firstWhere(
          (l) => l.name == savedLayoutStr,
          orElse: () => CardPdfLayout.a4Grid10,
        );
      }
      final savedIsCustom = storage.getStudioIsCustomGrid();
      if (savedIsCustom != null) _isCustomPrintGrid = savedIsCustom;
      final savedCols = storage.getStudioCustomCols();
      if (savedCols != null) _customGridCols = savedCols;
      final savedRows = storage.getStudioCustomRows();
      if (savedRows != null) _customGridRows = savedRows;
      final savedMargin = storage.getStudioCustomMargin();
      if (savedMargin != null) _customGridMargin = savedMargin;
      final savedColors = storage.getStudioCustomColors();
      if (savedColors != null) {
        final cust = CardColorCustomization.fromMap(savedColors);
        _customHeaderTextColor = cust.headerTextColorFlutter;
        _customBodyTextColor = cust.bodyTextColorFlutter;
        _customUsernameColor = cust.usernameColorFlutter;
        _customPasswordColor = cust.passwordColorFlutter;
        _customPinColor = cust.pinColorFlutter;
        _customBorderColor = cust.borderColorFlutter;
        _customSecondaryColor = cust.secondaryColorFlutter;
        _customCardBgColor = cust.cardBackgroundColorFlutter;
        _customPriceTextColor = cust.priceTextColorFlutter;
        _customPriceBgColor = cust.priceBackgroundColorFlutter;
      }
    } catch (_) {}

    if (widget.initialTemplate != null) {
      _applyCustomTemplate(widget.initialTemplate!, notify: false);
    }
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
    _salesPhoneController.dispose();
    super.dispose();
  }

  void _loadData() {
    ref.read(profilesProvider.notifier).fetchProfiles();
    ref.read(cardTemplatesProvider.notifier).refresh().then((_) {
      if (mounted && widget.initialTemplate == null) {
        _autoSelectDefaultOrPinnedTemplate();
      }
    });
    ref.invalidate(routersProvider);
  }

  void _autoSelectDefaultOrPinnedTemplate({bool force = false}) {
    try {
      final storage = ref.read(localStorageProvider);
      if (!force && _selectedCustomTemplate != null) {
        return;
      }

      final selectedId = storage.getSelectedStudioTemplateId();
      final allTemplates = ref.read(cardTemplatesProvider).value ?? [];
      if (selectedId != null && selectedId.isNotEmpty) {
        final found = allTemplates.where((t) => t.id == selectedId).firstOrNull;
        if (found != null) {
          _applyCustomTemplate(found);
          return;
        }
      }

      final pinned = storage.getPinnedTemplate();
      if (pinned != null) {
        _applyCustomTemplate(pinned);
        return;
      }

      final def = allTemplates.where((t) => t.isDefault).firstOrNull ?? allTemplates.firstOrNull;
      if (def != null) {
        _applyCustomTemplate(def);
        return;
      }

      // If currently selected custom template was deleted and no longer exists anywhere, reset it
      if (_selectedCustomTemplate != null) {
        final customTpls = storage.getCustomTemplates();
        final exists = customTpls.any((t) => t.id == _selectedCustomTemplate!.id) ||
            allTemplates.any((t) => t.id == _selectedCustomTemplate!.id);
        if (!exists) {
          setState(() {
            _selectedCustomTemplate = null;
            _useCustomTemplate = false;
          });
        }
      }
    } catch (_) {}
  }

  void _applyCustomTemplate(CardTemplateModel tpl, {bool notify = true}) {
    void updateState() {
      _selectedCustomTemplate = tpl;
      _useCustomTemplate = true;
      _elementsLayout = tpl.elementsLayout;

      try {
        if (tpl.id.isNotEmpty) {
          ref.read(localStorageProvider).setSelectedStudioTemplateId(tpl.id);
        }
      } catch (_) {}

      // Primary color
      if (tpl.primaryColor.isNotEmpty) {
        try {
          final hex = tpl.primaryColor.replaceAll('#', '');
          _customPrimaryColor = Color(int.parse(hex.length == 6 ? 'FF$hex' : hex, radix: 16));
        } catch (_) {}
      }

      // Accent color
      if (tpl.accentColor.isNotEmpty) {
        try {
          final hex = tpl.accentColor.replaceAll('#', '');
          _customAccentColor = Color(int.parse(hex.length == 6 ? 'FF$hex' : hex, radix: 16));
        } catch (_) {}
      }

      // Preset theme
      if (tpl.themePreset.isNotEmpty && _themes.containsKey(tpl.themePreset)) {
        _selectedThemePreset = tpl.themePreset;
      }

      // Dimensions
      if (tpl.widthMm > 0 && tpl.heightMm > 0) {
        _cardWidthMm = tpl.widthMm;
        _cardHeightMm = tpl.heightMm;
      }

      // Texts
      if (tpl.networkName.isNotEmpty) {
        _networkNameController.text = tpl.networkName;
      }
      if (tpl.headerTitle.isNotEmpty) {
        _headerTitleController.text = tpl.headerTitle;
      }
      if (tpl.supportPhone.isNotEmpty) {
        _supportPhoneController.text = tpl.supportPhone;
      }
      if (tpl.instructions.isNotEmpty) {
        _instructionsController.text = tpl.instructions;
      }

      // Layout config toggles
      final cfg = tpl.layoutConfig;
      if (cfg['showQr'] is bool) _showQr = cfg['showQr'] as bool;
      if (cfg['showPrice'] is bool) _showPrice = cfg['showPrice'] as bool;
      if (cfg['showSpeed'] is bool) _showSpeed = cfg['showSpeed'] as bool;
      if (cfg['showValidity'] is bool) _showValidity = cfg['showValidity'] as bool;
      if (cfg['showQuota'] is bool) _showQuota = cfg['showQuota'] as bool;
      if (cfg['showSerial'] is bool) _showSerial = cfg['showSerial'] as bool;

      // Background
      if (tpl.backgroundImageBase64 != null && tpl.backgroundImageBase64!.isNotEmpty) {
        _pickedImageBase64 = tpl.backgroundImageBase64;
        try {
          _pickedImageBytes = base64Decode(tpl.backgroundImageBase64!);
        } catch (_) {}
      } else {
        _pickedImageBase64 = null;
        _pickedImageBytes = null;
      }

      // Pattern overlay
      _selectedPatternOverlay = CardPatternTypeExtension.fromString(tpl.patternOverlay);
      _selectedPatternOpacity = tpl.patternOpacity;

      // Custom colors if present
      if (tpl.customColors.isNotEmpty) {
        final cc = tpl.customColors;
        _customHeaderTextColor = cc.headerTextColorFlutter;
        _customBodyTextColor = cc.bodyTextColorFlutter;
        _customUsernameColor = cc.usernameColorFlutter;
        _customPasswordColor = cc.passwordColorFlutter;
        _customPinColor = cc.pinColorFlutter;
        _customBorderColor = cc.borderColorFlutter;
        _customSecondaryColor = cc.secondaryColorFlutter;
        _customCardBgColor = cc.cardBackgroundColorFlutter;
        _customPriceTextColor = cc.priceTextColorFlutter;
        _customPriceBgColor = cc.priceBackgroundColorFlutter;
      }
    }

    if (notify && mounted) {
      setState(updateState);
    } else {
      updateState();
    }
  }

  void _applyBuiltInTheme(String themeKey) {
    final theme = _themes[themeKey];
    if (theme == null) return;
    _recordDesignSnapshot();

    CardTemplateModel? matchingTemplate;
    for (final t in CardTemplateImportService.getBuiltInCatalog()) {
      if (t.themePreset.toUpperCase() == themeKey.toUpperCase() ||
          t.id.toLowerCase() == 'builtin-${themeKey.toLowerCase()}') {
        matchingTemplate = t;
        break;
      }
    }

    setState(() {
      _selectedThemePreset = themeKey;
      _selectedCustomTemplate = matchingTemplate;
      _useCustomTemplate = matchingTemplate != null;
      _customPrimaryColor = theme.primaryColor;
      _customAccentColor = theme.accentColor;
      _pickedImageBase64 = null;
      _pickedImageBytes = null;

      if (matchingTemplate != null) {
        _elementsLayout = matchingTemplate.elementsLayout;
        final patternStr = matchingTemplate.patternOverlay;
        _selectedPatternOverlay = CardPatternType.values.firstWhere(
          (p) => p.id.toUpperCase() == patternStr.toUpperCase(),
          orElse: () => CardPatternType.none,
        );
        _selectedPatternOpacity = matchingTemplate.patternOpacity;
        _cardWidthMm = matchingTemplate.widthMm;
        _cardHeightMm = matchingTemplate.heightMm;

        final tplNet = matchingTemplate.layoutConfig['networkName'];
        if (tplNet is String && tplNet.isNotEmpty) {
          _networkNameController.text = tplNet;
        }
        final tplHeader = matchingTemplate.layoutConfig['headerTitle'];
        if (tplHeader is String && tplHeader.isNotEmpty) {
          _headerTitleController.text = tplHeader;
        }
        final tplInst = matchingTemplate.layoutConfig['instructions'];
        if (tplInst is String && tplInst.isNotEmpty) {
          if (!_enableCardQrRegistration && tplInst.contains('امسح')) {
            _instructionsController.text = 'أدخل كود الكرت للدخول إلى الشبكة';
          } else {
            _instructionsController.text = tplInst;
          }
        }
      }
    });
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
      try {
        ref.read(localStorageProvider).setStudioQuantity(result);
      } catch (_) {}
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
          final optimized = CardTemplateImportService.optimizeImageForPrint(bytes);
          final b64 = base64Encode(optimized);
          setState(() {
            _pickedImageBytes = optimized;
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
          'supportPhone': _effectivePhoneText,
          'showQr': _showQr,
          'showPrice': _showPrice,
          'showSpeed': _showSpeed,
          'showValidity': _showValidity,
          'showQuota': _showQuota,
          'showPin': true,
          'patternOverlay': _selectedPatternOverlay.id,
          'patternOpacity': _selectedPatternOpacity,
          'elements': _elementsLayout.toMap(),
          if (_pickedImageBase64 != null) 'backgroundImageBase64': _pickedImageBase64,
        },
      );

      final res = await ref.read(cardTemplatesProvider.notifier).createTemplate(newTpl);
      if (mounted) {
        if (res['success'] == true) {
          final createdTpl = (res['template'] is CardTemplateModel) ? res['template'] as CardTemplateModel : newTpl;
          _applyCustomTemplate(createdTpl);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('تم حفظ وتطبيق قالب الكروت الجديد بنجاح!'), backgroundColor: Color(0xFF10B981)),
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
    if (_networkNameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('اسم الشبكة حقل إجباري، يرجى إدخال اسم الشبكة أولاً للمتابعة'),
          backgroundColor: Colors.red,
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
                      color: AppTheme.primary.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.verified_outlined, color: AppTheme.primary, size: 22),
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
                    const Divider(color: Color(0xFF334155), height: 16),
                    _buildReviewRow(
                      'تنسيق ورق الطباعة',
                      _isCustomPrintGrid
                          ? 'شبكة مخصصة ($_customGridCols×$_customGridRows) • ${_isPrintLandscape ? "A4 أفقي" : "A4 عمودي"}'
                          : '${_selectedPrintLayout == CardPdfLayout.a4Grid10 ? 10 : (_selectedPrintLayout == CardPdfLayout.a4Grid12 ? 12 : (_selectedPrintLayout == CardPdfLayout.a4Grid24 ? 24 : 100))} كرت/صفحة • ${_isPrintLandscape ? "A4 أفقي" : "A4 عمودي"}',
                      icon: Icons.grid_on,
                    ),
                    _buildReviewRow(
                      'عدد صفحات الطباعة المتوقع',
                      () {
                        final int cpp = _isCustomPrintGrid && _customGridCols > 0 && _customGridRows > 0
                            ? (_customGridCols * _customGridRows)
                            : (_selectedPrintLayout == CardPdfLayout.a4Grid10 ? 10 : (_selectedPrintLayout == CardPdfLayout.a4Grid12 ? 12 : (_selectedPrintLayout == CardPdfLayout.a4Grid24 ? 24 : 100)));
                        final int pgs = (_selectedQuantity / cpp).ceil().clamp(1, 9999);
                        return '$pgs ${pgs == 1 ? "صفحة A4 واحدة" : (pgs == 2 ? "صفحتان A4" : "صفحات A4")} ($cpp كرت/صفحة)';
                      }(),
                      icon: Icons.description_outlined,
                      highlight: true,
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
                  backgroundColor: AppTheme.primary,
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
                Icon(icon, size: 14, color: context.textSecondary),
                const SizedBox(width: 6),
              ],
              Text(title, style: TextStyle(color: context.textSecondary, fontSize: 12)),
            ],
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                color: highlight ? context.skyColor : context.textPrimary,
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
          backgroundColor: ctx.bgCard,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              const Icon(Icons.lock_outline_rounded, color: Color(0xFFF59E0B), size: 24),
              const SizedBox(width: 8),
              Text(
                'تفعيل الاشتراك مطلوب',
                style: TextStyle(color: ctx.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: Text(
            isExpired
                ? 'انتهت صلاحية باقة هذه الشبكة. يرجى تجديد الاشتراك مع إدارة المنصة لتتمكن من استئناف توليد وطباعة الكروت.'
                : 'حساب هذه الشبكة غير مرتبط بباقة نشطة حالياً. يرجى التواصل مع إدارة المنصة (Super Admin) لتفعيل باقة الاشتراك وتحديد حصص الكروت.',
            style: TextStyle(color: ctx.textSecondary, fontSize: 13, height: 1.4),
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
        'themePreset': _selectedCustomTemplate?.themePreset.isNotEmpty == true
            ? _selectedCustomTemplate!.themePreset
            : _selectedThemePreset,
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
        final tplId = _selectedCustomTemplate!.id.trim();
        final isLocalId = RegExp(r'^(imported|media|local|tpl)-', caseSensitive: false).hasMatch(tplId);
        if (!isLocalId) {
          payload['templateId'] = tplId;
          payload['cardTemplateId'] = tplId;
        }
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
                child: const Text('حسناً', style: TextStyle(color: AppTheme.primary)),
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
                      color: context.bgScaffold,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: context.borderColor),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('معرف الدفعة: $batchId', style: TextStyle(color: context.textSecondary, fontSize: 11)),
                        const SizedBox(height: 4),
                        Text('العدد الفعلي: $quantity كرت  •  الباقة: ${profile.displayName ?? profile.name}',
                            style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                        Text('الإجمالي: ${(quantity * profile.price).toStringAsFixed(0)} SDG',
                            style: TextStyle(color: context.skyColor, fontWeight: FontWeight.bold, fontSize: 13)),
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
                                        : AppTheme.primary.withValues(alpha: 0.2))),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: syncedToRouter
                                  ? const Color(0xFF10B981)
                                  : (routerSyncStatus == 'PARTIAL'
                                      ? const Color(0xFFF59E0B)
                                      : (routerSyncStatus == 'FAILED'
                                          ? const Color(0xFFEF4444)
                                          : AppTheme.primary)),
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
                                    ? context.emeraldColor
                                    : (routerSyncStatus == 'FAILED'
                                        ? context.roseColor
                                        : context.amberColor),
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
                                        ? context.emeraldColor
                                        : (routerSyncStatus == 'FAILED'
                                            ? context.roseColor
                                            : context.amberColor),
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

                  // Quick Action Buttons (CSV + Preview PDF + Print + Share)
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
                            foregroundColor: const Color(0xFF0F766E),
                            side: const BorderSide(color: Color(0xFF0F766E)),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          icon: const Icon(Icons.picture_as_pdf_outlined, size: 16),
                          label: const Text('معاينة PDF الفعلي', style: TextStyle(fontSize: 11)),
                          onPressed: () async {
                            Navigator.pop(ctx);
                            widget.onBatchCreated?.call();
                            try {
                              final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
                                cards: cards,
                                networkName: _networkNameController.text.trim().isNotEmpty
                                    ? _networkNameController.text.trim()
                                    : (_selectedCustomTemplate?.networkName ?? 'سودافاي | SudaFi Net'),
                                supportPhone: _supportPhoneController.text.trim().isNotEmpty
                                    ? _supportPhoneController.text.trim()
                                    : (_selectedCustomTemplate?.supportPhone ?? ''),
                                layout: _selectedPrintLayout,
                                batchNumber: batchId,
                                themePreset: _selectedCustomTemplate?.themePreset.isNotEmpty == true
                                    ? _selectedCustomTemplate!.themePreset
                                    : _selectedThemePreset,
                                customPrimaryColor: _customPrimaryColor != null
                                    ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
                                    : _selectedCustomTemplate?.primaryColor,
                                customAccentColor: _customAccentColor != null
                                    ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
                                    : _selectedCustomTemplate?.accentColor,
                                customBackgroundImageBase64: _pickedImageBase64 ?? _selectedCustomTemplate?.backgroundImageBase64,
                                customBackgroundImageBytes: _pickedImageBytes ?? _selectedCustomTemplate?.getSyncBackgroundBytes(),
                                showQr: _showQr,
                                showPrice: _showPrice,
                                showSerial: _showSerial,
                                showOuterBorder: _showOuterBorder,
                                showNetworkName: _showNetworkName,
                                showProfileName: _showProfileName,
                                showCredentials: _showCredentials,
                                showInstructions: _showInstructions,
                                cardWidthMm: _cardWidthMm,
                                cardHeightMm: _cardHeightMm,
                                instructions: _instructionsController.text.trim().isNotEmpty
                                    ? _instructionsController.text.trim()
                                    : (_selectedCustomTemplate?.instructions ?? ''),
                                template: _getEffectiveTemplate(),
                                isLandscape: _isPrintLandscape,
                                customCols: _isCustomPrintGrid ? _customGridCols : null,
                                customRows: _isCustomPrintGrid ? _customGridRows : null,
                                customMargin: _isCustomPrintGrid ? _customGridMargin : null,
                                customColors: _getEffectiveCustomColors(),
                                elementsLayout: _elementsLayout,
                              );
                              if (context.mounted) {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => PdfViewerScreen(
                                      pdfBytes: pdfBytes,
                                      title: 'معاينة PDF للدفعة ($quantity كرت)',
                                      filename: 'SudaFi_Batch_$batchId.pdf',
                                      totalCards: quantity,
                                    ),
                                  ),
                                );
                              }
                            } catch (err) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('تعذر فتح المعاينة: $err'), backgroundColor: Colors.red),
                                );
                              }
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppTheme.primary,
                            side: const BorderSide(color: AppTheme.primary),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          icon: const Icon(Icons.print, size: 16),
                          label: const Text('طباعة مباشرة', style: TextStyle(fontSize: 11)),
                          onPressed: () async {
                            Navigator.pop(ctx);
                            widget.onBatchCreated?.call();
                            try {
                              await CardPdfGeneratorService.previewAndPrint(
                                cards: cards,
                                networkName: _networkNameController.text.trim().isNotEmpty
                                    ? _networkNameController.text.trim()
                                    : (_selectedCustomTemplate?.networkName ?? 'سودافاي | SudaFi Net'),
                                supportPhone: _supportPhoneController.text.trim().isNotEmpty
                                    ? _supportPhoneController.text.trim()
                                    : (_selectedCustomTemplate?.supportPhone ?? ''),
                                layout: _selectedPrintLayout,
                                batchNumber: batchId,
                                themePreset: _selectedCustomTemplate?.themePreset.isNotEmpty == true
                                    ? _selectedCustomTemplate!.themePreset
                                    : _selectedThemePreset,
                                customPrimaryColor: _customPrimaryColor != null
                                    ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
                                    : _selectedCustomTemplate?.primaryColor,
                                customAccentColor: _customAccentColor != null
                                    ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
                                    : _selectedCustomTemplate?.accentColor,
                                customBackgroundImageBase64: _pickedImageBase64 ?? _selectedCustomTemplate?.backgroundImageBase64,
                                customBackgroundImageBytes: _pickedImageBytes ?? _selectedCustomTemplate?.getSyncBackgroundBytes(),
                                showQr: _showQr,
                                showPrice: _showPrice,
                                showSerial: _showSerial,
                                showOuterBorder: _showOuterBorder,
                                showNetworkName: _showNetworkName,
                                showProfileName: _showProfileName,
                                showCredentials: _showCredentials,
                                showInstructions: _showInstructions,
                                cardWidthMm: _cardWidthMm,
                                cardHeightMm: _cardHeightMm,
                                instructions: _instructionsController.text.trim().isNotEmpty
                                    ? _instructionsController.text.trim()
                                    : (_selectedCustomTemplate?.instructions ?? ''),
                                template: _getEffectiveTemplate(),
                                isLandscape: _isPrintLandscape,
                                customCols: _isCustomPrintGrid ? _customGridCols : null,
                                customRows: _isCustomPrintGrid ? _customGridRows : null,
                                customMargin: _isCustomPrintGrid ? _customGridMargin : null,
                                customColors: _getEffectiveCustomColors(),
                                elementsLayout: _elementsLayout,
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
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          icon: const Icon(Icons.share, size: 16),
                          label: const Text('مشاركة PDF', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
                          onPressed: () async {
                            Navigator.pop(ctx);
                            widget.onBatchCreated?.call();
                            try {
                              await CardPdfGeneratorService.shareCardsPdf(
                                cards: cards,
                                networkName: _networkNameController.text.trim().isNotEmpty
                                    ? _networkNameController.text.trim()
                                    : (_selectedCustomTemplate?.networkName ?? 'سودافاي | SudaFi Net'),
                                supportPhone: _supportPhoneController.text.trim().isNotEmpty
                                    ? _supportPhoneController.text.trim()
                                    : (_selectedCustomTemplate?.supportPhone ?? ''),
                                layout: _selectedPrintLayout,
                                batchNumber: batchId,
                                themePreset: _selectedCustomTemplate?.themePreset.isNotEmpty == true
                                    ? _selectedCustomTemplate!.themePreset
                                    : _selectedThemePreset,
                                customPrimaryColor: _customPrimaryColor != null
                                    ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
                                    : _selectedCustomTemplate?.primaryColor,
                                customAccentColor: _customAccentColor != null
                                    ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
                                    : _selectedCustomTemplate?.accentColor,
                                customBackgroundImageBase64: _pickedImageBase64 ?? _selectedCustomTemplate?.backgroundImageBase64,
                                customBackgroundImageBytes: _pickedImageBytes ?? _selectedCustomTemplate?.getSyncBackgroundBytes(),
                                showQr: _showQr,
                                showPrice: _showPrice,
                                showSerial: _showSerial,
                                showOuterBorder: _showOuterBorder,
                                showNetworkName: _showNetworkName,
                                showProfileName: _showProfileName,
                                showCredentials: _showCredentials,
                                showInstructions: _showInstructions,
                                cardWidthMm: _cardWidthMm,
                                cardHeightMm: _cardHeightMm,
                                instructions: _instructionsController.text.trim().isNotEmpty
                                    ? _instructionsController.text.trim()
                                    : (_selectedCustomTemplate?.instructions ?? ''),
                                template: _getEffectiveTemplate(),
                                isLandscape: _isPrintLandscape,
                                customCols: _isCustomPrintGrid ? _customGridCols : null,
                                customRows: _isCustomPrintGrid ? _customGridRows : null,
                                customMargin: _isCustomPrintGrid ? _customGridMargin : null,
                                customColors: _getEffectiveCustomColors(),
                                elementsLayout: _elementsLayout,
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
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Cards List Preview
                  if (cards.isNotEmpty) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'قائمة الحسابات الناتجة (${cards.length} كرت):',
                          style: TextStyle(color: context.textPrimary, fontSize: 12, fontWeight: FontWeight.bold),
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
                        color: context.bgScaffold,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: context.borderColor),
                      ),
                      child: ListView.separated(
                        itemCount: cards.length,
                        separatorBuilder: (_, _) => Divider(color: context.borderColor, height: 1),
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
                                  style: TextStyle(color: context.textSecondary, fontSize: 11),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    hasPin ? 'مستخدم: ${c.username}  |  رمز: ${c.clearPassword}' : 'رمز الدخول (PIN): ${c.username}',
                                    style: TextStyle(color: context.textPrimary, fontSize: 11, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.copy, size: 14, color: AppTheme.primary),
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
                color: AppTheme.primary.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.auto_awesome, color: AppTheme.primary, size: 22),
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
            icon: const Icon(Icons.refresh, color: AppTheme.primary),
            tooltip: 'تحديث الباقات والأجهزة',
            onPressed: _loadData,
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          indicatorColor: AppTheme.primary,
          indicatorWeight: 3,
          labelColor: AppTheme.primary,
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
          // Selected Template Quick Indicator
          InkWell(
            onTap: () {
              // Switch to Tab 3 (Design Studio)
              _tabController.animateTo(2);
            },
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: _selectedCustomTemplate != null
                    ? const Color(0xFF10B981).withValues(alpha: 0.12)
                    : context.bgCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _selectedCustomTemplate != null ? const Color(0xFF10B981) : context.borderColor,
                  width: _selectedCustomTemplate != null ? 1.5 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.style,
                    size: 18,
                    color: _selectedCustomTemplate != null ? const Color(0xFF10B981) : context.skyColor,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                _selectedCustomTemplate != null
                                    ? 'قالب الكرت المحدد: ${_selectedCustomTemplate!.name}'
                                    : 'ثيم الكرت: ${_themes[_selectedThemePreset]?.name ?? _selectedThemePreset}',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: _selectedCustomTemplate != null ? const Color(0xFF10B981) : context.textPrimary,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (_selectedCustomTemplate?.isDefault == true) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF10B981),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text('افتراضي', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ],
                        ),
                        Text(
                          _selectedCustomTemplate != null
                              ? 'المقاس: $_cardWidthMm×$_cardHeightMm مم • ${_selectedCustomTemplate!.hasCustomBackground ? "خلفية مخصصة" : "تصميم كرت"}'
                              : 'اضغط لتغيير القالب أو اختيار قالب مستورد من الهاتف',
                          style: TextStyle(fontSize: 11, color: context.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios, size: 14, color: AppTheme.primary),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

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
              Text(
                'اختر باقة الهوتسبوت',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
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
                        children: [
                          Expanded(
                            child: Text(
                              'لا توجد باقات متاحة حالياً. اضغط هنا لإضافة باقة جديدة',
                              style: TextStyle(color: context.textSecondary, fontSize: 12),
                            ),
                          ),
                          const Icon(Icons.add_circle_outline_rounded, color: Color(0xFF10B981), size: 20),
                        ],
                      ),
                    ),
                  )
                : DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      key: const Key('hotspot_profile_dropdown'),
                      value: _selectedProfileId,
                      dropdownColor: context.bgCard,
                      isExpanded: true,
                      style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold),
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
                                  style: const TextStyle(color: AppTheme.primary),
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
              Text(
                'الكمية المطلوبة للدفعة',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
              ),
              TextButton(
                onPressed: _handleCustomQuantity,
                child: Text('كمية مخصصة...', style: TextStyle(color: context.skyColor, fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline, color: Color(0xFFEF4444), size: 26),
                  onPressed: _selectedQuantity > 10
                      ? () {
                          setState(() => _selectedQuantity = (_selectedQuantity - 10).clamp(1, 10000));
                          try {
                            ref.read(localStorageProvider).setStudioQuantity(_selectedQuantity);
                          } catch (_) {}
                        }
                      : null,
                ),
                Text(
                  '$_selectedQuantity كرت',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: context.textPrimary),
                ),
                IconButton(
                  icon: const Icon(Icons.add_circle_outline, color: Color(0xFF10B981), size: 26),
                  onPressed: () {
                    setState(() => _selectedQuantity = (_selectedQuantity + 10).clamp(1, 10000));
                    try {
                      ref.read(localStorageProvider).setStudioQuantity(_selectedQuantity);
                    } catch (_) {}
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
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
                      selectedColor: AppTheme.primary,
                      backgroundColor: context.bgCard,
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : context.textPrimary,
                        fontWeight: FontWeight.bold,
                      ),
                      onSelected: (_) {
                        setState(() => _selectedQuantity = qty);
                        try {
                          ref.read(localStorageProvider).setStudioQuantity(qty);
                        } catch (_) {}
                      },
                    ),
                  );
                }),
                if (!_quantityOptions.contains(_selectedQuantity))
                  Padding(
                    padding: const EdgeInsets.only(left: 8.0),
                    child: ChoiceChip(
                      label: Text('$_selectedQuantity كرت (مخصص)'),
                      selected: true,
                      selectedColor: AppTheme.primary,
                      backgroundColor: context.bgCard,
                      labelStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      onSelected: (_) {},
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // 4. Credential Mode Selector
          Text(
            'طريقة تسجيل الدخول وكلمة المرور',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Row(
              children: [
                _buildModeSegment(0, 'رمز PIN موحد', 'User = Pass'),
                _buildModeSegment(1, 'اسم + كلمة مرور', 'منفصلين'),
                _buildModeSegment(2, 'مستخدم فقط', 'بدون باسورد'),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // Hotspot Portal Compatibility Banner & Auto-Sync
          _buildHotspotCompatibilityBanner(),

          const SizedBox(height: 20),

          // 5. Username Code Format & Generation
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'تخصيص اسم المستخدم (Username / Code)',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _prefixController,
                  style: TextStyle(color: context.textPrimary, fontSize: 13),
                  decoration: InputDecoration(
                    labelText: 'بادئة اسم المستخدم (اختياري، مثلاً: NET- أو 249-)',
                    labelStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                    filled: true,
                    fillColor: context.bgScaffold,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: context.borderColor)),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'طول اسم المستخدم: $_usernameLength خانات',
                        style: TextStyle(color: context.textPrimary, fontSize: 12),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline, size: 20, color: Color(0xFFEF4444)),
                      onPressed: _usernameLength > 4 ? () => setState(() => _usernameLength--) : null,
                    ),
                    Text(
                      '$_usernameLength',
                      style: TextStyle(fontWeight: FontWeight.bold, color: context.textPrimary, fontSize: 13),
                    ),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline, size: 20, color: Color(0xFF10B981)),
                      onPressed: _usernameLength < 16 ? () => setState(() => _usernameLength++) : null,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'صيغة محارف اسم المستخدم:',
                  style: TextStyle(color: context.textSecondary, fontSize: 12),
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
                color: context.bgCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: context.borderColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'تخصيص كلمة المرور المنفصلة (Password)',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'طول كلمة المرور: $_passwordLength خانات',
                          style: TextStyle(color: context.textPrimary, fontSize: 12),
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'توليد أرقام تسلسلية فريدة (Serial Number)',
                      style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                    Text(
                      'رقم مسلسل غير مكرر لكل كرت لتسهيل تتبع المبيعات والتدقيق',
                      style: TextStyle(color: context.textSecondary, fontSize: 11),
                    ),
                  ],
                ),
                Switch(
                  value: _enableSerialNumbers,
                  activeThumbColor: AppTheme.primary,
                  onChanged: (v) => setState(() => _enableSerialNumbers = v),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // 8. Card Registration via QR Scan Setting (Optional Toggle)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.qr_code_scanner,
                            size: 18,
                            color: _enableCardQrRegistration ? AppTheme.primary : context.textSecondary,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'خاصية تسجيل الكروت بمسح رمز QR',
                            style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _enableCardQrRegistration
                            ? 'مفعّلة: يمكن تسجيل الكروت وتفعيلها على الشبكة بمسح رمز QR'
                            : 'معطّلة: يتم استخدام وتسجيل الكروت يدوياً برمز الحساب / PIN فقط دون اشتراط مسح QR',
                        style: TextStyle(color: context.textSecondary, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                Switch(
                  key: const Key('switch_card_qr_registration'),
                  value: _enableCardQrRegistration,
                  activeThumbColor: AppTheme.primary,
                  onChanged: (v) {
                    setState(() {
                      _enableCardQrRegistration = v;
                      if (!v && _instructionsController.text.contains('امسح رمز QR')) {
                        _instructionsController.text = 'أدخل كود الكرت للدخول إلى الشبكة';
                      } else if (v && _instructionsController.text == 'أدخل كود الكرت للدخول إلى الشبكة') {
                        _instructionsController.text = 'امسح رمز QR للاتصال المباشر بشبكة الواي فاي';
                      }
                    });
                    try {
                      ref.read(localStorageProvider).setCardQrRegistrationEnabled(v);
                    } catch (_) {}
                  },
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
        onTap: () {
          setState(() => _credentialMode = mode);
          try {
            ref.read(localStorageProvider).setStudioCredentialMode(mode);
          } catch (_) {}
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.primary : Colors.transparent,
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

  Widget _buildHotspotCompatibilityBanner() {
    LocalStorage? storage;
    try {
      storage = ref.read(localStorageProvider);
    } catch (_) {}

    final hotspotLoginMethod = storage?.getHotspotLoginMethod() ?? 'VOUCHER';

    final String statusTitle;
    final String statusMessage;
    final Color statusColor;
    final IconData statusIcon;
    final String? actionPrompt;
    final String? targetSyncMethod;

    if (hotspotLoginMethod == 'BOTH') {
      statusColor = const Color(0xFF0EA5E9);
      statusIcon = Icons.verified_rounded;
      statusTitle = 'متوافق 100% مع صفحة الهوتسبوت (الوضع المزدوج)';
      statusMessage = 'صفحة الهوتسبوت لديك تدعم كروت الـ PIN وكروت اسم المستخدم + كلمة المرور في آن واحد.';
      actionPrompt = null;
      targetSyncMethod = null;
    } else if (_credentialMode == 1) {
      // User selected Username + Password
      if (hotspotLoginMethod == 'USER_PASS') {
        statusColor = const Color(0xFF10B981);
        statusIcon = Icons.check_circle_rounded;
        statusTitle = 'متطابق مع صفحة الهوتسبوت (اسم مستخدم وكلمة مرور)';
        statusMessage = 'صفحة تسجيل الدخول في الراوتر مضبوطة على استقبال اسم المستخدم وكلمة المرور.';
        actionPrompt = null;
        targetSyncMethod = null;
      } else {
        statusColor = const Color(0xFFF59E0B);
        statusIcon = Icons.warning_amber_rounded;
        statusTitle = 'تنبيه: صفحة الهوتسبوت تطلب كود الكرت فقط (PIN)!';
        statusMessage = 'أنت تنشئ كروتاً باسم مستخدم وباسورد منفصلين، لكن صفحة الدخول الحالية في الراوتر تطلب كود الكرت فقط ولا تطلب كلمة مرور.';
        actionPrompt = 'تحديث صفحة الهوتسبوت لتصبح متوافقة بنقرة واحدة';
        targetSyncMethod = 'USER_PASS';
      }
    } else {
      // User selected PIN or User-only
      if (hotspotLoginMethod == 'VOUCHER') {
        statusColor = const Color(0xFF10B981);
        statusIcon = Icons.check_circle_rounded;
        statusTitle = 'متطابق مع صفحة الهوتسبوت (رقم الكرت فقط / PIN)';
        statusMessage = 'صفحة تسجيل الدخول في الراوتر مضبوطة على كود الكرت فقط بدون الحاجة لكلمة مرور مستقلة.';
        actionPrompt = null;
        targetSyncMethod = null;
      } else {
        statusColor = const Color(0xFFF59E0B);
        statusIcon = Icons.warning_amber_rounded;
        statusTitle = 'تنبيه: صفحة الهوتسبوت تتطلب كلمة مرور منفصلة!';
        statusMessage = 'هذه الكروت تعتمد على رمز PIN فقط، بينما صفحة الدخول الحالية في الراوتر تتطلب إدخال كلمة مرور.';
        actionPrompt = 'ضبط صفحة الهوتسبوت لتتوافق مع كود الكرت فقط';
        targetSyncMethod = 'VOUCHER';
      }
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: statusColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: statusColor.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(statusIcon, color: statusColor, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  statusTitle,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            statusMessage,
            style: TextStyle(
              color: context.textSecondary,
              fontSize: 11,
              height: 1.4,
            ),
          ),
          if (actionPrompt != null && targetSyncMethod != null) ...[
            const SizedBox(height: 10),
            () {
              final String syncMethod = targetSyncMethod!;
              final String prompt = actionPrompt!;
              return InkWell(
                onTap: () async {
                  await storage?.setHotspotLoginMethod(syncMethod);
                  if (mounted) {
                    setState(() {});
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          syncMethod == 'USER_PASS'
                              ? 'تمت مزامنة صفحة الهوتسبوت لتدعم (اسم مستخدم وكلمة مرور) بنجاح.'
                              : 'تمت مزامنة صفحة الهوتسبوت لتدعم (كود الكرت فقط / PIN) بنجاح.',
                        ),
                        backgroundColor: const Color(0xFF10B981),
                      ),
                    );
                  }
                },
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: statusColor.withValues(alpha: 0.5)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.sync_rounded, size: 14, color: statusColor),
                      const SizedBox(width: 6),
                      Text(
                        prompt,
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }(),
          ],
        ],
      ),
    );
  }

  Widget _buildPatternChip(String label, String value, String current, Function(String) onSelect) {
    final isSelected = current == value;
    return ChoiceChip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      selected: isSelected,
      selectedColor: AppTheme.primary,
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
              color: context.isDarkMode
                  ? AppTheme.primary.withValues(alpha: 0.12)
                  : const Color(0xFFE0F2FE),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: context.isDarkMode
                    ? AppTheme.primary.withValues(alpha: 0.3)
                    : AppTheme.primary.withValues(alpha: 0.6),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.info_outline,
                  color: context.isDarkMode ? AppTheme.primary : AppTheme.primary,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'المنظومة تدعم تطبيق القيود المتعددة (Multi-Constraint) بشكل متزامن. كل قيد يتم تفعيله هنا يُترجم إلى أمر RouterOS مباشر (مثل limit-uptime و limit-bytes-total) وتاريخ انتهاء الصلاحية.',
                    style: TextStyle(
                      color: context.isDarkMode ? const Color(0xFFE2E8F0) : const Color(0xFF0369A1),
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      height: 1.4,
                    ),
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'مدة الاستخدام / الاتصال (Session Uptime)',
                          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Text(
                          'الحد الأقصى للوقت الفعلي المتصل بالإنترنت',
                          style: TextStyle(color: context.textMuted, fontSize: 11),
                        ),
                      ],
                    ),
                    Switch(
                      value: _limitUptimeEnabled,
                      activeThumbColor: context.skyColor,
                      onChanged: (v) => setState(() => _limitUptimeEnabled = v),
                    ),
                  ],
                ),
                if (_limitUptimeEnabled) ...[
                  Divider(color: context.borderColor, height: 16),
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: TextFormField(
                          initialValue: '$_limitUptimeValue',
                          keyboardType: TextInputType.number,
                          style: TextStyle(color: context.textPrimary, fontSize: 14),
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
                          dropdownColor: context.bgCard,
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'حد استهلاك البيانات (Data Quota)',
                          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Text(
                          'حجم التنزيل والرفع المسموح به (limit-bytes-total)',
                          style: TextStyle(color: context.textMuted, fontSize: 11),
                        ),
                      ],
                    ),
                    Switch(
                      value: _limitDataQuotaEnabled,
                      activeThumbColor: context.skyColor,
                      onChanged: (v) => setState(() => _limitDataQuotaEnabled = v),
                    ),
                  ],
                ),
                if (_limitDataQuotaEnabled) ...[
                  Divider(color: context.borderColor, height: 16),
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: TextFormField(
                          initialValue: '$_limitDataQuotaValue',
                          keyboardType: TextInputType.number,
                          style: TextStyle(color: context.textPrimary, fontSize: 14),
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
                          dropdownColor: context.bgCard,
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'مدة صلاحية الحساب (Account Validity)',
                          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Text(
                          'عمر الكرت من تاريخ الإنشاء أو التفعيل الأول',
                          style: TextStyle(color: context.textMuted, fontSize: 11),
                        ),
                      ],
                    ),
                    Switch(
                      value: _validityDaysEnabled,
                      activeThumbColor: context.skyColor,
                      onChanged: (v) => setState(() => _validityDaysEnabled = v),
                    ),
                  ],
                ),
                if (_validityDaysEnabled) ...[
                  Divider(color: context.borderColor, height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          initialValue: '$_validityDaysValue',
                          keyboardType: TextInputType.number,
                          style: TextStyle(color: context.textPrimary, fontSize: 14),
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
              Text(
                'المعاينة الحية للكرت (Live Preview)',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
              ),
              Text(
                '$_cardWidthMm×$_cardHeightMm mm',
                style: TextStyle(fontSize: 11, color: context.skyColor, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _buildLiveCardPreview(profile, theme),

          const SizedBox(height: 12),
          _buildLiveCardStatsAndQuickBar(profile),

          const SizedBox(height: 18),

          // Card Template Selection Section
          _buildTemplateSelectorSection(),

          const SizedBox(height: 18),

          // Background Image Picker From Phone
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'خلفية الكرت وشعار الشبكة:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
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

          // Element Colors Customization Section
          _buildElementColorsSection(theme),

          const SizedBox(height: 16),

          // Luxury Pattern Overlays Selection
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.texture, size: 18, color: AppTheme.primary),
                    const SizedBox(width: 6),
                    Text(
                      'الأنماط الزخرفية والطبقات الشفافة (Pattern Overlay):',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'تمنح الكرت ملمس بطاقة بنكية فاخرة VIP مع التحكم في الشفافية',
                  style: TextStyle(fontSize: 11, color: context.textSecondary),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: CardPatternType.values.map((type) {
                    final isSelected = _selectedPatternOverlay == type;
                    return ChoiceChip(
                      selected: isSelected,
                      avatar: Icon(
                        type.icon,
                        size: 16,
                        color: isSelected ? Colors.white : AppTheme.primary,
                      ),
                      label: Text(
                        type.labelAr,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                          color: isSelected ? Colors.white : context.textPrimary,
                        ),
                      ),
                      selectedColor: AppTheme.primary,
                      backgroundColor: context.bgCardAlt,
                      onSelected: (selected) {
                        if (selected) {
                          setState(() => _selectedPatternOverlay = type);
                        }
                      },
                    );
                  }).toList(),
                ),
                if (_selectedPatternOverlay != CardPatternType.none) ...[
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'درجة شفافية النمط:',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: context.textSecondary),
                      ),
                      Text(
                        '${(_selectedPatternOpacity * 100).toInt()}%',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.primary),
                      ),
                    ],
                  ),
                  Slider(
                    value: _selectedPatternOpacity,
                    min: 0.04,
                    max: 0.25,
                    divisions: 21,
                    label: '${(_selectedPatternOpacity * 100).toInt()}%',
                    activeColor: AppTheme.primary,
                    onChanged: (val) {
                      setState(() => _selectedPatternOpacity = val);
                    },
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Custom Texts (Network Name, Title, Instructions)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'نصوص وعناوين الكرت المطبوع:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _networkNameController,
                  style: TextStyle(color: context.textPrimary, fontSize: 13),
                  decoration: InputDecoration(
                    labelText: 'اسم الشبكة المطبوع',
                    helperText: '* حقل إجباري مطلوب',
                    errorText: _networkNameController.text.trim().isEmpty ? 'اسم الشبكة حقل إجباري' : null,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _headerTitleController,
                  style: TextStyle(color: context.textPrimary, fontSize: 13),
                  decoration: const InputDecoration(labelText: 'عنوان رأس الكرت'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _supportPhoneController,
                  style: TextStyle(color: context.textPrimary, fontSize: 13),
                  decoration: const InputDecoration(labelText: 'رقم هاتف الدعم الفني'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _salesPhoneController,
                  style: TextStyle(color: context.textPrimary, fontSize: 13),
                  decoration: const InputDecoration(labelText: 'رقم هاتف المبيعات'),
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'إظهار وإخفاء عناصر الكرت:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    _buildToggle('اسم الشبكة', _showNetworkName, (v) => setState(() => _showNetworkName = v)),
                    _buildToggle('السعر', _showPrice, (v) => setState(() => _showPrice = v)),
                    _buildToggle('اسم الباقة', _showProfileName, (v) => setState(() => _showProfileName = v)),
                    _buildToggle('بيانات الدخول', _showCredentials, (v) => setState(() => _showCredentials = v)),
                    _buildToggle('رمز QR', _showQr, (v) => setState(() => _showQr = v)),
                    _buildToggle('السيريال', _showSerial, (v) => setState(() => _showSerial = v)),
                    _buildToggle('التعليمات', _showInstructions, (v) => setState(() => _showInstructions = v)),
                    _buildToggle('حدود الكرت', _showOuterBorder, (v) => setState(() => _showOuterBorder = v)),
                    _buildToggle('السرعة', _showSpeed, (v) => setState(() => _showSpeed = v)),
                    _buildToggle('الصلاحية', _showValidity, (v) => setState(() => _showValidity = v)),
                    _buildToggle('السعة', _showQuota, (v) => setState(() => _showQuota = v)),
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
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'أبعاد الكرت التناسبية:',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
                    ),
                    Text(
                      '$_cardWidthMm×$_cardHeightMm مم',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: context.skyColor),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'اختر من المقاسات الجاهزة المتنوعة أو حدد مقاساً مخصصاً بالمليمتر',
                  style: TextStyle(fontSize: 11, color: context.textSecondary),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _buildDimPreset('بطاقة قياسية (85×54)', 85, 54),
                    _buildDimPreset('تذكرة أفقية (100×40)', 100, 40),
                    _buildDimPreset('تذكرة عريضة (120×50)', 120, 50),
                    _buildDimPreset('قسيمة رول (90×45)', 90, 45),
                    _buildDimPreset('مدمج أنيق (70×35)', 70, 35),
                    _buildDimPreset('شريط عريض (80×30)', 80, 30),
                    _buildDimPreset('شريط نحيف (65×25)', 65, 25),
                    _buildDimPreset('مربع تجاري (60×60)', 60, 60),
                    _buildDimPreset('بطاقة ولاء (60×40)', 60, 40),
                    _buildDimPreset('مصغر اقتصادي (50×30)', 50, 30),
                    _buildDimPreset('ميكرو جيب (45×25)', 45, 25),
                    _buildDimPreset('عمودي هوتسبوت (54×85)', 54, 85),
                    _buildDimPreset('شارة عمودية (50×80)', 50, 80),
                    _buildCustomDimButton(),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Element Placement & Positioning Controls
          _buildElementPositioningSection(),

          const SizedBox(height: 16),

          // Save Template Action Button
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: context.skyColor,
                side: BorderSide(color: context.skyColor),
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
      selectedColor: AppTheme.primary.withValues(alpha: 0.3),
      checkmarkColor: context.skyColor,
      onSelected: (val) {
        _recordDesignSnapshot();
        onChanged(val);
      },
    );
  }

  Widget _buildDimPreset(String label, int w, int h) {
    final isSelected = _cardWidthMm == w && _cardHeightMm == h;
    return ChoiceChip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      selected: isSelected,
      selectedColor: AppTheme.primary,
      onSelected: (val) {
        if (val) {
          _recordDesignSnapshot();
          setState(() { _cardWidthMm = w; _cardHeightMm = h; });
        }
      },
    );
  }

  Widget _buildCustomDimButton() {
    final bool isStandardPreset = [
      [85, 54], [100, 40], [120, 50], [90, 45], [70, 35],
      [80, 30], [65, 25], [60, 60], [60, 40], [50, 30],
      [45, 25], [54, 85], [50, 80],
    ].any((pair) => pair[0] == _cardWidthMm && pair[1] == _cardHeightMm);

    return ActionChip(
      avatar: Icon(Icons.tune, size: 14, color: !isStandardPreset ? Colors.white : context.skyColor),
      label: Text(
        !isStandardPreset ? 'مخصص ($_cardWidthMm×$_cardHeightMm مم)' : 'مقاس مخصص...',
        style: TextStyle(
          fontSize: 11,
          color: !isStandardPreset ? Colors.white : context.textPrimary,
          fontWeight: !isStandardPreset ? FontWeight.bold : FontWeight.normal,
        ),
      ),
      backgroundColor: !isStandardPreset ? AppTheme.primary : context.bgCard,
      onPressed: _showCustomDimensionsDialog,
    );
  }

  void _showCustomDimensionsDialog() {
    final widthCtrl = TextEditingController(text: _cardWidthMm.toString());
    final heightCtrl = TextEditingController(text: _cardHeightMm.toString());

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: const [
            Icon(Icons.aspect_ratio, color: AppTheme.primary, size: 20),
            SizedBox(width: 8),
            Text('تحديد مقاس مخصص للكرت', style: TextStyle(fontSize: 15)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'أدخل العرض والارتفاع بالمليمتر (mm):',
              style: TextStyle(fontSize: 12),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: widthCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'العرض (مم)',
                      hintText: '85',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8),
                  child: Text('×', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
                Expanded(
                  child: TextField(
                    controller: heightCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'الارتفاع (مم)',
                      hintText: '54',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
            onPressed: () {
              final w = int.tryParse(widthCtrl.text.trim()) ?? _cardWidthMm;
              final h = int.tryParse(heightCtrl.text.trim()) ?? _cardHeightMm;
              if (w > 10 && h > 10) {
                _recordDesignSnapshot();
                setState(() {
                  _cardWidthMm = w.clamp(15, 300);
                  _cardHeightMm = h.clamp(15, 300);
                });
                Navigator.pop(ctx);
              }
            },
            child: const Text('تطبيق المقاس', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Widget _buildTemplateSelectorSection() {
    final templatesAsync = ref.watch(cardTemplatesProvider);
    final allTemplates = templatesAsync.value ?? [];
    final customTemplates = allTemplates.where((t) => !t.id.startsWith('builtin-')).toList();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: _selectedCustomTemplate != null
              ? const Color(0xFF10B981).withValues(alpha: 0.6)
              : context.borderColor,
          width: _selectedCustomTemplate != null ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.style, color: Color(0xFF10B981), size: 18),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'قالب وتصميم الكرت للطباعة:',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
                      ),
                      Text(
                        _selectedCustomTemplate != null
                            ? 'قالب مخصص: ${_selectedCustomTemplate!.name}'
                            : 'ثيم جاهز: ${_themes[_selectedThemePreset]?.name ?? _selectedThemePreset}',
                        style: TextStyle(
                          fontSize: 11,
                          color: _selectedCustomTemplate != null ? const Color(0xFF10B981) : context.skyColor,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              TextButton.icon(
                icon: const Icon(Icons.folder_open, size: 16, color: AppTheme.primary),
                label: const Text('إدارة واستيراد', style: TextStyle(fontSize: 12, color: AppTheme.primary)),
                onPressed: () async {
                  final picked = await Navigator.push<CardTemplateModel?>(
                    context,
                    MaterialPageRoute(builder: (_) => const CardTemplatesScreen()),
                  );
                  if (picked != null) {
                    _applyCustomTemplate(picked);
                  } else {
                    ref.read(cardTemplatesProvider.notifier).refresh().then((_) {
                      if (mounted && _selectedCustomTemplate == null) {
                        _autoSelectDefaultOrPinnedTemplate();
                      }
                    });
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Custom / Imported Templates Horizontal List
          Text(
            'القوالب المخصصة والمستوردة (${customTemplates.length}):',
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: context.textSecondary),
          ),
          const SizedBox(height: 8),

          if (customTemplates.isEmpty)
            InkWell(
              onTap: () async {
                final picked = await Navigator.push<CardTemplateModel?>(
                  context,
                  MaterialPageRoute(builder: (_) => const CardTemplatesScreen()),
                );
                if (picked != null) {
                  _applyCustomTemplate(picked);
                } else {
                  ref.read(cardTemplatesProvider.notifier).refresh().then((_) {
                    if (mounted && _selectedCustomTemplate == null) {
                      _autoSelectDefaultOrPinnedTemplate();
                    }
                  });
                }
              },
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: context.bgCardAlt,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: context.borderColor, style: BorderStyle.solid),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.add_photo_alternate_outlined, color: AppTheme.primary, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'لا توجد قوالب مستوردة حالياً. اضغط هنا لاستيراد قالب من الهاتف (صورة أو PDF أو JSON)',
                        style: TextStyle(fontSize: 11.5, color: context.textSecondary),
                      ),
                    ),
                    const Icon(Icons.arrow_forward_ios, size: 12, color: AppTheme.primary),
                  ],
                ),
              ),
            )
          else
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ...customTemplates.map((tpl) {
                    final isSelected = _selectedCustomTemplate?.id == tpl.id ||
                        (_selectedCustomTemplate?.name == tpl.name && _useCustomTemplate);
                    return GestureDetector(
                      onTap: () => _applyCustomTemplate(tpl),
                      child: Container(
                        margin: const EdgeInsets.only(left: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: isSelected ? const Color(0xFF10B981).withValues(alpha: 0.15) : context.bgCardAlt,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: isSelected ? const Color(0xFF10B981) : context.borderColor,
                            width: isSelected ? 2 : 1,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              tpl.isPdfBackground
                                  ? Icons.picture_as_pdf_outlined
                                  : (tpl.isImageBackground ? Icons.image_outlined : Icons.brush_outlined),
                              size: 16,
                              color: isSelected ? const Color(0xFF10B981) : context.textSecondary,
                            ),
                            const SizedBox(width: 6),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      tpl.name,
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                        color: isSelected ? const Color(0xFF10B981) : context.textPrimary,
                                      ),
                                    ),
                                    if (tpl.isDefault) ...[
                                      const SizedBox(width: 4),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF10B981),
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: const Text(
                                          'افتراضي',
                                          style: TextStyle(color: Colors.white, fontSize: 8.5, fontWeight: FontWeight.bold),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                                Text(
                                  '${tpl.widthMm}×${tpl.heightMm} مم',
                                  style: TextStyle(fontSize: 9.5, color: context.textSecondary),
                                ),
                              ],
                            ),
                            if (isSelected) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.check_circle, size: 16, color: Color(0xFF10B981)),
                            ],
                          ],
                        ),
                      ),
                    );
                  }),
                  // Add More Button
                  InkWell(
                    onTap: () async {
                      final picked = await Navigator.push<CardTemplateModel?>(
                        context,
                        MaterialPageRoute(builder: (_) => const CardTemplatesScreen()),
                      );
                      if (picked != null) {
                        _applyCustomTemplate(picked);
                      } else {
                        ref.read(cardTemplatesProvider.notifier).refresh().then((_) {
                          if (mounted && _selectedCustomTemplate == null) {
                            _autoSelectDefaultOrPinnedTemplate();
                          }
                        });
                      }
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: context.bgCardAlt,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: context.borderColor, style: BorderStyle.solid),
                      ),
                      child: Row(
                        children: const [
                          Icon(Icons.add_circle_outline, size: 16, color: AppTheme.primary),
                          SizedBox(width: 4),
                          Text('+ استيراد المزيد', style: TextStyle(fontSize: 11, color: AppTheme.primary)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 12),

          // Built-in Themes
          Text(
            'أو اختر من الثيمات الجاهزة:',
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: context.textSecondary),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _themes.entries.map((e) {
              final isSelected = !_useCustomTemplate && _selectedThemePreset == e.key;
              return ChoiceChip(
                label: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(e.value.icon, size: 14, color: isSelected ? Colors.white : e.value.primaryColor),
                    const SizedBox(width: 4),
                    Text(e.value.name, style: const TextStyle(fontSize: 11)),
                  ],
                ),
                selected: isSelected,
                selectedColor: e.value.primaryColor,
                labelStyle: TextStyle(
                  color: isSelected ? Colors.white : context.textPrimary,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
                onSelected: (val) {
                  if (val) _applyBuiltInTheme(e.key);
                },
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  // --- TAB 4: PRINTING & PDF EXPORT ---
  Widget _buildTab4PrintingAndExport(HotspotProfileModel? profile, _ThemeConfig theme) {
    final int cardsPerPage = _effectiveCardsPerPage;
    final int expectedPages = _effectiveTotalPages;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. Page Orientation (Portrait / Landscape)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.screen_rotation_outlined, color: AppTheme.primary, size: 18),
                    const SizedBox(width: 8),
                    Text(
                      'اتجاه ورقة الطباعة A4 (Sheet Orientation):',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(10),
                        onTap: () => setState(() => _isPrintLandscape = false),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          decoration: BoxDecoration(
                            color: !_isPrintLandscape ? context.skyColor.withValues(alpha: 0.15) : context.bgScaffold,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: !_isPrintLandscape ? context.skyColor : context.borderColor, width: !_isPrintLandscape ? 2 : 1),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.portrait, size: 17, color: !_isPrintLandscape ? context.skyColor : context.textMuted),
                              const SizedBox(width: 6),
                              Text(
                                'A4 عمودي (Portrait)',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: !_isPrintLandscape ? context.skyColor : context.textPrimary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(10),
                        onTap: () => setState(() => _isPrintLandscape = true),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          decoration: BoxDecoration(
                            color: _isPrintLandscape ? context.skyColor.withValues(alpha: 0.15) : context.bgScaffold,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: _isPrintLandscape ? context.skyColor : context.borderColor, width: _isPrintLandscape ? 2 : 1),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.landscape, size: 17, color: _isPrintLandscape ? context.skyColor : context.textMuted),
                              const SizedBox(width: 6),
                              Text(
                                'A4 أفقي (Landscape)',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: _isPrintLandscape ? context.skyColor : context.textPrimary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // 2. Custom Grid Option
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _isCustomPrintGrid ? context.skyColor.withValues(alpha: 0.15) : context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _isCustomPrintGrid ? context.skyColor : context.borderColor,
                width: _isCustomPrintGrid ? 2 : 1,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.dashboard_customize, color: _isCustomPrintGrid ? context.skyColor : context.textMuted, size: 18),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'توزيع شبكي مخصص (أعمدة وصفوف وهوامش)',
                              style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 12),
                            ),
                            Text(
                              'تحكم حر بعدد الأعمدة والصفوف والهوامش لورقة A4',
                              style: TextStyle(color: context.textMuted, fontSize: 10),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Switch(
                      value: _isCustomPrintGrid,
                      activeThumbColor: context.skyColor,
                      onChanged: (v) {
                        setState(() => _isCustomPrintGrid = v);
                        try {
                          ref.read(localStorageProvider).setStudioIsCustomGrid(v);
                        } catch (_) {}
                      },
                    ),
                  ],
                ),
                if (_isCustomPrintGrid) ...[
                  const Divider(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('الأعمدة (Cols):', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                            const SizedBox(height: 4),
                            DropdownButtonFormField<int>(
                              initialValue: _customGridCols,
                              dropdownColor: context.bgCard,
                              isDense: true,
                              decoration: InputDecoration(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                              ),
                              items: [2, 3, 4, 5, 6].map((c) => DropdownMenuItem(value: c, child: Text('$c أعمدة'))).toList(),
                              onChanged: (v) {
                                if (v != null) {
                                  setState(() => _customGridCols = v);
                                  try {
                                    ref.read(localStorageProvider).setStudioCustomCols(v);
                                  } catch (_) {}
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('الصفوف (Rows):', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                            const SizedBox(height: 4),
                            DropdownButtonFormField<int>(
                              initialValue: _customGridRows,
                              dropdownColor: context.bgCard,
                              isDense: true,
                              decoration: InputDecoration(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                              ),
                              items: List.generate(29, (i) => i + 2)
                                  .map((r) => DropdownMenuItem(value: r, child: Text('$r ${r <= 10 ? "صفوف" : "صفاً"}')))
                                  .toList(),
                              onChanged: (v) {
                                if (v != null) {
                                  setState(() => _customGridRows = v);
                                  try {
                                    ref.read(localStorageProvider).setStudioCustomRows(v);
                                  } catch (_) {}
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('الهامش (مم):', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                            const SizedBox(height: 4),
                            DropdownButtonFormField<double>(
                              initialValue: _customGridMargin,
                              dropdownColor: context.bgCard,
                              isDense: true,
                              decoration: InputDecoration(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                              ),
                              items: [1.0, 2.0, 3.0, 4.0, 5.0].map((m) => DropdownMenuItem(value: m, child: Text('$m مم'))).toList(),
                              onChanged: (v) {
                                if (v != null) {
                                  setState(() => _customGridMargin = v);
                                  try {
                                    ref.read(localStorageProvider).setStudioCustomMargin(v);
                                  } catch (_) {}
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Live Printable Area & Dimension Metrics Box
                  () {
                    final usableWidth = (_isPrintLandscape ? 297.0 : 210.0) - (2 * _customGridMargin);
                    final usableHeight = (_isPrintLandscape ? 210.0 : 297.0) - (2 * _customGridMargin);
                    final cellWidth = usableWidth / _customGridCols;
                    final cellHeight = usableHeight / _customGridRows;
                    final totalPerSheet = _customGridCols * _customGridRows;
                    final isVeryCompact = cellHeight < 12.0 || cellWidth < 30.0;

                    return Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: context.bgScaffold,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: context.borderColor),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('أبعاد خلية الكرت المحسوبة:', style: TextStyle(fontSize: 11, color: context.textSecondary)),
                              Text(
                                '${cellWidth.toStringAsFixed(1)} × ${cellHeight.toStringAsFixed(1)} مم',
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: context.textPrimary),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('السعة في صفحة A4:', style: TextStyle(fontSize: 11, color: context.textSecondary)),
                              Text(
                                '$totalPerSheet كرت / صفحة',
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF10B981)),
                              ),
                            ],
                          ),
                          if (isVeryCompact) ...[
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: const Color(0xFFF59E0B)),
                              ),
                              child: Row(
                                children: const [
                                  Icon(Icons.info_outline, size: 14, color: Color(0xFFF59E0B)),
                                  SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      'توزيع مكثف: سيتم تصغير الخطوط وعناصر الكرت آلياً لتلائم المساحة بدقة دون تشويه التصميم.',
                                      style: TextStyle(fontSize: 10, color: Color(0xFFF59E0B)),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  }(),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),

          // 3. Header & Ready Presets
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'تنسيق ورق الطباعة A4 المعتمد:',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'المتوقع: $expectedPages ${expectedPages == 1 ? "صفحة" : "صفحات"} ($cardsPerPage كرت/صفحة)',
                  style: const TextStyle(color: AppTheme.primary, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          if (!_isCustomPrintGrid) ...[
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
            const SizedBox(height: 8),
            _buildPrintLayoutCard(
              CardPdfLayout.a4Grid120,
              '120 كرت في الصفحة (5×24)',
              'أقصى كثافة استغلال لورقة A4 (5 أعمدة × 24 صف)، لتوفير التكاليف وطباعة الدفعات الضخمة.',
              Icons.format_line_spacing,
            ),
            const SizedBox(height: 14),
          ],

          // 4. Live Instant Preview & Dedicated Real PDF Viewer & Batch Generation Buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    side: BorderSide(color: context.borderColor),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: Icon(Icons.print_outlined, size: 17, color: context.textPrimary),
                  label: Text(
                    'معاينة صفحة الطباعة',
                    style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 11),
                  ),
                  onPressed: () => _previewCurrentLayoutSheet(profile),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0F766E),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const Icon(Icons.picture_as_pdf_outlined, size: 17, color: Colors.white),
                  label: const Text(
                    'معاينة PDF الفعلي',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11),
                  ),
                  onPressed: () => _openPdfViewer(profile),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              icon: const Icon(Icons.bolt, size: 18, color: Colors.white),
              label: Text(
                'تصدير إلى الطابعة ($_selectedQuantity كرت)',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
              ),
              onPressed: () => _previewAndGenerateBatchPdf(profile),
            ),
          ),

          const SizedBox(height: 20),

          // Template Manager Jump
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('استوديو تصاميم وقوالب الكروت', style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                    Text('إدارة القوالب السحابية والقوالب المحفوظة للشبكة', style: TextStyle(color: context.textMuted, fontSize: 11)),
                  ],
                ),
                TextButton(
                  onPressed: () async {
                    final picked = await Navigator.of(context).push<CardTemplateModel?>(
                      MaterialPageRoute(builder: (_) => const CardTemplatesScreen()),
                    );
                    if (picked != null) {
                      _applyCustomTemplate(picked);
                    } else {
                      ref.read(cardTemplatesProvider.notifier).refresh().then((_) {
                        if (mounted && _selectedCustomTemplate == null) {
                          _autoSelectDefaultOrPinnedTemplate();
                        }
                      });
                    }
                  },
                  child: Text('فتح الاستوديو', style: TextStyle(color: context.skyColor, fontWeight: FontWeight.bold)),
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
      onTap: () {
        setState(() => _selectedPrintLayout = layout);
        try {
          ref.read(localStorageProvider).setStudioPrintLayout(layout.name);
        } catch (_) {}
      },
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected ? context.skyColor.withValues(alpha: 0.15) : context.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? context.skyColor : context.borderColor,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? context.skyColor : context.textMuted, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: TextStyle(color: context.textMuted, fontSize: 11)),
                ],
              ),
            ),
            Radio<CardPdfLayout>(
              value: layout,
              activeColor: context.skyColor,
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
        color: context.bgCard,
        border: Border(top: BorderSide(color: context.borderColor, width: 1)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
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
                  style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
                ),
                Text(
                  profile?.displayName ?? profile?.name ?? 'باقة الهوتسبوت',
                  style: TextStyle(color: context.skyColor, fontSize: 11),
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
                    backgroundColor: AppTheme.primary,
                    disabledBackgroundColor: AppTheme.primary,
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

  static double _scaleFactorFlutter(String scale) {
    switch (scale) {
      case 'small':
        return 0.85;
      case 'large':
        return 1.2;
      default:
        return 1.0;
    }
  }

  Widget _buildZoneFlutterRow(List<Widget> left, List<Widget> center, List<Widget> right) {
    if (left.isEmpty && center.isEmpty && right.isEmpty) return const SizedBox.shrink();

    final leftCol = left.isNotEmpty
        ? (left.length == 1
            ? left.first
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: left,
              ))
        : null;

    final centerCol = center.isNotEmpty
        ? (center.length == 1
            ? center.first
            : Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: center,
              ))
        : null;

    final rightCol = right.isNotEmpty
        ? (right.length == 1
            ? right.first
            : Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: right,
              ))
        : null;

    return Directionality(
      textDirection: TextDirection.ltr,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          leftCol ?? const SizedBox.shrink(),
          centerCol ?? const SizedBox.shrink(),
          rightCol ?? const SizedBox.shrink(),
        ],
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

    final bool isCustomImported = bgImgBytes != null;
    final Color cardPrimary = _customCardBgColor ?? (isCustomImported ? (_customPrimaryColor ?? theme.primaryColor) : theme.primaryColor);
    final Color cardBgColor = _customCardBgColor ?? (isCustomImported ? (_customPrimaryColor ?? theme.primaryColor) : Colors.white);
    final bool isDarkCard = isCustomImported
        ? true
        : (_customCardBgColor != null && _customCardBgColor!.computeLuminance() < 0.4);

    final cardAccent = _customSecondaryColor ?? (_customAccentColor ?? theme.accentColor);
    final headerColor = _customHeaderTextColor ??
        (isDarkCard ? Colors.white : (theme.primaryColor != Colors.white ? theme.primaryColor : const Color(0xFF0F172A)));
    final bodyColor = _customBodyTextColor ??
        (isDarkCard ? Colors.white70 : const Color(0xFF334155));
    final userColor = _customUsernameColor ??
        (isDarkCard ? theme.accentColor : (theme.primaryColor != Colors.white ? theme.primaryColor : const Color(0xFF1E293B)));
    final passColor = _customPasswordColor ?? const Color(0xFFDC2626);
    final pinColor = _customPinColor ?? userColor;
    final borderColor = _customBorderColor ??
        (isDarkCard ? cardAccent : const Color(0xFFCBD5E1));
    final effectivePriceBg = _customPriceBgColor ?? cardAccent;
    final effectivePriceText = _customPriceTextColor ?? Colors.white;

    // 1. Network Name
    final netPlacement = _elementsLayout.networkName;
    final bool canShowNet = _showNetworkName && netPlacement.isVisible;
    final Widget? netWidget = canShowNet
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(theme.icon, color: isDarkCard ? cardAccent : theme.primaryColor, size: 16 * _scaleFactorFlutter(netPlacement.scale)),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  _networkNameController.text.trim().isNotEmpty ? _networkNameController.text.trim() : 'سودافاي | SudaFi Net',
                  style: TextStyle(
                    color: headerColor,
                    fontWeight: FontWeight.bold,
                    fontSize: 12.5 * _scaleFactorFlutter(netPlacement.scale),
                    letterSpacing: 0.5,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          )
        : null;

    // 2. Price Badge
    final pricePlacement = _elementsLayout.price;
    final bool canShowPrice = _showPrice && pricePlacement.isVisible;
    final Widget? priceWidget = canShowPrice
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: effectivePriceBg,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              priceText,
              style: TextStyle(
                color: effectivePriceText,
                fontWeight: FontWeight.bold,
                fontSize: 11.5 * _scaleFactorFlutter(pricePlacement.scale),
              ),
            ),
          )
        : null;

    // 3. Profile details
    final profPlacement = _elementsLayout.profileDetails;
    final bool canShowProf = _showProfileName && profPlacement.isVisible;
    final Widget? profileWidget = canShowProf
        ? Column(
            crossAxisAlignment: profPlacement.align == 'left'
                ? CrossAxisAlignment.start
                : (profPlacement.align == 'center' ? CrossAxisAlignment.center : CrossAxisAlignment.end),
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                profileTitle,
                style: TextStyle(
                  color: headerColor,
                  fontWeight: FontWeight.bold,
                  fontSize: 13 * _scaleFactorFlutter(profPlacement.scale),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${_showValidity ? "الصلاحية: $validityText • " : ""}${_showSpeed ? "السرعة: $speedText • " : ""}${_showQuota ? "السعة: $quotaText" : ""}',
                style: TextStyle(
                  color: bodyColor,
                  fontSize: 9.5 * _scaleFactorFlutter(profPlacement.scale),
                ),
              ),
            ],
          )
        : null;

    // 4. Credentials
    final credPlacement = _elementsLayout.credentials;
    final bool canShowCred = _showCredentials && credPlacement.isVisible;
    final Widget? credWidget = canShowCred
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: isDarkCard ? Colors.white : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(5),
              border: Border.all(color: borderColor, width: 0.8),
            ),
            child: _credentialMode == 1
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'U: ${_prefixController.text.trim()}849204',
                        style: TextStyle(
                          color: userColor,
                          fontWeight: FontWeight.w900,
                          fontSize: 12 * _scaleFactorFlutter(credPlacement.scale),
                        ),
                      ),
                      Text(
                        'P: 1039',
                        style: TextStyle(
                          color: passColor,
                          fontWeight: FontWeight.bold,
                          fontSize: 11 * _scaleFactorFlutter(credPlacement.scale),
                        ),
                      ),
                    ],
                  )
                : Text(
                    _credentialMode == 0
                        ? 'PIN: ${_prefixController.text.trim()}849204'
                        : 'USER: ${_prefixController.text.trim()}849204',
                    style: TextStyle(
                      color: _credentialMode == 0 ? pinColor : userColor,
                      fontWeight: FontWeight.w900,
                      letterSpacing: _credentialMode == 0 ? 1.5 : 0.8,
                      fontSize: 12.5 * _scaleFactorFlutter(credPlacement.scale),
                    ),
                  ),
          )
        : null;

    // 5. QR Code
    final qrPlacement = _elementsLayout.qrCode;
    final bool canShowQr = _showQr && qrPlacement.isVisible;
    final Widget? qrWidget = canShowQr
        ? Container(
            width: 52 * _scaleFactorFlutter(qrPlacement.scale),
            height: 52 * _scaleFactorFlutter(qrPlacement.scale),
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: borderColor, width: 0.8),
            ),
            child: const Center(
              child: Icon(Icons.qr_code_2, size: 46, color: Colors.black),
            ),
          )
        : null;

    // 6. Instructions
    final instPlacement = _elementsLayout.instructions;
    final bool canShowInst = _showInstructions && instPlacement.isVisible;
    final Widget? instWidget = canShowInst
        ? Text(
            _instructionsController.text.trim().isNotEmpty
                ? _instructionsController.text.trim()
                : 'امسح الرمز أو أدخل اسم المستخدم للدخول',
            textAlign: instPlacement.align == 'left'
                ? TextAlign.left
                : (instPlacement.align == 'right' ? TextAlign.right : TextAlign.center),
            style: TextStyle(
              color: bodyColor,
              fontSize: 9.5 * _scaleFactorFlutter(instPlacement.scale),
            ),
          )
        : null;

    // 7. Serial Number & Phone
    final phoneText = [_supportPhoneController.text.trim(), _salesPhoneController.text.trim()]
        .where((p) => p.isNotEmpty)
        .join(' | ');
    final snPlacement = _elementsLayout.serialNumber;
    final bool canShowSn = _showSerial && snPlacement.isVisible;
    final Widget? snWidget = canShowSn
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (phoneText.isNotEmpty) ...[
                Text(
                  phoneText,
                  style: TextStyle(
                    color: bodyColor.withValues(alpha: 0.8),
                    fontSize: 8.5 * _scaleFactorFlutter(snPlacement.scale),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Text(
                'S/N: 20261024-001',
                style: TextStyle(
                  color: bodyColor.withValues(alpha: 0.8),
                  fontSize: 8.5 * _scaleFactorFlutter(snPlacement.scale),
                ),
              ),
            ],
          )
        : null;

    // Distribute to 3 vertical zones
    final List<_FlutterZoneEntry> allEntries = [
      if (netWidget != null) _FlutterZoneEntry(netWidget, netPlacement.vertical, netPlacement.align),
      if (priceWidget != null) _FlutterZoneEntry(priceWidget, pricePlacement.vertical, pricePlacement.align),
      if (profileWidget != null) _FlutterZoneEntry(profileWidget, profPlacement.vertical, profPlacement.align),
      if (credWidget != null) _FlutterZoneEntry(credWidget, credPlacement.vertical, credPlacement.align),
      if (qrWidget != null) _FlutterZoneEntry(qrWidget, qrPlacement.vertical, qrPlacement.align),
      if (instWidget != null) _FlutterZoneEntry(instWidget, instPlacement.vertical, instPlacement.align),
      if (snWidget != null) _FlutterZoneEntry(snWidget, snPlacement.vertical, snPlacement.align),
    ];

    final topEntries = allEntries.where((e) => e.vertical == 'top').toList();
    final midEntries = allEntries.where((e) => e.vertical == 'middle').toList();
    final botEntries = allEntries.where((e) => e.vertical == 'bottom').toList();

    final topLeft = topEntries.where((e) => e.align == 'left').map((e) => e.widget).toList();
    final topCenter = topEntries.where((e) => e.align == 'center').map((e) => e.widget).toList();
    final topRight = topEntries.where((e) => e.align == 'right').map((e) => e.widget).toList();

    final midLeft = midEntries.where((e) => e.align == 'left').map((e) => e.widget).toList();
    final midCenter = midEntries.where((e) => e.align == 'center').map((e) => e.widget).toList();
    final midRight = midEntries.where((e) => e.align == 'right').map((e) => e.widget).toList();

    final botLeft = botEntries.where((e) => e.align == 'left').map((e) => e.widget).toList();
    final botCenter = botEntries.where((e) => e.align == 'center').map((e) => e.widget).toList();
    final botRight = botEntries.where((e) => e.align == 'right').map((e) => e.widget).toList();

    Widget? topContainer;
    if (topLeft.isNotEmpty || topCenter.isNotEmpty || topRight.isNotEmpty) {
      topContainer = Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isCustomImported
              ? Colors.black.withValues(alpha: 0.25)
              : (isDarkCard ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF8FAFC)),
          borderRadius: BorderRadius.circular(6),
          border: (!isCustomImported && !isDarkCard)
              ? Border.all(color: const Color(0xFFE2E8F0), width: 0.8)
              : null,
        ),
        child: _buildZoneFlutterRow(topLeft, topCenter, topRight),
      );
    }

    Widget? middleContainer;
    if (midLeft.isNotEmpty || midCenter.isNotEmpty || midRight.isNotEmpty) {
      middleContainer = Padding(
        padding: const EdgeInsets.all(10),
        child: _buildZoneFlutterRow(midLeft, midCenter, midRight),
      );
    }

    final double cardAspect = (_cardWidthMm > 0 && _cardHeightMm > 0)
        ? (_cardWidthMm / _cardHeightMm)
        : (85.0 / 54.0);

    Widget? bottomContainer;
    if (botLeft.isNotEmpty || botCenter.isNotEmpty || botRight.isNotEmpty) {
      bottomContainer = Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isCustomImported
              ? Colors.black.withValues(alpha: 0.25)
              : (isDarkCard ? Colors.black.withValues(alpha: 0.25) : Colors.transparent),
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(8),
            bottomRight: Radius.circular(8),
          ),
          border: Border(
            top: BorderSide(
              color: isDarkCard ? Colors.white24 : const Color(0xFFE2E8F0),
              width: 0.8,
            ),
          ),
        ),
        child: _buildZoneFlutterRow(botLeft, botCenter, botRight),
      );
    }

    final frontWidget = AspectRatio(
      aspectRatio: cardAspect,
      child: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: cardBgColor,
          image: bgImgBytes != null
              ? DecorationImage(
                  image: MemoryImage(bgImgBytes),
                  fit: BoxFit.fill,
                )
              : null,
          gradient: isCustomImported
              ? LinearGradient(
                  colors: [cardBgColor, cardBgColor.withValues(alpha: 0.85)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : null,
          borderRadius: BorderRadius.circular(8),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isCustomImported ? 0.3 : 0.08),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
          border: _showOuterBorder
              ? Border.all(
                  color: borderColor,
                  width: isCustomImported ? 0.8 : 1.2,
                )
              : null,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Stack(
            children: [
              if (_selectedThemePreset == 'LUXURY_ROYAL')
                Positioned.fill(
                  child: Container(
                    margin: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      border: Border.all(color: const Color(0xFFD4AF37), width: 0.8),
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                ),
              if (_selectedThemePreset == 'FOOTBALL')
                Positioned(
                  top: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
                    decoration: const BoxDecoration(
                      color: Color(0xFFF59E0B),
                      borderRadius: BorderRadius.only(
                        bottomLeft: Radius.circular(6),
                      ),
                    ),
                    child: const Text(
                      'MATCH PASS',
                      style: TextStyle(
                        color: Color(0xFF065F46),
                        fontWeight: FontWeight.w900,
                        fontSize: 7.5,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                ),
              if (_selectedThemePreset == 'CORPORATE_ISP')
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    height: 3,
                    color: const Color(0xFF2563EB),
                  ),
                ),
              if (_selectedThemePreset == 'TECH_CIRCUIT')
                Positioned(
                  bottom: 4,
                  left: 6,
                  child: const Text(
                    '// SYS_ONLINE',
                    style: TextStyle(
                      color: Color(0xFF00FFCC),
                      fontSize: 7.5,
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              if (_selectedThemePreset == 'GEOMETRIC')
                Positioned(
                  top: 0,
                  right: 0,
                  child: Container(
                    width: 24,
                    height: 3,
                    color: borderColor,
                  ),
                ),
              if (_selectedPatternOverlay != CardPatternType.none)
                Positioned.fill(
                  child: CustomPaint(
                    painter: CardPatternPainter(
                      patternType: _selectedPatternOverlay,
                      opacity: _selectedPatternOpacity,
                      strokeColor: isDarkCard ? Colors.white : Colors.black.withValues(alpha: 0.15),
                    ),
                  ),
                ),
              Column(
                mainAxisSize: MainAxisSize.max,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (topContainer != null) topContainer else const SizedBox(),
                  if (middleContainer != null)
                    Expanded(child: Center(child: middleContainer))
                  else
                    const SizedBox(),
                  if (bottomContainer != null) bottomContainer else const SizedBox(),
                ],
              ),
            ],
          ),
        ),
      ),
    );

    // Build Reverse / Back Card Side for Studio
    final backWidget = AspectRatio(
      aspectRatio: cardAspect,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: cardPrimary,
          gradient: LinearGradient(
            colors: [cardPrimary.withValues(alpha: 0.95), cardPrimary],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
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
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            children: [
              if (_selectedPatternOverlay != CardPatternType.none)
                Positioned.fill(
                  child: CustomPaint(
                    painter: CardPatternPainter(
                      patternType: _selectedPatternOverlay,
                      opacity: _selectedPatternOpacity * 0.7,
                      strokeColor: Colors.white,
                    ),
                  ),
                ),
              Column(
                mainAxisSize: MainAxisSize.max,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(Icons.wifi_tethering, color: cardAccent, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        'تعليمات تسجيل الدخول بالشبكة',
                        style: TextStyle(
                          color: cardAccent,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                  const Divider(color: Colors.white24, height: 12),
                  const Text(
                    '1. اتصل بشبكة الواي فاي وافتح المتصفح للوصول لصفحة الدخول.',
                    style: TextStyle(color: Colors.white, fontSize: 10),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    '2. امسح رمز الـ QR من الوجه الأمامي لتسجيل الدخول التلقائي.',
                    style: TextStyle(color: Colors.white, fontSize: 10),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    '3. في حال وجود مشكلة، تواصل مع فريق الدعم الموضح أدناه.',
                    style: TextStyle(color: Colors.white, fontSize: 10),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'دعم الشبكة:',
                          style: TextStyle(color: cardAccent, fontSize: 10, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          _supportPhoneController.text.trim().isNotEmpty
                              ? _supportPhoneController.text.trim()
                              : 'سودافاي | شبكة معتمدة',
                          style: const TextStyle(color: Colors.white, fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );

    return Interactive3dCardSimulator(
      frontChild: frontWidget,
      backChild: backWidget,
      maxWidth: 360,
      minHeight: 180,
    );
  }

  Widget _buildLiveCardStatsAndQuickBar(HotspotProfileModel? profile) {
    final int cardsPerPage = _effectiveCardsPerPage;
    final int totalPages = _effectiveTotalPages;
    final double totalPrice = _selectedQuantity * (profile?.price ?? 500);

    return Column(
      children: [
        // Real-time batch stats bar (matching reference screenshots)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: context.bgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.borderColor),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildLiveStatColumn('كروت الصفحة', '$cardsPerPage كرت'),
              Container(width: 1, height: 28, color: context.borderColor),
              _buildLiveStatColumn('عدد الصفحات', '$totalPages صفحة'),
              Container(width: 1, height: 28, color: context.borderColor),
              _buildLiveStatColumn('إجمالي الدفعة', '${totalPrice.toStringAsFixed(0)} SDG'),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Quick action buttons below preview (matching reference app)
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  side: BorderSide(
                    color: _showOuterBorder ? const Color(0xFF10B981) : context.borderColor,
                    width: _showOuterBorder ? 1.5 : 1,
                  ),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                icon: Icon(
                  _showOuterBorder ? Icons.check_box : Icons.check_box_outline_blank,
                  size: 16,
                  color: _showOuterBorder ? const Color(0xFF10B981) : context.textSecondary,
                ),
                label: Text(
                  'إطار خارجي',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: _showOuterBorder ? const Color(0xFF10B981) : context.textPrimary,
                  ),
                ),
                onPressed: () => setState(() => _showOuterBorder = !_showOuterBorder),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  side: BorderSide(
                    color: _isPrintLandscape ? context.skyColor : context.borderColor,
                    width: _isPrintLandscape ? 1.5 : 1,
                  ),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                icon: Icon(
                  _isPrintLandscape ? Icons.screen_lock_landscape : Icons.screen_lock_portrait,
                  size: 16,
                  color: _isPrintLandscape ? context.skyColor : context.textSecondary,
                ),
                label: Text(
                  _isPrintLandscape ? 'أفقي A4' : 'عمودي A4',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: _isPrintLandscape ? context.skyColor : context.textPrimary,
                  ),
                ),
                onPressed: () => setState(() => _isPrintLandscape = !_isPrintLandscape),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                icon: const Icon(Icons.picture_as_pdf, size: 16, color: Colors.white),
                label: const Text(
                  'معاينة PDF',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                onPressed: () => _previewAndGenerateBatchPdf(profile),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildLiveStatColumn(String label, String value) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: TextStyle(fontSize: 11, color: context.textSecondary)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: context.textPrimary)),
      ],
    );
  }

  void _recordDesignSnapshot() {
    if (_designUndoStack.length >= 25) {
      _designUndoStack.removeAt(0);
    }
    _designUndoStack.add(_DesignSnapshot(
      customPrimaryColor: _customPrimaryColor,
      customAccentColor: _customAccentColor,
      selectedThemePreset: _selectedThemePreset,
      cardWidthMm: _cardWidthMm,
      cardHeightMm: _cardHeightMm,
      showQr: _showQr,
      showPrice: _showPrice,
      showSpeed: _showSpeed,
      showValidity: _showValidity,
      showQuota: _showQuota,
      showSerial: _showSerial,
      showOuterBorder: _showOuterBorder,
      showNetworkName: _showNetworkName,
      showProfileName: _showProfileName,
      showCredentials: _showCredentials,
      showInstructions: _showInstructions,
      elementsLayout: _elementsLayout,
      instructions: _instructionsController.text,
      headerTitle: _headerTitleController.text,
      supportPhone: _supportPhoneController.text,
      pickedImageBytes: _pickedImageBytes,
      pickedImageBase64: _pickedImageBase64,
    ));
  }

  void _undoDesignChange() {
    if (_designUndoStack.isEmpty) return;
    final prev = _designUndoStack.removeLast();
    setState(() {
      _customPrimaryColor = prev.customPrimaryColor;
      _customAccentColor = prev.customAccentColor;
      _selectedThemePreset = prev.selectedThemePreset;
      _cardWidthMm = prev.cardWidthMm;
      _cardHeightMm = prev.cardHeightMm;
      _showQr = prev.showQr;
      _showPrice = prev.showPrice;
      _showSpeed = prev.showSpeed;
      _showValidity = prev.showValidity;
      _showQuota = prev.showQuota;
      _showSerial = prev.showSerial;
      _showOuterBorder = prev.showOuterBorder;
      _showNetworkName = prev.showNetworkName;
      _showProfileName = prev.showProfileName;
      _showCredentials = prev.showCredentials;
      _showInstructions = prev.showInstructions;
      _elementsLayout = prev.elementsLayout;
      _instructionsController.text = prev.instructions;
      _headerTitleController.text = prev.headerTitle;
      _supportPhoneController.text = prev.supportPhone;
      _pickedImageBytes = prev.pickedImageBytes;
      _pickedImageBase64 = prev.pickedImageBase64;
      _syncCurrentTemplateLayout();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('تم التراجع عن التعديل الأخير بنجاح'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  void _handleResetDesign() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.restart_alt, color: Color(0xFFF59E0B), size: 22),
            const SizedBox(width: 8),
            Text(
              'إعادة ضبط التصميم',
              style: TextStyle(color: ctx.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Text(
          'هل تريد بالتأكيد إعادة ضبط ألوان ومواضع وحجم عناصر التصميم إلى الحالة القياسية الافتراضية؟\n\n(لن يتم حذف أي قوالب مخصصة أو ملفات مستوردة أو بيانات الكروت).',
          style: TextStyle(color: ctx.textSecondary, fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _recordDesignSnapshot();
              setState(() {
                _customPrimaryColor = null;
                _customAccentColor = null;
                _selectedThemePreset = 'FOOTBALL';
                _cardWidthMm = 85;
                _cardHeightMm = 54;
                _showQr = true;
                _showPrice = true;
                _showSpeed = true;
                _showValidity = true;
                _showQuota = true;
                _showSerial = true;
                _elementsLayout = const CardElementsLayout();
                _instructionsController.text = 'امسح رمز QR أو أدخل الرمز للدخول';
                _headerTitleController.text = 'كرت إنترنت فائق السرعة';
                _supportPhoneController.text = '';
                _pickedImageBytes = null;
                _pickedImageBase64 = null;
                _syncCurrentTemplateLayout();
              });
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('تمت إعادة ضبط التصميم إلى الحالة الافتراضية بنجاح'),
                  backgroundColor: Color(0xFF10B981),
                ),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF59E0B),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('نعم، إعادة الضبط', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  String get _effectivePhoneText {
    final s = _supportPhoneController.text.trim();
    final p = _salesPhoneController.text.trim();
    if (s.isNotEmpty && p.isNotEmpty) return 'دعم: $s | مبيعات: $p';
    if (s.isNotEmpty) return s;
    if (p.isNotEmpty) return p;
    return _selectedCustomTemplate?.supportPhone ?? '';
  }

  Future<void> _previewCurrentLayoutSheet(HotspotProfileModel? profile) async {
    if (_networkNameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('اسم الشبكة حقل إجباري، يرجى إدخال اسم الشبكة أولاً للمتابعة'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    final int sampleCount = _effectiveCardsPerPage;

    final sampleCards = List.generate(
      sampleCount,
      (idx) => OfflineCardModel(
        id: 'sample-$idx',
        serialNumber: 'SN-2026-${(idx + 1).toString().padLeft(3, "0")}',
        username: '${_prefixController.text.trim().isNotEmpty ? _prefixController.text.trim() : ""}${849200 + idx}',
        clearPassword: _credentialMode == 0
            ? '${_prefixController.text.trim().isNotEmpty ? _prefixController.text.trim() : ""}${849200 + idx}'
            : (_credentialMode == 2 ? null : '${5540 + idx}'),
        profileId: profile?.id ?? 'prof-preview',
        profileName: profile?.displayName ?? profile?.name ?? 'باقة تجريبية',
        deviceId: 'dev-1',
        price: profile?.price ?? 500,
        currency: 'SDG',
      ),
    );

    final effectiveTemplate = _getEffectiveTemplate();

    try {
      await CardPdfGeneratorService.previewAndPrint(
        cards: sampleCards,
        networkName: _networkNameController.text.trim().isNotEmpty
            ? _networkNameController.text.trim()
            : (_selectedCustomTemplate?.networkName ?? 'سودافاي | SudaFi Net'),
        supportPhone: _effectivePhoneText,
        layout: _selectedPrintLayout,
        batchNumber: 'PREVIEW',
        themePreset: _selectedCustomTemplate?.themePreset.isNotEmpty == true
            ? _selectedCustomTemplate!.themePreset
            : _selectedThemePreset,
        customPrimaryColor: _customPrimaryColor != null
            ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
            : _selectedCustomTemplate?.primaryColor,
        customAccentColor: _customAccentColor != null
            ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
            : _selectedCustomTemplate?.accentColor,
        customBackgroundImageBase64: _pickedImageBase64 ?? _selectedCustomTemplate?.backgroundImageBase64,
        customBackgroundImageBytes: _pickedImageBytes ?? _selectedCustomTemplate?.getSyncBackgroundBytes(),
        showQr: _showQr,
        showPrice: _showPrice,
        showSerial: _showSerial,
        showOuterBorder: _showOuterBorder,
        showNetworkName: _showNetworkName,
        showProfileName: _showProfileName,
        showCredentials: _showCredentials,
        showInstructions: _showInstructions,
        cardWidthMm: _cardWidthMm,
        cardHeightMm: _cardHeightMm,
        instructions: _instructionsController.text.trim().isNotEmpty
            ? _instructionsController.text.trim()
            : (_selectedCustomTemplate?.instructions ?? ''),
        template: effectiveTemplate,
        isLandscape: _isPrintLandscape,
        customCols: _isCustomPrintGrid ? _customGridCols : null,
        customRows: _isCustomPrintGrid ? _customGridRows : null,
        customMargin: _isCustomPrintGrid ? _customGridMargin : null,
        customColors: _getEffectiveCustomColors(),
        elementsLayout: _elementsLayout,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر معاينة الطباعة: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _previewAndGenerateBatchPdf(HotspotProfileModel? profile) async {
    if (_networkNameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('اسم الشبكة حقل إجباري، يرجى إدخال اسم الشبكة أولاً للمتابعة'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    final int totalCount = _selectedQuantity;
    final prefix = _prefixController.text.trim();
    final batchCards = List.generate(
      totalCount,
      (idx) => OfflineCardModel(
        id: 'batch-$idx',
        serialNumber: 'SN-${DateTime.now().year}-${(idx + 1).toString().padLeft(4, "0")}',
        username: '${prefix.isNotEmpty ? prefix : ""}${849200 + idx}',
        clearPassword: _credentialMode == 0
            ? '${prefix.isNotEmpty ? prefix : ""}${849200 + idx}'
            : (_credentialMode == 2 ? null : '${5540 + (idx % 8999)}'),
        profileId: profile?.id ?? 'prof-batch',
        profileName: profile?.displayName ?? profile?.name ?? 'باقة الهوتسبوت',
        deviceId: 'dev-1',
        price: profile?.price ?? 500,
        currency: 'SDG',
      ),
    );

    final effectiveTemplate = _getEffectiveTemplate();

    try {
      await CardPdfGeneratorService.previewAndPrint(
        cards: batchCards,
        networkName: _networkNameController.text.trim().isNotEmpty
            ? _networkNameController.text.trim()
            : (_selectedCustomTemplate?.networkName ?? 'سودافاي | SudaFi Net'),
        supportPhone: _effectivePhoneText,
        layout: _selectedPrintLayout,
        batchNumber: 'BATCH-$totalCount',
        themePreset: _selectedCustomTemplate?.themePreset.isNotEmpty == true
            ? _selectedCustomTemplate!.themePreset
            : _selectedThemePreset,
        customPrimaryColor: _customPrimaryColor != null
            ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
            : _selectedCustomTemplate?.primaryColor,
        customAccentColor: _customAccentColor != null
            ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
            : _selectedCustomTemplate?.accentColor,
        customBackgroundImageBase64: _pickedImageBase64 ?? _selectedCustomTemplate?.backgroundImageBase64,
        customBackgroundImageBytes: _pickedImageBytes ?? _selectedCustomTemplate?.getSyncBackgroundBytes(),
        showQr: _showQr,
        showPrice: _showPrice,
        showSerial: _showSerial,
        showOuterBorder: _showOuterBorder,
        showNetworkName: _showNetworkName,
        showProfileName: _showProfileName,
        showCredentials: _showCredentials,
        showInstructions: _showInstructions,
        cardWidthMm: _cardWidthMm,
        cardHeightMm: _cardHeightMm,
        instructions: _instructionsController.text.trim().isNotEmpty
            ? _instructionsController.text.trim()
            : (_selectedCustomTemplate?.instructions ?? ''),
        template: effectiveTemplate,
        isLandscape: _isPrintLandscape,
        customCols: _isCustomPrintGrid ? _customGridCols : null,
        customRows: _isCustomPrintGrid ? _customGridRows : null,
        customMargin: _isCustomPrintGrid ? _customGridMargin : null,
        customColors: _getEffectiveCustomColors(),
        elementsLayout: _elementsLayout,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر توليد دفعة الطباعة: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _openPdfViewer(HotspotProfileModel? profile) async {
    if (_networkNameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('اسم الشبكة حقل إجباري، يرجى إدخال اسم الشبكة أولاً للمتابعة'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    setState(() => _isGenerating = true);
    final int totalCount = _selectedQuantity;
    final prefix = _prefixController.text.trim();
    final batchCards = List.generate(
      totalCount,
      (idx) => OfflineCardModel(
        id: 'batch-$idx',
        serialNumber: 'SN-${DateTime.now().year}-${(idx + 1).toString().padLeft(4, "0")}',
        username: '${prefix.isNotEmpty ? prefix : ""}${849200 + idx}',
        clearPassword: _credentialMode == 0
            ? '${prefix.isNotEmpty ? prefix : ""}${849200 + idx}'
            : (_credentialMode == 2 ? null : '${5540 + (idx % 8999)}'),
        profileId: profile?.id ?? 'prof-batch',
        profileName: profile?.displayName ?? profile?.name ?? 'باقة الهوتسبوت',
        deviceId: 'dev-1',
        price: profile?.price ?? 500,
        currency: 'SDG',
      ),
    );

    final effectiveTemplate = _getEffectiveTemplate();

    try {
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: batchCards,
        networkName: _networkNameController.text.trim().isNotEmpty
            ? _networkNameController.text.trim()
            : (_selectedCustomTemplate?.networkName ?? 'سودافاي | SudaFi Net'),
        supportPhone: _effectivePhoneText,
        layout: _selectedPrintLayout,
        batchNumber: 'BATCH-$totalCount',
        themePreset: _selectedCustomTemplate?.themePreset.isNotEmpty == true
            ? _selectedCustomTemplate!.themePreset
            : _selectedThemePreset,
        customPrimaryColor: _customPrimaryColor != null
            ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
            : _selectedCustomTemplate?.primaryColor,
        customAccentColor: _customAccentColor != null
            ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
            : _selectedCustomTemplate?.accentColor,
        customBackgroundImageBase64: _pickedImageBase64 ?? _selectedCustomTemplate?.backgroundImageBase64,
        customBackgroundImageBytes: _pickedImageBytes ?? _selectedCustomTemplate?.getSyncBackgroundBytes(),
        showQr: _showQr,
        showPrice: _showPrice,
        showSerial: _showSerial,
        showOuterBorder: _showOuterBorder,
        showNetworkName: _showNetworkName,
        showProfileName: _showProfileName,
        showCredentials: _showCredentials,
        showInstructions: _showInstructions,
        cardWidthMm: _cardWidthMm,
        cardHeightMm: _cardHeightMm,
        instructions: _instructionsController.text.trim().isNotEmpty
            ? _instructionsController.text.trim()
            : (_selectedCustomTemplate?.instructions ?? ''),
        template: effectiveTemplate,
        isLandscape: _isPrintLandscape,
        customCols: _isCustomPrintGrid ? _customGridCols : null,
        customRows: _isCustomPrintGrid ? _customGridRows : null,
        customMargin: _isCustomPrintGrid ? _customGridMargin : null,
        customColors: _getEffectiveCustomColors(),
        elementsLayout: _elementsLayout,
      );

      if (mounted) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PdfViewerScreen(
              pdfBytes: pdfBytes,
              title: 'معاينة PDF الفعلي ($totalCount كرت)',
              filename: 'SudaFi_Batch_${totalCount}_Cards.pdf',
              totalCards: totalCount,
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر توليد ملف PDF للمعاينة: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isGenerating = false);
    }
  }

  Widget _buildElementColorsSection(_ThemeConfig theme) {
    final activeHeader = _customHeaderTextColor ?? Colors.white;
    final activeBody = _customBodyTextColor ?? Colors.white70;
    final activeUser = _customUsernameColor ?? (_customPrimaryColor ?? theme.primaryColor);
    final activePass = _customPasswordColor ?? const Color(0xFFEF4444);
    final activePin = _customPinColor ?? activeUser;
    final activeBorder = _customBorderColor ?? (_customAccentColor ?? theme.accentColor);
    final activeSecondary = _customSecondaryColor ?? (_customAccentColor ?? theme.accentColor);
    final activeBg = _customCardBgColor ?? (_customPrimaryColor ?? theme.primaryColor);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: const [
                    Icon(Icons.palette_outlined, size: 18, color: AppTheme.primary),
                    SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'تخصيص ألوان عناصر الكرت (Element Colors):',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () {
                  setState(() {
                    _customHeaderTextColor = null;
                    _customBodyTextColor = null;
                    _customUsernameColor = null;
                    _customPasswordColor = null;
                    _customPinColor = null;
                    _customBorderColor = null;
                    _customSecondaryColor = null;
                    _customCardBgColor = null;
                    _customPriceTextColor = null;
                    _customPriceBgColor = null;
                  });
                  _saveColorsToStorage();
                },
                child: const Text('استعادة الألوان', style: TextStyle(fontSize: 11, color: Color(0xFFEF4444))),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'قم بتخصيص لون كل عنصر بدقة مع معاينة حية فورية دون تغيير هوية التصميم',
            style: TextStyle(fontSize: 11, color: context.textSecondary),
          ),
          const SizedBox(height: 10),
          Text(
            'لوحة ألوان الكرت السريعة المباشرة:',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: context.textPrimary),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildQuickColorSwatch(const Color(0xFF0F172A), 'كحلي داكن'),
                _buildQuickColorSwatch(const Color(0xFF1E3A8A), 'أزرق ملكي'),
                _buildQuickColorSwatch(const Color(0xFF0D9488), 'فيروزي عصري'),
                _buildQuickColorSwatch(const Color(0xFF065F46), 'أخضر زمردي'),
                _buildQuickColorSwatch(const Color(0xFF991B1B), 'عنابي كلاسيك'),
                _buildQuickColorSwatch(const Color(0xFF4C1D95), 'بنفسجي ملكي'),
                _buildQuickColorSwatch(const Color(0xFF090D16), 'أسود كربوني'),
                _buildQuickColorSwatch(const Color(0xFFF8FAFC), 'أبيض ناصع'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 2.8,
            children: [
              _buildColorItemTile('لون العنوان', activeHeader, (newCol) {
                setState(() => _customHeaderTextColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customHeaderTextColor = null);
                _saveColorsToStorage();
              }),
              _buildColorItemTile('لون النصوص', activeBody, (newCol) {
                setState(() => _customBodyTextColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customBodyTextColor = null);
                _saveColorsToStorage();
              }),
              _buildColorItemTile('لون اسم المستخدم', activeUser, (newCol) {
                setState(() => _customUsernameColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customUsernameColor = null);
                _saveColorsToStorage();
              }),
              _buildColorItemTile('لون كلمة المرور', activePass, (newCol) {
                setState(() => _customPasswordColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customPasswordColor = null);
                _saveColorsToStorage();
              }),
              _buildColorItemTile('لون PIN', activePin, (newCol) {
                setState(() => _customPinColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customPinColor = null);
                _saveColorsToStorage();
              }),
              _buildColorItemTile('لون الإطار', activeBorder, (newCol) {
                setState(() => _customBorderColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customBorderColor = null);
                _saveColorsToStorage();
              }),
              _buildColorItemTile('العناصر الثانوية', activeSecondary, (newCol) {
                setState(() => _customSecondaryColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customSecondaryColor = null);
                _saveColorsToStorage();
              }),
              _buildColorItemTile('لون كتابة السعر', _customPriceTextColor ?? activeSecondary, (newCol) {
                setState(() => _customPriceTextColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customPriceTextColor = null);
                _saveColorsToStorage();
              }),
              _buildColorItemTile('خلفية شارة السعر', _customPriceBgColor ?? activeSecondary.withValues(alpha: 0.2), (newCol) {
                setState(() => _customPriceBgColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customPriceBgColor = null);
                _saveColorsToStorage();
              }),
              _buildColorItemTile('خلفية الكرت', activeBg, (newCol) {
                setState(() => _customCardBgColor = newCol);
                _saveColorsToStorage();
              }, () {
                setState(() => _customCardBgColor = null);
                _saveColorsToStorage();
              }),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuickColorSwatch(Color color, String tooltip) {
    final bool isSelected = _customCardBgColor == color;
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: () {
          setState(() {
            _customCardBgColor = color;
          });
          _saveColorsToStorage();
        },
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(
              color: isSelected ? const Color(0xFF38BDF8) : Colors.white70,
              width: isSelected ? 2.5 : 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 4,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: isSelected
              ? const Icon(Icons.check, size: 18, color: Colors.white)
              : null,
        ),
      ),
    );
  }

  Widget _buildColorItemTile(String label, Color color, ValueChanged<Color> onChanged, VoidCallback onReset) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => _openColorPickerDialog(label, color, onChanged, onReset),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: context.bgScaffold,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: context.borderColor),
        ),
        child: Row(
          children: [
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 1.5),
                boxShadow: [
                  BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 4),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: context.textPrimary),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openColorPickerDialog(String title, Color initialColor, ValueChanged<Color> onChanged, VoidCallback onReset) {
    final List<Color> curatedPalette = [
      const Color(0xFF065F46), // Emerald
      const Color(0xFFF59E0B), // Amber Gold
      const Color(0xFF1E3A8A), // Royal Blue
      const Color(0xFF2563EB), // Cobalt
      const Color(0xFF0F766E), // Teal
      const Color(0xFF06B6D4), // Cyan
      const Color(0xFFEC4899), // Pink
      const Color(0xFF4338CA), // Indigo
      const Color(0xFF090D16), // Cyber Black
      const Color(0xFF00FFCC), // Neon Mint
      const Color(0xFF3E2723), // Roast Coffee
      const Color(0xFFD7CCC8), // Craft Paper
      const Color(0xFF334155), // Slate Grey
      const Color(0xFF38BDF8), // Sky Blue
      const Color(0xFFFFFFFF), // Pure White
      const Color(0xFFEF4444), // Crimson Red
      const Color(0xFFD4AF37), // Metallic Gold
      const Color(0xFF8B5CF6), // Purple
      const Color(0xFF10B981), // Light Green
      const Color(0xFF111827), // Pitch Black
    ];

    Color selectedColor = initialColor;
    final hexCtrl = TextEditingController(text: '#${initialColor.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.bgCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'اختيار: $title',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.textPrimary),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 20),
                        onPressed: () => Navigator.of(ctx).pop(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Swatches
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: curatedPalette.map((col) {
                      final isSel = col.toARGB32() == selectedColor.toARGB32();
                      return GestureDetector(
                        onTap: () {
                          setModalState(() {
                            selectedColor = col;
                            hexCtrl.text = '#${col.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';
                          });
                          onChanged(col);
                        },
                        child: Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: col,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: isSel ? AppTheme.primary : Colors.white,
                              width: isSel ? 3 : 1.5,
                            ),
                            boxShadow: [
                              BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 4),
                            ],
                          ),
                          child: isSel ? Icon(Icons.check, size: 20, color: col.computeLuminance() > 0.5 ? Colors.black : Colors.white) : null,
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),
                  // Hex input
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: selectedColor,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: context.borderColor),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: hexCtrl,
                          decoration: const InputDecoration(
                            labelText: 'كود اللون (Hex)',
                            hintText: '#FFFFFF',
                            isDense: true,
                          ),
                          onChanged: (val) {
                            final parsed = CardColorCustomization.parseHex(val);
                            if (parsed != null) {
                              setModalState(() => selectedColor = parsed);
                              onChanged(parsed);
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFEF4444),
                          side: const BorderSide(color: Color(0xFFEF4444)),
                        ),
                        icon: const Icon(Icons.refresh, size: 16),
                        label: const Text('إعادة للافتراضي'),
                        onPressed: () {
                          onReset();
                          Navigator.of(ctx).pop();
                        },
                      ),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primary,
                          foregroundColor: Colors.white,
                        ),
                        onPressed: () => Navigator.of(ctx).pop(),
                        child: const Text('تأكيد اللون'),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _syncCurrentTemplateLayout() {
    _selectedCustomTemplate = (_selectedCustomTemplate ?? CardTemplateModel(
      id: '',
      name: 'قالب الاستوديو',
      themePreset: _selectedThemePreset,
    )).withElementsLayout(_elementsLayout);
  }

  CardTemplateModel _getEffectiveTemplate() {
    final base = _selectedCustomTemplate ?? CardTemplateModel(
      id: '',
      name: 'قالب الاستوديو',
      themePreset: _selectedThemePreset,
      primaryColor: _customPrimaryColor != null
          ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
          : '',
      accentColor: _customAccentColor != null
          ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
          : '',
      widthMm: _cardWidthMm,
      heightMm: _cardHeightMm,
    );

    return base.copyWith(
      widthMm: _cardWidthMm,
      heightMm: _cardHeightMm,
      primaryColor: _customPrimaryColor != null
          ? '#${_customPrimaryColor!.toARGB32().toRadixString(16).substring(2)}'
          : _selectedCustomTemplate?.primaryColor,
      accentColor: _customAccentColor != null
          ? '#${_customAccentColor!.toARGB32().toRadixString(16).substring(2)}'
          : _selectedCustomTemplate?.accentColor,
      layoutConfig: {
        ...(_selectedCustomTemplate?.layoutConfig ?? {}),
        'networkName': _networkNameController.text.trim().isNotEmpty
            ? _networkNameController.text.trim()
            : (_selectedCustomTemplate?.networkName ?? 'سودافاي'),
        'supportPhone': _effectivePhoneText,
        'instructions': _instructionsController.text.trim(),
        'showPrice': _showPrice,
        'showSerial': _showSerial,
        'showQr': _showQr,
        if (_pickedImageBase64 != null) 'backgroundImageBase64': _pickedImageBase64,
        'patternOverlay': _selectedPatternOverlay.id,
        'patternOpacity': _selectedPatternOpacity,
        'elements': _elementsLayout.toMap(),
        'customColors': _getEffectiveCustomColors().toMap(),
      },
    ).withElementsLayout(_elementsLayout).withCustomColors(_getEffectiveCustomColors());
  }

  Future<void> _saveElementPositionsToCurrentTemplate() async {
    if (_selectedCustomTemplate == null) return;
    _syncCurrentTemplateLayout();
    final updated = _selectedCustomTemplate!;
    final res = await ref.read(cardTemplatesProvider.notifier).updateTemplate(updated);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message']?.toString() ?? 'تم حفظ مواضع العناصر في القالب بنجاح!'),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
    }
  }

  Widget _buildElementPositioningSection() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.tune, color: AppTheme.primary, size: 18),
                  const SizedBox(width: 8),
                  Text(
                    'تخصيص مواضع ومحاذاة العناصر:',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
                  ),
                ],
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_designUndoStack.isNotEmpty)
                    IconButton(
                      icon: const Icon(Icons.undo, size: 18, color: AppTheme.primary),
                      tooltip: 'تراجع عن آخر تعديل',
                      visualDensity: VisualDensity.compact,
                      onPressed: _undoDesignChange,
                    ),
                  IconButton(
                    icon: const Icon(Icons.restart_alt, size: 18, color: Color(0xFFF59E0B)),
                    tooltip: 'إعادة ضبط التصميم للحالة الافتراضية',
                    visualDensity: VisualDensity.compact,
                    onPressed: _handleResetDesign,
                  ),
                  if (_selectedCustomTemplate != null) ...[
                    const SizedBox(width: 4),
                    TextButton.icon(
                      onPressed: _saveElementPositionsToCurrentTemplate,
                      icon: const Icon(Icons.save_outlined, size: 14, color: Color(0xFF10B981)),
                      label: const Text('حفظ في القالب', style: TextStyle(fontSize: 11, color: Color(0xFF10B981), fontWeight: FontWeight.bold)),
                    ),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'تحكم كامل في موضع ومحاذاة وحجم كل عنصر بشكل مستقل ليظهر في المعاينة والـ PDF',
            style: TextStyle(fontSize: 11, color: context.textSecondary),
          ),
          const SizedBox(height: 12),
          _buildElementPlacementRow(
            title: 'اسم الشبكة',
            icon: Icons.wifi,
            placement: _elementsLayout.networkName,
            onChanged: (p) {
              _recordDesignSnapshot();
              setState(() {
                _elementsLayout = _elementsLayout.copyWith(networkName: p);
                _syncCurrentTemplateLayout();
              });
            },
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'سعر الكرت',
            icon: Icons.payments_outlined,
            placement: _elementsLayout.price,
            onChanged: (p) {
              _recordDesignSnapshot();
              setState(() {
                _elementsLayout = _elementsLayout.copyWith(price: p);
                _syncCurrentTemplateLayout();
              });
            },
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'بيانات الحساب (PIN / مستخدم)',
            icon: Icons.lock_outline,
            placement: _elementsLayout.credentials,
            onChanged: (p) {
              _recordDesignSnapshot();
              setState(() {
                _elementsLayout = _elementsLayout.copyWith(credentials: p);
                _syncCurrentTemplateLayout();
              });
            },
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'تفاصيل الباقة (الاسم / الصلاحية / السرعة)',
            icon: Icons.speed,
            placement: _elementsLayout.profileDetails,
            onChanged: (p) {
              _recordDesignSnapshot();
              setState(() {
                _elementsLayout = _elementsLayout.copyWith(profileDetails: p);
                _syncCurrentTemplateLayout();
              });
            },
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'رمز QR',
            icon: Icons.qr_code_2,
            placement: _elementsLayout.qrCode,
            onChanged: (p) {
              _recordDesignSnapshot();
              setState(() {
                _elementsLayout = _elementsLayout.copyWith(qrCode: p);
                _syncCurrentTemplateLayout();
              });
            },
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'التعليمات والإرشادات',
            icon: Icons.info_outline,
            placement: _elementsLayout.instructions,
            onChanged: (p) {
              _recordDesignSnapshot();
              setState(() {
                _elementsLayout = _elementsLayout.copyWith(instructions: p);
                _syncCurrentTemplateLayout();
              });
            },
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'الرقم التسلسلي (S/N)',
            icon: Icons.tag,
            placement: _elementsLayout.serialNumber,
            onChanged: (p) {
              _recordDesignSnapshot();
              setState(() {
                _elementsLayout = _elementsLayout.copyWith(serialNumber: p);
                _syncCurrentTemplateLayout();
              });
            },
          ),
        ],
      ),
    );
  }

  Widget _buildElementPlacementRow({
    required String title,
    required IconData icon,
    required CardElementPlacement placement,
    required ValueChanged<CardElementPlacement> onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 15, color: context.textSecondary),
            const SizedBox(width: 6),
            Text(
              title,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: context.textPrimary),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            // Vertical placement
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: context.bgCardAlt,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: context.borderColor),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: placement.vertical,
                    isDense: true,
                    style: TextStyle(fontSize: 11, color: context.textPrimary),
                    dropdownColor: context.bgCard,
                    items: const [
                      DropdownMenuItem(value: 'top', child: Text('أعلى (Top)')),
                      DropdownMenuItem(value: 'middle', child: Text('وسط (Middle)')),
                      DropdownMenuItem(value: 'bottom', child: Text('أسفل (Bottom)')),
                    ],
                    onChanged: (v) {
                      if (v != null) onChanged(placement.copyWith(vertical: v));
                    },
                  ),
                ),
              ),
            ),
            const SizedBox(width: 6),
            // Horizontal alignment
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: context.bgCardAlt,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: context.borderColor),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: placement.align,
                    isDense: true,
                    style: TextStyle(fontSize: 11, color: context.textPrimary),
                    dropdownColor: context.bgCard,
                    items: const [
                      DropdownMenuItem(value: 'right', child: Text('يمين (Right)')),
                      DropdownMenuItem(value: 'center', child: Text('وسط (Center)')),
                      DropdownMenuItem(value: 'left', child: Text('يسار (Left)')),
                    ],
                    onChanged: (v) {
                      if (v != null) onChanged(placement.copyWith(align: v));
                    },
                  ),
                ),
              ),
            ),
            const SizedBox(width: 6),
            // Scale
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: context.bgCardAlt,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: context.borderColor),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: placement.scale,
                    isDense: true,
                    style: TextStyle(fontSize: 11, color: context.textPrimary),
                    dropdownColor: context.bgCard,
                    items: const [
                      DropdownMenuItem(value: 'small', child: Text('صغير (Small)')),
                      DropdownMenuItem(value: 'normal', child: Text('عادي (Normal)')),
                      DropdownMenuItem(value: 'large', child: Text('كبير (Large)')),
                    ],
                    onChanged: (v) {
                      if (v != null) onChanged(placement.copyWith(scale: v));
                    },
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
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
              color: context.isDarkMode
                  ? color.withValues(alpha: 0.1)
                  : (isWarning ? const Color(0xFFFEE2E2) : const Color(0xFFFEF3C7)),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: context.isDarkMode
                    ? color.withValues(alpha: 0.35)
                    : (isWarning ? const Color(0xFFFCA5A5) : const Color(0xFFF59E0B).withValues(alpha: 0.5)),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(
                      isWarning ? Icons.warning_amber_rounded : Icons.info_outline_rounded,
                      color: context.isDarkMode ? color : (isWarning ? const Color(0xFFDC2626) : const Color(0xFFB45309)),
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        text,
                        style: TextStyle(
                          color: isWarning
                              ? (context.isDarkMode ? const Color(0xFFFCA5A5) : const Color(0xFFB91C1C))
                              : (context.isDarkMode ? const Color(0xFFFDE68A) : const Color(0xFF92400E)),
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
            color: context.bgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: (!isUnlimited && limit != null && remaining < 100)
                  ? const Color(0xFFEF4444)
                  : context.borderColor,
            ),
          ),
          child: Row(
            children: [
              Icon(Icons.credit_card_outlined, color: context.skyColor, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isUnlimited
                      ? 'الباقة: $planName • حصة الكروت: غير محدودة'
                      : 'الباقة: $planName • الرصيد المتبقي: $remaining من أصل $limit كرت',
                  style: TextStyle(color: context.textPrimary, fontSize: 12, fontWeight: FontWeight.w600),
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

class _FlutterZoneEntry {
  final Widget widget;
  final String vertical;
  final String align;

  _FlutterZoneEntry(this.widget, this.vertical, this.align);
}

class _DesignSnapshot {
  final Color? customPrimaryColor;
  final Color? customAccentColor;
  final String selectedThemePreset;
  final int cardWidthMm;
  final int cardHeightMm;
  final bool showQr;
  final bool showPrice;
  final bool showSpeed;
  final bool showValidity;
  final bool showQuota;
  final bool showSerial;
  final bool showOuterBorder;
  final bool showNetworkName;
  final bool showProfileName;
  final bool showCredentials;
  final bool showInstructions;
  final CardElementsLayout elementsLayout;
  final String instructions;
  final String headerTitle;
  final String supportPhone;
  final Uint8List? pickedImageBytes;
  final String? pickedImageBase64;

  _DesignSnapshot({
    required this.customPrimaryColor,
    required this.customAccentColor,
    required this.selectedThemePreset,
    required this.cardWidthMm,
    required this.cardHeightMm,
    required this.showQr,
    required this.showPrice,
    required this.showSpeed,
    required this.showValidity,
    required this.showQuota,
    required this.showSerial,
    this.showOuterBorder = true,
    this.showNetworkName = true,
    this.showProfileName = true,
    this.showCredentials = true,
    this.showInstructions = true,
    required this.elementsLayout,
    required this.instructions,
    required this.headerTitle,
    required this.supportPhone,
    required this.pickedImageBytes,
    required this.pickedImageBase64,
  });
}
