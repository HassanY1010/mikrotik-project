import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from './tenant-context.service';
import type { RequestUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as { user?: RequestUser }).user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Super Admin has global bypass capability
    if (user.role === 'SUPER_ADMIN' && !user.tenantId) {
      // If super admin passed an explicit X-Tenant-Id header, set it in context
      const headerTenantId = request.headers['x-tenant-id'] as string;
      if (headerTenantId) {
        this.tenantContext.runWithContext(
          { tenantId: headerTenantId, userId: user.id, role: user.role },
          () => {},
        );
      }
      return true;
    }

    if (!user.tenantId) {
      throw new ForbiddenException('Tenant context is required for this operation');
    }

    // Verify tenant status in database
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, slug: true, status: true, deletedAt: true },
    });

    if (!tenant || tenant.deletedAt !== null) {
      throw new ForbiddenException('Tenant account does not exist or has been deleted');
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Tenant account has been suspended. Please contact platform administration.',
      );
    }

    if (tenant.status === TenantStatus.EXPIRED) {
      throw new ForbiddenException(
        'Tenant subscription has expired. Please renew your subscription to continue.',
      );
    }

    // Store in request-scoped AsyncLocalStorage
    this.tenantContext.runWithContext(
      { tenantId: tenant.id, slug: tenant.slug, userId: user.id, role: user.role },
      () => {},
    );

    return true;
  }
}
