/**
 * Utility functions for Hotspot Package Validity Duration in Web Admin.
 * Supports minutes ('m'), hours ('h'), and days ('d').
 */

export const VALIDITY_REGEX = /^([1-9]\d*)([mhd])$/i;

export const VALIDITY_PRESETS = [
  { label: '1 دقيقة', value: '1m' },
  { label: '15 دقيقة', value: '15m' },
  { label: '30 دقيقة', value: '30m' },
  { label: '1 ساعة', value: '1h' },
  { label: '3 ساعات', value: '3h' },
  { label: '1 يوم', value: '1d' },
  { label: '7 أيام', value: '7d' },
];

export function isValidValidityDuration(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return VALIDITY_REGEX.test(val.trim());
}

export function formatValidityArabic(val?: string | null): string {
  if (!val || typeof val !== 'string') return 'دائم';
  const trimmed = val.trim();
  const match = trimmed.match(VALIDITY_REGEX);
  if (!match) return val;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

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
      if (amount === 30) return 'شهر (30 يوم)';
      return `${amount} يوم`;

    default:
      return val;
  }
}
