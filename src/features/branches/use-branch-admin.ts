import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { Branch, CreateBranchRequest, UpdateBranchRequest } from '@/types/medicore';

import { BRANCHES_QUERY_KEY } from './use-branches';

/**
 * Branch administration (web `use-branches.ts` mutations). Same cache key as the read-only `useBranches` used by the
 * pickers, so a change shows up everywhere at once. The backend enforces every rule (main branch, unique code, in-use
 * delete); failures surface its message verbatim and never as success.
 */
export function useBranchAdmin() {
  const cache = useTenantCache();
  const query = useTenantQuery<Branch[]>({
    queryKey: BRANCHES_QUERY_KEY,
    queryFn: () => apiFetch<Branch[]>('/branches'),
    staleTime: 5 * 60_000,
  });

  const replace = (data: Branch) => cache.update<Branch[]>(BRANCHES_QUERY_KEY, (old) => (old ? old.map((b) => (b.id === data.id ? data : b)) : [data]));
  // Making a branch main unsets the previous main on the server: refetch so the list does not show two.
  const refreshAll = () => cache.invalidate(BRANCHES_QUERY_KEY);

  const create = useMutation({
    mutationFn: (dto: CreateBranchRequest) => apiFetch<Branch>('/branches', { method: 'POST', body: dto }),
    onSuccess: (data) => {
      cache.update<Branch[]>(BRANCHES_QUERY_KEY, (old) => [...(old ?? []), data]);
      if (data.isMain) void refreshAll();
      toast.success('Branch created successfully');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create branch')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateBranchRequest }) => apiFetch<Branch>(`/branches/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: (data, variables) => {
      replace(data);
      if (variables.dto.isMain) void refreshAll();
      toast.success('Branch updated successfully');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update branch')),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiFetch<Branch>(`/branches/${id}/status`, { method: 'PATCH', body: { isActive } }),
    onSuccess: (data) => {
      replace(data);
      toast.success(`Branch ${data.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update branch status')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/branches/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      cache.update<Branch[]>(BRANCHES_QUERY_KEY, (old) => (old ? old.filter((b) => b.id !== id) : []));
      toast.success('Branch deleted successfully');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to delete branch')),
  });

  return {
    branches: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
    create: create.mutateAsync,
    update: (id: string, dto: UpdateBranchRequest) => update.mutateAsync({ id, dto }),
    setStatus: (id: string, isActive: boolean) => setStatus.mutateAsync({ id, isActive }),
    remove: remove.mutateAsync,
  };
}
