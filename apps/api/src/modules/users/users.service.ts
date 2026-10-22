import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { HashingService } from '../../core/security/hashing.service';
import type { RequestUser } from '../../core/decorators/current-user.decorator';
import { UserStatus } from '@prisma/client';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { CreateInvitationDto } from './dto/create-invitation.dto';
import type { AssignDevicesDto } from './dto/assign-devices.dto';
import type { AssignPermissionsDto } from './dto/assign-permissions.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashingService: HashingService,
  ) {}

  private async checkSubscriptionStaffLimit(tenantId: string): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        plan: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (sub) {
      if (new Date(sub.expiresAt).getTime() <= Date.now()) {
        throw new ForbiddenException({
          code: 'SUBSCRIPTION_EXPIRED',
          message: 'انتهت صلاحية اشتراك الشبكة. يرجى تجديد الاشتراك لإدارة وإضافة الموظفين.',
        });
      }

      const features = (sub.plan?.features as Record<string, unknown>) || {};
      // If basic plan without multiCashier or unlimitedCashiers, enforce 1 cashier limit
      if (features.multiCashier !== true && features.unlimitedCashiers !== true) {
        const staffCount = await this.prisma.user.count({
          where: {
            tenantId,
            deletedAt: null,
            role: {
              name: { in: ['CASHIER', 'MANAGER'] },
            },
          },
        });

        if (staffCount >= 1) {
          throw new ForbiddenException({
            code: 'STAFF_LIMIT_EXCEEDED',
            message: `الباقة الحالية (${sub.plan.name}) لا تدعم إضافة أكثر من موظف/كاشير واحد. يرجى الترقية إلى باقة PRO أو BUSINESS.`,
          });
        }
      }
    }
  }

  async findAll(tenantId: string): Promise<Record<string, unknown>[]> {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        deviceAccess: {
          select: {
            device: {
              select: {
                id: true,
                name: true,
                host: true,
              },
            },
          },
        },
        userPermissions: {
          select: {
            permission: {
              select: {
                code: true,
                name: true,
                module: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      ...u,
      assignedDevices: u.deviceAccess.map((da) => da.device),
      customPermissions: u.userPermissions.map((up) => up.permission.code),
    }));
  }

  async findById(tenantId: string, id: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        deviceAccess: {
          select: {
            device: {
              select: {
                id: true,
                name: true,
                host: true,
              },
            },
          },
        },
        userPermissions: {
          select: {
            permission: {
              select: {
                code: true,
                name: true,
                module: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      assignedDevices: user.deviceAccess.map((da) => da.device),
      customPermissions: user.userPermissions.map((up) => up.permission.code),
    };
  }

  async create(
    tenantId: string,
    dto: CreateUserDto,
    currentUser?: RequestUser,
  ): Promise<Record<string, unknown>> {
    if (
      currentUser &&
      currentUser.role !== 'SUPER_ADMIN' &&
      currentUser.role !== 'TENANT_ADMIN'
    ) {
      throw new ForbiddenException('غير مصرح لك بإضافة موظفين');
    }

    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const roleNameUpper = dto.roleName.toUpperCase();
    if (roleNameUpper === 'SUPER_ADMIN' || roleNameUpper === 'TENANT_ADMIN') {
      throw new ForbiddenException('Cannot assign administrative role');
    }

    // Check plan limits
    await this.checkSubscriptionStaffLimit(tenantId);

    // Find role in system or tenant
    const role = await this.prisma.role.findFirst({
      where: {
        name: roleNameUpper,
        OR: [{ tenantId }, { isSystem: true, tenantId: null }],
      },
    });

    if (!role) {
      throw new NotFoundException(`Role '${dto.roleName}' not found`);
    }

    // Validate assigned devices if provided
    if (dto.assignedDeviceIds && dto.assignedDeviceIds.length > 0) {
      const validDevices = await this.prisma.mikroTikDevice.findMany({
        where: {
          id: { in: dto.assignedDeviceIds },
          tenantId,
          deletedAt: null,
        },
      });
      if (validDevices.length !== dto.assignedDeviceIds.length) {
        throw new BadRequestException('أحد أجهزة الراوتر المحددة غير موجود أو لا ينتمي لشبكتك');
      }
    }

    const passwordHash = await this.hashingService.hashPassword(dto.password);

    const newUser = await this.prisma.user.create({
      data: {
        tenantId,
        email,
        fullName: dto.fullName.trim(),
        passwordHash,
        phone: dto.phone,
        roleId: role.id,
        status: UserStatus.ACTIVE,
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Assign devices
    if (dto.assignedDeviceIds && dto.assignedDeviceIds.length > 0) {
      await this.prisma.userDeviceAccess.createMany({
        data: dto.assignedDeviceIds.map((deviceId) => ({
          userId: newUser.id,
          deviceId,
        })),
        skipDuplicates: true,
      });
    }

    // Assign custom permissions
    if (dto.permissionCodes && dto.permissionCodes.length > 0) {
      const perms = await this.prisma.permission.findMany({
        where: { code: { in: dto.permissionCodes } },
      });
      if (perms.length > 0) {
        await this.prisma.userPermission.createMany({
          data: perms.map((p) => ({
            userId: newUser.id,
            permissionId: p.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    return this.findById(tenantId, newUser.id);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
    currentUser?: RequestUser,
  ): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Protection 1: Prevent any user from modifying the primary tenant admin/owner,
    // unless caller is SUPER_ADMIN or the owner themselves.
    if (
      user.role.name === 'TENANT_ADMIN' &&
      currentUser &&
      currentUser.id !== user.id &&
      currentUser.role !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException('لا يمكنك تعديل حساب المالك الرئيسي للمنظومة');
    }

    // Protection 2: Prevent user from modifying their own role or elevating their privileges
    if (
      currentUser &&
      currentUser.id === id &&
      dto.roleName !== undefined &&
      dto.roleName.toUpperCase() !== currentUser.role.toUpperCase()
    ) {
      throw new ForbiddenException('لا يمكنك تعديل دورك أو صلاحياتك بنفسك');
    }

    // Protection 3: Prevent promoting to SUPER_ADMIN or TENANT_ADMIN
    let roleId = user.roleId;
    if (dto.roleName) {
      const targetRoleName = dto.roleName.toUpperCase();
      if (targetRoleName === 'SUPER_ADMIN' || targetRoleName === 'TENANT_ADMIN') {
        if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
          throw new ForbiddenException('لا يمكن رفع المستخدم إلى دور مدير المنصة أو مالك المنظومة');
        }
      }

      const role = await this.prisma.role.findFirst({
        where: {
          name: targetRoleName,
          OR: [{ tenantId }, { isSystem: true, tenantId: null }],
        },
      });

      if (!role) {
        throw new NotFoundException(`Role '${dto.roleName}' not found`);
      }
      roleId = role.id;
    }

    // Protection 4: Prevent disabling/suspending the primary tenant admin/owner
    if (user.role.name === 'TENANT_ADMIN' && dto.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('لا يمكن تعطيل حساب المالك الرئيسي للمنظومة');
    }

    // If status is changed to SUSPENDED, immediately revoke all active refresh tokens & sessions
    if (dto.status === UserStatus.SUSPENDED) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        phone: dto.phone,
        roleId,
        status: dto.status,
      },
    });

    // Update assigned devices if provided
    if (dto.assignedDeviceIds !== undefined) {
      if (dto.assignedDeviceIds.length > 0) {
        const validDevices = await this.prisma.mikroTikDevice.findMany({
          where: {
            id: { in: dto.assignedDeviceIds },
            tenantId,
            deletedAt: null,
          },
        });
        if (validDevices.length !== dto.assignedDeviceIds.length) {
          throw new BadRequestException('أحد أجهزة الراوتر المحددة غير موجود أو لا ينتمي لشبكتك');
        }
      }

      await this.prisma.userDeviceAccess.deleteMany({ where: { userId: id } });
      if (dto.assignedDeviceIds.length > 0) {
        await this.prisma.userDeviceAccess.createMany({
          data: dto.assignedDeviceIds.map((deviceId) => ({
            userId: id,
            deviceId,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Update custom permissions if provided
    if (dto.permissionCodes !== undefined) {
      await this.prisma.userPermission.deleteMany({ where: { userId: id } });
      if (dto.permissionCodes.length > 0) {
        const perms = await this.prisma.permission.findMany({
          where: { code: { in: dto.permissionCodes } },
        });
        if (perms.length > 0) {
          await this.prisma.userPermission.createMany({
            data: perms.map((p) => ({
              userId: id,
              permissionId: p.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    return this.findById(tenantId, id);
  }

  async delete(
    tenantId: string,
    id: string,
    currentUser?: RequestUser,
  ): Promise<{ success: boolean; message?: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Protection 1: Prevent user from deleting their own account via staff management
    if (currentUser && currentUser.id === id) {
      throw new ForbiddenException('لا يمكنك حذف حسابك بنفسك من إدارة الموظفين');
    }

    // Protection 2: Prevent deleting the primary tenant admin/owner
    if (user.role.name === 'TENANT_ADMIN') {
      throw new ForbiddenException('لا يمكن حذف حساب المالك الرئيسي للمنظومة');
    }

    // Soft delete: keep historical records intact (cards sold, batches, transactions, etc.)
    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: UserStatus.SUSPENDED,
      },
    });

    // Revoke all active sessions
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Remove device access assignments
    await this.prisma.userDeviceAccess.deleteMany({
      where: { userId: id },
    });

    return { success: true, message: 'تم حذف حساب الموظف وإلغاء صلاحياته بنجاح' };
  }

  async assignDevices(
    tenantId: string,
    userId: string,
    dto: AssignDevicesDto,
    currentUser?: RequestUser,
  ): Promise<{ success: boolean; assignedCount: number; deviceIds: string[] }> {
    if (
      currentUser &&
      currentUser.role !== 'SUPER_ADMIN' &&
      currentUser.role !== 'TENANT_ADMIN'
    ) {
      throw new ForbiddenException('غير مصرح لك بتعيين صلاحيات الأجهزة للموظفين');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('الموظف غير موجود');
    }

    if (user.role.name === 'TENANT_ADMIN') {
      throw new BadRequestException('المالك الرئيسي للشبكة يمتلك صلاحية الوصول إلى جميع الأجهزة تلقائياً');
    }

    // Verify all devices belong to tenantId
    if (dto.deviceIds.length > 0) {
      const validDevices = await this.prisma.mikroTikDevice.findMany({
        where: {
          id: { in: dto.deviceIds },
          tenantId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (validDevices.length !== dto.deviceIds.length) {
        throw new BadRequestException('أحد أجهزة الراوتر المحددة غير موجود أو يتبع شبكة أخرى');
      }
    }

    await this.prisma.userDeviceAccess.deleteMany({
      where: { userId },
    });

    if (dto.deviceIds.length > 0) {
      await this.prisma.userDeviceAccess.createMany({
        data: dto.deviceIds.map((deviceId) => ({
          userId,
          deviceId,
        })),
        skipDuplicates: true,
      });
    }

    return {
      success: true,
      assignedCount: dto.deviceIds.length,
      deviceIds: dto.deviceIds,
    };
  }

  async assignPermissions(
    tenantId: string,
    userId: string,
    dto: AssignPermissionsDto,
    currentUser?: RequestUser,
  ): Promise<{ success: boolean; permissions: string[] }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('الموظف غير موجود');
    }

    if (currentUser && currentUser.id === userId) {
      throw new ForbiddenException('لا يمكنك تعديل صلاحياتك بنفسك');
    }

    await this.prisma.userPermission.deleteMany({
      where: { userId },
    });

    if (dto.permissionCodes.length > 0) {
      const perms = await this.prisma.permission.findMany({
        where: { code: { in: dto.permissionCodes } },
        select: { id: true, code: true },
      });

      if (perms.length > 0) {
        await this.prisma.userPermission.createMany({
          data: perms.map((p) => ({
            userId,
            permissionId: p.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    return {
      success: true,
      permissions: dto.permissionCodes,
    };
  }

  // ===========================================================================
  // STAFF INVITATIONS
  // ===========================================================================

  async createInvitation(
    tenantId: string,
    dto: CreateInvitationDto,
    currentUser: RequestUser,
  ): Promise<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    token: string;
    expiresAt: Date;
    inviteUrl: string;
  }> {
    const email = dto.email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existingUser) {
      throw new ConflictException('يوجد مستخدم مسجل مسبقاً بهذا البريد الإلكتروني');
    }

    const roleNameUpper = dto.roleName.toUpperCase();
    if (roleNameUpper === 'SUPER_ADMIN' || roleNameUpper === 'TENANT_ADMIN') {
      throw new ForbiddenException('لا يمكن إرسال دعوة لدور مدير المنصة أو مالك المنظومة');
    }

    // Check plan limits
    await this.checkSubscriptionStaffLimit(tenantId);

    const role = await this.prisma.role.findFirst({
      where: {
        name: roleNameUpper,
        OR: [{ tenantId }, { isSystem: true, tenantId: null }],
      },
    });

    if (!role) {
      throw new NotFoundException(`Role '${dto.roleName}' not found`);
    }

    // Delete existing pending unaccepted invitation for this email if any
    await this.prisma.staffInvitation.deleteMany({
      where: {
        tenantId,
        email,
        acceptedAt: null,
      },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await this.prisma.staffInvitation.create({
      data: {
        tenantId,
        email,
        fullName: dto.fullName.trim(),
        phone: dto.phone,
        roleId: role.id,
        tokenHash,
        expiresAt,
        createdById: currentUser.id,
      },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      fullName: invitation.fullName,
      role: dto.roleName,
      token: rawToken,
      expiresAt: invitation.expiresAt,
      inviteUrl: `/invitation/${rawToken}`,
    };
  }

  async listInvitations(tenantId: string): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.staffInvitation.findMany({
      where: {
        tenantId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((inv) => ({
      id: inv.id,
      email: inv.email,
      fullName: inv.fullName,
      phone: inv.phone,
      role: inv.role.name,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  async resendInvitation(
    tenantId: string,
    invitationId: string,
    currentUser: RequestUser,
  ): Promise<{ success: boolean; token: string; expiresAt: Date; inviteUrl: string }> {
    if (
      currentUser.role !== 'SUPER_ADMIN' &&
      currentUser.role !== 'TENANT_ADMIN'
    ) {
      throw new ForbiddenException('غير مصرح لك بإعادة إرسال الدعوات');
    }

    const invitation = await this.prisma.staffInvitation.findFirst({
      where: {
        id: invitationId,
        tenantId,
        acceptedAt: null,
      },
    });

    if (!invitation) {
      throw new NotFoundException('طلب الدعوة غير موجود أو تم قبوله مسبقاً');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.staffInvitation.update({
      where: { id: invitationId },
      data: {
        tokenHash,
        expiresAt,
      },
    });

    return {
      success: true,
      token: rawToken,
      expiresAt,
      inviteUrl: `/invitation/${rawToken}`,
    };
  }

  async cancelInvitation(
    tenantId: string,
    invitationId: string,
    currentUser: RequestUser,
  ): Promise<{ success: boolean }> {
    if (
      currentUser.role !== 'SUPER_ADMIN' &&
      currentUser.role !== 'TENANT_ADMIN'
    ) {
      throw new ForbiddenException('غير مصرح لك بإلغاء الدعوات');
    }

    const invitation = await this.prisma.staffInvitation.findFirst({
      where: { id: invitationId, tenantId },
    });

    if (!invitation) {
      throw new NotFoundException('طلب الدعوة غير موجود');
    }

    await this.prisma.staffInvitation.delete({
      where: { id: invitationId },
    });

    return { success: true };
  }

  async getInvitationDetails(rawToken: string): Promise<Record<string, unknown>> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        role: {
          select: {
            name: true,
            description: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('رابط الدعوة غير صالح');
    }

    if (invitation.acceptedAt !== null) {
      throw new BadRequestException('تم قبول هذه الدعوة مسبقاً');
    }

    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('عذراً، انتهت صلاحية رابط الدعوة هذا');
    }

    return {
      id: invitation.id,
      email: invitation.email,
      fullName: invitation.fullName,
      roleName: invitation.role.name,
      tenantName: invitation.tenant.name,
      tenantLogo: invitation.tenant.logoUrl,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(
    rawToken: string,
    password: string,
  ): Promise<Record<string, unknown>> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: { role: true },
    });

    if (!invitation) {
      throw new NotFoundException('رابط الدعوة غير صالح');
    }

    if (invitation.acceptedAt !== null) {
      throw new BadRequestException('تم قبول هذه الدعوة مسبقاً');
    }

    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('عذراً، انتهت صلاحية رابط الدعوة هذا');
    }

    const email = invitation.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('يوجد حساب مسجل بهذا البريد مسبقاً');
    }

    const passwordHash = await this.hashingService.hashPassword(password);

    const newUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: invitation.tenantId,
          email,
          fullName: invitation.fullName,
          phone: invitation.phone,
          passwordHash,
          roleId: invitation.roleId,
          status: UserStatus.ACTIVE,
        },
        include: {
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return user;
    });

    return {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      role: newUser.role.name,
      tenantId: newUser.tenantId,
      status: newUser.status,
    };
  }
}
