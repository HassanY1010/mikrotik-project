import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';
import '../../pos/presentation/pos_screen.dart';
import '../../cards/presentation/cards_wallet_screen.dart';
import '../../sync/presentation/sync_screen.dart';
import '../../shift/presentation/shift_summary_screen.dart';

class MainNavigationScreen extends ConsumerStatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  ConsumerState<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends ConsumerState<MainNavigationScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    PosScreen(),
    CardsWalletScreen(),
    SyncScreen(),
    ShiftSummaryScreen(),
  ];

  void _handleLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تسجيل الخروج'),
        content: const Text('هل أنت متأكد من رغبتك في تسجيل الخروج من نقطة البيع؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('خروج'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(localStorageProvider).clearAuth();
      ref.read(currentUserProvider.notifier).setUser(null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mutations = ref.watch(pendingMutationsProvider);
    final pendingCount = mutations.where((m) => m.status == 'PENDING').length;
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            UserAccountsDrawerHeader(
              accountName: Text(user?.fullName ?? 'كاشير المحطة', style: const TextStyle(fontWeight: FontWeight.bold)),
              accountEmail: Text(user?.email ?? 'cashier@system.local'),
              currentAccountPicture: const CircleAvatar(
                backgroundColor: Colors.white,
                child: Icon(Icons.person, color: Color(0xFF0D9488), size: 36),
              ),
              decoration: const BoxDecoration(color: Color(0xFF0F766E)),
            ),
            ListTile(
              leading: const Icon(Icons.point_of_sale),
              title: const Text('نقطة البيع'),
              selected: _currentIndex == 0,
              onTap: () {
                setState(() => _currentIndex = 0);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.wallet),
              title: const Text('محفظة الكروت غير المتصلة'),
              selected: _currentIndex == 1,
              onTap: () {
                setState(() => _currentIndex = 1);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.sync),
              title: const Text('مركز المزامنة'),
              trailing: pendingCount > 0
                  ? Badge(label: Text('$pendingCount'))
                  : null,
              selected: _currentIndex == 2,
              onTap: () {
                setState(() => _currentIndex = 2);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.analytics_outlined),
              title: const Text('تقرير الوردية'),
              selected: _currentIndex == 3,
              onTap: () {
                setState(() => _currentIndex = 3);
                Navigator.pop(context);
              },
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout, color: Colors.redAccent),
              title: const Text('تسجيل الخروج', style: TextStyle(color: Colors.redAccent)),
              onTap: _handleLogout,
            ),
          ],
        ),
      ),
      body: _screens[_currentIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (idx) => setState(() => _currentIndex = idx),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.point_of_sale_outlined),
            selectedIcon: Icon(Icons.point_of_sale),
            label: 'نقطة البيع',
          ),
          const NavigationDestination(
            icon: Icon(Icons.wallet_outlined),
            selectedIcon: Icon(Icons.wallet),
            label: 'المحفظة',
          ),
          NavigationDestination(
            icon: pendingCount > 0
                ? Badge(label: Text('$pendingCount'), child: const Icon(Icons.sync))
                : const Icon(Icons.sync),
            selectedIcon: pendingCount > 0
                ? Badge(label: Text('$pendingCount'), child: const Icon(Icons.sync))
                : const Icon(Icons.sync),
            label: 'المزامنة',
          ),
          const NavigationDestination(
            icon: Icon(Icons.analytics_outlined),
            selectedIcon: Icon(Icons.analytics),
            label: 'الوردية',
          ),
        ],
      ),
    );
  }
}
