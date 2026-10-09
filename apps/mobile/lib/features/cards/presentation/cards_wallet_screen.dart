import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/services/card_pdf_generator_service.dart';

class CardsWalletScreen extends ConsumerStatefulWidget {
  const CardsWalletScreen({super.key});

  @override
  ConsumerState<CardsWalletScreen> createState() => _CardsWalletScreenState();
}

class _CardsWalletScreenState extends ConsumerState<CardsWalletScreen> {
  String _filter = 'ALL'; // ALL, AVAILABLE, SOLD
  String _searchQuery = '';
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    // Load fresh cached profiles on screen entry
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(profilesProvider.notifier).fetchProfiles();
    });
  }

  bool _isSyncing = false;

  Future<void> _handleSync() async {
    if (_isSyncing) return;
    setState(() => _isSyncing = true);

    try {
      final syncManager = ref.read(syncManagerProvider);
      final pushResult = await syncManager.pushPendingMutations();
      await syncManager.pullCatalog();
      ref.read(offlineCardsProvider.notifier).refresh();
      ref.read(pendingMutationsProvider.notifier).refresh();
      await ref.read(profilesProvider.notifier).fetchProfiles();

      if (!mounted) return;

      String message;
      Color bgColor;
      if (pushResult.errorMessage != null) {
        message = 'تم تحديث المحفظة، ولكن تعذر إرسال العمليات السحابية (${pushResult.errorMessage})؛ تم الاحتفاظ بها محلياً.';
        bgColor = Colors.amber.shade800;
      } else if (pushResult.conflictCount > 0) {
        message = 'تمت المزامنة: اعتُمدت ${pushResult.appliedCount} عملية، ويوجد ${pushResult.conflictCount} تعارض.';
        bgColor = Colors.amber.shade800;
      } else if (pushResult.appliedCount > 0) {
        message = 'تمت المزامنة بنجاح! تم اعتماد ${pushResult.appliedCount} عملية وتحديث كروت المحفظة.';
        bgColor = const Color(0xFF0D9488);
      } else {
        message = 'تمت مزامنة وتحديث محفظة الكروت بنجاح.';
        bgColor = const Color(0xFF0D9488);
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: bgColor,
          duration: const Duration(seconds: 3),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تعذر إتمام المزامنة: $e'),
          backgroundColor: Colors.redAccent,
        ),
      );
    } finally {
      if (mounted) setState(() => _isSyncing = false);
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showReserveCardsModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => const _ReserveCardsBottomSheet(),
    );
  }

  void _showCardQr(OfflineCardModel card) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.wifi, color: Color(0xFF0D9488), size: 20),
            const SizedBox(width: 8),
            Text(
              'كرت #${card.serialNumber}',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: QrImageView(
                data: card.loginUrl,
                version: QrVersions.auto,
                size: 190,
                backgroundColor: Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('اسم المستخدم:', style: TextStyle(color: Colors.grey, fontSize: 13)),
                      SelectableText(
                        card.username,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Colors.white),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (card.clearPassword != null && card.clearPassword!.isNotEmpty)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('كلمة المرور / PIN:', style: TextStyle(color: Colors.grey, fontSize: 13)),
                        SelectableText(
                          card.clearPassword!,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                            color: Color(0xFF5EEAD4),
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '${card.profileName} • ${card.price.toStringAsFixed(0)} ${card.currency}',
              style: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold, fontSize: 14),
            ),
          ],
        ),
        actions: [
          TextButton.icon(
            icon: const Icon(Icons.copy, size: 16, color: Color(0xFF38BDF8)),
            label: const Text('نسخ البيانات', style: TextStyle(color: Color(0xFF38BDF8))),
            onPressed: () {
              final text = 'المستخدم: ${card.username}\nكلمة المرور: ${card.clearPassword ?? card.username}';
              Clipboard.setData(ClipboardData(text: text));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('تم نسخ بيانات الدخول إلى الحافظة')),
              );
            },
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إغلاق', style: TextStyle(color: Colors.grey)),
          ),
        ],
      ),
    );
  }

  void _showExportPdfDialog(List<OfflineCardModel> exportCards) {
    if (exportCards.isEmpty) return;
    CardPdfLayout selectedLayout = CardPdfLayout.a4Grid10;
    String selectedTheme = 'FOOTBALL';
    final networkNameController = TextEditingController(text: 'سودافاي | SudaFi Net');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
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
                      color: const Color(0xFFF59E0B).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.picture_as_pdf, color: Color(0xFFF59E0B), size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'تصدير كروت الهوتسبوت كـ PDF',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                        Text(
                          'جاهز لطباعة ورق A4 في مراكز خدمات الطباعة (${exportCards.length} كرت)',
                          style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                'تنسيق ورق A4 وعلامات القص:',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFFE2E8F0)),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ChoiceChip(
                    label: const Text('10 كروت (مميز + QR كبير)'),
                    selected: selectedLayout == CardPdfLayout.a4Grid10,
                    onSelected: (val) {
                      if (val) setModalState(() => selectedLayout = CardPdfLayout.a4Grid10);
                    },
                  ),
                  ChoiceChip(
                    label: const Text('12 كرت (3×4 قياسي)'),
                    selected: selectedLayout == CardPdfLayout.a4Grid12,
                    onSelected: (val) {
                      if (val) setModalState(() => selectedLayout = CardPdfLayout.a4Grid12);
                    },
                  ),
                  ChoiceChip(
                    label: const Text('24 كرت (اقتصادي)'),
                    selected: selectedLayout == CardPdfLayout.a4Grid24,
                    onSelected: (val) {
                      if (val) setModalState(() => selectedLayout = CardPdfLayout.a4Grid24);
                    },
                  ),
                  ChoiceChip(
                    label: const Text('100 كرت (مدمج 5×20)'),
                    selected: selectedLayout == CardPdfLayout.a4Grid100,
                    onSelected: (val) {
                      if (val) setModalState(() => selectedLayout = CardPdfLayout.a4Grid100);
                    },
                  ),
                ],
              ),
              const SizedBox(height: 14),
              const Text(
                'تصميم وثيم الكرت المختار:',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFFE2E8F0)),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  ChoiceChip(
                    label: const Text('كرة القدم الذهبي'),
                    selected: selectedTheme == 'FOOTBALL',
                    selectedColor: const Color(0xFF065F46),
                    onSelected: (val) {
                      if (val) setModalState(() => selectedTheme = 'FOOTBALL');
                    },
                  ),
                  ChoiceChip(
                    label: const Text('عيد مبارك الملكي'),
                    selected: selectedTheme == 'EID_MUBARAK',
                    selectedColor: const Color(0xFF1E3A8A),
                    onSelected: (val) {
                      if (val) setModalState(() => selectedTheme = 'EID_MUBARAK');
                    },
                  ),
                  ChoiceChip(
                    label: const Text('الفيروزي الحديث'),
                    selected: selectedTheme == 'TURQUOISE',
                    selectedColor: const Color(0xFF0F766E),
                    onSelected: (val) {
                      if (val) setModalState(() => selectedTheme = 'TURQUOISE');
                    },
                  ),
                  ChoiceChip(
                    label: const Text('تذكرة كلاسيكية'),
                    selected: selectedTheme == 'TICKET',
                    selectedColor: const Color(0xFF4338CA),
                    onSelected: (val) {
                      if (val) setModalState(() => selectedTheme = 'TICKET');
                    },
                  ),
                  ChoiceChip(
                    label: const Text('مدمج أنيق'),
                    selected: selectedTheme == 'COMPACT',
                    selectedColor: const Color(0xFF334155),
                    onSelected: (val) {
                      if (val) setModalState(() => selectedTheme = 'COMPACT');
                    },
                  ),
                ],
              ),
              const SizedBox(height: 14),
              TextField(
                controller: networkNameController,
                decoration: InputDecoration(
                  labelText: 'اسم الشبكة المطبوع أعلى الكرت',
                  labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                  filled: true,
                  fillColor: const Color(0xFF0F172A),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0D9488),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(Icons.share, size: 20),
                label: const Text(
                  'مشاركة ملف PDF لمركز الطباعة (WhatsApp / ملفات)',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                onPressed: () async {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('جاري إنشاء ملف الـ PDF عالي الدقة وتجهيز المشاركة...')),
                  );
                  try {
                    await CardPdfGeneratorService.shareCardsPdf(
                      cards: exportCards,
                      networkName: networkNameController.text.trim().isNotEmpty
                          ? networkNameController.text.trim()
                          : 'سودافاي | SudaFi Net',
                      layout: selectedLayout,
                      themePreset: selectedTheme,
                    );
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('تعذر فتح المشاركة: $e'), backgroundColor: Colors.red),
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
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(Icons.print, size: 20),
                label: const Text('معاينة وطباعة A4 مباشرة'),
                onPressed: () async {
                  Navigator.pop(ctx);
                  try {
                    await CardPdfGeneratorService.previewAndPrint(
                      cards: exportCards,
                      networkName: networkNameController.text.trim().isNotEmpty
                          ? networkNameController.text.trim()
                          : 'سودافاي | SudaFi Net',
                      layout: selectedLayout,
                      themePreset: selectedTheme,
                    );
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('تعذر فتح الطباعة: $e'), backgroundColor: Colors.red),
                      );
                    }
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cards = ref.watch(offlineCardsProvider);

    // Filter cards by status and search query
    final filtered = cards.where((c) {
      if (_filter == 'AVAILABLE' && c.status != 'AVAILABLE') return false;
      if (_filter == 'SOLD' && c.status != 'SOLD') return false;
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final matchSerial = c.serialNumber.toLowerCase().contains(q);
        final matchUser = c.username.toLowerCase().contains(q);
        if (!matchSerial && !matchUser) return false;
      }
      return true;
    }).toList();

    final availableCount = cards.where((c) => c.status == 'AVAILABLE').length;
    final soldCount = cards.where((c) => c.status == 'SOLD').length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('محفظة الكروت المحلية'),
        actions: [
          IconButton(
            icon: _isSyncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0D9488)),
                  )
                : const Icon(Icons.sync, color: Color(0xFF0D9488)),
            tooltip: 'مزامنة الكروت والعمليات',
            onPressed: _isSyncing ? null : _handleSync,
          ),
          IconButton(
            icon: const Icon(Icons.picture_as_pdf, color: Color(0xFFF59E0B)),
            tooltip: 'تصدير الكروت كـ PDF لمركز الطباعة',
            onPressed: filtered.isEmpty ? null : () => _showExportPdfDialog(filtered),
          ),
          IconButton(
            icon: const Icon(Icons.add_shopping_cart, color: Color(0xFF0D9488)),
            tooltip: 'حجز كروت للمحفظة غير المتصلة',
            onPressed: _showReserveCardsModal,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _handleSync,
        child: Column(
          children: [
            // Search & Filter Section
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 10.0),
              child: Column(
                children: [
                  TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'بحث بالرقم التسلسلي أو اسم المستخدم...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      filled: true,
                      fillColor: const Color(0xFF1E293B),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 18),
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _searchQuery = '');
                              },
                            )
                          : null,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF334155)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF334155)),
                      ),
                    ),
                    onChanged: (val) => setState(() => _searchQuery = val.trim()),
                  ),
                  const SizedBox(height: 12),
                  // Filter Tabs matching screenshot styling
                  Container(
                    height: 44,
                    decoration: BoxDecoration(
                      color: const Color(0xFF101827),
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: const Color(0xFF334155)),
                    ),
                    child: Row(
                      children: [
                        _buildFilterTab(
                          label: 'الكل (${cards.length})',
                          value: 'ALL',
                          isSelected: _filter == 'ALL',
                        ),
                        _buildFilterTab(
                          label: 'المتوفرة ($availableCount)',
                          value: 'AVAILABLE',
                          isSelected: _filter == 'AVAILABLE',
                        ),
                        _buildFilterTab(
                          label: 'المباعة ($soldCount)',
                          value: 'SOLD',
                          isSelected: _filter == 'SOLD',
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Cards List
            Expanded(
              child: filtered.isEmpty
                  ? Center(
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(24),
                              decoration: const BoxDecoration(
                                color: Color(0xFF1E293B),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.credit_card_off, size: 52, color: Colors.grey),
                            ),
                            const SizedBox(height: 18),
                            Text(
                              cards.isEmpty
                                  ? 'محفظتك خالية من الكروت المحجوزة'
                                  : 'لا توجد كروت مطابقة لمعايير البحث',
                              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: Colors.white70),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              cards.isEmpty
                                  ? 'احجز كروت من الخادم الآن لتمكين البيع الفوري دون اتصال بالإنترنت'
                                  : 'حاول تغيير معايير البحث أو تصفية العرض',
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 13, color: Colors.grey),
                            ),
                            if (cards.isEmpty) ...[
                              const SizedBox(height: 24),
                              ElevatedButton.icon(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF0D9488),
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                icon: const Icon(Icons.download, size: 20),
                                label: const Text('حجز كروت الآن للمحفظة', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                onPressed: _showReserveCardsModal,
                              ),
                            ],
                          ],
                        ),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      itemCount: filtered.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final card = filtered[index];
                        final isAvailable = card.status == 'AVAILABLE';

                        return Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E293B),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: isAvailable
                                  ? const Color(0xFF0D9488).withValues(alpha: 0.3)
                                  : const Color(0xFF334155),
                            ),
                          ),
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                            leading: CircleAvatar(
                              backgroundColor: isAvailable
                                  ? const Color(0xFF0D9488).withValues(alpha: 0.2)
                                  : Colors.grey.withValues(alpha: 0.2),
                              child: Icon(
                                isAvailable ? Icons.wifi : Icons.check_circle_outline,
                                color: isAvailable ? const Color(0xFF0D9488) : Colors.grey,
                              ),
                            ),
                            title: Row(
                              children: [
                                Text(
                                  card.serialNumber,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: isAvailable ? Colors.green.shade800 : Colors.blueGrey.shade800,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    isAvailable ? 'جاهز للبيع' : 'تم البيع',
                                    style: const TextStyle(fontSize: 10, color: Colors.white),
                                  ),
                                ),
                              ],
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4.0),
                              child: Text(
                                'المستخدم: ${card.username} | ${card.profileName} | ${card.price.toStringAsFixed(0)} ${card.currency}',
                                style: const TextStyle(fontSize: 12, color: Colors.white70),
                              ),
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.qr_code_2, color: Color(0xFF5EEAD4)),
                              tooltip: 'عرض QR Code',
                              onPressed: () => _showCardQr(card),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterTab({
    required String label,
    required String value,
    required bool isSelected,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _filter = value),
        child: Container(
          height: double.infinity,
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFFF59E0B) : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  color: isSelected ? Colors.black : const Color(0xFF94A3B8),
                ),
              ),
              if (isSelected) ...[
                const SizedBox(width: 4),
                const Icon(Icons.check, size: 16, color: Colors.black),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ReserveCardsBottomSheet extends ConsumerStatefulWidget {
  const _ReserveCardsBottomSheet();

  @override
  ConsumerState<_ReserveCardsBottomSheet> createState() => _ReserveCardsBottomSheetState();
}

class _ReserveCardsBottomSheetState extends ConsumerState<_ReserveCardsBottomSheet> {
  HotspotProfileModel? _selectedProfile;
  int _count = 20;
  bool _isLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final profiles = ref.read(profilesProvider);
    if (profiles.isNotEmpty) {
      _selectedProfile = profiles.first;
    }
  }

  Future<void> _handleReserve() async {
    if (_selectedProfile == null) return;
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final syncManager = ref.read(syncManagerProvider);
      final cards = await syncManager.reserveCards(
        profileId: _selectedProfile!.id,
        count: _count,
        deviceId: _selectedProfile!.deviceId.isNotEmpty ? _selectedProfile!.deviceId : null,
      );

      ref.read(offlineCardsProvider.notifier).refresh();
      await ref.read(profilesProvider.notifier).fetchProfiles();

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('تم حجز ${cards.length} كرت بنجاح ونقلها لمحفظتك غير المتصلة'),
            backgroundColor: const Color(0xFF0D9488),
          ),
        );
      }
    } catch (e) {
      // Extract exact server error message
      String message = e.toString();
      if (message.contains('Exception:')) {
        message = message.replaceAll('Exception:', '').trim();
      }
      if (mounted) {
        setState(() {
          _error = message.isNotEmpty
              ? message
              : 'تعذر حجز الكروت من الخادم. تأكد من اتصال الإنترنت وتوفر كروت في الباقة.';
        });
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profiles = ref.watch(profilesProvider);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        left: 20,
        right: 20,
        top: 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'حجز كروت للمحفظة غير المتصلة',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'تتيح لك بيع الكروت وطباعتها حتى عند انقطاع الإنترنت التام',
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 18),

          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade900.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.redAccent.withValues(alpha: 0.5)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: Colors.redAccent, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_error!, style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],

          DropdownButtonFormField<HotspotProfileModel>(
            decoration: const InputDecoration(labelText: 'اختر باقة الكروت'),
            items: profiles
                .map((p) => DropdownMenuItem(
                      value: p,
                      child: Text(
                        '${p.displayName ?? p.name} (${p.price.toStringAsFixed(0)} SDG)${p.availableCards > 0 ? " • متاح: ${p.availableCards}" : ""}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ))
                .toList(),
            initialValue: _selectedProfile ?? (profiles.isNotEmpty ? profiles.first : null),
            onChanged: (val) => setState(() {
              _selectedProfile = val;
              _error = null;
            }),
          ),
          const SizedBox(height: 16),

          const Text('عدد الكروت المطلوب حجزها:', style: TextStyle(fontSize: 13)),
          const SizedBox(height: 8),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 10, label: Text('10')),
              ButtonSegment(value: 20, label: Text('20')),
              ButtonSegment(value: 50, label: Text('50')),
              ButtonSegment(value: 100, label: Text('100')),
            ],
            selected: {_count},
            onSelectionChanged: (val) => setState(() {
              _count = val.first;
              _error = null;
            }),
          ),
          const SizedBox(height: 24),

          SizedBox(
            height: 48,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0D9488),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: _isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.download, size: 18),
              label: Text(
                _isLoading ? 'جاري الحجز...' : 'تأكيد حجز $_count كرت الآن',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              onPressed: _isLoading || _selectedProfile == null ? null : _handleReserve,
            ),
          ),
        ],
      ),
    );
  }
}
