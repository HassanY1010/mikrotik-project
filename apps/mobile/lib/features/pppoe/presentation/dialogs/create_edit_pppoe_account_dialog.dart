import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers.dart';
import '../../../../core/theme/app_theme.dart';

class CreateEditPppoeAccountDialog extends ConsumerStatefulWidget {
  final PppoeAccountModel? existingAccount;

  const CreateEditPppoeAccountDialog({super.key, this.existingAccount});

  @override
  ConsumerState<CreateEditPppoeAccountDialog> createState() => _CreateEditPppoeAccountDialogState();
}

class _CreateEditPppoeAccountDialogState extends ConsumerState<CreateEditPppoeAccountDialog> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _usernameController;
  late final TextEditingController _passwordController;
  late final TextEditingController _customerNameController;
  late final TextEditingController _customerPhoneController;
  late final TextEditingController _staticIpController;
  late final TextEditingController _callerIdController;
  late final TextEditingController _priceController;
  late final TextEditingController _notesController;

  String? _selectedProfileId;
  String _billingCycle = 'MONTHLY';
  DateTime? _expiresAt;
  bool _obscurePassword = true;
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final a = widget.existingAccount;
    _usernameController = TextEditingController(text: a?.username ?? '');
    _passwordController = TextEditingController();
    _customerNameController = TextEditingController(text: a?.customerName ?? '');
    _customerPhoneController = TextEditingController(text: a?.customerPhone ?? '');
    _staticIpController = TextEditingController(text: a?.staticIp ?? '');
    _callerIdController = TextEditingController(text: a?.callerId ?? '');
    _priceController = TextEditingController(text: a != null ? a.price.toStringAsFixed(0) : '');
    _notesController = TextEditingController(text: a?.notes ?? '');
    _selectedProfileId = a?.profileId;
    _billingCycle = a?.billingCycle ?? 'MONTHLY';
    _expiresAt = a?.expiresAt;
  }

  @override
  void dispose() {
    // Strictly wipe sensitive password controller state from memory
    _passwordController.clear();
    _passwordController.dispose();

    _usernameController.dispose();
    _customerNameController.dispose();
    _customerPhoneController.dispose();
    _staticIpController.dispose();
    _callerIdController.dispose();
    _priceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedProfileId == null || _selectedProfileId!.isEmpty) {
      setState(() => _errorMessage = 'يرجى اختيار باقة السرعة (البروفايل)');
      return;
    }

    final isEditing = widget.existingAccount != null;
    final username = _usernameController.text.trim();
    final password = _passwordController.text;

    if (!isEditing && password.isEmpty) {
      setState(() => _errorMessage = 'يرجى إدخال كلمة المرور لحساب المشترك');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final notifier = ref.read(pppoeAccountsProvider.notifier);

    final payload = <String, dynamic>{
      'profileId': _selectedProfileId,
      if (_customerNameController.text.trim().isNotEmpty)
        'customerName': _customerNameController.text.trim(),
      if (_customerPhoneController.text.trim().isNotEmpty)
        'customerPhone': _customerPhoneController.text.trim(),
      if (_staticIpController.text.trim().isNotEmpty)
        'staticIp': _staticIpController.text.trim(),
      if (_callerIdController.text.trim().isNotEmpty)
        'callerId': _callerIdController.text.trim(),
      if (_priceController.text.trim().isNotEmpty)
        'price': double.tryParse(_priceController.text.trim()) ?? 0.0,
      'billingCycle': _billingCycle,
      if (_expiresAt != null) 'expiresAt': _expiresAt!.toIso8601String(),
      if (_notesController.text.trim().isNotEmpty)
        'notes': _notesController.text.trim(),
    };

    Map<String, dynamic> result;
    if (!isEditing) {
      payload['username'] = username;
      payload['password'] = password;
      result = await notifier.createAccount(payload);
    } else {
      if (password.isNotEmpty) {
        payload['password'] = password;
      }
      result = await notifier.updateAccount(widget.existingAccount!.id, payload);
    }

    // Immediately clear password buffer from controller
    _passwordController.clear();

    if (!mounted) return;
    setState(() => _isSubmitting = false);

    if (result['success'] == true) {
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result['message']?.toString() ?? 'تم حفظ بيانات المشترك بنجاح'),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
    } else {
      setState(() {
        _errorMessage = result['message']?.toString() ?? 'تعذر حفظ الحساب';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.existingAccount != null;
    final profilesAsync = ref.watch(pppoeProfilesProvider);
    final profiles = profilesAsync.asData?.value ?? [];

    if (_selectedProfileId == null && profiles.isNotEmpty) {
      _selectedProfileId = profiles.first.id;
    }

    return Dialog(
      backgroundColor: context.bgCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: context.borderColor),
      ),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500),
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
                        color: const Color(0xFF38BDF8).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.person_add_alt_1, color: Color(0xFF38BDF8), size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        isEditing ? 'تعديل حساب المشترك' : 'إضافة مشترك PPPoE جديد',
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

                // Username & Profile
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _usernameController,
                        readOnly: isEditing,
                        style: TextStyle(
                          color: isEditing ? context.textSecondary : context.textPrimary,
                          fontSize: 14,
                          fontFamily: 'monospace',
                        ),
                        decoration: _buildInputDecoration(
                          label: 'اسم المستخدم (Username) *',
                          hint: 'user_001',
                          icon: Icons.account_circle_outlined,
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) return 'يرجى إدخال اسم المستخدم';
                          return null;
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _selectedProfileId,
                        dropdownColor: context.bgCard,
                        style: TextStyle(color: context.textPrimary, fontSize: 13),
                        decoration: _buildInputDecoration(
                          label: 'باقة السرعة *',
                          hint: 'اختر الباقة',
                          icon: Icons.speed,
                        ),
                        items: profiles.map((p) {
                          return DropdownMenuItem<String>(
                            value: p.id,
                            child: Text(
                              '${p.name} (${p.rateLimit ?? "بدون حد"})',
                              overflow: TextOverflow.ellipsis,
                            ),
                          );
                        }).toList(),
                        onChanged: (val) {
                          setState(() {
                            _selectedProfileId = val;
                            final selected = profiles.firstWhere((p) => p.id == val, orElse: () => profiles.first);
                            if (_priceController.text.isEmpty || _priceController.text == '0') {
                              _priceController.text = selected.price.toStringAsFixed(0);
                            }
                          });
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Password with Toggle (Transient State only)
                TextFormField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  style: TextStyle(color: context.textPrimary, fontSize: 14, fontFamily: 'monospace'),
                  decoration: InputDecoration(
                    labelText: isEditing ? 'كلمة المرور (اتركها فارغة للإبقاء عليها)' : 'كلمة المرور *',
                    labelStyle: TextStyle(color: context.textSecondary, fontSize: 13),
                    hintText: '••••••••',
                    hintStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                    prefixIcon: Icon(Icons.lock_outline, color: context.textSecondary, size: 18),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                        color: context.textSecondary,
                        size: 18,
                      ),
                      onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                    ),
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
                      borderSide: const BorderSide(color: Color(0xFF38BDF8), width: 1.5),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Customer Name & Phone
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _customerNameController,
                        cursorColor: context.textPrimary,
                        style: TextStyle(color: context.textPrimary, fontSize: 14),
                        decoration: _buildInputDecoration(
                          label: 'اسم المشترك الثلاثي',
                          hint: 'أحمد إبراهيم علي',
                          icon: Icons.badge_outlined,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: _customerPhoneController,
                        keyboardType: TextInputType.phone,
                        cursorColor: context.textPrimary,
                        style: TextStyle(color: context.textPrimary, fontSize: 14),
                        decoration: _buildInputDecoration(
                          label: 'رقم هاتف المشترك',
                          hint: '0912345678',
                          icon: Icons.phone_outlined,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Static IP & Caller ID (MAC)
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _staticIpController,
                        cursorColor: context.textPrimary,
                        style: TextStyle(color: context.textPrimary, fontSize: 14, fontFamily: 'monospace'),
                        decoration: _buildInputDecoration(
                          label: 'عنوان IP ثابت (اختياري)',
                          hint: '10.100.1.50',
                          icon: Icons.alt_route,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: _callerIdController,
                        cursorColor: context.textPrimary,
                        style: TextStyle(color: context.textPrimary, fontSize: 14, fontFamily: 'monospace'),
                        decoration: _buildInputDecoration(
                          label: 'قفل MAC / المتصل (Caller ID)',
                          hint: 'AA:BB:CC:11:22:33',
                          icon: Icons.fingerprint,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Billing Cycle & Price
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _billingCycle,
                        dropdownColor: context.bgCard,
                        style: TextStyle(color: context.textPrimary, fontSize: 13),
                        decoration: _buildInputDecoration(
                          label: 'دورة الفوترة',
                          hint: 'شهري',
                          icon: Icons.calendar_today_outlined,
                        ),
                        items: const [
                          DropdownMenuItem(value: 'MONTHLY', child: Text('شهرياً (Monthly)')),
                          DropdownMenuItem(value: 'YEARLY', child: Text('سنوياً (Yearly)')),
                        ],
                        onChanged: (val) {
                          if (val != null) setState(() => _billingCycle = val);
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: _priceController,
                        keyboardType: TextInputType.number,
                        style: TextStyle(color: context.textPrimary, fontSize: 14),
                        decoration: _buildInputDecoration(
                          label: 'سعر الاشتراك',
                          hint: '5000',
                          icon: Icons.payments_outlined,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Expiry Date Selector
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _expiresAt ?? DateTime.now().add(const Duration(days: 30)),
                      firstDate: DateTime.now().subtract(const Duration(days: 365)),
                      lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
                      builder: (ctx, child) {
                        return Theme(
                          data: Theme.of(ctx).copyWith(
                            colorScheme: ctx.isDarkMode
                                ? const ColorScheme.dark(
                                    primary: Color(0xFF38BDF8),
                                    surface: Color(0xFF1E293B),
                                    onSurface: Colors.white,
                                  )
                                : const ColorScheme.light(
                                    primary: Color(0xFF0284C7),
                                    surface: Colors.white,
                                    onSurface: Color(0xFF0F172A),
                                  ),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (picked != null) {
                      setState(() => _expiresAt = picked);
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: context.bgScaffold,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.borderColor),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.event_outlined, color: context.textSecondary, size: 18),
                            const SizedBox(width: 10),
                            Text(
                              _expiresAt != null
                                  ? 'تاريخ انتهاء الصلاحية: ${_expiresAt!.year}/${_expiresAt!.month}/${_expiresAt!.day}'
                                  : 'تاريخ انتهاء الصلاحية: مفتوح / تلقائي',
                              style: TextStyle(
                                color: _expiresAt != null ? context.textPrimary : context.textSecondary,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                        if (_expiresAt != null)
                          GestureDetector(
                            onTap: () => setState(() => _expiresAt = null),
                            child: Icon(Icons.clear, color: context.textSecondary, size: 16),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Notes
                TextFormField(
                  controller: _notesController,
                  maxLines: 2,
                  style: TextStyle(color: context.textPrimary, fontSize: 13),
                  decoration: _buildInputDecoration(
                    label: 'ملاحظات المشترك أو الموقع الجغرافي',
                    hint: 'الخرطوم بحري - مربع 4 - منزل 12...',
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
                          backgroundColor: const Color(0xFF38BDF8),
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
                                isEditing ? 'حفظ التعديلات' : 'إضافة وتفعيل المشترك',
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
        borderSide: const BorderSide(color: Color(0xFF38BDF8), width: 1.5),
      ),
    );
  }
}
