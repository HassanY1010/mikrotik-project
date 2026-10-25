import {
  parseRateToBps,
  formatSpeedBps,
  parseRateLimit,
  parseMikrotikDuration,
  calculateConsumptionAndQuota,
  calculateValidityAndTime,
} from './hotspot-parser.util';

describe('HotspotParserUtil', () => {
  describe('parseRateToBps', () => {
    it('should parse Mbps, Kbps, Gbps, and raw bps correctly', () => {
      expect(parseRateToBps('512k')).toBe(512000);
      expect(parseRateToBps('2M')).toBe(2000000);
      expect(parseRateToBps('1.5M')).toBe(1500000);
      expect(parseRateToBps('1G')).toBe(1000000000);
      expect(parseRateToBps('64000')).toBe(64000);
      expect(parseRateToBps(null)).toBeNull();
      expect(parseRateToBps('0')).toBeNull();
      expect(parseRateToBps('unlimited')).toBeNull();
    });
  });

  describe('formatSpeedBps', () => {
    it('should format numeric bps to readable speeds', () => {
      expect(formatSpeedBps(512000)).toBe('512 Kbps');
      expect(formatSpeedBps(2000000)).toBe('2 Mbps');
      expect(formatSpeedBps(1500000)).toBe('1.5 Mbps');
      expect(formatSpeedBps(1000000000)).toBe('1 Gbps');
      expect(formatSpeedBps(null)).toBeNull();
      expect(formatSpeedBps(0)).toBeNull();
    });
  });

  describe('parseRateLimit', () => {
    it('should parse rx/tx rate limits (rx=upload, tx=download in MikroTik)', () => {
      const res = parseRateLimit('2M/5M');
      expect(res.uploadSpeedLimit).toBe('2 Mbps');
      expect(res.downloadSpeedLimit).toBe('5 Mbps');
      expect(res.uploadSpeedLimitBps).toBe(2000000);
      expect(res.downloadSpeedLimitBps).toBe(5000000);
      expect(res.isUnlimitedSpeed).toBe(false);
    });

    it('should handle symmetric limits (e.g. 10M)', () => {
      const res = parseRateLimit('10M');
      expect(res.uploadSpeedLimit).toBe('10 Mbps');
      expect(res.downloadSpeedLimit).toBe('10 Mbps');
      expect(res.isUnlimitedSpeed).toBe(false);
    });

    it('should handle complex MikroTik burst strings by reading the first token', () => {
      const res = parseRateLimit('1M/2M 2M/4M 512k/1024k 10/10 8 256k/512k');
      expect(res.uploadSpeedLimit).toBe('1 Mbps');
      expect(res.downloadSpeedLimit).toBe('2 Mbps');
    });

    it('should return unlimited for null, empty or unlimited strings', () => {
      expect(parseRateLimit(null).isUnlimitedSpeed).toBe(true);
      expect(parseRateLimit('').isUnlimitedSpeed).toBe(true);
      expect(parseRateLimit('unlimited').isUnlimitedSpeed).toBe(true);
    });
  });

  describe('parseMikrotikDuration', () => {
    it('should parse standard units into seconds and Arabic strings', () => {
      const res1 = parseMikrotikDuration('15m');
      expect(res1.seconds).toBe(900);
      expect(res1.formattedArabic).toBe('15 د');

      const res2 = parseMikrotikDuration('2h15m30s');
      expect(res2.seconds).toBe(2 * 3600 + 15 * 60 + 30);
      expect(res2.formattedArabic).toBe('2 س 15 د 30 ث');

      const res3 = parseMikrotikDuration('1d02:30:00');
      expect(res3.seconds).toBe(86400 + 2 * 3600 + 30 * 60);
      expect(res3.formattedArabic).toBe('1 ي 2 س 30 د');
    });

    it('should gracefully handle empty or invalid duration', () => {
      expect(parseMikrotikDuration(null).seconds).toBe(0);
      expect(parseMikrotikDuration('').seconds).toBe(0);
    });
  });

  describe('calculateConsumptionAndQuota', () => {
    it('Scenario 1: Brand new session (0 prior closed sessions, 50MB active)', () => {
      const quotaBytes = 1000 * 1024 * 1024; // 1000 MB
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 20 * 1024 * 1024,
        sessionBytesOut: 30 * 1024 * 1024, // 50MB
        cumulativeUserBytesIn: 0,
        cumulativeUserBytesOut: 0,
        cardDataLimitBytes: quotaBytes,
        hasKnownPlanOrProfile: true,
      });

      expect(res.consumedBytes).toBe(50 * 1024 * 1024);
      expect(res.totalQuotaBytes).toBe(quotaBytes);
      expect(res.remainingBytes).toBe(950 * 1024 * 1024);
      expect(res.consumptionPercentage).toBe(5);
      expect(res.isQuotaExhausted).toBe(false);
      expect(res.isUnlimitedQuota).toBe(false);
      expect(res.isUnknownQuota).toBe(false);
    });

    it('Scenario 2: Previous closed sessions (100MB) + active session (20MB) - ensures active session is not omitted', () => {
      // In RouterOS local hotspot, /ip/hotspot/user records past closed sessions (100MB).
      // The active TCP session in /ip/hotspot/active has 20MB.
      // Total consumption MUST be 120MB, not 100MB!
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 5 * 1024 * 1024,
        sessionBytesOut: 15 * 1024 * 1024, // 20MB
        cumulativeUserBytesIn: 40 * 1024 * 1024,
        cumulativeUserBytesOut: 60 * 1024 * 1024, // 100MB
        cardDataLimitBytes: 500 * 1024 * 1024,
      });

      expect(res.consumedBytes).toBe(120 * 1024 * 1024);
      expect(res.remainingBytes).toBe(380 * 1024 * 1024);
      expect(res.consumptionPercentage).toBe(24);
    });

    it('Scenario 2.1: Interim accounting flush - user counter includes PART of current session (110MB includes 10MB of 20MB session)', () => {
      // Past closed = 100MB (in DB).
      // Active session = 20MB.
      // Router user counter has received an interim flush of 10MB -> user counter = 110MB.
      // True total consumption MUST be 120MB (NOT 130MB double-counted!).
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 5 * 1024 * 1024,
        sessionBytesOut: 15 * 1024 * 1024, // 20MB active session
        cumulativeUserBytesIn: 50 * 1024 * 1024,
        cumulativeUserBytesOut: 60 * 1024 * 1024, // 110MB user counter (100MB past + 10MB flushed)
        priorClosedBytesTotal: 100 * 1024 * 1024, // 100MB confirmed past closed sessions from DB
        isRouterUserInterimUpdated: true,
        cardDataLimitBytes: 500 * 1024 * 1024,
      });

      expect(res.consumedBytes).toBe(120 * 1024 * 1024); // Exactly 120MB!
      expect(res.remainingBytes).toBe(380 * 1024 * 1024);
    });

    it('Scenario 2.2: Full flush - user counter already includes 100% of the active session (120MB)', () => {
      // Past closed = 100MB.
      // Active session = 20MB.
      // Router user counter already reflects the full 120MB.
      // True total consumption MUST be 120MB (NOT 140MB double-counted!).
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 5 * 1024 * 1024,
        sessionBytesOut: 15 * 1024 * 1024, // 20MB
        cumulativeUserBytesIn: 60 * 1024 * 1024,
        cumulativeUserBytesOut: 60 * 1024 * 1024, // 120MB user counter
        priorClosedBytesTotal: 100 * 1024 * 1024,
        isRouterUserInterimUpdated: true,
        cardDataLimitBytes: 500 * 1024 * 1024,
      });

      expect(res.consumedBytes).toBe(120 * 1024 * 1024);
      expect(res.remainingBytes).toBe(380 * 1024 * 1024);
    });

    it('Scenario 2.3: Database and Router counters overlap completely (both have 100MB, session=0)', () => {
      // Router user counter = 100MB.
      // DB prior closed sessions = 100MB.
      // User is currently offline (0MB active).
      // Total consumption MUST be 100MB (NOT 200MB!).
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 0,
        sessionBytesOut: 0,
        cumulativeUserBytesIn: 40 * 1024 * 1024,
        cumulativeUserBytesOut: 60 * 1024 * 1024, // 100MB
        priorClosedBytesTotal: 100 * 1024 * 1024, // 100MB in DB
        cardDataLimitBytes: 500 * 1024 * 1024,
      });

      expect(res.consumedBytes).toBe(100 * 1024 * 1024);
      expect(res.remainingBytes).toBe(400 * 1024 * 1024);
    });

    it('Scenario 3: Reconnect / Next session after logout', () => {
      // User disconnected: router flushed 120MB to user counters.
      // Now a new session is started with 5MB in /ip/hotspot/active.
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 2 * 1024 * 1024,
        sessionBytesOut: 3 * 1024 * 1024, // 5MB
        cumulativeUserBytesIn: 50 * 1024 * 1024,
        cumulativeUserBytesOut: 70 * 1024 * 1024, // 120MB
        cardDataLimitBytes: 200 * 1024 * 1024,
      });

      expect(res.consumedBytes).toBe(125 * 1024 * 1024);
      expect(res.remainingBytes).toBe(75 * 1024 * 1024);
    });

    it('Scenario 4: Router reboot or counter reset (router user counters = 0, DB has 100MB history)', () => {
      // If the router rebooted, /ip/hotspot/user counters may be reset to 0.
      // DB has priorClosedBytesTotal = 100MB, and new active session is 15MB.
      // Total MUST reconcile to 115MB, not 15MB!
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 5 * 1024 * 1024,
        sessionBytesOut: 10 * 1024 * 1024, // 15MB
        cumulativeUserBytesIn: 0,
        cumulativeUserBytesOut: 0,
        priorClosedBytesTotal: 100 * 1024 * 1024, // 100MB preserved from DB
        cardDataLimitBytes: 200 * 1024 * 1024,
      });

      expect(res.consumedBytes).toBe(115 * 1024 * 1024);
      expect(res.remainingBytes).toBe(85 * 1024 * 1024);
      expect(res.isQuotaExhausted).toBe(false);
    });

    it('Scenario 5: Quota exhausted (consumed >= limit) - never produces negative remaining bytes', () => {
      const quotaBytes = 100 * 1024 * 1024; // 100 MB
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 60 * 1024 * 1024,
        sessionBytesOut: 60 * 1024 * 1024, // Total 120 MB
        cardDataLimitBytes: quotaBytes,
      });

      expect(res.consumedBytes).toBe(120 * 1024 * 1024);
      expect(res.remainingBytes).toBe(0);
      expect(res.isQuotaExhausted).toBe(true);
      expect(res.consumptionPercentage).toBe(100);
    });

    it('Scenario 6: Open / Unlimited package', () => {
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 50000000,
        sessionBytesOut: 150000000,
        cardDataLimitBytes: null,
        profileDataLimitBytes: null,
        hasKnownPlanOrProfile: true,
      });

      expect(res.isUnlimitedQuota).toBe(true);
      expect(res.totalQuotaBytes).toBeNull();
      expect(res.remainingBytes).toBeNull();
      expect(res.consumptionPercentage).toBeNull();
      expect(res.isQuotaExhausted).toBe(false);
      expect(res.isUnknownQuota).toBe(false);
    });

    it('Scenario 7: Unknown / Unlinked subscriber', () => {
      const res = calculateConsumptionAndQuota({
        sessionBytesIn: 10000,
        sessionBytesOut: 20000,
        cardDataLimitBytes: null,
        profileDataLimitBytes: null,
        routerLimitBytesTotal: null,
        hasKnownPlanOrProfile: false,
      });

      expect(res.isUnknownQuota).toBe(true);
      expect(res.isUnlimitedQuota).toBe(false);
      expect(res.totalQuotaBytes).toBeNull();
      expect(res.remainingBytes).toBeNull();
    });

    it('Scenario 8: Quota precedence hierarchy (Card > Profile > Router)', () => {
      // 1. When Card limit is present, it overrides Profile and Router limits
      const res1 = calculateConsumptionAndQuota({
        sessionBytesIn: 100,
        sessionBytesOut: 200,
        cardDataLimitBytes: 1000,
        profileDataLimitBytes: 2000,
        routerLimitBytesTotal: 3000,
      });
      expect(res1.totalQuotaBytes).toBe(1000);

      // 2. When Card limit is null, Profile limit takes precedence over Router limit
      const res2 = calculateConsumptionAndQuota({
        sessionBytesIn: 100,
        sessionBytesOut: 200,
        cardDataLimitBytes: null,
        profileDataLimitBytes: 2000,
        routerLimitBytesTotal: 3000,
      });
      expect(res2.totalQuotaBytes).toBe(2000);

      // 3. When Card and Profile limits are null, Router limit is used
      const res3 = calculateConsumptionAndQuota({
        sessionBytesIn: 100,
        sessionBytesOut: 200,
        cardDataLimitBytes: null,
        profileDataLimitBytes: null,
        routerLimitBytesTotal: 3000,
      });
      expect(res3.totalQuotaBytes).toBe(3000);
    });
  });

  describe('calculateValidityAndTime', () => {
    it('should accurately separate current session uptime from card validity and expiry', () => {
      const futureDate = new Date(Date.now() + 86400 * 3 * 1000); // 3 days in future

      const res = calculateValidityAndTime({
        uptimeStr: '25m10s',
        cardExpiresAt: futureDate,
        cardTimeLimit: '1h',
        sessionTimeLeftStr: '34m50s',
      });

      expect(res.sessionUptime).toBe('25 د 10 ث');
      expect(res.sessionUptimeSeconds).toBe(1510);
      expect(res.sessionTimeLeft).toBe('34 د 50 ث');
      expect(res.isExpired).toBe(false);
      expect(res.isUnlimitedTime).toBe(false);
      expect(res.timeLimit).toBe('1h');
    });

    it('should mark card as expired if expiration date has passed', () => {
      const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
      const res = calculateValidityAndTime({
        uptimeStr: '5m',
        cardExpiresAt: pastDate,
      });

      expect(res.isExpired).toBe(true);
      expect(res.remainingTimeSeconds).toBe(0);
    });

    it('should decouple session-time-left timeout from commercial card validity (session expired but card still commercially valid)', () => {
      const futureDate = new Date(Date.now() + 86400 * 2 * 1000); // 2 days in future
      const res = calculateValidityAndTime({
        uptimeStr: '1h',
        sessionTimeLeftStr: '0s', // Current session run out of uptime
        cardExpiresAt: futureDate, // Commercial validity is still 2 days
      });

      expect(res.isSessionTimeExpired).toBe(true);
      expect(res.isExpired).toBe(false); // Card must NOT be expired commercially!
      expect(res.remainingTimeSeconds).toBeGreaterThan(0);
    });

    it('should report unlimited time when no time limits or expirations are defined', () => {
      const res = calculateValidityAndTime({
        uptimeStr: '10m',
        cardExpiresAt: null,
        cardTimeLimit: null,
        profileSessionTimeout: null,
      });

      expect(res.isUnlimitedTime).toBe(true);
      expect(res.remainingTimeSeconds).toBeNull();
      expect(res.isExpired).toBe(false);
    });
  });
});
