import { Test, TestingModule } from '@nestjs/testing';
import { MikrotikReconciliationService } from './mikrotik-reconciliation.service';
import { PrismaService } from '../../database/prisma.service';
import { EncryptionService } from '../../security/encryption.service';
import { MikrotikClientFactory } from '../mikrotik-client.factory';
import { CardStatus, SyncStatus } from '@prisma/client';

describe('MikrotikReconciliationService (Reverse Synchronization)', () => {
  let service: MikrotikReconciliationService;
  let prisma: any;
  let encryptionService: any;
  let clientFactory: any;
  let mockClient: any;

  const mockTenantId = 'tenant-1';
  const mockDeviceId = 'dev-1';

  const mockDevice = {
    id: mockDeviceId,
    tenantId: mockTenantId,
    name: 'Main Router',
    host: '41.223.120.10', // Public routed IP
    apiPort: 8728,
    username: 'admin',
    passwordEncrypted: 'enc-pass',
    iv: 'iv-pass',
    authTag: 'tag-pass',
    isOnline: true,
    deletedAt: null,
  };

  beforeEach(async () => {
    mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      listHotspotProfiles: jest.fn().mockResolvedValue([]),
      listHotspotUsers: jest.fn().mockResolvedValue([]),
      listPppProfiles: jest.fn().mockResolvedValue([]),
      listPppSecrets: jest.fn().mockResolvedValue([]),
    };

    clientFactory = {
      getClient: jest.fn().mockResolvedValue(mockClient),
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'enc-text',
        iv: 'iv-val',
        authTag: 'tag-val',
      }),
    };

    prisma = {
      mikroTikDevice: {
        findFirst: jest.fn().mockResolvedValue(mockDevice),
        update: jest.fn().mockResolvedValue(mockDevice),
      },
      hotspotProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'prof-new', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id, ...args.data })),
      },
      card: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'card-new', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id, ...args.data })),
      },
      cardBatch: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'batch-new', ...args.data })),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'admin-user-1' }),
      },
      pppoeProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'pppoe-prof-new', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id, ...args.data })),
      },
      pppoeAccount: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'pppoe-acc-new', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id, ...args.data })),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MikrotikReconciliationService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: MikrotikClientFactory, useValue: clientFactory },
      ],
    }).compile();

    service = module.get<MikrotikReconciliationService>(MikrotikReconciliationService);
  });

  it('imports new Hotspot profiles created externally in WinBox', async () => {
    // Router has a new profile "3hours-winbox" not in DB
    mockClient.listHotspotProfiles.mockResolvedValueOnce([
      { name: '3hours-winbox', rateLimit: '4M/4M', sessionTimeout: '3h', sharedUsers: 1 },
    ]);
    prisma.hotspotProfile.findMany.mockResolvedValueOnce([]);

    const summary = await service.reconcileRouter(mockTenantId, mockDeviceId);

    expect(summary.status).toBe('COMPLETED');
    expect(summary.hotspot.profiles.added).toBe(1);
    expect(prisma.hotspotProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '3hours-winbox',
          rateLimit: '4M/4M',
          sessionTimeout: '3h',
        }),
      }),
    );
  });

  it('imports new Hotspot users created externally in WinBox without duplicating', async () => {
    // Router has existing profile and a user created in WinBox
    prisma.hotspotProfile.findMany.mockResolvedValue([
      { id: 'prof-1', name: 'default-profile', tenantId: mockTenantId, deviceId: mockDeviceId },
    ]);
    mockClient.listHotspotUsers.mockResolvedValueOnce([
      { name: 'user_from_winbox', password: 'secret123', profile: 'default-profile', disabled: false },
    ]);
    prisma.card.findMany.mockResolvedValueOnce([]);

    const summary = await service.reconcileRouter(mockTenantId, mockDeviceId);

    expect(summary.hotspot.users.imported).toBe(1);
    expect(prisma.card.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: 'user_from_winbox',
          syncStatus: SyncStatus.SYNCED,
          status: CardStatus.AVAILABLE,
        }),
      }),
    );
  });

  it('updates local card when user is disabled in WinBox', async () => {
    const existingCard = {
      id: 'card-1',
      username: 'active_voucher',
      status: CardStatus.ACTIVE,
      syncStatus: SyncStatus.SYNCED,
    };
    prisma.card.findMany.mockResolvedValueOnce([existingCard]);

    // Router reports this user is now disabled
    mockClient.listHotspotUsers.mockResolvedValueOnce([
      { name: 'active_voucher', disabled: true },
    ]);

    const summary = await service.reconcileRouter(mockTenantId, mockDeviceId);

    expect(summary.hotspot.users.updated).toBe(1);
    expect(prisma.card.update).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      data: {
        status: CardStatus.DISABLED,
        syncStatus: SyncStatus.SYNCED,
      },
    });
  });

  it('marks card as missing on router when deleted in WinBox without destroying DB history', async () => {
    const existingCard = {
      id: 'card-vanished',
      username: 'deleted_in_winbox',
      status: CardStatus.ACTIVE,
      syncStatus: SyncStatus.SYNCED,
    };
    prisma.card.findMany.mockResolvedValueOnce([existingCard]);

    // Router returns empty list (user was removed in WinBox)
    mockClient.listHotspotUsers.mockResolvedValueOnce([]);

    const summary = await service.reconcileRouter(mockTenantId, mockDeviceId);

    expect(summary.hotspot.users.missingOnRouter).toBe(1);
    // Verified: We DO NOT call prisma.card.delete, we preserve local records!
    expect(prisma.card.update).toHaveBeenCalledWith({
      where: { id: 'card-vanished' },
      data: expect.objectContaining({
        status: CardStatus.DISABLED,
        syncError: expect.stringContaining('تم حذف المستخدم من راوتر MikroTik عبر WinBox/Terminal'),
      }),
    });
  });

  it('guarantees that local database data is NEVER deleted when router query fails', async () => {
    const existingCard = {
      id: 'card-safe',
      username: 'vital_card',
      status: CardStatus.ACTIVE,
      syncStatus: SyncStatus.SYNCED,
    };
    prisma.card.findMany.mockResolvedValueOnce([existingCard]);

    // Router throws a network / timeout error
    mockClient.listHotspotUsers.mockRejectedValueOnce(new Error('ETIMEDOUT: Connection dropped'));

    const summary = await service.reconcileRouter(mockTenantId, mockDeviceId);

    // Summary reports error, but local cards are untouched
    expect(summary.errors.length).toBeGreaterThan(0);
    expect(prisma.card.update).not.toHaveBeenCalled();
    expect(prisma.card.delete).toBeUndefined();
  });

  it('safely skips reconciliation for private LAN routers without attempting cloud connection', async () => {
    prisma.mikroTikDevice.findFirst.mockResolvedValueOnce({
      ...mockDevice,
      host: '192.168.88.1', // Local LAN host
    });

    const summary = await service.reconcileRouter(mockTenantId, mockDeviceId);

    expect(summary.status).toBe('SKIPPED');
    expect(summary.skipReason).toContain('Private LAN');
    expect(clientFactory.getClient).not.toHaveBeenCalled();
  });
});
