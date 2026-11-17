import { keepPreviousData, useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type {
  CreatePurchaseRequest,
  CreatePurchaseResponse,
  CreatePurchaseReturnRequest,
  PaginatedPurchases,
  Purchase,
  PurchasePaymentRow,
  PurchaseReturn,
  UpdatePurchasePaymentRequest,
  UpdatePurchaseRequest,
} from '@/types/medicore';

export const PURCHASES_QUERY_KEY = ['purchases'] as const;

export interface PurchaseListParams {
  branchId: string | null;
  vendorId?: string;
  paymentStatus?: string;
  returnStatus?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface LastPurchasePrice {
  productId: string;
  price: number | null;
  date: string | null;
}

const branchQuery = (branchId: string | null | undefined) => (branchId ? `?branchId=${branchId}` : '');

/** `GET /purchases?page&limit&filters`: server-side paging and filtering (search matches the PO number only; newest first). */
export function usePurchasesPage(p: PurchaseListParams) {
  const query = useTenantQuery<PaginatedPurchases>({
    queryKey: [...PURCHASES_QUERY_KEY, 'page', p],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(p.page), limit: String(p.limit) });
      if (p.branchId) params.set('branchId', p.branchId);
      if (p.vendorId) params.set('vendorId', p.vendorId);
      if (p.paymentStatus) params.set('paymentStatus', p.paymentStatus);
      if (p.returnStatus) params.set('returnStatus', p.returnStatus);
      if (p.status) params.set('status', p.status);
      if (p.dateFrom) params.set('dateFrom', p.dateFrom);
      if (p.dateTo) params.set('dateTo', p.dateTo);
      if (p.search) params.set('search', p.search);
      return apiFetch<PaginatedPurchases>(`/purchases?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  return { purchases: query.data?.items ?? [], total: query.data?.total ?? 0, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch };
}

/** One purchase with the server's `isEditable` / `lockReason`. */
export function usePurchase(id: string | null, branchId: string | null) {
  const query = useTenantQuery<Purchase>({
    queryKey: [...PURCHASES_QUERY_KEY, 'detail', id, branchId],
    queryFn: () => apiFetch<Purchase>(`/purchases/${id}${branchQuery(branchId)}`),
    enabled: !!id,
  });
  return { purchase: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

export function usePurchasePayments(id: string | null, branchId: string | null) {
  const query = useTenantQuery<PurchasePaymentRow[]>({
    queryKey: [...PURCHASES_QUERY_KEY, 'payments', id, branchId],
    queryFn: () => apiFetch<PurchasePaymentRow[]>(`/purchases/${id}/payments${branchQuery(branchId)}`),
    enabled: !!id,
  });
  return { payments: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

export function usePurchaseReturns(id: string | null, branchId: string | null) {
  const query = useTenantQuery<PurchaseReturn[]>({
    queryKey: [...PURCHASES_QUERY_KEY, 'returns', id, branchId],
    queryFn: () => apiFetch<PurchaseReturn[]>(`/purchases/${id}/returns${branchQuery(branchId)}`),
    enabled: !!id,
  });
  return { returns: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/** What this vendor last charged for each product (a hint only). */
export function useLastPurchasePrices(vendorId: string | null, productIds: string[], branchId: string | null) {
  const ids = [...new Set(productIds.filter(Boolean))].sort();
  const query = useTenantQuery<LastPurchasePrice[]>({
    queryKey: [...PURCHASES_QUERY_KEY, 'last-price', branchId, vendorId, ids],
    queryFn: () => {
      const params = new URLSearchParams({ vendorId: vendorId!, productIds: ids.join(',') });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<LastPurchasePrice[]>(`/purchases/last-price?${params.toString()}`);
    },
    enabled: !!vendorId && ids.length > 0,
    staleTime: 30_000,
  });
  return new Map((query.data ?? []).map((r) => [r.productId, r]));
}

/**
 * Every write is a single request that is never retried automatically; its success toast is only shown after the
 * backend answers 2xx. Stock, totals, numbering, price history and journal entries are all decided by the backend.
 * `create` carries `branchId` in the body (POSTs send no `X-Branch-Id`); the others scope by `?branchId=`.
 */
export function usePurchaseMutations(branchId: string | null) {
  const cache = useTenantCache();
  const invalidateAll = () => {
    for (const key of [PURCHASES_QUERY_KEY, ['inventory'], ['accounting'], ['dashboard'], ['reports'], ['vendors'], ['products']] as const) void cache.invalidate(key as unknown as readonly string[]);
  };

  const create = useMutation({
    mutationFn: (dto: CreatePurchaseRequest) => apiFetch<CreatePurchaseResponse>('/purchases', { method: 'POST', body: dto }),
    onSuccess: (purchase) => {
      invalidateAll();
      const changes = purchase.priceChanges ?? [];
      const suffix = changes.length ? `. Price updated: ${changes.map((c) => `${c.productName} ${c.oldPurchasePrice} → ${c.newPurchasePrice}`).join(', ')}` : '';
      toast.success(`Purchase ${purchase.purchaseNumber} received${suffix}`);
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create purchase')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePurchaseRequest }) => apiFetch<Purchase>(`/purchases/${id}${branchQuery(branchId)}`, { method: 'PATCH', body: dto }),
    onSuccess: (purchase) => {
      invalidateAll();
      toast.success(`Purchase ${purchase.purchaseNumber} updated`);
    },
    onError: (error) => {
      // 409 = locked meanwhile (a payment or return landed): refresh so the purchase shows as locked.
      if ((error as { status?: number }).status === 409) invalidateAll();
      toast.error(mutationErrorMessage(error, 'Failed to update purchase'));
    },
  });

  const recordPayment = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePurchasePaymentRequest }) => apiFetch<Purchase>(`/purchases/${id}/payment${branchQuery(branchId)}`, { method: 'PATCH', body: dto }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Payment recorded');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update payment')),
  });

  const createReturn = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreatePurchaseReturnRequest }) => apiFetch<PurchaseReturn>(`/purchases/${id}/returns${branchQuery(branchId)}`, { method: 'POST', body: dto }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Purchase return recorded');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to record return')),
  });

  return {
    create: create.mutateAsync,
    isCreating: create.isPending,
    update: (id: string, dto: UpdatePurchaseRequest) => update.mutateAsync({ id, dto }),
    isUpdating: update.isPending,
    recordPayment: (id: string, dto: UpdatePurchasePaymentRequest) => recordPayment.mutateAsync({ id, dto }),
    isRecordingPayment: recordPayment.isPending,
    createReturn: (id: string, dto: CreatePurchaseReturnRequest) => createReturn.mutateAsync({ id, dto }),
    isReturning: createReturn.isPending,
  };
}
