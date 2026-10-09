import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { CardStatus, PaymentMethod } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('SyncService', () => {
  let service: SyncService;
  let prisma: any;
  let encryptionService: any;

  const mockTenantId = 'tenant-uuid-1';
  const mockCashierId = 'cashier-uuid-1';
  const mockDeviceId = 'device-uuid-1';
  const mockProfileId = 'profile-uuid-1';

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ currency: 'SDG' }),
      },
      card: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'card-1', status: CardStatus.SOLD }),
      },
      saleTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'tx-sync-1' }),
      },
      mikroTikDevice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      hotspotProfile: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      cardBatch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (ops: any[]) => {
        return Promise.all(ops);
      }),
    };

    encryptionService = {
      decrypt: jest.fn().mockReturnValue('1234'),
      tryDecrypt: jest.fn().mockReturnValue('1234'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  describe('pushMutations', () => {
    it('should reconcile valid offline sale mutation and return APPLIED', async () => {
      prisma.card.findFirst.mockResolvedValue({
        id: 'card-1',
        serialNumber: 'SN-0001',
        status: CardStatus.AVAILABLE,
        deviceId: mockDeviceId,
        price: '500',
      });

      const res = await service.pushMutations(mockTenantId, mockCashierId, {
        mutations: [
          {
            clientMutationId: 'mut-1',
            type: 'SALE',
            payload: { cardId: 'card-1', paymentMethod: PaymentMethod.CASH },
            createdAt: new Date().toISOString(),
          },
        ],
      });

      expect(res.processedMutations).toHaveLength(1);
      expect(res.processedMutations[0].status).toBe('APPLIED');
      expect(res.processedMutations[0].clientMutationId).toBe('mut-1');
    });

    it('should detect CONFLICT if card was already SOLD or DISABLED on the server', async () => {
      prisma.card.findFirst.mockResolvedValue({
        id: 'card-2',
        serialNumber: 'SN-0002',
        status: CardStatus.SOLD, // already sold
        deviceId: mockDeviceId,
        price: '500',
      });

      const res = await service.pushMutations(mockTenantId, mockCashierId, {
        mutations: [
          {
            clientMutationId: 'mut-conflict',
            type: 'SALE',
            payload: { cardId: 'card-2' },
            createdAt: new Date().toISOString(),
          },
        ],
      });

      expect(res.processedMutations).toHaveLength(1);
      expect(res.processedMutations[0].status).toBe('CONFLICT');
      expect(res.processedMutations[0].error).toContain('already SOLD');
    });
  });

  describe('reserveCards', () => {
    it('should reserve available cards with decrypted credentials for offline mobile wallet', async () => {
      prisma.hotspotProfile.findFirst.mockResolvedValue({
        id: mockProfileId,
        name: '1hour',
      });

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-res-1',
          serialNumber: 'SN-1001',
          username: 'user1001',
          passwordEncrypted: 'enc',
          iv: 'iv',
          authTag: 'tag',
          pinCode: '1234',
          price: '500',
          timeLimit: '1h',
          dataLimitBytes: null,
        },
      ]);

      const cards = await service.reserveCards(mockTenantId, mockCashierId, {
        deviceId: mockDeviceId,
        profileId: mockProfileId,
        quantity: 1,
      });

      expect(cards).toHaveLength(1);
      expect(cards[0].username).toBe('user1001');
      expect(cards[0].password).toBe('1234');
      expect(cards[0].qrPayload).toContain(
        'http://login.hotspot/login?username=user1001&password=1234',
      );
    });

    it('should throw BadRequestException if available cards are fewer than requested quantity', async () => {
      prisma.hotspotProfile.findFirst.mockResolvedValue({ id: mockProfileId, name: '1hour' });
      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-1',
          serialNumber: 'SN-1',
          username: 'u1',
          passwordEncrypted: 'enc',
          iv: 'iv',
          authTag: 'tag',
          pinCode: '111',
          price: '200',
        },
      ]);

      await expect(
        service.reserveCards(mockTenantId, mockCashierId, {
          deviceId: mockDeviceId,
          profileId: mockProfileId,
          quantity: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
