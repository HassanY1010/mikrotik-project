import { Test, TestingModule } from '@nestjs/testing';
import { CardsService } from './cards.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { CardCodeGeneratorService } from './card-code-generator.service';
import { QuotasService } from './quotas.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { CardStatus, CardBatchStatus, RouterOsVersion, SyncStatus, PrintJobStatus } from '@prisma/client';

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
      deleteHotspotUser: jest.fn().mockResolvedValue(undefined),
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
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      card: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      hotspotActiveSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      cardTemplate: {
        findFirst: jest.fn(),
      },
      printJob: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb))),
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

    const mockQuotaDetails = {
      subscriptionId: 'sub-uuid-1',
      planId: 'plan-uuid-1',
      planName: 'PRO',
      planNameAr: 'احترافي',
      status: 'ACTIVE',
      cycleStart: new Date('2026-10-01'),
      cycleEnd: new Date('2026-11-01'),
      expiresAt: new Date('2027-10-01'),
      isUnlimited: false,
      cardLimit: 50000,
      usedCards: 100,
      remainingCards: 49900,
    };

    const mockQuotasService = {
      checkAndLockQuota: jest.fn().mockResolvedValue(mockQuotaDetails),
      getTenantQuota: jest.fn().mockResolvedValue(mockQuotaDetails),
    };

    prisma.$transaction = jest.fn(async (cb) => {
      return cb(prisma);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: MikrotikClientFactory, useValue: mikrotikClientFactory },
        { provide: CardCodeGeneratorService, useValue: codeGenerator },
        { provide: QuotasService, useValue: mockQuotasService },
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
        isOnline: true,
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

      prisma.cardBatch.findUnique.mockResolvedValue({
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

    it('should throw NotFoundException if templateId is specified but template does not exist', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue({ id: mockDeviceId });
      prisma.hotspotProfile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.cardTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.createBatch(mockTenantId, mockUserId, {
          deviceId: mockDeviceId,
          profileId: mockProfileId,
          totalCards: 2,
          price: 500,
          templateId: 'non-existent-template-id',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should link matchedTemplate and create PrintJob record when valid templateId is provided', async () => {
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
        isOnline: true,
      });

      prisma.hotspotProfile.findFirst.mockResolvedValue({
        id: mockProfileId,
        name: '1hour-unlimited',
        sessionTimeout: '1h',
      });

      prisma.cardTemplate.findFirst.mockResolvedValue({
        id: 'tpl-custom-1',
        name: 'قالب كرت مخصص',
        themePreset: 'TURQUOISE',
        widthMm: 85,
      });

      prisma.card.findMany.mockResolvedValue([]);
      prisma.card.createMany.mockResolvedValue({ count: 2 });

      prisma.cardBatch.create.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'B-261003-ABCD',
        totalCards: 2,
        price: '500',
        themePreset: 'TURQUOISE',
        createdAt: new Date(),
      });

      prisma.cardBatch.findUnique.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'B-261003-ABCD',
        totalCards: 2,
        price: '500',
        status: CardBatchStatus.COMPLETED,
        themePreset: 'TURQUOISE',
        createdAt: new Date(),
        device: { name: 'Core Router' },
        profile: { name: '1hour-unlimited' },
      });

      const result = await service.createBatch(mockTenantId, mockUserId, {
        deviceId: mockDeviceId,
        profileId: mockProfileId,
        totalCards: 2,
        price: 500,
        templateId: 'tpl-custom-1',
      });

      expect(prisma.printJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          templateId: 'tpl-custom-1',
          cardBatchId: mockBatchId,
          printerType: 'A4_SHEET',
          status: PrintJobStatus.PENDING,
          totalCards: 2,
        }),
      });
      expect(result.batch.templateId).toBe('tpl-custom-1');
      expect(result.batch.templateName).toBe('قالب كرت مخصص');
      expect(result.batch.themePreset).toBe('TURQUOISE');
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
          isOnline: true,
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

  describe('bulkDeleteCards and deleteSingleCard', () => {
    const mockDevice = {
      id: mockDeviceId,
      name: 'Main MikroTik',
      host: '192.168.88.1',
      apiPort: 8728,
      restPort: 443,
      useSsl: false,
      username: 'admin',
      passwordEncrypted: 'cipher',
      iv: 'iv',
      authTag: 'tag',
      rosVersion: 'V7',
    };

    it('should bulk delete unsold cards from DB and delete users from MikroTik router', async () => {
      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-1',
          username: 'user001',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
        {
          id: 'card-2',
          username: 'user002',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-1', 'card-2'],
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
      expect(result.mikrotikRemovedCount).toBe(2);
      expect(mockClient.deleteHotspotUser).toHaveBeenCalledWith('user001');
      expect(mockClient.deleteHotspotUser).toHaveBeenCalledWith('user002');
      expect(prisma.card.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          id: { in: ['card-1', 'card-2'] },
        },
      });
    });

    it('should skip sold cards to preserve audit and financial records', async () => {
      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-sold',
          username: 'userSold',
          status: CardStatus.SOLD,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [{ id: 'sale-1', invoiceNumber: 'INV-101' }],
        },
        {
          id: 'card-available',
          username: 'userAvail',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-sold', 'card-available'],
      });

      expect(result.deletedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.details.skipped[0].id).toBe('card-sold');
      expect(result.details.deletedIds).toEqual(['card-available']);
      expect(mockClient.deleteHotspotUser).toHaveBeenCalledWith('userAvail');
      expect(mockClient.deleteHotspotUser).not.toHaveBeenCalledWith('userSold');
    });

    it('should NOT delete card from DB when router is offline, preserving record with DISABLED and PENDING_ROUTER_DELETION', async () => {
      mikrotikClientFactory.getClient.mockRejectedValueOnce(new Error('Connection timed out'));

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-offline',
          username: 'userOffline',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-offline'],
      });

      // Crucial: operation is NOT marked fully successful when router deletion fails
      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      expect(result.pendingCount).toBe(1);
      expect(result.mikrotikPendingCount).toBe(1);
      expect(result.mikrotikRemovedCount).toBe(0);
      // Hard delete MUST NOT be called on DB
      expect(prisma.card.deleteMany).not.toHaveBeenCalled();
      // Record must be preserved as DISABLED with PENDING_ROUTER_DELETION in DB
      expect(prisma.card.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          id: { in: ['card-offline'] },
        },
        data: expect.objectContaining({
          status: CardStatus.DISABLED,
          syncStatus: SyncStatus.FAILED,
          syncError: expect.stringContaining('PENDING_ROUTER_DELETION'),
        }),
      });
    });

    it('should handle partial failure when one card succeeds on router and another fails', async () => {
      mockClient.deleteHotspotUser
        .mockResolvedValueOnce(undefined) // first succeeds
        .mockRejectedValueOnce(new Error('Router internal error')); // second fails

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-ok',
          username: 'userOk',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
        {
          id: 'card-fail',
          username: 'userFail',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-ok', 'card-fail'],
      });

      expect(result.success).toBe(false); // Not fully successful because of partial router failure
      expect(result.deletedCount).toBe(1);
      expect(result.pendingCount).toBe(1);
      expect(result.mikrotikRemovedCount).toBe(1);
      expect(result.mikrotikPendingCount).toBe(1);
      expect(result.details.deletedIds).toEqual(['card-ok']);
      expect(result.details.pendingIds).toEqual(['card-fail']);
      // card-ok is deleted from DB
      expect(prisma.card.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, id: { in: ['card-ok'] } },
      });
      // card-fail is kept in DB as DISABLED
      expect(prisma.card.updateMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, id: { in: ['card-fail'] } },
        data: expect.objectContaining({
          status: CardStatus.DISABLED,
          syncError: expect.stringContaining('PENDING_ROUTER_DELETION'),
        }),
      });
    });

    it('should retry pending deletions and permanently clean up cards once router is reachable', async () => {
      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-pending-1',
          username: 'userPending1',
          status: CardStatus.DISABLED,
          deviceId: mockDeviceId,
          device: mockDevice,
          syncError: 'PENDING_ROUTER_DELETION: timeout',
        },
      ]);

      const retryRes = await service.retryPendingDeletions(mockTenantId, mockDeviceId);

      expect(retryRes.processedCount).toBe(1);
      expect(retryRes.cleanedCount).toBe(1);
      expect(retryRes.stillPendingCount).toBe(0);
      expect(mockClient.deleteHotspotUser).toHaveBeenCalledWith('userPending1');
      expect(prisma.card.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, id: { in: ['card-pending-1'] } },
      });
    });

    it('should report cards not found or belonging to another tenant', async () => {
      prisma.card.findMany.mockResolvedValue([]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['alien-card-999'],
      });

      expect(result.deletedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.details.failed[0].id).toBe('alien-card-999');
    });

    it('should NOT delete card from DB if router returns 403 Forbidden or permission error, categorizing as pending', async () => {
      mockClient.deleteHotspotUser.mockRejectedValueOnce(
        new Error('MikroTik REST error (403 Forbidden): not enough permissions'),
      );

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-perm-err',
          username: 'userPermErr',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-perm-err'],
      });

      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      expect(result.pendingCount).toBe(1);
      expect(result.mikrotikPendingCount).toBe(1);
      // Hard delete MUST NOT be called
      expect(prisma.card.deleteMany).not.toHaveBeenCalled();
      // Must be preserved in DB as DISABLED
      expect(prisma.card.updateMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, id: { in: ['card-perm-err'] } },
        data: expect.objectContaining({
          status: CardStatus.DISABLED,
          syncError: expect.stringContaining('PENDING_ROUTER_DELETION'),
        }),
      });
    });

    it('should safely hard-delete card from DB if router returns true 404 / no such item (user already gone from router)', async () => {
      mockClient.deleteHotspotUser.mockRejectedValueOnce(
        new Error('MikroTik REST error (404 Not Found): no such item'),
      );

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-404',
          username: 'user404',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-404'],
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
      expect(result.pendingCount).toBe(0);
      expect(result.mikrotikRemovedCount).toBe(1);
      expect(prisma.card.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, id: { in: ['card-404'] } },
      });
    });

    it('should reject concurrent deletion attempts on the same card IDs with ConflictException', async () => {
      let resolveFirstFind: any;
      const firstFindPromise = new Promise((resolve) => {
        resolveFirstFind = resolve;
      });

      prisma.card.findMany.mockImplementationOnce(() => firstFindPromise);

      const firstCall = service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-concurrent-1'],
      });

      // Second call while first call is in-flight with same cardId
      await expect(
        service.bulkDeleteCards(mockTenantId, {
          cardIds: ['card-concurrent-1'],
        }),
      ).rejects.toThrow(ConflictException);

      // Clean up first call
      resolveFirstFind([
        {
          id: 'card-concurrent-1',
          username: 'userConcurrent1',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);
      await firstCall;
    });

    it('should reject concurrent retryPendingDeletions for the same tenant with ConflictException', async () => {
      let resolveFirstFind: any;
      const firstFindPromise = new Promise((resolve) => {
        resolveFirstFind = resolve;
      });

      prisma.card.findMany.mockImplementationOnce(() => firstFindPromise);

      const firstRetry = service.retryPendingDeletions(mockTenantId);

      await expect(service.retryPendingDeletions(mockTenantId)).rejects.toThrow(ConflictException);

      resolveFirstFind([]);
      await firstRetry;
    });

    it('should handle repeated idempotent deletion requests gracefully without side-effects', async () => {
      // First call deletes card
      prisma.card.findMany.mockResolvedValueOnce([
        {
          id: 'card-idemp',
          username: 'userIdemp',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const res1 = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-idemp'],
      });
      expect(res1.deletedCount).toBe(1);

      // Second call with same card ID after DB deletion returns failedCount: 1 with clear explanation
      prisma.card.findMany.mockResolvedValueOnce([]);
      const res2 = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-idemp'],
      });
      expect(res2.deletedCount).toBe(0);
      expect(res2.failedCount).toBe(1);
      expect(res2.details.failed[0].id).toBe('card-idemp');
    });

    it('should reject generic proxy/gateway 404 HTML errors from being treated as user absence', async () => {
      mockClient.deleteHotspotUser.mockRejectedValueOnce(
        new Error('MikroTik REST error (404 Not Found): <html><head><title>404 Not Found</title></head><body>nginx</body></html>'),
      );

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-proxy-404',
          username: 'userProxy404',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-proxy-404'],
      });

      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      expect(result.pendingCount).toBe(1);
      expect(prisma.card.deleteMany).not.toHaveBeenCalled();
      expect(prisma.card.updateMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, id: { in: ['card-proxy-404'] } },
        data: expect.objectContaining({
          status: CardStatus.DISABLED,
          syncError: expect.stringContaining('PENDING_ROUTER_DELETION'),
        }),
      });
    });

    it('should recognize RouterOS Socket API trap "!trap =message=no such item" as HotSpot user absence', async () => {
      mockClient.deleteHotspotUser.mockRejectedValueOnce(
        new Error('MikroTik API error: !trap =category=2 =message=no such item'),
      );

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-socket-trap',
          username: 'userSocketTrap',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-socket-trap'],
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
      expect(prisma.card.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, id: { in: ['card-socket-trap'] } },
      });
    });

    it('should recover gracefully and reconcile DB with reality if backend crashes after router deletion but before DB update', async () => {
      // Step 1: Simulated previous run removed user from router, but backend died before PostgreSQL update.
      // Step 2: Backend rebooted, recovery / repeat bulk delete is called on the card.
      // Router now reports user is gone ('no such item').
      mockClient.deleteHotspotUser.mockRejectedValueOnce(
        new Error('MikroTik REST error (404 Not Found): {"detail":"no such item"}'),
      );

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-reboot-reconcile',
          username: 'userReconciled',
          status: CardStatus.DISABLED,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const result = await service.bulkDeleteCards(mockTenantId, {
        cardIds: ['card-reboot-reconcile'],
      });

      // System recognizes user was already deleted from router and completes DB cleanup
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
      expect(result.pendingCount).toBe(0);
      expect(prisma.card.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, id: { in: ['card-reboot-reconcile'] } },
      });
    });

    it('should delete a single card and return success message', async () => {
      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-single',
          username: 'singleUser',
          status: CardStatus.AVAILABLE,
          deviceId: mockDeviceId,
          device: mockDevice,
          sales: [],
        },
      ]);

      const res = await service.deleteSingleCard(mockTenantId, 'card-single');
      expect(res.success).toBe(true);
      expect(res.mikrotikRemoved).toBe(true);
    });
  });
});
