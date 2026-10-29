import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';

class CardTemplateEditorScreen extends ConsumerStatefulWidget {
  final CardTemplateModel? template; // null for creating new

  const CardTemplateEditorScreen({
    super.key,
    this.template,
  });

  @override
  ConsumerState<CardTemplateEditorScreen> createState() => _CardTemplateEditorScreenState();
}

class _CardTemplateEditorScreenState extends ConsumerState<CardTemplateEditorScreen> {
  final _formKey = GlobalKey<FormState>();

  late TextEditingController _nameController;
  late TextEditingController _networkNameController;
  late TextEditingController _headerTitleController;
  late TextEditingController _supportPhoneController;
  late TextEditingController _instructionsController;
  late TextEditingController _widthController;
  late TextEditingController _heightController;

  late String _themePreset;
  late Color _primaryColor;
  late Color _accentColor;
  late int _widthMm;
  late int _heightMm;
  late String _orientation;
  late bool _isDefault;
  bool _isCustomSize = false;

  late bool _showQr;
  late bool _showPin;
  late bool _showPrice;
  late bool _showValidity;
  late bool _showSpeed;
  late CardElementsLayout _elementsLayout;

  bool _isSaving = false;

  final List<Map<String, dynamic>> _cardSizePresets = const [
    {
      'id': 'CREDIT_CARD',
      'name': 'كرت قياسي (85×54 مم)',
      'desc': 'المقاس المعتمد القياسي لبطاقات الكروت (Credit Card)',
      'width': 85,
      'height': 54,
      'orientation': 'landscape',
      'icon': Icons.credit_card,
    },
    {
      'id': 'TICKET',
      'name': 'تذكرة هوتسبوت (100×40 مم)',
      'desc': 'تنسيق تذكرة أو إيصال أفقي واسع مناسب لنقاط البيع',
      'width': 100,
      'height': 40,
      'orientation': 'landscape',
      'icon': Icons.confirmation_number_outlined,
    },
    {
      'id': 'COMPACT',
      'name': 'كرت مدمج (70×35 مم)',
      'desc': 'مقاس اقتصادي موفر للورق في طباعة الورق العادي A4',
      'width': 70,
      'height': 35,
      'orientation': 'landscape',
      'icon': Icons.crop_landscape,
    },
    {
      'id': 'MINI_GRID',
      'name': 'كرت شبكة مصغر (50×30 مم)',
      'desc': 'للطباعة المكثفة السريعة (حتى 100 كرت في الورقة الواحدة)',
      'width': 50,
      'height': 30,
      'orientation': 'landscape',
      'icon': Icons.grid_view_rounded,
    },
    {
      'id': 'PORTRAIT',
      'name': 'كرت عمودي (54×85 مم)',
      'desc': 'تصميم طولي عمودي مناسب للحافظات والتعليق',
      'width': 54,
      'height': 85,
      'orientation': 'portrait',
      'icon': Icons.crop_portrait,
    },
  ];

  final List<Map<String, dynamic>> _presetThemes = [
    {
      'id': 'FOOTBALL',
      'name': 'كرة القدم الذهبي',
      'primary': const Color(0xFF065F46),
      'accent': const Color(0xFFF59E0B),
      'icon': Icons.sports_soccer,
    },
    {
      'id': 'EID_MUBARAK',
      'name': 'عيد مبارك الملكي',
      'primary': const Color(0xFF1E3A8A),
      'accent': const Color(0xFFD97706),
      'icon': Icons.nights_stay,
    },
    {
      'id': 'TURQUOISE',
      'name': 'الفيروزي الحديث',
      'primary': const Color(0xFF0F766E),
      'accent': const Color(0xFF06B6D4),
      'icon': Icons.wifi,
    },
    {
      'id': 'TICKET',
      'name': 'تذكرة كلاسيكية',
      'primary': const Color(0xFF4338CA),
      'accent': const Color(0xFFEC4899),
      'icon': Icons.confirmation_number,
    },
    {
      'id': 'COMPACT',
      'name': 'مدمج أنيق',
      'primary': const Color(0xFF334155),
      'accent': const Color(0xFF64748B),
      'icon': Icons.grid_view,
    },
    {
      'id': 'CUSTOM',
      'name': 'مخصص بالألوان',
      'primary': const Color(0xFF7C3AED),
      'accent': const Color(0xFF10B981),
      'icon': Icons.palette,
    },
  ];

  final List<Color> _colorPalette = [
    const Color(0xFF065F46),
    const Color(0xFF1E3A8A),
    const Color(0xFF0F766E),
    const Color(0xFF4338CA),
    const Color(0xFF334155),
    const Color(0xFF7C3AED),
    const Color(0xFFB91C1C),
    const Color(0xFFC2410C),
    const Color(0xFFF59E0B),
    const Color(0xFF10B981),
    const Color(0xFF06B6D4),
    const Color(0xFFEC4899),
  ];

  @override
  void initState() {
    super.initState();
    final tpl = widget.template;

    _nameController = TextEditingController(
      text: tpl?.name ?? 'قالب كرت جديد',
    );
    _networkNameController = TextEditingController(
      text: tpl?.networkName ?? 'سودافاي هوتسبوت',
    );
    _headerTitleController = TextEditingController(
      text: tpl?.headerTitle ?? 'كرت إنترنت فائق السرعة',
    );
    _supportPhoneController = TextEditingController(
      text: tpl?.supportPhone ?? '+249 123 456 789',
    );
    _instructionsController = TextEditingController(
      text: tpl?.instructions ?? 'امسح الرمز أو أدخل اسم المستخدم لتسجيل الدخول',
    );

    _themePreset = tpl?.themePreset ?? 'FOOTBALL';
    _primaryColor = _hexToColor(tpl?.primaryColor, const Color(0xFF065F46));
    _accentColor = _hexToColor(tpl?.accentColor, const Color(0xFFF59E0B));
    _widthMm = tpl?.widthMm ?? 85;
    _heightMm = tpl?.heightMm ?? 54;
    _orientation = tpl?.orientation ?? 'landscape';
    _isDefault = tpl?.isDefault ?? false;

    _isCustomSize = !_cardSizePresets.any((p) => p['width'] == _widthMm && p['height'] == _heightMm);
    _widthController = TextEditingController(text: _widthMm.toString());
    _heightController = TextEditingController(text: _heightMm.toString());

    _showQr = tpl?.showQr ?? true;
    _showPin = tpl?.showPin ?? true;
    _showPrice = tpl?.showPrice ?? true;
    _showValidity = tpl?.showValidity ?? true;
    _showSpeed = tpl?.showSpeed ?? true;
    _elementsLayout = tpl?.elementsLayout ?? const CardElementsLayout();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _networkNameController.dispose();
    _headerTitleController.dispose();
    _supportPhoneController.dispose();
    _instructionsController.dispose();
    _widthController.dispose();
    _heightController.dispose();
    super.dispose();
  }

  Color _hexToColor(String? hex, Color defaultColor) {
    if (hex == null || hex.isEmpty) return defaultColor;
    try {
      final clean = hex.replaceAll('#', '').trim();
      if (clean.length == 6) {
        return Color(int.parse('FF$clean', radix: 16));
      } else if (clean.length == 8) {
        return Color(int.parse(clean, radix: 16));
      }
    } catch (_) {}
    return defaultColor;
  }

  String _colorToHex(Color color) {
    return '#${color.toARGB32().toRadixString(16).substring(2).toUpperCase()}';
  }

  void _applyPreset(Map<String, dynamic> preset) {
    setState(() {
      _themePreset = preset['id'] as String;
      _primaryColor = preset['primary'] as Color;
      _accentColor = preset['accent'] as Color;
    });
  }

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) return;

    int widthVal = _widthMm;
    int heightVal = _heightMm;
    if (_isCustomSize) {
      widthVal = int.tryParse(_widthController.text.trim()) ?? _widthMm;
      heightVal = int.tryParse(_heightController.text.trim()) ?? _heightMm;
      if (widthVal < 10 || widthVal > 1000 || heightVal < 10 || heightVal > 1000) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('الأبعاد بالمليمتر يجب أن تكون بين 10 و 1000 مم'),
            backgroundColor: Color(0xFFEF4444),
          ),
        );
        return;
      }
    }

    setState(() => _isSaving = true);

    final baseConfig = Map<String, dynamic>.from(widget.template?.layoutConfig ?? {});
    baseConfig['showQr'] = _showQr;
    baseConfig['showPin'] = _showPin;
    baseConfig['showPrice'] = _showPrice;
    baseConfig['showValidity'] = _showValidity;
    baseConfig['showSpeed'] = _showSpeed;
    baseConfig['networkName'] = _networkNameController.text.trim();
    baseConfig['headerTitle'] = _headerTitleController.text.trim();
    baseConfig['supportPhone'] = _supportPhoneController.text.trim();
    baseConfig['instructions'] = _instructionsController.text.trim();
    baseConfig['elements'] = _elementsLayout.toMap();

    final updatedTemplate = CardTemplateModel(
      id: widget.template?.id ?? '',
      name: _nameController.text.trim(),
      widthMm: widthVal,
      heightMm: heightVal,
      orientation: _orientation,
      backgroundDesign: widget.template?.backgroundDesign,
      themePreset: _themePreset,
      primaryColor: _colorToHex(_primaryColor),
      accentColor: _colorToHex(_accentColor),
      isDefault: _isDefault,
      layoutConfig: baseConfig,
    );

    final notifier = ref.read(cardTemplatesProvider.notifier);
    Map<String, dynamic> result;

    if (widget.template != null) {
      result = await notifier.updateTemplate(updatedTemplate);
    } else {
      result = await notifier.createTemplate(updatedTemplate);
    }

    setState(() => _isSaving = false);

    if (!mounted) return;

    if (result['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم حفظ تصميم القالب بنجاح!'),
          backgroundColor: Color(0xFF10B981),
        ),
      );
      Navigator.pop(context, true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result['message']?.toString() ?? 'حدث خطأ أثناء حفظ القالب'),
          backgroundColor: const Color(0xFFEF4444),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: Text(
          widget.template == null ? 'إنشاء قالب طباعة جديد' : 'تعديل تصميم القالب',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: context.textPrimary),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: ElevatedButton.icon(
              onPressed: _isSaving ? null : _handleSave,
              icon: _isSaving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.check, size: 18),
              label: Text(_isSaving ? 'جاري الحفظ...' : 'حفظ القالب'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Live Preview Section
            _buildLivePreviewHeader(),
            const SizedBox(height: 8),
            _buildInteractiveCardPreview(),
            const SizedBox(height: 24),

            // Pre-defined Card Sizes Selector
            _buildSectionTitle('المقاسات والقوالب المحددة مسبقًا:', Icons.aspect_ratio),
            const SizedBox(height: 10),
            _buildCardSizeSelector(),
            const SizedBox(height: 24),

            // Theme Presets Selector
            _buildSectionTitle('اختر نمط الثيم الأساسي:', Icons.style),
            const SizedBox(height: 10),
            _buildThemePresetsGrid(),
            const SizedBox(height: 24),

            // Color Customization
            _buildSectionTitle('الألوان الرئيسية للتصميم:', Icons.colorize),
            const SizedBox(height: 10),
            _buildColorPickers(),
            const SizedBox(height: 24),

            // Card Content Fields
            _buildSectionTitle('نصوص وبيانات الكرت:', Icons.text_fields),
            const SizedBox(height: 12),
            _buildContentInputs(),
            const SizedBox(height: 24),

            // Card Element Toggles
            _buildSectionTitle('العناصر المرئية على الكرت:', Icons.visibility),
            const SizedBox(height: 10),
            _buildElementToggles(),
            const SizedBox(height: 24),

            // Card Element Positions & Alignment Customization
            _buildSectionTitle('تخصيص مواضع ومحاذاة عناصر الكرت:', Icons.dashboard_customize_outlined),
            const SizedBox(height: 10),
            _buildElementPositioningSection(),
            const SizedBox(height: 32),

            // Bottom Save Button
            ElevatedButton(
              onPressed: _isSaving ? null : _handleSave,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: Text(
                _isSaving ? 'جاري الحفظ والمزامنة...' : 'حفظ التصميم في النظام',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
              ),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildLivePreviewHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: const [
            Icon(Icons.remove_red_eye_outlined, color: Color(0xFF38BDF8), size: 20),
            SizedBox(width: 8),
            Text(
              'معاينة الكرت الحية',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ],
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0xFF0284C7).withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF0284C7).withValues(alpha: 0.2)),
          ),
          child: Text(
            '$_widthMm × $_heightMm مم (${_orientation == 'portrait' ? 'عمودي' : 'أفقي'})',
            style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }

  Widget _buildCardSizeSelector() {
    return Column(
      children: [
        ..._cardSizePresets.map((preset) {
          final isSelected = !_isCustomSize && _widthMm == preset['width'] && _heightMm == preset['height'];
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFF1E3A8A).withValues(alpha: 0.35) : context.bgCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isSelected ? const Color(0xFF38BDF8) : context.borderColor,
                width: isSelected ? 2 : 1,
              ),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () {
                setState(() {
                  _isCustomSize = false;
                  _widthMm = preset['width'] as int;
                  _heightMm = preset['height'] as int;
                  _orientation = preset['orientation'] as String;
                  _widthController.text = _widthMm.toString();
                  _heightController.text = _heightMm.toString();
                });
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: isSelected
                            ? const Color(0xFF38BDF8).withValues(alpha: 0.2)
                            : const Color(0xFF334155).withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isSelected ? const Color(0xFF38BDF8) : Colors.transparent,
                          width: 1,
                        ),
                      ),
                      child: Icon(
                        preset['icon'] as IconData,
                        color: isSelected ? const Color(0xFF38BDF8) : const Color(0xFF94A3B8),
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                preset['name'] as String,
                                style: TextStyle(
                                  color: isSelected ? Colors.white : context.textPrimary,
                                  fontWeight: isSelected ? FontWeight.bold : FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                              const Spacer(),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: isSelected ? const Color(0xFF38BDF8).withValues(alpha: 0.2) : const Color(0xFF0F172A),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: isSelected ? const Color(0xFF38BDF8) : const Color(0xFF334155),
                                  ),
                                ),
                                child: Text(
                                  '${preset['width']}×${preset['height']} مم',
                                  style: TextStyle(
                                    color: isSelected ? const Color(0xFF38BDF8) : const Color(0xFF94A3B8),
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            preset['desc'] as String,
                            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(
                      isSelected ? Icons.check_circle : Icons.radio_button_unchecked,
                      color: isSelected ? const Color(0xFF38BDF8) : const Color(0xFF64748B),
                      size: 20,
                    ),
                  ],
                ),
              ),
            ),
          );
        }),

        // Custom Dimensions Preset Card
        Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: _isCustomSize ? const Color(0xFF1E3A8A).withValues(alpha: 0.35) : context.bgCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _isCustomSize ? const Color(0xFF38BDF8) : context.borderColor,
              width: _isCustomSize ? 2 : 1,
            ),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () {
              setState(() {
                _isCustomSize = true;
                _widthController.text = _widthMm.toString();
                _heightController.text = _heightMm.toString();
              });
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: _isCustomSize
                              ? const Color(0xFF38BDF8).withValues(alpha: 0.2)
                              : const Color(0xFF334155).withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _isCustomSize ? const Color(0xFF38BDF8) : Colors.transparent,
                            width: 1,
                          ),
                        ),
                        child: Icon(
                          Icons.straighten,
                          color: _isCustomSize ? const Color(0xFF38BDF8) : const Color(0xFF94A3B8),
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  'مقاس مخصص (أبعاد يدوية)',
                                  style: TextStyle(
                                    color: _isCustomSize ? Colors.white : context.textPrimary,
                                    fontWeight: _isCustomSize ? FontWeight.bold : FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                                const Spacer(),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: _isCustomSize ? const Color(0xFF38BDF8).withValues(alpha: 0.2) : const Color(0xFF0F172A),
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(
                                      color: _isCustomSize ? const Color(0xFF38BDF8) : const Color(0xFF334155),
                                    ),
                                  ),
                                  child: Text(
                                    '$_widthMm×$_heightMm مم',
                                    style: TextStyle(
                                      color: _isCustomSize ? const Color(0xFF38BDF8) : const Color(0xFF94A3B8),
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 3),
                            const Text(
                              'حدد أبعاد الكرت والاتجاه بحسب حجم ونوع الطابعة لديك',
                              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        _isCustomSize ? Icons.check_circle : Icons.radio_button_unchecked,
                        color: _isCustomSize ? const Color(0xFF38BDF8) : const Color(0xFF64748B),
                        size: 20,
                      ),
                    ],
                  ),
                  if (_isCustomSize) ...[
                    const Divider(color: Color(0xFF334155), height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _widthController,
                            keyboardType: TextInputType.number,
                            style: TextStyle(color: context.textPrimary, fontSize: 13),
                            decoration: InputDecoration(
                              labelText: 'العرض (مم)',
                              labelStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                              hintText: '85',
                              hintStyle: TextStyle(color: context.textMuted),
                              filled: true,
                              fillColor: context.bgCardAlt,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            onChanged: (val) {
                              final w = int.tryParse(val.trim());
                              if (w != null && w > 0) {
                                setState(() {
                                  _widthMm = w;
                                });
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            controller: _heightController,
                            keyboardType: TextInputType.number,
                            style: TextStyle(color: context.textPrimary, fontSize: 13),
                            decoration: InputDecoration(
                              labelText: 'الارتفاع (مم)',
                              labelStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                              hintText: '54',
                              hintStyle: TextStyle(color: context.textMuted),
                              filled: true,
                              fillColor: context.bgCardAlt,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            onChanged: (val) {
                              final h = int.tryParse(val.trim());
                              if (h != null && h > 0) {
                                setState(() {
                                  _heightMm = h;
                                });
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        DropdownButtonHideUnderline(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0F172A),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: const Color(0xFF334155)),
                            ),
                            child: DropdownButton<String>(
                              value: _orientation,
                              dropdownColor: const Color(0xFF1E293B),
                              style: const TextStyle(color: Colors.white, fontSize: 12),
                              items: const [
                                DropdownMenuItem(value: 'landscape', child: Text('أفقي')),
                                DropdownMenuItem(value: 'portrait', child: Text('عمودي')),
                              ],
                              onChanged: (val) {
                                if (val != null) setState(() => _orientation = val);
                              },
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }


  double _scaleFactorFlutter(String scale) {
    switch (scale) {
      case 'small':
        return 0.82;
      case 'large':
        return 1.25;
      case 'normal':
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

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        leftCol ?? const SizedBox.shrink(),
        centerCol ?? const SizedBox.shrink(),
        rightCol ?? const SizedBox.shrink(),
      ],
    );
  }

  Widget _buildInteractiveCardPreview() {
    final isPortrait = _heightMm > _widthMm;
    final scale = _scaleFactorFlutter;

    // 1. Network Name
    final netPlacement = _elementsLayout.networkName;
    final Widget netWidget = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.wifi, color: _accentColor, size: 14 * scale(netPlacement.scale)),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            _networkNameController.text.trim().isEmpty ? 'سودافاي هوتسبوت' : _networkNameController.text.trim(),
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 13 * scale(netPlacement.scale),
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );

    // 2. Price
    final pricePlacement = _elementsLayout.price;
    final bool canShowPrice = _showPrice && pricePlacement.isVisible;
    final Widget? priceWidget = canShowPrice
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(
              color: _accentColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              '500 SDG',
              style: TextStyle(
                color: Colors.black,
                fontWeight: FontWeight.w900,
                fontSize: 12 * scale(pricePlacement.scale),
              ),
            ),
          )
        : null;

    // 3. Header title / Profile
    final profPlacement = _elementsLayout.profileDetails;
    final bool canShowProf = profPlacement.isVisible;
    final Widget? profileWidget = canShowProf
        ? Column(
            crossAxisAlignment: profPlacement.align == 'left'
                ? CrossAxisAlignment.start
                : (profPlacement.align == 'center' ? CrossAxisAlignment.center : CrossAxisAlignment.end),
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _headerTitleController.text.trim().isEmpty ? 'باقة إنترنت فائقة السرعة' : _headerTitleController.text.trim(),
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.9),
                  fontSize: 11 * scale(profPlacement.scale),
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (_showSpeed || _showValidity) ...[
                const SizedBox(height: 3),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_showSpeed)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                        margin: const EdgeInsets.only(left: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          '⚡ 5M/5M',
                          style: TextStyle(color: Colors.white, fontSize: 8 * scale(profPlacement.scale)),
                        ),
                      ),
                    if (_showValidity)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          '⏳ 24 ساعة',
                          style: TextStyle(color: Colors.white, fontSize: 8 * scale(profPlacement.scale)),
                        ),
                      ),
                  ],
                ),
              ],
            ],
          )
        : null;

    // 4. Credentials
    final credPlacement = _elementsLayout.credentials;
    final bool canShowCred = credPlacement.isVisible;
    final Widget? credWidget = canShowCred
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A).withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('اسم المستخدم (User):', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 8)),
                Text(
                  '874291',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14 * scale(credPlacement.scale),
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.5,
                    fontFamily: 'monospace',
                  ),
                ),
                if (_showPin) ...[
                  const SizedBox(height: 3),
                  const Text('الرمز السري (PIN):', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 8)),
                  Text(
                    '5541',
                    style: TextStyle(
                      color: const Color(0xFFFBBF24),
                      fontSize: 12 * scale(credPlacement.scale),
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.2,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ],
            ),
          )
        : null;

    // 5. QR Code
    final qrPlacement = _elementsLayout.qrCode;
    final bool canShowQr = _showQr && qrPlacement.isVisible;
    final Widget? qrWidget = canShowQr
        ? Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: QrImageView(
              data: 'http://sudafi.hotspot/login?username=982341&password=123',
              version: QrVersions.auto,
              size: 58 * scale(qrPlacement.scale),
            ),
          )
        : null;

    // 6. Instructions & Support Phone
    final instPlacement = _elementsLayout.instructions;
    final bool canShowInst = instPlacement.isVisible;
    final Widget? instWidget = canShowInst
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  _instructionsController.text.trim().isNotEmpty
                      ? _instructionsController.text.trim()
                      : 'امسح رمز QR للاتصال المباشر',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 8 * scale(instPlacement.scale)),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (_supportPhoneController.text.trim().isNotEmpty) ...[
                const SizedBox(width: 6),
                Text(
                  'دعم: ${_supportPhoneController.text.trim()}',
                  style: TextStyle(color: _accentColor, fontSize: 8 * scale(instPlacement.scale), fontWeight: FontWeight.bold),
                ),
              ],
            ],
          )
        : null;

    // 7. Serial
    final snPlacement = _elementsLayout.serialNumber;
    final bool canShowSn = snPlacement.isVisible;
    final Widget? snWidget = canShowSn
        ? Text(
            'S/N: 20261024-001',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.6),
              fontSize: 8 * scale(snPlacement.scale),
            ),
          )
        : null;

    // Vertical zones
    final List<_EditorZoneEntry> allEntries = [
      _EditorZoneEntry(netWidget, netPlacement.vertical, netPlacement.align),
      if (priceWidget != null) _EditorZoneEntry(priceWidget, pricePlacement.vertical, pricePlacement.align),
      if (profileWidget != null) _EditorZoneEntry(profileWidget, profPlacement.vertical, profPlacement.align),
      if (credWidget != null) _EditorZoneEntry(credWidget, credPlacement.vertical, credPlacement.align),
      if (qrWidget != null) _EditorZoneEntry(qrWidget, qrPlacement.vertical, qrPlacement.align),
      if (instWidget != null) _EditorZoneEntry(instWidget, instPlacement.vertical, instPlacement.align),
      if (snWidget != null) _EditorZoneEntry(snWidget, snPlacement.vertical, snPlacement.align),
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
      topContainer = Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: _buildZoneFlutterRow(topLeft, topCenter, topRight),
      );
    }

    Widget? middleContainer;
    if (midLeft.isNotEmpty || midCenter.isNotEmpty || midRight.isNotEmpty) {
      middleContainer = Padding(
        padding: const EdgeInsets.all(14),
        child: _buildZoneFlutterRow(midLeft, midCenter, midRight),
      );
    }

    Widget? bottomContainer;
    if (botLeft.isNotEmpty || botCenter.isNotEmpty || botRight.isNotEmpty) {
      bottomContainer = Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.25),
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(16),
            bottomRight: Radius.circular(16),
          ),
        ),
        child: _buildZoneFlutterRow(botLeft, botCenter, botRight),
      );
    }

    return Center(
      child: Container(
        width: double.infinity,
        constraints: BoxConstraints(
          maxWidth: isPortrait ? 260 : 360,
          minHeight: isPortrait ? 300 : 180,
        ),
        margin: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [_primaryColor, _primaryColor.withValues(alpha: 0.85)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: _primaryColor.withValues(alpha: 0.2),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
          border: Border.all(color: _accentColor.withValues(alpha: 0.4), width: 1.5),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (topContainer != null) topContainer,
            if (topContainer != null && (middleContainer != null || bottomContainer != null))
              const Divider(color: Colors.white24, height: 1),
            if (middleContainer != null) middleContainer,
            if (bottomContainer != null) bottomContainer,
          ],
        ),
      ),
    );
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
            children: [
              const Icon(Icons.tune, color: Color(0xFF38BDF8), size: 18),
              const SizedBox(width: 8),
              Text(
                'تخصيص مواضع ومحاذاة العناصر:',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: context.textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'تحكم كامل في موضع ومحاذاة وحجم كل عنصر بشكل مستقل ليتم حفظه ضمن القالب واستخدامه في الطباعة',
            style: TextStyle(fontSize: 11, color: context.textSecondary),
          ),
          const SizedBox(height: 12),
          _buildElementPlacementRow(
            title: 'اسم الشبكة',
            icon: Icons.wifi,
            placement: _elementsLayout.networkName,
            onChanged: (p) => setState(() => _elementsLayout = _elementsLayout.copyWith(networkName: p)),
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'سعر الكرت',
            icon: Icons.payments_outlined,
            placement: _elementsLayout.price,
            onChanged: (p) => setState(() => _elementsLayout = _elementsLayout.copyWith(price: p)),
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'بيانات الحساب (PIN / مستخدم)',
            icon: Icons.lock_outline,
            placement: _elementsLayout.credentials,
            onChanged: (p) => setState(() => _elementsLayout = _elementsLayout.copyWith(credentials: p)),
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'تفاصيل الباقة والعنوان (العنوان / الصلاحية / السرعة)',
            icon: Icons.speed,
            placement: _elementsLayout.profileDetails,
            onChanged: (p) => setState(() => _elementsLayout = _elementsLayout.copyWith(profileDetails: p)),
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'رمز QR',
            icon: Icons.qr_code_2,
            placement: _elementsLayout.qrCode,
            onChanged: (p) => setState(() => _elementsLayout = _elementsLayout.copyWith(qrCode: p)),
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'التعليمات والدعم الفني',
            icon: Icons.info_outline,
            placement: _elementsLayout.instructions,
            onChanged: (p) => setState(() => _elementsLayout = _elementsLayout.copyWith(instructions: p)),
          ),
          const Divider(height: 16),
          _buildElementPlacementRow(
            title: 'الرقم التسلسلي (S/N)',
            icon: Icons.tag,
            placement: _elementsLayout.serialNumber,
            onChanged: (p) => setState(() => _elementsLayout = _elementsLayout.copyWith(serialNumber: p)),
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

  Widget _buildSectionTitle(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 18, color: const Color(0xFF38BDF8)),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
        ),
      ],
    );
  }

  Widget _buildThemePresetsGrid() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _presetThemes.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 2.5,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemBuilder: (ctx, idx) {
        final preset = _presetThemes[idx];
        final isSelected = _themePreset == preset['id'];

        return InkWell(
          onTap: () => _applyPreset(preset),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: context.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isSelected ? const Color(0xFF38BDF8) : context.borderColor,
                width: isSelected ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: preset['primary'] as Color,
                    shape: BoxShape.circle,
                    border: Border.all(color: preset['accent'] as Color, width: 2),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    preset['name'] as String,
                    style: TextStyle(
                      color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                      fontSize: 12,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildColorPickers() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('اللون الأساسي (Primary Background):', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
        const SizedBox(height: 8),
        SizedBox(
          height: 38,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: _colorPalette.length,
            itemBuilder: (ctx, i) {
              final c = _colorPalette[i];
              final isSel = _primaryColor.toARGB32() == c.toARGB32();
              return GestureDetector(
                onTap: () => setState(() => _primaryColor = c),
                child: Container(
                  width: 38,
                  height: 38,
                  margin: const EdgeInsets.only(left: 8),
                  decoration: BoxDecoration(
                    color: c,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isSel ? Colors.white : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                  child: isSel ? const Icon(Icons.check, size: 18, color: Colors.white) : null,
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 14),
        const Text('لون التمييز والأسعار (Accent Color):', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
        const SizedBox(height: 8),
        SizedBox(
          height: 38,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: _colorPalette.length,
            itemBuilder: (ctx, i) {
              final c = _colorPalette[i];
              final isSel = _accentColor.toARGB32() == c.toARGB32();
              return GestureDetector(
                onTap: () => setState(() => _accentColor = c),
                child: Container(
                  width: 38,
                  height: 38,
                  margin: const EdgeInsets.only(left: 8),
                  decoration: BoxDecoration(
                    color: c,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isSel ? Colors.white : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                  child: isSel ? const Icon(Icons.check, size: 18, color: Colors.white) : null,
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildContentInputs() {
    return Column(
      children: [
        TextFormField(
          controller: _nameController,
          cursorColor: context.textPrimary,
          style: TextStyle(color: context.textPrimary),
          decoration: _inputDecoration('اسم القالب التعريفي', 'مثال: قالب دوري المحترفين 2026'),
          validator: (v) => v == null || v.trim().isEmpty ? 'الرجاء إدخال اسم القالب' : null,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _networkNameController,
          cursorColor: context.textPrimary,
          style: TextStyle(color: context.textPrimary),
          decoration: _inputDecoration('اسم الشبكة الظاهر على الكرت', 'مثال: شبكة سودافاي الذكية'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _headerTitleController,
          cursorColor: context.textPrimary,
          style: TextStyle(color: context.textPrimary),
          decoration: _inputDecoration('عنوان الكرت الترويجي', 'مثال: كرت إنترنت فائق السرعة'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _supportPhoneController,
          cursorColor: context.textPrimary,
          style: TextStyle(color: context.textPrimary),
          decoration: _inputDecoration('رقم هاتف الدعم والاستفسار', 'مثال: +249 912 345 678'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _instructionsController,
          cursorColor: context.textPrimary,
          style: TextStyle(color: context.textPrimary),
          decoration: _inputDecoration('إرشادات تسجيل الدخول بالأسفل', 'مثال: امسح الرمز أو أدخل الكود للدخول'),
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }

  Widget _buildElementToggles() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        children: [
          _buildSwitchRow('إظهار رمز الاستجابة السريعة (QR Code)', _showQr, (v) => setState(() => _showQr = v)),
          Divider(color: context.borderColor, height: 1),
          _buildSwitchRow('إظهار حقل الرمز السري (PIN / Password)', _showPin, (v) => setState(() => _showPin = v)),
          Divider(color: context.borderColor, height: 1),
          _buildSwitchRow('إظهار سعر الكرت', _showPrice, (v) => setState(() => _showPrice = v)),
          Divider(color: context.borderColor, height: 1),
          _buildSwitchRow('إظهار مدة صلاحية الباقة', _showValidity, (v) => setState(() => _showValidity = v)),
          Divider(color: context.borderColor, height: 1),
          _buildSwitchRow('إظهار محدد السرعة (Speed Limit)', _showSpeed, (v) => setState(() => _showSpeed = v)),
          Divider(color: context.borderColor, height: 1),
          _buildSwitchRow('تعيين كقالب افتراضي لطباعة الكروت', _isDefault, (v) => setState(() => _isDefault = v)),
        ],
      ),
    );
  }

  Widget _buildSwitchRow(String title, bool val, ValueChanged<bool> onChanged) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: TextStyle(color: context.textPrimary, fontSize: 13)),
          Switch(
            value: val,
            onChanged: onChanged,
            activeThumbColor: const Color(0xFF10B981),
          ),
        ],
      ),
    );
  }

  InputDecoration _inputDecoration(String label, String hint) {
    return InputDecoration(
      labelText: label,
      labelStyle: TextStyle(color: context.textSecondary, fontSize: 13),
      hintText: hint,
      hintStyle: TextStyle(color: context.textMuted, fontSize: 12),
      filled: true,
      fillColor: context.bgCard,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: context.borderColor)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: context.borderColor)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF38BDF8), width: 1.5)),
    );
  }
}

class _EditorZoneEntry {
  final Widget widget;
  final String vertical;
  final String align;

  _EditorZoneEntry(this.widget, this.vertical, this.align);
}
