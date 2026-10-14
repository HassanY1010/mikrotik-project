import {
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from './current-user.decorator';

/**
 * Parameter decorator to extract tenantId from the authenticated user, headers, or query.
 * - If user.tenantId is present, returns it.
 * - If user.role === 'SUPER_ADMIN':
 *     - Uses 'x-tenant-id' header or 'tenantId' query param if provided.
 *     - Otherwise returns undefined so platform-wide operations proceed without crashing.
 * - If normal user lacks tenantId, throws ForbiddenException (403) instead of 401.
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = (request as unknown as { user?: RequestUser }).user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (user.tenantId) {
      return user.tenantId;
    }

    const headerTenantId = request.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      return headerTenantId;
    }

    const queryTenantId = request.query?.tenantId as string;
    if (queryTenantId) {
      return queryTenantId;
    }

    if (user.role === 'SUPER_ADMIN') {
      return undefined;
    }

    throw new ForbiddenException('Tenant context is required for this operation');
  },
);
