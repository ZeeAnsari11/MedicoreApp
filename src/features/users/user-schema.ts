import { z } from 'zod';

import { TenantRole, type CreateUserRequest, type UpdateUserRequest, type User } from '@/types/medicore';

export const userSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').min(3, 'Username must be at least 3 characters').regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, numbers, dots, dashes and underscores'),
  fullName: z.string().trim().min(1, 'Full name is required').min(2, 'Name must be at least 2 characters'),
  phone: z.string().trim().optional(),
  // Same limits as the API's CreateUserDto; required on create, and an edit can't blank them.
  territory: z.string().trim().min(1, 'Territory is required').max(100, 'Territory must be at most 100 characters'),
  city: z.string().trim().min(1, 'City is required').max(100, 'City must be at most 100 characters'),
  address: z.string().trim().min(1, 'Address is required').max(300, 'Address must be at most 300 characters'),
  tenantRole: z.nativeEnum(TenantRole),
  roleId: z.string().nullable(),
  branchId: z.string().nullable().refine((v) => !!v, 'Branch is required'),
});
export type UserFormValues = z.infer<typeof userSchema>;

export const userDefaults = (u?: User): UserFormValues => ({
  username: u?.username ?? '',
  fullName: u?.fullName ?? '',
  phone: u?.phone ?? '',
  territory: u?.territory ?? '',
  city: u?.city ?? '',
  address: u?.address ?? '',
  tenantRole: u?.tenantRole ?? TenantRole.TENANT_USER,
  roleId: u?.roleId ?? null,
  branchId: u?.branchId ?? null,
});

/** An admin carries no assigned role (they bypass permissions): the web clears the role when Admin is chosen. */
export const roleForTenantRole = (tenantRole: TenantRole, roleId: string | null) => (tenantRole === TenantRole.TENANT_SUPER_ADMIN ? null : roleId);

export const buildUserCreate = (v: UserFormValues): CreateUserRequest => ({
  username: v.username,
  fullName: v.fullName,
  phone: v.phone?.trim() ? v.phone.trim() : undefined,
  territory: v.territory.trim(),
  city: v.city.trim(),
  address: v.address.trim(),
  tenantRole: v.tenantRole,
  roleId: v.roleId || undefined,
  branchId: v.branchId ?? '',
});

const LOCATION_FIELDS = ['territory', 'city', 'address'] as const;

/**
 * Edit sends only what changed. `null` clears the role; a branch can be changed but never cleared (the backend rejects
 * null/''). An omitted key means "no change". The username is immutable.
 */
export function buildUserUpdate(v: UserFormValues, original: User): UpdateUserRequest {
  const dto: UpdateUserRequest = {};
  if (v.fullName !== original.fullName) dto.fullName = v.fullName;
  if ((v.phone ?? '') !== (original.phone ?? '')) dto.phone = v.phone ?? '';
  for (const name of LOCATION_FIELDS) {
    const next = v[name].trim();
    if (next !== (original[name] ?? '')) dto[name] = next;
  }
  if (v.tenantRole !== original.tenantRole) dto.tenantRole = v.tenantRole;
  if (v.roleId !== (original.roleId ?? null)) dto.roleId = v.roleId;
  if (v.branchId && v.branchId !== original.branchId) dto.branchId = v.branchId;
  return dto;
}
