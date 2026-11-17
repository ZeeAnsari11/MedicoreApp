import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { INVENTORY_QUERY_KEY } from '@/features/inventory/use-inventory';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';

import type { CreateStockTransferRequest, StockTransfer } from './types';

export const TRANSFERS_QUERY_KEY = ['inventory', 'transfers'] as const;

/** `GET /inventory/transfers?branchId=`: transfers sent from, or received into, the branch (newest first, max 200). */
export function useStockTransfers(branchId: string | null) {
  const query = useTenantQuery<StockTransfer[]>({
    queryKey: [...TRANSFERS_QUERY_KEY, 'list', branchId],
    queryFn: () => apiFetch<StockTransfer[]>(branchId ? `/inventory/transfers?branchId=${branchId}` : '/inventory/transfers'),
    staleTime: 30_000,
  });
  return { transfers: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/** `GET /inventory/transfers/:id` (404 unless the transfer touches the caller's branch). */
export function useStockTransfer(id: string | null) {
  const query = useTenantQuery<StockTransfer>({
    queryKey: [...TRANSFERS_QUERY_KEY, 'detail', id],
    queryFn: () => apiFetch<StockTransfer>(`/inventory/transfers/${id}`),
    enabled: !!id,
  });
  return { transfer: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/**
 * `POST /inventory/transfers`. The backend deducts the source batches, adds them to the destination and records both
 * movements in one transaction; stock is never touched here. Not retried automatically; success is reported only once
 * the backend has returned the created transfer.
 */
export function useCreateTransfer() {
  const cache = useTenantCache();
  const mutation = useMutation({
    mutationFn: (dto: CreateStockTransferRequest) => apiFetch<StockTransfer>('/inventory/transfers', { method: 'POST', body: dto }),
    onSuccess: (created) => {
      // The transfer changes stock at both branches, so every inventory view, dashboard tile and report is stale.
      for (const key of [INVENTORY_QUERY_KEY, ['dashboard'], ['reports']]) void cache.invalidate(key);
      toast.success(`Transfer ${created.transferNumber} created`);
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create transfer')),
  });
  return { create: mutation.mutateAsync, isCreating: mutation.isPending };
}
