import 'dart:math';

class ContrastResult {
  final String foregroundHex;
  final String backgroundHex;
  final double ratio;
  final bool passesNormalTextAA; // >= 4.5
  final bool passesLargeTextAA;  // >= 3.0
  final bool passesAAA;          // >= 7.0
  final String description;

  ContrastResult({
    required this.foregroundHex,
    required this.backgroundHex,
    required this.ratio,
    required this.passesNormalTextAA,
    required this.passesLargeTextAA,
    required this.passesAAA,
    required this.description,
  });

  Map<String, dynamic> toJson() => {
    'foreground': foregroundHex,
    'background': backgroundHex,
    'ratio': double.parse(ratio.toStringAsFixed(2)),
    'passesNormalAA': passesNormalTextAA,
    'passesLargeAA': passesLargeTextAA,
    'passesAAA': passesAAA,
    'description': description,
  };
}

class ContrastValidator {
  static double _channelToLuminance(int channel) {
    final v = channel / 255.0;
    if (v <= 0.04045) {
      return v / 12.92;
    } else {
      return pow((v + 0.055) / 1.055, 2.4).toDouble();
    }
  }

  static double getRelativeLuminance(int r, int g, int b) {
    final rLum = _channelToLuminance(r);
    final gLum = _channelToLuminance(g);
    final bLum = _channelToLuminance(b);
    return 0.2126 * rLum + 0.7152 * gLum + 0.0722 * bLum;
  }

  static (int, int, int) parseHex(String hex) {
    var clean = hex.replaceAll('#', '').replaceAll('0x', '').replaceAll('0X', '');
    if (clean.length == 8) {
      clean = clean.substring(2); // Strip alpha
    }
    if (clean.length != 6) {
      return (0, 0, 0);
    }
    final r = int.parse(clean.substring(0, 2), radix: 16);
    final g = int.parse(clean.substring(2, 4), radix: 16);
    final b = int.parse(clean.substring(4, 6), radix: 16);
    return (r, g, b);
  }

  static double calculateContrastRatio(String fgHex, String bgHex) {
    final (r1, g1, b1) = parseHex(fgHex);
    final (r2, g2, b2) = parseHex(bgHex);
    final l1 = getRelativeLuminance(r1, g1, b1);
    final l2 = getRelativeLuminance(r2, g2, b2);
    final lighter = max(l1, l2);
    final darker = min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  static ContrastResult evaluatePair(String fgHex, String bgHex, String description) {
    final ratio = calculateContrastRatio(fgHex, bgHex);
    return ContrastResult(
      foregroundHex: fgHex,
      backgroundHex: bgHex,
      ratio: ratio,
      passesNormalTextAA: ratio >= 4.5,
      passesLargeTextAA: ratio >= 3.0,
      passesAAA: ratio >= 7.0,
      description: description,
    );
  }

  static List<ContrastResult> runStandardAudits() {
    return [
      // Light Mode Tests
      evaluatePair('#1A2A2B', '#F8F6F0', 'Light Mode: Primary Text on Scaffold Background'),
      evaluatePair('#1A2A2B', '#FFFFFF', 'Light Mode: Primary Text on Card Surface'),
      evaluatePair('#1A2A2B', '#F3EFE7', 'Light Mode: Primary Text on Card Alt Surface'),
      evaluatePair('#5E6F6F', '#F8F6F0', 'Light Mode: Secondary Text on Scaffold Background'),
      evaluatePair('#5E6F6F', '#FFFFFF', 'Light Mode: Secondary Text on Card Surface'),
      evaluatePair('#136D6F', '#FFFFFF', 'Light Mode: Brand Primary on White Card (Accent/Icon)'),
      evaluatePair('#FFFFFF', '#136D6F', 'Light Mode: Button Text (White) on Brand Primary Button'),
      evaluatePair('#C9A46A', '#136D6F', 'Light Mode: Gold Accent on Brand Primary (KPI / Pill)'),

      // Dark Mode Tests
      evaluatePair('#F3F4F6', '#0B1118', 'Dark Mode: Primary Text on Scaffold Background'),
      evaluatePair('#F3F4F6', '#121B24', 'Dark Mode: Primary Text on Card Surface'),
      evaluatePair('#94A3B8', '#121B24', 'Dark Mode: Secondary Text on Card Surface'),
      evaluatePair('#FFFFFF', '#178587', 'Dark Mode: White Text on Brand Primary Button'),
      evaluatePair('#DFBE86', '#121B24', 'Dark Mode: Gold Accent on Card Surface'),
    ];
  }
}

