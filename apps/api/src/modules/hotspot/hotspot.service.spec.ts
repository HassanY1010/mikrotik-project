import { Test, TestingModule } from '@nestjs/testing';
import { HotspotService } from './hotspot.service';
import { PrismaService } from '../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { NotFoundException, ConflictException, BadGatewayException } from '@nestjs/common';
import { RouterOsVersion } from '@prisma/client';

describe('HotspotService', () => {
  let service: HotspotService;
  let prisma: any;
  let mikrotikClientFactory: any;
  let mockClient: any;

  const mockTenantId = 'tenant-1';
  const mockDeviceId = 'device-1';
  const mockDevice = {
    id: mockDeviceId,
    tenantId: mockTenantId,
    name: 'Core Router',
    host: '10.0.0.1',
    apiPort: 8728,
    restPort: 443,
    useSsl: false,
    username: 'admin',
    passwordEncrypted: 'enc_pw',
    iv: 'iv_val',
    authTag: 'tag_val',
    rosVersion: RouterOsVersion.V7,
    isOnline: true,
  };

  beforeEach(async () => {
    mockClient = {
      listHotspotProfiles: jest.fn(),
      createHotspotProfile: jest.fn(),
      deleteHotspotProfile: jest.fn(),
      listActiveSessions: jest.fn(),
      removeActiveSession: jest.fn(),
    };

    prisma = {
      mikroTikDevice: {
        findFirst: jest.fn().mockResolvedValue(mockDevice),
        findMany: jest.fn().mockResolvedValue([mockDevice]),
      },
      hotspotProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      card: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ id: mockTenantId }),
      },
    };

    mikrotikClientFactory = {
      getClient: jest.fn().mockResolvedValue(mockClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HotspotService,
        { provide: PrismaService, useValue: prisma },
        { provide: MikrotikClientFactory, useValue: mikrotikClientFactory },
      ],
    }).compile();

    service = module.get<HotspotService>(HotspotService);
  });

  describe('listProfiles', () => {
    it('should throw NotFoundException if device is not found or does not belong to tenant', async () => {
      prisma.mikroTikDevice.findFirst.mockResolvedValue(null);

      await expect(service.listProfiles(mockTenantId, 'unknown-device')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return profiles list from database', async () => {
      const mockProfiles = [
        { id: 'prof-1', name: '1hour', rateLimit: '2M/2M', dataLimitBytes: null, dataLimitGb: null },
        { id: 'prof-2', name: 'default', rateLimit: null, dataLimitBytes: null, dataLimitGb: null },
      ];
      prisma.hotspotProfile.findMany.mockResolvedValue([
        { id: 'prof-1', name: '1hour', rateLimit: '2M/2M' },
        { id: 'prof-2', name: 'default', rateLimit: null },
      ]);

      const result = await service.listProfiles(mockTenantId, mockDeviceId);
      expect(result).toEqual(mockProfiles);
      expect(prisma.hotspotProfile.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, deviceId: mockDeviceId },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('createProfile', () => {
    it('should throw ConflictException if profile name already exists', async () => {
      prisma.hotspotProfile.findFirst.mockResolvedValue({ id: 'prof-1', name: '1hour' });

      await expect(
        service.createProfile(mockTenantId, mockDeviceId, { name: '1hour' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should provision profile on router and save in database', async () => {
      prisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockClient.createHotspotProfile.mockResolvedValue('*1');
      prisma.hotspotProfile.create.mockResolvedValue({
        id: 'prof-new',
        name: '3hours',
        rateLimit: '5M/5M',
      });

      const res = await service.createProfile(mockTenantId, mockDeviceId, {
        name: '3hours',
        rateLimit: '5M/5M',
        sharedUsers: 2,
      });

      expect(mockClient.createHotspotProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '3hours',
          rateLimit: '5M/5M',
          sharedUsers: 2,
        }),
      );
      expect(prisma.hotspotProfile.create).toHaveBeenCalled();
      expect(res.name).toBe('3hours');
    });

    it('should throw BadGatewayException and NOT save to database when online router rejects command', async () => {
      prisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockClient.createHotspotProfile.mockRejectedValue(new Error('failure: syntax error in rate-limit'));

      await expect(
        service.createProfile(mockTenantId, mockDeviceId, {
          name: 'invalid-profile',
          rateLimit: 'invalid-syntax',
        }),
      ).rejects.toThrow(BadGatewayException);

      expect(prisma.hotspotProfile.create).not.toHaveBeenCalled();
    });

    it('should handle permission denied from router with user-friendly Arabic error message', async () => {
      prisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockClient.createHotspotProfile.mockRejectedValue(new Error('action not permitted: user has read-only access'));

      try {
        await service.createProfile(mockTenantId, mockDeviceId, {
          name: 'readonly-test',
        });
        fail('Should have thrown BadGatewayException');
      } catch (err: any) {
        expect(err.getStatus()).toBe(502);
        const res = err.getResponse();
        expect(res.message).toContain('صلاحيات الكتابة');
      }
      expect(prisma.hotspotProfile.create).not.toHaveBeenCalled();
    });

    it('should handle router timeout with appropriate message and redact secrets', async () => {
      prisma.hotspotProfile.findFirst.mockResolvedValue(null);
      mockClient.createHotspotProfile.mockRejectedValue(
        new Error('Connection timed out after 3000ms with password=SecretPassword123'),
      );

      try {
        await service.createProfile(mockTenantId, mockDeviceId, {
          name: 'timeout-test',
        });
        fail('Should have thrown BadGatewayException');
      } catch (err: any) {
        expect(err.getStatus()).toBe(502);
        const res = err.getResponse();
        expect(res.message).toContain('انتهت مهلة الاتصال بالراوتر');
        expect(JSON.stringify(res)).not.toContain('SecretPassword123');
        expect(JSON.stringify(res)).toContain('password=***');
      }
      expect(prisma.hotspotProfile.create).not.toHaveBeenCalled();
    });
  });

  describe('listActiveSessions', () => {
    it('should query router for live sessions', async () => {
      const mockSessions = [
        {
          id: '*A',
          user: 'card-1001',
          address: '192.168.88.50',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          uptime: '15m',
          bytesIn: 1048576,
          bytesOut: 5242880,
        },
      ];
      mockClient.listActiveSessions.mockResolvedValue(mockSessions);

      const result = await service.listActiveSessions(mockTenantId, mockDeviceId);
      expect(result).toEqual(mockSessions);
      expect(mockClient.listActiveSessions).toHaveBeenCalled();
    });
  });

  describe('listAllActiveSessions', () => {
    it('should enrich live sessions with Card and Profile data from accounting database', async () => {
      const mockSessions = [
        {
          id: '*1',
          user: 'voucher-101',
          address: '192.168.88.20',
          macAddress: 'AA:BB:CC:DD:EE:01',
          uptime: '30m',
          bytesIn: 10 * 1024 * 1024,
          bytesOut: 40 * 1024 * 1024,
          sessionTimeLeft: '1h',
        },
      ];
      mockClient.listActiveSessions.mockResolvedValue(mockSessions);

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-1',
          username: 'voucher-101',
          dataLimitBytes: BigInt(500 * 1024 * 1024), // 500 MB
          validityDays: 7,
          timeLimit: '2h',
          activatedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400 * 5 * 1000),
          profile: {
            name: 'Speed_5M',
            rateLimit: '2M/5M',
            dataLimitBytes: BigInt(500 * 1024 * 1024),
            sessionTimeout: '2h',
          },
        },
      ]);

      const result = await service.listAllActiveSessions(mockTenantId, mockDeviceId);
      expect(result.total).toBe(1);
      const session = result.data[0];

      expect(session.user).toBe('voucher-101');
      expect(session.profileName).toBe('Speed_5M');
      expect(session.downloadSpeedLimit).toBe('5 Mbps');
      expect(session.uploadSpeedLimit).toBe('2 Mbps');
      expect(session.consumedBytes).toBe(50 * 1024 * 1024); // 10MB + 40MB
      expect(session.totalQuotaBytes).toBe(500 * 1024 * 1024);
      expect(session.remainingBytes).toBe(450 * 1024 * 1024);
      expect(session.consumptionPercentage).toBe(10);
      expect(session.isQuotaExhausted).toBe(false);
      expect(session.isUnlimitedQuota).toBe(false);
      expect(session.isUnknownQuota).toBe(false);
      expect(session.connectionStatus).toBe('connected');
      expect(session.routerStatus).toBe('online');
      expect(result.meta.routers[0].status).toBe('online');
    });

    it('should accurately handle unlimited package with open quota', async () => {
      mockClient.listActiveSessions.mockResolvedValue([
        {
          id: '*2',
          user: 'open-user',
          address: '192.168.88.21',
          macAddress: 'AA:BB:CC:DD:EE:02',
          uptime: '1h',
          bytesIn: 100000000,
          bytesOut: 400000000,
        },
      ]);

      prisma.card.findMany.mockResolvedValue([
        {
          id: 'card-2',
          username: 'open-user',
          dataLimitBytes: null,
          timeLimit: null,
          profile: {
            name: 'Unlimited_VIP',
            rateLimit: null,
            dataLimitBytes: null,
          },
        },
      ]);

      const result = await service.listAllActiveSessions(mockTenantId, mockDeviceId);
      const session = result.data[0];
      expect(session.isUnlimitedQuota).toBe(true);
      expect(session.totalQuotaBytes).toBeNull();
      expect(session.remainingBytes).toBeNull();
      expect(session.consumptionPercentage).toBeNull();
      expect(session.isUnlimitedSpeed).toBe(true);
    });

    it('should report unknown accounting data when subscriber is unlinked rather than assuming 0', async () => {
      mockClient.listActiveSessions.mockResolvedValue([
        {
          id: '*3',
          user: 'unknown-mac-user',
          address: '192.168.88.25',
          macAddress: '11:22:33:44:55:66',
          uptime: '5m',
          bytesIn: 1024,
          bytesOut: 2048,
        },
      ]);
      prisma.card.findMany.mockResolvedValue([]);
      prisma.hotspotProfile.findMany.mockResolvedValue([]);

      const result = await service.listAllActiveSessions(mockTenantId, mockDeviceId);
      const session = result.data[0];
      expect(session.isUnknownQuota).toBe(true);
      expect(session.isUnlimitedQuota).toBe(false);
      expect(session.totalQuotaBytes).toBeNull();
      expect(session.remainingBytes).toBeNull();
    });

    it('should handle router connection errors gracefully and mark router as unreachable in metadata', async () => {
      mockClient.listActiveSessions.mockRejectedValue(new Error('Connection timed out'));

      const result = await service.listAllActiveSessions(mockTenantId, mockDeviceId);
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.meta.routers[0].status).toBe('unreachable');
      expect(result.meta.routers[0].error).toContain('Connection timed out');
    });
  });

  describe('kickSession', () => {
    it('should command router to remove active session', async () => {
      mockClient.removeActiveSession.mockResolvedValue(undefined);

      const result = await service.kickSession(mockTenantId, mockDeviceId, '*A');
      expect(mockClient.removeActiveSession).toHaveBeenCalledWith('*A');
      expect(result.success).toBe(true);
    });
  });
});
