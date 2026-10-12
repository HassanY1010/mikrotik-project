import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '@prisma/client';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    const where: Prisma.SubscriptionPlanWhereInput = {};
    if (!includeInactive) {
      where.isActive = true;
    }

    const plans = await this.prisma.subscriptionPlan.findMany({
      where,
      include: {
        _count: {
          select: {
            subscriptions: {
              where: { status: 'ACTIVE' },
            },
          },
        },
      },
      orderBy: { priceMonthly: 'asc' },
    });

    return plans.map((p) => {
      const features = (p.features as Record<string, any>) || {};
      const cardLimit = features.cardGenerationLimit ?? features.cardLimit ?? features.maxCards;
      const isUnlimited = features.isUnlimited === true || cardLimit === null || cardLimit === undefined;

      return {
        id: p.id,
        name: p.name,
        nameAr: p.nameAr,
        description: p.description,
        maxRouters: p.maxRouters,
        priceMonthly: Number(p.priceMonthly),
        priceYearly: Number(p.priceYearly),
        features,
        cardLimit: isUnlimited ? null : Number(cardLimit),
        isUnlimited,
        isActive: p.isActive,
        activeSubscribersCount: p._count.subscriptions,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });
  }

  async findById(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Subscription plan with ID '${id}' was not found`);
    }

    const features = (plan.features as Record<string, any>) || {};
    const cardLimit = features.cardGenerationLimit ?? features.cardLimit ?? features.maxCards;
    const isUnlimited = features.isUnlimited === true || cardLimit === null || cardLimit === undefined;

    return {
      id: plan.id,
      name: plan.name,
      nameAr: plan.nameAr,
      description: plan.description,
      maxRouters: plan.maxRouters,
      priceMonthly: Number(plan.priceMonthly),
      priceYearly: Number(plan.priceYearly),
      features,
      cardLimit: isUnlimited ? null : Number(cardLimit),
      isUnlimited,
      isActive: plan.isActive,
      totalSubscribersCount: plan._count?.subscriptions ?? 0,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  async create(dto: CreatePlanDto, adminId: string) {
    const normalizedName = dto.name.trim().toUpperCase();

    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { name: normalizedName },
    });
    if (existing) {
      throw new ConflictException(`A subscription plan with code '${normalizedName}' already exists`);
    }

    // Ensure features payload respects explicit quota policy
    const features = dto.features || {};
    if (features.isUnlimited === true) {
      features.cardGenerationLimit = null;
    } else if (features.cardGenerationLimit !== undefined) {
      const num = Number(features.cardGenerationLimit);
      features.cardGenerationLimit = isNaN(num) || num <= 0 ? 0 : Math.floor(num);
      features.isUnlimited = false;
    }

    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        name: normalizedName,
        nameAr: dto.nameAr.trim(),
        description: dto.description?.trim(),
        maxRouters: dto.maxRouters,
        priceMonthly: new Prisma.Decimal(dto.priceMonthly),
        priceYearly: new Prisma.Decimal(dto.priceYearly),
        features,
        isActive: dto.isActive ?? true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'plan:created',
        entity: 'SubscriptionPlan',
        entityId: plan.id,
        newValues: {
          name: plan.name,
          nameAr: plan.nameAr,
          priceMonthly: dto.priceMonthly,
          priceYearly: dto.priceYearly,
          maxRouters: dto.maxRouters,
          features,
        },
      },
    });

    return this.findById(plan.id);
  }

  async update(id: string, dto: UpdatePlanDto, adminId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Subscription plan with ID '${id}' was not found`);
    }

    const data: Prisma.SubscriptionPlanUpdateInput = {};

    if (dto.name && dto.name.trim().toUpperCase() !== plan.name) {
      const newName = dto.name.trim().toUpperCase();
      const existing = await this.prisma.subscriptionPlan.findUnique({ where: { name: newName } });
      if (existing) {
        throw new ConflictException(`A plan with code '${newName}' already exists`);
      }
      data.name = newName;
    }

    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() ?? null;
    if (dto.maxRouters !== undefined) data.maxRouters = dto.maxRouters;
    if (dto.priceMonthly !== undefined) data.priceMonthly = new Prisma.Decimal(dto.priceMonthly);
    if (dto.priceYearly !== undefined) data.priceYearly = new Prisma.Decimal(dto.priceYearly);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.features !== undefined) {
      const mergedFeatures = { ...((plan.features as Record<string, any>) || {}), ...dto.features };
      if (mergedFeatures.isUnlimited === true) {
        mergedFeatures.cardGenerationLimit = null;
      } else if (mergedFeatures.cardGenerationLimit !== undefined && mergedFeatures.cardGenerationLimit !== null) {
        const num = Number(mergedFeatures.cardGenerationLimit);
        mergedFeatures.cardGenerationLimit = isNaN(num) || num <= 0 ? 0 : Math.floor(num);
        mergedFeatures.isUnlimited = false;
      }
      data.features = mergedFeatures;
    }

    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'plan:updated',
        entity: 'SubscriptionPlan',
        entityId: id,
        oldValues: {
          name: plan.name,
          nameAr: plan.nameAr,
          priceMonthly: Number(plan.priceMonthly),
          maxRouters: plan.maxRouters,
          isActive: plan.isActive,
        },
        newValues: {
          name: updated.name,
          nameAr: updated.nameAr,
          priceMonthly: Number(updated.priceMonthly),
          maxRouters: updated.maxRouters,
          isActive: updated.isActive,
        },
      },
    });

    return this.findById(id);
  }

  async toggleActive(id: string, adminId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Subscription plan with ID '${id}' was not found`);
    }

    const newActiveState = !plan.isActive;

    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: newActiveState },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'plan:status_toggled',
        entity: 'SubscriptionPlan',
        entityId: id,
        oldValues: { isActive: plan.isActive },
        newValues: { isActive: newActiveState },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
      message: updated.isActive ? 'تم تفعيل الخطة بنجاح' : 'تم تعطيل الخطة بنجاح',
    };
  }
}
