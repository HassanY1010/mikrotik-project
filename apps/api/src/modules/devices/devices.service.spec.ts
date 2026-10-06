import { Test, TestingModule } from '@nestjs/testing';
import { DevicesService } from './devices.service';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { RouterOsVersion } from '@prisma/client';

describe('DevicesService', () => {
  let service: DevicesService;
  let prisma: any;
  let encryptionService: any;
  let mikrotikClientFactory: any;

  const mockTenantId = 'tenant-uuid-1';
  const mockDeviceId = 'device-uuid-1';

  beforeEach(async () => {
    prisma = {
      subscription: {
        findFirst: jest.fn(),
      },
      mikroTikDevice: {
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'encrypted_hex_payload',
        iv: 'aabbcc112233',
        authTag: 'ffeedd998877',
      }),
      decrypt: jest.fn().mockReturnValue('plain_password'),
    };

    mikrotikClientFactory = {
      getClient: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: MikrotikClientFactory, useValue: mikrotikClientFactory },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
  });

  describe('create', () => {
    it('should throw ForbiddenException if tenant has no active subscription', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.create(mockTenantId, {
          name: 'Main Router',
          host: '192.168.88.1',
          username: 'admin',
          password: 'password123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if subscription router limit is reached', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        maxRouters: 1,
        plan: { name: 'BASIC', maxRouters: 1 },
      });
      prisma.mikroTikDevice.count.mockResolvedValue(1);

      await expect(
        service.create(mockTenantId, {
          name: 'Second Router',
          host: '192.168.88.2',
          username: 'admin',
          password: 'password123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if device with host and port already exists', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        maxRouters: 3,
        plan: { name: 'PRO', maxRouters: 3 },
      });
      prisma.mikroTikDevice.count.mockResolvedValue(0);
      prisma.mikroTikDevice.findFirst.mockResolvedValue({
        id: 'existing-device',
      });

      await expect(
        service.create(mockTenantId, {
          name: 'Duplicate Router',
          host: '192.168.88.1',
          apiPort: 8728,
          username: 'admin',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should encrypt credentials and create device when valid', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        maxRouters: 3,
        plan: { name: 'PRO', maxRouters: 3 },
      });
      prisma.mikroTikDevice.count.mockResolvedValue(1);
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      const createdDbRecord = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'encrypted_hex_payload',
        iv: 'aabbcc112233',
        authTag: 'ffeedd998877',
        rosVersion: RouterOsVersion.V7,
        isOnline: false,
        status: 'OFFLINE',
        lastSyncAt: null,
        lastError: null,
        cpuLoad: null,
        memoryFree: null,
        memoryTotal: null,
        uptime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.mikroTikDevice.create.mockResolvedValue(createdDbRecord);

      const result = await service.create(mockTenantId, {
        name: 'Main Router',
        host: '192.168.88.1',
        username: 'admin',
        password: 'SuperSecretRouterPassword',
      });

      expect(encryptionService.encrypt).toHaveBeenCalledWith('SuperSecretRouterPassword');
      expect(prisma.mikroTikDevice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordEncrypted: 'encrypted_hex_payload',
            iv: 'aabbcc112233',
            authTag: 'ffeedd998877',
          }),
        }),
      );
      expect(result.id).toBe(mockDeviceId);
      expect((result as any).passwordEncrypted).toBeUndefined();
      expect((result as any).iv).toBeUndefined();
      expect((result as any).authTag).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException if device does not exist or does not match tenant', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      await expect(service.findById(mockTenantId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return sanitized device when found', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Gateway',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        rosVersion: RouterOsVersion.V7,
        isOnline: true,
        status: 'ONLINE',
        lastSyncAt: new Date(),
        lastError: null,
        cpuLoad: 12,
        memoryFree: BigInt(64000000),
        memoryTotal: BigInt(128000000),
        uptime: '5d 12:30:00',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.findById(mockTenantId, mockDeviceId);
      expect(res.id).toBe(mockDeviceId);
      expect(typeof res.memoryFree).toBe('number');
      expect(res.memoryFree).toBe(64000000);
      expect((res as any).passwordEncrypted).toBeUndefined();
    });
  });
});
