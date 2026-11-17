import { Tenant } from './tenant';
import { User } from './user';
import { TenantStatus, SubscriptionStatus } from './enums';

export interface CreatePlatformTenantRequest {
  tenantName: string;
  adminFullName: string;
  adminUsername: string;
}

export interface CreatePlatformTenantResponse {
  tenant: Tenant;
  adminUser: User;
  temporaryPassword: string;
}

export interface UpdateTenantStatusRequest {
  status: TenantStatus;
}

export interface UpdateTenantRequest {
  name: string;
  adminFullName?: string;
  username?: string;
  password?: string;
}

export interface PlatformDashboardSummary {
  totalTenants: number;
  tenantsByStatus: Record<TenantStatus, number>;
  totalSubscriptions: number;
  subscriptionsByStatus: Record<SubscriptionStatus, number>;
  recentTenants: Tenant[];
}
