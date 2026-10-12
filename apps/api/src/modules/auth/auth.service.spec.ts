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
