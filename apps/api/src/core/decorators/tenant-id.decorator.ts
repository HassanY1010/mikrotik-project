import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from './current-user.decorator';

/**
 * Parameter decorator to extract tenantId from the authenticated user.
 * Throws UnauthorizedException if user is not in a tenant context.
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const user = (request as unknown as { user?: RequestUser }).user;

  if (!user || !user.tenantId) {
    throw new UnauthorizedException('Tenant context is required for this operation');
  }

  return user.tenantId;
});
