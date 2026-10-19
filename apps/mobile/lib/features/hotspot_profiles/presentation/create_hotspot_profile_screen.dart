import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/validity_helper.dart';

class CreateHotspotProfileScreen extends ConsumerStatefulWidget {
  final HotspotProfileModel? editProfile;
  final String? initialDeviceId;

  const CreateHotspotProfileScreen({super.key, this.editProfile, this.initialDeviceId});

  @override
  ConsumerState<CreateHotspotProfileScreen> createState() => _CreateHotspotProfileScreenState();
}

class _CreateHotspotProfileScreenState extends ConsumerState<CreateHotspotProfileScreen> {
  final _formKey = GlobalKey<FormState>();

  late TextEditingController _nameController;
  late TextEditingController _displayNameController;
  late TextEditingController _rateLimitController;
  late TextEditingController _validityAmountController;
  String _validityUnit = 'd'; // Exactly 3 units: 'm' (Minute), 'h' (Hour), 'd' (Day)
  late TextEditingController _priceController;
  late TextEditingController _sharedUsersController;

  String? _selectedDeviceId;
  bool _isSubmitting = false;

  final List<String> _rateLimitPresets = [
    '1M/1M',
    '2M/2M',
    '3M/3M',
    '5M/5M',
    '10M/10M',
    '20M/20M',
  ];

  bool _isQuotaLimited = false;
  late TextEditingController _dataLimitGbController;
  final List<int> _gbPresets = [1, 3, 5, 10, 20];

  @override
  void initState() {
    super.initState();
    final p = widget.editProfile;

    _nameController = TextEditingController(text: p?.name ?? '');
    _displayNameController = TextEditingController(text: p?.displayName ?? '');
    _rateLimitController = TextEditingController(text: p?.rateLimit ?? '2M/2M');

    // Parse existing validity duration or fallback to default 1d
    final rawValidity = p?.validity ?? p?.sessionTimeout ?? '1d';
    final parsed = parseValidityParts(rawValidity, defaultAmount: 1, defaultUnit: 'd');
    _validityUnit = parsed.unit;
    _validityAmountController = TextEditingController(text: parsed.amount.toString());
    _validityAmountController.addListener(() {
      if (mounted) setState(() {});
    });

    // Initialize quota limit state
    _isQuotaLimited = p != null && !p.isUnlimited;
    final initialGb = p?.quotaGb != null
        ? (p!.quotaGb! % 1 == 0 ? p.quotaGb!.toInt().toString() : p.quotaGb!.toStringAsFixed(2))
        : '5';
    _dataLimitGbController = TextEditingController(text: initialGb);
    _dataLimitGbController.addListener(() {
      if (mounted) setState(() {});
    });

    _priceController = TextEditingController(text: p != null ? p.price.toStringAsFixed(0) : '500');
    _sharedUsersController = TextEditingController(text: '1');

    _selectedDeviceId = p?.deviceId ?? widget.initialDeviceId;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _displayNameController.dispose();
    _rateLimitController.dispose();
    _validityAmountController.dispose();
    _dataLimitGbController.dispose();
    _priceController.dispose();
    _sharedUsersController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit(List<RouterDeviceModel> routers) async {
    if (!_formKey.currentState!.validate()) return;

    if (widget.editProfile == null && (_selectedDeviceId == null || _selectedDeviceId!.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('الرجاء اختيار راوتر ميكروتك المستهدف للبروفايل'),
          backgroundColor: Color(0xFFEF4444),
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    final notifier = ref.read(profilesProvider.notifier);
    Map<String, dynamic> result;

    final amountText = _validityAmountController.text.trim();
    final amount = int.tryParse(amountText) ?? 1;
    final validDuration = '$amount${_validityUnit.toLowerCase()}';

    final double? dataLimitGb = _isQuotaLimited
        ? double.tryParse(_dataLimitGbController.text.trim())
        : null;

    if (widget.editProfile != null) {
      result = await notifier.updateProfile(
        id: widget.editProfile!.id,
        name: _nameController.text.trim(),
        displayName: _displayNameController.text.trim(),
        rateLimit: _rateLimitController.text.trim(),
        validity: validDuration,
        sessionTimeout: validDuration,
        price: double.tryParse(_priceController.text.trim()) ?? 0,
        sharedUsers: int.tryParse(_sharedUsersController.text.trim()) ?? 1,
        dataLimitGb: dataLimitGb,
        updateDataLimit: true,
      );
    } else {
      result = await notifier.createProfile(
        name: _nameController.text.trim(),
        deviceId: _selectedDeviceId!,
        displayName: _displayNameController.text.trim(),
        rateLimit: _rateLimitController.text.trim(),
        sessionTimeout: validDuration,
        validity: validDuration,
        price: double.tryParse(_priceController.text.trim()) ?? 0,
        sharedUsers: int.tryParse(_sharedUsersController.text.trim()) ?? 1,
        dataLimitGb: dataLimitGb,
      );
    }

    setState(() => _isSubmitting = false);

    if (!mounted) return;

    if (result['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.editProfile != null
                ? 'تم تحديث باقة الهوتسبوت بنجاح!'
                : 'تم إنشاء باقة الهوتسبوت ومزامنتها مع راوتر ميكروتك بنجاح!',
          ),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
      final dynamic rawData = result['data'] ?? result['profile'] ?? result;
      final newId = rawData is Map ? rawData['id']?.toString() : null;
      Navigator.pop(context, newId ?? true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result['message']?.toString() ?? 'فشل إنشاء البروفايل على الراوتر'),
          backgroundColor: const Color(0xFFEF4444),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final routersAsync = ref.watch(routersProvider);
    final isEdit = widget.editProfile != null;

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: Text(
          isEdit ? 'تعديل باقة الهوتسبوت' : 'إنشاء باقة هوتسبوت جديدة',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: context.textPrimary),
        ),
      ),
      body: routersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF38BDF8))),
        error: (err, _) => Center(
          child: Text('فشل تحميل الراوترات: $err', style: const TextStyle(color: Color(0xFFEF4444))),
        ),
        data: (routers) {
          if (_selectedDeviceId == null && routers.isNotEmpty) {
            _selectedDeviceId = (widget.initialDeviceId != null &&
                    routers.any((r) => r.id == widget.initialDeviceId))
                ? widget.initialDeviceId
                : routers.first.id;
          }

          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Router Selection (if not editing)
                if (!isEdit) ...[
                  _buildSectionTitle('الراوتر المستهدف (RouterOS Target):', Icons.router),
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
                        value: _selectedDeviceId,
                        isExpanded: true,
                        dropdownColor: context.bgCard,
                        items: routers.map((r) {
                          return DropdownMenuItem<String>(
                            value: r.id,
                            child: Row(
                              children: [
                                Container(
                                  width: 10,
                                  height: 10,
                                  decoration: BoxDecoration(
                                    color: r.isOnline ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Text(
                                  r.name,
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  '(${r.host})',
                                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                        onChanged: (val) {
                          if (val != null) setState(() => _selectedDeviceId = val);
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                ],

                // Profile Name
                _buildSectionTitle('اسم الباقة في ميكروتك (Profile Name):', Icons.tag),
                const SizedBox(height: 8),
                TextFormField(
                  key: const Key('profile_name_input'),
                  controller: _nameController,
                  style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                  decoration: _inputDecoration(
                    'الاسم الإنجليزي (بدون مسافات)',
                    'مثال: 1hour-2m أو daily-5m',
                  ),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) return 'الرجاء إدخال اسم الباقة';
                    if (v.contains(' ')) return 'يجب ألا يحتوي الاسم على مسافات';
                    return null;
                  },
                ),
                const SizedBox(height: 20),

                // Display Name (Commercial)
                _buildSectionTitle('الاسم التجاري للمستخدمين:', Icons.label_outline),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _displayNameController,
                  style: const TextStyle(color: Colors.white),
                  decoration: _inputDecoration(
                    'الاسم الظاهر في نقطة البيع والكروت',
                    'مثال: باقة ساعة واحدة - سرعة 2 ميجا',
                  ),
                ),
                const SizedBox(height: 20),

                // Speed Limit
                _buildSectionTitle('محدد السرعة (Rate Limit rx/tx):', Icons.speed),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _rateLimitPresets.map((rate) {
                    final isSel = _rateLimitController.text.trim() == rate;
                    return ChoiceChip(
                      label: Text(rate),
                      selected: isSel,
                      selectedColor: const Color(0xFF0284C7),
                      backgroundColor: context.bgCard,
                      labelStyle: TextStyle(
                        color: isSel ? Colors.white : const Color(0xFF94A3B8),
                        fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                      ),
                      onSelected: (_) => setState(() => _rateLimitController.text = rate),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _rateLimitController,
                  style: TextStyle(color: context.textPrimary, fontFamily: 'monospace'),
                  decoration: _inputDecoration('أو أدخل سرعة مخصصة', 'مثال: 4M/4M أو 512k/1M'),
                  validator: (v) => v == null || v.trim().isEmpty ? 'الرجاء تحديد السرعة' : null,
                ),
                const SizedBox(height: 20),

                // Validity / Session Timeout Section
                _buildSectionTitle('مدة الصلاحية / الجلسة (Validity):', Icons.timer_outlined),
                const SizedBox(height: 8),

                // أولاً: اختيار وحدة المدة (دقيقة M، ساعة H، يوم D)
                Row(
                  children: [
                    _buildUnitOption(
                      unitKey: 'm',
                      label: 'دقيقة',
                      symbol: 'M',
                    ),
                    const SizedBox(width: 8),
                    _buildUnitOption(
                      unitKey: 'h',
                      label: 'ساعة',
                      symbol: 'H',
                    ),
                    const SizedBox(width: 8),
                    _buildUnitOption(
                      unitKey: 'd',
                      label: 'يوم',
                      symbol: 'D',
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // ثانياً: إدخال العدد مع مؤشر الوحدة والتحقق من صحته
                TextFormField(
                  key: const Key('validity_amount_input'),
                  controller: _validityAmountController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  style: TextStyle(
                    color: context.textPrimary,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                  decoration: _inputDecoration(
                    'أدخل العدد المطلوب',
                    _validityUnit == 'm'
                        ? 'مثال: 15 أو 30 أو 50'
                        : _validityUnit == 'h'
                            ? 'مثال: 1 أو 5 أو 70'
                            : 'مثال: 1 أو 7 أو 30',
                  ).copyWith(
                    prefixIcon: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.4)),
                      ),
                      child: Text(
                        _getUnitBadge(_validityUnit),
                        style: const TextStyle(
                          color: Color(0xFF10B981),
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                  validator: (v) {
                    final trimmed = v?.trim() ?? '';
                    if (trimmed.isEmpty) return 'الرجاء إدخال عدد مدة الصلاحية';
                    final n = int.tryParse(trimmed);
                    if (n == null || n <= 0) return 'يجب إدخال عدد صحيح موجب أكبر من الصفر';
                    if (n > 10000) return 'الحد الأقصى المسموح به هو 10000';
                    return null;
                  },
                ),
                const SizedBox(height: 8),

                // معاينة القيمة الناتجة تلقائياً
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: context.bgCard,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: context.borderColor.withValues(alpha: 0.6)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline, size: 16, color: Color(0xFF38BDF8)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _getComputedValidityPreview(),
                          style: TextStyle(
                            color: context.textSecondary,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Quota / Data Package Type Section
                _buildSectionTitle('نوع باقة الإنترنت (حجم البيانات):', Icons.data_usage_rounded),
                const SizedBox(height: 8),

                Row(
                  children: [
                    _buildQuotaTypeOption(
                      optionKey: 'quota_type_unlimited',
                      title: 'باقة مفتوحة',
                      subtitle: 'بدون تحديد حجم بيانات',
                      icon: Icons.all_inclusive_rounded,
                      isSelected: !_isQuotaLimited,
                      onTap: () => setState(() => _isQuotaLimited = false),
                    ),
                    const SizedBox(width: 10),
                    _buildQuotaTypeOption(
                      optionKey: 'quota_type_limited',
                      title: 'باقة محددة (GB)',
                      subtitle: 'تحديد سعة بالجيجابايت',
                      icon: Icons.pie_chart_outline_rounded,
                      isSelected: _isQuotaLimited,
                      onTap: () => setState(() => _isQuotaLimited = true),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                if (!_isQuotaLimited)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.3)),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.check_circle_outline, size: 18, color: Color(0xFF10B981)),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'باقة مفتوحة: تمنح المستخدم إمكانية استخدام الإنترنت دون فرض حد أقصى لاستهلاك البيانات بالجيجابايت، مع تطبيق قيود الصلاحية والسرعة المحددة.',
                            style: TextStyle(color: Color(0xFF10B981), fontSize: 12, height: 1.4),
                          ),
                        ),
                      ],
                    ),
                  )
                else ...[
                  // Presets chips for GB
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _gbPresets.map((gb) {
                      final isSel = _dataLimitGbController.text.trim() == gb.toString();
                      return ChoiceChip(
                        key: Key('gb_preset_$gb'),
                        label: Text('$gb GB'),
                        selected: isSel,
                        selectedColor: const Color(0xFF0284C7),
                        backgroundColor: context.bgCard,
                        labelStyle: TextStyle(
                          color: isSel ? Colors.white : const Color(0xFF94A3B8),
                          fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                        ),
                        onSelected: (_) => setState(() => _dataLimitGbController.text = gb.toString()),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 10),

                  // GB Input
                  TextFormField(
                    key: const Key('data_limit_gb_input'),
                    controller: _dataLimitGbController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
                    style: TextStyle(
                      color: context.textPrimary,
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                    decoration: _inputDecoration(
                      'حجم البيانات المسموح بها بالجيجابايت (GB)',
                      'مثال: 1 أو 5 أو 10',
                    ).copyWith(
                      prefixIcon: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0284C7).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFF0284C7).withValues(alpha: 0.4)),
                        ),
                        child: const Text(
                          'GB جيجابايت',
                          style: TextStyle(
                            color: Color(0xFF38BDF8),
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                    validator: (v) {
                      if (!_isQuotaLimited) return null;
                      final trimmed = v?.trim() ?? '';
                      if (trimmed.isEmpty) return 'الرجاء إدخال حجم البيانات بالجيجابايت';
                      final n = double.tryParse(trimmed);
                      if (n == null || n <= 0) return 'يجب أن يكون حجم البيانات أكبر من صفر';
                      if (n > 100000) return 'الحد الأقصى المسموح به هو 100000 GB';
                      return null;
                    },
                  ),
                  const SizedBox(height: 8),

                  // Calculated Mikrotik enforcement note
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: context.bgCard,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: context.borderColor.withValues(alpha: 0.6)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.bolt, size: 16, color: Color(0xFFF59E0B)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _getComputedQuotaPreview(),
                                style: TextStyle(
                                  color: context.textPrimary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'يتم تطبيق هذا الحد فعلياً على حساب المستخدم في MikroTik (limit-bytes-total). عند استهلاك كامل البيانات، يتم قطع الاتصال وتعطيل الحساب فوراً.',
                          style: TextStyle(
                            color: context.textSecondary,
                            fontSize: 11,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 20),

                // Price & Shared Users
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildSectionTitle('سعر البيع (SDG):', Icons.payments_outlined),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _priceController,
                            keyboardType: TextInputType.number,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                            decoration: _inputDecoration('السعر', '500'),
                            validator: (v) => v == null || double.tryParse(v) == null ? 'أدخل سعراً صحيحاً' : null,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildSectionTitle('المستخدمين المشتركين:', Icons.group_outlined),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _sharedUsersController,
                            keyboardType: TextInputType.number,
                            style: const TextStyle(color: Colors.white),
                            decoration: _inputDecoration('Shared Users', '1'),
                            validator: (v) {
                              final n = int.tryParse(v ?? '');
                              if (n == null || n < 1) return 'رقم صحيح (1+)';
                              return null;
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                // Submit Button
                ElevatedButton.icon(
                  onPressed: _isSubmitting ? null : () => _handleSubmit(routers),
                  icon: _isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.check_circle_outline, size: 20),
                  label: Text(
                    _isSubmitting
                        ? 'جاري الحفظ والمزامنة مع الراوتر...'
                        : (isEdit ? 'حفظ تعديلات الباقة' : 'إنشاء الباقة والمزامنة الآن'),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 18, color: const Color(0xFF38BDF8)),
        const SizedBox(width: 6),
        Text(
          title,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
        ),
      ],
    );
  }

  InputDecoration _inputDecoration(String label, String hint) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xFF475569), fontSize: 12),
      filled: true,
      fillColor: context.bgCard,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: context.borderColor)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: context.borderColor)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF38BDF8), width: 1.5)),
    );
  }

  Widget _buildUnitOption({
    required String unitKey,
    required String label,
    required String symbol,
  }) {
    final isSelected = _validityUnit == unitKey;
    return Expanded(
      child: InkWell(
        onTap: () {
          if (_validityUnit != unitKey) {
            setState(() {
              _validityUnit = unitKey;
            });
          }
        },
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
          decoration: BoxDecoration(
            color: isSelected
                ? const Color(0xFF10B981).withValues(alpha: 0.2)
                : context.bgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? const Color(0xFF10B981) : context.borderColor,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : context.textPrimary,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 2),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: isSelected
                      ? const Color(0xFF10B981)
                      : context.borderColor.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  symbol,
                  style: TextStyle(
                    color: isSelected ? Colors.white : context.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _getUnitBadge(String unit) {
    switch (unit) {
      case 'm':
        return 'دقيقة (M)';
      case 'h':
        return 'ساعة (H)';
      case 'd':
        return 'يوم (D)';
      default:
        return 'يوم (D)';
    }
  }

  String _getComputedValidityPreview() {
    final text = _validityAmountController.text.trim();
    final amount = int.tryParse(text);
    if (amount == null || amount <= 0) {
      return 'القيمة المحسوبة: الرجاء كتابة عدد صحيح موجب';
    }
    final rawCode = '$amount${_validityUnit.toUpperCase()}';
    final arabicText = formatValidityArabic('$amount$_validityUnit');
    return 'القيمة المحسوبة: $rawCode ($arabicText)';
  }

  Widget _buildQuotaTypeOption({
    required String optionKey,
    required String title,
    required String subtitle,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: InkWell(
        key: Key(optionKey),
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isSelected
                ? const Color(0xFF0284C7).withValues(alpha: 0.18)
                : context.bgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? const Color(0xFF38BDF8) : context.borderColor,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Icon(
                    icon,
                    size: 20,
                    color: isSelected ? const Color(0xFF38BDF8) : context.textSecondary,
                  ),
                  Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isSelected ? const Color(0xFF38BDF8) : context.borderColor,
                        width: 2,
                      ),
                      color: isSelected ? const Color(0xFF38BDF8) : Colors.transparent,
                    ),
                    child: isSelected
                        ? const Center(
                            child: Icon(Icons.check, size: 12, color: Colors.white),
                          )
                        : null,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                title,
                style: TextStyle(
                  color: isSelected ? Colors.white : context.textPrimary,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: TextStyle(
                  color: isSelected ? const Color(0xFF94A3B8) : context.textMuted,
                  fontSize: 10,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _getComputedQuotaPreview() {
    final text = _dataLimitGbController.text.trim();
    final gb = double.tryParse(text);
    if (gb == null || gb <= 0) {
      return 'الحد الفعلي: أدخل قيمة جيجابايت أكبر من صفر';
    }
    final bytes = (gb * 1024 * 1024 * 1024).round();
    return 'الحد الفعلي في MikroTik: $bytes بايت ($gb GB)';
  }
}
