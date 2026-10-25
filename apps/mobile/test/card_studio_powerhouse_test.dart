import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/studio/presentation/card_studio_screen.dart';

class _MockCurrentUserNotifier extends CurrentUserNotifier {
  final AuthUser? _user;
  _MockCurrentUserNotifier(this._user);

  @override
  AuthUser? build() => _user;
}

class _MockProfilesNotifier extends CachedProfilesNotifier {
  final List<HotspotProfileModel> initialList;
  _MockProfilesNotifier(this.initialList);

  @override
  List<HotspotProfileModel> build() => initialList;

  @override
  Future<void> fetchProfiles() async {}
}

class _MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _routers;
  _MockRoutersNotifier(this._routers);

  @override
  Future<List<RouterDeviceModel>> build() async => _routers;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Card Studio Powerhouse Tests', () {
    late LocalStorage storage;

    final testProfiles = [
      HotspotProfileModel(
        id: 'p1',
        name: '4hours',
        displayName: 'باقة 4 ساعات',
        price: 500,
        validity: '1d',
        sessionTimeout: '4h',
        rateLimit: '4M/2M',
        deviceId: 'r1',
      ),
    ];

    final testRouters = [
      RouterDeviceModel(
        id: 'r1',
        name: 'MikroTik Main Lab',
        host: '192.168.88.1',
        isOnline: true,
      ),
    ];

    final adminUser = AuthUser(
      id: 'u1',
      email: 'admin@sudafi.net',
      fullName: 'مدير الشبكة',
      role: 'SUPER_ADMIN',
      tenantId: 'tenant-100',
    );

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      storage = await LocalStorage.init();
      await storage.saveCachedProfiles(testProfiles);
      await storage.saveCachedRouters(testRouters);
      await storage.setUser(adminUser);
    });

    testWidgets('1. Displays 4 Tab sections and persistent action button', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(testProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Check all 4 tabs exist
      expect(find.text('1. إعدادات الكروت'), findsOneWidget);
      expect(find.text('2. القيود والصلاحية'), findsOneWidget);
      expect(find.text('3. استوديو التصميم'), findsOneWidget);
      expect(find.text('4. الطباعة والتصدير'), findsOneWidget);

      // Check persistent bottom action
      expect(find.text('معاينة وتوليد الدفعة'), findsOneWidget);
      expect(find.text('50 كرت • 25000 SDG'), findsOneWidget);
    });

    testWidgets('2. Tab 1 allows configuring credential mode and username formatting', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(testProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Check credential modes
      expect(find.text('رمز PIN موحد'), findsOneWidget);
      expect(find.text('اسم + كلمة مرور'), findsOneWidget);
      expect(find.text('مستخدم فقط'), findsOneWidget);

      // Tap 'اسم + كلمة مرور'
      await tester.tap(find.text('اسم + كلمة مرور'));
      await tester.pumpAndSettle();

      // Separate password section should now appear
      expect(find.text('تخصيص كلمة المرور المنفصلة (Password)'), findsOneWidget);

      // Check serial numbers toggle exists
      expect(find.text('توليد أرقام تسلسلية فريدة (Serial Number)'), findsOneWidget);
    });

    testWidgets('3. Tab 2 allows configuring multi-constraint limits (uptime, quota, validity)', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(testProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Switch to Tab 2
      await tester.tap(find.text('2. القيود والصلاحية'));
      await tester.pumpAndSettle();

      // Verify the 3 independent limits are present
      expect(find.text('مدة الاستخدام / الاتصال (Session Uptime)'), findsOneWidget);
      expect(find.text('حد استهلاك البيانات (Data Quota)'), findsOneWidget);
      expect(find.text('مدة صلاحية الحساب (Account Validity)'), findsOneWidget);

      // Toggle Uptime switch
      final switches = find.byType(Switch);
      expect(switches, findsWidgets);
      await tester.tap(switches.first);
      await tester.pumpAndSettle();

      expect(find.text('المدة الرقمية'), findsOneWidget);
    });

    testWidgets('4. Tab 3 allows live design studio customization and image picking', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(testProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Switch to Tab 3
      await tester.tap(find.text('3. استوديو التصميم'));
      await tester.pumpAndSettle();

      // Check Live Preview & phone background button
      expect(find.text('المعاينة الحية للكرت (Live Preview)'), findsOneWidget);
      expect(find.text('اختيار صورة خلفية من الهاتف'), findsOneWidget);
      expect(find.text('اسم الشبكة المطبوع'), findsOneWidget);
      expect(find.text('أبعاد الكرت التناسبية:'), findsOneWidget);
      expect(find.text('حفظ هذا التصميم كقالب مخصص'), findsOneWidget);
    });

    testWidgets('5. Tab 4 displays standard printing layouts', (tester) async {
      await tester.binding.setSurfaceSize(const Size(1000, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(testProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Switch to Tab 4
      await tester.tap(find.text('4. الطباعة والتصدير'));
      await tester.pumpAndSettle();

      expect(find.text('10 كروت في الصفحة (2×5)'), findsOneWidget);
      expect(find.text('12 كرت في الصفحة (3×4)'), findsOneWidget);
      expect(find.text('24 كرت في الصفحة (3×8)'), findsOneWidget);
      expect(find.text('100 كرت في الصفحة (5×20)'), findsOneWidget);
    });

    testWidgets('6. Tapping persistent action opens review confirmation modal', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            profilesProvider.overrideWith(() => _MockProfilesNotifier(testProfiles)),
            routersProvider.overrideWith(() => _MockRoutersNotifier(testRouters)),
          ],
          child: const MaterialApp(
            home: CardStudioScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap 'معاينة وتوليد الدفعة'
      await tester.tap(find.text('معاينة وتوليد الدفعة'));
      await tester.pumpAndSettle();

      // Review modal is shown
      expect(find.text('مراجعة وتأكيد إعدادات الدفعة'), findsOneWidget);
      expect(find.text('الراوتر المستهدف'), findsOneWidget);
      expect(find.text('باقة الهوتسبوت'), findsOneWidget);
      expect(find.text('الكمية الإجمالية'), findsOneWidget);
      expect(find.text('تأكيد وتوليد الدفعة الآن'), findsOneWidget);
    });
  });
}
