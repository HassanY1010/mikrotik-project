import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';

class ProfileWalletScreen extends ConsumerStatefulWidget {
  const ProfileWalletScreen({super.key});

  @override
  ConsumerState<ProfileWalletScreen> createState() => _ProfileWalletScreenState();
}

class _ProfileWalletScreenState extends ConsumerState<ProfileWalletScreen> {
  final _rechargeController = TextEditingController();
  final _notesController = TextEditingController(text: 'شحن رصيد إضافي');
  final _redeemPointsController = TextEditingController();

  bool _isRecharging = false;
  bool _isUpdatingSettings = false;
  bool _isRedeemingPoints = false;

  @override
  void dispose() {
    _rechargeController.dispose();
    _notesController.dispose();
    _redeemPointsController.dispose();
    super.dispose();
  }

  void _showRechargeDialog() {
    _rechargeController.clear();
    _notesController.text = 'شحن رصيد إضافي';

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: const [
              Icon(Icons.add_card, color: Color(0xFF10B981), size: 24),
              SizedBox(width: 8),
              Text(
                'شحن رصيد المحفظة السحابية',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'المبلغ المراد شحنه (SDG):',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _rechargeController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  decoration: InputDecoration(
                    hintText: 'مثال: 15000',
                    hintStyle: const TextStyle(color: Color(0xFF64748B)),
                    suffixText: 'SDG',
                    suffixStyle: const TextStyle(color: Color(0xFF10B981)),
                    filled: true,
                    fillColor: const Color(0xFF0F172A),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [5000, 10000, 25000, 50000].map((preset) {
                    return InkWell(
                      onTap: () {
                        setDialogState(() {
                          _rechargeController.text = preset.toString();
                        });
                      },
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFF334155)),
                        ),
                        child: Text(
                          '+$preset',
                          style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),
                const Text(
                  'البيان أو رقم السند / الإيصال:',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _notesController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'مثال: إيداع نقدي الخزينة / إيصال #102',
                    hintStyle: const TextStyle(color: Color(0xFF64748B)),
                    filled: true,
                    fillColor: const Color(0xFF0F172A),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('إلغاء', style: TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              onPressed: () async {
                final amount = double.tryParse(_rechargeController.text.trim()) ?? 0;
                if (amount <= 0) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('يرجى إدخال مبلغ شحن صحيح أكبر من الصفر'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                final messenger = ScaffoldMessenger.of(context);
                Navigator.pop(ctx);
                setState(() => _isRecharging = true);

                final notes = _notesController.text.trim().isEmpty
                    ? 'شحن رصيد إضافي للمحفظة السحابية'
                    : _notesController.text.trim();

                final success = await ref
                    .read(walletProvider.notifier)
                    .recharge(amount, notes);

                if (!mounted) return;
                setState(() => _isRecharging = false);

                messenger.showSnackBar(
                  SnackBar(
                    content: Text(
                      success
                          ? 'تم شحن المحفظة بمبلغ $amount SDG بنجاح وتحديث الرصيد الفعلي'
                          : 'حدث خطأ أثناء تنفيذ عملية الشحن، يرجى المحاولة ثانية',
                    ),
                    backgroundColor: success ? const Color(0xFF10B981) : Colors.red,
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: const Text('تأكيد الشحن الفعلي', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  void _showRedeemPointsDialog(int currentPoints) {
    if (currentPoints < 1000) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('الحد الأدنى لاستبدال النقاط هو 1,000 نقطة. رصيدك الحالي: $currentPoints نقطة'),
          backgroundColor: const Color(0xFFF59E0B),
        ),
      );
      return;
    }

    final maxRedeemable = (currentPoints ~/ 1000) * 1000;
    _redeemPointsController.text = maxRedeemable.toString();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: const [
            Icon(Icons.stars, color: Color(0xFFFBBF24), size: 24),
            SizedBox(width: 8),
            Text(
              'استبدال نقاط الولاء',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'النقاط المتوفرة: $currentPoints نقطة (كل 1000 نقطة = 1000 SDG رصيد مجاني)',
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _redeemPointsController,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              decoration: InputDecoration(
                labelText: 'عدد النقاط المراد استبدالها',
                labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                suffixText: 'نقطة',
                suffixStyle: const TextStyle(color: Color(0xFFFBBF24)),
                filled: true,
                fillColor: const Color(0xFF0F172A),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إلغاء', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            onPressed: () async {
              final points = int.tryParse(_redeemPointsController.text.trim()) ?? 0;
              if (points < 1000) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('الحد الأدنى للاستبدال هو 1,000 نقطة'),
                    backgroundColor: Colors.red,
                  ),
                );
                return;
              }
              if (points > currentPoints) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('عدد النقاط المطلوب يتجاوز الرصيد المتوفر'),
                    backgroundColor: Colors.red,
                  ),
                );
                return;
              }

              final messenger = ScaffoldMessenger.of(context);
              Navigator.pop(ctx);
              setState(() => _isRedeemingPoints = true);

              final success = await ref
                  .read(walletProvider.notifier)
                  .redeemPoints(points);

              if (!mounted) return;
              setState(() => _isRedeemingPoints = false);

              messenger.showSnackBar(
                SnackBar(
                  content: Text(
                    success
                        ? 'تم استبدال $points نقطة وإضافة $points SDG إلى رصيد المحفظة بنجاح'
                        : 'تعذر استبدال النقاط حالياً، يرجى المحاولة لاحقاً',
                  ),
                  backgroundColor: success ? const Color(0xFF10B981) : Colors.red,
                ),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF59E0B),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('استبدال إلى رصيد محفظة', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final walletAsync = ref.watch(walletProvider);

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
                color: const Color(0xFFEC4899).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.account_balance_wallet, color: Color(0xFFF472B6), size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'محفظة السحاب ونقاط الولاء',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'الرصيد الفعلي، التغذية التلقائية، والمكافآت',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
            onPressed: () => ref.read(walletProvider.notifier).refresh(),
            tooltip: 'تحديث الرصيد الفعلي',
          ),
        ],
      ),
      body: walletAsync.when(
        data: (wallet) => _buildWalletView(wallet),
        loading: () => const Center(
          child: CircularProgressIndicator(color: Color(0xFFEC4899)),
        ),
        error: (err, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off, color: Colors.redAccent, size: 48),
              const SizedBox(height: 12),
              Text('خطأ في جلب بيانات المحفظة: $err', style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: () => ref.read(walletProvider.notifier).refresh(),
                icon: const Icon(Icons.refresh),
                label: const Text('إعادة المحاولة'),
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF38BDF8)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildWalletView(WalletDataModel wallet) {
    return RefreshIndicator(
      onRefresh: () => ref.read(walletProvider.notifier).refresh(),
      color: const Color(0xFFEC4899),
      backgroundColor: const Color(0xFF1E293B),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Main Balance Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF831843), Color(0xFF4C0519)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF831843).withValues(alpha: 0.35),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('رصيد المحفظة السحابية الفعلي', style: TextStyle(color: Colors.white70, fontSize: 13)),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text('متزامن وموثق', style: TextStyle(color: Colors.white, fontSize: 11)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '${wallet.walletBalance.toStringAsFixed(2)} ${wallet.currency}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      fontSize: 28,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _isRecharging ? null : _showRechargeDialog,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: const Color(0xFF831843),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: _isRecharging
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF831843)))
                          : const Icon(Icons.add_circle, color: Color(0xFF831843)),
                      label: Text(
                        _isRecharging ? 'جارِ تنفيذ الشحن...' : 'شحن رصيد إضافي للمحفظة',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Loyalty Points Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.3)),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.stars, color: Color(0xFFFBBF24), size: 30),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('نقاط الولاء والمكافآت', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                            const SizedBox(height: 4),
                            Text(
                              '${wallet.loyaltyPoints} نقطة مجمعة',
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                            ),
                            const SizedBox(height: 2),
                            const Text('تكسب نقطة لكل 100 SDG مبيعات. كل 1000 نقطة = 1000 SDG رصيد محفظة', style: TextStyle(color: Color(0xFF64748B), fontSize: 10)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (wallet.loyaltyPoints >= 1000) ...[
                    const SizedBox(height: 12),
                    const Divider(color: Color(0xFF334155), height: 1),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: TextButton.icon(
                        onPressed: _isRedeemingPoints ? null : () => _showRedeemPointsDialog(wallet.loyaltyPoints),
                        icon: _isRedeemingPoints
                            ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFFBBF24)))
                            : const Icon(Icons.redeem, color: Color(0xFFFBBF24), size: 18),
                        label: Text(
                          _isRedeemingPoints ? 'جارِ الاستبدال...' : 'استبدال النقاط برصيد محفظة الآن',
                          style: const TextStyle(color: Color(0xFFFBBF24), fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Admin Cards Mode Feature Card
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text('سماح بكروت الإدارة والتغذية التلقائية', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                        SizedBox(height: 2),
                        Text('توليد كروت مباشرة بالخصم من رصيد المحفظة السحابية', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                      ],
                    ),
                  ),
                  if (_isUpdatingSettings)
                    const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFEC4899)))
                  else
                    Switch(
                      value: wallet.allowAdminCards,
                      activeThumbColor: const Color(0xFFEC4899),
                      onChanged: (val) async {
                        final messenger = ScaffoldMessenger.of(context);
                        setState(() => _isUpdatingSettings = true);
                        final success = await ref
                            .read(walletProvider.notifier)
                            .updateSettings(val);
                        if (!mounted) return;
                        setState(() => _isUpdatingSettings = false);

                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(
                              success
                                  ? (val ? 'تم تفعيل كروت الإدارة وحفظ التفضيل في النظام' : 'تم تعطيل كروت الإدارة وحفظ التفضيل في النظام')
                                  : 'فشل حفظ الإعداد في الخادم، يرجى المحاولة ثانية',
                            ),
                            backgroundColor: success ? const Color(0xFF10B981) : Colors.red,
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // Transactions log section
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('العمليات الأخيرة في المحفظة', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                if (wallet.transactions.isNotEmpty)
                  Text(
                    '${wallet.transactions.length} عمليات',
                    style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            _buildRealTransactionsList(wallet),
          ],
        ),
      ),
    );
  }

  Widget _buildRealTransactionsList(WalletDataModel wallet) {
    final txList = wallet.transactions;

    if (txList.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF334155)),
        ),
        child: Column(
          children: const [
            Icon(Icons.history_toggle_off, color: Color(0xFF64748B), size: 44),
            SizedBox(height: 10),
            Text(
              'لا توجد حركات محفظة مسجلة حتى الآن',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
            ),
            SizedBox(height: 4),
            Text(
              'سيتم تسجيل عمليات الشحن، استبدال النقاط، واستهلاك الكروت هنا تلقائياً',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
            ),
          ],
        ),
      );
    }

    return Column(
      children: txList.map((t) {
        final isCredit = t.amount > 0 || t.type == 'RECHARGE' || t.type == 'REDEEM_POINTS' || t.type == 'BONUS';
        final isRedeem = t.type == 'REDEEM_POINTS';
        final isBonus = t.type == 'BONUS';

        Color iconColor = isCredit ? Colors.green : Colors.red;
        IconData iconData = isCredit ? Icons.arrow_downward : Icons.arrow_upward;

        if (isRedeem || isBonus) {
          iconColor = const Color(0xFFFBBF24);
          iconData = Icons.stars;
        }

        final displayTitle = t.notes?.isNotEmpty == true
            ? t.notes!
            : (t.type == 'RECHARGE'
                ? 'شحن رصيد إضافي'
                : t.type == 'REDEEM_POINTS'
                    ? 'استبدال نقاط ولاء'
                    : t.type == 'BONUS'
                        ? 'مكافأة نقاط ولاء'
                        : 'خصم / استهلاك محفظة');

        final formattedDate = '${t.createdAt.year}-${t.createdAt.month.toString().padLeft(2, '0')}-${t.createdAt.day.toString().padLeft(2, '0')} ${t.createdAt.hour.toString().padLeft(2, '0')}:${t.createdAt.minute.toString().padLeft(2, '0')}';

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: iconColor.withValues(alpha: 0.15),
                      child: Icon(iconData, color: iconColor, size: 16),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            displayTitle,
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              Text(formattedDate, style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
                              if (t.pointsDelta != 0) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    t.pointsDelta > 0 ? '+${t.pointsDelta} نقطة' : '${t.pointsDelta} نقطة',
                                    style: const TextStyle(color: Color(0xFFFBBF24), fontSize: 9, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    t.amount > 0
                        ? '+${t.amount.toStringAsFixed(2)} ${wallet.currency}'
                        : (t.amount < 0
                            ? '${t.amount.toStringAsFixed(2)} ${wallet.currency}'
                            : (t.pointsDelta != 0 ? '${t.pointsDelta} نقطة' : '0.00 ${wallet.currency}')),
                    style: TextStyle(
                      color: isCredit ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                  if (t.balanceAfter > 0)
                    Text(
                      'الرصيد: ${t.balanceAfter.toStringAsFixed(2)}',
                      style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
                    ),
                ],
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
