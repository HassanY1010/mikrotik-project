// Utility functions for Hotspot Package Validity Duration in Flutter.
// Supports minutes ('m'), hours ('h'), and days ('d').

final RegExp _validityRegex = RegExp(r'^([1-9]\d*)([mhd])$', caseSensitive: false);

/// Preset common validity choices including minutes, hours, and days
const List<Map<String, String>> validityPresets = [
  {'label': '1 دقيقة', 'value': '1m'},
  {'label': '15 دقيقة', 'value': '15m'},
  {'label': '30 دقيقة', 'value': '30m'},
  {'label': '1 ساعة', 'value': '1h'},
  {'label': '3 ساعات', 'value': '3h'},
  {'label': '1 يوم', 'value': '1d'},
  {'label': '7 أيام', 'value': '7d'},
];

/// Validates whether the given string is a valid positive integer followed by m, h, or d.
bool isValidValidityDuration(String? val) {
  if (val == null || val.trim().isEmpty) return false;
  return _validityRegex.hasMatch(val.trim());
}

/// Normalizes validity duration string (e.g. ' 15M ' -> '15m').
String normalizeValidityDuration(String? val) {
  if (val == null || val.trim().isEmpty) return '1d';
  final trimmed = val.trim().toLowerCase();
  return _validityRegex.hasMatch(trimmed) ? trimmed : '1d';
}

/// Parses validity string to total minutes.
int parseValidityToMinutes(String? val) {
  if (val == null || val.trim().isEmpty) return 1440; // Default 1d
  final match = _validityRegex.firstMatch(val.trim());
  if (match == null) return 1440;

  final amount = int.tryParse(match.group(1) ?? '1') ?? 1;
  final unit = match.group(2)?.toLowerCase() ?? 'd';

  switch (unit) {
    case 'm':
      return amount;
    case 'h':
      return amount * 60;
    case 'd':
      return amount * 1440;
    default:
      return amount * 1440;
  }
}

/// Formats a validity duration string into human-friendly Arabic text.
/// e.g.:
/// '1m' -> '1 دقيقة'
/// '2m' -> 'دقيقتان'
/// '3m' -> '3 دقائق'
/// '15m' -> '15 دقيقة'
/// '1h' -> '1 ساعة'
/// '2h' -> 'ساعتان'
/// '3h' -> '3 ساعات'
/// '1d' -> '1 يوم'
/// '2d' -> 'يومان'
/// '7d' -> '7 أيام'
String formatValidityArabic(String? val) {
  if (val == null || val.trim().isEmpty) return 'دائم';
  final trimmed = val.trim();
  final match = _validityRegex.firstMatch(trimmed);
  if (match == null) return val;

  final amount = int.tryParse(match.group(1) ?? '') ?? 1;
  final unit = match.group(2)?.toLowerCase();

  switch (unit) {
    case 'm':
      if (amount == 1) return 'دقيقة واحدة';
      if (amount == 2) return 'دقيقتان';
      if (amount >= 3 && amount <= 10) return '$amount دقائق';
      return '$amount دقيقة';

    case 'h':
      if (amount == 1) return 'ساعة واحدة';
      if (amount == 2) return 'ساعتان';
      if (amount >= 3 && amount <= 10) return '$amount ساعات';
      return '$amount ساعة';

    case 'd':
      if (amount == 1) return 'يوم واحد';
      if (amount == 2) return 'يومان';
      if (amount >= 3 && amount <= 10) return '$amount أيام';
      if (amount == 30) return 'شهر واحد (30 يوم)';
      return '$amount يوم';

    default:
      return val;
  }
}

/// Parsed components of a validity duration.
class ParsedValidity {
  final int amount;
  final String unit; // 'm', 'h', 'd'

  const ParsedValidity({required this.amount, required this.unit});

  String get code => '$amount$unit';
  String get upperCode => '$amount${unit.toUpperCase()}';
}

/// Parses a validity string into its constituent numeric amount and unit.
/// Gracefully falls back to defaultAmount and defaultUnit if input is invalid or missing.
/// Handles legacy 'w' (week) values by converting to days (1w -> 7d).
ParsedValidity parseValidityParts(String? val, {int defaultAmount = 1, String defaultUnit = 'd'}) {
  if (val == null || val.trim().isEmpty) {
    return ParsedValidity(amount: defaultAmount, unit: defaultUnit);
  }
  final trimmed = val.trim().toLowerCase();

  // Legacy week support: e.g. '1w' -> 7d, '2w' -> 14d
  final weekMatch = RegExp(r'^([1-9]\d*)w$').firstMatch(trimmed);
  if (weekMatch != null) {
    final weeks = int.tryParse(weekMatch.group(1) ?? '1') ?? 1;
    return ParsedValidity(amount: weeks * 7, unit: 'd');
  }

  final match = _validityRegex.firstMatch(trimmed);
  if (match == null) {
    return ParsedValidity(amount: defaultAmount, unit: defaultUnit);
  }

  final amount = int.tryParse(match.group(1) ?? '') ?? defaultAmount;
  final unit = match.group(2)?.toLowerCase() ?? defaultUnit;
  if (unit != 'm' && unit != 'h' && unit != 'd') {
    return ParsedValidity(amount: defaultAmount, unit: defaultUnit);
  }

  return ParsedValidity(amount: amount, unit: unit);
}

