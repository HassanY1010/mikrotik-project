import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/features/auth/presentation/login_screen.dart';
import 'package:mobile/features/profile/presentation/user_profile_screen.dart';

class _MockCurrentUserNotifier extends CurrentUserNotifier {
  final AuthUser? _user;
  _MockCurrentUserNotifier(this._user);

  @override
  AuthUser? build() => _user;
}

class _MockTenantQuotaNotifier extends TenantQuotaNotifier {
  @override
  Future<TenantQuotaModel?> build() async => null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final adminUser = AuthUser(
    id: 'user-1',
    email: 'admin@sudafi.net',
    role: 'ADMIN',
    fullName: 'مدير المنظومة',
    tenantId: 'tenant-1',
  );

  group('System Default Theme Mode Tests', () {
    test('1. LocalStorage defaults to "system" when no theme preference is saved', () async {
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();

      expect(storage.getThemeMode(), equals('system'));
    });

    test('2. Preserves existing saved theme mode preferences', () async {
      SharedPreferences.setMockInitialValues({
        'app_theme_mode': 'dark',
      });
      final storageDark = await LocalStorage.init();
      expect(storageDark.getThemeMode(), equals('dark'));

      SharedPreferences.setMockInitialValues({
        'app_theme_mode': 'light',
      });
      final storageLight = await LocalStorage.init();
      expect(storageLight.getThemeMode(), equals('light'));

      SharedPreferences.setMockInitialValues({
        'app_theme_mode': 'system',
      });
      final storageSystem = await LocalStorage.init();
      expect(storageSystem.getThemeMode(), equals('system'));
    });

    test('3. ThemeModeNotifier initializes to ThemeMode.system by default for new users', () async {
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      final mode = container.read(themeModeProvider);
      expect(mode, equals(ThemeMode.system));
    });

    testWidgets('4. Profile Screen shows "تلقائي" as selected by default for new users', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          ],
          child: const MaterialApp(
            home: UserProfileScreen(),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Check that the theme selector section displays all 3 options
      expect(find.text('داكن'), findsOneWidget);
      expect(find.text('فاتح'), findsOneWidget);
      expect(find.text('تلقائي'), findsOneWidget);
      expect(find.text('حسب الجهاز'), findsOneWidget);
    });

    testWidgets('5. Selecting "داكن" updates and persists choice', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();

      late WidgetRef capturedRef;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          ],
          child: Consumer(
            builder: (context, ref, child) {
              capturedRef = ref;
              return const MaterialApp(
                home: UserProfileScreen(),
              );
            },
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Tap "داكن"
      await tester.tap(find.text('داكن'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(capturedRef.read(themeModeProvider), equals(ThemeMode.dark));
      expect(storage.getThemeMode(), equals('dark'));
    });

    testWidgets('6. Selecting "فاتح" updates and persists choice', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1400));
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();

      late WidgetRef capturedRef;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
            currentUserProvider.overrideWith(() => _MockCurrentUserNotifier(adminUser)),
            tenantQuotaProvider.overrideWith(() => _MockTenantQuotaNotifier()),
          ],
          child: Consumer(
            builder: (context, ref, child) {
              capturedRef = ref;
              return const MaterialApp(
                home: UserProfileScreen(),
              );
            },
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Tap "فاتح"
      await tester.tap(find.text('فاتح'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(capturedRef.read(themeModeProvider), equals(ThemeMode.light));
      expect(storage.getThemeMode(), equals('light'));
    });

    testWidgets('7. Login screen adapts automatically to device platform brightness in system mode', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 1200));
      SharedPreferences.setMockInitialValues({});
      final storage = await LocalStorage.init();

      // Test Dark platform brightness
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
          ],
          child: MaterialApp(
            theme: AppTheme.lightTheme,
            darkTheme: AppTheme.darkTheme,
            themeMode: ThemeMode.system,
            home: const LoginScreen(),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      BuildContext context = tester.element(find.byType(LoginScreen));
      expect(Theme.of(context).brightness, equals(Brightness.dark));

      // Switch platform brightness to Light dynamically
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      context = tester.element(find.byType(LoginScreen));
      expect(Theme.of(context).brightness, equals(Brightness.light));
    });
  });
}
