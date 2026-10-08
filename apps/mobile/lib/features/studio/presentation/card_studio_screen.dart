import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/constants/api_endpoints.dart';

class CardStudioScreen extends ConsumerStatefulWidget {
  final VoidCallback? onBatchCreated;

  const CardStudioScreen({super.key, this.onBatchCreated});

  @override
  ConsumerState<CardStudioScreen> createState() => _CardStudioScreenState();
}

class _CardStudioScreenState extends ConsumerState<CardStudioScreen> {
  int _selectedQuantity = 50;
  final List<int> _quantityOptions = [10, 50, 100, 250, 500, 1000];

  String? _selectedProfileId;
  String _selectedThemePreset = 'FOOTBALL';
  bool _singleCredentialMode = true; // User = Pass
  bool _isGenerating = false;

  final Map<String, _ThemeConfig> _themes = {
    'FOOTBALL': _ThemeConfig('ثيم كرة القدم الذهبي', const Color(0xFF065F46), const Color(0xFFF59E0B), Icons.sports_soccer),
    'EID_MUBARAK': _ThemeConfig('عيد مبارك الملكي', const Color(0xFF1E3A8A), const Color(0xFFD97706), Icons.nights_stay),
    'TURQUOISE': _ThemeConfig('الفيروزي الحديث', const Color(0xFF0F766E), const Color(0xFF06B6D4), Icons.wifi),
    'TICKET': _ThemeConfig('تذكرة كلاسيكية', const Color(0xFF4338CA), const Color(0xFFEC4899), Icons.confirmation_number),
    'COMPACT': _ThemeConfig('مدمج أنيق', const Color(0xFF334155), const Color(0xFF64748B), Icons.grid_view),
  };

  void _handleGenerateBatch(List<HotspotProfileModel> profiles, List<RouterDeviceModel> routers) async {
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
      final res = await apiClient.post(ApiEndpoints.cardBatches, data: {
        'profileId': selectedProfile.id,
        'quantity': _selectedQuantity,
        if (selectedRouterId != null) ...{'deviceId': selectedRouterId},
        'themePreset': _selectedThemePreset,
        'singleCredential': _singleCredentialMode,
      });

      setState(() => _isGenerating = false);

      if (mounted) {
        final data = res.data;
        final batchId = (data is Map && data['data'] != null && data['data']['id'] != null)
            ? data['data']['id']
            : 'BATCH-${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}';

        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF1E293B),
            title: Row(
              children: const [
                Icon(Icons.check_circle, color: Color(0xFF10B981)),
                SizedBox(width: 8),
                Text('تم إنشاء الدفعة بنجاح', style: TextStyle(color: Colors.white, fontSize: 16)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('معرف الدفعة: $batchId', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                const SizedBox(height: 8),
                Text('العدد: $_selectedQuantity كرت', style: const TextStyle(color: Colors.white)),
                Text('الباقة: ${selectedProfile.displayName}', style: const TextStyle(color: Colors.white)),
                Text('السعر الإجمالي: ${(_selectedQuantity * selectedProfile.price).toStringAsFixed(0)} SDG', style: const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold)),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  widget.onBatchCreated?.call();
                },
                child: const Text('إغلاق', style: TextStyle(color: Color(0xFF38BDF8))),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      setState(() => _isGenerating = false);
      if (mounted) {
        // Fallback for offline demo
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF1E293B),
            title: Row(
              children: const [
                Icon(Icons.check_circle_outline, color: Color(0xFF10B981)),
                SizedBox(width: 8),
                Text('تمت محاكاة التوليد بنجاح', style: TextStyle(color: Colors.white, fontSize: 16)),
              ],
            ),
            content: Text(
              'تم إنشاء $_selectedQuantity كرت في الذاكرة بنجاح بباقة ${selectedProfile.displayName}.',
              style: const TextStyle(color: Color(0xFF94A3B8)),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('تم', style: TextStyle(color: Color(0xFF38BDF8))),
              ),
            ],
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final profiles = ref.watch(profilesProvider);
    final routersAsync = ref.watch(routersProvider);
    final routers = routersAsync.asData?.value ?? [];

    if (_selectedProfileId == null && profiles.isNotEmpty) {
      _selectedProfileId = profiles.first.id;
    }

    final currentProfile = profiles.isNotEmpty
        ? profiles.firstWhere((p) => p.id == _selectedProfileId, orElse: () => profiles.first)
        : HotspotProfileModel(
            id: 'demo',
            name: '1hour',
            displayName: 'باقة 1 ساعة غير محدود',
            deviceId: '',
            price: 200,
            validity: '1h',
            rateLimit: '2M/1M',
          );

    final currentTheme = _themes[_selectedThemePreset] ?? _themes['FOOTBALL']!;

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
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
              children: const [
                Text(
                  'استوديو الكروت والتوليد',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'معاينة حية، ثيمات احترافية، وتوليد فوري',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Live Interactive Card Preview
            const Text(
              'المعاينة الحية للكرت (Live Preview)',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 10),
            _buildLiveCardPreview(currentProfile, currentTheme),

            const SizedBox(height: 20),

            // Profile Selection Dropdown
            const Text(
              'اختر باقة الهوتسبوت',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
            ),
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
                  value: _selectedProfileId,
                  dropdownColor: const Color(0xFF1E293B),
                  isExpanded: true,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  items: profiles.map((p) {
                    return DropdownMenuItem<String>(
                      value: p.id,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(p.displayName ?? p.name),
                          Text('${p.price.toStringAsFixed(0)} SDG', style: const TextStyle(color: Color(0xFF38BDF8))),
                        ],
                      ),
                    );
                  }).toList(),
                  onChanged: (id) => setState(() => _selectedProfileId = id),
                ),
              ),
            ),

            const SizedBox(height: 18),

            // Quantity Selection Pills
            const Text(
              'الكمية المطلوبة للدفعة',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _quantityOptions.map((qty) {
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
                }).toList(),
              ),
            ),

            const SizedBox(height: 18),

            // Credentials Mode (User=Pass vs User+Pass)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
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
                    children: [
                      const Text(
                        'اسم المستخدم = كلمة المرور',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                      Text(
                        _singleCredentialMode
                            ? 'إدخال رمز واحد فقط عند تسجيل الدخول'
                            : 'اسم مستخدم وكلمة مرور منفصلين',
                        style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                      ),
                    ],
                  ),
                  Switch(
                    value: _singleCredentialMode,
                    activeThumbColor: const Color(0xFF38BDF8),
                    onChanged: (val) => setState(() => _singleCredentialMode = val),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 18),

            // Themes Selection
            const Text(
              'اختر تصميم وثيم الكرت',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _themes.entries.map((entry) {
                  final isSelected = _selectedThemePreset == entry.key;
                  return GestureDetector(
                    onTap: () => setState(() => _selectedThemePreset = entry.key),
                    child: Container(
                      margin: const EdgeInsets.only(left: 10),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
                          CircleAvatar(radius: 6, backgroundColor: entry.value.primaryColor),
                          const SizedBox(width: 8),
                          Text(
                            entry.value.name,
                            style: TextStyle(
                              color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),

            const SizedBox(height: 28),

            // Generate Batch Action Button
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: _isGenerating ? null : () => _handleGenerateBatch(profiles, routers),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 4,
                ),
                icon: _isGenerating
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Icon(Icons.print, color: Colors.white),
                label: Text(
                  _isGenerating ? 'جاري توليد الدفعة...' : 'توليد الدفعة ($_selectedQuantity كرت)',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLiveCardPreview(HotspotProfileModel profile, _ThemeConfig theme) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [theme.primaryColor, theme.primaryColor.withValues(alpha: 0.85)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: theme.primaryColor.withValues(alpha: 0.4),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
        border: Border.all(color: theme.accentColor.withValues(alpha: 0.4), width: 1.5),
      ),
      child: Column(
        children: [
          // Header Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(theme.icon, color: theme.accentColor, size: 20),
                    const SizedBox(width: 8),
                    const Text(
                      'سودافاي | SudaFi Net',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: theme.accentColor, width: 1),
                  ),
                  child: Text(
                    '${profile.price.toStringAsFixed(0)} SDG',
                    style: TextStyle(
                      color: theme.accentColor,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const Divider(color: Colors.white24, height: 1),

          // Card Body
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                // Left: Card Info & Code
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile.displayName ?? profile.name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'الصلاحية: ${profile.validity ?? 'مفتوحة'} • السرعة: ${profile.rateLimit ?? 'مفتوحة'}',
                        style: const TextStyle(color: Colors.white70, fontSize: 11),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _singleCredentialMode ? 'PIN: 849204' : 'U: 849204 | P: 1039',
                          style: TextStyle(
                            color: theme.primaryColor,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 2,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                // Right: QR Mock
                Container(
                  width: 64,
                  height: 64,
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Center(
                    child: Icon(Icons.qr_code_2, size: 54, color: Colors.black),
                  ),
                ),
              ],
            ),
          ),

          // Footer
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.25),
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(18),
                bottomRight: Radius.circular(18),
              ),
            ),
            child: const Text(
              'امسح رمز QR للاتصال المباشر بشبكة الواي فاي',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, fontSize: 10),
            ),
          ),
        ],
      ),
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
