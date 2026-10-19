import { Test, TestingModule } from '@nestjs/testing';
import { HotspotService } from './hotspot.service';
import { PrismaService } from '../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { CardsService } from '../cards/services/cards.service';
import { QuotasService } from '../cards/services/quotas.service';
import { CardCodeGeneratorService } from '../cards/services/card-code-generator.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { isValidValidityDuration, parseValidityParts } from '../../common/utils/validity-duration.util';

describe('Hotspot Validity Duration Integration & MikroTik Provisioning (m, h, d)', () => {
  let hotspotService: HotspotService;
  let cardsService: CardsService;

  const mockMikrotikClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    createHotspotProfile: jest.fn().mockResolvedValue('prof-1'),
    updateHotspotProfile: jest.fn().mockResolvedValue(undefined),
    createHotspotUser: jest.fn().mockResolvedValue('user-1'),
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
      findUnique: jest.fn().mockResolvedValue({ id: 'batch-30m', device: { name: 'Core Router' }, profile: { name: 'fast-30m' } }),
      update: jest.fn().mockResolvedValue({ id: 'batch-30m' }),
    },
    card: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 10 }),
      updateMany: jest.fn().mockResolvedValue({ count: 10 }),
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

  describe('1. Unit Validity Duration Validation (m, h, d)', () => {
    const validDurations = ['1m', '5m', '15m', '30m', '1h', '3h', '12h', '1d', '3d', '7d', '30d'];
    const invalidDurations = ['', '0m', '-1m', '1x', 'abc', '1', '1.5h', '0.5d', '1d3h'];

    it.each(validDurations)('should validate and accept "%s"', (val) => {
      expect(isValidValidityDuration(val)).toBe(true);
    });

    it.each(invalidDurations)('should strictly reject invalid format "%s"', (val) => {
      expect(isValidValidityDuration(val)).toBe(false);
    });
  });

  describe('2. Hotspot Profile Creation & Provisioning on MikroTik', () => {
    const tenantId = 'tenant-test-01';
    const deviceId = 'device-test-01';

    const testDevice = {
      id: deviceId,
      name: 'Main MikroTik Core',
      tenantId,
      host: '192.168.88.1',
      apiPort: 8728,
      restPort: 443,
      useSsl: false,
      username: 'admin',
      passwordEncrypted: 'enc',
      iv: 'iv',
      authTag: 'tag',
      rosVersion: '7.12',
      isOnline: true,
      deletedAt: null,
    };

    it('should create Hotspot Profile with 1m (1 minute) validity and provision session-timeout=1m to MikroTik', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(testDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockResolvedValue({
        id: 'prof-1m',
        name: 'test-1m',
        sessionTimeout: '1m',
        tenantId,
        deviceId,
      });

      const profile = await hotspotService.createProfile(tenantId, deviceId, {
        name: 'test-1m',
        validity: '1m',
        rateLimit: '2M/2M',
      });

      expect(mockMikrotikClient.createHotspotProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-1m',
          sessionTimeout: '1m',
        }),
      );
      expect(mockPrisma.hotspotProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'test-1m',
          sessionTimeout: '1m',
        }),
      });
      expect(profile.sessionTimeout).toBe('1m');
    });

    it('should create Hotspot Profile with 1h (1 hour) validity and provision session-timeout=1h to MikroTik', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(testDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockResolvedValue({
        id: 'prof-1h',
        name: 'test-1h',
        sessionTimeout: '1h',
        tenantId,
        deviceId,
      });

      await hotspotService.createProfile(tenantId, deviceId, {
        name: 'test-1h',
        validity: '1h',
      });

      expect(mockMikrotikClient.createHotspotProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-1h',
          sessionTimeout: '1h',
        }),
      );
    });

    it('should create Hotspot Profile with 1d (1 day) validity preserving traditional day validity', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(testDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockResolvedValue({
        id: 'prof-1d',
        name: 'test-1d',
        sessionTimeout: '1d',
        tenantId,
        deviceId,
      });

      await hotspotService.createProfile(tenantId, deviceId, {
        name: 'test-1d',
        validity: '1d',
      });

      expect(mockMikrotikClient.createHotspotProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-1d',
          sessionTimeout: '1d',
        }),
      );
    });
  });

  describe('3. Hotspot Profile Update with Minute / Hour / Day Durations', () => {
    it('should update profile validity to 15m and sync to MikroTik router', async () => {
      const existingProfile = {
        id: 'prof-update-01',
        name: 'quick-net',
        tenantId: 'tenant-01',
        deviceId: 'device-01',
        sessionTimeout: '1h',
        device: {
          id: 'device-01',
          name: 'Core Router',
          host: '10.0.0.1',
          isOnline: true,
        },
      };

      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(existingProfile);
      mockPrisma.hotspotProfile.update.mockResolvedValue({
        ...existingProfile,
        sessionTimeout: '15m',
      });

      const updated = await hotspotService.updateTenantProfile('tenant-01', 'prof-update-01', {
        validity: '15m',
      });

      expect(mockMikrotikClient.updateHotspotProfile).toHaveBeenCalledWith(
        'quick-net',
        expect.objectContaining({
          sessionTimeout: '15m',
        }),
      );
      expect(mockPrisma.hotspotProfile.update).toHaveBeenCalledWith({
        where: { id: 'prof-update-01' },
        data: expect.objectContaining({
          sessionTimeout: '15m',
        }),
      });
      expect(updated.sessionTimeout).toBe('15m');
    });
  });

  describe('4. Card Generation & User Provisioning with Minute / Hour / Day limit-uptime', () => {
    it('should propagate 30m validity duration from profile to card limitUptime on MikroTik', async () => {
      const profile = {
        id: 'prof-30m',
        name: 'fast-30m',
        sessionTimeout: '30m',
        price: 250,
      };

      const testDevice = {
        id: 'device-01',
        name: 'Core Router',
        tenantId: 'tenant-01',
        isOnline: true,
      };

      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(profile);
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(testDevice);
      mockPrisma.cardBatch.create.mockResolvedValue({ id: 'batch-30m', batchNumber: 'B30M' });

      await cardsService.createBatch('tenant-01', 'user-01', {
        deviceId: 'device-01',
        profileId: 'prof-30m',
        totalCards: 2,
      });

      // Verify each user created on MikroTik gets limitUptime='30m'
      expect(mockMikrotikClient.createHotspotUser).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: 'fast-30m',
          limitUptime: '30m',
        }),
      );
    });
  });

  describe('5. Profiles Listing with Normalized Validity & Arabic Display', () => {
    it('should return normalized validity duration and formatted display name', async () => {
      mockPrisma.hotspotProfile.findMany.mockResolvedValue([
        {
          id: 'p-1',
          name: '15min-speed',
          sessionTimeout: '15m',
          rateLimit: '5M/5M',
          sharedUsers: 1,
          deviceId: 'd-1',
          device: { id: 'd-1', name: 'R1' },
          cardBatches: [],
          _count: { cards: 50 },
        },
        {
          id: 'p-2',
          name: '1hour-unlimited',
          sessionTimeout: '1h',
          rateLimit: '2M/2M',
          sharedUsers: 1,
          deviceId: 'd-1',
          device: { id: 'd-1', name: 'R1' },
          cardBatches: [],
          _count: { cards: 20 },
        },
      ]);

      const profiles = await hotspotService.listAllProfiles('tenant-01');

      expect(profiles[0].validity).toBe('15m');
      expect(profiles[0].sessionTimeout).toBe('15m');
      expect(profiles[0].displayName).toContain('15 دقيقة');
      expect(profiles[1].validity).toBe('1h');
      expect(profiles[1].sessionTimeout).toBe('1h');
      expect(profiles[1].displayName).toBe('باقة 1 ساعة (إنترنت مفتوح)');
    });
  });

  describe('6. Validity Decomposition (parseValidityParts)', () => {
    it('should correctly decompose minutes, hours, and days into amount and unit', () => {
      expect(parseValidityParts('1m')).toEqual({ amount: 1, unit: 'm' });
      expect(parseValidityParts('30M')).toEqual({ amount: 30, unit: 'm' });
      expect(parseValidityParts('50m')).toEqual({ amount: 50, unit: 'm' });

      expect(parseValidityParts('1h')).toEqual({ amount: 1, unit: 'h' });
      expect(parseValidityParts('5H')).toEqual({ amount: 5, unit: 'h' });
      expect(parseValidityParts('70h')).toEqual({ amount: 70, unit: 'h' });

      expect(parseValidityParts('1d')).toEqual({ amount: 1, unit: 'd' });
      expect(parseValidityParts('7D')).toEqual({ amount: 7, unit: 'd' });
      expect(parseValidityParts('30d')).toEqual({ amount: 30, unit: 'd' });
    });

    it('should support legacy week conversions safely', () => {
      expect(parseValidityParts('1w')).toEqual({ amount: 7, unit: 'd' });
      expect(parseValidityParts('2w')).toEqual({ amount: 14, unit: 'd' });
    });

    it('should handle null, empty, and invalid values gracefully with defaults', () => {
      expect(parseValidityParts(null)).toEqual({ amount: 1, unit: 'd' });
      expect(parseValidityParts('')).toEqual({ amount: 1, unit: 'd' });
      expect(parseValidityParts('invalid', 5, 'h')).toEqual({ amount: 5, unit: 'h' });
    });
  });

  describe('7. Case-Insensitive Inputs (30M, 5H, 7D) & MikroTik Provisioning', () => {
    const tenantId = 'tenant-test-01';
    const deviceId = 'device-test-01';

    const testDevice = {
      id: deviceId,
      name: 'Main MikroTik Core',
      tenantId,
      host: '192.168.88.1',
      apiPort: 8728,
      restPort: 443,
      useSsl: false,
      username: 'admin',
      passwordEncrypted: 'enc',
      iv: 'iv',
      authTag: 'tag',
      rosVersion: '7.12',
      isOnline: true,
      deletedAt: null,
    };

    it('should normalize uppercase "30M" to lowercase "30m" and provision session-timeout=30m to MikroTik', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(testDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockResolvedValue({
        id: 'prof-30m',
        name: 'test-30m',
        sessionTimeout: '30m',
        tenantId,
        deviceId,
      });

      const profile = await hotspotService.createProfile(tenantId, deviceId, {
        name: 'test-30m',
        validity: '30M',
      });

      expect(mockMikrotikClient.createHotspotProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTimeout: '30m',
        }),
      );
      expect(mockPrisma.hotspotProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionTimeout: '30m',
        }),
      });
      expect(profile.sessionTimeout).toBe('30m');
    });

    it('should normalize uppercase "5H" to lowercase "5h" and provision session-timeout=5h to MikroTik', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(testDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockResolvedValue({
        id: 'prof-5h',
        name: 'test-5h',
        sessionTimeout: '5h',
        tenantId,
        deviceId,
      });

      await hotspotService.createProfile(tenantId, deviceId, {
        name: 'test-5h',
        validity: '5H',
      });

      expect(mockMikrotikClient.createHotspotProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTimeout: '5h',
        }),
      );
    });

    it('should normalize uppercase "7D" to lowercase "7d" and provision session-timeout=7d to MikroTik', async () => {
      mockPrisma.mikroTikDevice.findFirst.mockResolvedValue(testDevice);
      mockPrisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockPrisma.hotspotProfile.create.mockResolvedValue({
        id: 'prof-7d',
        name: 'test-7d',
        sessionTimeout: '7d',
        tenantId,
        deviceId,
      });

      await hotspotService.createProfile(tenantId, deviceId, {
        name: 'test-7d',
        validity: '7D',
      });

      expect(mockMikrotikClient.createHotspotProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTimeout: '7d',
        }),
      );
    });
  });
});

