import { apiFetch } from '@/api/client';
import { useTenantQuery } from '@/lib/tenant-query';
import type { Branch } from '@/types/medicore';

export const BRANCHES_QUERY_KEY = ['branches'] as const;

/** GET /branches needs branches:read (or purchases:create / sales:create / inventory:adjust); others get []. */
export function useBranches(enabled = true) {
  const query = useTenantQuery<Branch[]>({
    queryKey: BRANCHES_QUERY_KEY,
    queryFn: () => apiFetch<Branch[]>('/branches'),
    staleTime: 5 * 60_000,
    enabled,
  });
  return { branches: query.data ?? [], isLoading: query.isLoading, error: query.error };
}
