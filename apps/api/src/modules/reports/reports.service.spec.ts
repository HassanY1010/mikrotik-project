import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../core/database/prisma.service';
import { CardStatus, PaymentMethod, SyncStatus } from '@prisma/client';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  const mockTenantId = 'tenant-uuid-1';

  beforeEach(async () => {
    prisma = {
      saleTransaction: {
        findMany: jest.fn(),
      },
      card: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('exportSalesCsv', () => {
    it('should format sales transactions into CSV with UTF-8 BOM', async () => {
      prisma.saleTransaction.findMany.mockResolvedValue([
        {
          invoiceNumber: 'INV-261004-AA11',
          amount: '500',
          currency: 'YER',
          paymentMethod: PaymentMethod.CASH,
          createdAt: new Date(),
          cashier: { fullName: 'Ali Cashier' },
          device: { name: 'Main Router' },
          card: {
            serialNumber: 'SN-0001',
            username: 'user01',
            profile: { name: '1hour' },
          },
        },
      ]);

      const csv = await service.exportSalesCsv(mockTenantId, {});

      expect(csv.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
      expect(csv).toContain('رقم الفاتورة');
      expect(csv).toContain('INV-261004-AA11');
      expect(csv).toContain('Ali Cashier');
      expect(csv).toContain('500');
    });
  });

  describe('exportCardsCsv', () => {
    it('should format cards inventory into CSV with UTF-8 BOM', async () => {
      prisma.card.findMany.mockResolvedValue([
        {
          serialNumber: 'SN-0001',
          username: 'user01',
          pinCode: '1234',
          price: '500',
          status: CardStatus.AVAILABLE,
          syncStatus: SyncStatus.SYNCED,
          createdAt: new Date(),
          soldAt: null,
          soldBy: null,
          device: { name: 'Core Router' },
          profile: { name: '1hour' },
        },
      ]);

      const csv = await service.exportCardsCsv(mockTenantId);

      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain('الرقم التسلسلي');
      expect(csv).toContain('SN-0001');
      expect(csv).toContain('user01');
      expect(csv).toContain('AVAILABLE');
    });
  });
});
