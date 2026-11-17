import { BaseEntity } from './base';

export interface Permission extends BaseEntity {
  tenantId: string | null; // null = system-level/global
  key: string;
  name: string;
  description?: string;
  module: string;
  isSystem: boolean;
  isActive: boolean;
}

export interface CreatePermissionRequest {
  key: string;
  name: string;
  description?: string;
  module: string;
}

export interface UpdatePermissionRequest {
  name?: string;
  description?: string;
  module?: string;
}

export interface UpdatePermissionStatusRequest {
  isActive: boolean;
}
