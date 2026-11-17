import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { CreatePurchaseReturnRequest, CreateSaleReturnRequest, PurchaseReturn, ReturnablePurchaseItem, ReturnableSaleItem, SaleReturn } from '@/types/medicore';

export const RETURNS_QUERY_KEY = ['accounting', 'returns'] as const;

/** What can still be returned: the backend tracks the cumulative quantity so the same stock can never be returned twice. */
export function useReturnableSaleItems(saleId: string | null) {
  const q = useTenantQuery<ReturnableSaleItem[]>({ queryKey: [...RETURNS_QUERY_KEY, 'sale', 'returnable', saleId], queryFn: () => apiFetch<ReturnableSaleItem[]>(`/accounting/returns/sale/returnable?saleId=${saleId}`), enabled: !!saleId });
  return { items: q.data ?? [], isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

export function useReturnablePurchaseItems(purchaseId: string | null) {
  const q = useTenantQuery<ReturnablePurchaseItem[]>({ queryKey: [...RETURNS_QUERY_KEY, 'purchase', 'returnable', purchaseId], queryFn: () => apiFetch<ReturnablePurchaseItem[]>(`/accounting/returns/purchase/returnable?purchaseId=${purchaseId}`), enabled: !!purchaseId });
  return { items: q.data ?? [], isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

/** Every recorded return of one kind (the history table on the web page). */
export function useReturnsHistory(kind: 'sale' | 'purchase') {
  const q = useTenantQuery<(SaleReturn | PurchaseReturn)[]>({ queryKey: [...RETURNS_QUERY_KEY, kind, 'list'], queryFn: () => apiFetch<(SaleReturn | PurchaseReturn)[]>(`/accounting/returns/${kind}`) });
  return { returns: q.data ?? [], isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

/** One request each, never retried; the backend validates quantities and posts stock + journal entries. The branch comes from the document, so none is sent. */
export function useReturnMutations() {
  const cache = useTenantCache();
  const done = (docKey: 'sales' | 'purchases') => {
    for (const key of [RETURNS_QUERY_KEY, ['accounting'], [docKey], ['inventory'], ['dashboard'], ['customers'], ['vendors']] as const) void cache.invalidate(key as unknown as readonly string[]);
  };
  const sale = useMutation({
    mutationFn: (dto: CreateSaleReturnRequest) => apiFetch<SaleReturn>('/accounting/returns/sale', { method: 'POST', body: dto }),
    onSuccess: () => { done('sales'); toast.success('Sale return recorded'); },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to record return')),
  });
  const purchase = useMutation({
    mutationFn: (dto: CreatePurchaseReturnRequest) => apiFetch<PurchaseReturn>('/accounting/returns/purchase', { method: 'POST', body: dto }),
    onSuccess: () => { done('purchases'); toast.success('Purchase return recorded'); },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to record return')),
  });
  return { createSale: sale.mutateAsync, createPurchase: purchase.mutateAsync };
}
