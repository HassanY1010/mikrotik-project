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
  });
}
