import { Test, TestingModule } from '@nestjs/testing';
import { DevicesService } from './devices.service';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import {
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadGatewayException,
  BadRequestException,
} from '@nestjs/common';
import { RouterOsVersion } from '@prisma/client';
import { RoleName } from '@mikrotik-saas/shared-types';

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
      auditLog: {
        create: jest.fn(),
      },
      userDeviceAccess: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      tenant: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb))),
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'encrypted_hex_payload',
        iv: 'aabbcc112233',
        authTag: 'ffeedd998877',
      }),
      decrypt: jest.fn().mockReturnValue('plain_password'),
      deriveDeterministicSecret: jest.fn().mockReturnValue('mock_derived_secret_24char'),
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

    it('should throw ForbiddenException if subscription is expired', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        maxRouters: 3,
        plan: { name: 'PRO', maxRouters: 3 },
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
      });

      await expect(
        service.create(mockTenantId, {
          name: 'Expired Router',
          host: '192.168.88.5',
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
        expiresAt: new Date(Date.now() + 86400000),
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

    it('should successfully allow adding the 3rd router when the plan limit is 3 (current count = 2)', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-trial',
        status: 'TRIAL',
        maxRouters: 3,
        plan: { name: 'TRIAL_PRO', maxRouters: 3 },
        expiresAt: new Date(Date.now() + 86400000 * 14),
      });
      prisma.mikroTikDevice.count.mockResolvedValue(2);
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);
      prisma.mikroTikDevice.create.mockResolvedValue({
        id: 'router-3',
        tenantId: mockTenantId,
        name: 'Third Router',
        host: '192.168.88.3',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        rosVersion: RouterOsVersion.V7,
        isOnline: false,
        status: 'OFFLINE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.create(mockTenantId, {
        name: 'Third Router',
        host: '192.168.88.3',
        username: 'admin',
        password: 'password123',
      });

      expect(res.id).toBe('router-3');
      expect(prisma.mikroTikDevice.create).toHaveBeenCalled();
    });

    it('should reject adding the 4th router when plan limit is 3 (current count = 3)', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-trial',
        status: 'TRIAL',
        maxRouters: 3,
        plan: { name: 'TRIAL_PRO', maxRouters: 3 },
        expiresAt: new Date(Date.now() + 86400000 * 14),
      });
      prisma.mikroTikDevice.count.mockResolvedValue(3);

      await expect(
        service.create(mockTenantId, {
          name: 'Fourth Router',
          host: '192.168.88.4',
          username: 'admin',
          password: 'password123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject concurrent device creations for the same tenant with ConflictException', async () => {
      let resolveFirstTransaction: any;
      const firstTxPromise = new Promise((resolve) => {
        resolveFirstTransaction = resolve;
      });

      prisma.$transaction.mockImplementationOnce(() => firstTxPromise);

      const firstCall = service.create(mockTenantId, {
        name: 'Concurrent Router 1',
        host: '192.168.88.10',
        username: 'admin',
        password: 'password123',
      });

      // Second call while first call is in-flight for the same tenant
      await expect(
        service.create(mockTenantId, {
          name: 'Concurrent Router 2',
          host: '192.168.88.11',
          username: 'admin',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);

      resolveFirstTransaction({
        id: 'device-con-1',
        tenantId: mockTenantId,
        name: 'Concurrent Router 1',
        host: '192.168.88.10',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        rosVersion: RouterOsVersion.V7,
        isOnline: false,
        status: 'OFFLINE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await firstCall;
    });

    it('should throw ConflictException if device with host and port already exists', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        maxRouters: 3,
        plan: { name: 'PRO', maxRouters: 3 },
        expiresAt: new Date(Date.now() + 86400000),
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
        expiresAt: new Date(Date.now() + 86400000),
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

  describe('assertUserDeviceAccess', () => {
    const mockDevice = {
      id: mockDeviceId,
      tenantId: mockTenantId,
      name: 'Router 1',
    };

    it('should allow TENANT_ADMIN full access even without userDeviceAccess entry', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);

      const user = {
        id: 'admin-user',
        tenantId: mockTenantId,
        role: RoleName.TENANT_ADMIN,
        email: 'admin@sudafi.com',
      } as any;

      const device = await service.assertUserDeviceAccess(mockTenantId, mockDeviceId, user);
      expect(device.id).toBe(mockDeviceId);
      expect(prisma.userDeviceAccess.findUnique).not.toHaveBeenCalled();
    });

    it('should allow staff with explicit device assignment', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      prisma.userDeviceAccess.findUnique.mockResolvedValue({
        userId: 'cashier-user',
        deviceId: mockDeviceId,
      });

      const user = {
        id: 'cashier-user',
        tenantId: mockTenantId,
        role: RoleName.CASHIER,
        email: 'cashier@sudafi.com',
      } as any;

      const device = await service.assertUserDeviceAccess(mockTenantId, mockDeviceId, user);
      expect(device.id).toBe(mockDeviceId);
      expect(prisma.userDeviceAccess.findUnique).toHaveBeenCalledWith({
        where: {
          userId_deviceId: {
            userId: 'cashier-user',
            deviceId: mockDeviceId,
          },
        },
      });
    });

    it('should throw ForbiddenException if staff has no access to this specific device', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      prisma.userDeviceAccess.findUnique.mockResolvedValue(null);

      const user = {
        id: 'cashier-user',
        tenantId: mockTenantId,
        role: RoleName.CASHIER,
        email: 'cashier@sudafi.com',
      } as any;

      await expect(
        service.assertUserDeviceAccess(mockTenantId, mockDeviceId, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if device does not exist', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      await expect(
        service.assertUserDeviceAccess(mockTenantId, 'missing-device', undefined),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all devices for TENANT_ADMIN without device filtering', async () => {
      const mockDevices = [
        { id: 'd-1', tenantId: mockTenantId, name: 'R1', createdAt: new Date() },
        { id: 'd-2', tenantId: mockTenantId, name: 'R2', createdAt: new Date() },
      ];
      prisma.mikroTikDevice.findMany.mockResolvedValue(mockDevices);

      const user = {
        id: 'admin-user',
        tenantId: mockTenantId,
        role: RoleName.TENANT_ADMIN,
        email: 'admin@sudafi.com',
      } as any;

      const results = await service.findAll(mockTenantId, user);
      expect(results.length).toBe(2);
      expect(prisma.userDeviceAccess.findMany).not.toHaveBeenCalled();
    });

    it('should return only assigned devices for staff when assignments exist', async () => {
      prisma.userDeviceAccess.findMany.mockResolvedValue([{ deviceId: 'd-1' }]);
      prisma.mikroTikDevice.findMany.mockResolvedValue([
        { id: 'd-1', tenantId: mockTenantId, name: 'R1', createdAt: new Date() },
      ]);

      const user = {
        id: 'staff-user',
        tenantId: mockTenantId,
        role: RoleName.CASHIER,
        email: 'cashier@sudafi.com',
      } as any;

      const results = await service.findAll(mockTenantId, user);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('d-1');
      expect(prisma.mikroTikDevice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['d-1'] },
          }),
        }),
      );
    });

    it('should return empty list (safe default) for staff with zero assigned devices', async () => {
      prisma.userDeviceAccess.findMany.mockResolvedValue([]);

      const user = {
        id: 'staff-user',
        tenantId: mockTenantId,
        role: RoleName.CASHIER,
        email: 'cashier@sudafi.com',
      } as any;

      const results = await service.findAll(mockTenantId, user);
      expect(results).toEqual([]);
      expect(prisma.mikroTikDevice.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createBackup', () => {
    it('should throw NotFoundException if device does not exist or belongs to another tenant', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      await expect(
        service.createBackup(mockTenantId, 'non-existent-device', 'my_backup'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.mikroTikDevice.findFirst).toHaveBeenCalledWith({
        where: { id: 'non-existent-device', tenantId: mockTenantId, deletedAt: null },
      });
    });

    it('should create backup on MikroTik router and log audit event', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'enc_pw',
        iv: 'iv_val',
        authTag: 'tag_val',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);

      const mockClient = {
        createBackup: jest.fn().mockResolvedValue({
          filename: 'my_backup.backup',
          size: 1048576,
          creationTime: '2026-10-18 08:30:00',
        }),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      const result = await service.createBackup(
        mockTenantId,
        mockDeviceId,
        'my_backup',
        'secret123',
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.backup.filename).toBe('my_backup.backup');
      expect(result.backup.size).toBe(1048576);
      expect(mockClient.createBackup).toHaveBeenCalledWith('my_backup', 'secret123');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          userId: 'user-1',
          action: 'ROUTER_BACKUP_CREATED',
          entity: 'mikrotik_device',
          entityId: mockDeviceId,
        }),
      });
    });

    it('should derive deterministic secure password when password is not supplied, and never store password in AuditLog', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'enc_pw',
        iv: 'iv_val',
        authTag: 'tag_val',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);

      const mockClient = {
        createBackup: jest.fn().mockResolvedValue({
          filename: 'auto_enc.backup',
          size: 512000,
          creationTime: '2026-10-18 09:00:00',
        }),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      const result = await service.createBackup(mockTenantId, mockDeviceId, 'auto_enc');

      expect(result.success).toBe(true);
      expect(result.backup.isEncrypted).toBe(true);
      expect(mockClient.createBackup).toHaveBeenCalledWith('auto_enc', 'mock_derived_secret_24char');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ROUTER_BACKUP_CREATED',
          newValues: expect.objectContaining({
            isEncrypted: true,
          }),
        }),
      });
      // Verify password was NOT saved in audit log
      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      expect(JSON.stringify(auditCall)).not.toContain('mock_derived_secret_24char');
    });

    it('should throw BadGatewayException if MikroTik router fails to create backup', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'enc_pw',
        iv: 'iv_val',
        authTag: 'tag_val',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);

      const mockClient = {
        createBackup: jest.fn().mockRejectedValue(new Error('Out of disk space')),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      await expect(
        service.createBackup(mockTenantId, mockDeviceId, 'fail_backup'),
      ).rejects.toThrow();
    });
  });

  describe('listBackups', () => {
    it('should return list of backup files from router', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'enc_pw',
        iv: 'iv_val',
        authTag: 'tag_val',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);

      const mockClient = {
        listBackups: jest.fn().mockResolvedValue([
          { name: 'backup_auto.backup', size: 524288, type: 'backup', creationTime: '2026-10-18' },
        ]),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      const list = await service.listBackups(mockTenantId, mockDeviceId);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('backup_auto.backup');
    });
  });

  describe('downloadBackup', () => {
    it('should throw BadRequestException if filename is invalid or contains path traversal', async () => {
      await expect(
        service.downloadBackup(mockTenantId, mockDeviceId, '../../etc/passwd'),
      ).rejects.toThrow();

      await expect(
        service.downloadBackup(mockTenantId, mockDeviceId, 'shell.sh'),
      ).rejects.toThrow();
    });

    it('should throw NotFoundException if device does not belong to tenant', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      await expect(
        service.downloadBackup(mockTenantId, 'unknown-id', 'valid_file.backup'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should download backup buffer and record audit log', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'enc_pw',
        iv: 'iv_val',
        authTag: 'tag_val',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);

      const fakeBuffer = Buffer.from('MIKROTIK_BACKUP_BINARY_DATA');
      const mockClient = {
        downloadBackup: jest.fn().mockResolvedValue(fakeBuffer),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      const result = await service.downloadBackup(
        mockTenantId,
        mockDeviceId,
        'valid_file.backup',
        'user-admin',
      );

      expect(result.filename).toBe('valid_file.backup');
      expect(result.size).toBe(fakeBuffer.length);
      expect(mockClient.downloadBackup).toHaveBeenCalledWith('valid_file.backup');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          userId: 'user-admin',
          action: 'ROUTER_BACKUP_DOWNLOADED',
          entity: 'mikrotik_device',
          entityId: mockDeviceId,
        }),
      });
    });

    it('should throw BadGatewayException if downloaded buffer is empty (0 bytes)', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'enc_pw',
        iv: 'iv_val',
        authTag: 'tag_val',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      mikrotikClientFactory.getClient.mockResolvedValue({
        downloadBackup: jest.fn().mockResolvedValue(Buffer.alloc(0)),
      });

      await expect(
        service.downloadBackup(mockTenantId, mockDeviceId, 'empty.backup'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException if downloaded buffer size does not match router file size', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        apiPort: 8728,
        restPort: 443,
        useSsl: false,
        username: 'admin',
        passwordEncrypted: 'enc_pw',
        iv: 'iv_val',
        authTag: 'tag_val',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      mikrotikClientFactory.getClient.mockResolvedValue({
        downloadBackup: jest.fn().mockResolvedValue(Buffer.from('truncated_data')), // 14 bytes
        listBackups: jest.fn().mockResolvedValue([
          { name: 'mismatch.backup', size: 50000, type: 'backup' },
        ]),
      });

      await expect(
        service.downloadBackup(mockTenantId, mockDeviceId, 'mismatch.backup'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should handle router HTTP 401 unauthorized error', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      mikrotikClientFactory.getClient.mockResolvedValue({
        downloadBackup: jest.fn().mockRejectedValue(new Error('HTTP 401 Unauthorized')),
      });

      await expect(
        service.downloadBackup(mockTenantId, mockDeviceId, 'auth_fail.backup'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should handle router HTTP 403 forbidden error (lacking sensitive policy)', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      mikrotikClientFactory.getClient.mockResolvedValue({
        downloadBackup: jest.fn().mockRejectedValue(new Error('HTTP 403 Forbidden: insufficient permissions')),
      });

      await expect(
        service.downloadBackup(mockTenantId, mockDeviceId, 'forbidden.backup'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should handle router HTTP 404 not found error', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      mikrotikClientFactory.getClient.mockResolvedValue({
        downloadBackup: jest.fn().mockRejectedValue(new Error('HTTP 404 Not Found')),
      });

      await expect(
        service.downloadBackup(mockTenantId, mockDeviceId, 'not_found.backup'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should handle router HTTP 500 internal server error', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      mikrotikClientFactory.getClient.mockResolvedValue({
        downloadBackup: jest.fn().mockRejectedValue(new Error('HTTP 500 Internal Server Error')),
      });

      await expect(
        service.downloadBackup(mockTenantId, mockDeviceId, 'server_err.backup'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('restoreBackup', () => {
    it('should throw BadRequestException if confirmed is false', async () => {
      await expect(
        service.restoreBackup(mockTenantId, mockDeviceId, 'valid.backup', undefined, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if filename is invalid', async () => {
      await expect(
        service.restoreBackup(mockTenantId, mockDeviceId, '../escape.backup', undefined, true),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.restoreBackup(mockTenantId, mockDeviceId, 'script.rsc', undefined, true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if an operation is already in progress on this router', async () => {
      DevicesService.activeDeviceOperations.add(mockDeviceId);
      try {
        await expect(
          service.restoreBackup(mockTenantId, mockDeviceId, 'valid.backup', undefined, true),
        ).rejects.toThrow(ConflictException);
      } finally {
        DevicesService.activeDeviceOperations.delete(mockDeviceId);
      }
    });

    it('should throw NotFoundException if device does not exist or tenant mismatched', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);
      await expect(
        service.restoreBackup(mockTenantId, 'unknown-device', 'valid.backup', undefined, true),
      ).rejects.toThrow(NotFoundException);
    });

    it('should execute restoreBackup on client, record audit log, and update device status', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      const mockClient = {
        restoreBackup: jest.fn().mockResolvedValue({
          success: true,
          message: 'Restore initiated, reboot triggered',
          rebootTriggered: true,
        }),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      const result = await service.restoreBackup(
        mockTenantId,
        mockDeviceId,
        'clean_restore.backup',
        'secretPass',
        true,
        'user-123',
      );

      expect(result.success).toBe(true);
      expect(result.rebootTriggered).toBe(true);
      expect(result.restoredBackup).toBe('clean_restore.backup');
      expect(mockClient.restoreBackup).toHaveBeenCalledWith('clean_restore.backup', 'secretPass');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ROUTER_BACKUP_RESTORED',
            entityId: mockDeviceId,
          }),
        }),
      );
      expect(prisma.mikroTikDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDeviceId },
          data: expect.objectContaining({ isOnline: false }),
        }),
      );
    });

    it('should fall back to derived device backup password if password is omitted during restore', async () => {
      const mockDevice = {
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        host: '192.168.88.1',
        rosVersion: RouterOsVersion.V7,
      };
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
      const mockClient = {
        restoreBackup: jest.fn().mockResolvedValue({
          success: true,
          message: 'Restore initiated',
          rebootTriggered: true,
        }),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      await service.restoreBackup(
        mockTenantId,
        mockDeviceId,
        'auto_pre.backup',
        undefined,
        true,
        'user-123',
      );

      expect(mockClient.restoreBackup).toHaveBeenCalledWith(
        'auto_pre.backup',
        'mock_derived_secret_24char',
      );
    });
  });

  describe('getConnectedDevices', () => {
    const mockDevice = {
      id: mockDeviceId,
      tenantId: mockTenantId,
      name: 'Main Router CCR1009',
      host: '192.168.88.1',
      apiPort: 8728,
      restPort: 443,
      useSsl: false,
      username: 'admin',
      passwordEncrypted: 'enc',
      iv: 'iv',
      authTag: 'tag',
      rosVersion: RouterOsVersion.V7,
    };

    beforeEach(() => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDevice);
    });

    it('should deduplicate and merge entries from DHCP, ARP, and Neighbors correctly', async () => {
      const mockClient = {
        listDhcpLeases: jest.fn().mockResolvedValue([
          {
            id: '*1',
            address: '192.168.88.50',
            macAddress: 'AA:BB:CC:DD:EE:01',
            hostName: 'Galaxy-A52-Ahmed',
            status: 'bound',
            expiresAfter: '23h50m',
            lastSeen: '15s',
          },
          {
            id: '*2',
            address: '192.168.88.60',
            macAddress: 'AA:BB:CC:DD:EE:02',
            hostName: 'Old-Lease-Phone',
            status: 'bound',
            expiresAfter: '12h',
            lastSeen: '4h20m', // Not recent, and no ARP
          },
        ]),
        listArpTable: jest.fn().mockResolvedValue([
          {
            id: '*A1',
            address: '192.168.88.50',
            macAddress: 'aa:bb:cc:dd:ee:01',
            interface: 'bridge-lan',
            complete: true,
            disabled: false,
          },
          {
            id: '*A2',
            address: '192.168.88.200',
            macAddress: '00:27:22:11:22:33',
            interface: 'ether2',
            complete: true,
            disabled: false,
            comment: 'North-Tower-NanoStation',
          },
        ]),
        listNeighbors: jest.fn().mockResolvedValue([
          {
            id: '*N1',
            interface: 'ether2',
            address: '192.168.88.200',
            macAddress: '00:27:22:11:22:33',
            identity: 'NanoStation-M5-TowerNorth',
            platform: 'Ubiquiti',
            board: 'NanoStation M5',
            uptime: '15d 4h',
            age: '45s',
          },
        ]),
      };

      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      const result = await service.getConnectedDevices(mockTenantId, mockDeviceId);

      // Should produce 3 unified devices:
      // 1. Ubiquiti NanoStation AP (merged from ARP and Neighbor)
      // 2. Galaxy-A52 (merged from DHCP and ARP - Confirmed Online)
      // 3. Old-Lease-Phone (DHCP only - Leased Active)
      expect(result.length).toBe(3);

      const apDevice = result.find((d) => d.macAddress === '00:27:22:11:22:33');
      expect(apDevice).toBeDefined();
      expect(apDevice?.name).toBe('NanoStation-M5-TowerNorth');
      expect(apDevice?.deviceType).toBe('ACCESS_POINT');
      expect(apDevice?.vendor).toBe('Ubiquiti');
      expect(apDevice?.connectionCertainty).toBe('CONFIRMED_ONLINE');
      expect(apDevice?.isOnline).toBe(true);
      expect(apDevice?.sources).toContain('ARP');
      expect(apDevice?.sources).toContain('NEIGHBOR');

      const activePhone = result.find((d) => d.macAddress === 'AA:BB:CC:DD:EE:01');
      expect(activePhone).toBeDefined();
      expect(activePhone?.name).toBe('Galaxy-A52-Ahmed');
      expect(activePhone?.deviceType).toBe('PHONE');
      expect(activePhone?.vendor).toBe('Samsung');
      expect(activePhone?.connectionCertainty).toBe('CONFIRMED_ONLINE');
      expect(activePhone?.isOnline).toBe(true);
      expect(activePhone?.sources).toContain('DHCP');
      expect(activePhone?.sources).toContain('ARP');

      const leasedDevice = result.find((d) => d.macAddress === 'AA:BB:CC:DD:EE:02');
      expect(leasedDevice).toBeDefined();
      expect(leasedDevice?.connectionCertainty).toBe('LEASE_ACTIVE');
      expect(leasedDevice?.isOnline).toBe(false);
      expect(leasedDevice?.status).toBe('leased');
    });

    it('should correctly classify PlayStation and Workstations without mislabeling them as APs', async () => {
      const mockClient = {
        listDhcpLeases: jest.fn().mockResolvedValue([
          {
            id: '*1',
            address: '192.168.88.70',
            macAddress: 'AA:11:22:33:44:01',
            hostName: 'PlayStation-5-Console',
            status: 'bound',
            lastSeen: '10s',
          },
          {
            id: '*2',
            address: '192.168.88.71',
            macAddress: 'AA:11:22:33:44:02',
            hostName: 'Workstation-Finance-Dell',
            status: 'bound',
            lastSeen: '30s',
          },
          {
            id: '*3',
            address: '192.168.88.72',
            macAddress: 'AA:11:22:33:44:03',
            hostName: 'MikroTik-SXT-Sq5',
            status: 'bound',
            lastSeen: '1m',
          },
        ]),
        listArpTable: jest.fn().mockResolvedValue([
          {
            address: '192.168.88.70',
            macAddress: 'AA:11:22:33:44:01',
            complete: true,
          },
          {
            address: '192.168.88.71',
            macAddress: 'AA:11:22:33:44:02',
            complete: true,
          },
          {
            address: '192.168.88.72',
            macAddress: 'AA:11:22:33:44:03',
            complete: true,
          },
        ]),
        listNeighbors: jest.fn().mockResolvedValue([]),
      };

      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      const result = await service.getConnectedDevices(mockTenantId, mockDeviceId);

      const ps5 = result.find((d) => d.macAddress === 'AA:11:22:33:44:01');
      expect(ps5?.deviceType).toBe('UNKNOWN');
      expect(ps5?.vendor).toBe('Sony');

      const workstation = result.find((d) => d.macAddress === 'AA:11:22:33:44:02');
      expect(workstation?.deviceType).toBe('COMPUTER');
      expect(workstation?.vendor).toBe('Dell');

      const sxt = result.find((d) => d.macAddress === 'AA:11:22:33:44:03');
      expect(sxt?.deviceType).toBe('ACCESS_POINT');
      expect(sxt?.vendor).toBe('MikroTik');
    });

    it('should throw BadGatewayException if router connection fails', async () => {
      mikrotikClientFactory.getClient.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.getConnectedDevices(mockTenantId, mockDeviceId)).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('should reject access if non-admin user is not assigned to the device', async () => {
      const regularUser: any = {
        id: 'user-cashier-1',
        role: RoleName.CASHIER,
        tenantId: mockTenantId,
      };

      prisma.userDeviceAccess.findUnique.mockResolvedValue(null);

      await expect(
        service.getConnectedDevices(mockTenantId, mockDeviceId, regularUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createBackup & restoreBackup (Safe Rollback & Zero-Knowledge Encryption)', () => {
    const mockDeviceData = {
      id: mockDeviceId,
      tenantId: mockTenantId,
      name: 'Main Router CCR1009',
      host: '192.168.88.1',
      apiPort: 8728,
      restPort: 443,
      useSsl: false,
      username: 'admin',
      passwordEncrypted: 'enc-pass',
      iv: 'iv-sample',
      authTag: 'tag-sample',
      rosVersion: RouterOsVersion.V7,
      deletedAt: null,
    };

    it('should create an encrypted backup and write audit log without exposing passwords or keys', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDeviceData);
      const mockClient = {
        createBackup: jest.fn().mockResolvedValue({
          filename: 'pre-sudafi-test.backup',
          size: 54000,
          creationTime: '2026-10-24 12:00:00',
        }),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      const res = await service.createBackup(
        mockTenantId,
        mockDeviceId,
        'pre-sudafi-test',
        'CustomLabPassword2026!',
        'user-admin-1',
      );

      expect(res.success).toBe(true);
      expect(res.backup.filename).toBe('pre-sudafi-test.backup');
      expect(res.backup.isEncrypted).toBe(true);
      expect(mockClient.createBackup).toHaveBeenCalledWith('pre-sudafi-test', 'CustomLabPassword2026!');

      // Critical check: Audit log MUST NOT contain the password!
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          userId: 'user-admin-1',
          action: 'ROUTER_BACKUP_CREATED',
          newValues: expect.objectContaining({
            backupFile: 'pre-sudafi-test.backup',
            isEncrypted: true,
          }),
        }),
      });

      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      const auditString = JSON.stringify(auditCall);
      expect(auditString).not.toContain('CustomLabPassword2026!');
      expect(auditString).not.toContain('password');
    });

    it('should derive a strong deterministic password when custom password is not provided', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDeviceData);
      const mockClient = {
        createBackup: jest.fn().mockResolvedValue({
          filename: 'auto-backup.backup',
          size: 48000,
        }),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      await service.createBackup(mockTenantId, mockDeviceId);

      expect(encryptionService.deriveDeterministicSecret).toHaveBeenCalledWith(
        `sudafi-router-backup:${mockTenantId}:${mockDeviceId}`,
        24,
      );
      expect(mockClient.createBackup).toHaveBeenCalledWith(
        undefined,
        'mock_derived_secret_24char',
      );
    });

    it('should throw BadRequestException if restoreBackup is not explicitly confirmed', async () => {
      await expect(
        service.restoreBackup(mockTenantId, mockDeviceId, 'backup.backup', 'pass', false),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if backup filename contains path traversal or invalid extension', async () => {
      await expect(
        service.restoreBackup(mockTenantId, mockDeviceId, '../etc/passwd.backup', 'pass', true),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.restoreBackup(mockTenantId, mockDeviceId, 'dangerous_script.sh', 'pass', true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadGatewayException and log audit on restore failure when router is offline', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDeviceData);
      mikrotikClientFactory.getClient.mockRejectedValue(new Error('Connection timed out to 192.168.88.1'));

      await expect(
        service.restoreBackup(mockTenantId, mockDeviceId, 'pre-sudafi.backup', 'pass', true),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should successfully restore backup, record audit without password, and mark device temporarily offline for reboot', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(mockDeviceData);
      prisma.mikroTikDevice.update.mockResolvedValue({ ...mockDeviceData, isOnline: false });
      const mockClient = {
        restoreBackup: jest.fn().mockResolvedValue({
          success: true,
          message: 'System configuration restored, router rebooting...',
          rebootTriggered: true,
        }),
      };
      mikrotikClientFactory.getClient.mockResolvedValue(mockClient);

      const res = await service.restoreBackup(
        mockTenantId,
        mockDeviceId,
        'pre-sudafi.backup',
        'CustomRestorePassword!',
        true,
        'user-admin-1',
      );

      expect(res.success).toBe(true);
      expect(res.rebootTriggered).toBe(true);
      expect(mockClient.restoreBackup).toHaveBeenCalledWith('pre-sudafi.backup', 'CustomRestorePassword!');

      // Verify device is temporarily marked offline
      expect(prisma.mikroTikDevice.update).toHaveBeenCalledWith({
        where: { id: mockDeviceId },
        data: expect.objectContaining({ isOnline: false }),
      });

      // Verify audit log
      const auditCall = prisma.auditLog.create.mock.calls.find(
        (c: any) => c[0].data.action === 'ROUTER_BACKUP_RESTORED',
      );
      expect(auditCall).toBeDefined();
      const auditStr = JSON.stringify(auditCall);
      expect(auditStr).not.toContain('CustomRestorePassword!');
      expect(auditStr).not.toContain('password');
    });
  });
});


