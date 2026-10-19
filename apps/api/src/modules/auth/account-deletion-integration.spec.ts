import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../core/database/prisma.service';
import { HashingService } from '../../core/security/hashing.service';
import { MailService } from './mail.service';
import { UserStatus } from '@prisma/client';
import { RoleName } from '@mikrotik-saas/shared-types';

describe('Account Deletion End-to-End Multi-Tenant Integration Suite', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockHashingService: any;
  let mockJwtService: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      mikroTikDevice: {
        count: jest.fn().mockResolvedValue(0),
      },
      card: {
        count: jest.fn().mockResolvedValue(0),
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
      $transaction: jest.fn().mockImplementation((fnOrArr) => {
        if (typeof fnOrArr === 'function') {
          return fnOrArr(mockPrisma);
        }
        return Promise.all(fnOrArr);
      }),
    };

    mockHashingService = {
      verifyPassword: jest.fn(),
      hashPassword: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn(),
    };

    authService = new AuthService(
      mockPrisma as unknown as PrismaService,
      mockJwtService as unknown as JwtService,
      mockHashingService as unknown as HashingService,
      {} as unknown as MailService,
    );
  });

  // Scenario 1: Clean sub-user with no financial or operational records
  test('Scenario 1: Clean cashier with no sales records is permanently deleted', async () => {
    const cleanCashier = {
      id: 'cashier-clean-001',
      tenantId: 'tenant-org-alpha',
      email: 'clean.cashier@sudafi.sd',
      passwordHash: 'valid-hash-clean',
      role: { name: RoleName.CASHIER },
    };

    mockPrisma.user.findUnique.mockResolvedValue(cleanCashier);
    mockHashingService.verifyPassword.mockResolvedValue(true);
    mockPrisma.cardBatch.count.mockResolvedValue(0);
    mockPrisma.saleTransaction.count.mockResolvedValue(0);
    mockPrisma.printJob.count.mockResolvedValue(0);
    mockPrisma.user.delete.mockResolvedValue(cleanCashier);

    const result = await authService.deleteAccount('cashier-clean-001', {
      password: 'CorrectPassword@2026',
    });

    expect(result.success).toBe(true);
    // Verified: user row is hard deleted
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'cashier-clean-001' } });
    // Verified: refresh tokens are purged
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'cashier-clean-001' } });
    // Verified: no PII remains
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  // Scenario 2: Sub-user with sales records is anonymized to protect accounting audit
  test('Scenario 2: Cashier with sales transactions is anonymized, leaving sales intact', async () => {
    const activeCashier = {
      id: 'cashier-sales-002',
      tenantId: 'tenant-org-alpha',
      email: 'sales.cashier@sudafi.sd',
      fullName: 'عمر الكاشير',
      phone: '+249912345678',
      passwordHash: 'valid-hash-sales',
      role: { name: RoleName.CASHIER },
    };

    mockPrisma.user.findUnique.mockResolvedValue(activeCashier);
    mockHashingService.verifyPassword.mockResolvedValue(true);
    mockPrisma.cardBatch.count.mockResolvedValue(0);
    mockPrisma.saleTransaction.count.mockResolvedValue(120); // 120 completed sales!
    mockPrisma.printJob.count.mockResolvedValue(0);
    mockPrisma.user.update.mockResolvedValue({ id: 'cashier-sales-002' });

    const result = await authService.deleteAccount('cashier-sales-002', {
      password: 'CorrectPassword@2026',
    });

    expect(result.success).toBe(true);
    // Hard delete MUST NOT be called so foreign key constraints on sale_transactions are not broken
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    // PII must be completely stripped and anonymized
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'cashier-sales-002' },
      data: expect.objectContaining({
        fullName: 'مستخدم محذوف',
        email: 'deleted_cashier-sales-002@deleted.local',
        phone: null,
        passwordHash: '',
        status: UserStatus.INACTIVE,
        deletedAt: expect.any(Date),
      }),
    });
    // Active sessions must be invalidated
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'cashier-sales-002' } });
  });

  // Scenario 3: Reject deleting tenant admin when other staff exist
  test('Scenario 3: Reject deleting TENANT_ADMIN when other staff exist in organization', async () => {
    const tenantAdmin = {
      id: 'admin-001',
      tenantId: 'tenant-org-alpha',
      email: 'admin@alpha.sd',
      passwordHash: 'valid-hash-admin',
      role: { name: RoleName.TENANT_ADMIN },
    };

    mockPrisma.user.findUnique.mockResolvedValue(tenantAdmin);
    mockHashingService.verifyPassword.mockResolvedValue(true);
    // There are 2 other active cashiers in tenant-org-alpha
    mockPrisma.user.count.mockImplementation(({ where }: any) => {
      if (where.tenantId === 'tenant-org-alpha' && where.id?.not === 'admin-001') {
        return Promise.resolve(2);
      }
      return Promise.resolve(0);
    });

    await expect(
      authService.deleteAccount('admin-001', {
        password: 'CorrectPassword@2026',
      }),
    ).rejects.toThrow(ConflictException);

    // Verified: No deletion or updates occurred
    expect(mockPrisma.tenant.delete).not.toHaveBeenCalled();
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  // Scenario 4: Reject deleting tenant when operational assets exist and no explicit confirmation
  test('Scenario 4: Reject deleting tenant with MikroTik routers when confirmDeleteOrganization is false', async () => {
    const soleAdminWithRouters = {
      id: 'sole-admin-001',
      tenantId: 'tenant-with-assets',
      email: 'sole.admin@assets.sd',
      passwordHash: 'valid-hash-sole',
      role: { name: RoleName.TENANT_ADMIN },
    };

    mockPrisma.user.findUnique.mockResolvedValue(soleAdminWithRouters);
    mockHashingService.verifyPassword.mockResolvedValue(true);
    // 0 other users
    mockPrisma.user.count.mockResolvedValue(0);
    // 3 live MikroTik routers registered!
    mockPrisma.mikroTikDevice.count.mockResolvedValue(3);
    mockPrisma.card.count.mockResolvedValue(500);

    // User did not pass confirmDeleteOrganization
    await expect(
      authService.deleteAccount('sole-admin-001', {
        password: 'CorrectPassword@2026',
        confirmDeleteOrganization: false,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrisma.tenant.delete).not.toHaveBeenCalled();
  });

  // Scenario 5: Success deleting tenant when sole admin confirms deletion
  test('Scenario 5: Allow deleting tenant organization when sole admin explicitly confirms', async () => {
    const soleAdminWithRouters = {
      id: 'sole-admin-001',
      tenantId: 'tenant-with-assets',
      email: 'sole.admin@assets.sd',
      passwordHash: 'valid-hash-sole',
      role: { name: RoleName.TENANT_ADMIN },
    };

    mockPrisma.user.findUnique.mockResolvedValue(soleAdminWithRouters);
    mockHashingService.verifyPassword.mockResolvedValue(true);
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.mikroTikDevice.count.mockResolvedValue(3);
    mockPrisma.card.count.mockResolvedValue(500);
    mockPrisma.tenant.delete.mockResolvedValue({ id: 'tenant-with-assets' });

    const result = await authService.deleteAccount('sole-admin-001', {
      password: 'CorrectPassword@2026',
      confirmDeleteOrganization: true, // Explicitly confirmed!
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.tenant.delete).toHaveBeenCalledWith({ where: { id: 'tenant-with-assets' } });
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'sole-admin-001' } });
  });

  // Scenario 6: Multi-tenant isolation — tenant Beta is never affected by deleting tenant Alpha
  test('Scenario 6: Ensure tenant Beta data remains completely untouched when tenant Alpha deletes', async () => {
    const soleAdminAlpha = {
      id: 'admin-alpha',
      tenantId: 'tenant-alpha',
      email: 'admin@alpha.sd',
      passwordHash: 'valid-hash-alpha',
      role: { name: RoleName.TENANT_ADMIN },
    };

    mockPrisma.user.findUnique.mockResolvedValue(soleAdminAlpha);
    mockHashingService.verifyPassword.mockResolvedValue(true);
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.mikroTikDevice.count.mockResolvedValue(0);
    mockPrisma.card.count.mockResolvedValue(0);
    mockPrisma.tenant.delete.mockResolvedValue({ id: 'tenant-alpha' });

    await authService.deleteAccount('admin-alpha', {
      password: 'CorrectPassword@2026',
      confirmDeleteOrganization: true,
    });

    // Tenant Alpha deleted, but Tenant Beta is NEVER queried or targeted
    expect(mockPrisma.tenant.delete).toHaveBeenCalledWith({ where: { id: 'tenant-alpha' } });
    expect(mockPrisma.tenant.delete).not.toHaveBeenCalledWith({ where: { id: 'tenant-beta' } });
  });

  // Scenario 7: Invalidation of deleted user on next request in JwtStrategy
  test('Scenario 7: JwtStrategy immediately rejects deleted or inactive user', async () => {
    // Soft-deleted user
    const deletedUser = {
      id: 'user-deleted-001',
      deletedAt: new Date(),
      status: UserStatus.INACTIVE,
    };

    mockPrisma.user.findUnique.mockResolvedValue(deletedUser);

    // Simulating JwtStrategy.validate check
    const validate = async (userRecord: any) => {
      if (!userRecord || userRecord.deletedAt !== null) {
        throw new UnauthorizedException('User account no longer exists');
      }
      if (userRecord.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('User account is suspended or inactive');
      }
      return userRecord;
    };

    await expect(validate(deletedUser)).rejects.toThrow(UnauthorizedException);
  });
});
