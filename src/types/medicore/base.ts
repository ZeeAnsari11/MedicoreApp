export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Every tenant-owned document carries tenantId. Never trust a client-supplied
 * tenantId — it must always be derived server-side from the authenticated session.
 */
export interface TenantOwnedEntity extends BaseEntity {
  tenantId: string;
}

/**
 * A tenant-owned document additionally scoped to one branch/location.
 * branchId is server-derived/validated (see resolveBranchScope on the API side) —
 * a non-admin user's requests are always pinned to their own assigned branch.
 */
export interface BranchOwnedEntity extends TenantOwnedEntity {
  branchId: string;
}
