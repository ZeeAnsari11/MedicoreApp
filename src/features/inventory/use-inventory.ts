import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { Batch, CreateBatchAdjustmentRequest, InventoryRollup } from '@/types/medicore';

export const INVENTORY_QUERY_KEY = ['inventory'] as const;

const withBranch = (path: string, branchId: string | null | undefined, extra: Record<string, string | undefined> = {}) => {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

/** `GET /inventory?branchId=`: per-product stock rollup for the branch (null = every branch, admins only). */
export function useInventoryRollup(branchId: string | null) {
  const query = useTenantQuery<InventoryRollup[]>({
    queryKey: [...INVENTORY_QUERY_KEY, 'rollup', branchId],
    queryFn: () => apiFetch<InventoryRollup[]>(withBranch('/inventory', branchId)),
    staleTime: 60_000,
  });
  return { rollup: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/** `GET /inventory/:productId/batches?branchId=`, ordered by expiry by the server. */
export function useProductBatches(productId: string | null, branchId: string | null, enabled = true) {
  const query = useTenantQuery<Batch[]>({
    queryKey: [...INVENTORY_QUERY_KEY, 'batches', productId, branchId],
    queryFn: () => apiFetch<Batch[]>(withBranch(`/inventory/${productId}/batches`, branchId)),
    enabled: !!productId && enabled,
    staleTime: 30_000,
  });
  return { batches: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/** `GET /inventory/expiring?withinDays=&branchId=`: batches with stock that expire on/before the cutoff (includes already expired). */
export function useExpiringBatches(withinDays: number, branchId: string | null) {
  const query = useTenantQuery<Batch[]>({
    queryKey: [...INVENTORY_QUERY_KEY, 'expiring', withinDays, branchId],
    queryFn: () => apiFetch<Batch[]>(withBranch('/inventory/expiring', branchId, { withinDays: String(withinDays) })),
    staleTime: 60_000,
  });
  return { batches: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/**
 * `POST /inventory/adjustments`. The backend applies the add/subtract/set inside one transaction and records the movement;
 * nothing is computed here and the result is only reported after the backend confirms. Never retried automatically.
 */
export function useAdjustStock() {
  const cache = useTenantCache();
  const mutation = useMutation({
    mutationFn: (dto: CreateBatchAdjustmentRequest) => apiFetch<Batch>('/inventory/adjustments', { method: 'POST', body: dto }),
    onSuccess: () => {
      // Stock value and quantities also feed the dashboard tiles and the reports.
      for (const key of [INVENTORY_QUERY_KEY, ['dashboard'], ['reports']]) void cache.invalidate(key);
      toast.success('Stock adjusted');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to adjust stock')),
  });
  return { adjust: mutation.mutateAsync, isAdjusting: mutation.isPending };
}
