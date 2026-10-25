import { Test, TestingModule } from '@nestjs/testing';
import { HotspotService } from './hotspot.service';
import { PrismaService } from '../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { CardsService } from '../cards/services/cards.service';
import { QuotasService } from '../cards/services/quotas.service';
import { CardCodeGeneratorService } from '../cards/services/card-code-generator.service';
import { EncryptionService } from '../../core/security/encryption.service';

describe('Hotspot Profile Quota Type & MikroTik Enforcement (Unlimited vs Limited GB)', () => {
  let hotspotService: HotspotService;
  let cardsService: CardsService;

  const mockMikrotikClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    createHotspotProfile: jest.fn().mockResolvedValue('prof-1'),
    updateHotspotProfile: jest.fn().mockResolvedValue(undefined),
    createHotspotUser: jest.fn().mockResolvedValue('user-1'),
    updateHotspotUser: jest.fn().mockResolvedValue(undefined),
    listHotspotProfiles: jest.fn().mockResolvedValue([]),
    listActiveSessions: jest.fn().mockResolvedValue([]),
  };

  const mockMikrotikFactory = {
    getClient: jest.fn().mockResolvedValue(mockMikrotikClient),
  };

  const mockPrisma: any = {
    mikroTikDevice: {
      findFirst: jest.fn(),
    },
    hotspotProfile: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    cardBatch: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ id: 'batch-1', device: { name: 'Main' }, profile: { name: 'prof' } }),
      update: jest.fn().mockResolvedValue({ id: 'batch-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    card: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 10 }),
      updateMany: jest.fn().mockResolvedValue({ count: 10 }),
    },
    cardTemplate: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    printJob: {
      create: jest.fn().mockResolvedValue({ id: 'print-job-1' }),
    },
    tenant: {
      findFirst: jest.fn().mockResolvedValue({ id: 't1' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1', role: { name: 'OWNER' } }),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockQuotasService = {
    checkAndLockQuota: jest.fn().mockResolvedValue({
      canGenerate: true,
      cycleEnd: new Date(),
      isUnlimited: false,
      remainingCards: 1000,
    }),
  };

  const mockEncryptionService = {
    encrypt: jest.fn().mockReturnValue({ ciphertext: 'enc', iv: 'iv', authTag: 'tag' }),
    decrypt: jest.fn().mockReturnValue('decrypted-val'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HotspotService,
        CardsService,
        CardCodeGeneratorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MikrotikClientFactory, useValue: mockMikrotikFactory },
        { provide: QuotasService, useValue: mockQuotasService },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    hotspotService = module.get<HotspotService>(HotspotService);
    cardsService = module.get<CardsService>(CardsService);
  });

  const sampleDevice = {
    id: 'dev-001',
    tenantId: 't1',
    name: 'MikroTik Core CCR',
    host: '192.168.88.1',
    apiPort: 8728,
    isOnline: true,
    rosVersion: '7.12',
    deletedAt: null,
  };

  describe('1. Creating an Unlimited Profile (باقة مفتوحة)', () => {
    it('should save dataLimitBytes as null and return null quota', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockImplementation((args: any) => ({
        id: 'prof-unlimited',
        ...args.data,
      }));

      const res = await hotspotService.createProfile('t1', 'dev-001', {
        name: 'open-speed-2m',
        rateLimit: '2M/2M',
        sessionTimeout: '1d',
        dataLimitGb: undefined, // Unlimited
      });

      expect(mockPrisma.hotspotProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'open-speed-2m',
          dataLimitBytes: null,
        }),
      });
      expect(res.dataLimitBytes).toBeNull();
      expect(res.dataLimitGb).toBeNull();
    });
  });

  describe('2. Creating a Limited Profile in GB (باقة محددة بالجيجابايت)', () => {
    it('should convert 5 GB accurately to 5368709120 bytes', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockImplementation((args: any) => ({
        id: 'prof-5gb',
        ...args.data,
      }));

      const res = await hotspotService.createProfile('t1', 'dev-001', {
        name: 'bundle-5gb-daily',
        rateLimit: '5M/5M',
        sessionTimeout: '1d',
        dataLimitGb: 5, // 5 GB
      });

      // 5 * 1024 * 1024 * 1024 = 5,368,709,120
      const expectedBytes = 5n * 1024n * 1024n * 1024n;
      expect(mockPrisma.hotspotProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'bundle-5gb-daily',
          dataLimitBytes: expectedBytes,
        }),
      });
      expect(res.dataLimitBytes).toBe(5368709120);
      expect(res.dataLimitGb).toBe(5);
    });

    it('should convert 1 GB accurately to 1073741824 bytes', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockImplementation((args: any) => ({
        id: 'prof-1gb',
        ...args.data,
      }));

      const res = await hotspotService.createProfile('t1', 'dev-001', {
        name: 'bundle-1gb-1hour',
        rateLimit: '3M/3M',
        sessionTimeout: '1h',
        dataLimitGb: 1, // 1 GB
      });

      expect(mockPrisma.hotspotProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dataLimitBytes: 1073741824n,
        }),
      });
      expect(res.dataLimitBytes).toBe(1073741824);
      expect(res.dataLimitGb).toBe(1);
    });
  });

  describe('3. Cards Generation & MikroTik RouterOS User Enforcement', () => {
    it('should provision user on MikroTik with limitBytesTotal for limited profile', async () => {
      const limitedProfile = {
        id: 'prof-5gb-id',
        name: 'profile-5gb',
        sessionTimeout: '1d',
        dataLimitBytes: 5368709120n, // 5 GB
        rateLimit: '5M/5M',
      };

      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(limitedProfile);
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.cardBatch.create.mockResolvedValue({ id: 'batch-quota-1', batchNumber: 'BATCH-001' });

      await cardsService.createBatch('t1', 'user-admin', {
        deviceId: 'dev-001',
        profileId: 'prof-5gb-id',
        totalCards: 2,
      });

      // Verify that createHotspotUser was called with limitBytesTotal = 5368709120
      expect(mockMikrotikClient.createHotspotUser).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: 'profile-5gb',
          limitBytesTotal: 5368709120,
        }),
      );
    });

    it('should provision user on MikroTik with undefined limitBytesTotal for unlimited profile', async () => {
      const unlimitedProfile = {
        id: 'prof-unlimited-id',
        name: 'profile-unlimited',
        sessionTimeout: '1d',
        dataLimitBytes: null, // Unlimited
        rateLimit: '2M/2M',
      };

      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(unlimitedProfile);
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.cardBatch.create.mockResolvedValue({ id: 'batch-quota-2', batchNumber: 'BATCH-002' });

      await cardsService.createBatch('t1', 'user-admin', {
        deviceId: 'dev-001',
        profileId: 'prof-unlimited-id',
        totalCards: 2,
      });

      // Verify that createHotspotUser was called without limitBytesTotal
      expect(mockMikrotikClient.createHotspotUser).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: 'profile-unlimited',
          limitBytesTotal: undefined,
        }),
      );
    });
  });

  describe('4. Updating Profile Quota Type (تعديل نوع الباقة)', () => {
    it('should update profile dataLimitBytes, update available cards, and push limit-bytes-total to router', async () => {
      const existingProfile = {
        id: 'prof-switch-id',
        tenantId: 't1',
        deviceId: 'dev-001',
        name: 'profile-switch',
        dataLimitBytes: null, // was unlimited
        device: sampleDevice,
      };

      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(existingProfile);
      mockPrisma.hotspotProfile.update.mockResolvedValue({
        ...existingProfile,
        dataLimitBytes: 10737418240n, // updated to 10 GB
      });
      mockPrisma.card.findMany.mockResolvedValue([
        { username: 'user_active_01' },
      ]);

      const res = await hotspotService.updateTenantProfile('t1', 'prof-switch-id', {
        dataLimitGb: 10,
      });

      // Verify profile update
      expect(mockPrisma.hotspotProfile.update).toHaveBeenCalledWith({
        where: { id: 'prof-switch-id' },
        data: expect.objectContaining({
          dataLimitBytes: 10737418240n,
        }),
      });

      // Verify cards in DB updated
      expect(mockPrisma.card.updateMany).toHaveBeenCalledWith({
        where: { profileId: 'prof-switch-id', status: 'AVAILABLE' },
        data: { dataLimitBytes: 10737418240n },
      });

      // Verify user updated on physical RouterOS
      expect(mockMikrotikClient.updateHotspotUser).toHaveBeenCalledWith(
        'user_active_01',
        { limitBytesTotal: 10737418240 },
      );

      expect(res.dataLimitGb).toBe(10);
      expect(res.dataLimitBytes).toBe(10737418240);
    });

    it('should switch limited profile to unlimited when dataLimitGb is null', async () => {
      const existingProfile = {
        id: 'prof-to-unlimited',
        tenantId: 't1',
        deviceId: 'dev-001',
        name: 'profile-switch-2',
        dataLimitBytes: 5368709120n,
        device: sampleDevice,
      };

      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(existingProfile);
      mockPrisma.hotspotProfile.update.mockResolvedValue({
        ...existingProfile,
        dataLimitBytes: null,
      });
      mockPrisma.card.findMany.mockResolvedValue([{ username: 'user_02' }]);

      const res = await hotspotService.updateTenantProfile('t1', 'prof-to-unlimited', {
        dataLimitGb: null,
      });

      expect(mockPrisma.hotspotProfile.update).toHaveBeenCalledWith({
        where: { id: 'prof-to-unlimited' },
        data: expect.objectContaining({
          dataLimitBytes: null,
        }),
      });

      expect(mockMikrotikClient.updateHotspotUser).toHaveBeenCalledWith(
        'user_02',
        { limitBytesTotal: 0 }, // 0 removes quota in RouterOS
      );

      expect(res.dataLimitGb).toBeNull();
      expect(res.dataLimitBytes).toBeNull();
    });

    it('should gracefully handle router sync errors without failing DB update', async () => {
      const existingProfile = {
        id: 'prof-err-router',
        tenantId: 't1',
        deviceId: 'dev-001',
        name: 'profile-offline',
        dataLimitBytes: 5368709120n,
        device: sampleDevice,
      };

      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(existingProfile);
      mockPrisma.hotspotProfile.update.mockResolvedValue({
        ...existingProfile,
        dataLimitBytes: 10737418240n,
      });
      mockPrisma.card.findMany.mockResolvedValue([{ username: 'card_user_01' }]);

      // Simulate router client failure
      mockMikrotikClient.updateHotspotUser.mockRejectedValueOnce(new Error('Connection timed out'));

      const res = await hotspotService.updateTenantProfile('t1', 'prof-err-router', {
        dataLimitGb: 10,
      });

      // DB update must succeed even if physical router push fails
      expect(mockPrisma.hotspotProfile.update).toHaveBeenCalled();
      expect(mockPrisma.card.updateMany).toHaveBeenCalledWith({
        where: { profileId: 'prof-err-router', status: 'AVAILABLE' },
        data: { dataLimitBytes: 10737418240n },
      });
      expect(res.dataLimitGb).toBe(10);
    });

    it('should NOT alter ACTIVE cards when updating profile quota (protects user consumption and avoids unfair quota reset)', async () => {
      const existingProfile = {
        id: 'prof-protect-active',
        tenantId: 't1',
        deviceId: 'dev-001',
        name: 'profile-fixed-5gb',
        dataLimitBytes: 5368709120n,
        device: sampleDevice,
      };

      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(existingProfile);
      mockPrisma.hotspotProfile.update.mockResolvedValue({
        ...existingProfile,
        dataLimitBytes: 21474836480n, // updated to 20 GB
      });

      await hotspotService.updateTenantProfile('t1', 'prof-protect-active', {
        dataLimitGb: 20,
      });

      // Confirm updateMany is strictly filtered to status: 'AVAILABLE'
      expect(mockPrisma.card.updateMany).toHaveBeenCalledWith({
        where: { profileId: 'prof-protect-active', status: 'AVAILABLE' },
        data: { dataLimitBytes: 21474836480n },
      });

      // Verify it did NOT target ACTIVE or USED cards
      expect(mockPrisma.card.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });
  });

  describe('5. Fractional GB and Precise Conversion', () => {
    it('should convert 0.5 GB (512 MB) accurately to 536870912 bytes', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockImplementation((args: any) => ({
        id: 'prof-half-gb',
        ...args.data,
      }));

      const res = await hotspotService.createProfile('t1', 'dev-001', {
        name: 'bundle-half-gb',
        rateLimit: '1M/1M',
        sessionTimeout: '2h',
        dataLimitGb: 0.5,
      });

      expect(mockPrisma.hotspotProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dataLimitBytes: 536870912n,
        }),
      });
      expect(res.dataLimitBytes).toBe(536870912);
      expect(res.dataLimitGb).toBe(0.5);
    });
  });

  describe('6. Backward Compatibility for Legacy Profiles', () => {
    it('listAllProfiles should handle legacy profiles with null dataLimitBytes seamlessly', async () => {
      mockPrisma.hotspotProfile.findMany.mockResolvedValue([
        {
          id: 'legacy-1',
          name: '1day-unlimited',
          sessionTimeout: '1d',
          rateLimit: '2M/2M',
          sharedUsers: 1,
          deviceId: 'dev-001',
          dataLimitBytes: null,
          device: { id: 'dev-001', name: 'Main' },
          cardBatches: [{ price: 500, validityDays: 1 }],
          _count: { cards: 5 },
        },
      ]);

      const list = await hotspotService.listAllProfiles('t1');
      expect(list).toHaveLength(1);
      expect(list[0].dataLimitBytes).toBeNull();
      expect(list[0].dataLimitGb).toBeNull();
      expect(list[0].name).toBe('1day-unlimited');
    });

    it('listProfiles should safely serialize BigInt to numbers for device routes', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.hotspotProfile.findMany.mockResolvedValue([
        {
          id: 'prof-list-1',
          name: 'fast-5gb',
          dataLimitBytes: 5368709120n,
        },
        {
          id: 'prof-list-2',
          name: 'fast-open',
          dataLimitBytes: null,
        },
      ]);

      const list = await hotspotService.listProfiles('t1', 'dev-001');
      expect(list).toHaveLength(2);
      expect(typeof list[0].dataLimitBytes).toBe('number');
      expect(list[0].dataLimitBytes).toBe(5368709120);
      expect(list[0].dataLimitGb).toBe(5);
      expect(list[1].dataLimitBytes).toBeNull();
      expect(list[1].dataLimitGb).toBeNull();
    });

    it('should reject dataLimitGb <= 0 on createProfile with BadRequestException', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);

      await expect(
        hotspotService.createProfile('t1', 'dev-001', {
          name: 'invalid-zero-quota',
          dataLimitGb: 0,
        }),
      ).rejects.toThrow('حجم البيانات بالجيجابايت يجب أن يكون رقماً موجباً أكبر من الصفر');

      await expect(
        hotspotService.createProfile('t1', 'dev-001', {
          name: 'invalid-negative-quota',
          dataLimitGb: -5,
        }),
      ).rejects.toThrow('حجم البيانات بالجيجابايت يجب أن يكون رقماً موجباً أكبر من الصفر');
    });

    it('should reject dataLimitGb <= 0 on updateTenantProfile with BadRequestException', async () => {
      const existingProfile = {
        id: 'prof-test-err',
        tenantId: 't1',
        deviceId: 'dev-001',
        name: 'profile-test',
        dataLimitBytes: 5368709120n,
        device: sampleDevice,
      };
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(existingProfile);

      await expect(
        hotspotService.updateTenantProfile('t1', 'prof-test-err', {
          dataLimitGb: 0,
        }),
      ).rejects.toThrow('حجم البيانات بالجيجابايت يجب أن يكون رقماً موجباً أكبر من الصفر');

      await expect(
        hotspotService.updateTenantProfile('t1', 'prof-test-err', {
          dataLimitGb: -10,
        }),
      ).rejects.toThrow('حجم البيانات بالجيجابايت يجب أن يكون رقماً موجباً أكبر من الصفر');
    });

    it('should safely handle large quotas (e.g. 1000 GB) without precision loss or overflow', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockImplementation((args: any) => ({
        id: 'prof-large',
        ...args.data,
      }));

      const res = await hotspotService.createProfile('t1', 'dev-001', {
        name: 'terabyte-profile',
        dataLimitGb: 1000,
      });

      // 1000 GB = 1000 * 1024^3 = 1,073,741,824,000 bytes
      expect(res.dataLimitBytes).toBe(1073741824000);
      expect(res.dataLimitGb).toBe(1000);
      expect(Number.isSafeInteger(res.dataLimitBytes)).toBe(true);
    });

    it('should convert dataLimitMb (e.g. 500 MB) accurately to 524288000 bytes', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockImplementation((args: any) => ({
        id: 'prof-mb',
        ...args.data,
      }));

      const res = await hotspotService.createProfile('t1', 'dev-001', {
        name: 'bundle-500mb',
        rateLimit: '2M/2M',
        dataLimitMb: 500,
      });

      // 500 * 1024 * 1024 = 524,288,000 bytes
      expect(mockPrisma.hotspotProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'bundle-500mb',
          dataLimitBytes: 524288000n,
        }),
      });
      expect(res.dataLimitBytes).toBe(524288000);
    });

    it('should create completely open profile (null validity & null dataLimitBytes)', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(sampleDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockImplementation((args: any) => ({
        id: 'prof-open-all',
        ...args.data,
      }));

      const res = await hotspotService.createProfile('t1', 'dev-001', {
        name: 'vip-open-unlimited',
        rateLimit: '10M/10M',
        validity: undefined,
        sessionTimeout: undefined,
        dataLimitGb: null,
      });

      expect(mockPrisma.hotspotProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'vip-open-unlimited',
          sessionTimeout: null,
          dataLimitBytes: null,
        }),
      });
      expect(res.sessionTimeout).toBeNull();
      expect(res.dataLimitBytes).toBeNull();
    });
  });
});
