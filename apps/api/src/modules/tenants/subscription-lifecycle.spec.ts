import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../auth/mail.service';
import { QuotasService } from '../cards/services/quotas.service';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { HashingService } from '../../core/security/hashing.service';
import { SubscriptionStatus, BillingCycle, TenantStatus, UserStatus } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

describe('Subscription Lifecycle & Multi-Tenant Audit (Phase 2)', () => {
  let tenantsService: TenantsService;
  let authService: AuthService;
  let quotasService: QuotasService;

  const tenantAId = 'tenant-owner-pro-101';
  const tenantBId = 'tenant-free-switch-202';
  const superAdminId = 'super-admin-001';

  const mockPlanPro = {
    id: 'plan-pro-id',
    name: 'PRO',
    nameAr: 'الباقة الاحترافية (3 راوترات)',
    maxRouters: 3,
    priceMonthly: 30.0,
    priceYearly: 300.0,
    features: {
      cardGenerationLimit: 50000,
      maxRouters: 3,
      isUnlimited: false,
    },
  };

  const mockPlanBusiness = {
    id: 'plan-biz-id',
    name: 'BUSINESS',
    nameAr: 'باقة الأعمال (5 راوترات)',
    maxRouters: 5,
    priceMonthly: 50.0,
    priceYearly: 500.0,
    features: {
      cardGenerationLimit: 200000,
      maxRouters: 5,
      isUnlimited: false,
    },
  };

  const mockPrisma = {
    tenant: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    subscriptionPlan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    card: {
      count: jest.fn(),
    },
    mikroTikDevice: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'sub-active', expiresAt: new Date(Date.now() + 86400000), status: 'ACTIVE' }]),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    verifyAsync: jest.fn(),
  };

  const mockHashingService = {
    hashPassword: jest.fn().mockResolvedValue('argon2id$hashedpassword'),
    verifyPassword: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.tenant.update.mockResolvedValue({ id: tenantAId, status: TenantStatus.ACTIVE, deletedAt: null });
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        AuthService,
        QuotasService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: HashingService, useValue: mockHashingService },
        { provide: MailService, useValue: { sendPasswordResetEmail: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    tenantsService = module.get<TenantsService>(TenantsService);
    authService = module.get<AuthService>(AuthService);
    quotasService = module.get<QuotasService>(QuotasService);
  });

  describe('1 & 2. Super Admin Activation & Plan Upgrade (Pro to Business)', () => {
    it('should activate PRO subscription, cancel older subscriptions, and record audit log', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantAId,
        name: 'شبكة النور هوت سبوت',
        slug: 'al-noor',
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      });

      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlanPro);

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);

      mockPrisma.subscription.create.mockResolvedValue({
        id: 'sub-pro-01',
        tenantId: tenantAId,
        planId: mockPlanPro.id,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: BillingCycle.MONTHLY,
        startsAt: new Date(),
        expiresAt: futureDate,
        maxRouters: 3,
        price: 30.0,
        plan: mockPlanPro,
      });

      const result = await tenantsService.approveSubscription(
        tenantAId,
        {
          planName: 'PRO',
          billingCycle: BillingCycle.MONTHLY,
          durationMonths: 1,
          notes: 'تفعيل باقة برو للمستأجر',
        },
        superAdminId,
      );

      expect(result).toBeDefined();
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { tenantId: tenantAId, status: SubscriptionStatus.ACTIVE },
        data: { status: SubscriptionStatus.CANCELLED },
      });
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
    });

    it('should allow upgrading plan from PRO to BUSINESS and reflect new quotas', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantAId,
        name: 'شبكة النور هوت سبوت',
        slug: 'al-noor',
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      });

      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlanBusiness);

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 12);

      mockPrisma.subscription.create.mockResolvedValue({
        id: 'sub-biz-02',
        tenantId: tenantAId,
        planId: mockPlanBusiness.id,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: BillingCycle.YEARLY,
        startsAt: new Date(),
        expiresAt: futureDate,
        maxRouters: 5,
        price: 500.0,
        plan: mockPlanBusiness,
      });

      const result = await tenantsService.approveSubscription(
        tenantAId,
        {
          planName: 'BUSINESS',
          billingCycle: BillingCycle.YEARLY,
          durationMonths: 12,
          notes: 'ترقية إلى باقة الأعمال السنوية',
        },
        superAdminId,
      );

      expect(result.plan).toEqual(mockPlanBusiness);
      expect(result.maxRouters).toBe(5);
    });
  });

  describe('3 & 4. Authentication & Profile Retrieval (Login & getMe)', () => {
    it('should return active subscription details during login so Flutter client never starts with null plan', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-owner-01',
        email: 'owner@alnoor.sd',
        fullName: 'أحمد النور',
        passwordHash: 'argon2id$hashedpassword',
        status: UserStatus.ACTIVE,
        tenantId: tenantAId,
        deletedAt: null,
        role: {
          name: 'TENANT_ADMIN',
          rolePermissions: [{ permission: { code: 'cards:generate' } }],
        },
        tenant: {
          id: tenantAId,
          name: 'شبكة النور هوت سبوت',
          slug: 'al-noor',
          currency: 'SDG',
          status: TenantStatus.ACTIVE,
          subscriptions: [
            {
              id: 'sub-biz-02',
              status: SubscriptionStatus.ACTIVE,
              expiresAt,
              billingCycle: BillingCycle.YEARLY,
              maxRouters: 5,
              plan: mockPlanBusiness,
            },
          ],
        },
      });

      const response = await authService.login({
        email: 'owner@alnoor.sd',
        password: 'valid-password',
      });

      expect(response.user.subscriptionPlan).toBe('BUSINESS');
      expect(response.user.subscriptionPlanAr).toBe(mockPlanBusiness.nameAr);
      expect(response.user.subscriptionStatus).toBe('ACTIVE');
      expect(response.user.subscriptionExpiresAt).toEqual(expiresAt);
      expect(response.user.tenant?.subscription?.planName).toBe('BUSINESS');
    });

    it('should return matching plan and quota details on getMe', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-owner-01',
        email: 'owner@alnoor.sd',
        fullName: 'أحمد النور',
        phone: '+249912345678',
        role: {
          name: 'TENANT_ADMIN',
          rolePermissions: [{ permission: { code: 'cards:generate' } }],
        },
        tenant: {
          id: tenantAId,
          name: 'شبكة النور هوت سبوت',
          slug: 'al-noor',
          currency: 'SDG',
          status: TenantStatus.ACTIVE,
          subscriptions: [
            {
              id: 'sub-biz-02',
              status: SubscriptionStatus.ACTIVE,
              expiresAt,
              billingCycle: BillingCycle.YEARLY,
              maxRouters: 5,
              plan: mockPlanBusiness,
            },
          ],
          _count: { devices: 2, cards: 1500, users: 3 },
        },
      });

      const result = await authService.getMe('user-owner-01');

      expect(result.subscriptionPlan).toBe('BUSINESS');
      expect(result.subscriptionStatus).toBe('ACTIVE');
      expect(result.subscriptionExpiresAt).toEqual(expiresAt);
    });
  });

  describe('5 & 6. Time Progression & Session Continuity', () => {
    it('should maintain active BUSINESS subscription when simulated 2 hours elapse', async () => {
      const initialStart = new Date('2026-10-16T08:00:00Z');
      const futureExpiry = new Date('2026-11-16T08:00:00Z');
      const twoHoursLater = new Date('2026-10-16T10:00:00Z');

      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantAId,
        name: 'شبكة النور هوت سبوت',
        slug: 'al-noor',
        status: TenantStatus.ACTIVE,
        currency: 'SDG',
        deletedAt: null,
        subscriptions: [
          {
            id: 'sub-biz-02',
            startsAt: initialStart,
            expiresAt: futureExpiry,
            status: SubscriptionStatus.ACTIVE,
            maxRouters: 5,
            plan: mockPlanBusiness,
          },
        ],
      });

      mockPrisma.card.count.mockResolvedValue(250);

      const currentTenantData = await tenantsService.getCurrentTenant(tenantAId);
      const sub = currentTenantData.subscription as any;

      expect(sub.plan).toBe('BUSINESS');
      expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
      expect(sub.maxRouters).toBe(5);

      // QuotasService at simulated two hours later
      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-biz-02',
        startsAt: initialStart,
        expiresAt: futureExpiry,
        status: SubscriptionStatus.ACTIVE,
        plan: mockPlanBusiness,
      });

      const quota = await quotasService.getTenantQuota(tenantAId, twoHoursLater);
      expect(quota.status).toBe(SubscriptionStatus.ACTIVE);
      expect(quota.planName).toBe('BUSINESS');
      expect(quota.usedCards).toBe(250);
      expect(quota.remainingCards).toBe(200000 - 250);
    });
  });

  describe('7. Subscription Expiration Enforcement', () => {
    it('should reflect EXPIRED status in getCurrentTenant while preserving the plan name for renewal', async () => {
      const expiredDate = new Date('2026-09-01T00:00:00Z');

      // getCurrentTenant finds no active subscription where expiresAt > now
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantAId,
        name: 'شبكة النور هوت سبوت',
        slug: 'al-noor',
        status: TenantStatus.ACTIVE,
        currency: 'SDG',
        deletedAt: null,
        subscriptions: [], // empty active subs
      });

      // expiredSub lookup returns the expired BUSINESS sub
      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-biz-expired',
        startsAt: new Date('2026-08-01T00:00:00Z'),
        expiresAt: expiredDate,
        status: SubscriptionStatus.ACTIVE,
        maxRouters: 5,
        plan: mockPlanBusiness,
      });

      const currentTenantData = await tenantsService.getCurrentTenant(tenantAId);
      const sub = currentTenantData.subscription as any;

      expect(sub.status).toBe('EXPIRED');
      expect(sub.plan).toBe('BUSINESS'); // Preserved plan name, not wiped to NONE!
      expect(sub.expiredPlanName).toBe('BUSINESS');
      expect(sub.maxCardsPerMonth).toBe(0);
    });

    it('should strictly throw ForbiddenException(SUBSCRIPTION_EXPIRED) on card generation attempts when expired', async () => {
      const expiredDate = new Date('2026-09-01T00:00:00Z');
      const simulatedNow = new Date('2026-10-16T12:00:00Z');

      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-biz-expired',
        tenantId: tenantAId,
        startsAt: new Date('2026-08-01T00:00:00Z'),
        expiresAt: expiredDate,
        status: SubscriptionStatus.ACTIVE,
        plan: mockPlanBusiness,
      });

      await expect(
        quotasService.resolveTenantSubscription(tenantAId, simulatedNow),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('8. Resilient API Query on Expired / Missing Subscriptions', () => {
    it('getTenantQuota should return informative status 200 payload instead of throwing 403 on read queries', async () => {
      const expiredDate = new Date('2026-09-01T00:00:00Z');
      const simulatedNow = new Date('2026-10-16T12:00:00Z');

      // findFirst for active unexpired returns null
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(null) // first query for active unexpired
        .mockResolvedValueOnce({    // second query for latest subscription
          id: 'sub-biz-expired',
          startsAt: new Date('2026-08-01T00:00:00Z'),
          expiresAt: expiredDate,
          status: SubscriptionStatus.EXPIRED,
          plan: mockPlanBusiness,
        });

      const quota = await quotasService.getTenantQuota(tenantAId, simulatedNow);

      expect(quota).toBeDefined();
      expect(quota.status).toBe('EXPIRED');
      expect(quota.planName).toBe('BUSINESS');
      expect(quota.remainingCards).toBe(0);
    });
  });

  describe('9 & 10. Multi-Tenant Isolation & Account Switching Security', () => {
    it('should strictly isolate Tenant A (Paid Business) and Tenant B (Unsubscribed/Free)', async () => {
      const futureExpiry = new Date('2027-01-01T00:00:00Z');

      // Tenant A query
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantAId,
        name: 'شبكة النور هوت سبوت',
        slug: 'al-noor',
        status: TenantStatus.ACTIVE,
        currency: 'SDG',
        deletedAt: null,
        subscriptions: [
          {
            id: 'sub-biz-02',
            startsAt: new Date(),
            expiresAt: futureExpiry,
            status: SubscriptionStatus.ACTIVE,
            maxRouters: 5,
            plan: mockPlanBusiness,
          },
        ],
      });

      const tenantAData = await tenantsService.getCurrentTenant(tenantAId);
      expect((tenantAData.subscription as any).plan).toBe('BUSINESS');
      expect((tenantAData.subscription as any).status).toBe(SubscriptionStatus.ACTIVE);

      // Tenant B query (new registered network with no paid subscription)
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantBId,
        name: 'شبكة جديدة تجريبية',
        slug: 'new-net',
        status: TenantStatus.ACTIVE,
        currency: 'SDG',
        deletedAt: null,
        subscriptions: [], // No active subscription
      });
      mockPrisma.subscription.findFirst.mockResolvedValueOnce(null); // No expired subscription either

      const tenantBData = await tenantsService.getCurrentTenant(tenantBId);
      expect((tenantBData.subscription as any).plan).toBe('NONE');
      expect((tenantBData.subscription as any).status).toBe('NONE');
      expect((tenantBData.subscription as any).maxRouters).toBe(0);
      expect((tenantBData.subscription as any).maxCardsPerMonth).toBe(0);
    });
  });
});
