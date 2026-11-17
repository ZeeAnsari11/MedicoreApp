import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { CreateRoleRequest, PermissionModulesResponse, Role, UpdateRoleRequest } from '@/types/medicore';

export const ROLES_QUERY_KEY = ['roles'] as const;
export const PERMISSION_MODULES_QUERY_KEY = ['permissions', 'modules'] as const;

/** GET /permissions/modules: the single source of truth for the menu picker (needs no permission). */
export function usePermissionModules(enabled = true) {
  const query = useTenantQuery<PermissionModulesResponse>({
    queryKey: PERMISSION_MODULES_QUERY_KEY,
    queryFn: () => apiFetch<PermissionModulesResponse>('/permissions/modules'),
    staleTime: 60 * 60_000,
    enabled,
  });
  return { modules: query.data?.modules ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/** Role administration. The server normalizes keys, rejects duplicates and in-use deletes; its message is shown as-is. */
export function useRoles(enabled = true) {
  const cache = useTenantCache();
  const query = useTenantQuery<Role[]>({
    queryKey: ROLES_QUERY_KEY,
    queryFn: () => apiFetch<Role[]>('/roles'),
    staleTime: 5 * 60_000,
    enabled,
  });
  const replace = (data: Role) => cache.update<Role[]>(ROLES_QUERY_KEY, (old) => (old ? old.map((r) => (r.id === data.id ? data : r)) : [data]));

  const create = useMutation({
    mutationFn: (dto: CreateRoleRequest) => apiFetch<Role>('/roles', { method: 'POST', body: dto }),
    onSuccess: (data) => {
      cache.update<Role[]>(ROLES_QUERY_KEY, (old) => [...(old ?? []), data]);
      toast.success('Role created successfully');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create role')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateRoleRequest }) => apiFetch<Role>(`/roles/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: (data) => {
      replace(data);
      toast.success('Role updated successfully');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update role')),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiFetch<Role>(`/roles/${id}/status`, { method: 'PATCH', body: { isActive } }),
    onSuccess: (data) => {
      replace(data);
      toast.success(`Role ${data.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update role status')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      cache.update<Role[]>(ROLES_QUERY_KEY, (old) => (old ? old.filter((r) => r.id !== id) : []));
      toast.success('Role deleted successfully');
    },
    // The web replaces the server text with a hard-coded "role in use" toast; the server's message is the accurate one.
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to delete role')),
  });

  return {
    roles: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
    create: create.mutateAsync,
    update: (id: string, dto: UpdateRoleRequest) => update.mutateAsync({ id, dto }),
    setStatus: (id: string, isActive: boolean) => setStatus.mutateAsync({ id, isActive }),
    remove: remove.mutateAsync,
  };
}
