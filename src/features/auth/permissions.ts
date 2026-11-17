import { SystemRole, TenantRole } from '@/types/medicore';
import type { AuthMeResponse } from '@/types/medicore';

/** Mirrors web `usePermissions`: tenant/system admins bypass; everyone else needs the exact `module:action` key. */
export function buildPermissionChecker(user: AuthMeResponse | null) {
  const isAdmin = user?.tenantRole === TenantRole.TENANT_SUPER_ADMIN || user?.systemRole === SystemRole.SUPER_ADMIN;
  const permissions = user?.permissions ?? [];
  return {
    isAdmin,
    permissions,
    has: (permission: string) => isAdmin || permissions.includes(permission),
    hasAny: (...perms: string[]) => isAdmin || perms.some((p) => permissions.includes(p)),
    /** False means the account has no module assigned at all. */
    hasAnyModule: isAdmin || permissions.some((p) => p.endsWith(':read')),
  };
}
export type PermissionChecker = ReturnType<typeof buildPermissionChecker>;
