import { TenantOwnedEntity } from './base';

export interface Branch extends TenantOwnedEntity {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isMain: boolean;
  isActive: boolean;
}

export interface CreateBranchRequest {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isMain?: boolean;
}

export interface UpdateBranchRequest {
  name?: string;
  code?: string;
  address?: string;
  phone?: string;
  isMain?: boolean;
}

export interface UpdateBranchStatusRequest {
  isActive: boolean;
}
