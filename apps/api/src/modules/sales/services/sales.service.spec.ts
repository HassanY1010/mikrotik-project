import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CardStatus, PaymentMethod } from '@prisma/client';

describe('SalesService', () => {
  let service: SalesService;
  let prisma: any;
  let encryptionService: any;
  let mikrotikClientFactory: any;
  let mockClient: any;

  const mockTenantId = 'tenant-uuid-1';
  const mockCashierId = 'cashier-uuid-1';
  const mockDeviceId = 'device-uuid-1';
  const mockProfileId = 'profile-uuid-1';

  beforeEach(async () => {
    mockClient = {
      disableHotspotUser: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: mockTenantId,
          name: 'Al-Noor Hotspot',
          phone: '+967-1-234567',
          currency: 'SDG',
        }),
      },
      mikroTikDevice: {
        findFirst: jest.fn().mockResolvedValue({
          id: mockDeviceId,
          name: 'Main Router',
        }),
      },
      hotspotProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: mockProfileId,
          name: '1hour-unlimited',
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: mockCashierId,
          fullName: 'Ahmed Cashier',
        }),
      },
      card: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      saleTransaction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        return cb(prisma);
      }),
    };

    encryptionService = {
      decrypt: jest.fn().mockReturnValue('123456'),
    };

    mikrotikClientFactory = {
      getClient: jest.fn().mockResolvedValue(mockClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: MikrotikClientFactory, useValue: mikrotikClientFactory },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  describe('checkout', () => {
    it('should throw NotFoundException if device does not exist for tenant', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      await expect(
        service.checkout(mockTenantId, mockCashierId, {
          deviceId: mockDeviceId,
          profileId: mockProfileId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if no cards are available', async () => {
      prisma.card.findMany.mockResolvedValue([]);

      await expect(
        service.checkout(mockTenantId, mockCashierId, {
          deviceId: mockDeviceId,
          profileId: mockProfileId,
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should sell available card, mark status as SOLD, and generate thermal receipt', async () => {
      const mockCard = {
        id: 'card-1',
        serialNumber: 'SN-0001',
        username: 'user1001',
        passwordEncrypted: 'enc_pw',
        iv: 'iv_val',
        authTag: 'tag_val',
        pinCode: '123456',
        price: '500',
        timeLimit: '1h',
        dataLimitBytes: null,
        status: CardStatus.AVAILABLE,
      };

      prisma.card.findMany.mockResolvedValue([mockCard]);
      prisma.saleTransaction.create.mockImplementation((args: any) => ({
        id: 'tx-1',
        ...args.data,
        createdAt: new Date(),
      }));

      const res = await service.checkout(mockTenantId, mockCashierId, {
        deviceId: mockDeviceId,
        profileId: mockProfileId,
        paymentMethod: PaymentMethod.CASH,
        quantity: 1,
      });

      expect(prisma.card.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['card-1'] } },
        data: expect.objectContaining({
          status: CardStatus.SOLD,
          soldById: mockCashierId,
        }),
      });

      expect(res.receipts).toHaveLength(1);
      expect(res.receipts[0].username).toBe('user1001');
      expect(res.receipts[0].password).toBe('123456');
      expect(res.receipts[0].price).toBe(500);
      expect(res.receipts[0].qrDataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('refund', () => {
    it('should disable card and command router to disable hotspot user', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        cardId: 'card-1',
        card: { serialNumber: 'SN-0001', username: 'user1001' },
        device: {
          id: mockDeviceId,
          name: 'Main Router',
          host: '10.0.0.1',
          apiPort: 8728,
          useSsl: false,
          username: 'admin',
          passwordEncrypted: 'enc',
          iv: 'iv',
          authTag: 'tag',
          rosVersion: 'V7',
        },
      });

      const res = await service.refund(mockTenantId, 'tx-1', mockCashierId, {
        reason: 'Wrong card type requested by customer',
      });

      expect(prisma.card.update).toHaveBeenCalledWith({
        where: { id: 'card-1' },
        data: { status: CardStatus.DISABLED },
      });
      expect(mockClient.disableHotspotUser).toHaveBeenCalledWith('user1001');
      expect(res.success).toBe(true);
    });
  });

  describe('getShiftSummary', () => {
    it('should aggregate transactions by payment method and profile correctly', async () => {
      prisma.saleTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          amount: '500',
          currency: 'SDG',
          paymentMethod: PaymentMethod.CASH,
          card: { profile: { name: '1hour' } },
        },
        {
          id: 'tx-2',
          amount: '1000',
          currency: 'SDG',
          paymentMethod: PaymentMethod.CASH,
          card: { profile: { name: '3hours' } },
        },
        {
          id: 'tx-3',
          amount: '500',
          currency: 'SDG',
          paymentMethod: PaymentMethod.MOBILE_WALLET,
          card: { profile: { name: '1hour' } },
        },
      ]);

      const summary = await service.getShiftSummary(mockTenantId, mockCashierId);

      expect(summary.totalTransactions).toBe(3);
      expect(summary.totalRevenue).toBe(2000);
      expect(summary.paymentMethodBreakdown[PaymentMethod.CASH].total).toBe(1500);
      expect(summary.paymentMethodBreakdown[PaymentMethod.MOBILE_WALLET].total).toBe(500);
      expect(summary.profileBreakdown).toHaveLength(2);
    });
  });
});
