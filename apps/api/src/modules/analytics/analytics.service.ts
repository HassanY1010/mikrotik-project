import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CardStatus, DeviceStatus, PaymentMethod, Prisma } from '@prisma/client';

export interface DashboardOverview {
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    allTime: number;
    currency: string;
  };
  cardsInventory: {
    total: number;
    available: number;
    sold: number;
    active: number;
    expired: number;
    disabled: number;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
  };
  activeSessionsCount: number;
  recentSales: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    cashierName: string;
    deviceName: string;
    profileName?: string;
    createdAt: Date;
  }>;
  recentBatches: Array<{
    id: string;
    batchNumber: string;
    totalCards: number;
    profileName: string;
    deviceName: string;
    createdAt: Date;
  }>;
}

export interface UnifiedDashboardData {
  kpis: {
    totalRevenue: number;
    availableCards: number;
    totalSoldCards: number;
    activeRouters: number;
    activeSessions: number;
    currency: string;
  };
  topProfiles: Array<{ name: string; count: number; revenue: number }>;
  recentSales: Array<{ invoice: string; profile: string; amount: number; time: string }>;
  overview: DashboardOverview;
}

export interface RevenueAnalytics {
  timeSeries: Array<{ date: string; amount: number; count: number }>;
  byProfile: Array<{ profileName: string; count: number; total: number }>;
  byPaymentMethod: Record<PaymentMethod, { count: number; total: number }>;
  byDevice: Array<{ deviceId: string; deviceName: string; count: number; total: number }>;
}

export interface NetworkAnalytics {
  totalActiveSessions: number;
  totalBytesIn: number;
  totalBytesOut: number;
  topUsers: Array<{
    username: string;
    ipAddress: string;
    uptimeSeconds: number;
    bytesIn: number;
    bytesOut: number;
    totalBytes: number;
  }>;
  hourlyDistribution: Array<{ hour: number; sessionCount: number }>;
}

export interface FinancialReport {
  summary: {
    todayRevenue: number;
    todaySalesCount: number;
    todayCollected: number;
    weekRevenue: number;
    weekSalesCount: number;
    weekCollected: number;
    monthRevenue: number;
    monthSalesCount: number;
    monthCollected: number;
    allTimeRevenue: number;
    allTimeSalesCount: number;
    allTimeCollected: number;
    totalRefunds: number;
    refundedCount: number;
    profitMarginPercent: number;
    estimatedProfit: number;
    profitNotes: string;
    hasCostData: boolean;
    currency: string;
  };
  forecast: {
    isAvailable: boolean;
    message: string;
    daysAnalyzed: number;
    dailyAverage: number;
    next7Days: number;
    next30Days: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
    note: string;
  };
  bestSellingProfiles: Array<{
    name: string;
    salesCount: number;
    revenue: number;
    percentage: number;
  }>;
  salesByRouter: Array<{
    deviceName: string;
    salesCount: number;
    revenue: number;
    percentage: number;
  }>;
  salesByCashier: Array<{
    cashierName: string;
    salesCount: number;
    revenue: number;
  }>;
  dailyRevenueLast30Days: Array<{
    date: string;
    dayName: string;
    amount: number;
    count: number;
  }>;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardOverview(tenantId: string): Promise<DashboardOverview> {
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      resolvedTenantId = first?.id || '';
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: resolvedTenantId },
      select: { currency: true },
    });
    const currency = tenant?.currency ?? 'SDG';

    const activeSaleWhere: Prisma.SaleTransactionWhereInput = {
      tenantId: resolvedTenantId,
      card: { status: { not: CardStatus.DISABLED } },
    };

    // Parallel queries: consolidated revenue SQL + card status breakdown + devices + sessions + recent sales + recent batches
    const [
      revenueRows,
      cardsCounts,
      devicesCounts,
      activeSessionsCount,
      recentSales,
      recentBatches,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ today: number | null; thisWeek: number | null; thisMonth: number | null; allTime: number | null }>
      >`
        SELECT 
          COALESCE(SUM(st.amount), 0)::float AS "allTime",
          COALESCE(SUM(CASE WHEN st."createdAt" >= ${startOfToday} THEN st.amount ELSE 0 END), 0)::float AS "today",
          COALESCE(SUM(CASE WHEN st."createdAt" >= ${startOfWeek} THEN st.amount ELSE 0 END), 0)::float AS "thisWeek",
          COALESCE(SUM(CASE WHEN st."createdAt" >= ${startOfMonth} THEN st.amount ELSE 0 END), 0)::float AS "thisMonth"
        FROM sale_transactions st
        JOIN cards c ON st."cardId" = c.id
        WHERE st."tenantId" = ${resolvedTenantId} AND c.status != 'DISABLED'::"CardStatus";
      `.catch(() => [{ today: 0, thisWeek: 0, thisMonth: 0, allTime: 0 }]),
      this.prisma.card.groupBy({
        by: ['status'],
        where: { tenantId: resolvedTenantId },
        _count: { status: true },
      }),
      this.prisma.mikroTikDevice.groupBy({
        by: ['status'],
        where: { tenantId: resolvedTenantId, deletedAt: null },
        _count: { status: true },
      }),
      this.prisma.hotspotActiveSession.count({
        where: { tenantId: resolvedTenantId },
      }),
      this.prisma.saleTransaction.findMany({
        where: activeSaleWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          cashier: { select: { fullName: true } },
          device: { select: { name: true } },
          card: { select: { profile: { select: { name: true } } } },
        },
      }),
      this.prisma.cardBatch.findMany({
        where: { tenantId: resolvedTenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          profile: { select: { name: true } },
          device: { select: { name: true } },
        },
      }),
    ]);

    const rev = (Array.isArray(revenueRows) && revenueRows.length > 0)
      ? revenueRows[0]
      : { today: 0, thisWeek: 0, thisMonth: 0, allTime: 0 };

    // Cards status map
    const cardStatusMap: Record<CardStatus, number> = {
      [CardStatus.GENERATED]: 0,
      [CardStatus.AVAILABLE]: 0,
      [CardStatus.SOLD]: 0,
      [CardStatus.ACTIVE]: 0,
      [CardStatus.EXPIRED]: 0,
      [CardStatus.DISABLED]: 0,
    };
    let totalCards = 0;
    for (const c of cardsCounts) {
      cardStatusMap[c.status] = c._count.status;
      totalCards += c._count.status;
    }

    // Devices status map
    let totalDevices = 0;
    let onlineDevices = 0;
    for (const d of devicesCounts) {
      totalDevices += d._count.status;
      if (d.status === DeviceStatus.ONLINE) {
        onlineDevices += d._count.status;
      }
    }

    return {
      revenue: {
        today: Number(rev.today ?? 0),
        thisWeek: Number(rev.thisWeek ?? 0),
        thisMonth: Number(rev.thisMonth ?? 0),
        allTime: Number(rev.allTime ?? 0),
        currency,
      },
      cardsInventory: {
        total: totalCards,
        available: cardStatusMap[CardStatus.AVAILABLE],
        sold: cardStatusMap[CardStatus.SOLD],
        active: cardStatusMap[CardStatus.ACTIVE],
        expired: cardStatusMap[CardStatus.EXPIRED],
        disabled: cardStatusMap[CardStatus.DISABLED],
      },
      devices: {
        total: totalDevices,
        online: onlineDevices,
        offline: totalDevices - onlineDevices,
      },
      activeSessionsCount,
      recentSales: recentSales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        amount: Number(s.amount),
        currency: s.currency,
        paymentMethod: s.paymentMethod,
        cashierName: s.cashier.fullName,
        deviceName: s.device.name,
        profileName: s.card?.profile?.name,
        createdAt: s.createdAt,
      })),
      recentBatches: recentBatches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        totalCards: b.totalCards,
        profileName: b.profile.name,
        deviceName: b.device.name,
        createdAt: b.createdAt,
      })),
    };
  }

  async getDashboardData(tenantId: string): Promise<UnifiedDashboardData> {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      resolvedTenantId = first?.id || '';
    }

    // Run getDashboardOverview and topProfiles raw query concurrently in Promise.all to eliminate sequential waterfall
    const [overview, rawRows] = await Promise.all([
      this.getDashboardOverview(resolvedTenantId),
      this.prisma.$queryRaw<
        Array<{ name: string; count: number | bigint; revenue: number | null }>
      >`
        SELECT hp.name AS name, COUNT(st.id)::int AS count, COALESCE(SUM(st.amount), 0)::float AS revenue
        FROM sale_transactions st
        JOIN cards c ON st."cardId" = c.id
        JOIN hotspot_profiles hp ON c."profileId" = hp.id
        WHERE st."tenantId" = ${resolvedTenantId}
        GROUP BY hp.name
        ORDER BY revenue DESC
        LIMIT 5;
      `.catch(() => []),
    ]);

    let topProfiles: Array<{ name: string; count: number; revenue: number }> = [];
    if (Array.isArray(rawRows)) {
      topProfiles = rawRows.map((r) => ({
        name: r.name,
        count: Number(r.count),
        revenue: Number(r.revenue),
      }));
    }

    // Include existing profiles if fewer than 5 profiles have recorded sales
    if (topProfiles.length < 5) {
      const existingNames = new Set(topProfiles.map((p) => p.name));
      const profiles = await this.prisma.hotspotProfile.findMany({
        where: { tenantId: resolvedTenantId },
        select: { name: true },
        take: 5,
      });
      for (const p of profiles) {
        if (!existingNames.has(p.name)) {
          topProfiles.push({ name: p.name, count: 0, revenue: 0 });
          existingNames.add(p.name);
          if (topProfiles.length >= 5) break;
        }
      }
    }

    // 2. Format recent sales for dashboard table
    const recentSales = overview.recentSales.map((s) => ({
      invoice: s.invoiceNumber,
      profile: s.profileName ?? s.deviceName ?? 'باقة هوتسبوت',
      amount: s.amount,
      time: new Date(s.createdAt).toLocaleTimeString('ar-YE', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

    return {
      kpis: {
        totalRevenue: overview.revenue.allTime,
        availableCards: overview.cardsInventory.available,
        totalSoldCards: overview.cardsInventory.sold,
        activeRouters: overview.devices.online,
        activeSessions: overview.activeSessionsCount,
        currency: overview.revenue.currency,
      },
      topProfiles,
      recentSales,
      overview,
    };
  }

  async getRevenueAnalytics(
    tenantId: string,
    days = 30,
    deviceId?: string,
  ): Promise<RevenueAnalytics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const where: Prisma.SaleTransactionWhereInput = {
      tenantId,
      createdAt: { gte: startDate },
    };
    if (deviceId) where.deviceId = deviceId;

    const transactions = await this.prisma.saleTransaction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        device: { select: { id: true, name: true } },
        card: { select: { profile: { select: { name: true } } } },
      },
    });

    // 1. Time Series by day (YYYY-MM-DD)
    const timeSeriesMap = new Map<string, { amount: number; count: number }>();
    for (let d = 0; d <= days; d++) {
      const cur = new Date(startDate);
      cur.setDate(cur.getDate() + d);
      const key = cur.toISOString().split('T')[0];
      timeSeriesMap.set(key, { amount: 0, count: 0 });
    }

    // 2. By Profile
    const profileMap = new Map<string, { count: number; total: number }>();

    // 3. By Payment Method
    const paymentMethodMap: Record<PaymentMethod, { count: number; total: number }> = {
      [PaymentMethod.CASH]: { count: 0, total: 0 },
      [PaymentMethod.CARD]: { count: 0, total: 0 },
      [PaymentMethod.MOBILE_WALLET]: { count: 0, total: 0 },
      [PaymentMethod.TRANSFER]: { count: 0, total: 0 },
    };

    // 4. By Device
    const deviceMap = new Map<string, { deviceName: string; count: number; total: number }>();

    for (const t of transactions) {
      const amount = Number(t.amount);
      const dayKey = t.createdAt.toISOString().split('T')[0];

      // Time series
      const tsEntry = timeSeriesMap.get(dayKey) ?? { amount: 0, count: 0 };
      tsEntry.amount += amount;
      tsEntry.count++;
      timeSeriesMap.set(dayKey, tsEntry);

      // Profile
      const profName = t.card.profile.name;
      const pEntry = profileMap.get(profName) ?? { count: 0, total: 0 };
      pEntry.count++;
      pEntry.total += amount;
      profileMap.set(profName, pEntry);

      // Payment method
      if (paymentMethodMap[t.paymentMethod]) {
        paymentMethodMap[t.paymentMethod].count++;
        paymentMethodMap[t.paymentMethod].total += amount;
      }

      // Device
      const devEntry = deviceMap.get(t.device.id) ?? {
        deviceName: t.device.name,
        count: 0,
        total: 0,
      };
      devEntry.count++;
      devEntry.total += amount;
      deviceMap.set(t.device.id, devEntry);
    }

    return {
      timeSeries: Array.from(timeSeriesMap.entries()).map(([date, data]) => ({
        date,
        amount: data.amount,
        count: data.count,
      })),
      byProfile: Array.from(profileMap.entries()).map(([profileName, data]) => ({
        profileName,
        count: data.count,
        total: data.total,
      })),
      byPaymentMethod: paymentMethodMap,
      byDevice: Array.from(deviceMap.entries()).map(([deviceIdVal, data]) => ({
        deviceId: deviceIdVal,
        deviceName: data.deviceName,
        count: data.count,
        total: data.total,
      })),
    };
  }

  async getNetworkAnalytics(tenantId: string, deviceId?: string): Promise<NetworkAnalytics> {
    const where: Prisma.HotspotActiveSessionWhereInput = { tenantId };
    if (deviceId) where.deviceId = deviceId;

    const sessions = await this.prisma.hotspotActiveSession.findMany({
      where,
      orderBy: { bytesIn: 'desc' },
    });

    let totalBytesIn = 0;
    let totalBytesOut = 0;
    const hourCounts: number[] = new Array(24).fill(0);

    for (const s of sessions) {
      totalBytesIn += Number(s.bytesIn);
      totalBytesOut += Number(s.bytesOut);

      const hour = s.startedAt.getHours();
      hourCounts[hour]++;
    }

    const topUsers = sessions.slice(0, 10).map((s) => ({
      username: s.username,
      ipAddress: s.ipAddress,
      uptimeSeconds: s.uptimeSeconds,
      bytesIn: Number(s.bytesIn),
      bytesOut: Number(s.bytesOut),
      totalBytes: Number(s.bytesIn) + Number(s.bytesOut),
    }));

    const hourlyDistribution = hourCounts.map((sessionCount, hour) => ({
      hour,
      sessionCount,
    }));

    return {
      totalActiveSessions: sessions.length,
      totalBytesIn,
      totalBytesOut,
      topUsers,
      hourlyDistribution,
    };
  }

  async getFinancialReport(tenantId: string): Promise<FinancialReport> {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const first = await this.prisma.tenant.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      resolvedTenantId = first?.id || '';
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: resolvedTenantId },
      select: { currency: true },
    });
    const currency = tenant?.currency ?? 'SDG';

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    // Business week starts Saturday in Sudan / Arab region:
    const dayOfWeek = now.getDay();
    const diffToSaturday = (dayOfWeek + 1) % 7;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToSaturday, 0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    // Fetch all sale transactions with card, profile, device, and cashier
    const allTransactions = await this.prisma.saleTransaction.findMany({
      where: { tenantId: resolvedTenantId },
      include: {
        card: {
          select: {
            id: true,
            status: true,
            profile: { select: { id: true, name: true } },
          },
        },
        device: { select: { id: true, name: true } },
        cashier: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Distinguish completed vs refunded transactions
    const completedTransactions = allTransactions.filter(
      (t) => t.card?.status !== CardStatus.DISABLED,
    );
    const refundedTransactions = allTransactions.filter(
      (t) => t.card?.status === CardStatus.DISABLED,
    );

    // All Time
    const allTimeRevenue = completedTransactions.reduce((acc, t) => acc + Number(t.amount), 0);
    const allTimeSalesCount = completedTransactions.length;
    const allTimeCollected = allTimeRevenue;
    const totalRefunds = refundedTransactions.reduce((acc, t) => acc + Number(t.amount), 0);
    const refundedCount = refundedTransactions.length;

    // Month
    const monthCompleted = completedTransactions.filter((t) => t.createdAt >= startOfMonth);
    const monthRevenue = monthCompleted.reduce((acc, t) => acc + Number(t.amount), 0);
    const monthSalesCount = monthCompleted.length;
    const monthCollected = monthRevenue;

    // Week
    const weekCompleted = completedTransactions.filter((t) => t.createdAt >= startOfWeek);
    const weekRevenue = weekCompleted.reduce((acc, t) => acc + Number(t.amount), 0);
    const weekSalesCount = weekCompleted.length;
    const weekCollected = weekRevenue;

    // Today
    const todayCompleted = completedTransactions.filter((t) => t.createdAt >= startOfToday);
    const todayRevenue = todayCompleted.reduce((acc, t) => acc + Number(t.amount), 0);
    const todaySalesCount = todayCompleted.length;
    const todayCollected = todayRevenue;

    // Net Profit: calculate operational deductions / cost
    const walletDeductions = await this.prisma.tenantWalletTransaction.aggregate({
      where: {
        tenantId: resolvedTenantId,
        type: { in: ['DEDUCTION', 'USAGE'] },
      },
      _sum: { amount: true },
    });
    const totalExpenses = Math.abs(Number(walletDeductions._sum.amount ?? 0));
    const hasCostData = totalExpenses > 0;
    const estimatedProfit = hasCostData
      ? Math.max(0, allTimeCollected - totalExpenses)
      : allTimeCollected;
    const profitMarginPercent =
      allTimeCollected > 0 ? Math.round((estimatedProfit / allTimeCollected) * 100) : 100;
    const profitNotes = hasCostData
      ? `صافي الأرباح محسوب بعد خصم التكاليف والرسوم التشغيلية المسجلة (${totalExpenses} ${currency})`
      : 'لا توجد تكاليف تشغيلية مدخلة في النظام حالياً؛ صافي الربح يساوي إجمالي المبالغ المحصلة';

    // 30-Day Daily Movement
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dailyRevenueLast30Days: Array<{
      date: string;
      dayName: string;
      amount: number;
      count: number;
    }> = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayName = dayNames[d.getDay()];

      dailyRevenueLast30Days.push({
        date: dateStr,
        dayName,
        amount: 0,
        count: 0,
      });
    }

    for (const t of completedTransactions) {
      const txDate = t.createdAt;
      const yyyy = txDate.getFullYear();
      const mm = String(txDate.getMonth() + 1).padStart(2, '0');
      const dd = String(txDate.getDate()).padStart(2, '0');
      const txDateStr = `${yyyy}-${mm}-${dd}`;

      const bucket = dailyRevenueLast30Days.find((b) => b.date === txDateStr);
      if (bucket) {
        bucket.amount += Number(t.amount);
        bucket.count += 1;
      }
    }

    // Smart Forecast
    const daysWithSales = dailyRevenueLast30Days.filter((b) => b.count > 0).length;
    const isForecastAvailable = daysWithSales >= 3 && completedTransactions.length >= 5;

    let next7Days = 0;
    let next30Days = 0;
    let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
    let forecastMessage = '';
    let forecastNote = '';
    let dailyAverage = 0;

    if (!isForecastAvailable) {
      forecastMessage =
        'البيانات التاريخية المسجلة حالياً غير كافية لبناء نموذج توقع إحصائي دقيق. يلزم نشاط مبيعات منتظم لعدة أيام على الأقل.';
      forecastNote =
        'يتطلب التوقع وجود 5 مبيعات مكتملة على الأقل موزعة عبر 3 أيام نشاط مختلفة.';
    } else {
      const last30DaysRevenue = dailyRevenueLast30Days.reduce((sum, b) => sum + b.amount, 0);
      dailyAverage = Math.round(last30DaysRevenue / 30);
      next7Days = Math.round(dailyAverage * 7);
      next30Days = Math.round(dailyAverage * 30);

      const last7DaysSum = dailyRevenueLast30Days.slice(-7).reduce((sum, b) => sum + b.amount, 0);
      const prev7DaysSum = dailyRevenueLast30Days.slice(-14, -7).reduce((sum, b) => sum + b.amount, 0);

      if (last7DaysSum > prev7DaysSum * 1.1) {
        trend = 'UP';
      } else if (last7DaysSum < prev7DaysSum * 0.9) {
        trend = 'DOWN';
      } else {
        trend = 'STABLE';
      }

      forecastMessage = `بناءً على متوسط المبيعات اليومية (${dailyAverage} ${currency}/يوم) خلال آخر 30 يوماً`;
      forecastNote = 'تقدير إحصائي استرشادي مبني على متوسط استهلاك الفترة السابقة، وليس ربحاً مضموناً.';
    }

    // Best Selling Profiles (Top 5)
    const profileMap = new Map<string, { count: number; revenue: number }>();
    for (const t of completedTransactions) {
      const name = t.card?.profile?.name || 'باقة هوتسبوت';
      const cur = profileMap.get(name) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number(t.amount);
      profileMap.set(name, cur);
    }
    const bestSellingProfiles = Array.from(profileMap.entries())
      .map(([name, data]) => ({
        name,
        salesCount: data.count,
        revenue: data.revenue,
        percentage: allTimeRevenue > 0 ? Math.round((data.revenue / allTimeRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, 5);

    // Sales by Router (Top 5)
    const routerMap = new Map<string, { count: number; revenue: number }>();
    for (const t of completedTransactions) {
      const name = t.device?.name || 'مبيعات عامة (بدون راوتر)';
      const cur = routerMap.get(name) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number(t.amount);
      routerMap.set(name, cur);
    }
    const salesByRouter = Array.from(routerMap.entries())
      .map(([deviceName, data]) => ({
        deviceName,
        salesCount: data.count,
        revenue: data.revenue,
        percentage: allTimeRevenue > 0 ? Math.round((data.revenue / allTimeRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Sales by Cashier
    const cashierMap = new Map<string, { count: number; revenue: number }>();
    for (const t of completedTransactions) {
      const name = t.cashier?.fullName || 'كاشير';
      const cur = cashierMap.get(name) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number(t.amount);
      cashierMap.set(name, cur);
    }
    const salesByCashier = Array.from(cashierMap.entries())
      .map(([cashierName, data]) => ({
        cashierName,
        salesCount: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      summary: {
        todayRevenue,
        todaySalesCount,
        todayCollected,
        weekRevenue,
        weekSalesCount,
        weekCollected,
        monthRevenue,
        monthSalesCount,
        monthCollected,
        allTimeRevenue,
        allTimeSalesCount,
        allTimeCollected,
        totalRefunds,
        refundedCount,
        profitMarginPercent,
        estimatedProfit,
        profitNotes,
        hasCostData,
        currency,
      },
      forecast: {
        isAvailable: isForecastAvailable,
        message: forecastMessage,
        daysAnalyzed: daysWithSales,
        dailyAverage,
        next7Days,
        next30Days,
        trend,
        note: forecastNote,
      },
      bestSellingProfiles,
      salesByRouter,
      salesByCashier,
      dailyRevenueLast30Days,
    };
  }
}
