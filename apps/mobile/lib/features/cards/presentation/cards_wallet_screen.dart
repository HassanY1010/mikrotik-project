import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

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
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showReserveCardsModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => const _ReserveCardsBottomSheet(),
    );
  }

  void _showCardQr(OfflineCardModel card) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('كرت #${card.serialNumber}', textAlign: TextAlign.center),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            QrImageView(
              data: card.loginUrl,
              version: QrVersions.auto,
              size: 180,
              backgroundColor: Colors.white,
            ),
            const SizedBox(height: 12),
            Text(
              'اسم المستخدم: ${card.username}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            if (card.clearPassword != null)
              Text(
                'كلمة المرور: ${card.clearPassword}',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.amber),
              ),
            const SizedBox(height: 6),
            Text(
              'الباقة: ${card.profileName} (${card.price.toStringAsFixed(0)} SDG)',
              style: const TextStyle(color: Colors.grey, fontSize: 13),
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إغلاق'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cards = ref.watch(offlineCardsProvider);

    // Filter cards
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('محفظة الكروت غير المتصلة'),
        actions: [
          ElevatedButton.icon(
            icon: const Icon(Icons.add_shopping_cart, size: 18),
            label: const Text('حجز كروت من الخادم'),
            onPressed: _showReserveCardsModal,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          // Search & Filter Bar
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'بحث بالرقم التسلسلي أو اسم المستخدم...',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _searchQuery = '');
                              },
                            )
                          : null,
                    ),
                    onChanged: (val) => setState(() => _searchQuery = val.trim()),
                  ),
                ),
                const SizedBox(width: 12),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'ALL', label: Text('الكل')),
                    ButtonSegment(value: 'AVAILABLE', label: Text('المتوفرة')),
                    ButtonSegment(value: 'SOLD', label: Text('المباعة')),
                  ],
                  selected: {_filter},
                  onSelectionChanged: (val) => setState(() => _filter = val.first),
                ),
              ],
            ),
          ),

          // Cards List
          Expanded(
            child: filtered.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.credit_card_off, size: 54, color: Colors.grey),
                        const SizedBox(height: 12),
                        Text(
                          cards.isEmpty
                              ? 'محفظتك خالية من الكروت المحجوزة'
                              : 'لا توجد كروت مطابقة لمعايير البحث',
                          style: const TextStyle(fontSize: 16, color: Colors.grey),
                        ),
                        if (cards.isEmpty) ...[
                          const SizedBox(height: 16),
                          ElevatedButton.icon(
                            icon: const Icon(Icons.download),
                            label: const Text('حجز كروت الآن من الخادم'),
                            onPressed: _showReserveCardsModal,
                          ),
                        ],
                      ],
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final card = filtered[index];
                      final isAvailable = card.status == 'AVAILABLE';

                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: isAvailable
                                ? const Color(0xFF0D9488).withValues(alpha: 0.15)
                                : Colors.grey.withValues(alpha: 0.15),
                            child: Icon(
                              isAvailable ? Icons.credit_card : Icons.check_circle_outline,
                              color: isAvailable ? const Color(0xFF0D9488) : Colors.grey,
                            ),
                          ),
                          title: Row(
                            children: [
                              Text(
                                card.serialNumber,
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: isAvailable ? Colors.green.shade800 : Colors.blueGrey.shade800,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  isAvailable ? 'جاهز للبيع' : 'مباع',
                                  style: const TextStyle(fontSize: 10, color: Colors.white),
                                ),
                              ),
                            ],
                          ),
                          subtitle: Text(
                            'المستخدم: ${card.username} | ${card.profileName} | ${card.price.toStringAsFixed(0)} ${card.currency}',
                            style: const TextStyle(fontSize: 12),
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.qr_code_2),
                            tooltip: 'عرض رمز الاستجابة السريعة',
                            onPressed: () => _showCardQr(card),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
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
      setState(() {
        _error = 'فشل حجز الكروت: تأكد من الاتصال بالخادم وتوفر كروت جاهزة لهذه الباقة';
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profiles = ref.watch(profilesProvider);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 24,
        right: 24,
        top: 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'حجز كروت للمحفظة غير المتصلة',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          const Text(
            'سيتم قفل الكروت على الخادم وتخزينها مشفرة على جهازك لتفادي التعارض',
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 20),

          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.red.shade900.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(_error!, style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
            ),
            const SizedBox(height: 12),
          ],

          DropdownButtonFormField<HotspotProfileModel>(
            decoration: const InputDecoration(labelText: 'اختر باقة الكروت'),
            items: profiles
                .map((p) => DropdownMenuItem(
                      value: p,
                      child: Text('${p.displayName ?? p.name} (${p.price.toStringAsFixed(0)} SDG)'),
                    ))
                .toList(),
            initialValue: _selectedProfile,
            onChanged: (val) => setState(() => _selectedProfile = val),
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
            onSelectionChanged: (val) => setState(() => _count = val.first),
          ),
          const SizedBox(height: 24),

          ElevatedButton(
            onPressed: _isLoading || _selectedProfile == null ? null : _handleReserve,
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text('تأكيد حجز $_count كرت الآن'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
