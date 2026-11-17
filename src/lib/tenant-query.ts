import { useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/use-auth';
import { useBranchStore } from '@/store/branch';

/**
 * `useQuery` with the tenant and the selected branch baked into the key (mirrors web `useTenantQuery`), so a different
 * user or branch can never be served another one's cached data. Waits until the signed-in user is known.
 */
export function useTenantQuery<T>(options: Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey'> & { queryKey: QueryKey }) {
  const { user } = useAuth();
  const branch = useBranchStore((s) => s.selection);
  return useQuery<T, Error, T, QueryKey>({
    ...options,
    queryKey: [user?.tenantId ?? 'no-tenant', ...options.queryKey, `branch:${branch ?? 'default'}`],
    enabled: !!user && (options.enabled ?? true),
  });
}

/**
 * Cache helpers for tenant-scoped keys (mirror web `useTenantQueryClient`). Keys are `[tenantId, ...key, branch:x]`, so a
 * `[tenantId, ...key]` prefix matches every branch variant of a query.
 */
export function useTenantCache() {
  const { user } = useAuth();
  const client = useQueryClient();
  const tenantId = user?.tenantId ?? 'no-tenant';
  return {
    invalidate: (key: QueryKey) => client.invalidateQueries({ queryKey: [tenantId, ...key] }),
    update: <T>(key: QueryKey, updater: (old: T | undefined) => T | undefined) =>
      client.setQueriesData<T>({ queryKey: [tenantId, ...key] }, updater),
  };
}
