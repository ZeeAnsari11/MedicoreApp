import { TenantOwnedEntity } from './base';

export interface Manufacturer extends TenantOwnedEntity {
  name: string;
  /** Unset = shared across all branches. */
  branchId?: string;
  country?: string;
  contactPhone?: string;
  website?: string;
  isActive: boolean;
}

export interface CreateManufacturerRequest {
  name: string;
  branchId?: string;
  country?: string;
  contactPhone?: string;
  website?: string;
  /** Also create a Vendor with the same name and contact details. */
  alsoCreateVendor?: boolean;
}

export interface UpdateManufacturerRequest {
  name?: string;
  branchId?: string;
  country?: string;
  contactPhone?: string;
  website?: string;
}

export interface UpdateManufacturerStatusRequest {
  isActive: boolean;
}
