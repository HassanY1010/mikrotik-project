import 'package:flutter/material.dart';

class AppTheme {
  // Brand colors - SudaFi Official Identity
  static const Color primary = Color(0xFF114C54); // Dark Petrol (البترولي الداكن)
  static const Color primaryDark = Color(0xFF0C383E);
  static const Color primaryLight = Color(0xFF1B6A75);
  static const Color accent = Color(0xFFCEAE85); // Sandy Gold (الذهبي الرملي)
  static const Color accentLight = Color(0xFFE2CBB0);
  static const Color backgroundDark = Color(0xFF0F172A); // Slate 900
  static const Color surfaceDark = Color(0xFF1E293B); // Slate 800
  static const Color cardDark = Color(0xFF334155); // Slate 700
  static const Color textDark = Color(0xFFF8FAFC);
  static const Color textMutedDark = Color(0xFF94A3B8);

  // Light Palette Tokens
  static const Color backgroundLight = Color(0xFFFDF8F2); // SudaFi Creamy (الكريمي)
  static const Color surfaceLight = Colors.white;
  static const Color cardLight = Colors.white;
  static const Color cardAltLight = Color(0xFFF7F0E6); // Soft warm creamy tint
  static const Color textLight = Color(0xFF24343A); // Charcoal Petrol (الفحمي المائل للبترولي)
  static const Color textMutedLight = Color(0xFF5D7179); // Muted petrol gray
  static const Color borderLight = Color(0xFFE8DFD3); // Warm subtle border

  static ThemeData darkTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: const ColorScheme.dark(
      primary: primaryLight,
      secondary: accent,
      surface: surfaceDark,
      error: Color(0xFFEF4444),
      onPrimary: Colors.white,
      onSurface: textDark,
    ),
    scaffoldBackgroundColor: backgroundDark,
    cardTheme: CardThemeData(
      color: surfaceDark,
      elevation: 2,
      shadowColor: Colors.black.withValues(alpha: 0.3),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: surfaceDark,
      elevation: 16,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(20)),
        side: BorderSide(color: Color(0xFF334155)),
      ),
      titleTextStyle: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: textDark,
      ),
      contentTextStyle: TextStyle(
        fontSize: 14,
        color: textMutedDark,
        height: 1.5,
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: surfaceDark,
      modalBackgroundColor: surfaceDark,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: Color(0xFF334155),
      thickness: 1,
      space: 1,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: surfaceDark,
      foregroundColor: textDark,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: textDark,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
      ),
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: accent, // Sandy gold cursor on dark
      selectionColor: Color(0x66114C54),
      selectionHandleColor: accent,
    ),
    textTheme: const TextTheme(
      bodyLarge: TextStyle(color: textDark),
      bodyMedium: TextStyle(color: textDark),
      bodySmall: TextStyle(color: textMutedDark),
      titleLarge: TextStyle(color: textDark, fontWeight: FontWeight.bold),
      titleMedium: TextStyle(color: textDark, fontWeight: FontWeight.w600),
      titleSmall: TextStyle(color: textDark),
      labelLarge: TextStyle(color: textDark),
      labelMedium: TextStyle(color: textMutedDark),
      labelSmall: TextStyle(color: textMutedDark),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFF1E293B),
      prefixIconColor: textMutedDark,
      suffixIconColor: textMutedDark,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF475569)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF334155)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: primaryLight, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFEF4444)),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFEF4444), width: 2),
      ),
      labelStyle: const TextStyle(color: textMutedDark),
      floatingLabelStyle: const TextStyle(color: accent, fontWeight: FontWeight.bold),
      hintStyle: const TextStyle(color: Color(0xFF64748B)),
      errorStyle: const TextStyle(color: Color(0xFFEF4444)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surfaceDark,
      indicatorColor: primary.withValues(alpha: 0.35),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const TextStyle(
            color: accent,
            fontWeight: FontWeight.bold,
            fontSize: 11,
          );
        }
        return const TextStyle(color: Color(0xFF94A3B8), fontSize: 11);
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: accent, size: 24);
        }
        return const IconThemeData(color: Color(0xFF94A3B8), size: 22);
      }),
    ),
    popupMenuTheme: const PopupMenuThemeData(
      color: surfaceDark,
      surfaceTintColor: Colors.transparent,
      elevation: 6,
      textStyle: TextStyle(color: textDark, fontSize: 13),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        side: BorderSide(color: Color(0xFF334155)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: surfaceDark,
      disabledColor: const Color(0xFF334155),
      selectedColor: primaryLight.withValues(alpha: 0.3),
      secondarySelectedColor: primaryLight,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      labelStyle: const TextStyle(color: textDark, fontSize: 12),
      secondaryLabelStyle: const TextStyle(color: accent, fontWeight: FontWeight.bold, fontSize: 12),
      brightness: Brightness.dark,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: Color(0xFF334155)),
      ),
    ),
  );

  static ThemeData lightTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: const ColorScheme.light(
      primary: primary,
      secondary: accent,
      surface: surfaceLight,
      error: Color(0xFFDC2626),
      onPrimary: Colors.white,
      onSurface: textLight,
    ),
    scaffoldBackgroundColor: backgroundLight,
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: primary, // Dark Petrol - crystal clear on creamy/white
      selectionColor: Color(0x4D114C54), // 30% Dark Petrol
      selectionHandleColor: primary,
    ),
    textTheme: const TextTheme(
      bodyLarge: TextStyle(color: textLight),
      bodyMedium: TextStyle(color: textLight),
      bodySmall: TextStyle(color: textMutedLight),
      titleLarge: TextStyle(color: textLight, fontWeight: FontWeight.bold),
      titleMedium: TextStyle(color: textLight, fontWeight: FontWeight.w600),
      titleSmall: TextStyle(color: textLight),
      labelLarge: TextStyle(color: textLight),
      labelMedium: TextStyle(color: textMutedLight),
      labelSmall: TextStyle(color: textMutedLight),
    ),
    cardTheme: CardThemeData(
      color: surfaceLight,
      elevation: 1,
      shadowColor: primary.withValues(alpha: 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: borderLight, width: 1),
      ),
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: surfaceLight,
      elevation: 12,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(20)),
        side: BorderSide(color: borderLight),
      ),
      titleTextStyle: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: textLight,
      ),
      contentTextStyle: TextStyle(
        fontSize: 14,
        color: textMutedLight,
        height: 1.5,
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: surfaceLight,
      modalBackgroundColor: surfaceLight,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: borderLight,
      thickness: 1,
      space: 1,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: surfaceLight,
      foregroundColor: textLight,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: textLight,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: cardAltLight,
      prefixIconColor: textMutedLight,
      suffixIconColor: textMutedLight,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFD6CABE)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: borderLight),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFDC2626)),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFDC2626), width: 2),
      ),
      labelStyle: const TextStyle(color: textMutedLight),
      floatingLabelStyle: const TextStyle(color: primary, fontWeight: FontWeight.bold),
      hintStyle: const TextStyle(color: Color(0xFF8C9FA7)),
      errorStyle: const TextStyle(color: Color(0xFFDC2626)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surfaceLight,
      indicatorColor: primary.withValues(alpha: 0.15),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const TextStyle(
            color: primary,
            fontWeight: FontWeight.bold,
            fontSize: 11,
          );
        }
        return const TextStyle(color: textMutedLight, fontSize: 11);
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: primary, size: 24);
        }
        return const IconThemeData(color: textMutedLight, size: 22);
      }),
    ),
    popupMenuTheme: const PopupMenuThemeData(
      color: surfaceLight,
      surfaceTintColor: Colors.transparent,
      elevation: 6,
      textStyle: TextStyle(color: textLight, fontSize: 13),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        side: BorderSide(color: borderLight),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: cardAltLight,
      disabledColor: const Color(0xFFE2E8F0),
      selectedColor: primary.withValues(alpha: 0.15),
      secondarySelectedColor: primary,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      labelStyle: const TextStyle(color: textLight, fontSize: 12),
      secondaryLabelStyle: const TextStyle(color: primary, fontWeight: FontWeight.bold, fontSize: 12),
      brightness: Brightness.light,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: borderLight),
      ),
    ),
  );
}

// Convenient BuildContext Extension for easy reactive theme access
extension AppThemeContextExtension on BuildContext {
  bool get isDarkMode => Theme.of(this).brightness == Brightness.dark;

  Color get bgScaffold => isDarkMode ? AppTheme.backgroundDark : AppTheme.backgroundLight;
  Color get bgCard => isDarkMode ? AppTheme.surfaceDark : AppTheme.surfaceLight;
  Color get bgCardAlt => isDarkMode ? AppTheme.cardDark : AppTheme.cardAltLight;

  Color get textPrimary => isDarkMode ? AppTheme.textDark : AppTheme.textLight;
  Color get textSecondary => isDarkMode ? AppTheme.textMutedDark : AppTheme.textMutedLight;
  Color get textMuted => isDarkMode ? const Color(0xFF64748B) : const Color(0xFF546E7A);

  Color get borderColor => isDarkMode ? const Color(0xFF334155) : AppTheme.borderLight;
  Color get borderLightColor => isDarkMode ? const Color(0x33334155) : const Color(0x40E2E8F0);

  Color get primaryColor => AppTheme.primary;
  Color get accentColor => AppTheme.accent;

  // High-contrast contextual colors (WCAG AA compliant across Light & Dark modes)
  Color get skyColor => isDarkMode ? const Color(0xFF38BDF8) : const Color(0xFF0369A1);
  Color get emeraldColor => isDarkMode ? const Color(0xFF34D399) : const Color(0xFF047857);
  Color get amberColor => isDarkMode ? const Color(0xFFFBBF24) : const Color(0xFFB45309);
  Color get roseColor => isDarkMode ? const Color(0xFFF87171) : const Color(0xFFDC2626);
  Color get purpleColor => isDarkMode ? const Color(0xFFA78BFA) : const Color(0xFF6D28D9);
}
