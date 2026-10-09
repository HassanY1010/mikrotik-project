import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/services/card_pdf_generator_service.dart';

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
  bool _singleCredentialMode = true; // User = Pass (PIN)
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
    });
  }

  void _loadData() {
    ref.read(profilesProvider.notifier).fetchProfiles();
    ref.invalidate(routersProvider);
  }

  void _handleCustomQuantity() async {
    final controller = TextEditingController(text: _selectedQuantity.toString());
    final result = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('تحديد كمية مخصصة', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          autofocus: true,
          style: const TextStyle(color: Colors.white, fontSize: 16),
          decoration: const InputDecoration(
            hintText: 'أدخل عدد الكروت (1 - 5000)',
            hintStyle: TextStyle(color: Color(0xFF64748B)),
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

  void _handleGenerateBatch(List<HotspotProfileModel> profiles, List<RouterDeviceModel> routers) async {
    if (_isGenerating) return;

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
        'themePreset': _selectedThemePreset,
        'singleCredential': _singleCredentialMode,
        'singleUserPin': _singleCredentialMode,
      };
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

        final bool syncedToRouter = responseData is Map && responseData['syncedToRouter'] == true;
        final String? routerError = responseData is Map ? responseData['routerError']?.toString() : null;

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

        _showBatchSuccessAndPdfDialog(
          batchId: batchId,
          profile: selectedProfile,
          quantity: generatedCards.isNotEmpty ? generatedCards.length : _selectedQuantity,
          cards: generatedCards,
          syncedToRouter: syncedToRouter,
          routerError: routerError,
        );
      }
    } catch (e) {
      setState(() => _isGenerating = false);
      if (mounted) {
        String errorMessage = 'تعذر الاتصال بالخادم وتوليد الدفعة';
        if (e is DioException) {
          final resData = e.response?.data;
          if (resData is Map && resData['error'] != null) {
            final errObj = resData['error'];
            errorMessage = (errObj is Map && errObj['message'] != null)
                ? errObj['message'].toString()
                : errObj.toString();
          } else if (resData is Map && resData['message'] != null) {
            errorMessage = resData['message'].toString();
          } else if (e.message != null && e.message!.isNotEmpty) {
            errorMessage = e.message!;
          }
        } else {
          errorMessage = e.toString();
        }

        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF1E293B),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Row(
              children: const [
                Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 24),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'فشل توليد الدفعة',
                    style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            content: Text(
              errorMessage,
              style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
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

  void _showBatchSuccessAndPdfDialog({
    required String batchId,
    required HotspotProfileModel profile,
    required int quantity,
    required List<OfflineCardModel> cards,
    required bool syncedToRouter,
    String? routerError,
  }) {
    CardPdfLayout selectedLayout = CardPdfLayout.a4Grid10;
    final networkNameController = TextEditingController(text: 'سودافاي | SudaFi Net');

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: const [
              Icon(Icons.check_circle, color: Color(0xFF10B981), size: 24),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'تم إنشاء الدفعة بنجاح! 📄',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          content: SingleChildScrollView(
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
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: syncedToRouter
                              ? const Color(0xFF059669).withValues(alpha: 0.2)
                              : const Color(0xFFD97706).withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: syncedToRouter ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                            width: 1,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              syncedToRouter ? Icons.router : Icons.cloud_done,
                              size: 16,
                              color: syncedToRouter ? const Color(0xFF34D399) : const Color(0xFFFBBF24),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                syncedToRouter
                                    ? 'تم تفعيل الكروت ومزامنتها على راوتر MikroTik بنجاح'
                                    : 'تم حفظ الكروت بالسحابة (الراوتر غير متصل حالياً). الكروت جاهزة للطباعة.',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: syncedToRouter ? const Color(0xFF34D399) : const Color(0xFFFBBF24),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'تنسيق ورق A4 لمركز الطباعة:',
                  style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 12, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ChoiceChip(
                      label: const Text('10 كروت (A4 مميز + QR)', style: TextStyle(fontSize: 11)),
                      selected: selectedLayout == CardPdfLayout.a4Grid10,
                      onSelected: (val) {
                        if (val) setDialogState(() => selectedLayout = CardPdfLayout.a4Grid10);
                      },
                    ),
                    ChoiceChip(
                      label: const Text('12 كرت (3×4 قياسي)', style: TextStyle(fontSize: 11)),
                      selected: selectedLayout == CardPdfLayout.a4Grid12,
                      onSelected: (val) {
                        if (val) setDialogState(() => selectedLayout = CardPdfLayout.a4Grid12);
                      },
                    ),
                    ChoiceChip(
                      label: const Text('24 كرت (اقتصادي)', style: TextStyle(fontSize: 11)),
                      selected: selectedLayout == CardPdfLayout.a4Grid24,
                      onSelected: (val) {
                        if (val) setDialogState(() => selectedLayout = CardPdfLayout.a4Grid24);
                      },
                    ),
                    ChoiceChip(
                      label: const Text('100 كرت (مكثف)', style: TextStyle(fontSize: 11)),
                      selected: selectedLayout == CardPdfLayout.a4Grid100,
                      onSelected: (val) {
                        if (val) setDialogState(() => selectedLayout = CardPdfLayout.a4Grid100);
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: networkNameController,
                  style: const TextStyle(fontSize: 13, color: Colors.white),
                  decoration: InputDecoration(
                    labelText: 'اسم الشبكة المطبوع',
                    labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                    filled: true,
                    fillColor: const Color(0xFF0F172A),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0D9488),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
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
                        networkName: networkNameController.text.trim().isNotEmpty
                            ? networkNameController.text.trim()
                            : 'سودافاي | SudaFi Net',
                        layout: selectedLayout,
                        batchNumber: batchId,
                        themePreset: _selectedThemePreset,
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
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF38BDF8),
                    side: const BorderSide(color: Color(0xFF38BDF8)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const Icon(Icons.print, size: 18),
                  label: const Text('معاينة وطباعة A4 الآن', style: TextStyle(fontSize: 12)),
                  onPressed: () async {
                    Navigator.pop(ctx);
                    widget.onBatchCreated?.call();
                    try {
                      await CardPdfGeneratorService.previewAndPrint(
                        cards: cards,
                        networkName: networkNameController.text.trim().isNotEmpty
                            ? networkNameController.text.trim()
                            : 'سودافاي | SudaFi Net',
                        layout: selectedLayout,
                        batchNumber: batchId,
                        themePreset: _selectedThemePreset,
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
              ],
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

    if (_selectedProfileId == null && profiles.isNotEmpty) {
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
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
            tooltip: 'تحديث الباقات والأجهزة',
            onPressed: _loadData,
          ),
        ],
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

            // Router Target Selector (if available)
            if (routers.isNotEmpty) ...[
              const Text(
                'راوتر MikroTik المستهدف',
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
                    value: selectedRouterId,
                    dropdownColor: const Color(0xFF1E293B),
                    isExpanded: true,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    items: routers.map((r) {
                      final isOnline = r.status.toUpperCase() == 'ONLINE';
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

            // Profile Selection Dropdown
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'اختر باقة الهوتسبوت',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                if (profiles.isEmpty)
                  TextButton.icon(
                    icon: const Icon(Icons.sync, size: 14, color: Color(0xFF38BDF8)),
                    label: const Text('جلب الباقات', style: TextStyle(fontSize: 12, color: Color(0xFF38BDF8))),
                    onPressed: () => ref.read(profilesProvider.notifier).fetchProfiles(),
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
                  ? const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        'لا توجد باقات متاحة حالياً، يرجى إنشاء باقة من لوحة التحكم أو الضغط على تحديث',
                        style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                      ),
                    )
                  : DropdownButtonHideUnderline(
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
                                Expanded(
                                  child: Text(
                                    p.displayName ?? p.name,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                Text(
                                  '${p.price.toStringAsFixed(0)} SDG',
                                  style: const TextStyle(color: Color(0xFF38BDF8)),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                        onChanged: (id) => setState(() => _selectedProfileId = id),
                      ),
                    ),
            ),

            const SizedBox(height: 18),

            // Quantity Selection Pills + Custom Option
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
                            ? 'إدخال رمز PIN واحد فقط عند تسجيل الدخول'
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
                  disabledBackgroundColor: const Color(0xFF1E3A8A),
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
                  _isGenerating ? 'جاري توليد الدفعة والتحقق...' : 'توليد الدفعة ($_selectedQuantity كرت)',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLiveCardPreview(HotspotProfileModel? profile, _ThemeConfig theme) {
    final profileTitle = profile != null ? (profile.displayName ?? profile.name) : 'باقة هوتسبوت قياسية';
    final priceText = profile != null ? '${profile.price.toStringAsFixed(0)} SDG' : '--- SDG';
    final validityText = profile?.validity ?? '24 ساعة';
    final speedText = profile?.rateLimit ?? '4M/2M';

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
                    priceText,
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
                        profileTitle,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'الصلاحية: $validityText • السرعة: $speedText',
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
                            letterSpacing: _singleCredentialMode ? 2 : 1,
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
