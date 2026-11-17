import { TenantOwnedEntity } from './base';

export interface Category extends TenantOwnedEntity {
  name: string;
  parentCategoryId?: string;
  isActive: boolean;
}

export interface CreateCategoryRequest {
  name: string;
  parentCategoryId?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  parentCategoryId?: string;
}

export interface UpdateCategoryStatusRequest {
  isActive: boolean;
}
