/**
 * Hotspot Radar Parser and Accounting Utility
 * Provides verified parsing for MikroTik rate-limits, durations,
 * quota calculations, and time/validity evaluations.
 */

export interface ParsedRateLimit {
  rawRateLimit: string | null;
  uploadSpeedLimit: string | null;
  downloadSpeedLimit: string | null;
  uploadSpeedLimitBps: number | null;
  downloadSpeedLimitBps: number | null;
  isUnlimitedSpeed: boolean;
}

export interface ParsedDuration {
  seconds: number;
  formattedArabic: string;
}

export interface ConsumptionAndQuotaResult {
  consumedBytes: number;
  totalQuotaBytes: number | null;
  remainingBytes: number | null;
  consumptionPercentage: number | null;
  isUnlimitedQuota: boolean;
  isQuotaExhausted: boolean;
  isUnknownQuota: boolean;
}

export interface ValidityAndTimeResult {
  sessionUptime: string;
  sessionUptimeSeconds: number;
  timeLimit: string | null;
  sessionTimeLeft: string | null;
  remainingTimeSeconds: number | null;
  expiresAt: string | null;
  isUnlimitedTime: boolean;
  isExpired: boolean;
  isSessionTimeExpired?: boolean;
}

/**
 * Parses raw rate string (e.g. "512k", "2M", "1000000") into numeric bps.
 */
export function parseRateToBps(rateStr?: string | null): number | null {
  if (!rateStr) return null;
  const trimmed = rateStr.trim();
  if (!trimmed || trimmed === '0' || trimmed.toLowerCase() === 'unlimited') return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([kKmMgG]?)(?:bps)?$/i);
  if (!match) return null;

  const val = parseFloat(match[1]);
  const unit = (match[2] || '').toUpperCase();

  switch (unit) {
    case 'K':
      return Math.round(val * 1000);
    case 'M':
      return Math.round(val * 1000 * 1000);
    case 'G':
      return Math.round(val * 1000 * 1000 * 1000);
    default:
      return Math.round(val);
  }
}

/**
 * Formats bps into human-readable strings like "512 Kbps" or "2 Mbps".
 */
export function formatSpeedBps(bps?: number | null): string | null {
  if (bps == null || bps <= 0) return null;

  if (bps >= 1000 * 1000 * 1000) {
    const gbps = bps / (1000 * 1000 * 1000);
    return `${gbps % 1 === 0 ? gbps.toFixed(0) : gbps.toFixed(1)} Gbps`;
  }
  if (bps >= 1000 * 1000) {
    const mbps = bps / (1000 * 1000);
    return `${mbps % 1 === 0 ? mbps.toFixed(0) : mbps.toFixed(1)} Mbps`;
  }
  if (bps >= 1000) {
    const kbps = bps / 1000;
    return `${kbps % 1 === 0 ? kbps.toFixed(0) : kbps.toFixed(1)} Kbps`;
  }
  return `${bps} bps`;
}

/**
 * Parses MikroTik rate-limit string.
 * Syntax: [rx-rate[/tx-rate]] [rx-burst-rate[/tx-burst-rate]] ...
 * In MikroTik: rx = router receive (client upload), tx = router transmit (client download).
 */
export function parseRateLimit(rateLimitStr?: string | null): ParsedRateLimit {
  if (!rateLimitStr || rateLimitStr.trim() === '' || rateLimitStr.trim().toLowerCase() === 'unlimited') {
    return {
      rawRateLimit: rateLimitStr ?? null,
      uploadSpeedLimit: null,
      downloadSpeedLimit: null,
      uploadSpeedLimitBps: null,
      downloadSpeedLimitBps: null,
      isUnlimitedSpeed: true,
    };
  }

  const trimmed = rateLimitStr.trim();
  // The first token represents rx-rate[/tx-rate]
  const firstToken = trimmed.split(/\s+/)[0];
  if (!firstToken) {
    return {
      rawRateLimit: trimmed,
      uploadSpeedLimit: null,
      downloadSpeedLimit: null,
      uploadSpeedLimitBps: null,
      downloadSpeedLimitBps: null,
      isUnlimitedSpeed: true,
    };
  }

  const parts = firstToken.split('/');
  const rxStr = parts[0];
  const txStr = parts.length > 1 ? parts[1] : parts[0]; // If symmetric e.g. "2M"

  const rxBps = parseRateToBps(rxStr);
  const txBps = parseRateToBps(txStr);

  const isUnlimited = rxBps == null && txBps == null;

  return {
    rawRateLimit: trimmed,
    uploadSpeedLimit: rxBps ? formatSpeedBps(rxBps) : null,
    downloadSpeedLimit: txBps ? formatSpeedBps(txBps) : null,
    uploadSpeedLimitBps: rxBps,
    downloadSpeedLimitBps: txBps,
    isUnlimitedSpeed: isUnlimited,
  };
}

/**
 * Parses MikroTik duration strings like "15m", "15m42s", "2h30m", "3d05:12:00", "1w2d" into seconds.
 */
export function parseMikrotikDuration(durationStr?: string | null): ParsedDuration {
  if (!durationStr || durationStr.trim() === '') {
    return { seconds: 0, formattedArabic: '0 ث' };
  }

  const str = durationStr.trim().toLowerCase();
  let totalSeconds = 0;

  // Handle standard format with units e.g., "1w2d3h4m5s" or "3d05:12:00"
  if (str.includes(':')) {
    // E.g. "3d05:12:00" or "01:23:45"
    let timePart = str;
    let days = 0;
    if (str.includes('d')) {
      const dMatch = str.match(/(\d+)d(.*)/);
      if (dMatch) {
        days = parseInt(dMatch[1], 10) || 0;
        timePart = dMatch[2];
      }
    }
    const hms = timePart.split(':');
    if (hms.length === 3) {
      const h = parseInt(hms[0], 10) || 0;
      const m = parseInt(hms[1], 10) || 0;
      const s = parseInt(hms[2], 10) || 0;
      totalSeconds = days * 86400 + h * 3600 + m * 60 + s;
    }
  } else {
    const weeks = str.match(/(\d+)w/);
    const days = str.match(/(\d+)d/);
    const hours = str.match(/(\d+)h/);
    const minutes = str.match(/(\d+)m/);
    const seconds = str.match(/(\d+)s/);

    if (weeks) totalSeconds += parseInt(weeks[1], 10) * 7 * 86400;
    if (days) totalSeconds += parseInt(days[1], 10) * 86400;
    if (hours) totalSeconds += parseInt(hours[1], 10) * 3600;
    if (minutes) totalSeconds += parseInt(minutes[1], 10) * 60;
    if (seconds) totalSeconds += parseInt(seconds[1], 10);

    // If pure number with no units, treat as seconds
    if (!weeks && !days && !hours && !minutes && !seconds && /^\d+$/.test(str)) {
      totalSeconds = parseInt(str, 10);
    }
  }

  // Format into Arabic
  const formattedArabic = formatSecondsToArabic(totalSeconds);
  return { seconds: totalSeconds, formattedArabic };
}

/**
 * Formats a duration in seconds to a concise Arabic representation.
 */
export function formatSecondsToArabic(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0 ث';

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ي`);
  if (hours > 0) parts.push(`${hours} س`);
  if (minutes > 0) parts.push(`${minutes} د`);
  if (seconds > 0 && days === 0) parts.push(`${seconds} ث`);

  return parts.length > 0 ? parts.join(' ') : `${totalSeconds} ث`;
}

/**
 * Calculates consumption and quota metrics.
 * Reconciles router active session counters with user cumulative accounting and database history.
 * In RouterOS local hotspot, /ip/hotspot/user counters accumulate closed sessions,
 * while /ip/hotspot/active accumulates the current active TCP session.
 * Prevents undercounting of the active session, prevents loss on router reboot,
 * and prevents negative remaining quota values.
 */
export function calculateConsumptionAndQuota(params: {
  sessionBytesIn: number;
  sessionBytesOut: number;
  cumulativeUserBytesIn?: number | null;
  cumulativeUserBytesOut?: number | null;
  priorClosedBytesTotal?: number | bigint | null;
  isRouterUserInterimUpdated?: boolean;
  cardDataLimitBytes?: number | bigint | null;
  profileDataLimitBytes?: number | bigint | null;
  routerLimitBytesTotal?: number | null;
  hasKnownPlanOrProfile?: boolean;
}): ConsumptionAndQuotaResult {
  const sessionTotal = Math.max(0, (params.sessionBytesIn || 0) + (params.sessionBytesOut || 0));
  const routerUserTotal = Math.max(
    0,
    (params.cumulativeUserBytesIn || 0) + (params.cumulativeUserBytesOut || 0),
  );
  const priorClosedTotal = params.priorClosedBytesTotal != null ? Number(params.priorClosedBytesTotal) : 0;

  // 1. Establish the confirmed baseline of past closed sessions.
  // In standard RouterOS local HotSpot (/ip/hotspot/user), user cumulative counters are flushed ONLY when a session terminates.
  // If interim accounting is enabled, or if routerUserTotal already merged part/all of the live session beyond priorClosedTotal,
  // (routerUserTotal - sessionTotal) extracts the true un-flushed baseline, bounded below by priorClosedTotal from DB.
  let pastClosedSessions = Math.max(priorClosedTotal, routerUserTotal);
  if (
    sessionTotal > 0 &&
    (params.isRouterUserInterimUpdated || (priorClosedTotal > 0 && routerUserTotal > priorClosedTotal))
  ) {
    pastClosedSessions = Math.max(priorClosedTotal, Math.max(0, routerUserTotal - sessionTotal));
  }

  // 2. Reconcile total consumption:
  // When no active session exists (offline), consumption is strictly the past closed baseline.
  // When an active session is running, consumption is pastClosedSessions + sessionTotal.
  // Math.max with routerUserTotal guarantees the result is never less than the router's physical counter
  // while preventing interim-flushed bytes from being counted twice.
  let consumedBytes: number;
  if (sessionTotal === 0) {
    consumedBytes = Math.max(priorClosedTotal, routerUserTotal);
  } else {
    consumedBytes = Math.max(routerUserTotal, pastClosedSessions + sessionTotal);
  }

  // Determine total quota in bytes (Card limit takes precedence over Profile limit and Router limit)
  let resolvedLimit: number | null = null;
  if (params.cardDataLimitBytes != null && Number(params.cardDataLimitBytes) > 0) {
    resolvedLimit = Number(params.cardDataLimitBytes);
  } else if (params.profileDataLimitBytes != null && Number(params.profileDataLimitBytes) > 0) {
    resolvedLimit = Number(params.profileDataLimitBytes);
  } else if (params.routerLimitBytesTotal != null && params.routerLimitBytesTotal > 0) {
    resolvedLimit = params.routerLimitBytesTotal;
  }

  // If a quota is explicitly configured
  if (resolvedLimit != null && resolvedLimit > 0) {
    const remaining = Math.max(0, resolvedLimit - consumedBytes);
    const isExhausted = remaining === 0;
    const percentage = Math.min(100, Math.max(0, Math.round((consumedBytes / resolvedLimit) * 1000) / 10));

    return {
      consumedBytes,
      totalQuotaBytes: resolvedLimit,
      remainingBytes: remaining,
      consumptionPercentage: percentage,
      isUnlimitedQuota: false,
      isQuotaExhausted: isExhausted,
      isUnknownQuota: false,
    };
  }

  // If plan/card is known to exist but no data limit was set -> unlimited quota!
  if (params.hasKnownPlanOrProfile) {
    return {
      consumedBytes,
      totalQuotaBytes: null,
      remainingBytes: null,
      consumptionPercentage: null,
      isUnlimitedQuota: true,
      isQuotaExhausted: false,
      isUnknownQuota: false,
    };
  }

  // Neither card nor profile is linked, and router has no limit-bytes-total -> unknown accounting
  return {
    consumedBytes,
    totalQuotaBytes: null,
    remainingBytes: null,
    consumptionPercentage: null,
    isUnlimitedQuota: false,
    isQuotaExhausted: false,
    isUnknownQuota: true,
  };
}

/**
 * Calculates session duration and card/package validity metrics.
 * Accurately distinguishes current connection duration from card validity and expiry.
 */
export function calculateValidityAndTime(params: {
  uptimeStr?: string | null;
  sessionTimeLeftStr?: string | null;
  cardActivatedAt?: Date | string | null;
  cardExpiresAt?: Date | string | null;
  cardTimeLimit?: string | null;
  profileSessionTimeout?: string | null;
  validityDays?: number | null;
}): ValidityAndTimeResult {
  const uptimeParsed = parseMikrotikDuration(params.uptimeStr);
  const sessionUptime = uptimeParsed.formattedArabic;
  const sessionUptimeSeconds = uptimeParsed.seconds;

  let remainingTimeSeconds: number | null = null;
  let isExpired = false;
  let isSessionTimeExpired = false;
  let expiresAtIso: string | null = null;

  // 1. If router provided session-time-left, parse it
  let sessionTimeLeftFormatted: string | null = null;
  if (params.sessionTimeLeftStr && params.sessionTimeLeftStr.trim() !== '') {
    const timeLeftParsed = parseMikrotikDuration(params.sessionTimeLeftStr);
    sessionTimeLeftFormatted = timeLeftParsed.formattedArabic;
    const sessionSecondsLeft = timeLeftParsed.seconds;
    if (sessionSecondsLeft <= 0) {
      isSessionTimeExpired = true;
    }
    // If no commercial calendar expiry is configured, remaining time falls back to session time
    remainingTimeSeconds = sessionSecondsLeft;
  }

  // 2. Commercial calendar validity: If card has expiresAt timestamp
  if (params.cardExpiresAt) {
    const expDate = new Date(params.cardExpiresAt);
    if (!isNaN(expDate.getTime())) {
      expiresAtIso = expDate.toISOString();
      const diffSec = Math.floor((expDate.getTime() - Date.now()) / 1000);
      remainingTimeSeconds = Math.max(0, diffSec);
      if (diffSec <= 0) {
        isExpired = true;
      }
    }
  } else if (params.validityDays && params.cardActivatedAt) {
    const actDate = new Date(params.cardActivatedAt);
    if (!isNaN(actDate.getTime())) {
      const expDate = new Date(actDate.getTime() + params.validityDays * 86400 * 1000);
      expiresAtIso = expDate.toISOString();
      const diffSec = Math.floor((expDate.getTime() - Date.now()) / 1000);
      remainingTimeSeconds = Math.max(0, diffSec);
      if (diffSec <= 0) {
        isExpired = true;
      }
    }
  }

  // 3. Time limit from card or profile
  const resolvedTimeLimit = params.cardTimeLimit || params.profileSessionTimeout || null;

  // Determine if package has unlimited time
  const hasTimeConstraint =
    resolvedTimeLimit != null ||
    expiresAtIso != null ||
    sessionTimeLeftFormatted != null ||
    (params.validityDays != null && params.validityDays > 0);

  const isUnlimitedTime = !hasTimeConstraint;

  return {
    sessionUptime,
    sessionUptimeSeconds,
    timeLimit: resolvedTimeLimit,
    sessionTimeLeft: sessionTimeLeftFormatted,
    remainingTimeSeconds,
    expiresAt: expiresAtIso,
    isUnlimitedTime,
    isExpired,
    isSessionTimeExpired,
  };
}
