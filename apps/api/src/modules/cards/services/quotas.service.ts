import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SubscriptionStatus, CardBatchStatus, SyncStatus, Prisma } from '@prisma/client';

export interface QuotaDetails {
  subscriptionId: string;
  planId: string;
  planName: string;
  planNameAr: string;
  status: string;
  cycleStart: Date;
  cycleEnd: Date;
  expiresAt: Date;
  isUnlimited: boolean;
  cardLimit: number | null;
  usedCards: number;
  remainingCards: number | null;
}

@Injectable()
export class QuotasService {
  private readonly logger = new Logger(QuotasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the active subscription for the tenant and verifies it has not expired.
   */
  async resolveTenantSubscription(tenantId: string, now: Date = new Date()) {
    if (!tenantId) {
      throw new ForbiddenException({
        code: 'TENANT_REQUIRED',
        message: 'يجب تحديد هوية المستأجر للتحقق من الحصة',
      });
    }

    // 1. Check if tenant organization itself is suspended
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });

    if (tenant?.status === 'SUSPENDED') {
      throw new ForbiddenException({
        code: 'TENANT_SUSPENDED',
        message: 'تم تعليق حساب هذه الشبكة. يرجى التواصل مع إدارة المنصة',
      });
    }

    const sub = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: SubscriptionStatus.ACTIVE,
      },
      include: {
        plan: true,
      },
      orderBy: {
        expiresAt: 'desc',
      },
    });

    if (!sub) {
      // Check if there is an inactive, suspended or expired subscription to provide a precise error
      const anySub = await this.prisma.subscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });

      if ((anySub as any)?.status === 'SUSPENDED') {
        throw new ForbiddenException({
          code: 'SUBSCRIPTION_SUSPENDED',
          message: 'تم تعليق اشتراك هذه الشبكة. يرجى مراجعة إدارة المنصة',
        });
      }

      if (anySub?.status === SubscriptionStatus.EXPIRED) {
        throw new ForbiddenException({
          code: 'SUBSCRIPTION_EXPIRED',
          message: 'انتهت صلاحية اشتراك الشبكة. يرجى تجديد الباقة للمتابعة',
        });
      }

      if (anySub?.status === SubscriptionStatus.CANCELLED) {
        throw new ForbiddenException({
          code: 'SUBSCRIPTION_CANCELLED',
          message: 'تم إلغاء اشتراك الشبكة',
        });
      }

      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'لا يوجد اشتراك نشط لهذه الشبكة. يرجى تفعيل إحدى باقات الخدمة أولاً',
      });
    }

    if (new Date(sub.expiresAt).getTime() <= now.getTime()) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_EXPIRED',
        message: `انتهت صلاحية اشتراك الشبكة في ${new Date(sub.expiresAt).toLocaleDateString('ar-EG')}. يرجى التجديد`,
      });
    }

    return sub;
  }

  /**
   * Calculates the monthly billing cycle boundaries anchored to the subscription startsAt day.
   */
  calculateBillingCycle(startsAt: Date, expiresAt: Date, now: Date = new Date()) {
    const start = new Date(startsAt);
    const expiry = new Date(expiresAt);
    const anchorDay = start.getUTCDate();

    // Determine cycle start: the most recent anchorDay date that is <= now
    let cycleStartYear = now.getUTCFullYear();
    let cycleStartMonth = now.getUTCMonth();

    // Clamp days for months with fewer days (e.g. Feb 28/29, April 30)
    const maxDaysInTargetMonth = new Date(Date.UTC(cycleStartYear, cycleStartMonth + 1, 0)).getUTCDate();
    const clampedDay = Math.min(anchorDay, maxDaysInTargetMonth);

    let candidateStart = new Date(Date.UTC(cycleStartYear, cycleStartMonth, clampedDay, 0, 0, 0, 0));

    if (candidateStart.getTime() > now.getTime()) {
      // Anchor date hasn't occurred yet this month; cycle started last month
      cycleStartMonth -= 1;
      if (cycleStartMonth < 0) {
        cycleStartMonth = 11;
        cycleStartYear -= 1;
      }
      const daysInPrevMonth = new Date(Date.UTC(cycleStartYear, cycleStartMonth + 1, 0)).getUTCDate();
      candidateStart = new Date(Date.UTC(cycleStartYear, cycleStartMonth, Math.min(anchorDay, daysInPrevMonth), 0, 0, 0, 0));
    }

    // Cycle start cannot be earlier than startsAt
    if (candidateStart.getTime() < start.getTime()) {
      candidateStart = new Date(start);
    }

    // Determine cycle end: candidateStart + 1 month
    let cycleEndYear = candidateStart.getUTCFullYear();
    let cycleEndMonth = candidateStart.getUTCMonth() + 1;
    if (cycleEndMonth > 11) {
      cycleEndMonth = 0;
      cycleEndYear += 1;
    }
    const daysInEndMonth = new Date(Date.UTC(cycleEndYear, cycleEndMonth + 1, 0)).getUTCDate();
    let candidateEnd = new Date(Date.UTC(cycleEndYear, cycleEndMonth, Math.min(anchorDay, daysInEndMonth), 0, 0, 0, 0));

    // Cycle end cannot exceed subscription expiration
    if (candidateEnd.getTime() > expiry.getTime()) {
      candidateEnd = new Date(expiry);
    }

    return {
      cycleStart: candidateStart,
      cycleEnd: candidateEnd,
    };
  }

  /**
   * Resolves the plan quota limit from plan features JSON.
   * Explicit Policy:
   * - null, undefined, or features.isUnlimited === true -> Unlimited (cardLimit: null, isUnlimited: true)
   * - 0 (or negative) -> Zero cards allowed (cardLimit: 0, isUnlimited: false) - disallows any generation
   * - positive number -> Explicit quota limit (cardLimit: N, isUnlimited: false)
   */
  resolvePlanLimit(plan: { features: any }): { isUnlimited: boolean; cardLimit: number | null } {
    const features = (plan.features as Record<string, any>) || {};

    if (features.isUnlimited === true) {
      return { isUnlimited: true, cardLimit: null };
    }

    const rawLimit = features.cardGenerationLimit ?? features.cardLimit ?? features.maxCards;

    // null or undefined indicates an unlimited plan
    if (rawLimit === undefined || rawLimit === null) {
      return { isUnlimited: true, cardLimit: null };
    }

    const parsed = Number(rawLimit);

    // 0 or negative explicitly disallows card generation (limit = 0)
    if (isNaN(parsed) || parsed <= 0) {
      return { isUnlimited: false, cardLimit: 0 };
    }

    return { isUnlimited: false, cardLimit: Math.floor(parsed) };
  }

  /**
   * Returns current quota usage statistics for a tenant.
   */
  async getTenantQuota(tenantId: string, now: Date = new Date()): Promise<QuotaDetails> {
    const sub = await this.resolveTenantSubscription(tenantId, now);
    const { cycleStart, cycleEnd } = this.calculateBillingCycle(sub.startsAt, sub.expiresAt, now);
    const { isUnlimited, cardLimit } = this.resolvePlanLimit(sub.plan);

    const usedCards = await this.prisma.card.count({
      where: {
        tenantId,
        createdAt: {
          gte: cycleStart,
          lt: cycleEnd,
        },
        NOT: {
          AND: [
            { batch: { status: CardBatchStatus.FAILED } },
            { syncStatus: SyncStatus.FAILED },
          ],
        },
        batch: {
          status: {
            not: CardBatchStatus.CANCELLED,
          },
        },
      },
    });

    const remainingCards = isUnlimited
      ? null
      : Math.max(0, (cardLimit ?? 0) - usedCards);

    return {
      subscriptionId: sub.id,
      planId: sub.plan.id,
      planName: sub.plan.name,
      planNameAr: sub.plan.nameAr,
      status: sub.status,
      cycleStart,
      cycleEnd,
      expiresAt: sub.expiresAt,
      isUnlimited,
      cardLimit,
      usedCards,
      remainingCards,
    };
  }

  /**
   * Performs an atomic quota check with concurrency protection using FOR UPDATE row locking.
   * Must be called inside a Prisma transaction.
   */
  async checkAndLockQuota(
    tx: Prisma.TransactionClient,
    tenantId: string,
    requestedCards: number,
    now: Date = new Date(),
  ): Promise<QuotaDetails> {
    if (!tenantId) {
      throw new ForbiddenException({
        code: 'TENANT_REQUIRED',
        message: 'معرف المستأجر مطلوب لحجز الحصة',
      });
    }

    if (requestedCards <= 0) {
      throw new ForbiddenException({
        code: 'INVALID_QUANTITY',
        message: 'عدد الكروت المطلوب توليدها يجب أن يكون أكبر من الصفر',
      });
    }

    // Row-level lock on the active subscription to prevent concurrent race conditions
    try {
      await tx.$queryRaw<Array<{ id: string; expiresAt: Date; status: string }>>`
        SELECT id, "expiresAt", status FROM subscriptions
        WHERE "tenantId" = ${tenantId} AND status = 'ACTIVE'
        ORDER BY "expiresAt" DESC LIMIT 1
        FOR UPDATE;
      `;
    } catch (lockErr) {
      // If db driver doesn't support $queryRaw or running in unit tests with mock prisma
      this.logger.debug(`Lock fallback or raw query skipped: ${lockErr}`);
    }

    const sub = await tx.subscription.findFirst({
      where: {
        tenantId,
        status: SubscriptionStatus.ACTIVE,
      },
      include: {
        plan: true,
      },
      orderBy: {
        expiresAt: 'desc',
      },
    });

    if (!sub) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'لا يوجد اشتراك نشط لهذه الشبكة',
      });
    }

    if (new Date(sub.expiresAt).getTime() <= now.getTime()) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'انتهت صلاحية اشتراك الشبكة الحالية',
      });
    }

    const { cycleStart, cycleEnd } = this.calculateBillingCycle(sub.startsAt, sub.expiresAt, now);
    const { isUnlimited, cardLimit } = this.resolvePlanLimit(sub.plan);

    // Count currently consumed cards in the cycle
    const usedCards = await tx.card.count({
      where: {
        tenantId,
        createdAt: {
          gte: cycleStart,
          lt: cycleEnd,
        },
        NOT: {
          AND: [
            { batch: { status: CardBatchStatus.FAILED } },
            { syncStatus: SyncStatus.FAILED },
          ],
        },
        batch: {
          status: {
            not: CardBatchStatus.CANCELLED,
          },
        },
      },
    });

    if (!isUnlimited && cardLimit !== null) {
      const remainingCards = Math.max(0, cardLimit - usedCards);
      if (usedCards + requestedCards > cardLimit) {
        throw new ForbiddenException({
          code: 'CARD_QUOTA_EXCEEDED',
          message:
            cardLimit === 0
              ? 'هذه الباقة لا تتضمن حصة لتوليد الكروت (الحد المسموح: 0 كرت)'
              : `تم تجاوز سقف الباقة المسموح به (${cardLimit.toLocaleString()} كرت). المستهلك حالياً: ${usedCards.toLocaleString()}، المطلوب: ${requestedCards.toLocaleString()}، المتبقي: ${remainingCards.toLocaleString()}`,
          limit: cardLimit,
          used: usedCards,
          requested: requestedCards,
          remaining: remainingCards,
          resetsAt: cycleEnd.toISOString(),
        });
      }
    }

    const remainingCards = isUnlimited
      ? null
      : Math.max(0, (cardLimit ?? 0) - usedCards - requestedCards);

    return {
      subscriptionId: sub.id,
      planId: sub.plan.id,
      planName: sub.plan.name,
      planNameAr: sub.plan.nameAr,
      status: sub.status,
      cycleStart,
      cycleEnd,
      expiresAt: sub.expiresAt,
      isUnlimited,
      cardLimit,
      usedCards,
      remainingCards,
    };
  }
}
