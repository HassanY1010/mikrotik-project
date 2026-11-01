import 'dart:io';

class ThemeTokens {
  // Reference Light Mode Brand Palette
  static const String primaryHex = '#136D6F';
  static const String goldHex = '#C9A46A';
  static const String backgroundLightHex = '#F8F6F0';
  static const String surfaceLightHex = '#FFFFFF';
  static const String cardAltLightHex = '#F3EFE7';
  static const String borderLightHex = '#E2DDD3';
  static const String textPrimaryLightHex = '#1A2A2B';
  static const String textSecondaryLightHex = '#5E6F6F';

  // Reference Dark Mode Brand Palette
  static const String primaryDarkHex = '#178587';
  static const String goldDarkHex = '#DFBE86';
  static const String backgroundDarkHex = '#0B1118';
  static const String surfaceDarkHex = '#121B24';
  static const String cardAltDarkHex = '#1A2633';
  static const String borderDarkHex = '#273646';
  static const String textPrimaryDarkHex = '#F3F4F6';
  static const String textSecondaryDarkHex = '#94A3B8';

  // Semantic Status Colors (Whitelisted)
  static const List<String> semanticSuccessHex = ['#10B981', '#059669', '#34D399', '#047857'];
  static const List<String> semanticErrorHex = ['#EF4444', '#DC2626', '#F87171', '#B91C1C'];
  static const List<String> semanticWarningHex = ['#F59E0B', '#D97706', '#FBBF24', '#B45309'];
  static const List<String> semanticInfoHex = ['#0369A1', '#0284C7', '#38BDF8'];

  /// Validates that lib/core/theme/app_theme.dart defines the matching primary tokens.
  static bool verifyAppThemeSource(File appThemeFile) {
    if (!appThemeFile.existsSync()) return false;
    final content = appThemeFile.readAsStringSync();
    final hasPrimary = content.contains('0xFF136D6F');
    final hasAccent = content.contains('0xFFC9A46A');
    final hasBgLight = content.contains('0xFFF8F6F0');
    return hasPrimary && hasAccent && hasBgLight;
  }
}

