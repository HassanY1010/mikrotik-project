import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';
import { TenantsController } from './tenants.controller';
import { PlansController } from '../plans/plans.controller';

describe('Super Admin RBAC & Security Guard Suite', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockContext(user: any, requiredRoles: string[]): ExecutionContext {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('RolesGuard enforcement on Super Admin routes', () => {
    it('allows access when user is SUPER_ADMIN', () => {
      const context = createMockContext(
        { id: 'admin-1', role: RoleName.SUPER_ADMIN, email: 'admin@sudafi.sd' },
        [RoleName.SUPER_ADMIN],
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('throws ForbiddenException when user is TENANT_ADMIN', () => {
      const context = createMockContext(
        { id: 'tenant-owner-1', role: RoleName.TENANT_ADMIN, tenantId: 'tenant-1' },
        [RoleName.SUPER_ADMIN],
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user is CASHIER', () => {
      const context = createMockContext(
        { id: 'cashier-1', role: RoleName.CASHIER, tenantId: 'tenant-1' },
        [RoleName.SUPER_ADMIN],
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user is unauthenticated or missing', () => {
      const context = createMockContext(null, [RoleName.SUPER_ADMIN]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Controller routes decorator inspection', () => {
    const realReflector = new Reflector();

    it('ensures TenantsController admin routes are strictly decorated with SUPER_ADMIN', () => {
      const overviewRoles = realReflector.get(ROLES_KEY, TenantsController.prototype.getOverview);
      expect(overviewRoles).toContain(RoleName.SUPER_ADMIN);
      expect(overviewRoles).toHaveLength(1);

      const subListRoles = realReflector.get(ROLES_KEY, TenantsController.prototype.listSubscriptions);
      expect(subListRoles).toContain(RoleName.SUPER_ADMIN);
      expect(subListRoles).toHaveLength(1);

      const renewRoles = realReflector.get(ROLES_KEY, TenantsController.prototype.renewSubscription);
      expect(renewRoles).toContain(RoleName.SUPER_ADMIN);
      expect(renewRoles).toHaveLength(1);

      const subStatusRoles = realReflector.get(ROLES_KEY, TenantsController.prototype.updateSubscriptionStatus);
      expect(subStatusRoles).toContain(RoleName.SUPER_ADMIN);
      expect(subStatusRoles).toHaveLength(1);

      const statusRoles = realReflector.get(ROLES_KEY, TenantsController.prototype.updateStatus);
      expect(statusRoles).toContain(RoleName.SUPER_ADMIN);
      expect(statusRoles).toHaveLength(1);

      const approveRoles = realReflector.get(ROLES_KEY, TenantsController.prototype.approveSubscription);
      expect(approveRoles).toContain(RoleName.SUPER_ADMIN);
      expect(approveRoles).toHaveLength(1);
    });

    it('ensures PlansController write/mutation routes are strictly decorated with SUPER_ADMIN', () => {
      const createRoles = realReflector.get(ROLES_KEY, PlansController.prototype.create);
      expect(createRoles).toContain(RoleName.SUPER_ADMIN);
      expect(createRoles).toHaveLength(1);

      const updateRoles = realReflector.get(ROLES_KEY, PlansController.prototype.update);
      expect(updateRoles).toContain(RoleName.SUPER_ADMIN);
      expect(updateRoles).toHaveLength(1);

      const toggleRoles = realReflector.get(ROLES_KEY, PlansController.prototype.toggleActive);
      expect(toggleRoles).toContain(RoleName.SUPER_ADMIN);
      expect(toggleRoles).toHaveLength(1);
    });
  });
});
