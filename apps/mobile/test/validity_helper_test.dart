import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/validity_helper.dart';

void main() {
  group('ValidityHelper Unit Tests (m, h, d)', () {
    test('1. Validates valid durations for minutes, hours, and days', () {
      final valid = ['1m', '5m', '15m', '30m', '60m', '1h', '3h', '12h', '24h', '1d', '3d', '7d', '30d'];
      for (final v in valid) {
        expect(isValidValidityDuration(v), isTrue, reason: 'Expected $v to be valid');
        expect(isValidValidityDuration(v.toUpperCase()), isTrue, reason: 'Expected case insensitive $v to be valid');
        expect(isValidValidityDuration(' $v '), isTrue, reason: 'Expected trimmed $v to be valid');
      }
    });

    test('2. Strictly rejects invalid, zero, negative, decimal, or malformed durations', () {
      final invalid = [
        '',
        ' ',
        '0m',
        '0h',
        '0d',
        '-1m',
        '-2h',
        '1.5h',
        '0.5d',
        '1x',
        'abc',
        '1',
        '1d3h',
        null,
      ];
      for (final inv in invalid) {
        expect(isValidValidityDuration(inv), isFalse, reason: 'Expected $inv to be rejected');
      }
    });

    test('3. Parses validity durations to total minutes accurately', () {
      expect(parseValidityToMinutes('1m'), 1);
      expect(parseValidityToMinutes('15m'), 15);
      expect(parseValidityToMinutes('30m'), 30);
      expect(parseValidityToMinutes('1h'), 60);
      expect(parseValidityToMinutes('3h'), 180);
      expect(parseValidityToMinutes('1d'), 1440);
      expect(parseValidityToMinutes('7d'), 10080);
    });

    test('4. Formats validity durations to clear Arabic text', () {
      // Minutes
      expect(formatValidityArabic('1m'), 'دقيقة واحدة');
      expect(formatValidityArabic('2m'), 'دقيقتان');
      expect(formatValidityArabic('5m'), '5 دقائق');
      expect(formatValidityArabic('15m'), '15 دقيقة');

      // Hours
      expect(formatValidityArabic('1h'), 'ساعة واحدة');
      expect(formatValidityArabic('2h'), 'ساعتان');
      expect(formatValidityArabic('3h'), '3 ساعات');
      expect(formatValidityArabic('12h'), '12 ساعة');

      // Days
      expect(formatValidityArabic('1d'), 'يوم واحد');
      expect(formatValidityArabic('2d'), 'يومان');
      expect(formatValidityArabic('7d'), '7 أيام');
      expect(formatValidityArabic('30d'), 'شهر واحد (30 يوم)');

      // Fallback
      expect(formatValidityArabic(null), 'دائم');
      expect(formatValidityArabic(''), 'دائم');
    });

    test('5. Normalizes validity duration string', () {
      expect(normalizeValidityDuration(' 15M '), '15m');
      expect(normalizeValidityDuration('3H'), '3h');
      expect(normalizeValidityDuration('7D'), '7d');
      expect(normalizeValidityDuration('invalid'), '1d');
      expect(normalizeValidityDuration(null), '1d');
    });

    test('6. Contains all required presets for minutes, hours, and days', () {
      final presetValues = validityPresets.map((p) => p['value']).toList();
      expect(presetValues, containsAll(['1m', '15m', '30m', '1h', '3h', '1d', '7d']));
    });

    test('7. Accurately decomposes validity into amount and unit (parseValidityParts)', () {
      // Minutes
      final p1 = parseValidityParts('1m');
      expect(p1.amount, 1);
      expect(p1.unit, 'm');
      expect(p1.code, '1m');
      expect(p1.upperCode, '1M');

      final p15m = parseValidityParts('15M');
      expect(p15m.amount, 15);
      expect(p15m.unit, 'm');

      final p30m = parseValidityParts('30m');
      expect(p30m.amount, 30);
      expect(p30m.unit, 'm');

      final p50m = parseValidityParts('50m');
      expect(p50m.amount, 50);
      expect(p50m.unit, 'm');

      // Hours
      final p1h = parseValidityParts('1h');
      expect(p1h.amount, 1);
      expect(p1h.unit, 'h');
      expect(p1h.upperCode, '1H');

      final p5h = parseValidityParts('5h');
      expect(p5h.amount, 5);
      expect(p5h.unit, 'h');

      final p70h = parseValidityParts('70H');
      expect(p70h.amount, 70);
      expect(p70h.unit, 'h');

      // Days
      final p1d = parseValidityParts('1d');
      expect(p1d.amount, 1);
      expect(p1d.unit, 'd');
      expect(p1d.upperCode, '1D');

      final p7d = parseValidityParts('7d');
      expect(p7d.amount, 7);
      expect(p7d.unit, 'd');

      final p30d = parseValidityParts('30D');
      expect(p30d.amount, 30);
      expect(p30d.unit, 'd');

      // Legacy week support (e.g. 1w -> 7d)
      final pLegacy1w = parseValidityParts('1w');
      expect(pLegacy1w.amount, 7);
      expect(pLegacy1w.unit, 'd');

      final pLegacy2w = parseValidityParts('2w');
      expect(pLegacy2w.amount, 14);
      expect(pLegacy2w.unit, 'd');

      // Fallbacks
      final pNull = parseValidityParts(null);
      expect(pNull.amount, 1);
      expect(pNull.unit, 'd');

      final pEmpty = parseValidityParts('');
      expect(pEmpty.amount, 1);
      expect(pEmpty.unit, 'd');

      final pInvalid = parseValidityParts('invalid', defaultAmount: 5, defaultUnit: 'h');
      expect(pInvalid.amount, 5);
      expect(pInvalid.unit, 'h');
    });
  });
}

