import { Test, TestingModule } from '@nestjs/testing';
import { PlansService } from './plans.service';
import { PrismaService } from '../../core/database/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('PlansService', () => {
  let service: PlansService;

  const mockPrisma = {
    subscriptionPlan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
  });

  describe('findAll', () => {
    it('returns all plans formatted', async () => {
      mockPrisma.subscriptionPlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          name: 'BASIC',
          nameAr: 'الأساسية',
          description: 'Basic plan',
          maxRouters: 1,
          priceMonthly: 10,
          priceYearly: 100,
          features: { cardGenerationLimit: 500, isUnlimited: false },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { subscriptions: 5 },
        },
      ]);

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].cardLimit).toBe(500);
      expect(result[0].isUnlimited).toBe(false);
      expect(result[0].activeSubscribersCount).toBe(5);
    });

    it('handles explicit unlimited plans correctly', async () => {
      mockPrisma.subscriptionPlan.findMany.mockResolvedValue([
        {
          id: 'plan-2',
          name: 'ENTERPRISE',
          nameAr: 'المؤسسات',
          description: 'Unlimited',
          maxRouters: 10,
          priceMonthly: 100,
          priceYearly: 1000,
          features: { isUnlimited: true },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { subscriptions: 2 },
        },
      ]);

      const result = await service.findAll();
      expect(result[0].isUnlimited).toBe(true);
      expect(result[0].cardLimit).toBeNull();
    });
  });

  describe('create', () => {
    it('throws ConflictException if plan with same name already exists', async () => {
      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(
          {
            name: 'basic',
            nameAr: 'الأساسية',
            maxRouters: 1,
            priceMonthly: 10,
            priceYearly: 100,
          },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a new plan with validated limits and logs audit trail', async () => {
      mockPrisma.subscriptionPlan.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.name) return null;
        if (where.id === 'new-plan') {
          return {
            id: 'new-plan',
            name: 'PRO',
            nameAr: 'احترافي',
            description: 'Pro plan',
            maxRouters: 3,
            priceMonthly: 25,
            priceYearly: 250,
            features: { cardGenerationLimit: 2000, isUnlimited: false },
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      });
      mockPrisma.subscriptionPlan.create.mockResolvedValue({
        id: 'new-plan',
        name: 'PRO',
        nameAr: 'احترافي',
        description: 'Pro plan',
        maxRouters: 3,
        priceMonthly: 25,
        priceYearly: 250,
        features: { cardGenerationLimit: 2000, isUnlimited: false },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plan = await service.create(
        {
          name: 'pro',
          nameAr: 'احترافي',
          description: 'Pro plan',
          maxRouters: 3,
          priceMonthly: 25,
          priceYearly: 250,
          features: {
            cardGenerationLimit: 2000,
            isUnlimited: false,
          },
        },
        'admin-1',
      );

      expect(plan.id).toBe('new-plan');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'plan:created',
            entity: 'SubscriptionPlan',
            entityId: 'new-plan',
          }),
        }),
      );
    });
  });

  describe('toggleActive', () => {
    it('throws NotFoundException if plan does not exist', async () => {
      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(null);

      await expect(service.toggleActive('non-existent', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('toggles plan active status and logs audit', async () => {
      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'BASIC',
        isActive: true,
        priceMonthly: 10,
        priceYearly: 100,
        features: {},
      });
      mockPrisma.subscriptionPlan.update.mockResolvedValue({
        id: 'plan-1',
        name: 'BASIC',
        isActive: false,
        priceMonthly: 10,
        priceYearly: 100,
        features: {},
      });

      const updated = await service.toggleActive('plan-1', 'admin-1');
      expect(updated.isActive).toBe(false);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'plan:status_toggled',
            newValues: { isActive: false },
          }),
        }),
      );
    });
  });
});
