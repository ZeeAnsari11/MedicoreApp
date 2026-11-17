import { z } from 'zod';

import type { CreateRoleRequest, Role, UpdateRoleRequest } from '@/types/medicore';

export const roleSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').min(2, 'Name must be at least 2 characters'),
  description: z.string().trim().optional(),
  allowedModules: z.array(z.string()),
});
export type RoleFormValues = z.infer<typeof roleSchema>;

export const roleDefaults = (r?: Role): RoleFormValues => ({
  name: r?.name ?? '',
  description: r?.description ?? '',
  allowedModules: r?.allowedModules ?? [],
});

/** An empty selection is allowed (a role with no menus). */
export const buildRoleCreate = (v: RoleFormValues): CreateRoleRequest => ({
  name: v.name,
  description: v.description?.trim() ? v.description.trim() : undefined,
  allowedModules: v.allowedModules,
});

/** Web: name/description only when changed, `allowedModules` always. */
export function buildRoleUpdate(v: RoleFormValues, original: Role): UpdateRoleRequest {
  const dto: UpdateRoleRequest = {};
  if (v.name !== original.name) dto.name = v.name;
  if ((v.description ?? '') !== (original.description ?? '')) dto.description = v.description ?? '';
  dto.allowedModules = v.allowedModules;
  return dto;
}
