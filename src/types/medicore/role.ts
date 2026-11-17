import { TenantOwnedEntity } from './base';

export interface Role extends TenantOwnedEntity {
  name: string;
  description?: string;
  allowedModules: string[];
  isActive: boolean;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  allowedModules: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  allowedModules?: string[];
}

export interface UpdateRoleStatusRequest {
  isActive: boolean;
}
