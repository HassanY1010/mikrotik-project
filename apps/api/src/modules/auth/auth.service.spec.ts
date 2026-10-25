import { UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../core/database/prisma.service';
import { HashingService } from '../../core/security/hashing.service';
import { MailService } from './mail.service';
import { UserStatus, SubscriptionStatus } from '@prisma/client';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: Partial<Record<keyof PrismaService, any>>;
  let jwtService: Partial<JwtService>;
  let hashingService: Partial<HashingService>;
  let mailService: Partial<MailService>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
        delete: jest.fn(),
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
        deleteMany: jest.fn(),
      },
      passwordResetToken: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'prt-1' }),
        findFirst: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      cardBatch: {
        count: jest.fn().mockResolvedValue(0),
      },
      saleTransaction: {
        count: jest.fn().mockResolvedValue(0),
      },
      printJob: {
        count: jest.fn().mockResolvedValue(0),
      },
      mikroTikDevice: {
        count: jest.fn().mockResolvedValue(0),
      },
      card: {
        count: jest.fn().mockResolvedValue(0),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cbOrArr) => {
        if (typeof cbOrArr === 'function') {
          return cbOrArr(prisma);
        }
        return Promise.all(cbOrArr);
      }),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mocked-jwt-token'),
    };

    hashingService = {
      verifyPassword: jest.fn(),
      hashPassword: jest.fn().mockResolvedValue('mocked-argon2-hash'),
    };

    mailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      hashingService as unknown as HashingService,
      mailService as unknown as MailService,
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

    it('should successfully register tenant with TENANT_ADMIN role and auto-activate a 48-hour free trial subscription', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.subscriptionPlan.findUnique as jest.Mock).mockResolvedValue({ id: 'plan-basic', name: 'BASIC' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValue({ id: 'role-tenant-admin', name: 'TENANT_ADMIN' });

      const createdTenant = { id: 'tenant-new-1', name: 'Al-Baraka WiFi', slug: 'al-baraka' };
      const createdUser = { id: 'user-new-1', email: 'owner@albaraka.sd', fullName: 'Omer Ahmed' };
      const trialPlan = {
        id: 'plan-trial-id',
        name: 'TRIAL',
        nameAr: 'الباقة التجريبية المجانية',
        maxRouters: 5,
        features: { isUnlimited: true, maxRouters: 5 },
      };

      let capturedSubscriptionData: any = null;

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tenant: { create: jest.fn().mockResolvedValue(createdTenant) },
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          cardTemplate: { create: jest.fn().mockResolvedValue({ id: 'tpl-1' }) },
          auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
          subscriptionPlan: {
            findUnique: jest.fn().mockResolvedValue(trialPlan),
            create: jest.fn(),
          },
          subscription: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args) => {
              capturedSubscriptionData = args.data;
              return {
                id: 'sub-trial-1',
                ...args.data,
                plan: trialPlan,
              };
            }),
          },
        };
        return await callback(tx);
      });

      const beforeCall = Date.now();
      const result = await authService.registerTenant({
        tenantName: 'Al-Baraka WiFi',
        slug: 'al-baraka',
        adminFullName: 'Omer Ahmed',
        adminEmail: 'owner@albaraka.sd',
        adminPassword: 'Password@123',
        currency: 'SDG',
      });
      const afterCall = Date.now();

      expect(result.tenant.id).toEqual('tenant-new-1');
      expect(result.user.email).toEqual('owner@albaraka.sd');
      expect(result.message).toContain('تم تسجيل الشبكة بنجاح وتفعيل الباقة التجريبية المجانية');
      expect(result.subscription.status).toBe(SubscriptionStatus.TRIAL);
      expect(result.subscription.plan).toBe('TRIAL');
      expect(result.subscription.planNameAr).toBe('الباقة التجريبية المجانية');

      // Verify trial subscription parameters
      expect(capturedSubscriptionData).toBeDefined();
      expect(capturedSubscriptionData.status).toBe(SubscriptionStatus.TRIAL);
      expect(capturedSubscriptionData.price).toBe(0);
      expect(capturedSubscriptionData.maxRouters).toBe(5);

      // Verify exact 48-hour UTC duration from activation
      const startsAtTime = new Date(capturedSubscriptionData.startsAt).getTime();
      const expiresAtTime = new Date(capturedSubscriptionData.expiresAt).getTime();
      const durationMs = expiresAtTime - startsAtTime;
      const expected48HoursMs = 48 * 60 * 60 * 1000;

      expect(durationMs).toBe(expected48HoursMs);
      expect(startsAtTime).toBeGreaterThanOrEqual(beforeCall);
      expect(startsAtTime).toBeLessThanOrEqual(afterCall);
    });

    it('should be idempotent and not create duplicate trial subscription if one already exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.subscriptionPlan.findUnique as jest.Mock).mockResolvedValue({ id: 'plan-basic', name: 'BASIC' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValue({ id: 'role-tenant-admin', name: 'TENANT_ADMIN' });

      const createdTenant = { id: 'tenant-new-1', name: 'Al-Baraka WiFi', slug: 'al-baraka' };
      const createdUser = { id: 'user-new-1', email: 'owner@albaraka.sd', fullName: 'Omer Ahmed' };
      const existingTrialSub = {
        id: 'sub-existing-trial',
        status: SubscriptionStatus.TRIAL,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        plan: { name: 'TRIAL', nameAr: 'الباقة التجريبية المجانية' },
      };

      const createSubMock = jest.fn();

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tenant: { create: jest.fn().mockResolvedValue(createdTenant) },
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          cardTemplate: { create: jest.fn().mockResolvedValue({ id: 'tpl-1' }) },
          auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
          subscriptionPlan: {
            findUnique: jest.fn().mockResolvedValue({ id: 'plan-trial-id', name: 'TRIAL' }),
            create: jest.fn(),
          },
          subscription: {
            findFirst: jest.fn().mockResolvedValue(existingTrialSub),
            create: createSubMock,
          },
        };
        return await callback(tx);
      });

      const result = await authService.registerTenant({
        tenantName: 'Al-Baraka WiFi',
        slug: 'al-baraka',
        adminFullName: 'Omer Ahmed',
        adminEmail: 'owner@albaraka.sd',
        adminPassword: 'Password@123',
      });

      expect(createSubMock).not.toHaveBeenCalled();
      expect(result.subscription.status).toBe(SubscriptionStatus.TRIAL);
    });

    it('should handle trial creation database failure cleanly and reject registration', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.subscriptionPlan.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.role.findFirst as jest.Mock).mockResolvedValue({ id: 'role-tenant-admin', name: 'TENANT_ADMIN' });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tenant: { create: jest.fn().mockResolvedValue({ id: 't-1' }) },
          user: { create: jest.fn() },
          cardTemplate: { create: jest.fn() },
          auditLog: { create: jest.fn() },
          subscriptionPlan: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockRejectedValue(new Error('DB Connection Timeout')),
          },
          subscription: {
            findFirst: jest.fn(),
            create: jest.fn(),
          },
        };
        return await callback(tx);
      });

      await expect(
        authService.registerTenant({
          tenantName: 'Al-Baraka WiFi',
          slug: 'al-baraka',
          adminFullName: 'Omer Ahmed',
          adminEmail: 'owner@albaraka.sd',
          adminPassword: 'Password@123',
        }),
      ).rejects.toThrow('DB Connection Timeout');
    });
  });

  describe('forgotPassword', () => {
    it('should return success and exists true when user exists in database', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'user@sudafi.sd',
        fullName: 'Ahmed Ali',
        status: UserStatus.ACTIVE,
      });

      const result = await authService.forgotPassword({ email: 'user@sudafi.sd' });

      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.message).toContain('البريد الإلكتروني مسجل');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.forgotPassword({ email: 'unknown@sudafi.sd' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyResetCode', () => {
    it('should verify code and return verified resetToken when code matches', async () => {
      const code = '123456';
      const crypto = require('crypto');
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'user@sudafi.sd',
      });

      (prisma.passwordResetToken.findFirst as jest.Mock).mockResolvedValue({
        id: 'prt-1',
        userId: 'user-123',
        codeHash,
        tokenHash: 'verified-token-hash-xyz',
        attempts: 0,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const result = await authService.verifyResetCode({
        email: 'user@sudafi.sd',
        code: '123456',
      });

      expect(result.valid).toBe(true);
      expect(result.resetToken).toEqual('verified-token-hash-xyz');
    });

    it('should throw BadRequestException on invalid code and increment attempts', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'user@sudafi.sd',
      });

      (prisma.passwordResetToken.findFirst as jest.Mock).mockResolvedValue({
        id: 'prt-1',
        userId: 'user-123',
        codeHash: 'correct-code-hash',
        attempts: 1,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      (prisma.passwordResetToken.update as jest.Mock).mockResolvedValue({
        id: 'prt-1',
        attempts: 2,
      });

      await expect(
        authService.verifyResetCode({
          email: 'user@sudafi.sd',
          code: '999999',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ attempts: { increment: 1 } }),
        }),
      );
    });
  });

  describe('resetPassword', () => {
    it('should reset password, invalidate token and revoke all refresh tokens in transaction', async () => {
      const code = '654321';
      const crypto = require('crypto');
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'user@sudafi.sd',
      });

      (prisma.passwordResetToken.findFirst as jest.Mock).mockResolvedValue({
        id: 'prt-1',
        userId: 'user-123',
        codeHash,
        tokenHash: 'token-abc',
        attempts: 0,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      (prisma.$transaction as jest.Mock).mockResolvedValue([
        { id: 'user-123' },
        { id: 'prt-1' },
        { count: 2 },
        { id: 'log-1' },
      ]);

      const result = await authService.resetPassword({
        email: 'user@sudafi.sd',
        code: '654321',
        newPassword: 'NewSecurePassword@2026',
        confirmPassword: 'NewSecurePassword@2026',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('تم تغيير كلمة المرور بنجاح');
      expect(hashingService.hashPassword).toHaveBeenCalledWith('NewSecurePassword@2026');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should directly reset password without code when email and newPassword match', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-direct-123',
        email: 'direct@sudafi.sd',
        status: UserStatus.ACTIVE,
      });

      (prisma.$transaction as jest.Mock).mockResolvedValue([
        { id: 'user-direct-123' },
        { count: 1 },
        { count: 2 },
        { id: 'log-direct' },
      ]);

      const result = await authService.resetPassword({
        email: 'direct@sudafi.sd',
        newPassword: 'BrandNewPassword@2026',
        confirmPassword: 'BrandNewPassword@2026',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('تم تغيير كلمة المرور بنجاح');
      expect(hashingService.hashPassword).toHaveBeenCalledWith('BrandNewPassword@2026');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('should throw NotFoundException if user is not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.deleteAccount('non-existent', { password: 'Pass' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if current password verification fails', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hash-abc',
        role: { name: 'CASHIER' },
      });
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.deleteAccount('user-1', { password: 'WrongPassword' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if sole SUPER_ADMIN attempts to delete account', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'super-admin-1',
        passwordHash: 'valid-hash',
        role: { name: 'SUPER_ADMIN' },
      });
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (prisma.user.count as jest.Mock).mockResolvedValue(1); // Only 1 super admin

      await expect(
        authService.deleteAccount('super-admin-1', { password: 'ValidPassword' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully delete SUPER_ADMIN if other active super admins exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'super-admin-1',
        passwordHash: 'valid-hash',
        role: { name: 'SUPER_ADMIN' },
      });
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (prisma.user.count as jest.Mock).mockResolvedValue(2); // 2 super admins exist
      (prisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.user.delete as jest.Mock).mockResolvedValue({ id: 'super-admin-1' });

      const res = await authService.deleteAccount('super-admin-1', { password: 'ValidPassword' });

      expect(res.success).toBe(true);
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'super-admin-1' } });
    });

    it('should throw ConflictException if TENANT_ADMIN attempts deletion while other users exist in tenant', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'tenant-admin-1',
        tenantId: 'tenant-100',
        passwordHash: 'valid-hash',
        role: { name: 'TENANT_ADMIN' },
      });
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (prisma.user.count as jest.Mock).mockResolvedValue(3); // 3 other users in tenant

      await expect(
        authService.deleteAccount('tenant-admin-1', { password: 'ValidPassword' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if sole TENANT_ADMIN has operational assets and did not confirm organization deletion', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'sole-admin-with-routers',
        tenantId: 'tenant-active-100',
        passwordHash: 'valid-hash',
        role: { name: 'TENANT_ADMIN' },
      });
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (prisma.user.count as jest.Mock).mockResolvedValue(0); // 0 other users
      (prisma.mikroTikDevice.count as jest.Mock).mockResolvedValue(2); // Has 2 MikroTik routers!

      await expect(
        authService.deleteAccount('sole-admin-with-routers', {
          password: 'ValidPassword',
          confirmDeleteOrganization: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully delete sole TENANT_ADMIN and cascade delete tenant when confirmDeleteOrganization is true or tenant has no assets', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'sole-admin-1',
        tenantId: 'tenant-sole-100',
        passwordHash: 'valid-hash',
        role: { name: 'TENANT_ADMIN' },
      });
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (prisma.user.count as jest.Mock).mockResolvedValue(0); // 0 other users
      (prisma.mikroTikDevice.count as jest.Mock).mockResolvedValue(2);
      (prisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
      (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.tenant.delete as jest.Mock).mockResolvedValue({ id: 'tenant-sole-100' });

      const res = await authService.deleteAccount('sole-admin-1', {
        password: 'ValidPassword',
        confirmDeleteOrganization: true,
      });

      expect(res.success).toBe(true);
      expect(prisma.tenant.delete).toHaveBeenCalledWith({ where: { id: 'tenant-sole-100' } });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'sole-admin-1' } });
    });

    it('should permanently hard delete sub-user if no financial or batch references exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'cashier-clean-1',
        tenantId: 'tenant-100',
        passwordHash: 'valid-hash',
        role: { name: 'CASHIER' },
      });
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (prisma.cardBatch.count as jest.Mock).mockResolvedValue(0);
      (prisma.saleTransaction.count as jest.Mock).mockResolvedValue(0);
      (prisma.printJob.count as jest.Mock).mockResolvedValue(0);
      (prisma.user.delete as jest.Mock).mockResolvedValue({ id: 'cashier-clean-1' });

      const res = await authService.deleteAccount('cashier-clean-1', { password: 'ValidPassword' });

      expect(res.success).toBe(true);
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'cashier-clean-1' } });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'cashier-clean-1' } });
    });

    it('should anonymize PII and permanently deactivate sub-user if financial sales records exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'cashier-sales-1',
        tenantId: 'tenant-100',
        passwordHash: 'valid-hash',
        role: { name: 'CASHIER' },
      });
      (hashingService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (prisma.cardBatch.count as jest.Mock).mockResolvedValue(0);
      (prisma.saleTransaction.count as jest.Mock).mockResolvedValue(45); // Has 45 sales!
      (prisma.printJob.count as jest.Mock).mockResolvedValue(0);
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: 'cashier-sales-1' });

      const res = await authService.deleteAccount('cashier-sales-1', { password: 'ValidPassword' });

      expect(res.success).toBe(true);
      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'cashier-sales-1' },
        data: expect.objectContaining({
          fullName: 'مستخدم محذوف',
          email: 'deleted_cashier-sales-1@deleted.local',
          phone: null,
          passwordHash: '',
          status: UserStatus.INACTIVE,
          deletedAt: expect.any(Date),
        }),
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'cashier-sales-1' } });
    });
  });
});
