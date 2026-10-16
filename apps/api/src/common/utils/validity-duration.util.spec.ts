import {
  calculateExpirationDate,
  formatValidityDurationArabic,
  isValidValidityDuration,
  normalizeValidityDuration,
  parseValidityDuration,
} from './validity-duration.util';

describe('ValidityDurationUtil', () => {
  describe('VALIDITY_DURATION_REGEX & isValidValidityDuration', () => {
    it('should accept valid minutes formats: 1m, 5m, 15m, 30m, 60m', () => {
      expect(isValidValidityDuration('1m')).toBe(true);
      expect(isValidValidityDuration('5m')).toBe(true);
      expect(isValidValidityDuration('15m')).toBe(true);
      expect(isValidValidityDuration('30m')).toBe(true);
      expect(isValidValidityDuration('60m')).toBe(true);
      expect(isValidValidityDuration(' 15m ')).toBe(true);
      expect(isValidValidityDuration('15M')).toBe(true);
    });

    it('should accept valid hours formats: 1h, 3h, 12h, 24h', () => {
      expect(isValidValidityDuration('1h')).toBe(true);
      expect(isValidValidityDuration('3h')).toBe(true);
      expect(isValidValidityDuration('12h')).toBe(true);
      expect(isValidValidityDuration('24h')).toBe(true);
      expect(isValidValidityDuration('24H')).toBe(true);
    });

    it('should accept valid days formats: 1d, 3d, 7d, 30d', () => {
      expect(isValidValidityDuration('1d')).toBe(true);
      expect(isValidValidityDuration('3d')).toBe(true);
      expect(isValidValidityDuration('7d')).toBe(true);
      expect(isValidValidityDuration('30d')).toBe(true);
    });

    it('should strictly reject invalid, zero, negative, decimal, or malformed values', () => {
      expect(isValidValidityDuration('')).toBe(false);
      expect(isValidValidityDuration(' ')).toBe(false);
      expect(isValidValidityDuration('0m')).toBe(false);
      expect(isValidValidityDuration('0h')).toBe(false);
      expect(isValidValidityDuration('0d')).toBe(false);
      expect(isValidValidityDuration('-1m')).toBe(false);
      expect(isValidValidityDuration('-5h')).toBe(false);
      expect(isValidValidityDuration('1.5h')).toBe(false);
      expect(isValidValidityDuration('0.5d')).toBe(false);
      expect(isValidValidityDuration('1x')).toBe(false);
      expect(isValidValidityDuration('abc')).toBe(false);
      expect(isValidValidityDuration('1')).toBe(false);
      expect(isValidValidityDuration('1d3h')).toBe(false);
      expect(isValidValidityDuration(null)).toBe(false);
      expect(isValidValidityDuration(undefined)).toBe(false);
      expect(isValidValidityDuration(123)).toBe(false);
    });
  });

  describe('normalizeValidityDuration', () => {
    it('should trim and lowercase validity strings', () => {
      expect(normalizeValidityDuration(' 15M ')).toBe('15m');
      expect(normalizeValidityDuration('3H')).toBe('3h');
      expect(normalizeValidityDuration('7D')).toBe('7d');
      expect(normalizeValidityDuration('invalid')).toBe('1d');
      expect(normalizeValidityDuration(null)).toBe('1d');
    });
  });

  describe('parseValidityDuration', () => {
    it('should parse minutes correctly to seconds and minutes', () => {
      const parsed = parseValidityDuration('15m');
      expect(parsed.amount).toBe(15);
      expect(parsed.unit).toBe('m');
      expect(parsed.totalMinutes).toBe(15);
      expect(parsed.totalSeconds).toBe(15 * 60);
      expect(parsed.totalHours).toBe(0.25);
    });

    it('should parse hours correctly to seconds, minutes and hours', () => {
      const parsed = parseValidityDuration('3h');
      expect(parsed.amount).toBe(3);
      expect(parsed.unit).toBe('h');
      expect(parsed.totalHours).toBe(3);
      expect(parsed.totalMinutes).toBe(180);
      expect(parsed.totalSeconds).toBe(10800);
    });

    it('should parse days correctly to seconds, hours and days', () => {
      const parsed = parseValidityDuration('7d');
      expect(parsed.amount).toBe(7);
      expect(parsed.unit).toBe('d');
      expect(parsed.totalDays).toBe(7);
      expect(parsed.totalHours).toBe(168);
      expect(parsed.totalSeconds).toBe(604800);
    });

    it('should throw error on invalid string', () => {
      expect(() => parseValidityDuration('bad')).toThrow();
    });
  });

  describe('formatValidityDurationArabic', () => {
    it('should format minutes in clear Arabic', () => {
      expect(formatValidityDurationArabic('1m')).toBe('دقيقة واحدة');
      expect(formatValidityDurationArabic('2m')).toBe('دقيقتان');
      expect(formatValidityDurationArabic('5m')).toBe('5 دقائق');
      expect(formatValidityDurationArabic('15m')).toBe('15 دقيقة');
    });

    it('should format hours in clear Arabic', () => {
      expect(formatValidityDurationArabic('1h')).toBe('ساعة واحدة');
      expect(formatValidityDurationArabic('2h')).toBe('ساعتان');
      expect(formatValidityDurationArabic('3h')).toBe('3 ساعات');
      expect(formatValidityDurationArabic('12h')).toBe('12 ساعة');
    });

    it('should format days in clear Arabic', () => {
      expect(formatValidityDurationArabic('1d')).toBe('يوم واحد');
      expect(formatValidityDurationArabic('2d')).toBe('يومان');
      expect(formatValidityDurationArabic('7d')).toBe('7 أيام');
      expect(formatValidityDurationArabic('30d')).toBe('شهر واحد (30 يوم)');
    });
  });

  describe('calculateExpirationDate', () => {
    it('should correctly calculate future expiration date for minutes', () => {
      const start = new Date('2026-10-16T10:00:00Z');
      const expiry = calculateExpirationDate(start, '15m');
      expect(expiry.toISOString()).toBe('2026-10-16T10:15:00.000Z');
    });

    it('should correctly calculate future expiration date for hours', () => {
      const start = new Date('2026-10-16T10:00:00Z');
      const expiry = calculateExpirationDate(start, '3h');
      expect(expiry.toISOString()).toBe('2026-10-16T13:00:00.000Z');
    });

    it('should correctly calculate future expiration date for days', () => {
      const start = new Date('2026-10-16T10:00:00Z');
      const expiry = calculateExpirationDate(start, '1d');
      expect(expiry.toISOString()).toBe('2026-10-17T10:00:00.000Z');
    });
  });
});
