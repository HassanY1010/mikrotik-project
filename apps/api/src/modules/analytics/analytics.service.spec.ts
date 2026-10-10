import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../core/database/prisma.service';
import { CardStatus, DeviceStatus, PaymentMethod } from '@prisma/client';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: any;

  const mockTenantId = 'tenant-uuid-1';

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ currency: 'SDG' }),
      },
      saleTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: '5000' } }),
        findMany: jest.fn(),
      },
      card: {
        groupBy: jest.fn().mockResolvedValue([
          { status: CardStatus.AVAILABLE, _count: { status: 150 } },
          { status: CardStatus.SOLD, _count: { status: 50 } },
        ]),
      },
      mikroTikDevice: {
        groupBy: jest.fn().mockResolvedValue([
          { status: DeviceStatus.ONLINE, _count: { status: 2 } },
          { status: DeviceStatus.OFFLINE, _count: { status: 1 } },
        ]),
      },
      hotspotActiveSession: {
        count: jest.fn().mockResolvedValue(18),
        findMany: jest.fn(),
      },
      cardBatch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      hotspotProfile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        { name: '1week-unlimited', count: 10, revenue: 50000 },
        { name: '1day-unlimited', count: 25, revenue: 25000 },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getDashboardOverview', () => {
    it('should aggregate revenue, cards inventory, devices, and sessions correctly', async () => {
      prisma.saleTransaction.findMany.mockResolvedValue([]);

      const overview = await service.getDashboardOverview(mockTenantId);

      expect(overview.revenue.today).toBe(5000);
      expect(overview.revenue.currency).toBe('SDG');
      expect(overview.cardsInventory.available).toBe(150);
      expect(overview.cardsInventory.sold).toBe(50);
      expect(overview.cardsInventory.total).toBe(200);
      expect(overview.devices.total).toBe(3);
      expect(overview.devices.online).toBe(2);
      expect(overview.devices.offline).toBe(1);
      expect(overview.activeSessionsCount).toBe(18);
    });
  });

  describe('getDashboardData', () => {
    it('should aggregate KPIs and top profiles via database SQL aggregation', async () => {
      prisma.saleTransaction.findMany.mockResolvedValue([]);

      const data = await service.getDashboardData(mockTenantId);

      expect(data.kpis.totalRevenue).toBe(5000);
      expect(data.topProfiles).toHaveLength(2);
      expect(data.topProfiles[0].name).toBe('1week-unlimited');
      expect(data.topProfiles[0].revenue).toBe(50000);
    });
  });

  describe('getRevenueAnalytics', () => {
    it('should generate timeseries and breakdown by profile and payment method', async () => {
      prisma.saleTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          amount: '500',
          paymentMethod: PaymentMethod.CASH,
          createdAt: new Date(),
          device: { id: 'dev-1', name: 'Main Router' },
          card: { profile: { name: '1hour-unlimited' } },
        },
        {
          id: 'tx-2',
          amount: '1000',
          paymentMethod: PaymentMethod.MOBILE_WALLET,
          createdAt: new Date(),
          device: { id: 'dev-1', name: 'Main Router' },
          card: { profile: { name: '3hours-unlimited' } },
        },
      ]);

      const analytics = await service.getRevenueAnalytics(mockTenantId, 7);

      expect(analytics.timeSeries.length).toBeGreaterThan(0);
      expect(analytics.byProfile).toHaveLength(2);
      expect(analytics.byPaymentMethod[PaymentMethod.CASH].total).toBe(500);
      expect(analytics.byPaymentMethod[PaymentMethod.MOBILE_WALLET].total).toBe(1000);
      expect(analytics.byDevice).toHaveLength(1);
    });
  });

  describe('getNetworkAnalytics', () => {
    it('should calculate total bytes, top users, and hourly distribution', async () => {
      prisma.hotspotActiveSession.findMany.mockResolvedValue([
        {
          id: 's-1',
          username: 'user01',
          ipAddress: '192.168.88.10',
          uptimeSeconds: 1200,
          bytesIn: BigInt(5000000),
          bytesOut: BigInt(20000000),
          startedAt: new Date(),
        },
      ]);

      const network = await service.getNetworkAnalytics(mockTenantId);

      expect(network.totalActiveSessions).toBe(1);
      expect(network.totalBytesIn).toBe(5000000);
      expect(network.totalBytesOut).toBe(20000000);
      expect(network.topUsers).toHaveLength(1);
      expect(network.topUsers[0].totalBytes).toBe(25000000);
      expect(network.hourlyDistribution).toHaveLength(24);
    });
  });
});
