import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers.dart';
import '../../../../core/theme/app_theme.dart';

class CreateEditPppoeProfileDialog extends ConsumerStatefulWidget {
  final PppoeProfileModel? existingProfile;

  const CreateEditPppoeProfileDialog({super.key, this.existingProfile});

  @override
  ConsumerState<CreateEditPppoeProfileDialog> createState() => _CreateEditPppoeProfileDialogState();
}

class _CreateEditPppoeProfileDialogState extends ConsumerState<CreateEditPppoeProfileDialog> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _nameController;
  late final TextEditingController _rateLimitController;
  late final TextEditingController _localAddressController;
  late final TextEditingController _remoteAddressController;
  late final TextEditingController _dnsServersController;
  late final TextEditingController _priceController;
  late final TextEditingController _descriptionController;
  bool _onlyOne = true;
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final p = widget.existingProfile;
    _nameController = TextEditingController(text: p?.name ?? '');
    _rateLimitController = TextEditingController(text: p?.rateLimit ?? '10M/10M');
    _localAddressController = TextEditingController(text: p?.localAddress ?? '10.100.0.1');
    _remoteAddressController = TextEditingController(text: p?.remoteAddress ?? 'pppoe-pool');
    _dnsServersController = TextEditingController(text: p?.dnsServers ?? '8.8.8.8,1.1.1.1');
    _priceController = TextEditingController(text: p != null ? p.price.toStringAsFixed(0) : '5000');
    _descriptionController = TextEditingController(text: p?.description ?? '');
    _onlyOne = p?.onlyOne ?? true;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _rateLimitController.dispose();
    _localAddressController.dispose();
    _remoteAddressController.dispose();
    _dnsServersController.dispose();
    _priceController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final name = _nameController.text.trim();
    final rateLimit = _rateLimitController.text.trim();
    final localAddress = _localAddressController.text.trim();
    final remoteAddress = _remoteAddressController.text.trim();
    final dnsServers = _dnsServersController.text.trim();
    final price = double.tryParse(_priceController.text.trim()) ?? 0.0;
    final description = _descriptionController.text.trim();

    final notifier = ref.read(pppoeProfilesProvider.notifier);

    Map<String, dynamic> result;
    if (widget.existingProfile == null) {
      final newProfile = PppoeProfileModel(
        id: '',
        tenantId: '',
        deviceId: '',
        name: name,
        rateLimit: rateLimit.isNotEmpty ? rateLimit : null,
        localAddress: localAddress.isNotEmpty ? localAddress : null,
        remoteAddress: remoteAddress.isNotEmpty ? remoteAddress : null,
        dnsServers: dnsServers.isNotEmpty ? dnsServers : null,
        onlyOne: _onlyOne,
        price: price,
        description: description.isNotEmpty ? description : null,
      );
      result = await notifier.createProfile(newProfile);
    } else {
      result = await notifier.updateProfile(widget.existingProfile!.id, {
        'name': name,
        if (rateLimit.isNotEmpty) 'rateLimit': rateLimit,
        if (localAddress.isNotEmpty) 'localAddress': localAddress,
        if (remoteAddress.isNotEmpty) 'remoteAddress': remoteAddress,
        if (dnsServers.isNotEmpty) 'dnsServers': dnsServers,
        'onlyOne': _onlyOne,
        'price': price,
        if (description.isNotEmpty) 'description': description,
      });
    }

    if (!mounted) return;
    setState(() => _isSubmitting = false);

    if (result['success'] == true) {
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result['message']?.toString() ?? 'تم حفظ البروفايل بنجاح'),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
    } else {
      setState(() {
        _errorMessage = result['message']?.toString() ?? 'تعذر حفظ البروفايل';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.existingProfile != null;

    return Dialog(
      backgroundColor: context.bgCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: context.borderColor),
      ),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 480),
        padding: const EdgeInsets.all(22),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF06B6D4).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.layers, color: Color(0xFF06B6D4), size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        isEditing ? 'تعديل بروفايل PPPoE' : 'إضافة بروفايل سرعة جديد',
                        style: TextStyle(
                          color: context.textPrimary,
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.close, color: context.textSecondary, size: 20),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                if (_errorMessage != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.4)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, color: Color(0xFFF87171), size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: const TextStyle(color: Color(0xFFF87171), fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),

                // Name
                TextFormField(
                  controller: _nameController,
                  cursorColor: context.textPrimary,
                  style: TextStyle(color: context.textPrimary, fontSize: 14),
                  decoration: _buildInputDecoration(
                    label: 'اسم البروفايل *',
                    hint: 'مثال: home_10mbps',
                    icon: Icons.label_outline,
                  ),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) return 'يرجى إدخال اسم البروفايل';
                    return null;
                  },
                ),
                const SizedBox(height: 12),

                // Rate Limit & Price
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _rateLimitController,
                        cursorColor: context.textPrimary,
                        style: TextStyle(color: context.textPrimary, fontSize: 14, fontFamily: 'monospace'),
                        decoration: _buildInputDecoration(
                          label: 'السرعة (Rate Limit)',
                          hint: '10M/10M',
                          icon: Icons.speed,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: _priceController,
                        keyboardType: TextInputType.number,
                        cursorColor: context.textPrimary,
                        style: TextStyle(color: context.textPrimary, fontSize: 14),
                        decoration: _buildInputDecoration(
                          label: 'السعر الشهري',
                          hint: '5000',
                          icon: Icons.payments_outlined,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Local Address & Remote Address
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _localAddressController,
                        cursorColor: context.textPrimary,
                        style: TextStyle(color: context.textPrimary, fontSize: 14, fontFamily: 'monospace'),
                        decoration: _buildInputDecoration(
                          label: 'العنوان المحلي (Gateway)',
                          hint: '10.100.0.1',
                          icon: Icons.alt_route,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: _remoteAddressController,
                        cursorColor: context.textPrimary,
                        style: TextStyle(color: context.textPrimary, fontSize: 14, fontFamily: 'monospace'),
                        decoration: _buildInputDecoration(
                          label: 'المسبح أو الـ IP البعيد',
                          hint: 'pppoe-pool',
                          icon: Icons.cloud_outlined,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // DNS Servers
                TextFormField(
                  controller: _dnsServersController,
                  cursorColor: context.textPrimary,
                  style: TextStyle(color: context.textPrimary, fontSize: 14, fontFamily: 'monospace'),
                  decoration: _buildInputDecoration(
                    label: 'خوادم DNS (مفصولة بفاصلة)',
                    hint: '8.8.8.8,1.1.1.1',
                    icon: Icons.dns_outlined,
                  ),
                ),
                const SizedBox(height: 12),

                // Only One Session Toggle
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: context.bgScaffold,
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
                            'جلسة واحدة لكل حساب (Only-One)',
                            style: TextStyle(color: context.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                          Text(
                            'منع الاتصال المتزامن بأكثر من جهاز بنفس الحساب',
                            style: TextStyle(color: context.textSecondary, fontSize: 11),
                          ),
                        ],
                      ),
                      Switch(
                        value: _onlyOne,
                        activeThumbColor: const Color(0xFF06B6D4),
                        onChanged: (val) => setState(() => _onlyOne = val),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Description
                TextFormField(
                  controller: _descriptionController,
                  maxLines: 2,
                  style: TextStyle(color: context.textPrimary, fontSize: 13),
                  decoration: _buildInputDecoration(
                    label: 'ملاحظات وتفاصيل إضافية',
                    hint: 'باقة مخصصة للاستخدام المنزلي غير المحدود...',
                    icon: Icons.notes,
                  ),
                ),
                const SizedBox(height: 20),

                // Submit Buttons
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isSubmitting ? null : () => Navigator.of(context).pop(),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: context.borderColor),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          padding: const EdgeInsets.symmetric(vertical: 13),
                        ),
                        child: Text('إلغاء', style: TextStyle(color: context.textSecondary)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: _isSubmitting ? null : _handleSubmit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF06B6D4),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          padding: const EdgeInsets.symmetric(vertical: 13),
                        ),
                        child: _isSubmitting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : Text(
                                isEditing ? 'حفظ التعديلات' : 'إنشاء ومزامنة البروفايل',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                              ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _buildInputDecoration({
    required String label,
    required String hint,
    required IconData icon,
  }) {
    return InputDecoration(
      labelText: label,
      labelStyle: TextStyle(color: context.textSecondary, fontSize: 13),
      hintText: hint,
      hintStyle: TextStyle(color: context.textSecondary, fontSize: 12),
      prefixIcon: Icon(icon, color: context.textSecondary, size: 18),
      filled: true,
      fillColor: context.bgScaffold,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: context.borderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: context.borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF06B6D4), width: 1.5),
      ),
    );
  }
}
