import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CardStatus, DeviceStatus, PaymentMethod, RouterOsVersion } from '@prisma/client';
import { RoleName } from '@mikrotik-saas/shared-types';
import { DevicesService } from './devices.service';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { SalesService } from '../sales/services/sales.service';
import { CardsService } from '../cards/services/cards.service';

describe('Stage 2 Hardening: Device Connectivity, Protected Telemetry & Sales Decoupling', () => {
  let devicesService: DevicesService;
  let prisma: any;
  let encryptionService: any;
  let mikrotikClientFactory: any;

  const tenantId = 'tenant-1';
  const deviceId = 'device-1';

  const makeDeviceRecord = (overrides: Record<string, any> = {}) => ({
    id: deviceId,
    tenantId,
    name: 'FASTT NET',
    host: '192.168.88.1',
    apiPort: 8728,
    restPort: 80,
    useSsl: false,
    username: 'admin',
    passwordEncrypted: 'enc',
    iv: 'iv',
    authTag: 'tag',
    rosVersion: RouterOsVersion.V7,
    isOnline: true,
    status: DeviceStatus.ONLINE,
    cpuLoad: null,
    memoryFree: null,
    memoryTotal: null,
    diskFree: null,
    diskTotal: null,
    uptime: null,
    modelName: null,
    isLocked: false,
    antiTetheringEnabled: false,
    lastSyncAt: new Date('2026-11-12T10:00:00.000Z'),
    lastError: null,
    deletedAt: null,
    createdAt: new Date('2026-11-12T09:00:00.000Z'),
    updatedAt: new Date('2026-11-12T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    DevicesService.clearChannelState(deviceId);
    DevicesService.clearChannelState('public-device-1');

    prisma = {
      subscription: { findFirst: jest.fn() },
      mikroTikDevice: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      userDeviceAccess: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      hotspotActiveSession: {
        count: jest.fn().mockResolvedValue(0),
      },
      tenant: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb))),
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'enc2',
        iv: 'iv2',
        authTag: 'tag2',
      }),
      decrypt: jest.fn().mockReturnValue('secret'),
      tryDecrypt: jest.fn().mockReturnValue('secret'),
      deriveDeterministicSecret: jest.fn().mockReturnValue('backup-pass-123'),
    };

    mikrotikClientFactory = {
      getClient: jest.fn(),
      invalidateClient: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: MikrotikClientFactory, useValue: mikrotikClientFactory },
      ],
    }).compile();

    devicesService = module.get<DevicesService>(DevicesService);
  });

  describe('Protected local-telemetry endpoint enforcement', () => {
    it('rejects unprivileged CASHIER without UserDeviceAccess assignment', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(makeDeviceRecord());
      prisma.userDeviceAccess.findUnique.mockResolvedValue(null);

      await expect(
        devicesService.reportLocalTelemetry(
          tenantId,
          deviceId,
          { isOnline: true, reportedHost: '192.168.88.1' },
          { id: 'cashier-1', tenantId, role: RoleName.CASHIER, email: 'cashier@test.local' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects host mismatch in local telemetry', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(makeDeviceRecord({ host: '192.168.88.1' }));

      await expect(
        devicesService.reportLocalTelemetry(
          tenantId,
          deviceId,
          { isOnline: true, reportedHost: '10.99.99.1' },
          { id: 'owner-1', tenantId, role: RoleName.OWNER, email: 'owner@test.local' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects impossible memory/disk telemetry bounds', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(makeDeviceRecord());

      await expect(
        devicesService.reportLocalTelemetry(
          tenantId,
          deviceId,
          {
            isOnline: true,
            memoryFree: 2048,
            memoryTotal: 1024,
          },
          { id: 'owner-1', tenantId, role: RoleName.OWNER, email: 'owner@test.local' } as any,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        devicesService.reportLocalTelemetry(
          tenantId,
          deviceId,
          {
            isOnline: true,
            diskFree: 5000,
            diskTotal: 1000,
          },
          { id: 'owner-1', tenantId, role: RoleName.OWNER, email: 'owner@test.local' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects future (>2m) and expired (>24h) verifiedAt timestamps', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(makeDeviceRecord());

      const futureIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await expect(
        devicesService.reportLocalTelemetry(tenantId, deviceId, {
          isOnline: true,
          verifiedAt: futureIso,
        }),
      ).rejects.toThrow(BadRequestException);

      const expiredIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
      await expect(
        devicesService.reportLocalTelemetry(tenantId, deviceId, {
          isOnline: true,
          verifiedAt: expiredIso,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects stale local telemetry older than device lastSyncAt with ConflictException', async () => {
      const recentSync = new Date(Date.now() - 5 * 60 * 1000);
      prisma.mikroTikDevice.findFirst.mockResolvedValue(
        makeDeviceRecord({ lastSyncAt: recentSync }),
      );

      const olderButWithin24h = new Date(recentSync.getTime() - 60 * 1000).toISOString();
      await expect(
        devicesService.reportLocalTelemetry(tenantId, deviceId, {
          isOnline: true,
          verifiedAt: olderButWithin24h,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('persists verified local telemetry, CPU/RAM/Disk/Uptime, and channel state', async () => {
      const initial = makeDeviceRecord({
        isOnline: false,
        status: DeviceStatus.OFFLINE,
        lastSyncAt: null,
        lastError: null,
      });
      prisma.mikroTikDevice.findFirst.mockResolvedValue(initial);
      const nowIso = new Date().toISOString();

      prisma.mikroTikDevice.update.mockImplementation(async ({ data }: { data: any }) =>
        makeDeviceRecord({
          ...initial,
          ...data,
        }),
      );

      const result = await devicesService.reportLocalTelemetry(
        tenantId,
        deviceId,
        {
          isOnline: true,
          reportedHost: '192.168.88.1',
          verifiedAt: nowIso,
          cpuLoad: 18,
          memoryFree: 512 * 1024 * 1024,
          memoryTotal: 1024 * 1024 * 1024,
          diskFree: 64 * 1024 * 1024,
          diskTotal: 128 * 1024 * 1024,
          uptime: '1d02:15:30',
          modelName: 'hEX S',
          rosVersion: RouterOsVersion.V7,
          activeHotspotSessions: 12,
        },
        { id: 'owner-1', tenantId, role: RoleName.TENANT_ADMIN, email: 'owner@test.local' } as any,
      );

      expect(result.isOnline).toBe(true);
      expect(result.status).toBe(DeviceStatus.ONLINE);
      expect(result.connectivityState).toBe('ONLINE');
      expect(result.localStatus).toBe('ONLINE');
      expect(result.lastVerifiedSource).toBe('LOCAL_LAN');
      expect(result.cpuLoad).toBe(18);
      expect(result.memoryFree).toBe(512 * 1024 * 1024);
      expect(result.memoryTotal).toBe(1024 * 1024 * 1024);
      expect(result.diskFree).toBe(64 * 1024 * 1024);
      expect(result.diskTotal).toBe(128 * 1024 * 1024);
      expect(result.uptime).toBe('1d02:15:30');
      expect(result.activeHotspotSessions).toBe(12);
    });

    it('invalidates cached MikroTik client and updates ERROR status when local report marks offline auth failure', async () => {
      const initial = makeDeviceRecord({
        lastSyncAt: new Date(Date.now() - 60 * 1000),
      });
      prisma.mikroTikDevice.findFirst.mockResolvedValue(initial);
      prisma.mikroTikDevice.update.mockImplementation(async ({ data }: { data: any }) =>
        makeDeviceRecord({ ...initial, ...data }),
      );

      const res = await devicesService.reportLocalTelemetry(tenantId, deviceId, {
        isOnline: false,
        status: 'ERROR',
        errorCode: 'AUTH_FAILED',
        lastError: 'Invalid username or password',
        verifiedAt: new Date().toISOString(),
      });

      expect(mikrotikClientFactory.invalidateClient).toHaveBeenCalledWith(deviceId);
      expect(res.isOnline).toBe(false);
      expect(res.status).toBe(DeviceStatus.ERROR);
      expect(res.connectivityState).toBe('ERROR');
    });
  });

  describe('Constraint #2: Cloud unreachable on Private LAN preserves local ONLINE verification', () => {
    it('does NOT overwrite locally-verified ONLINE private LAN device when cloud testConnection times out', async () => {
      const localDevice = makeDeviceRecord({
        id: deviceId,
        host: '192.168.88.1',
        isOnline: true,
        status: DeviceStatus.ONLINE,
        cpuLoad: 22,
        uptime: '3h10m',
      });
      DevicesService.updateChannelState(deviceId, {
        localStatus: 'ONLINE',
        localCheckedAt: new Date(),
        lastVerifiedSource: 'LOCAL_LAN',
        lastVerifiedAt: new Date(),
      });

      prisma.mikroTikDevice.findFirst.mockResolvedValue(localDevice);
      mikrotikClientFactory.getClient.mockRejectedValue(
        new Error('connect ETIMEDOUT 192.168.88.1:8728'),
      );

      const res = await devicesService.testConnection(tenantId, deviceId);

      expect(res.success).toBe(false);
      expect(res.code).toBe('CLOUD_UNREACHABLE_PRIVATE_LAN');
      expect(res.isPrivateLan).toBe(true);
      expect(res.localPreserved).toBe(true);
      expect(mikrotikClientFactory.invalidateClient).toHaveBeenCalledWith(deviceId);
      // Must NOT downgrade DB isOnline / status!
      expect(prisma.mikroTikDevice.update).not.toHaveBeenCalled();

      const transformed = await devicesService.findById(tenantId, deviceId);
      expect(transformed.isOnline).toBe(true);
      expect(transformed.connectivityState).toBe('ONLINE');
      expect(transformed.cloudStatus).toBe('UNREACHABLE_PRIVATE_LAN');
    });

    it('marks public IP router ERROR and invalidates cache when cloud testConnection fails', async () => {
      const publicDevice = makeDeviceRecord({
        id: 'public-device-1',
        host: '198.51.100.10',
        isOnline: true,
        status: DeviceStatus.ONLINE,
      });
      prisma.mikroTikDevice.findFirst.mockResolvedValue(publicDevice);
      mikrotikClientFactory.getClient.mockRejectedValue(
        new Error('connect ECONNREFUSED 198.51.100.10:8728'),
      );

      const res = await devicesService.testConnection(tenantId, 'public-device-1');

      expect(res.success).toBe(false);
      expect(res.isPrivateLan).toBe(false);
      expect(res.localPreserved).toBe(false);
      expect(mikrotikClientFactory.invalidateClient).toHaveBeenCalledWith('public-device-1');
      expect(prisma.mikroTikDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'public-device-1' },
          data: expect.objectContaining({
            isOnline: false,
            status: DeviceStatus.ERROR,
          }),
        }),
      );
    });
  });

  describe('No fake telemetry, honest reboot, cache eviction on config change & restore', () => {
    it('getDiagnostics never returns fabricated numbers (14/420/1024/12d) when offline', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(makeDeviceRecord());
      mikrotikClientFactory.getClient.mockRejectedValue(new Error('ETIMEDOUT'));

      const diag = await devicesService.getDiagnostics(tenantId, deviceId);

      expect(diag.isLive).toBe(false);
      expect(diag.cpuLoad).toBeNull();
      expect(diag.freeMemoryMb).toBeNull();
      expect(diag.totalMemoryMb).toBeNull();
      expect(diag.uptime).toBeNull();
      expect(diag.uptime).not.toBe('12d 04:15:20');
    });

    it('reboot returns success:false with REBOOT_FAILED on error instead of lying success:true', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(makeDeviceRecord());
      mikrotikClientFactory.getClient.mockRejectedValue(new Error('Socket closed'));

      const res = await devicesService.reboot(tenantId, deviceId);

      expect(res.success).toBe(false);
      expect(res.code).toBe('REBOOT_FAILED');
      expect(mikrotikClientFactory.invalidateClient).toHaveBeenCalledWith(deviceId);
    });

    it('update resets stale connectivity state and invalidates client cache when password or host changes', async () => {
      const existing = makeDeviceRecord({ isOnline: true, status: DeviceStatus.ONLINE });
      prisma.mikroTikDevice.findFirst.mockResolvedValue(existing);
      prisma.mikroTikDevice.update.mockImplementation(async ({ data }: { data: any }) =>
        makeDeviceRecord({ ...existing, ...data }),
      );

      const updated = await devicesService.update(tenantId, deviceId, {
        password: 'new-router-password',
      });

      expect(mikrotikClientFactory.invalidateClient).toHaveBeenCalledWith(deviceId);
      expect(prisma.mikroTikDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isOnline: false,
            status: DeviceStatus.OFFLINE,
            lastSyncAt: null,
          }),
        }),
      );
      expect(updated.connectivityState).toBe('UNKNOWN');
    });

    it('restoreBackup sets status OFFLINE alongside isOnline false and invalidates client cache', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(makeDeviceRecord());
      mikrotikClientFactory.getClient.mockResolvedValue({
        restoreBackup: jest.fn().mockResolvedValue({ rebootTriggered: true }),
      });

      const res = await devicesService.restoreBackup(
        tenantId,
        deviceId,
        'pre-sudafi.backup',
        undefined,
        true,
        'owner-1',
      );

      expect(res.success).toBe(true);
      expect(mikrotikClientFactory.invalidateClient).toHaveBeenCalledWith(deviceId);
      expect(prisma.mikroTikDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: deviceId },
          data: expect.objectContaining({
            isOnline: false,
            status: DeviceStatus.OFFLINE,
          }),
        }),
      );
    });
  });

  describe('Constraint #5: Sales checkout & refund succeed even when router is unreachable or offline', () => {
    let salesService: SalesService;
    let cardsServiceMock: any;
    let salesPrisma: any;

    beforeEach(async () => {
      salesPrisma = {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            id: tenantId,
            name: 'SudaFi Test',
            phone: '+249900000000',
            currency: 'SDG',
            walletBalance: 1000,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        mikroTikDevice: {
          findFirst: jest.fn().mockResolvedValue(makeDeviceRecord({ host: '192.168.88.1', isOnline: true })),
        },
        hotspotProfile: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'prof-1',
            name: '1h',
            timeLimit: '1h',
            dataLimitBytes: null,
            price: 100,
          }),
        },
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cashier-1', fullName: 'Ali' }),
        },
        card: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              {
                id: 'card-ondemand-1',
                serialNumber: 'SN-OD-1',
                username: 'u101',
                passwordEncrypted: 'enc',
                iv: 'iv',
                authTag: 'tag',
                pinCode: '9999',
                price: 100,
                timeLimit: '1h',
                dataLimitBytes: null,
                status: CardStatus.AVAILABLE,
              },
            ]),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        saleTransaction: {
          create: jest.fn().mockImplementation(async ({ data }) => ({
            id: 'tx-new-1',
            ...data,
            createdAt: new Date(),
          })),
          findFirst: jest.fn(),
        },
        tenantWalletTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
        $transaction: jest.fn(async (cb) => cb(salesPrisma)),
      };

      cardsServiceMock = {
        createBatch: jest.fn().mockResolvedValue({
          cards: [
            {
              id: 'card-ondemand-1',
              serialNumber: 'SN-OD-1',
              username: 'u101',
              passwordEncrypted: 'enc',
              iv: 'iv',
              authTag: 'tag',
              pinCode: '9999',
              price: 100,
              timeLimit: '1h',
              dataLimitBytes: null,
              status: CardStatus.AVAILABLE,
            },
          ],
        }),
      };

      const salesModule: TestingModule = await Test.createTestingModule({
        providers: [
          SalesService,
          { provide: PrismaService, useValue: salesPrisma },
          { provide: EncryptionService, useValue: encryptionService },
          { provide: MikrotikClientFactory, useValue: mikrotikClientFactory },
          { provide: CardsService, useValue: cardsServiceMock },
        ],
      }).compile();

      salesService = salesModule.get<SalesService>(SalesService);
    });

    it('checkout on-demand card skips cloud-to-LAN blocking sync for private LAN device and completes financial sale', async () => {
      const res = await salesService.checkout(tenantId, 'cashier-1', {
        deviceId,
        profileId: 'prof-1',
        quantity: 1,
        paymentMethod: PaymentMethod.CASH,
      });

      expect(cardsServiceMock.createBatch).toHaveBeenCalledWith(
        tenantId,
        'cashier-1',
        expect.objectContaining({
          syncToRouter: false,
        }),
      );
      expect(res.receipts).toHaveLength(1);
    });

    it('refund completes financial reversal & card disable even when router throws ETIMEDOUT', async () => {
      salesPrisma.saleTransaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        cardId: 'card-1',
        amount: 500,
        invoiceNumber: 'INV-1',
        card: {
          id: 'card-1',
          serialNumber: 'SN-1',
          username: 'u101',
          status: CardStatus.SOLD,
        },
        device: makeDeviceRecord({ host: '198.51.100.10', isOnline: true }),
      });
      mikrotikClientFactory.getClient.mockResolvedValue({
        disableHotspotUser: jest.fn().mockRejectedValue(new Error('ETIMEDOUT router offline')),
      });

      const res = await salesService.refund(tenantId, 'tx-1', 'cashier-1', {
        reason: 'Customer cancellation',
      });

      expect(res.success).toBe(true);
      expect(res.routerSyncStatus).toBe('FAILED');
      expect(res.routerSyncWarning).toContain('ETIMEDOUT');
      expect(mikrotikClientFactory.invalidateClient).toHaveBeenCalledWith(deviceId);
      expect(salesPrisma.card.update).toHaveBeenCalledWith({
        where: { id: 'card-1' },
        data: { status: CardStatus.DISABLED },
      });
    });
  });
});
