import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { SALES_QUERY_KEY } from '@/features/sales/use-sales';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { isValidIsoDate } from '@/lib/dates';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { PendingOrderBookerSummary, PendingOrderRow, ProcessOrdersRequest, ProcessOrdersResult, Sale } from '@/types/medicore';

import { processedToast, type ProcessAction } from './logic';

const PENDING_KEY = [...SALES_QUERY_KEY, 'pending-orders'] as const;

const query = (date: string, branchId: string | null, orderBookerId?: string) => {
  const params = new URLSearchParams({ date });
  if (orderBookerId) params.set('orderBookerId', orderBookerId);
  if (branchId) params.set('branchId', branchId);
  return params.toString();
};

/** `GET /sales/orders/summary`: pending orders per Order Booker for one day (needs `process_orders:read`). */
export function usePendingOrderSummary(date: string, branchId: string | null) {
  const q = useTenantQuery<PendingOrderBookerSummary[]>({
    queryKey: [...PENDING_KEY, 'summary', date, branchId],
    queryFn: () => apiFetch<PendingOrderBookerSummary[]>(`/sales/orders/summary?${query(date, branchId)}`),
    enabled: isValidIsoDate(date),
  });
  return { summary: q.data ?? [], isLoading: q.isLoading, isFetching: q.isFetching, error: q.error, refetch: q.refetch };
}

/** `GET /sales/orders`: one Order Booker's pending orders, oldest first. */
export function usePendingOrders(date: string, orderBookerId: string | null, branchId: string | null) {
  const q = useTenantQuery<PendingOrderRow[]>({
    queryKey: [...PENDING_KEY, 'list', date, orderBookerId, branchId],
    queryFn: () => apiFetch<PendingOrderRow[]>(`/sales/orders?${query(date, branchId, orderBookerId!)}`),
    enabled: isValidIsoDate(date) && !!orderBookerId,
  });
  return { orders: q.data ?? [], isLoading: q.isLoading, isFetching: q.isFetching, error: q.error, refetch: q.refetch };
}

/** `GET /sales/orders/preview`: the full orders with their lines; fetched only while the preview is open. */
export function usePendingOrdersPreview(date: string, orderBookerId: string | null, branchId: string | null, enabled: boolean) {
  const q = useTenantQuery<Sale[]>({
    queryKey: [...PENDING_KEY, 'preview', date, orderBookerId, branchId],
    queryFn: () => apiFetch<Sale[]>(`/sales/orders/preview?${query(date, branchId, orderBookerId!)}`),
    enabled: enabled && isValidIsoDate(date) && !!orderBookerId,
  });
  return { orders: q.data ?? [], isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

/**
 * Confirm / reject selected pending orders. The backend does the work in one transaction (invoice numbers, journal
 * entries, stock restoration); this is a single request that is never retried, `branchId` goes in the body (POSTs carry
 * no `X-Branch-Id`), and the success toast uses the `processed` count the backend returns, only after a 2xx.
 */
export function useProcessOrders(branchId: string | null) {
  const cache = useTenantCache();
  const mutation = useMutation({
    mutationFn: ({ action, saleIds }: { action: ProcessAction; saleIds: string[] }) => {
      const body: ProcessOrdersRequest = { saleIds, ...(branchId ? { branchId } : {}) };
      return apiFetch<ProcessOrdersResult>(`/sales/orders/${action}`, { method: 'POST', body });
    },
    onSuccess: (result, { action }) => toast.success(processedToast(action, result.processed)),
    onError: (error, { action }) => toast.error(mutationErrorMessage(error, action === 'confirm' ? 'Failed to confirm orders' : 'Failed to reject orders')),
    // Success or not (a 409 means the list is stale; a timeout may have processed them), show what the server has now.
    onSettled: () => {
      void cache.invalidate(SALES_QUERY_KEY);
      void cache.invalidate(['inventory']);
      void cache.invalidate(['accounting']);
      void cache.invalidate(['dashboard']);
      void cache.invalidate(['reports']);
    },
  });
  return {
    confirm: (saleIds: string[]) => mutation.mutateAsync({ action: 'confirm', saleIds }),
    reject: (saleIds: string[]) => mutation.mutateAsync({ action: 'reject', saleIds }),
    isProcessing: mutation.isPending,
  };
}
