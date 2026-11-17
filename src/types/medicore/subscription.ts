import { TenantOwnedEntity } from './base';
import { SubscriptionStatus } from './enums';
import { Plan } from './plan';
import { Tenant } from './tenant';

export interface Subscription extends TenantOwnedEntity {
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
}

export interface SubscriptionWithDetails extends Subscription {
  tenant: Tenant;
  plan: Plan;
}

export interface AssignSubscriptionPlanRequest {
  planId: string;
}

export interface UpdateSubscriptionStatusRequest {
  status: SubscriptionStatus;
}
