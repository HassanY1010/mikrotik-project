import 'dart:io';

class ColorOccurrence {
  final String filePath;
  final int lineNumber;
  final String rawMatch;
  final String lineText;
  final String category; // 'VIOLATION', 'SEMANTIC_EXEMPT', 'PRESET_EXEMPT', 'DARK_MODE_EXEMPT', 'COMPLIANT'
  final String? suggestedReplacement;

  ColorOccurrence({
    required this.filePath,
    required this.lineNumber,
    required this.rawMatch,
    required this.lineText,
    required this.category,
    this.suggestedReplacement,
  });

  Map<String, dynamic> toJson() => {
    'file': filePath,
    'line': lineNumber,
    'match': rawMatch,
    'category': category,
    'suggested': suggestedReplacement,
  };
}

class ColorUsageAnalyzer {
  static final RegExp _hexColorRegex = RegExp(r'(const\s+)?Color\((0x[0-9a-fA-F]{8})\)');
  static final RegExp _materialColorsRegex = RegExp(r'\bColors\.(blue(?!Grey)|lightBlue|cyan|teal|purple|deepPurple|indigo)\b(\.shade[0-9]+)?');

  // Semantic Status Color Hexes that are preserved
  static const Set<String> _semanticSuccess = {'0xff10b981', '0xff059669', '0xff34d399', '0xff047857'};
  static const Set<String> _semanticError = {'0xffef4444', '0xffdc2626', '0xfff87171', '0xffb91c1c'};
  static const Set<String> _semanticWarning = {'0xfff59e0b', '0xffd97706', '0xfffbbf24', '0xffb45309'};

  // Known legacy non-compliant colors in light mode
  static const Set<String> _legacyBrandViolations = {
    '0xff38bdf8', // Cyan / Sky Blue
    '0xff0284c7', // Legacy light blue
    '0xff2563eb', // Legacy royal blue
    '0xff0d9488', // Legacy teal
    '0xff8b5cf6', // Legacy purple
    '0xffa78bfa', // Legacy light purple
    '0xff1e3a8a', // Dark blue
    '0xff0369a1', // Sky blue
  };

  static List<ColorOccurrence> analyzeFile(File file) {
    final results = <ColorOccurrence>[];
    final relativePath = file.path.replaceAll('\\', '/');

    // Completely exempt non-UI files (PDF print engine, tools, tests)
    if (relativePath.contains('card_pdf_generator_service.dart') ||
        relativePath.contains('thermal_printer_service.dart') ||
        relativePath.contains('/tool/') ||
        relativePath.contains('/test/')) {
      return results;
    }

    final isModels = relativePath.contains('models.dart');
    final isAppTheme = relativePath.contains('app_theme.dart');

    final lines = file.readAsLinesSync();

    for (var i = 0; i < lines.length; i++) {
      final lineNum = i + 1;
      final line = lines[i];
      final trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      // Skip PdfColor or PDF canvas drawing
      if (line.contains('PdfColor') || line.contains('pw.PdfColor')) {
        continue;
      }

      // Check Hex Colors
      final matches = _hexColorRegex.allMatches(line);
      for (final match in matches) {
        final fullMatch = match.group(0)!; // e.g. "const Color(0xFF38BDF8)" or "Color(0xFF38BDF8)"
        final hex = match.group(2)!.toLowerCase();

        // 1. AppTheme definition is the source of truth
        if (isAppTheme) {
          results.add(ColorOccurrence(
            filePath: relativePath,
            lineNumber: lineNum,
            rawMatch: fullMatch,
            lineText: line,
            category: 'COMPLIANT',
          ));
          continue;
        }

        // 2. Semantic statuses (Success, Error, Warning)
        if (_semanticSuccess.contains(hex) || _semanticError.contains(hex) || _semanticWarning.contains(hex)) {
          results.add(ColorOccurrence(
            filePath: relativePath,
            lineNumber: lineNum,
            rawMatch: fullMatch,
            lineText: line,
            category: 'SEMANTIC_EXEMPT',
          ));
          continue;
        }

        // 3. Status card used badge in models.dart
        if (isModels && line.contains('isUsed')) {
          results.add(ColorOccurrence(
            filePath: relativePath,
            lineNumber: lineNum,
            rawMatch: fullMatch,
            lineText: line,
            category: 'SEMANTIC_EXEMPT',
          ));
          continue;
        }

        // 4. Template & Portal Presets
        if (line.contains('_ThemeConfig') ||
            line.contains('themePreset') ||
            line.contains('FOOTBALL') ||
            line.contains('EID_MUBARAK') ||
            line.contains('TURQUOISE') ||
            line.contains('TICKET') ||
            line.contains('COMPACT') ||
            line.contains('_portalPresets')) {
          results.add(ColorOccurrence(
            filePath: relativePath,
            lineNumber: lineNum,
            rawMatch: fullMatch,
            lineText: line,
            category: 'PRESET_EXEMPT',
          ));
          continue;
        }

        // 5. Dark mode conditioned branch
        if (line.contains('isDarkMode ?') ||
            line.contains('isDarkMode?') ||
            line.contains('ThemeMode.dark')) {
          results.add(ColorOccurrence(
            filePath: relativePath,
            lineNumber: lineNum,
            rawMatch: fullMatch,
            lineText: line,
            category: 'DARK_MODE_EXEMPT',
          ));
          continue;
        }

        // 6. Check for Legacy Violations
        if (_legacyBrandViolations.contains(hex)) {
          results.add(ColorOccurrence(
            filePath: relativePath,
            lineNumber: lineNum,
            rawMatch: fullMatch,
            lineText: line,
            category: 'VIOLATION',
            suggestedReplacement: 'AppTheme.primary',
          ));
        } else {
          results.add(ColorOccurrence(
            filePath: relativePath,
            lineNumber: lineNum,
            rawMatch: fullMatch,
            lineText: line,
            category: 'SEMANTIC_EXEMPT',
          ));
        }
      }

      // Check Material Colors (Colors.blue, etc.)
      final matMatches = _materialColorsRegex.allMatches(line);
      for (final match in matMatches) {
        final fullMatch = match.group(0)!;
        if (line.contains('isDarkMode ?') || line.contains('ThemeMode.dark')) {
          results.add(ColorOccurrence(
            filePath: relativePath,
            lineNumber: lineNum,
            rawMatch: fullMatch,
            lineText: line,
            category: 'DARK_MODE_EXEMPT',
          ));
        } else {
          results.add(ColorOccurrence(
            filePath: relativePath,
            lineNumber: lineNum,
            rawMatch: fullMatch,
            lineText: line,
            category: 'VIOLATION',
            suggestedReplacement: 'AppTheme.primary',
          ));
        }
      }
    }

    return results;
  }
}
