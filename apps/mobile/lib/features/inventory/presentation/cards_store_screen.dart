import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

class CardsStoreScreen extends ConsumerStatefulWidget {
  const CardsStoreScreen({super.key});

  @override
  ConsumerState<CardsStoreScreen> createState() => _CardsStoreScreenState();
}

class _CardsStoreScreenState extends ConsumerState<CardsStoreScreen> {
  String _selectedStatus = 'ALL';
  String _searchQuery = '';

  final List<Map<String, String>> _statusFilters = [
    {'key': 'ALL', 'label': 'الكل'},
    {'key': 'AVAILABLE', 'label': 'متاح'},
    {'key': 'SOLD', 'label': 'مباع'},
    {'key': 'USED', 'label': 'نشط ومستخدم'},
    {'key': 'CANCELLED', 'label': 'ملغي'},
  ];

  void _showCardQrDialog(OfflineCardModel card) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Center(
          child: Text(
            card.profileName,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
          ),
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
                size: 180.0,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'رمز الكرت: ${card.username}',
              style: const TextStyle(
                color: Color(0xFF38BDF8),
                fontWeight: FontWeight.bold,
                fontSize: 16,
                letterSpacing: 2,
              ),
            ),
            if (card.clearPassword != null && card.clearPassword != card.username) ...[
              const SizedBox(height: 4),
              Text(
                'كلمة المرور: ${card.clearPassword}',
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
            ],
            const SizedBox(height: 8),
            Text(
              'السعر: ${card.price.toStringAsFixed(0)} ${card.currency}',
              style: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إغلاق', style: TextStyle(color: Color(0xFF38BDF8))),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final offlineCards = ref.watch(offlineCardsProvider);

    // Filter cards
    final filtered = offlineCards.where((c) {
      if (_selectedStatus != 'ALL' && c.status != _selectedStatus) {
        return false;
      }
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final matchUser = c.username.toLowerCase().contains(query);
        final matchSerial = c.serialNumber.toLowerCase().contains(query);
        final matchProfile = c.profileName.toLowerCase().contains(query);
        return matchUser || matchSerial || matchProfile;
      }
      return true;
    }).toList();

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
                  'البحث، التصفية بالحالة، ومشاركة الكود',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Search Bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'بحث بالرمز، الرقم التسلسلي، أو الباقة...',
                hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF38BDF8)),
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
              onChanged: (val) => setState(() => _searchQuery = val.trim()),
            ),
          ),

          // Horizontal Status Filter Pills
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(
              children: _statusFilters.map((f) {
                final isSelected = _selectedStatus == f['key'];
                return Padding(
                  padding: const EdgeInsets.only(left: 8.0),
                  child: FilterChip(
                    label: Text(f['label']!),
                    selected: isSelected,
                    selectedColor: const Color(0xFF2563EB),
                    backgroundColor: const Color(0xFF1E293B),
                    labelStyle: TextStyle(
                      color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      fontSize: 12,
                    ),
                    onSelected: (_) => setState(() => _selectedStatus = f['key']!),
                  ),
                );
              }).toList(),
            ),
          ),

          // Cards Count summary bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'عدد النتائج: ${filtered.length} كرت',
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                ),
                Text(
                  'إجمالي المخزون: ${offlineCards.length} كرت',
                  style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 12, fontWeight: FontWeight.bold),
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
                      children: const [
                        Icon(Icons.credit_card_off, size: 52, color: Color(0xFF475569)),
                        SizedBox(height: 12),
                        Text(
                          'لا توجد كروت مطابقة لمعايير البحث',
                          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, idx) => _buildCardTile(filtered[idx]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildCardTile(OfflineCardModel card) {
    Color statusColor;
    String statusText;

    switch (card.status) {
      case 'AVAILABLE':
        statusColor = const Color(0xFF10B981);
        statusText = 'متاح للبيع';
        break;
      case 'SOLD':
        statusColor = const Color(0xFF3B82F6);
        statusText = 'مباع';
        break;
      case 'USED':
        statusColor = const Color(0xFFF59E0B);
        statusText = 'مستخدم';
        break;
      case 'CANCELLED':
        statusColor = const Color(0xFFEF4444);
        statusText = 'ملغي';
        break;
      default:
        statusColor = Colors.grey;
        statusText = card.status;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Row(
        children: [
          // QR quick action
          IconButton(
            onPressed: () => _showCardQrDialog(card),
            icon: const Icon(Icons.qr_code, color: Color(0xFF38BDF8)),
            tooltip: 'عرض رمز QR',
          ),
          const SizedBox(width: 8),
          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      card.username,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: statusColor, width: 0.8),
                      ),
                      child: Text(
                        statusText,
                        style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '${card.profileName} • S/N: ${card.serialNumber}',
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                ),
              ],
            ),
          ),
          // Price and Copy
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${card.price.toStringAsFixed(0)} ${card.currency}',
                style: const TextStyle(
                  color: Color(0xFF10B981),
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
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
            ],
          ),
        ],
      ),
    );
  }
}
