import { BaseEntity } from './base';
import { BillingInterval, PlanStatus } from './enums';

export interface Plan extends BaseEntity {
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  billingInterval: BillingInterval;
  maxUsers: number | null;
  status: PlanStatus;
}

export interface CreatePlanRequest {
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  billingInterval: BillingInterval;
  maxUsers: number | null;
}

export interface UpdatePlanRequest {
  name?: string;
  description?: string;
  priceCents?: number;
  currency?: string;
  billingInterval?: BillingInterval;
  maxUsers?: number | null;
}

export interface UpdatePlanStatusRequest {
  status: PlanStatus;
}
