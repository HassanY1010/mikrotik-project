import { Test, TestingModule } from '@nestjs/testing';
import { CardsService } from './cards.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { CardCodeGeneratorService } from './card-code-generator.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CardStatus, CardBatchStatus, RouterOsVersion, SyncStatus } from '@prisma/client';

describe('CardsService', () => {
  let service: CardsService;
  let prisma: any;
  let encryptionService: any;
  let mikrotikClientFactory: any;
  let codeGenerator: any;
  let mockClient: any;

  const mockTenantId = 'tenant-uuid-1';
  const mockUserId = 'user-uuid-1';
  const mockDeviceId = 'device-uuid-1';
  const mockProfileId = 'profile-uuid-1';
  const mockBatchId = 'batch-uuid-1';

  beforeEach(async () => {
    mockClient = {
      createHotspotUser: jest.fn().mockResolvedValue('*1'),
      disableHotspotUser: jest.fn().mockResolvedValue(undefined),
      enableHotspotUser: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      mikroTikDevice: {
        findFirst: jest.fn(),
      },
      hotspotProfile: {
        findFirst: jest.fn(),
      },
      cardBatch: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      card: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'cipher_hex',
        iv: 'iv_hex',
        authTag: 'tag_hex',
      }),
      decrypt: jest.fn().mockReturnValue('plain_secret'),
    };

    mikrotikClientFactory = {
      getClient: jest.fn().mockResolvedValue(mockClient),
    };

    codeGenerator = {
      generateBatchNumber: jest.fn().mockReturnValue('B-261003-ABCD'),
      generateBatchCodes: jest.fn().mockReturnValue(['10010001', '10010002']),
      generatePin: jest.fn().mockReturnValue('1234'),
      generateSerialNumber: jest.fn((batch, i) => `${batch}-000${i}`),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: MikrotikClientFactory, useValue: mikrotikClientFactory },
        { provide: CardCodeGeneratorService, useValue: codeGenerator },
      ],
    }).compile();

    service = module.get<CardsService>(CardsService);
  });

  describe('createBatch', () => {
    it('should throw NotFoundException if device does not exist for tenant', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      await expect(
        service.createBatch(mockTenantId, mockUserId, {
          deviceId: mockDeviceId,
          profileId: mockProfileId,
          totalCards: 2,
          price: 500,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if profile does not exist on device', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue({ id: mockDeviceId });
      prisma.hotspotProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.createBatch(mockTenantId, mockUserId, {
          deviceId: mockDeviceId,
          profileId: mockProfileId,
          totalCards: 2,
          price: 500,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create batch, insert cards with encrypted credentials, and provision on router', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue({
        id: mockDeviceId,
        name: 'Core Router',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'pw',
        iv: 'iv',
        authTag: 'tag',
        rosVersion: RouterOsVersion.V7,
      });

      prisma.hotspotProfile.findFirst.mockResolvedValue({
        id: mockProfileId,
        name: '1hour-unlimited',
        sessionTimeout: '1h',
      });

      prisma.cardBatch.create.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'B-261003-ABCD',
        status: CardBatchStatus.PROCESSING,
      });

      prisma.card.findMany.mockResolvedValue([]);
      prisma.card.createMany.mockResolvedValue({ count: 2 });

      prisma.cardBatch.update.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'B-261003-ABCD',
        totalCards: 2,
        price: '500',
        status: CardBatchStatus.COMPLETED,
        createdAt: new Date(),
        device: { name: 'Core Router' },
        profile: { name: '1hour-unlimited' },
      });

      const result = await service.createBatch(mockTenantId, mockUserId, {
        deviceId: mockDeviceId,
        profileId: mockProfileId,
        totalCards: 2,
        price: 500,
        syncToRouter: true,
      });

      expect(prisma.card.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            username: '10010001',
            passwordEncrypted: 'cipher_hex',
            serialNumber: 'B-261003-ABCD-0001',
          }),
        ]),
      });

      expect(mockClient.createHotspotUser).toHaveBeenCalledTimes(2);
      expect(prisma.card.updateMany).toHaveBeenCalledWith({
        where: {
          batchId: mockBatchId,
          username: { in: ['10010001', '10010002'] },
        },
        data: {
          syncStatus: SyncStatus.SYNCED,
          syncError: null,
        },
      });

      expect(result.batch.status).toBe(CardBatchStatus.COMPLETED);
      expect(result.batch.syncedToRouter).toBe(true);
    });
  });

  describe('updateCardStatus', () => {
    it('should throw BadRequestException on illegal status transition', async () => {
      prisma.card.findFirst.mockResolvedValue({
        id: 'card-1',
        status: CardStatus.AVAILABLE,
        device: { id: mockDeviceId },
      });

      // AVAILABLE -> EXPIRED is illegal (must be SOLD then ACTIVE first)
      await expect(
        service.updateCardStatus(mockTenantId, 'card-1', {
          status: CardStatus.EXPIRED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow legal transition from AVAILABLE to DISABLED and command router', async () => {
      prisma.card.findFirst.mockResolvedValue({
        id: 'card-1',
        username: '10010001',
        status: CardStatus.AVAILABLE,
        device: {
          id: mockDeviceId,
          name: 'Core Router',
          host: '192.168.88.1',
          apiPort: 8728,
          useSsl: false,
          username: 'admin',
          passwordEncrypted: 'pw',
          iv: 'iv',
          authTag: 'tag',
          rosVersion: RouterOsVersion.V7,
        },
      });

      prisma.card.update.mockResolvedValue({
        id: 'card-1',
        batchId: mockBatchId,
        serialNumber: 'SN-0001',
        username: '10010001',
        pinCode: '1234',
        price: '500',
        status: CardStatus.DISABLED,
        validityDays: null,
        timeLimit: '1h',
        dataLimitBytes: null,
        syncStatus: SyncStatus.SYNCED,
        soldAt: null,
        activatedAt: null,
        expiresAt: null,
        createdAt: new Date(),
      });

      const res = await service.updateCardStatus(mockTenantId, 'card-1', {
        status: CardStatus.DISABLED,
      });

      expect(mockClient.disableHotspotUser).toHaveBeenCalledWith('10010001');
      expect(res.status).toBe(CardStatus.DISABLED);
    });
  });
});
