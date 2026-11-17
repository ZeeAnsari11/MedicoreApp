import { z } from 'zod';

import type { CreatePermissionRequest, Permission, UpdatePermissionRequest } from '@/types/medicore';

export const permissionSchema = z.object({
  key: z.string().trim().min(1, 'Key is required').regex(/^[a-z][a-z0-9]*(:[a-z][a-z0-9-]+)+$/, 'Key must be like "module:action"'),
  name: z.string().trim().min(1, 'Name is required').min(2, 'Name must be at least 2 characters'),
  description: z.string().trim().optional(),
  module: z.string().trim().min(1, 'Module is required').min(2, 'Module must be at least 2 characters'),
});
export type PermissionFormValues = z.infer<typeof permissionSchema>;

export const permissionDefaults = (p?: Permission): PermissionFormValues => ({
  key: p?.key ?? '',
  name: p?.name ?? '',
  description: p?.description ?? '',
  module: p?.module ?? '',
});

export const buildPermissionCreate = (v: PermissionFormValues): CreatePermissionRequest => ({
  key: v.key,
  name: v.name,
  description: v.description?.trim() ? v.description.trim() : undefined,
  module: v.module,
});

/**
 * The key is immutable after create. Unlike the other admin forms this always sends name, description and module: the
 * backend `Object.assign`s the DTO, whose omitted fields are own `undefined` properties (ES2022 class fields), so leaving
 * `name`/`module` out fails with a 500 and leaving `description` out erases it (verified live). The web sends only
 * changed fields and hits exactly that.
 */
export const buildPermissionUpdate = (v: PermissionFormValues): UpdatePermissionRequest => ({
  name: v.name,
  description: v.description ?? '',
  module: v.module,
});
