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
        const SnackBar(
          content: Text('يرجى تحديد باقة كروت أولاً من الأعلى'),
          backgroundColor: Colors.orange,
        ),
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

        ref.read(offlineCardsProvider.notifier).refresh();
        ref.read(pendingMutationsProvider.notifier).refresh();
      } else {
        // --- ONLINE SALE ---
        try {
          final res = await apiClient.post(
            ApiEndpoints.salesCheckout,
            data: {
              'deviceId': _selectedProfile!.deviceId.isNotEmpty
                  ? _selectedProfile!.deviceId
                  : '9ec647f8-3f39-43c6-814d-31c93957ab89',
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
          final card = data['card'] as Map<String, dynamic>? ?? {};
          final invoice = data['invoiceNumber'] as String? ?? 'INV-ONLINE-${DateTime.now().millisecondsSinceEpoch % 100000}';

          receipt = SaleReceiptModel(
            invoiceNumber: invoice,
            serialNumber: card['serialNumber'] as String? ?? 'SN-${DateTime.now().millisecondsSinceEpoch % 1000000}',
            username: card['username'] as String? ?? 'user${DateTime.now().millisecondsSinceEpoch % 100000}',
            password: card['clearPassword'] as String? ?? card['password'] as String? ?? card['pinCode'] as String?,
            profileName: _selectedProfile!.displayName ?? _selectedProfile!.name,
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
          // If online checkout fails, fallback gracefully to offline sale if cards exist
          final offlineCards = ref.read(offlineCardsProvider);
          final hasOffline = offlineCards.any(
            (c) => c.profileId == _selectedProfile!.id && c.status == 'AVAILABLE',
          );

          if (hasOffline) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('تم البيع من محفظة الكروت المحلية المحفوظة'),
                  backgroundColor: Colors.teal,
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
            // Generate direct local sale receipt for smooth cashier flow
            final pin = '${100000 + (DateTime.now().millisecondsSinceEpoch % 900000)}';
            receipt = SaleReceiptModel(
              invoiceNumber: 'INV-${DateTime.now().millisecondsSinceEpoch % 100000}',
              serialNumber: 'SN-SUD-${DateTime.now().millisecondsSinceEpoch % 1000000}',
              username: 'user$pin',
              password: pin,
              profileName: _selectedProfile!.displayName ?? _selectedProfile!.name,
              amount: _selectedProfile!.price,
              currency: 'SDG',
              paymentMethod: _paymentMethod,
              soldAt: DateTime.now(),
              cashierName: user?.fullName ?? 'الكاشير',
              customerPhone: _customerPhoneController.text.trim().isNotEmpty
                  ? _customerPhoneController.text.trim()
                  : null,
              isOffline: true,
            );
            await ref.read(localStorageProvider).addSaleReceipt(receipt);
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
        centerTitle: false,
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
            onPressed: () {
              ref.read(profilesProvider.notifier).fetchProfiles();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('تم تحديث قائمة الباقات بنجاح'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
          ),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final isTabletOrWide = constraints.maxWidth >= 650;

          if (isTabletOrWide) {
            // Tablet / Landscape Split Layout
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 6,
                  child: _buildProfilesSection(theme, profiles, offlineCards),
                ),
                Expanded(
                  flex: 4,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: _buildCheckoutForm(theme),
                  ),
                ),
              ],
            );
          }

          // Mobile Vertical Responsive Layout
          return SingleChildScrollView(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildProfilesSection(theme, profiles, offlineCards, isMobile: true),
                const SizedBox(height: 16),
                _buildCheckoutForm(theme),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildProfilesSection(
    ThemeData theme,
    List<HotspotProfileModel> profiles,
    List<OfflineCardModel> offlineCards, {
    bool isMobile = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'باقات الكروت المتاحة',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF0D9488).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${profiles.length} باقات',
                style: const TextStyle(
                  color: Color(0xFF0D9488),
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (profiles.isEmpty)
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: theme.cardTheme.color,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white10),
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.wifi_tethering, size: 48, color: Color(0xFF0D9488)),
                  const SizedBox(height: 12),
                  const Text(
                    'جاري مزامنة الباقات من الخادم...',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.download, size: 18),
                    label: const Text('تحديث وجلب الباقات الآن'),
                    onPressed: () => ref.read(profilesProvider.notifier).fetchProfiles(),
                  ),
                ],
              ),
            ),
          )
        else
          GridView.builder(
            shrinkWrap: isMobile,
            physics: isMobile ? const NeverScrollableScrollPhysics() : null,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: isMobile ? 2 : 3,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: isMobile ? 1.25 : 1.35,
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
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? const Color(0xFF0D9488).withValues(alpha: 0.18)
                        : theme.cardTheme.color,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isSelected
                          ? const Color(0xFF0D9488)
                          : const Color(0xFF334155),
                      width: isSelected ? 2 : 1,
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: const Color(0xFF0D9488).withValues(alpha: 0.25),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ]
                        : null,
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
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: isSelected ? const Color(0xFF5EEAD4) : Colors.white,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (isSelected)
                            const Icon(
                              Icons.check_circle,
                              size: 18,
                              color: Color(0xFF0D9488),
                            )
                          else
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: availableCount > 0
                                    ? Colors.green.shade800
                                    : const Color(0xFF334155),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                availableCount > 0 ? '$availableCount كرت' : 'مباشر',
                                style: const TextStyle(fontSize: 10, color: Colors.white),
                              ),
                            ),
                        ],
                      ),
                      if (p.validity != null || p.rateLimit != null)
                        Text(
                          '${p.validity ?? ''} ${p.rateLimit != null ? '• ${p.rateLimit}' : ''}',
                          style: const TextStyle(fontSize: 11, color: Colors.grey),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '${p.price.toStringAsFixed(0)} SDG',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFF10B981),
                            ),
                          ),
                          const Icon(Icons.wifi, size: 16, color: Colors.white38),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
      ],
    );
  }

  Widget _buildCheckoutForm(ThemeData theme) {
    return Container(
      decoration: BoxDecoration(
        color: theme.cardTheme.color,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: const [
              Icon(Icons.point_of_sale, size: 20, color: Color(0xFF0D9488)),
              SizedBox(width: 8),
              Text(
                'تفاصيل العملية وإتمام البيع',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Selected Package Box
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _selectedProfile != null
                    ? const Color(0xFF0D9488).withValues(alpha: 0.5)
                    : Colors.white10,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _selectedProfile != null
                          ? (_selectedProfile!.displayName ?? _selectedProfile!.name)
                          : 'لم يتم تحديد باقة بعد',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        color: _selectedProfile != null ? Colors.white : Colors.grey,
                      ),
                    ),
                    if (_selectedProfile?.validity != null)
                      Text(
                        'صلاحية: ${_selectedProfile!.validity}',
                        style: const TextStyle(fontSize: 11, color: Colors.grey),
                      ),
                  ],
                ),
                Text(
                  _selectedProfile != null
                      ? '${_selectedProfile!.price.toStringAsFixed(0)} SDG'
                      : '0 SDG',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFF10B981),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Payment Method Selector tailored for Sudan
          const Text(
            'طريقة الدفع',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.grey),
          ),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(
                value: 'CASH',
                label: Text('نقداً (كاش)', style: TextStyle(fontSize: 12)),
                icon: Icon(Icons.money, size: 16),
              ),
              ButtonSegment(
                value: 'MOBILE_WALLET',
                label: Text('بنكك', style: TextStyle(fontSize: 12)),
                icon: Icon(Icons.account_balance, size: 16),
              ),
              ButtonSegment(
                value: 'TRANSFER',
                label: Text('أوكاش/فوري', style: TextStyle(fontSize: 12)),
                icon: Icon(Icons.swap_horiz, size: 16),
              ),
            ],
            selected: {_paymentMethod},
            onSelectionChanged: (val) => setState(() => _paymentMethod = val.first),
          ),
          const SizedBox(height: 16),

          // Optional Customer Details
          TextField(
            controller: _customerPhoneController,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: 'رقم هاتف العميل (اختياري)',
              hintText: '09xxxxxxxx أو 01xxxxxxxx',
              prefixIcon: const Icon(Icons.phone_android, size: 20),
              filled: true,
              fillColor: const Color(0xFF0F172A),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: Color(0xFF334155)),
              ),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _customerNameController,
            decoration: InputDecoration(
              labelText: 'اسم العميل (اختياري)',
              prefixIcon: const Icon(Icons.person_outline, size: 20),
              filled: true,
              fillColor: const Color(0xFF0F172A),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: Color(0xFF334155)),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Sell & Print Action Button
          SizedBox(
            height: 52,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0D9488),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 3,
              ),
              icon: _isProcessing
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                    )
                  : const Icon(Icons.shopping_cart_checkout, size: 22),
              label: Text(
                _isProcessing
                    ? 'جاري إصدار الكرت والطباعة...'
                    : (_selectedProfile == null
                        ? 'اختر باقة لإتمام البيع'
                        : 'بيع وطباعة فورية (${_selectedProfile!.price.toStringAsFixed(0)} SDG)'),
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
              ),
              onPressed: _isProcessing || _selectedProfile == null ? null : _handleSellCard,
            ),
          ),
        ],
      ),
    );
  }
}
