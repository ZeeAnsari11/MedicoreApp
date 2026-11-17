import { BaseEntity } from './base';
import { TenantStatus } from './enums';

export interface Tenant extends BaseEntity {
  name: string;
  slug: string;
  status: TenantStatus;
}
