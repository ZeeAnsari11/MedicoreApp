import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { CreatePermissionRequest, Permission, UpdatePermissionRequest } from '@/types/medicore';

// Not ['permissions']: setQueriesData matches by prefix and would also hit the ['permissions','modules'] query.
export const PERMISSIONS_QUERY_KEY = ['permission-catalog'] as const;

/**
 * Unlike branches/roles/users, the backend's PermissionsService returns raw Mongoose documents: `_id`, no `id` (verified
 * live). The web reads `.id` and so cannot view or edit the right row; map it here so every row has a usable id.
 */
const withId = (p: Permission & { _id?: string }): Permission => (p.id ? p : { ...p, id: String(p._id) });

/**
 * The permission catalog (web `use-permission-catalog.ts`). Only create and edit have a web UI; the status and delete
 * endpoints exist but the web never calls them from a screen, so they are not wired here either.
 */
export function usePermissionCatalog() {
  const cache = useTenantCache();
  const query = useTenantQuery<Permission[]>({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: async () => (await apiFetch<Permission[]>('/permissions')).map(withId),
    staleTime: 5 * 60_000,
  });

  const create = useMutation({
    mutationFn: async (dto: CreatePermissionRequest) => withId(await apiFetch<Permission>('/permissions', { method: 'POST', body: dto })),
    onSuccess: (data) => {
      cache.update<Permission[]>(PERMISSIONS_QUERY_KEY, (old) => [...(old ?? []), data]);
      toast.success('Permission created successfully');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create permission')),
  });

  const update = useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdatePermissionRequest }) => withId(await apiFetch<Permission>(`/permissions/${id}`, { method: 'PATCH', body: dto })),
    onSuccess: (data) => {
      cache.update<Permission[]>(PERMISSIONS_QUERY_KEY, (old) => (old ? old.map((p) => (p.id === data.id ? data : p)) : [data]));
      toast.success('Permission updated successfully');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update permission')),
  });

  return {
    permissions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
    create: create.mutateAsync,
    update: (id: string, dto: UpdatePermissionRequest) => update.mutateAsync({ id, dto }),
  };
}
