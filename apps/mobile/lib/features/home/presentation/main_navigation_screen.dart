import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';
import '../../dashboard/presentation/dashboard_screen.dart';
import '../../inventory/presentation/cards_store_screen.dart';
import '../../studio/presentation/card_studio_screen.dart';
import '../../radar/presentation/radar_screen.dart';
import '../../finance/presentation/finance_reports_screen.dart';
import '../../pos/presentation/pos_screen.dart';
import '../../cards/presentation/cards_wallet_screen.dart';
import '../../sync/presentation/sync_screen.dart';
import '../../shift/presentation/shift_summary_screen.dart';
import '../../router_setup/presentation/router_setup_screen.dart';
import '../../wallet/presentation/profile_wallet_screen.dart';
import '../../profile/presentation/user_profile_screen.dart';
import '../../profile/presentation/tenant_users_screen.dart';
import '../../studio/presentation/card_templates_screen.dart';
import '../../hotspot_profiles/presentation/hotspot_profiles_screen.dart';

class MainNavigationScreen extends ConsumerStatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  ConsumerState<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends ConsumerState<MainNavigationScreen> {
  int _currentIndex = 0;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  void _navigateToTab(int index) {
    setState(() => _currentIndex = index);
  }

  void _pushScreen(Widget screen) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => screen),
    );
  }

  void _handleLogout() async {
    HapticFeedback.mediumImpact();
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 16,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: Color(0xFF334155), width: 1.5),
        ),
        titlePadding: const EdgeInsets.fromLTRB(20, 22, 20, 10),
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        actionsPadding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                shape: BoxShape.circle,
                border: Border.all(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.3),
                  width: 1,
                ),
              ),
              child: const Icon(
                Icons.logout_rounded,
                color: Color(0xFFF87171),
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'تسجيل الخروج',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
            ),
          ],
        ),
        content: const Text(
          'هل أنت متأكد من رغبتك في تسجيل الخروج؟ سيتم حفظ كافة العمليات المحلية غير المتزامنة بأمان على هذا الجهاز.',
          style: TextStyle(
            color: Color(0xFF94A3B8),
            fontSize: 13,
            height: 1.5,
          ),
        ),
        actions: [
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Color(0xFF475569)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text(
                    'إلغاء',
                    style: TextStyle(
                      color: Color(0xFFCBD5E1),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () => Navigator.pop(ctx, true),
                  icon: const Icon(Icons.logout_rounded, size: 18, color: Colors.white),
                  label: const Text(
                    'تأكيد الخروج',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFDC2626),
                    elevation: 2,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ],
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

    final List<Widget> screens = [
      DashboardScreen(
        onNavigateTab: _navigateToTab,
        onOpenDrawer: () => _scaffoldKey.currentState?.openDrawer(),
        onLogout: _handleLogout,
        onOpenPos: () => _pushScreen(const PosScreen()),
        onOpenOfflineWallet: () => _pushScreen(const CardsWalletScreen()),
        onOpenSync: () => _pushScreen(const SyncScreen()),
        onOpenShift: () => _pushScreen(const ShiftSummaryScreen()),
        onOpenRouterSetup: () => _pushScreen(const RouterSetupScreen()),
        onOpenCloudWallet: () => _pushScreen(const ProfileWalletScreen()),
        onOpenTemplates: () => _pushScreen(const CardTemplatesScreen()),
        onOpenProfiles: () => _pushScreen(const HotspotProfilesScreen()),
        onOpenUserProfile: () => _pushScreen(const UserProfileScreen()),
        onOpenTenantUsers: () => _pushScreen(const TenantUsersScreen()),
      ),
      const CardsStoreScreen(),
      CardStudioScreen(
        onBatchCreated: () => _navigateToTab(1), // jump to inventory after batch creation
      ),
      const RadarScreen(),
      const FinanceReportsScreen(),
    ];

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: const Color(0xFF0F172A),
      drawer: Drawer(
        backgroundColor: const Color(0xFF1E293B),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            InkWell(
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const UserProfileScreen());
              },
              child: UserAccountsDrawerHeader(
                accountName: Text(
                  user?.fullName ?? 'مدير المنظومة',
                  style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                ),
                accountEmail: Text(
                  user?.email ?? 'admin@sudafi.net',
                  style: const TextStyle(color: Color(0xFF94A3B8)),
                ),
                currentAccountPicture: const CircleAvatar(
                  backgroundColor: Color(0xFF2563EB),
                  child: Icon(Icons.person, color: Colors.white, size: 36),
                ),
                decoration: const BoxDecoration(
                  color: Color(0xFF0F172A),
                  border: Border(bottom: BorderSide(color: Color(0xFF334155))),
                ),
                otherAccountsPictures: [
                  IconButton(
                    icon: const Icon(Icons.settings, color: Color(0xFF94A3B8), size: 20),
                    tooltip: 'حسابي',
                    onPressed: () {
                      Navigator.pop(context);
                      _pushScreen(const UserProfileScreen());
                    },
                  ),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(Icons.dashboard_outlined, color: Color(0xFF38BDF8)),
              title: const Text('لوحة التحكم الرئيسية', style: TextStyle(color: Colors.white)),
              selected: _currentIndex == 0,
              onTap: () {
                _navigateToTab(0);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.inventory_2_outlined, color: Color(0xFF60A5FA)),
              title: const Text('مخزن الكروت', style: TextStyle(color: Colors.white)),
              selected: _currentIndex == 1,
              onTap: () {
                _navigateToTab(1);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.auto_awesome_outlined, color: Color(0xFFA78BFA)),
              title: const Text('استوديو الكروت والتوليد', style: TextStyle(color: Colors.white)),
              selected: _currentIndex == 2,
              onTap: () {
                _navigateToTab(2);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.radar_outlined, color: Color(0xFF22D3EE)),
              title: const Text('رادار المستخدمين المتصلين', style: TextStyle(color: Colors.white)),
              selected: _currentIndex == 3,
              onTap: () {
                _navigateToTab(3);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.bar_chart_outlined, color: Color(0xFFFBBF24)),
              title: const Text('التقارير المالية والأرباح', style: TextStyle(color: Colors.white)),
              selected: _currentIndex == 4,
              onTap: () {
                _navigateToTab(4);
                Navigator.pop(context);
              },
            ),
            const Divider(color: Color(0xFF334155)),
            // POS & Offline tools
            ListTile(
              leading: const Icon(Icons.point_of_sale, color: Color(0xFF10B981)),
              title: const Text('نقطة البيع (POS)', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const PosScreen());
              },
            ),
            ListTile(
              leading: const Icon(Icons.wallet, color: Color(0xFF14B8A6)),
              title: const Text('محفظة الكروت غير المتصلة', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const CardsWalletScreen());
              },
            ),
            ListTile(
              leading: const Icon(Icons.cloud_done, color: Color(0xFFEC4899)),
              title: const Text('محفظة السحاب والولاء', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const ProfileWalletScreen());
              },
            ),
            ListTile(
              leading: const Icon(Icons.sync, color: Color(0xFFF97316)),
              title: const Text('مركز المزامنة', style: TextStyle(color: Colors.white)),
              trailing: pendingCount > 0
                  ? Badge(label: Text('$pendingCount'))
                  : null,
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const SyncScreen());
              },
            ),
            ListTile(
              leading: const Icon(Icons.receipt_long, color: Color(0xFF0EA5E9)),
              title: const Text('تقرير الوردية', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const ShiftSummaryScreen());
              },
            ),
            ListTile(
              leading: const Icon(Icons.settings_input_antenna, color: Color(0xFF6366F1)),
              title: const Text('إعداد وربط الراوتر', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const RouterSetupScreen());
              },
            ),
            const Divider(color: Color(0xFF334155)),
            ListTile(
              leading: const Icon(Icons.palette_outlined, color: Color(0xFFA855F7)),
              title: const Text('قوالب الطباعة وتصميم الكروت', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const CardTemplatesScreen());
              },
            ),
            ListTile(
              leading: const Icon(Icons.speed, color: Color(0xFFF59E0B)),
              title: const Text('باقات وسرعات الهوتسبوت', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const HotspotProfilesScreen());
              },
            ),
            if (user?.role == 'SUPER_ADMIN' || user?.role == 'TENANT_ADMIN')
              ListTile(
                leading: const Icon(Icons.manage_accounts_outlined, color: Color(0xFF10B981)),
                title: const Text('إدارة مستخدمي المنظومة', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(context);
                  _pushScreen(const TenantUsersScreen());
                },
              ),
            ListTile(
              leading: const Icon(Icons.person_pin_outlined, color: Color(0xFF38BDF8)),
              title: const Text('حسابي وإعدادات الأمان', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _pushScreen(const UserProfileScreen());
              },
            ),
            const Divider(color: Color(0xFF334155)),
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () {
                    Navigator.pop(context); // close drawer first smoothly
                    _handleLogout();
                  },
                  borderRadius: BorderRadius.circular(16),
                  splashColor: const Color(0xFFEF4444).withValues(alpha: 0.2),
                  highlightColor: const Color(0xFFEF4444).withValues(alpha: 0.1),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: const Color(0xFFEF4444).withValues(alpha: 0.35),
                        width: 1.2,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEF4444).withValues(alpha: 0.18),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.logout_rounded,
                            color: Color(0xFFF87171),
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: const [
                              Text(
                                'تسجيل الخروج',
                                style: TextStyle(
                                  color: Color(0xFFF87171),
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                              SizedBox(height: 2),
                              Text(
                                'إنهاء الجلسة بأمان',
                                style: TextStyle(
                                  color: Color(0xFF94A3B8),
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.arrow_forward_ios_rounded,
                          color: Color(0xFFF87171),
                          size: 13,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: screens,
      ),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: const Color(0xFF1E293B),
          indicatorColor: const Color(0xFF2563EB).withValues(alpha: 0.3),
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const TextStyle(
                color: Color(0xFF38BDF8),
                fontWeight: FontWeight.bold,
                fontSize: 11,
              );
            }
            return const TextStyle(color: Color(0xFF94A3B8), fontSize: 11);
          }),
          iconTheme: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const IconThemeData(color: Color(0xFF38BDF8), size: 24);
            }
            return const IconThemeData(color: Color(0xFF94A3B8), size: 22);
          }),
        ),
        child: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: _navigateToTab,
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.dashboard_outlined),
              selectedIcon: Icon(Icons.dashboard),
              label: 'الرئيسية',
            ),
            NavigationDestination(
              icon: Icon(Icons.inventory_2_outlined),
              selectedIcon: Icon(Icons.inventory_2),
              label: 'المخزن',
            ),
            NavigationDestination(
              icon: Icon(Icons.auto_awesome_outlined),
              selectedIcon: Icon(Icons.auto_awesome),
              label: 'الاستوديو',
            ),
            NavigationDestination(
              icon: Icon(Icons.radar_outlined),
              selectedIcon: Icon(Icons.radar),
              label: 'الرادار',
            ),
            NavigationDestination(
              icon: Icon(Icons.bar_chart_outlined),
              selectedIcon: Icon(Icons.bar_chart),
              label: 'المالية',
            ),
          ],
        ),
      ),
    );
  }
}
