import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { HotspotService } from '../hotspot/hotspot.service';
import { CardsService } from '../cards/services/cards.service';
import { PortalService } from '../portal/portal.service';
import { PrismaService } from '../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { AgentService } from '../agent/agent.service';
import { PortalCompilerService } from '../portal/portal-compiler.service';
import { CardCodeGeneratorService } from '../cards/services/card-code-generator.service';
import { QuotasService } from '../cards/services/quotas.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { DeviceStatus } from '@prisma/client';

describe('Private LAN Operations Hardening (100% Root Cause Verification)', () => {
  const tenantId = 'test-tenant-uuid';
  const privateDeviceId = 'private-device-uuid';

  let devicesService: DevicesService;
  let hotspotService: HotspotService;
  let cardsService: CardsService;
  let portalService: PortalService;
  let prisma: any;
  let mikrotikClientFactory: any;
  let agentService: any;

  beforeEach(async () => {
    // Register private router as confirmed local online, but cloud offline
    DevicesService.updateChannelState(privateDeviceId, {
      localStatus: 'ONLINE',
      cloudStatus: 'OFFLINE',
    });

    const mockDevice = {
      id: privateDeviceId,
      tenantId,
      name: 'HAMDI NET',
      host: '192.168.1.114',
      apiPort: 8728,
      restPort: 80,
      useSsl: false,
      username: 'admin',
      passwordEncrypted: 'mock-enc',
      iv: 'mock-iv',
      authTag: 'mock-tag',
      isOnline: true, // DB flag may be true from local telemetry
      status: DeviceStatus.ONLINE,
      rosVersion: 'V7',
      deletedAt: null,
    };

    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: { name: 'OWNER' },
        }),
      },
      mikroTikDevice: {
        findFirst: jest.fn().mockResolvedValue(mockDevice),
        findUnique: jest.fn().mockResolvedValue(mockDevice),
        update: jest.fn().mockResolvedValue(mockDevice),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      hotspotProfile: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where?.id === 'prof-uuid') {
            return Promise.resolve({
              id: 'prof-uuid',
              name: 'hsp-sudafi',
              deviceId: privateDeviceId,
              tenantId,
            });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'prof-1', ...data })),
      },
      cardBatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'batch-1',
          tenantId,
          deviceId: privateDeviceId,
          totalCards: 10,
          status: 'PENDING',
          device: mockDevice,
          cards: [],
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'batch-1',
          batchNumber: 'B101',
          totalCards: 10,
          price: 500,
          status: 'COMPLETED',
          device: { name: 'HAMDI NET' },
          profile: { name: 'hsp-sudafi' },
          createdAt: new Date(),
        }),
        create: jest.fn().mockResolvedValue({ id: 'batch-1', totalCards: 10, status: 'COMPLETED' }),
        update: jest.fn().mockResolvedValue({ id: 'batch-1', status: 'COMPLETED' }),
      },
      card: {
        createMany: jest.fn().mockResolvedValue({ count: 10 }),
        updateMany: jest.fn().mockResolvedValue({ count: 10 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(10),
      },
      $transaction: jest.fn().mockImplementation((fn) =>
        fn({
          cardBatch: prisma.cardBatch,
          card: prisma.card,
        }),
      ),
    };

    mikrotikClientFactory = {
      getClient: jest.fn().mockRejectedValue(new Error('Cloud dial attempted on private IP!')),
      invalidateClient: jest.fn().mockResolvedValue(undefined),
    };

    agentService = {
      queueCommand: jest.fn().mockRejectedValue(new BadRequestException('Cannot queue command: No active agent is paired with router [HAMDI NET]')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        HotspotService,
        CardsService,
        PortalService,
        PortalCompilerService,
        CardCodeGeneratorService,
        {
          provide: QuotasService,
          useValue: {
            checkAndLockQuota: jest.fn().mockResolvedValue({
              allowed: true,
              cardLimit: 1000,
              usedCards: 100,
              isUnlimited: false,
              cycleEnd: new Date(),
            }),
            assertCanGenerateCards: jest.fn().mockResolvedValue({
              allowed: true,
              cardLimit: 1000,
              usedCards: 100,
              isUnlimited: false,
              cycleEnd: new Date(),
            }),
            incrementUsedCards: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn().mockReturnValue({ ciphertext: 'c', iv: 'i', authTag: 't' }),
            decrypt: jest.fn().mockReturnValue('12345678'),
            tryDecrypt: jest.fn().mockReturnValue('12345678'),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: MikrotikClientFactory, useValue: mikrotikClientFactory },
        { provide: AgentService, useValue: agentService },
      ],
    }).compile();

    devicesService = module.get<DevicesService>(DevicesService);
    hotspotService = module.get<HotspotService>(HotspotService);
    cardsService = module.get<CardsService>(CardsService);
    portalService = module.get<PortalService>(PortalService);
  });

  afterEach(() => {
    (DevicesService as any).deviceChannels?.delete(privateDeviceId);
  });

  describe('Issue 1: Card Studio Batch Generation on Private LAN', () => {
    it('creates batch in DB without hanging or calling cloud getClient when router is local-only', async () => {
      const res = await cardsService.createBatch(tenantId, 'user-1', {
        deviceId: privateDeviceId,
        profileId: 'prof-uuid',
        totalCards: 10,
        syncToRouter: true, // Mobile might send default or false
      } as any);

      expect(res.batch).toBeDefined();
      expect(res.routerSyncStatus).toBe('PENDING_OFFLINE');
      expect(mikrotikClientFactory.getClient).not.toHaveBeenCalled();
    });

    it('marks batch local synced when mobile pushes cards over Wi-Fi LAN', async () => {
      const markRes = await cardsService.markBatchLocalSynced(tenantId, 'batch-1', {
        syncedUsernames: ['user1', 'user2'],
      });

      expect(markRes.success).toBe(true);
      expect(prisma.card.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ syncStatus: 'SYNCED' }),
        }),
      );
    });
  });

  describe('Issue 2: Hotspot Portal Publish on Private LAN / No Active Agent', () => {
    it('returns LOCAL_DEPLOY_REQUIRED with compiled files without throwing HTTP 400', async () => {
      const publishRes = await portalService.publishToRouter(tenantId, privateDeviceId, {
        directoryName: 'hotspot',
      });

      expect(publishRes.status).toBe('LOCAL_DEPLOY_REQUIRED');
      expect(publishRes.requiresLocalExecution).toBe(true);
      expect(publishRes.files).toBeDefined();
      expect(publishRes.files!.length).toBeGreaterThan(0);
      expect(mikrotikClientFactory.getClient).not.toHaveBeenCalled();
    });
  });

  describe('Issue 3: MikroTik Backup on Private LAN', () => {
    it('fast-fails createBackup with clean localized instruction instead of 20s timeout', async () => {
      await expect(
        devicesService.createBackup(tenantId, privateDeviceId),
      ).rejects.toThrow('الراوتر متصل محلياً بعنوان LAN خاص؛ يجب إنشاء النسخة الاحتياطية مباشرة من الهاتف عبر الشبكة المحلية.');

      expect(mikrotikClientFactory.getClient).not.toHaveBeenCalled();
    });

    it('fast-fails listBackups without hanging or attempting cloud dial', async () => {
      const list = await devicesService.listBackups(tenantId, privateDeviceId);
      expect(list).toEqual([]);
      expect(mikrotikClientFactory.getClient).not.toHaveBeenCalled();
    });

    it('records local backup metadata in audit log', async () => {
      const recordRes = await devicesService.recordLocalBackup(tenantId, privateDeviceId, {
        filename: 'alftih.backup',
        size: 1024,
      });

      expect(recordRes.success).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ROUTER_BACKUP_CREATED',
            newValues: expect.objectContaining({
              backupFile: 'alftih.backup',
              source: 'LOCAL_LAN',
            }),
          }),
        }),
      );
    });
  });

  describe('Issue 4: Hotspot Profile Create on Private LAN', () => {
    it('creates profile in DB and returns SKIPPED_PRIVATE_LAN without hanging', async () => {
      const profRes = await hotspotService.createProfile(tenantId, privateDeviceId, {
        name: 'hsp-sudafi-10h',
        sessionTimeout: '10h',
        price: 500,
        syncToRouter: true,
      } as any);

      expect(profRes.name).toBe('hsp-sudafi-10h');
      expect(profRes.routerSyncStatus).toBe('SKIPPED_PRIVATE_LAN');
      expect(mikrotikClientFactory.getClient).not.toHaveBeenCalled();
    });
  });
});
