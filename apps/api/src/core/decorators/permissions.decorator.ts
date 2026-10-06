import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to enforce required permission codes on an endpoint.
 */
export const RequirePermissions = (...permissions: string[]): CustomDecorator<string> =>
  SetMetadata(PERMISSIONS_KEY, permissions);
