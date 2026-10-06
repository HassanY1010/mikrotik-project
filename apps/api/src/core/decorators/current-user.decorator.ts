import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestUser {
  id: string;
  email: string;
  tenantId?: string | null;
  role: string;
  permissions?: string[];
}

/**
 * Parameter decorator to extract the authenticated user from the request.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext): RequestUser | unknown => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = (request as unknown as { user?: RequestUser }).user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
