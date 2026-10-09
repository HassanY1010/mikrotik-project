import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SubscriptionStatus, BillingCycle } from '@prisma/client';
import type { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import type { ApproveSubscriptionDto } from './dto/approve-subscription.dto';
import type { UpdateCurrentTenantDto } from './dto/update-current-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Record<string, unknown>[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      include: {
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          include: { plan: true },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            devices: { where: { deletedAt: null } },
            cards: true,
            users: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      currency: t.currency,
      contactEmail: t.contactEmail,
      phone: t.phone,
      createdAt: t.createdAt,
      activeSubscription: t.subscriptions[0]
        ? {
            planName: t.subscriptions[0].plan.name,
            planNameAr: t.subscriptions[0].plan.nameAr,
            maxRouters: t.subscriptions[0].maxRouters,
            expiresAt: t.subscriptions[0].expiresAt,
            billingCycle: t.subscriptions[0].billingCycle,
          }
        : null,
      counts: t._count,
    }));
  }

  async findById(id: string): Promise<Record<string, unknown>> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        },
        users: {
          where: { deletedAt: null },
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            status: true,
            role: { select: { name: true } },
          },
        },
        devices: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            host: true,
            status: true,
            rosVersion: true,
            isOnline: true,
          },
        },
        _count: {
          select: {
            cards: true,
            cardBatches: true,
            saleTransactions: true,
          },
        },
      },
    });

    if (!tenant || tenant.deletedAt !== null) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }


  async updateStatus(
    id: string,
    dto: UpdateTenantStatusDto,
    superAdminId: string,
  ): Promise<Record<string, unknown>> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: id,
        userId: superAdminId,
        action: 'tenant:status_changed',
        entity: 'Tenant',
        entityId: id,
        oldValues: { status: tenant.status },
        newValues: { status: dto.status },
      },
    });

    return updated;
  }

  async approveSubscription(
    tenantId: string,
    dto: ApproveSubscriptionDto,
    superAdminId: string,
  ): Promise<Record<string, unknown>> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { name: dto.planName.toUpperCase() },
    });
    if (!plan) {
      throw new NotFoundException(`Plan '${dto.planName}' not found`);
    }

    const durationMonths =
      dto.durationMonths ?? (dto.billingCycle === BillingCycle.YEARLY ? 12 : 1);

    const startsAt = new Date();
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

    const price = dto.billingCycle === BillingCycle.YEARLY ? plan.priceYearly : plan.priceMonthly;

    // Create new approved subscription
    const subscription = await this.prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: dto.billingCycle,
        startsAt,
        expiresAt,
        maxRouters: plan.maxRouters,
        price,
        approvedBy: superAdminId,
        notes: dto.notes,
      },
      include: { plan: true },
    });

    // Ensure tenant is active
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE' },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: superAdminId,
        action: 'subscription:manually_approved',
        entity: 'Subscription',
        entityId: subscription.id,
        newValues: {
          plan: plan.name,
          billingCycle: dto.billingCycle,
          expiresAt,
          notes: dto.notes,
        },
      },
    });

    return subscription;
  }

  async getCurrentTenant(tenantId?: string | null): Promise<Record<string, unknown>> {
    let resolvedId = tenantId;
    if (!resolvedId) {
      // Fallback: pick the first active tenant
      const firstActive = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!firstActive) {
        throw new NotFoundException('No active tenant found');
      }
      resolvedId = firstActive.id;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: resolvedId },
      include: {
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          include: { plan: true },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!tenant || tenant.deletedAt !== null) {
      throw new NotFoundException('Tenant organization not found');
    }

    const sub = tenant.subscriptions[0];

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      currency: tenant.currency || 'SDG',
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.phone || '',
      phone: tenant.phone || '',
      address: tenant.address || '',
      logoUrl: tenant.logoUrl,
      walletBalance: Number(tenant.walletBalance ?? 0),
      loyaltyPoints: tenant.loyaltyPoints ?? 0,
      allowAdminCards: tenant.allowAdminCards ?? false,
      subscription: sub
        ? {
            plan: sub.plan.name,
            planNameAr: sub.plan.nameAr,
            maxRouters: sub.maxRouters,
            maxCardsPerMonth: 100000,
            status: sub.status,
            expiresAt: sub.expiresAt.toISOString(),
          }
        : {
            plan: 'FREE',
            planNameAr: 'الخطة المجانية',
            maxRouters: 1,
            maxCardsPerMonth: 5000,
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          },
    };
  }

  async getWallet(tenantId?: string | null) {
    const tenantData = await this.getCurrentTenant(tenantId);
    const resolvedId = tenantData.id as string;

    const recentTransactions = await this.prisma.tenantWalletTransaction.findMany({
      where: { tenantId: resolvedId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      walletBalance: (tenantData.walletBalance as number) ?? 0,
      loyaltyPoints: (tenantData.loyaltyPoints as number) ?? 0,
      allowAdminCards: (tenantData.allowAdminCards as boolean) ?? false,
      currency: (tenantData.currency as string) || 'SDG',
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        amount: Number(t.amount),
        type: t.type,
        pointsDelta: t.pointsDelta,
        balanceAfter: Number(t.balanceAfter),
        reference: t.reference,
        notes: t.notes,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  async rechargeWallet(
    tenantId: string | null | undefined,
    amount: number,
    notes?: string,
    pointsDelta = 0,
    userId?: string,
  ) {
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ الشحن يجب أن يكون رقماً أكبر من الصفر');
    }
    if (amount > 10_000_000) {
      throw new BadRequestException('الحد الأقصى لعملية الشحن الواحدة هو 10,000,000 SDG');
    }

    let resolvedId = tenantId;
    if (!resolvedId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!first) throw new NotFoundException('No active tenant found');
      resolvedId = first.id;
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: resolvedId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const newBalance = Number(tenant.walletBalance) + amount;
    const newPoints = (tenant.loyaltyPoints || 0) + (pointsDelta || 0);

    const [updated, tx] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: resolvedId },
        data: {
          walletBalance: newBalance,
          loyaltyPoints: newPoints,
        },
      }),
      this.prisma.tenantWalletTransaction.create({
        data: {
          tenantId: resolvedId,
          amount,
          type: 'RECHARGE',
          pointsDelta: pointsDelta || 0,
          balanceAfter: newBalance,
          notes: notes?.trim() || 'شحن رصيد إضافي للمحفظة السحابية',
          createdById: userId ?? null,
        },
      }),
    ]);

    return {
      success: true,
      walletBalance: Number(updated.walletBalance),
      loyaltyPoints: updated.loyaltyPoints,
      transaction: {
        ...tx,
        amount: Number(tx.amount),
        balanceAfter: Number(tx.balanceAfter),
      },
    };
  }

  async updateWalletSettings(
    tenantId: string | null | undefined,
    allowAdminCards: boolean,
    userId?: string,
  ) {
    let resolvedId = tenantId;
    if (!resolvedId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!first) throw new NotFoundException('No active tenant found');
      resolvedId = first.id;
    }

    const updated = await this.prisma.tenant.update({
      where: { id: resolvedId },
      data: { allowAdminCards: Boolean(allowAdminCards) },
    });

    if (userId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: resolvedId,
          userId,
          action: 'tenant:update_wallet_settings',
          entity: 'Tenant',
          entityId: resolvedId,
          newValues: { allowAdminCards: updated.allowAdminCards },
        },
      });
    }

    return {
      success: true,
      allowAdminCards: updated.allowAdminCards,
    };
  }

  async redeemLoyaltyPoints(
    tenantId: string | null | undefined,
    points: number,
    userId?: string,
  ) {
    if (isNaN(points) || points < 1000) {
      throw new BadRequestException('الحد الأدنى لاستبدال نقاط الولاء هو 1,000 نقطة');
    }

    let resolvedId = tenantId;
    if (!resolvedId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!first) throw new NotFoundException('No active tenant found');
      resolvedId = first.id;
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: resolvedId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const availablePoints = tenant.loyaltyPoints || 0;
    if (availablePoints < points) {
      throw new BadRequestException(`رصيد نقاط الولاء غير كافٍ. المتوفر حالياً: ${availablePoints} نقطة`);
    }

    // 1000 points = 1000 SDG conversion rate (1 point = 1 SDG credit)
    const creditAmount = points;
    const newBalance = Number(tenant.walletBalance) + creditAmount;
    const newPoints = availablePoints - points;

    const [updated, tx] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: resolvedId },
        data: {
          walletBalance: newBalance,
          loyaltyPoints: newPoints,
        },
      }),
      this.prisma.tenantWalletTransaction.create({
        data: {
          tenantId: resolvedId,
          amount: creditAmount,
          type: 'REDEEM_POINTS',
          pointsDelta: -points,
          balanceAfter: newBalance,
          notes: `استبدال ${points} نقطة ولاء برصيد محفظة ${creditAmount} SDG`,
          createdById: userId ?? null,
        },
      }),
    ]);

    return {
      success: true,
      redeemedPoints: points,
      creditAmount,
      walletBalance: Number(updated.walletBalance),
      loyaltyPoints: updated.loyaltyPoints,
      transaction: {
        ...tx,
        amount: Number(tx.amount),
        balanceAfter: Number(tx.balanceAfter),
      },
    };
  }

  async getWalletTransactions(tenantId?: string | null, limit = 5) {
    let resolvedId = tenantId;
    if (!resolvedId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!first) throw new NotFoundException('No active tenant found');
      resolvedId = first.id;
    }

    const transactions = await this.prisma.tenantWalletTransaction.findMany({
      where: { tenantId: resolvedId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      data: transactions.map((t) => ({
        id: t.id,
        amount: Number(t.amount),
        type: t.type,
        pointsDelta: t.pointsDelta,
        balanceAfter: Number(t.balanceAfter),
        reference: t.reference,
        notes: t.notes,
        createdAt: t.createdAt.toISOString(),
      })),
      total: transactions.length,
    };
  }

  async updateCurrentTenant(
    tenantId: string | null | undefined,
    dto: UpdateCurrentTenantDto,
    userId?: string,
  ): Promise<Record<string, unknown>> {
    let resolvedId = tenantId;
    if (!resolvedId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!first) throw new NotFoundException('No active tenant found');
      resolvedId = first.id;
    }

    const existing = await this.prisma.tenant.findUnique({ where: { id: resolvedId } });
    if (!existing) throw new NotFoundException('Tenant not found');

    const updated = await this.prisma.tenant.update({
      where: { id: resolvedId },
      data: {
        name: dto.name ?? existing.name,
        currency: dto.currency ?? existing.currency,
        contactEmail: dto.contactEmail ?? existing.contactEmail,
        phone: dto.contactPhone ?? dto.phone ?? existing.phone,
        address: dto.address ?? existing.address,
        logoUrl: dto.logoUrl ?? existing.logoUrl,
      },
    });

    if (userId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: resolvedId,
          userId,
          action: 'tenant:settings_updated',
          entity: 'Tenant',
          entityId: resolvedId,
          oldValues: {
            name: existing.name,
            currency: existing.currency,
            phone: existing.phone,
            contactEmail: existing.contactEmail,
          },
          newValues: {
            name: updated.name,
            currency: updated.currency,
            phone: updated.phone,
            contactEmail: updated.contactEmail,
          },
        },
      });
    }

    return this.getCurrentTenant(resolvedId);
  }
}
