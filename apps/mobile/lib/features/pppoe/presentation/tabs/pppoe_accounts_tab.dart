import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers.dart';
import '../dialogs/create_edit_pppoe_account_dialog.dart';

class PppoeAccountsTab extends ConsumerStatefulWidget {
  const PppoeAccountsTab({super.key});

  @override
  ConsumerState<PppoeAccountsTab> createState() => _PppoeAccountsTabState();
}

class _PppoeAccountsTabState extends ConsumerState<PppoeAccountsTab> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String _statusFilter = 'ALL';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showCreateEditDialog([PppoeAccountModel? account]) {
    showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => CreateEditPppoeAccountDialog(existingAccount: account),
    );
  }

  void _handleToggleStatus(PppoeAccountModel account) async {
    final willDisable = account.status == 'ACTIVE';
    final actionText = willDisable ? 'تعطيل وقطع اتصال' : 'تفعيل';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('تأكيد $actionText المشترك', style: const TextStyle(color: Colors.white, fontSize: 16)),
        content: Text(
          willDisable
            ? 'هل أنت متأكد من تعطيل حساب المشترك «${account.username}»؟ سيتم حظر الاتصال وقطع الجلسة النشطة فوراً من الراوتر.'
            : 'هل أنت متأكد من إعادة تفعيل حساب المشترك «${account.username}» على الراوتر؟',
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: willDisable ? const Color(0xFFEF4444) : const Color(0xFF10B981),
            ),
            child: Text(actionText, style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final notifier = ref.read(pppoeAccountsProvider.notifier);
    final res = willDisable
        ? await notifier.disableAccount(account.id, account.username)
        : await notifier.enableAccount(account.id, account.username);

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(res['message']?.toString() ?? 'تم تحديث حالة المشترك'),
        backgroundColor: res['success'] == true ? const Color(0xFF10B981) : const Color(0xFFEF4444),
      ),
    );
  }

  void _handleDelete(PppoeAccountModel account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('تأكيد حذف المشترك', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: Text(
          'هل أنت متأكد من رغبتك في حذف حساب المشترك «${account.username}» نهائياً؟ سيتم حذف بياناته من قاعدة البيانات وجدولة إزالة حسابه من الراوتر.',
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: const Text('حذف الحساب', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final res = await ref.read(pppoeAccountsProvider.notifier).deleteAccount(account.id, account.username);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(res['message']?.toString() ?? 'تم حذف الحساب'),
        backgroundColor: res['success'] == true ? const Color(0xFF10B981) : const Color(0xFFEF4444),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final accountsAsync = ref.watch(pppoeAccountsProvider);
    final sessionsAsync = ref.watch(pppoeSessionsProvider);

    // Set of usernames currently online in active sessions
    final activeOnlineUsers = sessionsAsync.asData?.value.map((s) => s.username).toSet() ?? {};

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: const Color(0xFF38BDF8),
        icon: const Icon(Icons.person_add, color: Color(0xFF0F172A)),
        label: const Text(
          'إضافة مشترك',
          style: TextStyle(color: Color(0xFF0F172A), fontWeight: FontWeight.bold),
        ),
      ),
      body: Column(
        children: [
          // Search & Filter Bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFF334155)),
                    ),
                    child: TextField(
                      controller: _searchController,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: 'بحث باسم المشترك، الهاتف، أو الـ IP...',
                        hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                        prefixIcon: const Icon(Icons.search, color: Color(0xFF64748B), size: 18),
                        suffixIcon: _searchQuery.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear, color: Color(0xFF94A3B8), size: 16),
                                onPressed: () {
                                  _searchController.clear();
                                  setState(() => _searchQuery = '');
                                },
                              )
                            : null,
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                      onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
                  tooltip: 'تحديث الحسابات',
                  onPressed: () => ref.read(pppoeAccountsProvider.notifier).refresh(),
                ),
              ],
            ),
          ),

          // Status Filter Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                _buildFilterChip('الكل', 'ALL'),
                _buildFilterChip('نشط', 'ACTIVE'),
                _buildFilterChip('معطل', 'DISABLED'),
                _buildFilterChip('منتهي', 'EXPIRED'),
                _buildFilterChip('موقوف', 'SUSPENDED'),
              ],
            ),
          ),
          const SizedBox(height: 6),

          // Accounts List
          Expanded(
            child: accountsAsync.when(
              loading: () => const Center(
                child: CircularProgressIndicator(color: Color(0xFF38BDF8)),
              ),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 40),
                      const SizedBox(height: 12),
                      Text(
                        'تعذر تحميل حسابات المشتركين: $err',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Color(0xFFF87171), fontSize: 13),
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: () => ref.read(pppoeAccountsProvider.notifier).refresh(),
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF334155)),
                        child: const Text('إعادة المحاولة', style: TextStyle(color: Colors.white)),
                      ),
                    ],
                  ),
                ),
              ),
              data: (accounts) {
                final filtered = accounts.where((a) {
                  // Status Filter
                  if (_statusFilter != 'ALL' && a.status != _statusFilter) {
                    return false;
                  }
                  // Search Query
                  if (_searchQuery.isNotEmpty) {
                    final matchUser = a.username.toLowerCase().contains(_searchQuery);
                    final matchName = a.customerName?.toLowerCase().contains(_searchQuery) ?? false;
                    final matchPhone = a.customerPhone?.contains(_searchQuery) ?? false;
                    final matchIp = a.staticIp?.contains(_searchQuery) ?? false;
                    return matchUser || matchName || matchPhone || matchIp;
                  }
                  return true;
                }).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.people_outline, color: Color(0xFF475569), size: 48),
                        const SizedBox(height: 12),
                        const Text(
                          'لا يوجد مشتركون مطابقون',
                          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 15, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _searchQuery.isNotEmpty || _statusFilter != 'ALL'
                              ? 'جرّب تغيير خيارات البحث أو التصفية'
                              : 'انقر على "إضافة مشترك" لإنشاء أول حساب PPPoE',
                          style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  color: const Color(0xFF38BDF8),
                  backgroundColor: const Color(0xFF1E293B),
                  onRefresh: () => ref.read(pppoeAccountsProvider.notifier).refresh(),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 6, 16, 80),
                    itemCount: filtered.length,
                    itemBuilder: (context, index) {
                      final acc = filtered[index];
                      final isOnline = activeOnlineUsers.contains(acc.username);

                      return _buildAccountCard(acc, isOnline);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String value) {
    final isSelected = _statusFilter == value;
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: ChoiceChip(
        label: Text(label),
        selected: isSelected,
        onSelected: (_) => setState(() => _statusFilter = value),
        selectedColor: const Color(0xFF38BDF8),
        backgroundColor: const Color(0xFF1E293B),
        labelStyle: TextStyle(
          color: isSelected ? const Color(0xFF0F172A) : const Color(0xFF94A3B8),
          fontSize: 12,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: isSelected ? const Color(0xFF38BDF8) : const Color(0xFF334155),
          ),
        ),
      ),
    );
  }

  Widget _buildAccountCard(PppoeAccountModel acc, bool isOnline) {
    Color statusColor;
    String statusText;
    switch (acc.status) {
      case 'ACTIVE':
        statusColor = const Color(0xFF10B981);
        statusText = 'مفعّل';
        break;
      case 'DISABLED':
        statusColor = const Color(0xFF64748B);
        statusText = 'معطل';
        break;
      case 'EXPIRED':
        statusColor = const Color(0xFFEF4444);
        statusText = 'منتهي';
        break;
      case 'SUSPENDED':
        statusColor = const Color(0xFFF59E0B);
        statusText = 'موقوف';
        break;
      default:
        statusColor = const Color(0xFF94A3B8);
        statusText = acc.status;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isOnline ? const Color(0xFF10B981).withValues(alpha: 0.5) : const Color(0xFF334155),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Username + Online indicator + Popup menu
            Row(
              children: [
                // Live Connection Status Dot (Green pulse if online, gray otherwise)
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isOnline ? const Color(0xFF10B981) : const Color(0xFF475569),
                    boxShadow: isOnline
                        ? [
                            BoxShadow(
                              color: const Color(0xFF10B981).withValues(alpha: 0.6),
                              blurRadius: 6,
                              spreadRadius: 1,
                            ),
                          ]
                        : null,
                  ),
                ),
                const SizedBox(width: 8),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        acc.username,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'monospace',
                        ),
                      ),
                      if (acc.customerName != null && acc.customerName!.isNotEmpty)
                        Text(
                          acc.customerName!,
                          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                        ),
                    ],
                  ),
                ),

                // Status Badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                  ),
                  child: Text(
                    statusText,
                    style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ),

                // Actions Menu
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_vert, color: Color(0xFF94A3B8), size: 20),
                  color: const Color(0xFF1E293B),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: const BorderSide(color: Color(0xFF334155)),
                  ),
                  onSelected: (val) {
                    if (val == 'edit') {
                      _showCreateEditDialog(acc);
                    } else if (val == 'toggle') {
                      _handleToggleStatus(acc);
                    } else if (val == 'delete') {
                      _handleDelete(acc);
                    }
                  },
                  itemBuilder: (ctx) => [
                    const PopupMenuItem(
                      value: 'edit',
                      child: Row(
                        children: [
                          Icon(Icons.edit_outlined, color: Color(0xFF38BDF8), size: 18),
                          SizedBox(width: 8),
                          Text('تعديل البيانات', style: TextStyle(color: Colors.white, fontSize: 13)),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'toggle',
                      child: Row(
                        children: [
                          Icon(
                            acc.status == 'ACTIVE' ? Icons.power_settings_new : Icons.check_circle_outline,
                            color: acc.status == 'ACTIVE' ? const Color(0xFFEF4444) : const Color(0xFF10B981),
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            acc.status == 'ACTIVE' ? 'تعطيل الحساب' : 'تفعيل الحساب',
                            style: TextStyle(
                              color: acc.status == 'ACTIVE' ? const Color(0xFFF87171) : const Color(0xFF34D399),
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          Icon(Icons.delete_outline, color: Color(0xFFEF4444), size: 18),
                          SizedBox(width: 8),
                          Text('حذف الحساب', style: TextStyle(color: Color(0xFFF87171), fontSize: 13)),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 10),
            const Divider(color: Color(0xFF334155), height: 1),
            const SizedBox(height: 10),

            // Metadata Row: Profile, Price, Live indicator
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Profile & Rate Limit
                Row(
                  children: [
                    const Icon(Icons.speed, color: Color(0xFF06B6D4), size: 15),
                    const SizedBox(width: 5),
                    Text(
                      acc.profileName ?? 'باقة السرعة',
                      style: const TextStyle(color: Color(0xFF06B6D4), fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),

                // Live status text
                Text(
                  isOnline ? '● متصل بالإنترنت حالياً' : '○ غير متصل',
                  style: TextStyle(
                    color: isOnline ? const Color(0xFF10B981) : const Color(0xFF64748B),
                    fontSize: 11,
                    fontWeight: isOnline ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 6),

            // Details info: Static IP, Phone, Price
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (acc.staticIp != null && acc.staticIp!.isNotEmpty)
                  Text(
                    'IP: ${acc.staticIp}',
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontFamily: 'monospace'),
                  )
                else if (acc.customerPhone != null && acc.customerPhone!.isNotEmpty)
                  Text(
                    'هاتف: ${acc.customerPhone}',
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                  )
                else
                  const SizedBox.shrink(),

                Text(
                  '${acc.price.toStringAsFixed(0)} ج.س / ${acc.billingCycle == "YEARLY" ? "سنوياً" : "شهرياً"}',
                  style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
