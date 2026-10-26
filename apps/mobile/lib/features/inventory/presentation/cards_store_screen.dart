import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:intl/intl.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
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
  bool _isSelectionMode = false;
  final Set<String> _selectedCardIds = {};
  bool _isDeleting = false;
  bool _isActivating = false;

  final List<Map<String, String>> _statusFilters = [
    {'key': 'ALL', 'label': 'الكل'},
    {'key': 'AVAILABLE', 'label': 'متاح'},
    {'key': 'SOLD', 'label': 'مباع'},
    {'key': 'ACTIVE', 'label': 'نشط ومستخدم'},
    {'key': 'DISABLED', 'label': 'ملغي ومعطل'},
  ];

  Future<void> _handleBulkActivate(List<CardModel> currentCards) async {
    if (_selectedCardIds.isEmpty || _isActivating || _isDeleting) return;

    final selectedCount = _selectedCardIds.length;
    final selectedCards = currentCards.where((c) => _selectedCardIds.contains(c.id)).toList();
    final expiredCount = selectedCards.where((c) => c.isExpired).length;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.bolt_rounded, color: Color(0xFF10B981), size: 24),
            const SizedBox(width: 8),
            Text(
              'تأكيد التفعيل الجماعي',
              style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'هل تريد بالتأكيد تفعيل الكروت المحددة وعددها $selectedCount كرت؟\nسيتم تمكين الكروت على راوتر MikroTik وتحديث حالتها في النظام لتكون جاهزة للعمل.',
              style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13, height: 1.5),
            ),
            if (expiredCount > 0) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, color: Colors.amber, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'ملاحظة: يتضمن التحديد $expiredCount كرت منتهي الصلاحية. يرفض النظام تفعيل الكروت المنتهية التزاماً بقواعد الاشتراك.',
                        style: const TextStyle(color: Colors.amber, fontSize: 11, height: 1.3),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('نعم، تفعيل $selectedCount كرت'),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) return;

    setState(() => _isActivating = true);
    final messenger = ScaffoldMessenger.of(context);

    final result = await ref
        .read(cardsInventoryProvider.notifier)
        .bulkActivateCards(_selectedCardIds.toList());

    if (!mounted) return;
    setState(() {
      _isActivating = false;
      _selectedCardIds.clear();
      _isSelectionMode = false;
    });

    final success = result['success'] == true;
    final message = result['message']?.toString() ??
        (success ? 'تمت عملية التفعيل بنجاح' : 'فشلت عملية التفعيل');

    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: success ? const Color(0xFF10B981) : const Color(0xFFEF4444),
        duration: const Duration(seconds: 4),
      ),
    );
  }

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

  void _toggleSelectionMode() {
    setState(() {
      _isSelectionMode = !_isSelectionMode;
      if (!_isSelectionMode) {
        _selectedCardIds.clear();
      }
    });
  }

  void _toggleCardSelection(String cardId) {
    setState(() {
      if (_selectedCardIds.contains(cardId)) {
        _selectedCardIds.remove(cardId);
      } else {
        _selectedCardIds.add(cardId);
      }
    });
  }

  void _toggleSelectAllVisible(List<CardModel> visibleCards) {
    setState(() {
      final allVisibleIds = visibleCards.map((c) => c.id).toSet();
      final hasAll = allVisibleIds.isNotEmpty && allVisibleIds.every((id) => _selectedCardIds.contains(id));
      if (hasAll) {
        _selectedCardIds.removeAll(allVisibleIds);
      } else {
        _selectedCardIds.addAll(allVisibleIds);
      }
    });
  }

  Future<void> _handleBulkDelete(List<CardModel> currentCards) async {
    if (_selectedCardIds.isEmpty) return;

    final selectedCount = _selectedCardIds.length;
    final selectedCards = currentCards.where((c) => _selectedCardIds.contains(c.id)).toList();
    final soldCount = selectedCards.where((c) => c.status == 'SOLD').length;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.delete_sweep_rounded, color: Color(0xFFEF4444), size: 24),
            const SizedBox(width: 8),
            Text(
              'تأكيد الحذف الجماعي',
              style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'هل تريد بالتأكيد حذف الكروت المحددة وعددها $selectedCount كرت؟\nسيتم حذفها من النظام ومزامنة الحذف مع راوتر MikroTik.',
              style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13, height: 1.5),
            ),
            if (soldCount > 0) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, color: Colors.amber, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'تنبيه: يتضمن التحديد $soldCount كرت مباع. سيتم الاحتفاظ بها لحماية السجلات المالية والمحاسبية.',
                        style: const TextStyle(color: Colors.amber, fontSize: 11, height: 1.3),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('نعم، حذف $selectedCount كرت'),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) return;

    setState(() => _isDeleting = true);
    final messenger = ScaffoldMessenger.of(context);

    final result = await ref
        .read(cardsInventoryProvider.notifier)
        .bulkDeleteCards(_selectedCardIds.toList());

    if (!mounted) return;
    setState(() {
      _isDeleting = false;
      _selectedCardIds.clear();
      _isSelectionMode = false;
    });

    final success = result['success'] == true;
    final message = result['message']?.toString() ??
        (success ? 'تم تنفيذ عملية الحذف بنجاح' : 'فشلت عملية الحذف');

    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: success ? const Color(0xFF10B981) : const Color(0xFFEF4444),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  Future<void> _handleDeleteSingleCard(CardModel card) async {
    if (card.status == 'SOLD') {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: context.bgCard,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              const Icon(Icons.shield_outlined, color: Colors.amber, size: 22),
              const SizedBox(width: 8),
              Text(
                'حماية السجلات المالية',
                style: TextStyle(color: context.textPrimary, fontSize: 15, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: const Text(
            'لا يمكن حذف هذا الكرت لأنه مباع ومرتبط بسجلات مبيعات وقيود محاسبية في النظام.',
            style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 13, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('حسناً', style: TextStyle(color: Color(0xFF38BDF8))),
            ),
          ],
        ),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.delete_outline, color: Color(0xFFEF4444), size: 22),
            const SizedBox(width: 8),
            Text(
              'حذف الكرت نهائياً',
              style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Text(
          'هل تريد بالتأكيد حذف الكرت "${card.username}" نهائياً من قاعدة البيانات وإزالته من راوتر MikroTik؟\nلا يمكن التراجع عن هذا الإجراء.',
          style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('نعم، حذف نهائي'),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    final result = await ref.read(cardsInventoryProvider.notifier).deleteCard(card.id);

    if (!mounted) return;
    final success = result['success'] == true;
    final msg = result['message']?.toString() ?? (success ? 'تم حذف الكرت بنجاح' : 'فشل حذف الكرت');

    messenger.showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: success ? const Color(0xFF10B981) : const Color(0xFFEF4444),
      ),
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
        backgroundColor: context.bgCard,
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
              style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
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
      builder: (ctx) => _CardDetailsDialog(card: card),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(cardsInventoryProvider);

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        leading: _isSelectionMode
            ? IconButton(
                icon: Icon(Icons.close, color: context.textPrimary),
                onPressed: _toggleSelectionMode,
                tooltip: 'إلغاء وضع التحديد',
              )
            : null,
        title: _isSelectionMode
            ? Text(
                'تم تحديد ${_selectedCardIds.length} كرت',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: context.textPrimary,
                ),
              )
            : Row(
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
                    children: [
                      Text(
                        'الكروت',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: context.textPrimary,
                        ),
                      ),
                      Text(
                        'إدارة كروت Hotspot، تتبع الحالات، والبحث المتقدم',
                        style: TextStyle(fontSize: 11, color: context.textSecondary),
                      ),
                    ],
                  ),
                ],
              ),
        actions: [
          if (_isSelectionMode) ...[
            IconButton(
              icon: Icon(
                state.cards.isNotEmpty &&
                        state.cards.every((c) => _selectedCardIds.contains(c.id))
                    ? Icons.deselect
                    : Icons.select_all,
                color: const Color(0xFF38BDF8),
              ),
              onPressed: () => _toggleSelectAllVisible(state.cards),
              tooltip: 'تحديد / إلغاء تحديد الكل',
            ),
            if (_selectedCardIds.isNotEmpty) ...[
              IconButton(
                icon: const Icon(Icons.bolt_rounded, color: Color(0xFF10B981)),
                onPressed: (_isActivating || _isDeleting) ? null : () => _handleBulkActivate(state.cards),
                tooltip: 'تفعيل المحدد (${_selectedCardIds.length})',
              ),
              IconButton(
                icon: const Icon(Icons.delete_sweep, color: Color(0xFFEF4444)),
                onPressed: (_isActivating || _isDeleting) ? null : () => _handleBulkDelete(state.cards),
                tooltip: 'حذف المحدد (${_selectedCardIds.length})',
              ),
            ],
          ] else ...[
            IconButton(
              onPressed: _toggleSelectionMode,
              icon: const Icon(Icons.checklist_rtl_rounded, color: Color(0xFF38BDF8)),
              tooltip: 'تحديد كروت متعددة للعمليات الجماعية',
            ),
            IconButton(
              onPressed: () => ref.read(cardsInventoryProvider.notifier).refresh(),
              icon: const Icon(Icons.refresh, color: Color(0xFF94A3B8)),
              tooltip: 'تحديث الكروت',
            ),
          ],
        ],
      ),
      bottomNavigationBar: (_isSelectionMode && _selectedCardIds.isNotEmpty)
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: context.bgCard,
                border: Border(top: BorderSide(color: context.borderColor)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.3),
                    blurRadius: 10,
                    offset: const Offset(0, -3),
                  ),
                ],
              ),
              child: SafeArea(
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'المحدد: ${_selectedCardIds.length} كرت',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF10B981),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: (_isActivating || _isDeleting) ? null : () => _handleBulkActivate(state.cards),
                      icon: _isActivating
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.bolt_rounded, size: 18),
                      label: Text(_isActivating ? 'جارٍ التفعيل...' : 'تفعيل المحدد'),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFEF4444),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: (_isActivating || _isDeleting) ? null : () => _handleBulkDelete(state.cards),
                      icon: _isDeleting
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.delete_sweep, size: 18),
                      label: Text(_isDeleting ? 'جارٍ الحذف...' : 'حذف المحدد'),
                    ),
                  ],
                ),
              ),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => ref.read(cardsInventoryProvider.notifier).refresh(),
        color: const Color(0xFF38BDF8),
        backgroundColor: context.bgCard,
        child: Column(
          children: [
            // Search Input with Debounce & Clear
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              child: TextField(
                controller: _searchController,
                style: TextStyle(color: context.textPrimary, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'بحث بالرمز، الرقم التسلسلي، أو الباقة...',
                  hintStyle: TextStyle(color: context.textSecondary, fontSize: 13),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFF38BDF8)),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: Icon(Icons.clear, color: context.textSecondary, size: 18),
                          onPressed: _clearSearch,
                        )
                      : null,
                  filled: true,
                  fillColor: context.bgCard,
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
                      backgroundColor: context.bgCard,
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : context.textSecondary,
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
                  color: context.bgCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: context.borderColor, width: 0.8),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.filter_list, size: 14, color: context.textSecondary),
                        const SizedBox(width: 4),
                        Text(
                          'عدد النتائج: ${state.totalMatching} كرت',
                          style: TextStyle(
                            color: context.textPrimary,
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
                          'إجمالي الكروت: ${state.totalInventory} كرت',
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
              LinearProgressIndicator(
                backgroundColor: context.bgCardAlt,
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
              'جارٍ جلب الكروت الفعلية...',
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
              Text(
                'تعذر تحميل الكروت',
                style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
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
                  color: context.bgCard,
                  shape: BoxShape.circle,
                  border: Border.all(color: context.borderColor),
                ),
                child: const Icon(Icons.inventory_2_outlined, size: 48, color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 16),
              Text(
                'لا توجد كروت مسجلة في النظام حتى الآن',
                style: TextStyle(color: context.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'يمكنك البدء بتوليد دفعة كروت جديدة وتخصيص الباقات والثيمات عبر إنشاء كروت.',
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
                label: const Text('الانتقال إلى إنشاء كروت'),
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
            Text(
              'لا توجد كروت مطابقة لمعايير البحث',
              style: TextStyle(color: context.textPrimary, fontSize: 15, fontWeight: FontWeight.bold),
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
              style: TextStyle(color: context.textPrimary, fontSize: 15, fontWeight: FontWeight.bold),
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
    final statusColor = card.statusBadgeColor;
    final statusText = card.statusArabic;
    IconData statusIcon = Icons.help_outline;
    if (card.isExpired) {
      statusIcon = Icons.timer_off_outlined;
    } else if (card.isDisabled) {
      statusIcon = Icons.block;
    } else if (card.isNew) {
      statusIcon = Icons.fiber_new_rounded;
    } else if (card.isUsed) {
      statusIcon = Icons.verified_user_outlined;
    } else if (card.status == 'AVAILABLE') {
      statusIcon = Icons.check_circle_outline;
    } else if (card.status == 'SOLD') {
      statusIcon = Icons.shopping_bag_outlined;
    } else if (card.status == 'ACTIVE') {
      statusIcon = Icons.wifi;
    }

    final isSelected = _selectedCardIds.contains(card.id);

    return InkWell(
      onTap: _isSelectionMode ? () => _toggleCardSelection(card.id) : () => _showCardDetailsDialog(card),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFF1E3A8A).withValues(alpha: 0.35)
              : context.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? const Color(0xFF38BDF8) : context.borderColor,
            width: isSelected ? 1.5 : 1.0,
          ),
        ),
        child: Column(
          children: [
            Row(
              children: [
                if (_isSelectionMode) ...[
                  Checkbox(
                    value: isSelected,
                    onChanged: (_) => _toggleCardSelection(card.id),
                    activeColor: const Color(0xFF38BDF8),
                    checkColor: context.bgScaffold,
                    side: BorderSide(color: context.borderColor),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  ),
                  const SizedBox(width: 4),
                ],
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
                          if (card.isOnline == true) ...[
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981).withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.circle, size: 6, color: Color(0xFF10B981)),
                                  SizedBox(width: 3),
                                  Text(
                                    'متصل',
                                    style: TextStyle(color: Color(0xFF10B981), fontSize: 9, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              card.profileName,
                              style: TextStyle(
                                color: context.textPrimary,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (card.isCustomQuota) ...[
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text('مخصص', style: TextStyle(color: Color(0xFFF59E0B), fontSize: 9)),
                            ),
                          ],
                          const SizedBox(width: 6),
                          Text(
                            '• S/N: ${card.serialNumber}',
                            style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
                          ),
                        ],
                      ),
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
                          color: context.bgCard,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          onSelected: (val) {
                            if (val == 'details') {
                              _showCardDetailsDialog(card);
                            } else if (val == 'toggle_status') {
                              _toggleCardStatus(card);
                            } else if (val == 'delete_card') {
                              _handleDeleteSingleCard(card);
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
                            const PopupMenuItem(
                              value: 'delete_card',
                              child: Row(
                                children: [
                                  Icon(Icons.delete_outline, size: 16, color: Color(0xFFEF4444)),
                                  SizedBox(width: 8),
                                  Text('حذف الكرت نهائياً', style: TextStyle(color: Color(0xFFEF4444), fontSize: 12)),
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

            // Card Metadata Chips (Speed, Quota, Validity, Router, Consumption)
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: context.bgCardAlt,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Wrap(
                spacing: 10,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  // Speed with correct direction
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.speed_rounded, size: 12, color: Color(0xFF38BDF8)),
                      const SizedBox(width: 3),
                      Text(
                        card.formattedSpeedLabel,
                        style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 10.5, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                  // Quota (MB/GB/مفتوح)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.cloud_download_outlined, size: 12, color: Color(0xFF10B981)),
                      const SizedBox(width: 3),
                      Text(
                        card.formattedDataQuota,
                        style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 10.5, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                  // Validity
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.timer_outlined, size: 12, color: Color(0xFFFBBF24)),
                      const SizedBox(width: 3),
                      Text(
                        card.formattedValidity,
                        style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 10.5, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                  // Device / Router
                  if (card.deviceName != null)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.router_outlined, size: 12, color: Color(0xFF94A3B8)),
                        const SizedBox(width: 3),
                        Text(
                          card.deviceName!,
                          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 10.5),
                        ),
                      ],
                    ),
                  // Consumed data if available
                  if (card.consumedBytes != null && card.consumedBytes! > 0)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.data_usage_rounded, size: 12, color: Color(0xFFF59E0B)),
                        const SizedBox(width: 3),
                        Text(
                          'مستهلك: ${card.formattedConsumedBytes}',
                          style: const TextStyle(color: Color(0xFFF59E0B), fontSize: 10.5),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPaginationBar(CardsInventoryState state) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: context.bgCard,
        border: Border(top: BorderSide(color: context.borderColor, width: 0.8)),
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

class _CardDetailsDialog extends ConsumerWidget {
  final CardModel card;

  const _CardDetailsDialog({required this.card});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<CardModel?>(
      future: ref.read(cardsInventoryProvider.notifier).fetchCardDetails(card.id),
      builder: (context, snapshot) {
        final c = snapshot.data ?? card;
        final isLoadingLive = snapshot.connectionState == ConnectionState.waiting;

        bool showCredentials = false;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: context.bgCard,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              titlePadding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16),
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
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'تفاصيل الكرت: ${c.username}',
                          style: TextStyle(color: context.textPrimary, fontWeight: FontWeight.bold, fontSize: 15),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                              decoration: BoxDecoration(
                                color: c.statusBadgeColor.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: c.statusBadgeColor, width: 0.8),
                              ),
                              child: Text(
                                c.statusArabic,
                                style: TextStyle(color: c.statusBadgeColor, fontSize: 10, fontWeight: FontWeight.bold),
                              ),
                            ),
                            const SizedBox(width: 6),
                            if (c.isOnline != null)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                                decoration: BoxDecoration(
                                  color: c.isOnline == true
                                      ? const Color(0xFF10B981).withValues(alpha: 0.15)
                                      : const Color(0xFF64748B).withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: c.isOnline == true ? const Color(0xFF10B981) : const Color(0xFF64748B),
                                    width: 0.8,
                                  ),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.circle,
                                      size: 6,
                                      color: c.isOnline == true ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      c.isOnline == true ? 'جلسة نشطة بالراوتر' : 'لا توجد جلسة نشطة',
                                      style: TextStyle(
                                        color: c.isOnline == true ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
                                        fontSize: 9.5,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
              if (isLoadingLive)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
                ),
            ],
          ),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 6),
                  // QR Code
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: QrImageView(
                      data: c.loginUrl,
                      version: QrVersions.auto,
                      size: 140.0,
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Section 1: بيانات الدخول والتعريف
                  _buildSectionHeader(
                    'بيانات الدخول والتعريف',
                    Icons.key_rounded,
                    action: InkWell(
                      onTap: () => setDialogState(() => showCredentials = !showCredentials),
                      borderRadius: BorderRadius.circular(4),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              showCredentials ? Icons.visibility_off : Icons.visibility,
                              size: 14,
                              color: const Color(0xFF38BDF8),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              showCredentials ? 'إخفاء' : 'كشف الرموز',
                              style: const TextStyle(
                                color: Color(0xFF38BDF8),
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  _buildCardSection(
                    context: context,
                    children: [
                      _buildDetailRow(
                        'اسم المستخدم / الرمز:',
                        c.username,
                        textColor: const Color(0xFF38BDF8),
                        isMonospace: true,
                        canCopy: true,
                        context: context,
                      ),
                      if (c.clearPassword != null &&
                          c.clearPassword!.isNotEmpty &&
                          c.clearPassword != c.username) ...[
                        Divider(color: context.borderColor),
                        _buildDetailRow(
                          'كلمة المرور:',
                          showCredentials ? c.clearPassword! : '••••••••',
                          textColor: const Color(0xFFFBBF24),
                          isMonospace: true,
                          canCopy: showCredentials,
                          context: context,
                        ),
                      ],
                      if (c.pinCode != null && c.pinCode!.isNotEmpty) ...[
                        Divider(color: context.borderColor),
                        _buildDetailRow(
                          'رمز PIN:',
                          showCredentials ? c.pinCode! : '••••',
                          textColor: const Color(0xFFA78BFA),
                          isMonospace: true,
                          canCopy: showCredentials,
                          context: context,
                        ),
                      ],
                      Divider(color: context.borderColor),
                      _buildDetailRow('الرقم التسلسلي:', c.serialNumber, canCopy: true, context: context),
                      if (c.batchNumber != null) ...[
                        Divider(color: context.borderColor),
                        _buildDetailRow('رقم الدفعة:', c.batchNumber!, context: context),
                      ],
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Section 2: البروفايل والسرعات والحصص
                  _buildSectionHeader('الباقة والسرعات والحصص', Icons.speed_rounded),
                  _buildCardSection(
                    context: context,
                    children: [
                      _buildDetailRow('البروفايل:', c.profileName, context: context),
                      Divider(color: context.borderColor),
                      _buildDetailRow(
                        'مصدر الإعدادات:',
                        c.isCustomQuota ? 'إعدادات مخصصة للكرت (تتجاوز البروفايل)' : 'إعدادات البروفايل الافتراضية',
                        textColor: c.isCustomQuota ? const Color(0xFFF59E0B) : const Color(0xFF94A3B8),
                        context: context,
                      ),
                      Divider(color: context.borderColor),
                      _buildDetailRow(
                        'السرعة المطبقة:',
                        c.formattedSpeedLabel,
                        textColor: const Color(0xFF38BDF8),
                        context: context,
                      ),
                      Divider(color: context.borderColor),
                      _buildDetailRow(
                        'حصة الإنترنت (Quota):',
                        c.formattedDataQuota,
                        textColor: c.isUnlimitedQuota ? const Color(0xFF10B981) : context.textPrimary,
                        context: context,
                      ),
                      Divider(color: context.borderColor),
                      _buildDetailRow(
                        'مدة الصلاحية:',
                        c.formattedValidity,
                        textColor: context.textPrimary,
                        context: context,
                      ),
                      if (c.effectiveTimeLimit != null && c.validityDays != null) ...[
                        Divider(color: context.borderColor),
                        _buildDetailRow(
                          'حد الجلسة بالراوتر:',
                          c.effectiveTimeLimit!,
                          textColor: const Color(0xFF94A3B8),
                          context: context,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Section 3: المحاسبة والاستهلاك اللحظي
                  _buildSectionHeader('المحاسبة والاستهلاك', Icons.analytics_outlined),
                  _buildCardSection(
                    context: context,
                    children: [
                      _buildDetailRow(
                        'البيانات المستهلكة:',
                        c.formattedConsumedBytes,
                        textColor: (c.consumedBytes != null && c.consumedBytes! > 0)
                            ? const Color(0xFFF59E0B)
                            : const Color(0xFF94A3B8),
                        context: context,
                      ),
                      Divider(color: context.borderColor),
                      _buildDetailRow(
                        'البيانات المتبقية:',
                        c.formattedRemainingBytes,
                        textColor: (c.remainingBytes != null && c.remainingBytes! > 0)
                            ? const Color(0xFF10B981)
                            : const Color(0xFF94A3B8),
                        context: context,
                      ),
                      if (c.consumptionPercentage != null) ...[
                        Divider(color: context.borderColor),
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text('نسبة استهلاك الحصة:', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                                  Text(
                                    '${c.consumptionPercentage!.toStringAsFixed(1)}%',
                                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: (c.consumptionPercentage! / 100).clamp(0.0, 1.0),
                                  minHeight: 6,
                                  backgroundColor: const Color(0xFF334155),
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                    c.consumptionPercentage! > 90
                                        ? const Color(0xFFEF4444)
                                        : (c.consumptionPercentage! > 75 ? const Color(0xFFF59E0B) : const Color(0xFF10B981)),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      if (c.sessionUptime != null) ...[
                        Divider(color: context.borderColor),
                        _buildDetailRow(
                          'مدة الجلسة النشطة:',
                          c.sessionUptime!,
                          textColor: const Color(0xFF38BDF8),
                          context: context,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Section 4: التواريخ ومعلومات الراوتر
                  _buildSectionHeader('الشبكة والتواريخ', Icons.calendar_month_outlined),
                  _buildCardSection(
                    context: context,
                    children: [
                      if (c.deviceName != null) ...[
                        _buildDetailRow('الراوتر المرتبط:', c.deviceName!, textColor: const Color(0xFF60A5FA), context: context),
                        Divider(color: context.borderColor),
                      ],
                      _buildDetailRow('السعر:', '${c.price.toStringAsFixed(0)} SDG', textColor: const Color(0xFF10B981), context: context),
                      Divider(color: context.borderColor),
                      _buildDetailRow(
                        'تاريخ التوليد:',
                        DateFormat('yyyy/MM/dd HH:mm').format(c.createdAt),
                        context: context,
                      ),
                      if (c.soldAt != null) ...[
                        Divider(color: context.borderColor),
                        _buildDetailRow(
                          'تاريخ البيع:',
                          DateFormat('yyyy/MM/dd HH:mm').format(c.soldAt!),
                          textColor: const Color(0xFF60A5FA),
                          context: context,
                        ),
                      ],
                      if (c.activatedAt != null) ...[
                        Divider(color: context.borderColor),
                        _buildDetailRow(
                          'تاريخ أول تفعيل:',
                          DateFormat('yyyy/MM/dd HH:mm').format(c.activatedAt!),
                          textColor: const Color(0xFF10B981),
                          context: context,
                        ),
                      ],
                      if (c.expiresAt != null) ...[
                        Divider(color: context.borderColor),
                        _buildDetailRow(
                          'تاريخ انتهاء الصلاحية:',
                          DateFormat('yyyy/MM/dd HH:mm').format(c.expiresAt!),
                          textColor: c.isExpired ? const Color(0xFFEF4444) : const Color(0xFFF59E0B),
                          context: context,
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
          actions: [
            Row(
              children: [
                IconButton(
                  onPressed: () {
                    final textToShare = '''
بطاقة هوتسبوت: ${c.profileName}
اسم المستخدم / الكود: ${c.username}
${c.clearPassword != null ? 'كلمة المرور: ${c.clearPassword}' : ''}
السرعة: ${c.formattedSpeedLabel}
الحصة: ${c.formattedDataQuota}
الصلاحية: ${c.formattedValidity}
السعر: ${c.price.toStringAsFixed(0)} SDG
الرقم التسلسلي: ${c.serialNumber}
رابط الدخول المباشر: ${c.loginUrl}
'''.trim();
                    Share.share(textToShare);
                  },
                  icon: const Icon(Icons.share, color: Color(0xFF38BDF8)),
                  tooltip: 'مشاركة بيانات الكرت',
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('إغلاق', style: TextStyle(color: Color(0xFF94A3B8))),
                ),
              ],
            ),
          ],
        );
      },
    );
  },
);
}

  Widget _buildSectionHeader(String title, IconData icon, {Widget? action}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, top: 4),
      child: Row(
        children: [
          Icon(icon, size: 14, color: const Color(0xFF38BDF8)),
          const SizedBox(width: 6),
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFF38BDF8),
              fontSize: 11.5,
              fontWeight: FontWeight.bold,
            ),
          ),
          if (action != null) ...[
            const Spacer(),
            action,
          ],
        ],
      ),
    );
  }

  Widget _buildCardSection({required BuildContext context, required List<Widget> children}) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: context.bgCardAlt,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildDetailRow(
    String label,
    String value, {
    required BuildContext context,
    Color? textColor,
    bool isMonospace = false,
    bool canCopy = false,
  }) {
    final resolvedColor = textColor ?? context.textPrimary;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(color: context.textSecondary, fontSize: 11),
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
                      color: resolvedColor,
                      fontSize: 11,
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
                    child: const Icon(Icons.copy, size: 13, color: Color(0xFF64748B)),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

