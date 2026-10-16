/**
 * Utility functions for Hotspot Package Validity Duration.
 * Supports minutes ('m'), hours ('h'), and days ('d').
 * Example formats: '1m', '15m', '1h', '3h', '1d', '7d'.
 */

export const VALIDITY_DURATION_REGEX = /^([1-9]\d*)([mhd])$/i;

export interface ParsedValidityDuration {
  amount: number;
  unit: 'm' | 'h' | 'd';
  totalSeconds: number;
  totalMinutes: number;
  totalHours: number;
  totalDays: number;
}

/**
 * Validates whether the given string is a legal validity duration.
 * Must be a positive integer followed by 'm', 'h', or 'd'.
 * Rejects empty, zero, negative, decimals, and unsupported units.
 */
export function isValidValidityDuration(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return VALIDITY_DURATION_REGEX.test(val.trim());
}

/**
 * Normalizes validity duration string (e.g. ' 15M ' -> '15m').
 */
export function normalizeValidityDuration(val?: string | null): string {
  if (!val || typeof val !== 'string') return '1d';
  const trimmed = val.trim().toLowerCase();
  return VALIDITY_DURATION_REGEX.test(trimmed) ? trimmed : '1d';
}

/**
 * Parses validity duration into granular time components and seconds.
 */
export function parseValidityDuration(val: string): ParsedValidityDuration {
  const trimmed = val.trim().toLowerCase();
  const match = trimmed.match(VALIDITY_DURATION_REGEX);
  if (!match) {
    throw new Error(
      `صيغة مدة الصلاحية غير صحيحة: "${val}". يجب أن تكون رقماً متبوعاً بـ m أو h أو d مثل 1m أو 1h أو 1d.`,
    );
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2] as 'm' | 'h' | 'd';

  let totalSeconds = 0;
  let totalMinutes = 0;
  let totalHours = 0;
  let totalDays = 0;

  switch (unit) {
    case 'm':
      totalMinutes = amount;
      totalSeconds = amount * 60;
      totalHours = amount / 60;
      totalDays = amount / 1440;
      break;
    case 'h':
      totalHours = amount;
      totalMinutes = amount * 60;
      totalSeconds = amount * 3600;
      totalDays = amount / 24;
      break;
    case 'd':
      totalDays = amount;
      totalHours = amount * 24;
      totalMinutes = amount * 1440;
      totalSeconds = amount * 86400;
      break;
  }

  return {
    amount,
    unit,
    totalSeconds,
    totalMinutes,
    totalHours,
    totalDays,
  };
}

/**
 * Formats a validity duration string into human-friendly Arabic text.
 * e.g.:
 * '1m' -> '1 دقيقة'
 * '2m' -> 'دقيقتان'
 * '3m' -> '3 دقائق'
 * '15m' -> '15 دقيقة'
 * '1h' -> '1 ساعة'
 * '2h' -> 'ساعتان'
 * '3h' -> '3 ساعات'
 * '1d' -> '1 يوم'
 * '2d' -> 'يومان'
 * '7d' -> '7 أيام'
 */
export function formatValidityDurationArabic(val?: string | null): string {
  if (!val || typeof val !== 'string' || !isValidValidityDuration(val)) {
    return 'دائم / غير محدد';
  }

  try {
    const { amount, unit } = parseValidityDuration(val);
    switch (unit) {
      case 'm':
        if (amount === 1) return 'دقيقة واحدة';
        if (amount === 2) return 'دقيقتان';
        if (amount >= 3 && amount <= 10) return `${amount} دقائق`;
        return `${amount} دقيقة`;

      case 'h':
        if (amount === 1) return 'ساعة واحدة';
        if (amount === 2) return 'ساعتان';
        if (amount >= 3 && amount <= 10) return `${amount} ساعات`;
        return `${amount} ساعة`;

      case 'd':
        if (amount === 1) return 'يوم واحد';
        if (amount === 2) return 'يومان';
        if (amount >= 3 && amount <= 10) return `${amount} أيام`;
        if (amount === 30) return 'شهر واحد (30 يوم)';
        return `${amount} يوم`;

      default:
        return val;
    }
  } catch {
    return val;
  }
}

/**
 * Calculates calendar expiration date given a start date and validity string.
 */
export function calculateExpirationDate(startDate: Date, validityStr: string): Date {
  const parsed = parseValidityDuration(validityStr);
  return new Date(startDate.getTime() + parsed.totalSeconds * 1000);
}
