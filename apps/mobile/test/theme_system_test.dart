import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/providers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Theme System Unit & Integration Tests', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    test('AppTheme defines correct Brightness and Brand colors for both themes', () {
      expect(AppTheme.darkTheme.brightness, Brightness.dark);
      expect(AppTheme.darkTheme.colorScheme.primary, AppTheme.primary);
      expect(AppTheme.darkTheme.scaffoldBackgroundColor, AppTheme.backgroundDark);

      expect(AppTheme.lightTheme.brightness, Brightness.light);
      expect(AppTheme.lightTheme.colorScheme.primary, AppTheme.primary);
      expect(AppTheme.lightTheme.scaffoldBackgroundColor, AppTheme.backgroundLight);
    });

    test('LocalStorage defaults to dark theme and correctly persists changes', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      // Default should be dark mode for backward compatibility
      expect(storage.getThemeMode(), 'dark');

      // Set to light mode
      await storage.setThemeMode('light');
      expect(storage.getThemeMode(), 'light');

      // Set to system mode
      await storage.setThemeMode('system');
      expect(storage.getThemeMode(), 'system');
    });

    test('ThemeModeNotifier correctly initializes and toggles theme with persistence', () async {
      SharedPreferences.setMockInitialValues({'app_theme_mode': 'dark'});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      final container = ProviderContainer(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      // Initially dark mode
      expect(container.read(themeModeProvider), ThemeMode.dark);

      // Toggle to light mode
      await container.read(themeModeProvider.notifier).toggleTheme();
      expect(container.read(themeModeProvider), ThemeMode.light);
      expect(storage.getThemeMode(), 'light');

      // Toggle back to dark mode
      await container.read(themeModeProvider.notifier).toggleTheme();
      expect(container.read(themeModeProvider), ThemeMode.dark);
      expect(storage.getThemeMode(), 'dark');

      // Explicitly set system mode
      await container.read(themeModeProvider.notifier).setThemeMode(ThemeMode.system);
      expect(container.read(themeModeProvider), ThemeMode.system);
      expect(storage.getThemeMode(), 'system');
    });

    testWidgets('BuildContext theme extension returns correct colors in Dark and Light themes', (tester) async {
      late BuildContext capturedDarkContext;
      late BuildContext capturedLightContext;

      await tester.pumpWidget(
        Theme(
          data: AppTheme.darkTheme,
          child: Builder(builder: (ctx) {
            capturedDarkContext = ctx;
            return const SizedBox();
          }),
        ),
      );

      expect(capturedDarkContext.isDarkMode, true);
      expect(capturedDarkContext.bgScaffold, AppTheme.backgroundDark);
      expect(capturedDarkContext.bgCard, AppTheme.surfaceDark);
      expect(capturedDarkContext.bgCardAlt, AppTheme.cardDark);
      expect(capturedDarkContext.textPrimary, AppTheme.textDark);
      expect(capturedDarkContext.textSecondary, AppTheme.textMutedDark);
      expect(capturedDarkContext.borderColor, const Color(0xFF334155));

      await tester.pumpWidget(
        Theme(
          data: AppTheme.lightTheme,
          child: Builder(builder: (ctx) {
            capturedLightContext = ctx;
            return const SizedBox();
          }),
        ),
      );

      expect(capturedLightContext.isDarkMode, false);
      expect(capturedLightContext.bgScaffold, AppTheme.backgroundLight);
      expect(capturedLightContext.bgCard, AppTheme.surfaceLight);
      expect(capturedLightContext.bgCardAlt, AppTheme.cardAltLight);
      expect(capturedLightContext.textPrimary, AppTheme.textLight);
      expect(capturedLightContext.textSecondary, AppTheme.textMutedLight);
      expect(capturedLightContext.borderColor, AppTheme.borderLight);
    });
  });
}
