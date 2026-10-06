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

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });
    const currency = tenant?.currency ?? 'SDG';

    // Parallel aggregate queries
    const [
      salesToday,
      salesThisWeek,
      salesThisMonth,
      salesAllTime,
      cardsCounts,
      devicesCounts,
      activeSessionsCount,
      recentSales,
      recentBatches,
    ] = await Promise.all([
      this.prisma.saleTransaction.aggregate({
        where: { tenantId, createdAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      this.prisma.saleTransaction.aggregate({
        where: { tenantId, createdAt: { gte: startOfWeek } },
        _sum: { amount: true },
      }),
      this.prisma.saleTransaction.aggregate({
        where: { tenantId, createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.saleTransaction.aggregate({
        where: { tenantId },
        _sum: { amount: true },
      }),
      this.prisma.card.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { status: true },
      }),
      this.prisma.mikroTikDevice.groupBy({
        by: ['status'],
        where: { tenantId, deletedAt: null },
        _count: { status: true },
      }),
      this.prisma.hotspotActiveSession.count({
        where: { tenantId },
      }),
      this.prisma.saleTransaction.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          cashier: { select: { fullName: true } },
          device: { select: { name: true } },
          card: { select: { profile: { select: { name: true } } } },
        },
      }),
      this.prisma.cardBatch.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          profile: { select: { name: true } },
          device: { select: { name: true } },
        },
      }),
    ]);

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
        today: Number(salesToday._sum.amount ?? 0),
        thisWeek: Number(salesThisWeek._sum.amount ?? 0),
        thisMonth: Number(salesThisMonth._sum.amount ?? 0),
        allTime: Number(salesAllTime._sum.amount ?? 0),
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
    const overview = await this.getDashboardOverview(tenantId);

    // 1. Calculate top profiles by revenue
    const sales = await this.prisma.saleTransaction.findMany({
      where: { tenantId },
      include: {
        card: { select: { profile: { select: { name: true } } } },
      },
    });

    const profileMap = new Map<string, { count: number; revenue: number }>();
    for (const s of sales) {
      const pName = s.card?.profile?.name ?? 'باقة هوتسبوت';
      const cur = profileMap.get(pName) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number(s.amount);
      profileMap.set(pName, cur);
    }

    // Include existing profiles if some have no sales yet
    const profiles = await this.prisma.hotspotProfile.findMany({
      where: { tenantId },
      select: { name: true },
      take: 5,
    });
    for (const p of profiles) {
      if (!profileMap.has(p.name)) {
        profileMap.set(p.name, { count: 0, revenue: 0 });
      }
    }

    const topProfiles = Array.from(profileMap.entries())
      .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

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
}
