import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as { user?: RequestUser }).user;

    if (!user) {
      throw new ForbiddenException('Access denied: unauthenticated user');
    }

    // Super Admin has master access across all permissions
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    const userPermissions = user.permissions ?? [];
    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasAll) {
      throw new ForbiddenException(
        `Access denied: missing required permissions [${requiredPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
