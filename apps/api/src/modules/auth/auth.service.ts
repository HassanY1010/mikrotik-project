import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { TenantStatus, UserStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { HashingService } from '../../core/security/hashing.service';
import { RoleName } from '@mikrotik-saas/shared-types';
import type { LoginDto } from './dto/login.dto';
import type { RegisterTenantDto } from './dto/register-tenant.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { DeleteAccountDto } from './dto/delete-account.dto';
import { MailService } from './mail.service';
import type { JwtPayload } from './jwt.strategy';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse extends AuthTokens {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    tenantId: string | null;
    tenantSlug?: string;
    tenantName?: string;
    permissions: string[];
    subscriptionPlan?: string;
    subscriptionPlanAr?: string;
    subscriptionExpiresAt?: Date;
    subscriptionStatus?: string;
    tenant?: {
      id: string;
      name: string;
      slug: string;
      currency: string;
      status: string;
      subscription: {
        planName: string;
        planNameAr: string;
        maxRouters: number;
        expiresAt: Date;
        billingCycle: string;
      } | null;
    } | null;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly hashingService: HashingService,
    private readonly mailService: MailService,
  ) {
    void this.mailService;
  }

  /**
   * Authenticates user credentials and generates access & refresh tokens.
   */
  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        tenant: {
          include: {
            subscriptions: {
              where: {
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
                expiresAt: { gt: new Date() },
              },
              include: { plan: true },
              orderBy: { expiresAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is suspended or deactivated');
    }

    // Verify password with Argon2id
    const isPasswordValid = await this.hashingService.verifyPassword(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify tenant status if user belongs to a tenant
    if (user.tenant) {
      if (user.tenant.status === TenantStatus.SUSPENDED) {
        throw new UnauthorizedException(
          'Tenant account is suspended. Please contact platform administration.',
        );
      }
      if (user.tenant.status === TenantStatus.EXPIRED) {
        throw new UnauthorizedException(
          'Tenant subscription has expired. Please renew to continue.',
        );
      }
    }

    // Auto-resolve tenant if user is not linked to a tenant
    let tenant = user.tenant;
    let tenantId = user.tenantId;

    if (!tenantId) {
      const matchedTenant = this.prisma.tenant?.findFirst
        ? await this.prisma.tenant.findFirst({
            where: {
              OR: [
                { contactEmail: user.email },
                { users: { some: { email: user.email } } },
              ],
            },
            include: {
              subscriptions: {
                where: {
                  status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
                  expiresAt: { gt: new Date() },
                },
                include: { plan: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          })
        : null;

      if (matchedTenant) {
        tenant = matchedTenant as any;
        tenantId = matchedTenant.id;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { tenantId: matchedTenant.id },
        }).catch(() => null);
      } else if (user.role.name === RoleName.SUPER_ADMIN) {
        const firstTenant = this.prisma.tenant?.findFirst
          ? await this.prisma.tenant.findFirst({
              include: {
                subscriptions: {
                  where: {
                    status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
                    expiresAt: { gt: new Date() },
                  },
                  include: { plan: true },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
              orderBy: { createdAt: 'asc' },
            })
          : null;
        if (firstTenant) {
          tenant = firstTenant as any;
          tenantId = firstTenant.id;
          await this.prisma.user.update({
            where: { id: user.id },
            data: { tenantId: firstTenant.id },
          }).catch(() => null);
        }
      }
    }

    const permissions = user.role.rolePermissions.map((rp) => rp.permission.code);
    const activeSub = tenant?.subscriptions?.[0];
    const isSuperAdmin = user.role.name === RoleName.SUPER_ADMIN;

    const subscriptionPlan = activeSub?.plan.name ?? (isSuperAdmin ? 'ENTERPRISE' : undefined);
    const subscriptionPlanAr = activeSub?.plan.nameAr ?? (isSuperAdmin ? 'باقة المشرف العام (شاملة)' : undefined);
    const subscriptionExpiresAt = activeSub?.expiresAt ?? (isSuperAdmin ? new Date(Date.now() + 3650 * 86400000) : undefined);
    const subscriptionStatus = activeSub ? activeSub.status : (isSuperAdmin ? 'ACTIVE' : 'NONE');

    // Generate tokens
    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      tenantId: tenantId ?? null,
      role: user.role.name,
    });

    // Store refresh token, update lastLoginAt, and record audit log in parallel to eliminate 2 database round-trips
    await Promise.all([
      this.storeRefreshToken(user.id, tokens.refreshToken, ipAddress, userAgent),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: tenantId,
          userId: user.id,
          action: 'auth:login',
          entity: 'User',
          entityId: user.id,
          newValues: {
            status: 'تسجيل دخول ناجح',
            email: user.email,
            fullName: user.fullName,
            role: user.role.name,
            platform: userAgent?.includes('Dart') ? 'تطبيق الموبايل (كاشير)' : 'متصفح لوحة التحكم',
          },
          ipAddress,
          userAgent,
        },
      }),
    ]);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
        tenantId: tenantId,
        tenantSlug: tenant?.slug,
        tenantName: tenant?.name,
        permissions,
        subscriptionPlan,
        subscriptionPlanAr,
        subscriptionExpiresAt,
        subscriptionStatus,
        tenant: tenant
          ? {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              currency: tenant.currency,
              status: tenant.status,
              subscription: activeSub
                ? {
                    planName: activeSub.plan.name,
                    planNameAr: activeSub.plan.nameAr,
                    maxRouters: activeSub.maxRouters,
                    expiresAt: activeSub.expiresAt,
                    billingCycle: activeSub.billingCycle,
                  }
                : (isSuperAdmin
                    ? {
                        planName: 'ENTERPRISE',
                        planNameAr: 'باقة المشرف العام (شاملة)',
                        maxRouters: 999,
                        expiresAt: new Date(Date.now() + 3650 * 86400000),
                        billingCycle: 'YEARLY',
                      }
                    : null),
            }
          : (isSuperAdmin
              ? {
                  id: 'super-admin-tenant',
                  name: 'إدارة المنظومة الرئيسية',
                  slug: 'super-admin',
                  currency: 'SDG',
                  status: 'ACTIVE',
                  subscription: {
                    planName: 'ENTERPRISE',
                    planNameAr: 'باقة المشرف العام (شاملة)',
                    maxRouters: 999,
                    expiresAt: new Date(Date.now() + 3650 * 86400000),
                    billingCycle: 'YEARLY',
                  },
                }
              : null),
      },
    };
  }

  /**
   * Registers a new tenant organization with primary Tenant Admin user and default subscription.
   */
  async registerTenant(
    dto: RegisterTenantDto,
    ipAddress?: string,
  ): Promise<{
    message: string;
    tenant: { id: string; name: string; slug: string };
    user: { id: string; email: string; fullName: string };
  }> {
    const email = dto.adminEmail.toLowerCase().trim();
    const slug = dto.slug.toLowerCase().trim();

    // Check if email already in use
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // Check if slug already in use
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });
    if (existingTenant) {
      throw new ConflictException('This organization URL slug is already taken');
    }

    // Hash password with Argon2id
    const passwordHash = await this.hashingService.hashPassword(dto.adminPassword);

    // Fetch requested plan name if provided
    const requestedPlanName = (dto.planName ?? 'BASIC').toUpperCase();
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { name: requestedPlanName },
    });
    // Note: Plan is checked for validity if specified, but paid subscription is activated exclusively by Super Admin

    // Fetch TENANT_ADMIN system role (guarantees user cannot self-assign SUPER_ADMIN)
    const tenantAdminRole = await this.prisma.role.findFirst({
      where: { name: RoleName.TENANT_ADMIN, tenantId: null },
    });
    if (!tenantAdminRole) {
      throw new NotFoundException('Default TENANT_ADMIN role is not configured');
    }

    // Transactional creation of Tenant, Admin User, and Default Card Template
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Tenant (currency defaults to SDG)
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName.trim(),
          slug,
          currency: dto.currency?.toUpperCase() ?? 'SDG',
          contactEmail: email,
          phone: dto.adminPhone,
          status: TenantStatus.ACTIVE,
        },
      });

      // 2. Note: Per project policy, new self-registered tenants do NOT receive an active
      // paid subscription automatically. Subscriptions are activated exclusively by Super Admin.

      // 3. Create Tenant Admin User with TENANT_ADMIN role
      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          fullName: dto.adminFullName.trim(),
          passwordHash,
          phone: dto.adminPhone,
          roleId: tenantAdminRole.id,
          status: UserStatus.ACTIVE,
        },
      });

      // 4. Create default Card Template (85x54mm thermal/card standard)
      await tx.cardTemplate.create({
        data: {
          tenantId: tenant.id,
          name: 'القالب القياسي - 85x54',
          widthMm: 85,
          heightMm: 54,
          orientation: 'landscape',
          isDefault: true,
          layoutConfig: {
            showNetworkName: true,
            networkName: tenant.name,
            showQrCode: true,
            qrCodeSize: 24,
            showPin: true,
            pinFontSize: 14,
            showSerialNumber: true,
            showPrice: true,
            showValidity: true,
          },
        },
      });

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: adminUser.id,
          action: 'tenant:registered',
          entity: 'Tenant',
          entityId: tenant.id,
          newValues: { name: tenant.name, slug: tenant.slug, requestedPlan: plan?.name ?? requestedPlanName },
          ipAddress,
        },
      });

      return { tenant, user: adminUser };
    });

    return {
      message: 'تم تسجيل الشبكة بنجاح. الحساب جاهز للاستخدام الأساسي وبانتظار تفعيل الباقة من إدارة المنصة',
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
      },
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
      },
    };
  }

  /**
   * Refreshes access token and rotates the refresh token.
   * Includes a 30-second grace window to prevent race conditions from concurrent requests.
   */
  async refreshToken(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string' || !rawRefreshToken.trim()) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const tokenHash = this.hashToken(rawRefreshToken.trim());

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            role: true,
            tenant: true,
          },
        },
      },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (tokenRecord.revokedAt !== null) {
      const revokedMsAgo = Date.now() - new Date(tokenRecord.revokedAt).getTime();
      // Allow a 30-second grace window for concurrent/in-flight requests in web/mobile
      if (revokedMsAgo < 30 * 1000) {
        const { user } = tokenRecord;
        if (user && user.status === UserStatus.ACTIVE && user.deletedAt === null) {
          // Generate valid access token for the active user session without wiping out tokens
          return this.generateTokens({
            sub: user.id,
            email: user.email,
            tenantId: user.tenantId,
            role: user.role.name,
          });
        }
      }

      // If used outside the grace window, this is true token reuse — revoke all user sessions
      await this.prisma.refreshToken.updateMany({
        where: { userId: tokenRecord.userId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token was already used. Please login again.');
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const { user } = tokenRecord;

    if (user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Revoke the used refresh token (Token Rotation)
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    // Generate new pair
    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role.name,
    });

    // Store new refresh token
    await this.storeRefreshToken(user.id, tokens.refreshToken, ipAddress, userAgent);

    return tokens;
  }

  /**
   * Logs out user and revokes the provided refresh token.
   */
  async logout(userId: string, rawRefreshToken?: string): Promise<{ success: boolean }> {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash },
        data: { revokedAt: new Date() },
      });
    } else {
      // Revoke all active tokens for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { success: true };
  }

  /**
   * Changes authenticated user password, hashes new password with Argon2id,
   * and revokes all active sessions for security.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentValid = await this.hashingService.verifyPassword(
      user.passwordHash,
      dto.currentPassword,
    );

    if (!isCurrentValid) {
      throw new BadRequestException('Current password does not match');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password cannot be the same as old password');
    }

    const newPasswordHash = await this.hashingService.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      }),
      // Revoke all active sessions
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return {
      success: true,
      message: 'Password changed successfully. All other sessions have been logged out.',
    };
  }

  /**
   * Permanently deletes or anonymizes user account and revokes active sessions.
   * - Requires verifying user's current password.
   * - Prevents deletion of the system's sole SUPER_ADMIN.
   * - Prevents deletion of a TENANT_ADMIN if the tenant still has other active users/staff.
   * - If user is a sole TENANT_ADMIN (no other staff), deletes the tenant (cascades to all tenant resources).
   * - If user is a sub-user (e.g. CASHIER, MANAGER):
   *     - If no financial or batch references exist, hard deletes user.
   *     - If financial or batch records exist, anonymizes all PII and permanently deactivates account.
   * - Completely revokes and removes all refresh tokens and reset tokens.
   */
  async deleteAccount(
    userId: string,
    dto: DeleteAccountDto,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    const isPasswordValid = await this.hashingService.verifyPassword(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    }

    // 1. Guard against deleting the only SUPER_ADMIN
    if (user.role.name === RoleName.SUPER_ADMIN) {
      const superAdminCount = await this.prisma.user.count({
        where: {
          role: { name: RoleName.SUPER_ADMIN },
          deletedAt: null,
          status: UserStatus.ACTIVE,
        },
      });

      if (superAdminCount <= 1) {
        throw new BadRequestException('لا يمكن حذف الحساب: أنت المشرف العام الوحيد للنظام.');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId } });
        await tx.user.delete({ where: { id: userId } });
      });

      this.logger.log(`[DELETE_ACCOUNT] Super admin account permanently deleted: ${userId}`);

      return {
        success: true,
        message: 'تم حذف حساب المشرف العام بنجاح',
      };
    }

    // 2. Guard against deleting TENANT_ADMIN when tenant has other active staff or operational assets
    if (user.role.name === RoleName.TENANT_ADMIN && user.tenantId) {
      const [otherUsersCount, devicesCount, cardsCount] = await Promise.all([
        this.prisma.user.count({
          where: {
            tenantId: user.tenantId,
            id: { not: userId },
            deletedAt: null,
          },
        }),
        this.prisma.mikroTikDevice.count({
          where: {
            tenantId: user.tenantId,
            deletedAt: null,
          },
        }),
        this.prisma.card.count({
          where: {
            tenantId: user.tenantId,
          },
        }),
      ]);

      if (otherUsersCount > 0) {
        throw new ConflictException(
          'لا يمكن حذف حساب مدير المنظومة لوجود مستخدمين آخرين تابعين للمؤسسة. يرجى حذف حسابات الموظفين أو نقل إدارة المؤسسة أولاً.',
        );
      }

      // If the organization owns live routers or cards, require explicit confirmation
      const hasOperationalAssets = devicesCount > 0 || cardsCount > 0;
      if (hasOperationalAssets && dto.confirmDeleteOrganization !== true) {
        throw new BadRequestException(
          'تحذير: حسابك يمتلك منظومة عمل تحتوي على أجهزة MikroTik أو كروت هوتسبوت. لحماية شبكتك، يرجى إزالة أجهزة الشبكة أولاً أو تأكيد الموافقة على حذف المنظومة وجميع أجهزتها نهائياً.',
        );
      }

      // Sole tenant admin with explicit confirmation or clean tenant: delete the tenant organization
      await this.prisma.$transaction(async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId } });
        await tx.tenant.delete({ where: { id: user.tenantId! } });
      });

      this.logger.log(
        `[DELETE_ACCOUNT] Sole tenant admin account and tenant deleted: user=${userId}, tenant=${user.tenantId}, devicesCleaned=${devicesCount}`,
      );

      return {
        success: true,
        message: 'تم حذف الحساب وجميع بيانات المنظومة التابعة له نهائيًا',
      };
    }

    // 3. Sub-user under a tenant (e.g., CASHIER, MANAGER)
    const [batchesCount, salesCount, printJobsCount] = await Promise.all([
      this.prisma.cardBatch.count({ where: { createdById: userId } }),
      this.prisma.saleTransaction.count({ where: { cashierId: userId } }),
      this.prisma.printJob.count({ where: { createdById: userId } }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });

      if (batchesCount === 0 && salesCount === 0 && printJobsCount === 0) {
        await tx.user.delete({ where: { id: userId } });
      } else {
        // Anonymize PII to maintain financial accounting audit constraints
        await tx.user.update({
          where: { id: userId },
          data: {
            fullName: 'مستخدم محذوف',
            email: `deleted_${userId}@deleted.local`,
            phone: null,
            passwordHash: '',
            status: UserStatus.INACTIVE,
            deletedAt: new Date(),
          },
        });
      }
    });

    this.logger.log(`[DELETE_ACCOUNT] Sub-user account deleted/anonymized: ${userId}`);

    return {
      success: true,
      message: 'تم حذف الحساب نهائيًا وإلغاء جميع الجلسات',
    };
  }

  /**
   * Checks if email exists in database for password recovery without sending email OTP codes.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<{ success: boolean; message: string; exists: boolean }> {
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException('البريد الإلكتروني المدخل غير مسجل لدينا في النظام.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('هذا الحساب معطل أو موقوف، يرجى مراجعة إدارة المنصة.');
    }

    return {
      success: true,
      exists: true,
      message: 'البريد الإلكتروني مسجل في النظام. يمكنك الآن كتابة وتأكيد كلمة المرور الجديدة.',
    };
  }

  /**
   * Verifies the 6-digit OTP code without consuming it, returning a verified resetToken.
   * Enforces brute-force protection (max 5 failed attempts).
   */
  async verifyResetCode(
    dto: VerifyResetCodeDto,
    ipAddress?: string,
  ): Promise<{ valid: boolean; resetToken: string; message: string }> {
    const email = dto.email.toLowerCase().trim();
    const code = dto.code.trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('رمز التحقق غير صحيح أو انتهت صلاحيته.');
    }

    const resetRecord = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetRecord) {
      throw new BadRequestException('رمز التحقق غير صالح أو انتهت صلاحيته (15 دقيقة). يرجى طلب رمز جديد.');
    }

    if (resetRecord.attempts >= 5) {
      await this.prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      });
      throw new BadRequestException(
        'تم تجاوز عدد المحاولات الخاطئة المسموح بها لهذا الرمز (5 محاولات). تم إبطال الرمز لأسباب أمنية، يرجى طلب رمز جديد.',
      );
    }

    const inputCodeHash = this.hashToken(code);
    if (inputCodeHash !== resetRecord.codeHash) {
      const updated = await this.prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: {
          attempts: { increment: 1 },
          ipAddress: ipAddress || resetRecord.ipAddress,
        },
      });
      const remaining = Math.max(0, 5 - updated.attempts);
      this.logger.warn(
        `Failed reset code attempt for user ${user.id} from IP ${ipAddress || 'unknown'}. Remaining attempts: ${remaining}`,
      );
      throw new BadRequestException(
        `رمز التحقق غير صحيح. متبقي لديك ${remaining} محاولات قبل إبطال الرمز.`,
      );
    }

    return {
      valid: true,
      resetToken: resetRecord.tokenHash,
      message: 'تم التحقق من الرمز بنجاح. يمكنك الآن كتابة كلمة المرور الجديدة.',
    };
  }

  /**
   * Completes password reset:
   * 1. Direct reset when email and newPassword are provided (no email OTP needed).
   * 2. Token / Code verification fallback for existing integrations.
   */
  async resetPassword(
    dto: ResetPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
    }

    if (dto.confirmPassword && dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('كلمة المرور وتأكيدها غير متطابقين.');
    }

    // Direct password reset when email is provided without requiring code or token
    if (dto.email && (!dto.code || !dto.code.trim()) && (!dto.token || !dto.token.trim())) {
      const email = dto.email.toLowerCase().trim();
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, tenantId: true, status: true, deletedAt: true },
      });

      if (!user || user.deletedAt) {
        throw new NotFoundException('البريد الإلكتروني المدخل غير مسجل لدينا في النظام.');
      }

      if (user.status !== UserStatus.ACTIVE) {
        throw new BadRequestException('هذا الحساب معطل أو موقوف، يرجى مراجعة إدارة المنصة.');
      }

      const newPasswordHash = await this.hashingService.hashPassword(dto.newPassword);

      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newPasswordHash },
        }),
        this.prisma.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        this.prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'AUTH_PASSWORD_RESET',
            entity: 'User',
            entityId: user.id,
            ipAddress,
            userAgent,
            newValues: {
              method: 'DIRECT_RESET_NO_CODE',
              email: user.email,
            },
          },
        }),
      ]);

      return {
        success: true,
        message: 'تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
      };
    }

    let resetRecord: {
      id: string;
      userId: string;
      codeHash: string;
      tokenHash: string;
      attempts: number;
      expiresAt: Date;
      usedAt: Date | null;
      user: {
        id: string;
        email: string;
        tenantId: string | null;
      };
    } | null = null;

    if (dto.token && dto.token.trim()) {
      const rawToken = dto.token.trim();
      const tokenHash = this.hashToken(rawToken);

      resetRecord = await this.prisma.passwordResetToken.findFirst({
        where: {
          OR: [{ tokenHash: rawToken }, { tokenHash }],
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
    } else if (dto.email && dto.code) {
      const email = dto.email.toLowerCase().trim();
      const code = dto.code.trim();

      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        const found = await this.prisma.passwordResetToken.findFirst({
          where: {
            userId: user.id,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        });

        if (found) {
          if (found.attempts >= 5) {
            await this.prisma.passwordResetToken.update({
              where: { id: found.id },
              data: { usedAt: new Date() },
            });
            throw new BadRequestException('تم تجاوز عدد المحاولات الخاطئة. يرجى طلب رمز جديد.');
          }

          if (this.hashToken(code) === found.codeHash) {
            resetRecord = found;
          } else {
            await this.prisma.passwordResetToken.update({
              where: { id: found.id },
              data: { attempts: { increment: 1 } },
            });
            throw new BadRequestException('رمز التحقق غير صحيح.');
          }
        }
      }
    }

    if (!resetRecord) {
      throw new BadRequestException(
        'رمز أو رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية أو تم استخدامه مسبقاً.',
      );
    }

    const newPasswordHash = await this.hashingService.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      // 1. Update user password
      this.prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newPasswordHash },
      }),
      // 2. Mark reset token as used (single-use enforcement)
      this.prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
      // 3. Revoke all active sessions and refresh tokens
      this.prisma.refreshToken.updateMany({
        where: { userId: resetRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      // 4. Create security audit record
      this.prisma.auditLog.create({
        data: {
          userId: resetRecord.userId,
          tenantId: resetRecord.user?.tenantId ?? null,
          action: 'AUTH_PASSWORD_RESET',
          entity: 'User',
          entityId: resetRecord.userId,
          ipAddress,
          userAgent,
          newValues: {
            method: dto.token ? 'LINK_TOKEN' : 'VERIFICATION_CODE',
          },
        },
      }),
    ]);

    return {
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
    };
  }

  /**
   * Returns current authenticated user profile, permissions, and tenant details.
   */
  async getMe(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        tenant: {
          include: {
            subscriptions: {
              where: {
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
                expiresAt: { gt: new Date() },
              },
              include: { plan: true },
              orderBy: { expiresAt: 'desc' },
              take: 1,
            },
            _count: {
              select: {
                devices: { where: { deletedAt: null } },
                cards: true,
                users: { where: { deletedAt: null } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let tenant = user.tenant;
    let tenantId = user.tenantId;

    if (!tenantId && this.prisma.tenant?.findFirst) {
      const matchedTenant = await this.prisma.tenant.findFirst({
        where: {
          OR: [
            { contactEmail: user.email },
            { users: { some: { email: user.email } } },
          ],
        },
        include: {
          subscriptions: {
            where: {
              status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
              expiresAt: { gt: new Date() },
            },
            include: { plan: true },
            orderBy: { expiresAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              devices: { where: { deletedAt: null } },
              cards: true,
              users: { where: { deletedAt: null } },
            },
          },
        },
      });

      if (matchedTenant) {
        tenant = matchedTenant as any;
        tenantId = matchedTenant.id;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { tenantId: matchedTenant.id },
        }).catch(() => null);
      } else if (user.role.name === RoleName.SUPER_ADMIN && this.prisma.tenant?.findFirst) {
        const firstTenant = await this.prisma.tenant.findFirst({
          include: {
            subscriptions: {
              where: {
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
                expiresAt: { gt: new Date() },
              },
              include: { plan: true },
              orderBy: { expiresAt: 'desc' },
              take: 1,
            },
            _count: {
              select: {
                devices: { where: { deletedAt: null } },
                cards: true,
                users: { where: { deletedAt: null } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        });
        if (firstTenant) {
          tenant = firstTenant as any;
          tenantId = firstTenant.id;
          await this.prisma.user.update({
            where: { id: user.id },
            data: { tenantId: firstTenant.id },
          }).catch(() => null);
        }
      }
    }

    const permissions = user.role.rolePermissions.map((rp) => rp.permission.code);
    const activeSubscription = tenant?.subscriptions?.[0];
    const isSuperAdmin = user.role.name === RoleName.SUPER_ADMIN;

    const subscriptionPlan = activeSubscription?.plan.name ?? (isSuperAdmin ? 'ENTERPRISE' : undefined);
    const subscriptionPlanAr = activeSubscription?.plan.nameAr ?? (isSuperAdmin ? 'باقة المشرف العام (شاملة)' : undefined);
    const subscriptionExpiresAt = activeSubscription?.expiresAt ?? (isSuperAdmin ? new Date(Date.now() + 3650 * 86400000) : undefined);
    const subscriptionStatus = activeSubscription ? activeSubscription.status : (isSuperAdmin ? 'ACTIVE' : 'NONE');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role.name,
      permissions,
      subscriptionPlan,
      subscriptionPlanAr,
      subscriptionExpiresAt,
      subscriptionStatus,
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            currency: tenant.currency,
            status: tenant.status,
            subscription: activeSubscription
              ? {
                  planName: activeSubscription.plan.name,
                  planNameAr: activeSubscription.plan.nameAr,
                  maxRouters: activeSubscription.maxRouters,
                  expiresAt: activeSubscription.expiresAt,
                  billingCycle: activeSubscription.billingCycle,
                }
              : (isSuperAdmin
                  ? {
                      planName: 'ENTERPRISE',
                      planNameAr: 'باقة المشرف العام (شاملة)',
                      maxRouters: 999,
                      expiresAt: new Date(Date.now() + 3650 * 86400000),
                      billingCycle: 'YEARLY',
                    }
                  : null),
            counts: tenant._count,
          }
        : (isSuperAdmin
            ? {
                id: 'super-admin-tenant',
                name: 'إدارة المنظومة الرئيسية',
                slug: 'super-admin',
                currency: 'SDG',
                status: 'ACTIVE',
                subscription: {
                  planName: 'ENTERPRISE',
                  planNameAr: 'باقة المشرف العام (شاملة)',
                  maxRouters: 999,
                  expiresAt: new Date(Date.now() + 3650 * 86400000),
                  billingCycle: 'YEARLY',
                },
              }
            : null),
    };
  }

  // ---------------------------------------------------------------------------
  // Helper methods
  // ---------------------------------------------------------------------------

  private parseDurationToSeconds(duration: string, fallback = 900): number {
    const match = /^(\d+)([smhd])$/.exec(duration.trim());
    if (!match) return fallback;
    const num = parseInt(match[1], 10);
    switch (match[2]) {
      case 's':
        return num;
      case 'm':
        return num * 60;
      case 'h':
        return num * 3600;
      case 'd':
        return num * 86400;
      default:
        return fallback;
    }
  }

  private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessExpiration =
      process.env.JWT_ACCESS_EXPIRATION ||
      process.env.JWT_ACCESS_EXPIRES_IN ||
      '15m';

    const expiresInSeconds = this.parseDurationToSeconds(accessExpiration, 900);

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessExpiration,
    });

    // Generate cryptographically random 64-char refresh token
    const refreshToken = crypto.randomBytes(32).toString('hex');

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresInSeconds,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async storeRefreshToken(
    userId: string,
    rawToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });
  }

  async getInvitationDetails(rawToken: string): Promise<Record<string, unknown>> {
    const tokenHash = this.hashToken(rawToken);
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, logoUrl: true },
        },
        role: {
          select: { id: true, name: true, description: true },
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
      role: invitation.role.name,
      tenantName: invitation.tenant.name,
      tenantLogo: invitation.tenant.logoUrl,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(
    dto: { token: string; password: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Record<string, unknown>> {
    const tokenHash = this.hashToken(dto.token);
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: {
        tenant: {
          include: {
            subscriptions: {
              where: {
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
                expiresAt: { gt: new Date() },
              },
              include: { plan: true },
              orderBy: { expiresAt: 'desc' },
              take: 1,
            },
          },
        },
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
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

    const email = invitation.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('يوجد حساب مسجل بهذا البريد مسبقاً');
    }

    const passwordHash = await this.hashingService.hashPassword(dto.password);

    const newUser = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId: invitation.tenantId,
          email,
          fullName: invitation.fullName,
          phone: invitation.phone,
          passwordHash,
          roleId: invitation.roleId,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return u;
    });

    // Auto-login newly accepted staff
    const tokens = await this.generateTokens({
      sub: newUser.id,
      email: newUser.email,
      tenantId: newUser.tenantId,
      role: invitation.role.name,
    });

    await this.storeRefreshToken(newUser.id, tokens.refreshToken, ipAddress, userAgent);

    const permissions = invitation.role.rolePermissions.map((rp) => rp.permission.code);
    const activeSub = invitation.tenant.subscriptions?.[0];

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        role: invitation.role.name,
        permissions,
        tenant: {
          id: invitation.tenant.id,
          name: invitation.tenant.name,
          slug: invitation.tenant.slug,
          status: invitation.tenant.status,
          subscription: activeSub
            ? {
                planName: activeSub.plan.name,
                planNameAr: activeSub.plan.nameAr,
                maxRouters: activeSub.maxRouters,
                expiresAt: activeSub.expiresAt,
                billingCycle: activeSub.billingCycle,
              }
            : null,
        },
      },
    };
  }
}
