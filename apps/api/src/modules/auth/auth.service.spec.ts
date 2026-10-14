import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../core/database/prisma.service';
import { HashingService } from '../../core/security/hashing.service';
import { UserStatus } from '@prisma/client';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: Partial<Record<keyof PrismaService, any>>;
  let jwtService: Partial<JwtService>;
  let hashingService: Partial<HashingService>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
      subscriptionPlan: {
        findUnique: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mocked-jwt-token'),
    };

    hashingService = {
      verifyPassword: jest.fn(),
      hashPassword: jest.fn().mockResolvedValue('mocked-argon2-hash'),
    };

    authService = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      hashingService as unknown as HashingService,
    );
  });

  describe('login', () => {
    it('should successfully authenticate and return tokens and user profile', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'admin@alnoor.local',
        passwordHash: '$argon2id$...',
        fullName: 'Admin User',
        status: UserStatus.ACTIVE,
        tenantId: 'tenant-123',
        deletedAt: null,
        role: {
          name: 'TENANT_ADMIN',
          rolePermissions: [{ permission: { code: 'cards:read' } }],
        },
        tenant: {
          id: 'tenant-123',
          slug: 'alnoor',
          name: 'Al Noor',
          status: 'ACTIVE',
        },
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const result = await authService.login(
        { email: 'admin@alnoor.local', password: 'Password@123' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(result.accessToken).toEqual('mocked-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toEqual('admin@alnoor.local');
      expect(result.user.role).toEqual('TENANT_ADMIN');
      expect(result.user.permissions).toContain('cards:read');
    });

    it('should throw UnauthorizedException on invalid password', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'admin@alnoor.local',
        passwordHash: '$argon2id$...',
        status: UserStatus.ACTIVE,
        deletedAt: null,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login({ email: 'admin@alnoor.local', password: 'WrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is suspended', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'suspended@alnoor.local',
        passwordHash: '$argon2id$...',
        status: UserStatus.SUSPENDED,
        deletedAt: null,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        authService.login({ email: 'suspended@alnoor.local', password: 'AnyPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
    it('should successfully authenticate SUPER_ADMIN without tenantId', async () => {
      const mockSuperAdmin = {
        id: 'super-admin-1',
        email: 'ahmed@gmail.com',
        passwordHash: '$argon2id$...',
        fullName: 'Ahmed Super Admin',
        status: UserStatus.ACTIVE,
        tenantId: null,
        tenant: null,
        deletedAt: null,
        role: {
          name: 'SUPER_ADMIN',
          rolePermissions: [{ permission: { code: 'tenants:manage' } }],
        },
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockSuperAdmin);
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockSuperAdmin);
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const result = await authService.login(
        { email: 'ahmed@gmail.com', password: 'Password@123' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(result.accessToken).toEqual('mocked-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.role).toEqual('SUPER_ADMIN');
      expect(result.user.tenantId).toBeNull();
      expect(result.user.tenantName).toBeUndefined();
    });
  });

  describe('refreshToken', () => {
    it('should throw UnauthorizedException if refresh token is missing or empty', async () => {
      await expect(authService.refreshToken('')).rejects.toThrow(UnauthorizedException);
      await expect(authService.refreshToken('   ')).rejects.toThrow(UnauthorizedException);
    });

    it('should successfully rotate refresh token and issue new token pair', async () => {
      const mockTokenRecord = {
        id: 'token-rec-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 days ahead
        user: {
          id: 'user-1',
          email: 'admin@alnoor.local',
          status: UserStatus.ACTIVE,
          deletedAt: null,
          tenantId: 'tenant-1',
          role: { name: 'TENANT_ADMIN' },
        },
      };

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(mockTokenRecord);
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      const result = await authService.refreshToken('valid-raw-refresh-token');

      expect(result.accessToken).toEqual('mocked-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-rec-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('should tolerate in-flight race condition within 30-second grace window without killing user session', async () => {
      const mockRecentlyRevokedRecord = {
        id: 'token-rec-2',
        userId: 'super-admin-1',
        revokedAt: new Date(Date.now() - 2000), // Revoked 2 seconds ago (concurrent request race)
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        user: {
          id: 'super-admin-1',
          email: 'ahmed@gmail.com',
          status: UserStatus.ACTIVE,
          deletedAt: null,
          tenantId: null,
          role: { name: 'SUPER_ADMIN' },
        },
      };

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(mockRecentlyRevokedRecord);

      const result = await authService.refreshToken('recent-in-flight-token');

      expect(result.accessToken).toEqual('mocked-jwt-token');
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('should detect malicious token reuse after grace window and revoke all user sessions', async () => {
      const mockOldRevokedRecord = {
        id: 'token-rec-old',
        userId: 'user-hacked-1',
        revokedAt: new Date(Date.now() - 60000), // Revoked 60 seconds ago (outside grace window)
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        user: {
          id: 'user-hacked-1',
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      };

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(mockOldRevokedRecord);
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({});

      await expect(authService.refreshToken('old-stolen-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-hacked-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });

    it('should throw UnauthorizedException if refresh token has expired', async () => {
      const mockExpiredRecord = {
        id: 'token-rec-expired',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        user: {
          id: 'user-1',
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      };

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(mockExpiredRecord);

      await expect(authService.refreshToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should revoke user refresh tokens upon logout', async () => {
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({});

      const result = await authService.logout('user-1', 'raw-token-123');

      expect(result.success).toBe(true);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });

  describe('registerTenant', () => {
    it('should throw ConflictException if email is already taken', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-id' });

      await expect(
        authService.registerTenant({
          tenantName: 'New Org',
          slug: 'new-org',
          adminFullName: 'Admin',
          adminEmail: 'existing@email.com',
          adminPassword: 'Password@123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully register tenant with TENANT_ADMIN role and without active paid subscription', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.subscriptionPlan.findUnique as jest.Mock).mockResolvedValue({ id: 'plan-basic', name: 'BASIC' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValue({ id: 'role-tenant-admin', name: 'TENANT_ADMIN' });

      const createdTenant = { id: 'tenant-new-1', name: 'Al-Baraka WiFi', slug: 'al-baraka' };
      const createdUser = { id: 'user-new-1', email: 'owner@albaraka.sd', fullName: 'Omer Ahmed' };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tenant: { create: jest.fn().mockResolvedValue(createdTenant) },
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          cardTemplate: { create: jest.fn().mockResolvedValue({ id: 'tpl-1' }) },
          auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
          subscription: { create: jest.fn() }, // Should NOT be called
        };
        const res = await callback(tx);
        expect(tx.subscription.create).not.toHaveBeenCalled();
        return res;
      });

      const result = await authService.registerTenant({
        tenantName: 'Al-Baraka WiFi',
        slug: 'al-baraka',
        adminFullName: 'Omer Ahmed',
        adminEmail: 'owner@albaraka.sd',
        adminPassword: 'Password@123',
        currency: 'SDG',
      });

      expect(result.tenant.id).toEqual('tenant-new-1');
      expect(result.user.email).toEqual('owner@albaraka.sd');
      expect(result.message).toContain('تم تسجيل الشبكة بنجاح');
    });
  });
});
