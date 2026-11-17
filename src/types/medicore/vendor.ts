import { TenantOwnedEntity } from './base';

export interface Vendor extends TenantOwnedEntity {
  branchId?: string;
  company: string;
  distributorType?: string;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  isActive: boolean;
}

export interface CreateVendorRequest {
  branchId?: string;
  company: string;
  distributorType?: string;
  contactName?: string;
  contactPhone?: string;
  address?: string;
}

export interface UpdateVendorRequest {
  company?: string;
  distributorType?: string;
  contactName?: string;
  contactPhone?: string;
  address?: string;
}

export interface UpdateVendorStatusRequest {
  isActive: boolean;
}
