import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:intl/intl.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../studio/presentation/card_studio_screen.dart';

class CardsStoreScreen extends ConsumerStatefulWidget {
  const CardsStoreScreen({super.key});

  @override
  ConsumerState<CardsStoreScreen> createState() => _CardsStoreScreenState();
}

class _CardsStoreScreenState extends ConsumerState<CardsStoreScreen> {
  final TextEditingController _searchController = TextEditingController();
  Timer? _debounceTimer;
  String _selectedStatus = 'ALL';

  final List<Map<String, String>> _statusFilters = [
    {'key': 'ALL', 'label': 'الكل'},
    {'key': 'AVAILABLE', 'label': 'متاح'},
    {'key': 'SOLD', 'label': 'مباع'},
    {'key': 'ACTIVE', 'label': 'نشط ومستخدم'},
    {'key': 'DISABLED', 'label': 'ملغي ومعطل'},
  ];

  @override
  void initState() {
    super.initState();
    // Ensure initial load is triggered
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(cardsInventoryProvider.notifier).loadInventory();
    });
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 350), () {
      if (mounted) {
        ref.read(cardsInventoryProvider.notifier).loadInventory(
              search: value.trim(),
              status: _selectedStatus,
              page: 1,
            );
      }
    });
    setState(() {});
  }

  void _clearSearch() {
    _searchController.clear();
    _debounceTimer?.cancel();
    ref.read(cardsInventoryProvider.notifier).loadInventory(
          search: '',
          status: _selectedStatus,
          page: 1,
        );
    setState(() {});
  }

  void _onStatusChanged(String statusKey) {
    if (_selectedStatus == statusKey) return;
    setState(() {
      _selectedStatus = statusKey;
    });
    ref.read(cardsInventoryProvider.notifier).loadInventory(
          search: _searchController.text.trim(),
          status: statusKey,
          page: 1,
        );
  }

  void _onPageChanged(int page) {
    ref.read(cardsInventoryProvider.notifier).loadInventory(
          page: page,
        );
  }

  Future<void> _toggleCardStatus(CardModel card) async {
    final bool isCurrentlyDisabled = (card.status == 'DISABLED' || card.status == 'CANCELLED');
    final String targetStatus = isCurrentlyDisabled ? 'AVAILABLE' : 'DISABLED';
    final String actionTitle = isCurrentlyDisabled ? 'إعادة تفعيل الكرت' : 'إلغاء وتعطيل الكرت';
    final String actionMessage = isCurrentlyDisabled
        ? 'هل تريد إعادة تفعيل الكرت "${card.username}" ليصبح متاحاً للبيع مرة أخرى؟'
        : 'هل أنت متأكد من تعطيل الكرت "${card.username}"؟ لن يتمكن العميل من استخدامه أو بيعه.';

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Icon(
              isCurrentlyDisabled ? Icons.check_circle_outline : Icons.warning_amber_rounded,
              color: isCurrentlyDisabled ? const Color(0xFF10B981) : const Color(0xFFEF4444),
            ),
            const SizedBox(width: 8),
            Text(
              actionTitle,
              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Text(
          actionMessage,
          style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('تراجع', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: isCurrentlyDisabled ? const Color(0xFF10B981) : const Color(0xFFEF4444),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(isCurrentlyDisabled ? 'نعم، تفعيل' : 'نعم، إلغاء وتعطيل'),
          ),
        ],
      ),
    );

    if (confirm == true && mounted) {
      final messenger = ScaffoldMessenger.of(context);
      final success = await ref
          .read(cardsInventoryProvider.notifier)
          .updateCardStatus(card.id, targetStatus);

      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              success
                  ? (isCurrentlyDisabled ? 'تمت إعادة تفعيل الكرت بنجاح' : 'تم تعطيل الكرت بنجاح')
                  : 'فشل تعديل حالة الكرت، يرجى المحاولة مرة أخرى',
            ),
            backgroundColor: success ? const Color(0xFF10B981) : const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  void _showCardDetailsDialog(CardModel card) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFF38BDF8).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.credit_card, color: Color(0xFF38BDF8), size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'تفاصيل الكرت: ${card.username}',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // QR Code
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.2),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: QrImageView(
                  data: card.loginUrl,
                  version: QrVersions.auto,
                  size: 170.0,
                ),
              ),
              const SizedBox(height: 16),

              // Credential Display Card
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: Column(
                  children: [
                    _buildDetailRow(
                      'رمز الكرت (Code):',
                      card.username,
                      textColor: const Color(0xFF38BDF8),
                      isMonospace: true,
                      canCopy: true,
                    ),
                    if (card.clearPassword != null &&
                        card.clearPassword!.isNotEmpty &&
                        card.clearPassword != card.username) ...[
                      const Divider(color: Color(0xFF1E293B)),
                      _buildDetailRow(
                        'كلمة المرور:',
                        card.clearPassword!,
                        textColor: const Color(0xFFFBBF24),
                        isMonospace: true,
                        canCopy: true,
                      ),
                    ],
                    if (card.pinCode != null && card.pinCode!.isNotEmpty) ...[
                      const Divider(color: Color(0xFF1E293B)),
                      _buildDetailRow(
                        'رمز PIN:',
                        card.pinCode!,
                        textColor: const Color(0xFFA78BFA),
                        isMonospace: true,
                        canCopy: true,
                      ),
                    ],
                    const Divider(color: Color(0xFF1E293B)),
                    _buildDetailRow('الباقة:', card.profileName),
                    const Divider(color: Color(0xFF1E293B)),
                    _buildDetailRow('السعر:', '${card.price.toStringAsFixed(0)} SDG', textColor: const Color(0xFF10B981)),
                    const Divider(color: Color(0xFF1E293B)),
                    _buildDetailRow('الرقم التسلسلي:', card.serialNumber, canCopy: true),
                    if (card.batchNumber != null) ...[
                      const Divider(color: Color(0xFF1E293B)),
                      _buildDetailRow('رقم الدفعة:', card.batchNumber!),
                    ],
                    if (card.deviceName != null) ...[
                      const Divider(color: Color(0xFF1E293B)),
                      _buildDetailRow('الراوتر:', card.deviceName!),
                    ],
                    if (card.timeLimit != null) ...[
                      const Divider(color: Color(0xFF1E293B)),
                      _buildDetailRow('مدة الصلاحية:', card.timeLimit!),
                    ],
                    const Divider(color: Color(0xFF1E293B)),
                    _buildDetailRow(
                      'تاريخ التوليد:',
                      DateFormat('yyyy/MM/dd HH:mm').format(card.createdAt),
                    ),
                    if (card.soldAt != null) ...[
                      const Divider(color: Color(0xFF1E293B)),
                      _buildDetailRow(
                        'تاريخ البيع:',
                        DateFormat('yyyy/MM/dd HH:mm').format(card.soldAt!),
                        textColor: const Color(0xFF60A5FA),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          Row(
            children: [
              IconButton(
                onPressed: () {
                  final textToShare = '''
بطاقة هوتسبوت: ${card.profileName}
اسم المستخدم / الكود: ${card.username}
${card.clearPassword != null ? 'كلمة المرور: ${card.clearPassword}' : ''}
السعر: ${card.price.toStringAsFixed(0)} SDG
الرقم التسلسلي: ${card.serialNumber}
رابط الدخول المباشر: ${card.loginUrl}
'''.trim();
                  Share.share(textToShare);
                },
                icon: const Icon(Icons.share, color: Color(0xFF38BDF8)),
                tooltip: 'مشاركة بيانات الكرت',
              ),
              const Spacer(),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('إغلاق', style: TextStyle(color: Color(0xFF94A3B8))),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(
    String label,
    String value, {
    Color textColor = Colors.white,
    bool isMonospace = false,
    bool canCopy = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Flexible(
                  child: Text(
                    value,
                    style: TextStyle(
                      color: textColor,
                      fontSize: 12,
                      fontWeight: isMonospace ? FontWeight.bold : FontWeight.w600,
                      fontFamily: isMonospace ? 'monospace' : null,
                    ),
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.end,
                  ),
                ),
                if (canCopy) ...[
                  const SizedBox(width: 4),
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: value));
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('تم نسخ: $value'),
                          duration: const Duration(seconds: 1),
                        ),
                      );
                    },
                    child: const Icon(Icons.copy, size: 14, color: Color(0xFF64748B)),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(cardsInventoryProvider);

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
                color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.inventory_2, color: Color(0xFF60A5FA), size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'مخزن الكروت والمخزون',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'إدارة فعلية، تتبع الحالات، والبحث المتقدم',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () => ref.read(cardsInventoryProvider.notifier).refresh(),
            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
            tooltip: 'تحديث المخزون',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(cardsInventoryProvider.notifier).refresh(),
        color: const Color(0xFF38BDF8),
        backgroundColor: const Color(0xFF1E293B),
        child: Column(
          children: [
            // Search Input with Debounce & Clear
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'بحث بالرمز، الرقم التسلسلي، أو الباقة...',
                  hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFF38BDF8)),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear, color: Color(0xFF94A3B8), size: 18),
                          onPressed: _clearSearch,
                        )
                      : null,
                  filled: true,
                  fillColor: const Color(0xFF1E293B),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF334155)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF334155)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF38BDF8)),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
                onChanged: _onSearchChanged,
              ),
            ),

            // Horizontal Status Filter Chips with Dynamic Counts
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Row(
                children: _statusFilters.map((f) {
                  final key = f['key']!;
                  final isSelected = _selectedStatus == key;

                  // Label with badge count if available
                  String countSuffix = '';
                  if (key == 'ALL' && state.totalInventory > 0) {
                    countSuffix = ' (${state.totalInventory})';
                  } else if (key == 'AVAILABLE' && state.availableCount > 0) {
                    countSuffix = ' (${state.availableCount})';
                  } else if (key == 'SOLD' && state.soldCount > 0) {
                    countSuffix = ' (${state.soldCount})';
                  } else if (key == 'ACTIVE' && state.activeCount > 0) {
                    countSuffix = ' (${state.activeCount})';
                  } else if (key == 'DISABLED' && state.disabledCount > 0) {
                    countSuffix = ' (${state.disabledCount})';
                  }

                  return Padding(
                    padding: const EdgeInsets.only(left: 8.0),
                    child: FilterChip(
                      label: Text('${f['label']!}$countSuffix'),
                      selected: isSelected,
                      selectedColor: const Color(0xFF2563EB),
                      backgroundColor: const Color(0xFF1E293B),
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                        fontSize: 12,
                      ),
                      onSelected: (_) => _onStatusChanged(key),
                    ),
                  );
                }).toList(),
              ),
            ),

            // Live Counters & Inventory Breakdown Strip
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF334155), width: 0.8),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.filter_list, size: 14, color: Color(0xFF94A3B8)),
                        const SizedBox(width: 4),
                        Text(
                          'عدد النتائج: ${state.totalMatching} كرت',
                          style: const TextStyle(
                            color: Color(0xFFCBD5E1),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        const Icon(Icons.storage_rounded, size: 14, color: Color(0xFF38BDF8)),
                        const SizedBox(width: 4),
                        Text(
                          'إجمالي المخزون: ${state.totalInventory} كرت',
                          style: const TextStyle(
                            color: Color(0xFF38BDF8),
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // Slim linear loading indicator for background searching
            if (state.isLoading && state.cards.isNotEmpty)
              const LinearProgressIndicator(
                backgroundColor: Color(0xFF1E293B),
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF38BDF8)),
                minHeight: 2,
              ),

            // Main Content Area: Cards List or Specific States
            Expanded(
              child: _buildBody(state),
            ),

            // Pagination Controls (when more than 1 page exists)
            if (state.totalPages > 1) _buildPaginationBar(state),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(CardsInventoryState state) {
    // 1. Initial Full Loading State
    if (state.isLoading && state.cards.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF38BDF8)),
            ),
            SizedBox(height: 16),
            Text(
              'جارٍ جلب مخزون الكروت الفعلي...',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
            ),
          ],
        ),
      );
    }

    // 2. Error State
    if (state.errorMessage != null && state.cards.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.cloud_off_rounded, size: 54, color: Color(0xFFEF4444)),
              const SizedBox(height: 14),
              const Text(
                'تعذر تحميل المخزون',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Text(
                state.errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
              ),
              const SizedBox(height: 18),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: () => ref.read(cardsInventoryProvider.notifier).loadInventory(),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('إعادة المحاولة'),
              ),
            ],
          ),
        ),
      );
    }

    // 3. True Empty Inventory (No cards at all in the tenant DB)
    if (state.totalInventory == 0 && _searchController.text.isEmpty && _selectedStatus == 'ALL') {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: const Icon(Icons.inventory_2_outlined, size: 48, color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 16),
              const Text(
                'لا توجد كروت مسجلة في المخزون حتى الآن',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'يمكنك البدء بتوليد دفعة كروت جديدة وتخصيص الباقات والثيمات عبر استوديو الكروت.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF10B981),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const CardStudioScreen()),
                  );
                },
                icon: const Icon(Icons.add_card, size: 18),
                label: const Text('الانتقال إلى استوديو الكروت والتوليد'),
              ),
            ],
          ),
        ),
      );
    }

    // 4. Search Filter returned 0 results
    if (state.cards.isEmpty && _searchController.text.isNotEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.search_off_rounded, size: 52, color: Color(0xFF64748B)),
            const SizedBox(height: 12),
            const Text(
              'لا توجد كروت مطابقة لمعايير البحث',
              style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            Text(
              'لم يتم العثور على نتائج تطابق "${_searchController.text.trim()}"',
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF38BDF8),
                side: const BorderSide(color: Color(0xFF38BDF8)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: _clearSearch,
              icon: const Icon(Icons.clear, size: 16),
              label: const Text('مسح البحث'),
            ),
          ],
        ),
      );
    }

    // 5. Specific Status Filter returned 0 results
    if (state.cards.isEmpty && _selectedStatus != 'ALL') {
      final currentFilterLabel = _statusFilters
          .firstWhere((f) => f['key'] == _selectedStatus, orElse: () => {'label': 'المحددة'})['label'];

      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.filter_alt_off_rounded, size: 52, color: Color(0xFF64748B)),
            const SizedBox(height: 12),
            Text(
              'لا توجد كروت بحالة ($currentFilterLabel)',
              style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            const Text(
              'جرّب التبديل إلى فلتر (الكل) لاستعراض جميع الكروت',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
            ),
            const SizedBox(height: 14),
            OutlinedButton(
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF38BDF8),
                side: const BorderSide(color: Color(0xFF38BDF8)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () => _onStatusChanged('ALL'),
              child: const Text('عرض الكل'),
            ),
          ],
        ),
      );
    }

    // 6. Regular Cards List
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      itemCount: state.cards.length,
      itemBuilder: (ctx, idx) => _buildCardTile(state.cards[idx]),
    );
  }

  Widget _buildCardTile(CardModel card) {
    Color statusColor;
    String statusText;
    IconData statusIcon;

    switch (card.status) {
      case 'AVAILABLE':
        statusColor = const Color(0xFF10B981);
        statusText = 'متاح للبيع';
        statusIcon = Icons.check_circle_outline;
        break;
      case 'SOLD':
        statusColor = const Color(0xFF3B82F6);
        statusText = 'مباع';
        statusIcon = Icons.shopping_bag_outlined;
        break;
      case 'ACTIVE':
        statusColor = const Color(0xFFF59E0B);
        statusText = 'نشط على الشبكة';
        statusIcon = Icons.wifi;
        break;
      case 'EXPIRED':
        statusColor = const Color(0xFFEA580C);
        statusText = 'منتهي الصلاحية';
        statusIcon = Icons.timer_off_outlined;
        break;
      case 'DISABLED':
      case 'CANCELLED':
        statusColor = const Color(0xFFEF4444);
        statusText = 'ملغي / معطل';
        statusIcon = Icons.block;
        break;
      default:
        statusColor = const Color(0xFF94A3B8);
        statusText = card.status;
        statusIcon = Icons.help_outline;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              // QR Code Quick Viewer Button
              IconButton(
                onPressed: () => _showCardDetailsDialog(card),
                icon: const Icon(Icons.qr_code_2, color: Color(0xFF38BDF8), size: 28),
                tooltip: 'عرض تفاصيل الكرت والـ QR',
              ),
              const SizedBox(width: 8),

              // Card Main Info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            card.username,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                              letterSpacing: 1,
                              fontFamily: 'monospace',
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: statusColor.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: statusColor, width: 0.8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(statusIcon, size: 10, color: statusColor),
                              const SizedBox(width: 3),
                              Text(
                                statusText,
                                style: TextStyle(
                                  color: statusColor,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${card.profileName} • S/N: ${card.serialNumber}',
                      style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (card.batchNumber != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        'دفعة: ${card.batchNumber!}',
                        style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
                      ),
                    ],
                  ],
                ),
              ),

              // Price & Quick Actions
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${card.price.toStringAsFixed(0)} SDG',
                    style: const TextStyle(
                      color: Color(0xFF10B981),
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Copy code button
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: card.username));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('تم نسخ رمز الكرت إلى الحافظة'),
                              duration: Duration(seconds: 1),
                            ),
                          );
                        },
                        icon: const Icon(Icons.copy, size: 16, color: Color(0xFF64748B)),
                        tooltip: 'نسخ الكود',
                      ),
                      const SizedBox(width: 8),

                      // More actions popup menu
                      PopupMenuButton<String>(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        icon: const Icon(Icons.more_vert, size: 18, color: Color(0xFF94A3B8)),
                        color: const Color(0xFF1E293B),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        onSelected: (val) {
                          if (val == 'details') {
                            _showCardDetailsDialog(card);
                          } else if (val == 'toggle_status') {
                            _toggleCardStatus(card);
                          }
                        },
                        itemBuilder: (ctx) => [
                          const PopupMenuItem(
                            value: 'details',
                            child: Row(
                              children: [
                                Icon(Icons.visibility_outlined, size: 16, color: Color(0xFF38BDF8)),
                                SizedBox(width: 8),
                                Text('عرض التفاصيل والـ QR', style: TextStyle(color: Colors.white, fontSize: 12)),
                              ],
                            ),
                          ),
                          PopupMenuItem(
                            value: 'toggle_status',
                            child: Row(
                              children: [
                                Icon(
                                  (card.status == 'DISABLED' || card.status == 'CANCELLED')
                                      ? Icons.check_circle_outline
                                      : Icons.block,
                                  size: 16,
                                  color: (card.status == 'DISABLED' || card.status == 'CANCELLED')
                                      ? const Color(0xFF10B981)
                                      : const Color(0xFFEF4444),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  (card.status == 'DISABLED' || card.status == 'CANCELLED')
                                      ? 'إعادة تفعيل الكرت'
                                      : 'إلغاء وتعطيل الكرت',
                                  style: TextStyle(
                                    color: (card.status == 'DISABLED' || card.status == 'CANCELLED')
                                        ? const Color(0xFF10B981)
                                        : const Color(0xFFEF4444),
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPaginationBar(CardsInventoryState state) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        color: Color(0xFF1E293B),
        border: Border(top: BorderSide(color: Color(0xFF334155), width: 0.8)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          TextButton.icon(
            onPressed: state.page > 1 ? () => _onPageChanged(state.page - 1) : null,
            icon: const Icon(Icons.chevron_right, size: 18),
            label: const Text('السابق'),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFF38BDF8),
              disabledForegroundColor: const Color(0xFF64748B),
            ),
          ),
          Text(
            'صفحة ${state.page} من ${state.totalPages}',
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.bold),
          ),
          TextButton.icon(
            onPressed: state.page < state.totalPages ? () => _onPageChanged(state.page + 1) : null,
            icon: const Icon(Icons.chevron_left, size: 18),
            label: const Text('التالي'),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFF38BDF8),
              disabledForegroundColor: const Color(0xFF64748B),
            ),
          ),
        ],
      ),
    );
  }
}
