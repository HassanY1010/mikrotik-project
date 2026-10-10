import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

class CreateHotspotProfileScreen extends ConsumerStatefulWidget {
  final HotspotProfileModel? editProfile;

  const CreateHotspotProfileScreen({super.key, this.editProfile});

  @override
  ConsumerState<CreateHotspotProfileScreen> createState() => _CreateHotspotProfileScreenState();
}

class _CreateHotspotProfileScreenState extends ConsumerState<CreateHotspotProfileScreen> {
  final _formKey = GlobalKey<FormState>();

  late TextEditingController _nameController;
  late TextEditingController _displayNameController;
  late TextEditingController _rateLimitController;
  late TextEditingController _validityController;
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

  final List<Map<String, String>> _validityPresets = [
    {'label': '1 ساعة', 'value': '1h'},
    {'label': '3 ساعات', 'value': '3h'},
    {'label': '12 ساعة', 'value': '12h'},
    {'label': '1 يوم', 'value': '1d'},
    {'label': '3 أيام', 'value': '3d'},
    {'label': '1 أسبوع', 'value': '7d'},
    {'label': '1 شهر', 'value': '30d'},
  ];

  @override
  void initState() {
    super.initState();
    final p = widget.editProfile;

    _nameController = TextEditingController(text: p?.name ?? '');
    _displayNameController = TextEditingController(text: p?.displayName ?? '');
    _rateLimitController = TextEditingController(text: p?.rateLimit ?? '2M/2M');
    _validityController = TextEditingController(text: p?.validity ?? '1d');
    _priceController = TextEditingController(text: p != null ? p.price.toStringAsFixed(0) : '500');
    _sharedUsersController = TextEditingController(text: '1');

    _selectedDeviceId = p?.deviceId;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _displayNameController.dispose();
    _rateLimitController.dispose();
    _validityController.dispose();
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

    if (widget.editProfile != null) {
      result = await notifier.updateProfile(
        id: widget.editProfile!.id,
        name: _nameController.text.trim(),
        displayName: _displayNameController.text.trim(),
        rateLimit: _rateLimitController.text.trim(),
        validity: _validityController.text.trim(),
        sessionTimeout: _validityController.text.trim(),
        price: double.tryParse(_priceController.text.trim()) ?? 0,
        sharedUsers: int.tryParse(_sharedUsersController.text.trim()) ?? 1,
      );
    } else {
      result = await notifier.createProfile(
        name: _nameController.text.trim(),
        deviceId: _selectedDeviceId!,
        displayName: _displayNameController.text.trim(),
        rateLimit: _rateLimitController.text.trim(),
        sessionTimeout: _validityController.text.trim(),
        validity: _validityController.text.trim(),
        price: double.tryParse(_priceController.text.trim()) ?? 0,
        sharedUsers: int.tryParse(_sharedUsersController.text.trim()) ?? 1,
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
      Navigator.pop(context, true);
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
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Text(
          isEdit ? 'تعديل باقة الهوتسبوت' : 'إنشاء باقة هوتسبوت جديدة',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
      ),
      body: routersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF38BDF8))),
        error: (err, _) => Center(
          child: Text('فشل تحميل الراوترات: $err', style: const TextStyle(color: Color(0xFFEF4444))),
        ),
        data: (routers) {
          if (_selectedDeviceId == null && routers.isNotEmpty) {
            _selectedDeviceId = routers.first.id;
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
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF334155)),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _selectedDeviceId,
                        isExpanded: true,
                        dropdownColor: const Color(0xFF1E293B),
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
                      backgroundColor: const Color(0xFF1E293B),
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
                  style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                  decoration: _inputDecoration('أو أدخل سرعة مخصصة', 'مثال: 4M/4M أو 512k/1M'),
                  validator: (v) => v == null || v.trim().isEmpty ? 'الرجاء تحديد السرعة' : null,
                ),
                const SizedBox(height: 20),

                // Validity / Session Timeout
                _buildSectionTitle('مدة الصلاحية / الجلسة (Validity):', Icons.timer_outlined),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _validityPresets.map((item) {
                    final isSel = _validityController.text.trim() == item['value'];
                    return ChoiceChip(
                      label: Text(item['label']!),
                      selected: isSel,
                      selectedColor: const Color(0xFF10B981),
                      backgroundColor: const Color(0xFF1E293B),
                      labelStyle: TextStyle(
                        color: isSel ? Colors.white : const Color(0xFF94A3B8),
                        fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                      ),
                      onSelected: (_) => setState(() => _validityController.text = item['value']!),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _validityController,
                  style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                  decoration: _inputDecoration('أو أدخل مدة مخصصة', 'مثال: 1h, 3h, 1d, 7d, 30d'),
                  validator: (v) => v == null || v.trim().isEmpty ? 'الرجاء تحديد الصلاحية' : null,
                ),
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
      fillColor: const Color(0xFF1E293B),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF38BDF8), width: 1.5)),
    );
  }
}
