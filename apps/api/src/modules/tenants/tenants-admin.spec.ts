import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SubscriptionStatus, BillingCycle, TenantStatus } from '@prisma/client';

describe('TenantsService - Super Admin & Subscriptions', () => {
  let service: TenantsService;

  const mockPrisma = {
    tenant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    subscriptionPlan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    card: {
      count: jest.fn(),
    },
    mikroTikDevice: {
      count: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  describe('getPlatformOverview', () => {
    it('returns accurate platform metrics from database', async () => {
      mockPrisma.tenant.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8)  // active
        .mockResolvedValueOnce(2)  // suspended
        .mockResolvedValue(0);     // pending & subsequent calls

      mockPrisma.subscription.count
        .mockResolvedValueOnce(7)  // active
        .mockResolvedValueOnce(3);  // expired

      mockPrisma.card.count.mockResolvedValue(15420); // cardsThisMonth

      mockPrisma.mikroTikDevice.count
        .mockResolvedValueOnce(25) // total
        .mockResolvedValueOnce(20); // online

      mockPrisma.subscriptionPlan.findMany.mockResolvedValue([
        {
          id: 'p-1',
          name: 'BASIC',
          nameAr: 'الأساسية',
          _count: { subscriptions: 5 },
        },
        {
          id: 'p-2',
          name: 'PRO',
          nameAr: 'احترافي',
          _count: { subscriptions: 2 },
        },
      ]);

      mockPrisma.tenant.findMany.mockResolvedValue([
        {
          id: 't-1',
          name: 'Network One',
          slug: 'net-one',
          status: 'ACTIVE',
          createdAt: new Date(),
          subscriptions: [
            {
              id: 's-1',
              status: 'ACTIVE',
              expiresAt: new Date(),
              plan: { name: 'PRO', nameAr: 'احترافي' },
            },
          ],
        },
      ]);

      const overview: any = await service.getPlatformOverview();

      expect(overview.tenants.total).toBe(10);
      expect(overview.tenants.active).toBe(8);
      expect(overview.tenants.suspended).toBe(2);
      expect(overview.subscriptions.active).toBe(7);
      expect(overview.cards.consumedThisMonth).toBe(15420);
      expect(overview.devices.online).toBe(20);
      expect(overview.devices.offline).toBe(5);
      expect(overview.plansBreakdown).toHaveLength(2);
      expect(overview.recentTenants).toHaveLength(1);
    });
  });

  describe('approveSubscription', () => {
    it('cancels any prior active subscriptions to avoid conflicting states', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', name: 'Al-Madina Net' });
      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'PRO',
        maxRouters: 5,
        priceMonthly: 50,
        priceYearly: 500,
      });

      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.subscription.create.mockResolvedValue({
        id: 'sub-new',
        tenantId: 'tenant-1',
        planId: 'plan-1',
        status: SubscriptionStatus.ACTIVE,
        billingCycle: BillingCycle.MONTHLY,
        maxRouters: 5,
        price: 50,
        plan: { name: 'PRO' },
      });
      mockPrisma.tenant.update.mockResolvedValue({ id: 'tenant-1', status: 'ACTIVE' });

      const result = await service.approveSubscription(
        'tenant-1',
        {
          planName: 'PRO',
          billingCycle: BillingCycle.MONTHLY,
          durationMonths: 1,
          notes: 'Cash payment confirmed',
        },
        'super-admin-id',
      );

      // Verify prior active subscriptions were superseded
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          status: SubscriptionStatus.ACTIVE,
        },
        data: {
          status: SubscriptionStatus.CANCELLED,
        },
      });

      // Verify new subscription was created
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
      expect(result.id).toBe('sub-new');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('renewSubscription', () => {
    it('extends subscription expiresAt and logs audit action', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        tenantId: 't-1',
        expiresAt: futureDate,
        status: SubscriptionStatus.ACTIVE,
        plan: { id: 'p-1', name: 'PRO' },
        tenant: { id: 't-1' },
      });

      mockPrisma.subscription.update.mockImplementation(({ data }) => ({
        id: 'sub-1',
        expiresAt: data.expiresAt,
        status: data.status,
        price: 50,
        plan: { id: 'p-1', name: 'PRO' },
      }));
      mockPrisma.tenant.update.mockResolvedValue({ id: 't-1', status: TenantStatus.ACTIVE });

      const renewed = await service.renewSubscription('sub-1', 2, 'super-admin-id', 'Renewed 2 months');

      expect(renewed).toBeDefined();
      expect(mockPrisma.subscription.update).toHaveBeenCalled();
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { status: TenantStatus.ACTIVE },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'subscription:renewed',
            entityId: 'sub-1',
          }),
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('records reason in audit log and updates tenant status', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'Al-Madina Net',
        status: TenantStatus.ACTIVE,
      });
      mockPrisma.tenant.update.mockResolvedValue({
        id: 'tenant-1',
        status: TenantStatus.SUSPENDED,
      });

      const updated = await service.updateStatus(
        'tenant-1',
        { status: TenantStatus.SUSPENDED, reason: 'Late subscription payment' },
        'super-admin-id',
      );

      expect(updated.status).toBe(TenantStatus.SUSPENDED);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'tenant:status_changed',
            entity: 'Tenant',
            entityId: 'tenant-1',
            oldValues: { status: TenantStatus.ACTIVE },
            newValues: { status: TenantStatus.SUSPENDED, reason: 'Late subscription payment' },
          }),
        }),
      );
    });
  });

  describe('updateSubscriptionStatus', () => {
    it('updates status and logs audit entry', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        tenantId: 't-1',
        status: SubscriptionStatus.ACTIVE,
      });

      mockPrisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        status: SubscriptionStatus.CANCELLED,
        price: 50,
        plan: {},
      });

      const updated = await service.updateSubscriptionStatus(
        'sub-1',
        SubscriptionStatus.CANCELLED,
        'super-admin-id',
        'Non-payment',
      );

      expect(updated.status).toBe(SubscriptionStatus.CANCELLED);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'subscription:status_changed_cancelled',
          }),
        }),
      );
    });

    it('does not reactivate a SUSPENDED tenant when renewing subscription', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-suspended-tenant',
        tenantId: 't-suspended',
        expiresAt: futureDate,
        status: SubscriptionStatus.ACTIVE,
        plan: { id: 'p-1', name: 'PRO' },
        tenant: { id: 't-suspended', status: TenantStatus.SUSPENDED },
      });

      mockPrisma.subscription.update.mockImplementation(({ data }) => ({
        id: 'sub-suspended-tenant',
        expiresAt: data.expiresAt,
        status: data.status,
        price: 50,
        plan: { id: 'p-1', name: 'PRO' },
      }));

      await service.renewSubscription('sub-suspended-tenant', 1, 'super-admin-id');

      // Ensure tenant.update with status: ACTIVE was NOT called
      expect(mockPrisma.tenant.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't-suspended' },
          data: { status: TenantStatus.ACTIVE },
        }),
      );
    });
  });
});
