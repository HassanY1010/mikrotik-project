import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../core/database/prisma.service';
import { HashingService } from '../../core/security/hashing.service';
import { UserStatus } from '@prisma/client';
import { RoleName } from '@mikrotik-saas/shared-types';

describe('Staff & Permissions Security Audit Tests (المرحلة الأولى إلى الخامسة)', () => {
  let service: UsersService;
  let prisma: any;
  let hashingService: any;

  const mockTenantId = 'tenant-1234-uuid';
  const mockOwnerId = 'owner-uuid';
  const mockStaffId = 'staff-uuid';
  const mockDeviceId1 = 'device-1-uuid';
  const mockDeviceId2 = 'device-2-uuid';

  const mockOwnerUser = {
    id: mockOwnerId,
    tenantId: mockTenantId,
    email: 'owner@suda.fi',
    fullName: 'مالك المنظومة الرئيسي',
    roleId: 'role-owner-uuid',
    status: UserStatus.ACTIVE,
    role: { id: 'role-owner-uuid', name: RoleName.TENANT_ADMIN },
  };

  const mockStaffUser = {
    id: mockStaffId,
    tenantId: mockTenantId,
    email: 'cashier@suda.fi',
    fullName: 'موظف كاشير',
    roleId: 'role-cashier-uuid',
    status: UserStatus.ACTIVE,
    role: { id: 'role-cashier-uuid', name: RoleName.CASHIER },
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
      permission: {
        findMany: jest.fn(),
      },
      userPermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      mikroTikDevice: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      userDeviceAccess: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      staffInvitation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      subscription: {
        findFirst: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    hashingService = {
      hashPassword: jest.fn().mockResolvedValue('hashed-password'),
      verifyPassword: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: HashingService, useValue: hashingService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('المرحلة الأولى: منع تصعيد الصلاحيات وحماية حساب المالك', () => {
    it('يجب منع الموظف من تعديل دوره أو رفع صلاحياته بنفسه', async () => {
      prisma.user.findFirst.mockResolvedValue(mockStaffUser);

      const staffCaller = {
        id: mockStaffId,
        email: 'cashier@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.CASHIER,
      };

      await expect(
        service.update(
          mockTenantId,
          mockStaffId,
          { roleName: RoleName.TENANT_ADMIN },
          staffCaller,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('يجب منع أي مستخدم غير المالك أو المشرف العام من تعديل حساب المالك الرئيسي', async () => {
      prisma.user.findFirst.mockResolvedValue(mockOwnerUser);

      const staffCaller = {
        id: mockStaffId,
        email: 'cashier@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.MANAGER,
      };

      await expect(
        service.update(
          mockTenantId,
          mockOwnerId,
          { fullName: 'اسم جديد محتال' },
          staffCaller,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('يجب منع ترقية أي مستخدم إلى TENANT_ADMIN أو SUPER_ADMIN إلا من قبل المشرف العام', async () => {
      prisma.user.findFirst.mockResolvedValue(mockStaffUser);

      const managerCaller = {
        id: 'manager-uuid',
        email: 'manager@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.MANAGER,
      };

      await expect(
        service.update(
          mockTenantId,
          mockStaffId,
          { roleName: RoleName.TENANT_ADMIN },
          managerCaller,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('يجب منع تعطيل أو إيقاف حساب المالك الرئيسي للمنظومة', async () => {
      prisma.user.findFirst.mockResolvedValue(mockOwnerUser);

      const caller = {
        id: 'manager-uuid',
        email: 'manager@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.MANAGER,
      };

      await expect(
        service.update(
          mockTenantId,
          mockOwnerId,
          { status: UserStatus.SUSPENDED },
          caller,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('يجب منع حذف حساب المالك الرئيسي للمنظومة', async () => {
      prisma.user.findFirst.mockResolvedValue(mockOwnerUser);

      const caller = {
        id: mockOwnerId,
        email: 'owner@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.TENANT_ADMIN,
      };

      // Owner cannot delete self, nor can owner be deleted
      await expect(
        service.delete(mockTenantId, mockOwnerId, caller),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('المرحلة الثانية والثالثة: تقييد أجهزة MikroTik والصلاحيات الدقيقة', () => {
    it('يجب رفض تعيين جهاز يتبع مستأجراً آخر أو غير موجود في الشبكة', async () => {
      prisma.user.findFirst.mockResolvedValue(mockStaffUser);
      // Device lookup returns only 1 device while 2 were requested (one belongs to other tenant)
      prisma.mikroTikDevice.findMany.mockResolvedValue([{ id: mockDeviceId1 }]);

      const adminCaller = {
        id: mockOwnerId,
        email: 'owner@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.TENANT_ADMIN,
      };

      await expect(
        service.assignDevices(
          mockTenantId,
          mockStaffId,
          { deviceIds: [mockDeviceId1, 'foreign-tenant-device-uuid'] },
          adminCaller,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('يجب حفظ علاقة تخصيص الأجهزة بأمان للموظف بعد التحقق من ملكيتها', async () => {
      prisma.user.findFirst.mockResolvedValue(mockStaffUser);
      prisma.mikroTikDevice.findMany.mockResolvedValue([
        { id: mockDeviceId1 },
        { id: mockDeviceId2 },
      ]);
      prisma.userDeviceAccess.deleteMany.mockResolvedValue({ count: 1 });
      prisma.userDeviceAccess.createMany.mockResolvedValue({ count: 2 });

      const adminCaller = {
        id: mockOwnerId,
        email: 'owner@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.TENANT_ADMIN,
      };

      const result = await service.assignDevices(
        mockTenantId,
        mockStaffId,
        { deviceIds: [mockDeviceId1, mockDeviceId2] },
        adminCaller,
      );

      expect(result.success).toBe(true);
      expect(result.assignedCount).toBe(2);
      expect(prisma.userDeviceAccess.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockStaffId },
      });
      expect(prisma.userDeviceAccess.createMany).toHaveBeenCalled();
    });

    it('يجب حفظ الصلاحيات المخصصة للموظف ورفض تعديل المستخدم لصلاحياته بنفسه', async () => {
      prisma.user.findFirst.mockResolvedValue(mockStaffUser);

      const staffCaller = {
        id: mockStaffId,
        email: 'cashier@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.CASHIER,
      };

      await expect(
        service.assignPermissions(
          mockTenantId,
          mockStaffId,
          { permissionCodes: ['finance:view'] },
          staffCaller,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('المرحلة الرابعة: دعوات الموظفين وإدارة الجلسات عند التعطيل', () => {
    it('يجب إنشاء دعوة موظف مشفرة ومؤقتة بصلاحية 7 أيام', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.subscription.findFirst.mockResolvedValue({
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 86400000),
        plan: { name: 'PRO', features: { multiCashier: true } },
      });
      prisma.role.findFirst.mockResolvedValue({ id: 'role-cashier-uuid' });
      prisma.staffInvitation.deleteMany.mockResolvedValue({ count: 0 });
      prisma.staffInvitation.create.mockImplementation((args: any) => ({
        id: 'invite-123',
        ...args.data,
      }));

      const adminCaller = {
        id: mockOwnerId,
        email: 'owner@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.TENANT_ADMIN,
      };

      const result = await service.createInvitation(
        mockTenantId,
        {
          email: 'newcashier@suda.fi',
          fullName: 'محاسب جديد',
          roleName: 'CASHIER',
        },
        adminCaller,
      );

      expect(result.id).toBe('invite-123');
      expect(result.token).toBeDefined();
      expect(result.inviteUrl).toContain('/invitation/');
      expect(prisma.staffInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'newcashier@suda.fi',
            roleId: 'role-cashier-uuid',
            tokenHash: expect.any(String),
          }),
        }),
      );
    });

    it('يجب رفض قبول دعوة منتهية الصلاحية أو مستخدمة مسبقاً', async () => {
      prisma.staffInvitation.findUnique.mockResolvedValue({
        id: 'invite-123',
        acceptedAt: new Date(), // Already accepted
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(
        service.acceptInvitation('raw-token-123', 'NewPass@1234'),
      ).rejects.toThrow(BadRequestException);
    });

    it('يجب إبطال الجلسات ورموز التحديث فور تعطيل حساب الموظف', async () => {
      prisma.user.findFirst.mockResolvedValue(mockStaffUser);
      prisma.user.update.mockResolvedValue({
        ...mockStaffUser,
        status: UserStatus.SUSPENDED,
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      jest.spyOn(service, 'findById').mockResolvedValue({
        id: mockStaffId,
        status: UserStatus.SUSPENDED,
        assignedDevices: [],
        customPermissions: [],
      });

      const adminCaller = {
        id: mockOwnerId,
        email: 'owner@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.TENANT_ADMIN,
      };

      await service.update(
        mockTenantId,
        mockStaffId,
        { status: UserStatus.SUSPENDED },
        adminCaller,
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: mockStaffId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('المرحلة الخامسة: التحقق من الاشتراكات وحدود الباقات', () => {
    it('يجب رفض إضافة كاشير إضافي إذا كانت الباقة الأساسية لا تدعم ذلك', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.subscription.findFirst.mockResolvedValue({
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 86400000),
        plan: {
          name: 'BASIC',
          features: { maxRouters: 1, multiCashier: false },
        },
      });
      // Already has 1 staff member
      prisma.user.count.mockResolvedValue(1);

      const adminCaller = {
        id: mockOwnerId,
        email: 'owner@suda.fi',
        tenantId: mockTenantId,
        role: RoleName.TENANT_ADMIN,
      };

      await expect(
        service.create(
          mockTenantId,
          {
            email: 'secondcashier@suda.fi',
            fullName: 'كاشير إضافي',
            password: 'Pass@12345678',
            roleName: 'CASHIER',
          },
          adminCaller,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
