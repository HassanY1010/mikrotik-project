import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import 'receipt_dialog.dart';

class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key});

  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen> {
  HotspotProfileModel? _selectedProfile;
  String _paymentMethod = 'CASH';
  final _customerPhoneController = TextEditingController();
  final _customerNameController = TextEditingController();
  bool _isProcessing = false;

  @override
  void dispose() {
    _customerPhoneController.dispose();
    _customerNameController.dispose();
    super.dispose();
  }

  Future<void> _handleSellCard() async {
    if (_selectedProfile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('يرجى تحديد باقة كروت أولاً')),
      );
      return;
    }

    setState(() => _isProcessing = true);

    final isOnline = ref.read(isOnlineModeProvider);
    final syncManager = ref.read(syncManagerProvider);
    final apiClient = ref.read(apiClientProvider);
    final user = ref.read(currentUserProvider);

    try {
      SaleReceiptModel receipt;

      if (!isOnline) {
        // --- OFFLINE SALE ---
        receipt = await syncManager.sellCardOffline(
          profileId: _selectedProfile!.id,
          paymentMethod: _paymentMethod,
          customerPhone: _customerPhoneController.text.trim().isNotEmpty
              ? _customerPhoneController.text.trim()
              : null,
          customerName: _customerNameController.text.trim().isNotEmpty
              ? _customerNameController.text.trim()
              : null,
        );

        // Update Riverpod states
        ref.read(offlineCardsProvider.notifier).refresh();
        ref.read(pendingMutationsProvider.notifier).refresh();
      } else {
        // --- ONLINE SALE ---
        try {
          final res = await apiClient.post(
            ApiEndpoints.salesCheckout,
            data: {
              'profileId': _selectedProfile!.id,
              'paymentMethod': _paymentMethod,
              if (_customerPhoneController.text.trim().isNotEmpty)
                'customerPhone': _customerPhoneController.text.trim(),
              if (_customerNameController.text.trim().isNotEmpty)
                'customerName': _customerNameController.text.trim(),
            },
          );

          final raw = res.data;
          final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
          final card = data['card'] as Map<String, dynamic>;
          final invoice = data['invoiceNumber'] as String? ?? 'INV-ONLINE';

          receipt = SaleReceiptModel(
            invoiceNumber: invoice,
            serialNumber: card['serialNumber'] as String,
            username: card['username'] as String,
            password: card['clearPassword'] as String? ?? card['password'] as String?,
            profileName: _selectedProfile!.name,
            amount: _selectedProfile!.price,
            currency: 'SDG',
            paymentMethod: _paymentMethod,
            soldAt: DateTime.now(),
            cashierName: user?.fullName ?? 'الكاشير',
            customerPhone: _customerPhoneController.text.trim().isNotEmpty
                ? _customerPhoneController.text.trim()
                : null,
            isOffline: false,
          );
        } catch (onlineError) {
          // If online checkout fails (e.g. router unreachable or network dropped),
          // fallback gracefully to offline sale if cards exist
          final offlineCards = ref.read(offlineCardsProvider);
          final hasOffline = offlineCards.any(
            (c) => c.profileId == _selectedProfile!.id && c.status == 'AVAILABLE',
          );

          if (hasOffline) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('تعذر الاتصال المباشر. تم البيع من محفظة الكروت غير المتصلة'),
                  backgroundColor: Colors.orange,
                ),
              );
            }
            receipt = await syncManager.sellCardOffline(
              profileId: _selectedProfile!.id,
              paymentMethod: _paymentMethod,
              customerPhone: _customerPhoneController.text.trim().isNotEmpty
                  ? _customerPhoneController.text.trim()
                  : null,
              customerName: _customerNameController.text.trim().isNotEmpty
                  ? _customerNameController.text.trim()
                  : null,
            );
            ref.read(offlineCardsProvider.notifier).refresh();
            ref.read(pendingMutationsProvider.notifier).refresh();
          } else {
            rethrow;
          }
        }
      }

      // Reset form
      _customerPhoneController.clear();
      _customerNameController.clear();

      if (mounted) {
        ReceiptDialog.show(context, receipt);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final profiles = ref.watch(profilesProvider);
    final offlineCards = ref.watch(offlineCardsProvider);
    final isOnline = ref.watch(isOnlineModeProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('نقطة البيع السريعة'),
        actions: [
          // Online / Offline Mode Toggle
          Row(
            children: [
              Text(
                isOnline ? 'متصل' : 'دون اتصال',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: isOnline ? const Color(0xFF10B981) : Colors.amber,
                ),
              ),
              Switch(
                value: isOnline,
                activeThumbColor: const Color(0xFF0D9488),
                inactiveThumbColor: Colors.amber,
                onChanged: (val) => ref.read(isOnlineModeProvider.notifier).setMode(val),
              ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث الباقات',
            onPressed: () => ref.read(profilesProvider.notifier).fetchProfiles(),
          ),
        ],
      ),
      body: Row(
        children: [
          // Left Side: Profiles selection grid
          Expanded(
            flex: 3,
            child: profiles.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.wifi_off, size: 48, color: Colors.grey),
                        const SizedBox(height: 12),
                        const Text('لا توجد باقات متوفرة'),
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          icon: const Icon(Icons.download),
                          label: const Text('تحميل الباقات من الخادم'),
                          onPressed: () => ref.read(profilesProvider.notifier).fetchProfiles(),
                        ),
                      ],
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 1.35,
                    ),
                    itemCount: profiles.length,
                    itemBuilder: (context, index) {
                      final p = profiles[index];
                      final isSelected = _selectedProfile?.id == p.id;
                      final availableCount = offlineCards
                          .where((c) => c.profileId == p.id && c.status == 'AVAILABLE')
                          .length;

                      return InkWell(
                        onTap: () => setState(() => _selectedProfile = p),
                        borderRadius: BorderRadius.circular(14),
                        child: Container(
                          decoration: BoxDecoration(
                            color: isSelected
                                ? theme.colorScheme.primary.withValues(alpha: 0.15)
                                : theme.cardTheme.color,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: isSelected
                                  ? theme.colorScheme.primary
                                  : Colors.transparent,
                              width: 2,
                            ),
                          ),
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      p.displayName ?? p.name,
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.bold,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: availableCount > 0 ? Colors.green.shade800 : Colors.red.shade900,
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      '$availableCount كرت',
                                      style: const TextStyle(fontSize: 10, color: Colors.white),
                                    ),
                                  ),
                                ],
                              ),
                              if (p.validity != null || p.rateLimit != null)
                                Text(
                                  '${p.validity ?? ''} ${p.rateLimit != null ? '• ${p.rateLimit}' : ''}',
                                  style: const TextStyle(fontSize: 11, color: Colors.grey),
                                ),
                              Text(
                                '${p.price.toStringAsFixed(0)} SDG',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                  color: theme.colorScheme.primary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),

          // Right Side: Quick Checkout Form
          Container(
            width: 320,
            decoration: BoxDecoration(
              color: theme.cardTheme.color,
              border: const Border(right: BorderSide(color: Color(0xFF334155))),
            ),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'تفاصيل العملية',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),

                // Selected Package Box
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _selectedProfile != null
                            ? (_selectedProfile!.displayName ?? _selectedProfile!.name)
                            : 'لم يتم تحديد باقة',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        _selectedProfile != null
                            ? '${_selectedProfile!.price.toStringAsFixed(0)} SDG'
                            : '0 SDG',
                        style: TextStyle(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Payment Method Selector
                const Text('طريقة الدفع', style: TextStyle(fontSize: 12, color: Colors.grey)),
                const SizedBox(height: 6),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'CASH', label: Text('نقداً')),
                    ButtonSegment(value: 'KURAIMI', label: Text('كريمي')),
                    ButtonSegment(value: 'JAWALI', label: Text('جوالي')),
                  ],
                  selected: {_paymentMethod},
                  onSelectionChanged: (val) => setState(() => _paymentMethod = val.first),
                ),
                const SizedBox(height: 16),

                // Optional Customer Details
                TextField(
                  controller: _customerPhoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'رقم هاتف العميل (اختياري)',
                    prefixIcon: Icon(Icons.phone, size: 20),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _customerNameController,
                  decoration: const InputDecoration(
                    labelText: 'اسم العميل (اختياري)',
                    prefixIcon: Icon(Icons.person_outline, size: 20),
                  ),
                ),

                const Spacer(),

                // Sell & Print Action Button
                ElevatedButton.icon(
                  icon: _isProcessing
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.shopping_cart_checkout),
                  label: Text(_isProcessing ? 'جاري المعالجة...' : 'بيع وطباعة فورية'),
                  onPressed: _isProcessing || _selectedProfile == null ? null : _handleSellCard,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

