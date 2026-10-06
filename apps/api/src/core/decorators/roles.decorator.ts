import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { RoleName } from '@mikrotik-saas/shared-types';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for accessing an endpoint.
 */
export const Roles = (...roles: RoleName[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
