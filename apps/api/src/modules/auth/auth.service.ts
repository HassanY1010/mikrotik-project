import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { TenantStatus, UserStatus, SubscriptionStatus, BillingCycle } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { HashingService } from '../../core/security/hashing.service';
import { RoleName } from '@mikrotik-saas/shared-types';
import type { LoginDto } from './dto/login.dto';
import type { RegisterTenantDto } from './dto/register-tenant.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
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
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly hashingService: HashingService,
  ) {}

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
        tenant: true,
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

    const permissions = user.role.rolePermissions.map((rp) => rp.permission.code);

    // Generate tokens
    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role.name,
    });

    // Store hashed refresh token in database
    await this.storeRefreshToken(user.id, tokens.refreshToken, ipAddress, userAgent);

    // Update lastLoginAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'auth:login',
        entity: 'User',
        entityId: user.id,
        ipAddress,
        userAgent,
      },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
        tenantId: user.tenantId,
        tenantSlug: user.tenant?.slug,
        tenantName: user.tenant?.name,
        permissions,
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

    // Fetch subscription plan
    const requestedPlanName = (dto.planName ?? 'BASIC').toUpperCase();
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { name: requestedPlanName },
    });
    if (!plan) {
      throw new NotFoundException(`Subscription plan '${requestedPlanName}' not found`);
    }

    // Fetch TENANT_ADMIN system role
    const tenantAdminRole = await this.prisma.role.findFirst({
      where: { name: RoleName.TENANT_ADMIN, tenantId: null },
    });
    if (!tenantAdminRole) {
      throw new NotFoundException('Default TENANT_ADMIN role is not configured');
    }

    // Transactional creation of Tenant, Subscription, Admin User, and Default Template
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Tenant
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

      // 2. Create Trial Subscription (30 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          billingCycle: BillingCycle.MONTHLY,
          startsAt: new Date(),
          expiresAt,
          maxRouters: plan.maxRouters,
          price: plan.priceMonthly,
          notes: 'فترة تجريبية مجانية لمدة 30 يومًا للمستأجر الجديد',
        },
      });

      // 3. Create Tenant Admin User
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
          newValues: { name: tenant.name, slug: tenant.slug, plan: plan.name },
          ipAddress,
        },
      });

      return { tenant, user: adminUser };
    });

    return {
      message: 'Organization registered successfully with 30-day active trial',
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
   */
  async refreshToken(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);

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
      // Possible reuse detection — revoke all tokens for this user for security
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
              where: { status: SubscriptionStatus.ACTIVE },
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

    const permissions = user.role.rolePermissions.map((rp) => rp.permission.code);
    const activeSubscription = user.tenant?.subscriptions[0];

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role.name,
      permissions,
      tenant: user.tenant
        ? {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug,
            currency: user.tenant.currency,
            status: user.tenant.status,
            subscription: activeSubscription
              ? {
                  planName: activeSubscription.plan.name,
                  planNameAr: activeSubscription.plan.nameAr,
                  maxRouters: activeSubscription.maxRouters,
                  expiresAt: activeSubscription.expiresAt,
                  billingCycle: activeSubscription.billingCycle,
                }
              : null,
            counts: user.tenant._count,
          }
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Helper methods
  // ---------------------------------------------------------------------------

  private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessExpiration = process.env.JWT_ACCESS_EXPIRATION || '7d';
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessExpiration,
    });

    // Generate cryptographically random 64-char refresh token
    const refreshToken = crypto.randomBytes(32).toString('hex');

    return {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
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
}
