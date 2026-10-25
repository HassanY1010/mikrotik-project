import { Test, TestingModule } from '@nestjs/testing';
import { CardsService } from './cards.service';
import { QuotasService } from './quotas.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { CardCodeGeneratorService } from './card-code-generator.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CardBatchStatus, RouterOsVersion, SyncStatus, SubscriptionStatus } from '@prisma/client';

describe('SaaS Card Quotas & Synchronization Integrity (Phase 1)', () => {
  let cardsService: CardsService;
  let quotasService: QuotasService;
  let prisma: any;
  let encryptionService: any;
  let mikrotikClientFactory: any;
  let codeGenerator: any;
  let mockClient: any;

  const mockTenantId = 'tenant-saas-101';
  const mockOtherTenantId = 'tenant-saas-999';
  const mockUserId = 'user-owner-1';
  const mockDeviceId = 'device-router-1';
  const mockProfileId = 'profile-pro-1';
  const mockBatchId = 'batch-uuid-1';

  beforeEach(async () => {
    mockClient = {
      createHotspotUser: jest.fn().mockResolvedValue('*1'),
      disableHotspotUser: jest.fn().mockResolvedValue(undefined),
      enableHotspotUser: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'sub-1', expiresAt: new Date(Date.now() + 864000000), status: 'ACTIVE' }]),
      subscription: {
        findFirst: jest.fn(),
      },
      subscriptionPlan: {
        findUnique: jest.fn(),
      },
      mikroTikDevice: {
        findFirst: jest.fn(),
      },
      hotspotProfile: {
        findFirst: jest.fn(),
      },
      cardBatch: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      card: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: mockUserId }),
        findUnique: jest.fn().mockResolvedValue({ id: mockUserId, role: { name: 'TENANT_ADMIN' } }),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: mockTenantId, status: 'ACTIVE' }),
      },
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'cipher_hex',
        iv: 'iv_hex',
        authTag: 'tag_hex',
      }),
      decrypt: jest.fn().mockReturnValue('plain_password'),
    };

    mikrotikClientFactory = {
      getClient: jest.fn().mockResolvedValue(mockClient),
    };

    codeGenerator = {
      generateBatchNumber: jest.fn().mockReturnValue('BATCH-261010-001'),
      generateBatchCodes: jest.fn().mockReturnValue(['99001', '99002']),
      generatePin: jest.fn().mockReturnValue('4321'),
      generateSerialNumber: jest.fn((batch, i) => `${batch}-00${i}`),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        QuotasService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: MikrotikClientFactory, useValue: mikrotikClientFactory },
        { provide: CardCodeGeneratorService, useValue: codeGenerator },
      ],
    }).compile();

    cardsService = module.get<CardsService>(CardsService);
    quotasService = module.get<QuotasService>(QuotasService);
  });

  describe('1. QuotasService - Subscription Resolution & Cycle Calculation', () => {
    it('should reject requests when no active subscription exists', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);

      await expect(
        quotasService.resolveTenantSubscription(mockTenantId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject requests when subscription has expired', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-expired',
        tenantId: mockTenantId,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date('2025-01-01'),
        expiresAt: new Date('2025-02-01'), // Expired in the past
        plan: { features: { cardGenerationLimit: 10000 } },
      });

      await expect(
        quotasService.resolveTenantSubscription(mockTenantId, new Date('2026-10-10')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should accurately calculate monthly billing cycle anchored to subscription start day', () => {
      const startsAt = new Date('2026-03-15T00:00:00Z');
      const expiresAt = new Date('2027-03-15T00:00:00Z');
      const testDate = new Date('2026-10-10T12:00:00Z'); // Between Sept 15 and Oct 15

      const cycle = quotasService.calculateBillingCycle(startsAt, expiresAt, testDate);

      expect(cycle.cycleStart.getUTCDate()).toBe(15);
      expect(cycle.cycleStart.getUTCMonth()).toBe(8); // September (0-indexed: 8)
      expect(cycle.cycleEnd.getUTCDate()).toBe(15);
      expect(cycle.cycleEnd.getUTCMonth()).toBe(9); // October (0-indexed: 9)
    });

    it('should clamp billing cycle correctly on days 28, 29, 30, 31, leap years, and month rollovers', () => {
      // 1. Jan 31 in Feb non-leap year (2025): clamped to Feb 28
      const c1 = quotasService.calculateBillingCycle(
        new Date('2025-01-31T00:00:00Z'),
        new Date('2026-01-31T00:00:00Z'),
        new Date('2025-02-15T12:00:00Z'),
      );
      expect(c1.cycleStart.getUTCDate()).toBe(31);
      expect(c1.cycleEnd.getUTCDate()).toBe(28); // Feb 28

      // 2. Jan 31 in Feb leap year (2024): clamped to Feb 29
      const c2 = quotasService.calculateBillingCycle(
        new Date('2024-01-31T00:00:00Z'),
        new Date('2025-01-31T00:00:00Z'),
        new Date('2024-02-15T12:00:00Z'),
      );
      expect(c2.cycleEnd.getUTCDate()).toBe(29); // Feb 29

      // 3. March recovers to day 31
      const c3 = quotasService.calculateBillingCycle(
        new Date('2025-01-31T00:00:00Z'),
        new Date('2026-01-31T00:00:00Z'),
        new Date('2025-03-15T12:00:00Z'),
      );
      expect(c3.cycleStart.getUTCDate()).toBe(28);
      expect(c3.cycleEnd.getUTCDate()).toBe(31); // March 31

      // 4. Dec 28 year rollover to Jan 28
      const c4 = quotasService.calculateBillingCycle(
        new Date('2025-12-28T00:00:00Z'),
        new Date('2026-12-28T00:00:00Z'),
        new Date('2026-01-10T12:00:00Z'),
      );
      expect(c4.cycleStart.getUTCFullYear()).toBe(2025);
      expect(c4.cycleStart.getUTCDate()).toBe(28);
      expect(c4.cycleEnd.getUTCFullYear()).toBe(2026);
      expect(c4.cycleEnd.getUTCDate()).toBe(28);
    });

    it('should correctly distinguish between unlimited, zero limit, and positive quota plans', () => {
      // 1. Explicit unlimited flag
      const unlimFlagPlan = { features: { isUnlimited: true } };
      expect(quotasService.resolvePlanLimit(unlimFlagPlan).isUnlimited).toBe(true);
      expect(quotasService.resolvePlanLimit(unlimFlagPlan).cardLimit).toBeNull();

      // 2. null or omitted limit -> unlimited
      const unlimNullPlan = { features: { cardGenerationLimit: null } };
      const unlimEmptyPlan = { features: {} };
      expect(quotasService.resolvePlanLimit(unlimNullPlan).isUnlimited).toBe(true);
      expect(quotasService.resolvePlanLimit(unlimNullPlan).cardLimit).toBeNull();
      expect(quotasService.resolvePlanLimit(unlimEmptyPlan).isUnlimited).toBe(true);
      expect(quotasService.resolvePlanLimit(unlimEmptyPlan).cardLimit).toBeNull();

      // 3. ZERO limit (0) -> strictly disallows card generation (limit = 0, NOT unlimited)
      const zeroPlan = { features: { cardGenerationLimit: 0 } };
      const negativePlan = { features: { cardGenerationLimit: -10 } };
      const zeroRes = quotasService.resolvePlanLimit(zeroPlan);
      expect(zeroRes.isUnlimited).toBe(false);
      expect(zeroRes.cardLimit).toBe(0);

      const negRes = quotasService.resolvePlanLimit(negativePlan);
      expect(negRes.isUnlimited).toBe(false);
      expect(negRes.cardLimit).toBe(0);

      // 4. Positive limit -> capped number
      const limitedPlan = { features: { cardGenerationLimit: 50000 } };
      const resLimited = quotasService.resolvePlanLimit(limitedPlan);
      expect(resLimited.isUnlimited).toBe(false);
      expect(resLimited.cardLimit).toBe(50000);
    });

    it('should reject requests when tenant organization or subscription is suspended', async () => {
      // Tenant suspended
      prisma.tenant.findUnique.mockResolvedValueOnce({ id: mockTenantId, status: 'SUSPENDED' });
      await expect(
        quotasService.resolveTenantSubscription(mockTenantId),
      ).rejects.toThrow(ForbiddenException);

      // Subscription suspended
      prisma.tenant.findUnique.mockResolvedValueOnce({ id: mockTenantId, status: 'ACTIVE' });
      prisma.subscription.findFirst
        .mockResolvedValueOnce(null) // No active sub
        .mockResolvedValueOnce({ id: 'sub-susp', status: 'SUSPENDED' }); // Found suspended sub

      try {
        await quotasService.resolveTenantSubscription(mockTenantId);
      } catch (err: any) {
        expect(err.response.code).toBe('SUBSCRIPTION_SUSPENDED');
      }
    });
  });

  describe('2. Atomic Quota Enforcement & Concurrency Protection', () => {
    it('should allow batch creation within quota limits', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-active',
        tenantId: mockTenantId,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2027-10-01T00:00:00Z'),
        plan: {
          id: 'plan-pro',
          name: 'PRO',
          nameAr: 'احترافي',
          features: { cardGenerationLimit: 50000 },
        },
      });

      // 1000 cards already used out of 50000 limit
      prisma.card.count.mockResolvedValue(1000);

      const quota = await quotasService.checkAndLockQuota(prisma, mockTenantId, 500, new Date('2026-10-10'));

      expect(quota.cardLimit).toBe(50000);
      expect(quota.usedCards).toBe(1000);
      expect(quota.remainingCards).toBe(48500); // 50000 - 1000 - 500
    });

    it('should reject batch creation that exceeds quota with CARD_QUOTA_EXCEEDED error code', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-active',
        tenantId: mockTenantId,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2027-10-01T00:00:00Z'),
        plan: {
          id: 'plan-basic',
          name: 'BASIC',
          nameAr: 'أساسي',
          features: { cardGenerationLimit: 10000 },
        },
      });

      // 9,900 cards already used out of 10,000 limit
      prisma.card.count.mockResolvedValue(9900);

      // Attempting to generate 200 cards (9900 + 200 = 10100 > 10000)
      await expect(
        quotasService.checkAndLockQuota(prisma, mockTenantId, 200, new Date('2026-10-10')),
      ).rejects.toThrow(ForbiddenException);

      try {
        await quotasService.checkAndLockQuota(prisma, mockTenantId, 200, new Date('2026-10-10'));
      } catch (err: any) {
        expect(err.response.code).toBe('CARD_QUOTA_EXCEEDED');
        expect(err.response.limit).toBe(10000);
        expect(err.response.used).toBe(9900);
        expect(err.response.requested).toBe(200);
        expect(err.response.remaining).toBe(100);
      }
    });

    it('should reject batch creation on plans with ZERO quota (cardGenerationLimit: 0)', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-zero',
        tenantId: mockTenantId,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2027-10-01T00:00:00Z'),
        plan: {
          id: 'plan-free',
          name: 'FREE_NO_CARDS',
          nameAr: 'مجانية بدون كروت',
          features: { cardGenerationLimit: 0 },
        },
      });

      prisma.card.count.mockResolvedValue(0);

      // Attempting to generate even 1 card on a 0-limit plan must be rejected
      await expect(
        quotasService.checkAndLockQuota(prisma, mockTenantId, 1, new Date('2026-10-10')),
      ).rejects.toThrow(ForbiddenException);

      try {
        await quotasService.checkAndLockQuota(prisma, mockTenantId, 1, new Date('2026-10-10'));
      } catch (err: any) {
        expect(err.response.code).toBe('CARD_QUOTA_EXCEEDED');
        expect(err.response.limit).toBe(0);
        expect(err.response.remaining).toBe(0);
        expect(err.response.message).toContain('0 كرت');
      }
    });

    it('should allow batch creation on UNLIMITED plans without upper boundary', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-unlimited',
        tenantId: mockTenantId,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2027-10-01T00:00:00Z'),
        plan: {
          id: 'plan-business',
          name: 'BUSINESS_UNLIMITED',
          nameAr: 'باقة الأعمال غير المحدودة',
          features: { isUnlimited: true },
        },
      });

      prisma.card.count.mockResolvedValue(500000); // Already generated 500k cards

      const quota = await quotasService.checkAndLockQuota(prisma, mockTenantId, 10000, new Date('2026-10-10'));

      expect(quota.isUnlimited).toBe(true);
      expect(quota.cardLimit).toBeNull();
      expect(quota.remainingCards).toBeNull();
    });

    it('should reject second concurrent batch when two requests compete near quota boundary', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-active',
        tenantId: mockTenantId,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2027-10-01T00:00:00Z'),
        plan: {
          id: 'plan-basic',
          name: 'BASIC',
          features: { cardGenerationLimit: 1000 },
        },
      });

      // Initially 950 cards consumed (50 remaining)
      let currentConsumed = 950;
      prisma.card.count.mockImplementation(async () => currentConsumed);

      // Request A requests 40 cards -> succeeds
      const quotaA = await quotasService.checkAndLockQuota(prisma, mockTenantId, 40, new Date('2026-10-10'));
      expect(quotaA.remainingCards).toBe(10); // 1000 - 950 - 40 = 10

      // Request A commits and increases consumed cards in DB
      currentConsumed += 40; // Now 990 consumed

      // Request B requests 30 cards -> must be rejected because 990 + 30 = 1020 > 1000
      await expect(
        quotasService.checkAndLockQuota(prisma, mockTenantId, 30, new Date('2026-10-10')),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. CardsService - Router Synchronization & Batch State Integrity', () => {
    beforeEach(() => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-active',
        tenantId: mockTenantId,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2027-10-01T00:00:00Z'),
        plan: {
          id: 'plan-pro',
          name: 'PRO',
          nameAr: 'احترافي',
          features: { cardGenerationLimit: 50000 },
        },
      });
      prisma.card.count.mockResolvedValue(0);

      prisma.mikroTikDevice.findFirst.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main MikroTik',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'pw',
        iv: 'iv',
        authTag: 'tag',
        rosVersion: RouterOsVersion.V7,
        isOnline: true,
      });

      prisma.hotspotProfile.findFirst.mockResolvedValue({
        id: mockProfileId,
        tenantId: mockTenantId,
        name: '1Hour',
        sessionTimeout: '1h',
        price: 500,
      });

      prisma.cardBatch.create.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'BATCH-261010-001',
        totalCards: 2,
        status: CardBatchStatus.PROCESSING,
        createdAt: new Date(),
      });

      prisma.cardBatch.findUnique.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'BATCH-261010-001',
        totalCards: 2,
        price: '500',
        status: CardBatchStatus.COMPLETED,
        themePreset: 'FOOTBALL',
        createdAt: new Date(),
        device: { name: 'Main MikroTik' },
        profile: { name: '1Hour' },
      });

      prisma.card.findMany.mockResolvedValue([]);
      prisma.card.createMany.mockResolvedValue({ count: 2 });
    });

    it('should accurately set batch status COMPLETED and routerSyncStatus SYNCED when all cards provision successfully', async () => {
      const result = await cardsService.createBatch(mockTenantId, mockUserId, {
        deviceId: mockDeviceId,
        profileId: mockProfileId,
        totalCards: 2,
        syncToRouter: true,
      });

      expect(mockClient.createHotspotUser).toHaveBeenCalledTimes(2);
      expect(result.batch.status).toBe(CardBatchStatus.COMPLETED);
      expect(result.routerSyncStatus).toBe('SYNCED');
      expect(result.syncedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.syncedToRouter).toBe(true);
      expect(result.quota.limit).toBe(50000);
    });

    it('should NOT mark batch COMPLETED if router synchronization fails completely', async () => {
      // Router client throws error (e.g. connection timeout or auth failure)
      mockClient.createHotspotUser.mockRejectedValue(new Error('Connection timed out to MikroTik'));

      prisma.cardBatch.findUnique.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'BATCH-261010-001',
        totalCards: 2,
        price: '500',
        status: CardBatchStatus.FAILED,
        themePreset: 'FOOTBALL',
        createdAt: new Date(),
        device: { name: 'Main MikroTik' },
        profile: { name: '1Hour' },
      });

      const result = await cardsService.createBatch(mockTenantId, mockUserId, {
        deviceId: mockDeviceId,
        profileId: mockProfileId,
        totalCards: 2,
        syncToRouter: true,
      });

      // Verify batch was updated to FAILED in DB
      expect(prisma.cardBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: CardBatchStatus.FAILED },
        }),
      );

      expect(result.batch.status).toBe(CardBatchStatus.FAILED);
      expect(result.routerSyncStatus).toBe('FAILED');
      expect(result.syncedToRouter).toBe(false);
      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(2);
    });

    it('should handle partial synchronization without marking all as failed or completed', async () => {
      // First card succeeds, second card fails
      mockClient.createHotspotUser
        .mockResolvedValueOnce('*1')
        .mockRejectedValueOnce(new Error('Profile not found on router'));

      prisma.cardBatch.findUnique.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'BATCH-261010-001',
        totalCards: 2,
        price: '500',
        status: CardBatchStatus.COMPLETED,
        themePreset: 'FOOTBALL',
        createdAt: new Date(),
        device: { name: 'Main MikroTik' },
        profile: { name: '1Hour' },
      });

      const result = await cardsService.createBatch(mockTenantId, mockUserId, {
        deviceId: mockDeviceId,
        profileId: mockProfileId,
        totalCards: 2,
        syncToRouter: true,
      });

      expect(result.routerSyncStatus).toBe('PARTIAL');
      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.syncedToRouter).toBe(false);
    });

    it('should safely retry synchronization without duplicating existing router users', async () => {
      prisma.cardBatch.findFirst.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'BATCH-261010-001',
        status: CardBatchStatus.FAILED,
        device: {
          id: mockDeviceId,
          name: 'Main MikroTik',
          host: '192.168.88.1',
          apiPort: 8728,
          restPort: 443,
          useSsl: false,
          username: 'admin',
          passwordEncrypted: 'pw',
          iv: 'iv',
          authTag: 'tag',
          rosVersion: RouterOsVersion.V7,
          isOnline: true,
        },
        profile: { name: '1Hour' },
        cards: [
          {
            id: 'card-1',
            username: '99001',
            passwordEncrypted: 'enc',
            iv: 'iv',
            authTag: 'tag',
            timeLimit: '1h',
            dataLimitBytes: null,
            syncStatus: SyncStatus.FAILED,
          },
          {
            id: 'card-2',
            username: '99002',
            passwordEncrypted: 'enc',
            iv: 'iv',
            authTag: 'tag',
            timeLimit: '1h',
            dataLimitBytes: null,
            syncStatus: SyncStatus.FAILED,
          },
        ],
      });

      // User 1 created fresh, user 2 already existed on router (idempotent handling)
      mockClient.createHotspotUser
        .mockResolvedValueOnce('*1')
        .mockRejectedValueOnce(new Error('failure: already have user with this name'));

      prisma.card.count.mockResolvedValue(0); // 0 remaining unsynced after retry

      const retryRes = await cardsService.syncBatchToRouter(mockTenantId, mockBatchId);

      expect(retryRes.success).toBe(true);
      expect(retryRes.syncedCount).toBe(2); // Both recognized as synced
      expect(retryRes.remainingUnsynced).toBe(0);
      expect(retryRes.batchStatus).toBe(CardBatchStatus.COMPLETED);

      // Verify batch was updated to COMPLETED
      expect(prisma.cardBatch.update).toHaveBeenCalledWith({
        where: { id: mockBatchId },
        data: { status: CardBatchStatus.COMPLETED },
      });
    });

    it('should mark batch COMPLETED and routerSyncStatus PENDING_OFFLINE with failedCount 0 when device is offline', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Offline MikroTik',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'pw',
        iv: 'iv',
        authTag: 'tag',
        rosVersion: RouterOsVersion.V7,
        isOnline: false, // Offline!
      });

      prisma.cardBatch.findUnique.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'BATCH-261010-001',
        totalCards: 2,
        price: '500',
        status: CardBatchStatus.COMPLETED,
        themePreset: 'FOOTBALL',
        createdAt: new Date(),
        device: { name: 'Offline MikroTik' },
        profile: { name: '1Hour' },
      });

      const result = await cardsService.createBatch(mockTenantId, mockUserId, {
        deviceId: mockDeviceId,
        profileId: mockProfileId,
        totalCards: 2,
        syncToRouter: true,
      });

      expect(mockClient.createHotspotUser).not.toHaveBeenCalled();
      expect(result.batch.status).toBe(CardBatchStatus.COMPLETED);
      expect(result.routerSyncStatus).toBe('PENDING_OFFLINE');
      expect(result.syncedToRouter).toBe(false); // Strictly false!
      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(0); // Not marked as failed, pending offline
    });

    it('should strictly isolate tenants and reject attempts to use another tenant device or profile', async () => {
      // Device belongs to another tenant
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      await expect(
        cardsService.createBatch(mockOtherTenantId, mockUserId, {
          deviceId: mockDeviceId,
          profileId: mockProfileId,
          totalCards: 10,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
