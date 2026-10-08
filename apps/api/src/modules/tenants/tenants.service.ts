import { Injectable, NotFoundException } from '@nestjs/common';
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
    return {
      walletBalance: (tenantData.walletBalance as number) ?? 0,
      loyaltyPoints: (tenantData.loyaltyPoints as number) ?? 0,
      allowAdminCards: (tenantData.allowAdminCards as boolean) ?? false,
      currency: (tenantData.currency as string) || 'SDG',
    };
  }

  async rechargeWallet(
    tenantId: string | null | undefined,
    amount: number,
    notes?: string,
    pointsDelta = 0,
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

    const tenant = await this.prisma.tenant.findUnique({ where: { id: resolvedId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const newBalance = Number(tenant.walletBalance) + amount;
    const newPoints = (tenant.loyaltyPoints || 0) + pointsDelta;

    const updated = await this.prisma.tenant.update({
      where: { id: resolvedId },
      data: {
        walletBalance: newBalance,
        loyaltyPoints: newPoints,
      },
    });

    const tx = await this.prisma.tenantWalletTransaction.create({
      data: {
        tenantId: resolvedId,
        amount,
        type: amount >= 0 ? 'RECHARGE' : 'DEDUCTION',
        pointsDelta,
        balanceAfter: newBalance,
        notes: notes ?? 'شحن يدوي للمحفظة السحابية',
        createdById: userId ?? null,
      },
    });

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

  async getWalletTransactions(tenantId?: string | null, limit = 20) {
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
        ...t,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
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
