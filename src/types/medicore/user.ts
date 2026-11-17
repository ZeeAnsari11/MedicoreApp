import { TenantOwnedEntity } from './base';
import { SystemRole, TenantRole, UserStatus } from './enums';

export interface User extends TenantOwnedEntity {
  username: string;
  phone?: string;
  territory: string;
  city: string;
  address: string;
  fullName: string;
  status: UserStatus;
  systemRole?: SystemRole;
  tenantRole: TenantRole;
  roleId?: string;
  role?: { id: string; name: string } | null;
  branchId?: string;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  username: string;
  tenantRole: TenantRole;
  systemRole?: SystemRole;
  /** The user's assigned home branch. Absent for TENANT_SUPER_ADMIN/SUPER_ADMIN, who are implicitly all-branch. */
  branchId?: string;
  /** Set only on impersonation tokens: the super admin who issued it. */
  impersonatedBy?: string;
  /** Set only on impersonation tokens: the ImpersonationLog id that can be ended to revoke the token. */
  impersonationSessionId?: string;
}

export interface CreateUserRequest {
  username: string;
  phone?: string;
  territory: string;
  city: string;
  address: string;
  fullName: string;
  tenantRole: TenantRole;
  roleId?: string;
  branchId: string;
}

export interface CreateUserResponse extends User {
  temporaryPassword: string;
}

export interface UpdateUserRequest {
  fullName?: string;
  phone?: string;
  territory?: string;
  city?: string;
  address?: string;
  tenantRole?: TenantRole;
  roleId?: string | null;
  branchId?: string;
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
}
