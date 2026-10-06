import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SubscriptionStatus, BillingCycle } from '@prisma/client';
import type { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import type { ApproveSubscriptionDto } from './dto/approve-subscription.dto';

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
}
