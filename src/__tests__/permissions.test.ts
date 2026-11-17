import { buildPermissionChecker } from '@/features/auth/permissions';
import { SystemRole, TenantRole } from '@/types/medicore';
import type { AuthMeResponse } from '@/types/medicore';

const user = (over: Partial<AuthMeResponse>): AuthMeResponse => ({
  userId: 'u1',
  tenantId: 't1',
  username: 'x',
  tenantRole: TenantRole.TENANT_USER,
  permissions: [],
  ...over,
});

describe('buildPermissionChecker', () => {
  it('denies everything when signed out', () => {
    const c = buildPermissionChecker(null);
    expect(c.isAdmin).toBe(false);
    expect(c.has('sales:read')).toBe(false);
    expect(c.hasAnyModule).toBe(false);
  });

  it('tenant admins bypass permission checks', () => {
    const c = buildPermissionChecker(user({ tenantRole: TenantRole.TENANT_SUPER_ADMIN }));
    expect(c.isAdmin).toBe(true);
    expect(c.has('anything:at_all')).toBe(true);
    expect(c.hasAnyModule).toBe(true);
  });

  it('platform super admins bypass permission checks', () => {
    expect(buildPermissionChecker(user({ systemRole: SystemRole.SUPER_ADMIN })).has('sales:void')).toBe(true);
  });

  it('regular users need the exact key; hasAny is OR', () => {
    const c = buildPermissionChecker(user({ permissions: ['sales:read', 'products:read'] }));
    expect(c.has('sales:read')).toBe(true);
    expect(c.has('sales:create')).toBe(false);
    expect(c.hasAny('sales:create', 'products:read')).toBe(true);
    expect(c.hasAny('sales:create', 'sales:void')).toBe(false);
  });

  it('hasAnyModule is false when the user has no :read permission', () => {
    expect(buildPermissionChecker(user({ permissions: ['sales:create'] })).hasAnyModule).toBe(false);
    expect(buildPermissionChecker(user({ permissions: ['sales:read'] })).hasAnyModule).toBe(true);
  });
});
