import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

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

  late String _themePreset;
  late Color _primaryColor;
  late Color _accentColor;
  late int _widthMm;
  late int _heightMm;
  late String _orientation;
  late bool _isDefault;

  late bool _showQr;
  late bool _showPin;
  late bool _showPrice;
  late bool _showValidity;
  late bool _showSpeed;

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

    _showQr = tpl?.showQr ?? true;
    _showPin = tpl?.showPin ?? true;
    _showPrice = tpl?.showPrice ?? true;
    _showValidity = tpl?.showValidity ?? true;
    _showSpeed = tpl?.showSpeed ?? true;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _networkNameController.dispose();
    _headerTitleController.dispose();
    _supportPhoneController.dispose();
    _instructionsController.dispose();
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

    setState(() => _isSaving = true);

    final updatedTemplate = CardTemplateModel(
      id: widget.template?.id ?? '',
      name: _nameController.text.trim(),
      widthMm: _widthMm,
      heightMm: _heightMm,
      orientation: _orientation,
      themePreset: _themePreset,
      primaryColor: _colorToHex(_primaryColor),
      accentColor: _colorToHex(_accentColor),
      isDefault: _isDefault,
      layoutConfig: {
        'showQr': _showQr,
        'showPin': _showPin,
        'showPrice': _showPrice,
        'showValidity': _showValidity,
        'showSpeed': _showSpeed,
        'networkName': _networkNameController.text.trim(),
        'headerTitle': _headerTitleController.text.trim(),
        'supportPhone': _supportPhoneController.text.trim(),
        'instructions': _instructionsController.text.trim(),
      },
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
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Text(
          widget.template == null ? 'إنشاء قالب طباعة جديد' : 'تعديل تصميم القالب',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
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
      children: _cardSizePresets.map((preset) {
        final isSelected = _widthMm == preset['width'] && _heightMm == preset['height'];
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF1E3A8A).withValues(alpha: 0.35) : const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isSelected ? const Color(0xFF38BDF8) : const Color(0xFF334155),
              width: isSelected ? 2 : 1,
            ),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () {
              setState(() {
                _widthMm = preset['width'] as int;
                _heightMm = preset['height'] as int;
                _orientation = preset['orientation'] as String;
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
                                color: isSelected ? Colors.white : const Color(0xFFE2E8F0),
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
      }).toList(),
    );
  }

  Widget _buildInteractiveCardPreview() {
    final isPortrait = _heightMm > _widthMm;
    return Center(
      child: Container(
        width: double.infinity,
        constraints: BoxConstraints(
          maxWidth: isPortrait ? 260 : 360,
          minHeight: isPortrait ? 300 : 180,
        ),
        margin: const EdgeInsets.symmetric(vertical: 8),
        padding: const EdgeInsets.all(14),
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
          border: Border.all(color: _accentColor.withValues(alpha: 0.2), width: 1.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Bar: Network Name & Price
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.wifi, color: Colors.white, size: 14),
                      ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          _networkNameController.text.trim().isEmpty
                              ? 'سودافاي هوتسبوت'
                              : _networkNameController.text.trim(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                if (_showPrice)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: _accentColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      '500 SDG',
                      style: TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.w900,
                        fontSize: 12,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),

            // Card Title
            Text(
              _headerTitleController.text.trim().isEmpty
                  ? 'باقة إنترنت فائقة السرعة'
                  : _headerTitleController.text.trim(),
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.2),
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),

            // Middle: QR Code + Credentials
            Row(
              children: [
                if (_showQr)
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: QrImageView(
                      data: 'http://sudafi.hotspot/login?username=982341&password=123',
                      version: QrVersions.auto,
                      size: 64,
                    ),
                  ),
                if (_showQr) const SizedBox(width: 12),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('اسم المستخدم (User):', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 9)),
                        const Text(
                          '874291',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 2,
                            fontFamily: 'monospace',
                          ),
                        ),
                        if (_showPin) ...[
                          const SizedBox(height: 4),
                          const Text('الرمز السري (PIN):', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 9)),
                          const Text(
                            '5541',
                            style: TextStyle(
                              color: Color(0xFFFBBF24),
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.5,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Speed & Validity Badges
            Row(
              children: [
                if (_showSpeed)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    margin: const EdgeInsets.only(left: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('⚡ سرعة: 5M/5M', style: TextStyle(color: Colors.white, fontSize: 9)),
                  ),
                if (_showValidity)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('⏳ الصلاحية: 24 ساعة', style: TextStyle(color: Colors.white, fontSize: 9)),
                  ),
              ],
            ),
            const SizedBox(height: 6),

            // Footer instructions and Support Phone
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    _instructionsController.text.trim(),
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.2), fontSize: 8),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (_supportPhoneController.text.trim().isNotEmpty)
                  Text(
                    'دعم: ${_supportPhoneController.text.trim()}',
                    style: TextStyle(color: _accentColor, fontSize: 8, fontWeight: FontWeight.bold),
                  ),
              ],
            ),
          ],
        ),
      ),
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
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isSelected ? const Color(0xFF38BDF8) : const Color(0xFF334155),
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
          style: const TextStyle(color: Colors.white),
          decoration: _inputDecoration('اسم القالب التعريفي', 'مثال: قالب دوري المحترفين 2026'),
          validator: (v) => v == null || v.trim().isEmpty ? 'الرجاء إدخال اسم القالب' : null,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _networkNameController,
          style: const TextStyle(color: Colors.white),
          decoration: _inputDecoration('اسم الشبكة الظاهر على الكرت', 'مثال: شبكة سودافاي الذكية'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _headerTitleController,
          style: const TextStyle(color: Colors.white),
          decoration: _inputDecoration('عنوان الكرت الترويجي', 'مثال: كرت إنترنت فائق السرعة'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _supportPhoneController,
          style: const TextStyle(color: Colors.white),
          decoration: _inputDecoration('رقم هاتف الدعم والاستفسار', 'مثال: +249 912 345 678'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _instructionsController,
          style: const TextStyle(color: Colors.white),
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
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        children: [
          _buildSwitchRow('إظهار رمز الاستجابة السريعة (QR Code)', _showQr, (v) => setState(() => _showQr = v)),
          const Divider(color: Color(0xFF334155), height: 1),
          _buildSwitchRow('إظهار حقل الرمز السري (PIN / Password)', _showPin, (v) => setState(() => _showPin = v)),
          const Divider(color: Color(0xFF334155), height: 1),
          _buildSwitchRow('إظهار سعر الكرت', _showPrice, (v) => setState(() => _showPrice = v)),
          const Divider(color: Color(0xFF334155), height: 1),
          _buildSwitchRow('إظهار مدة صلاحية الباقة', _showValidity, (v) => setState(() => _showValidity = v)),
          const Divider(color: Color(0xFF334155), height: 1),
          _buildSwitchRow('إظهار محدد السرعة (Speed Limit)', _showSpeed, (v) => setState(() => _showSpeed = v)),
          const Divider(color: Color(0xFF334155), height: 1),
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
          Text(title, style: const TextStyle(color: Colors.white, fontSize: 13)),
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
      labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xFF475569), fontSize: 12),
      filled: true,
      fillColor: const Color(0xFF1E293B),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF38BDF8), width: 1.5)),
    );
  }
}
