import { keepPreviousData, useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type {
  CreateSaleRequest,
  CreateSaleReturnRequest,
  OrderBookerOption,
  PaginatedSales,
  ReassignOrderBookerRequest,
  Sale,
  SalePaymentRow,
  SaleReturn,
  UpdateSalePaymentRequest,
  UpdateSaleRequest,
} from '@/types/medicore';

export const SALES_QUERY_KEY = ['sales'] as const;

export interface LastPrice {
  productId: string;
  price: number | null;
  date: string | null;
}

export interface SaleListParams {
  branchId: string | null;
  customerId?: string;
  orderBookerId?: string;
  paymentStatus?: string;
  returnStatus?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page: number;
  limit: number;
}

const branchQuery = (branchId: string | null | undefined) => (branchId ? `?branchId=${branchId}` : '');

/** `GET /sales?page&limit&filters`: server-side filtering and paging; pending orders are not listed (they have no invoice yet). */
export function useSalesPage(p: SaleListParams) {
  const query = useTenantQuery<PaginatedSales>({
    queryKey: [...SALES_QUERY_KEY, 'page', p],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(p.page), limit: String(p.limit) });
      if (p.branchId) params.set('branchId', p.branchId);
      if (p.customerId) params.set('customerId', p.customerId);
      if (p.orderBookerId) params.set('orderBookerId', p.orderBookerId);
      if (p.paymentStatus) params.set('paymentStatus', p.paymentStatus);
      if (p.returnStatus) params.set('returnStatus', p.returnStatus);
      if (p.startDate) params.set('startDate', p.startDate);
      if (p.endDate) params.set('endDate', p.endDate);
      if (p.search) params.set('search', p.search);
      return apiFetch<PaginatedSales>(`/sales?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  return { sales: query.data?.items ?? [], total: query.data?.total ?? 0, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch };
}

/** One sale with the server's `isEditable` / `lockReason`. */
export function useSale(id: string | null, branchId: string | null) {
  const query = useTenantQuery<Sale>({
    queryKey: [...SALES_QUERY_KEY, 'detail', id, branchId],
    queryFn: () => apiFetch<Sale>(`/sales/${id}${branchQuery(branchId)}`),
    enabled: !!id,
  });
  return { sale: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

export function useSalePayments(id: string | null, branchId: string | null) {
  const query = useTenantQuery<SalePaymentRow[]>({
    queryKey: [...SALES_QUERY_KEY, 'payments', id, branchId],
    queryFn: () => apiFetch<SalePaymentRow[]>(`/sales/${id}/payments${branchQuery(branchId)}`),
    enabled: !!id,
  });
  return { payments: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

export function useSaleReturns(id: string | null, branchId: string | null) {
  const query = useTenantQuery<SaleReturn[]>({
    queryKey: [...SALES_QUERY_KEY, 'returns', id, branchId],
    queryFn: () => apiFetch<SaleReturn[]>(`/sales/${id}/returns${branchQuery(branchId)}`),
    enabled: !!id,
  });
  return { returns: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/** Who can be named as the Order Booker; a booker without view-all only gets themselves back. */
export function useOrderBookers(branchId: string | null, enabled = true) {
  const query = useTenantQuery<OrderBookerOption[]>({
    queryKey: [...SALES_QUERY_KEY, 'order-bookers', branchId],
    queryFn: () => apiFetch<OrderBookerOption[]>(`/sales/order-bookers${branchQuery(branchId)}`),
    enabled,
    staleTime: 60_000,
  });
  return { orderBookers: query.data ?? [], isLoading: query.isLoading };
}

/** Price this customer was last invoiced for each product (a hint; never applied without the user seeing it). */
export function useLastSalePrices(customerId: string | null, productIds: string[], branchId: string | null) {
  const ids = [...new Set(productIds.filter(Boolean))].sort();
  const query = useTenantQuery<LastPrice[]>({
    queryKey: [...SALES_QUERY_KEY, 'last-price', branchId, customerId, ids],
    queryFn: () => {
      const params = new URLSearchParams({ customerId: customerId!, productIds: ids.join(',') });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<LastPrice[]>(`/sales/last-price?${params.toString()}`);
    },
    enabled: !!customerId && ids.length > 0,
    staleTime: 30_000,
  });
  return new Map((query.data ?? []).map((r) => [r.productId, r]));
}

/**
 * Every write below is a single request that is never retried automatically, and its success toast is only shown after
 * the backend answers 2xx. Stock, totals, invoice numbers and journal entries are all decided by the backend.
 */
export function useSaleMutations(branchId: string | null) {
  const cache = useTenantCache();
  const invalidateAll = () => {
    void cache.invalidate(SALES_QUERY_KEY);
    void cache.invalidate(['inventory']);
    void cache.invalidate(['accounting']);
    void cache.invalidate(['dashboard']);
    void cache.invalidate(['reports']);
    void cache.invalidate(['customers']);
  };

  const create = useMutation({
    mutationFn: (dto: CreateSaleRequest) => apiFetch<Sale>('/sales', { method: 'POST', body: dto }),
    onSuccess: (sale) => {
      invalidateAll();
      toast.success(sale.invoiceNumber ? `Invoice ${sale.invoiceNumber} created` : `Order ${sale.orderNumber} placed. It is waiting in Process Orders.`);
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create sale')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateSaleRequest }) => apiFetch<Sale>(`/sales/${id}${branchQuery(branchId)}`, { method: 'PATCH', body: dto }),
    onSuccess: (sale) => {
      invalidateAll();
      toast.success(`Invoice ${sale.invoiceNumber} updated`);
    },
    onError: (error, vars) => {
      // 409 = a payment or return landed meanwhile: refresh so the invoice shows as locked.
      if ((error as { status?: number }).status === 409) invalidateAll();
      void vars;
      toast.error(mutationErrorMessage(error, 'Failed to update sale'));
    },
  });

  const recordPayment = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateSalePaymentRequest }) => apiFetch<Sale>(`/sales/${id}/payment${branchQuery(branchId)}`, { method: 'PATCH', body: dto }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Payment recorded');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to record payment')),
  });

  const voidSale = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/sales/${id}${branchQuery(branchId)}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Sale voided and stock restored');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to void sale')),
  });

  const createReturn = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateSaleReturnRequest }) => apiFetch<SaleReturn>(`/sales/${id}/returns${branchQuery(branchId)}`, { method: 'POST', body: dto }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Sale return recorded');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to record return')),
  });

  const reassign = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ReassignOrderBookerRequest }) => apiFetch<Sale>(`/sales/${id}/order-booker${branchQuery(branchId)}`, { method: 'PATCH', body: dto }),
    onSuccess: (sale) => {
      void cache.invalidate(SALES_QUERY_KEY);
      void cache.invalidate(['accounting']);
      void cache.invalidate(['reports']);
      toast.success(`Invoice ${sale.invoiceNumber} now belongs to ${sale.orderBookerName}`);
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to reassign Order Booker')),
  });

  return {
    create: create.mutateAsync,
    isCreating: create.isPending,
    update: (id: string, dto: UpdateSaleRequest) => update.mutateAsync({ id, dto }),
    isUpdating: update.isPending,
    recordPayment: (id: string, dto: UpdateSalePaymentRequest) => recordPayment.mutateAsync({ id, dto }),
    isRecordingPayment: recordPayment.isPending,
    voidSale: voidSale.mutateAsync,
    isVoiding: voidSale.isPending,
    createReturn: (id: string, dto: CreateSaleReturnRequest) => createReturn.mutateAsync({ id, dto }),
    isReturning: createReturn.isPending,
    reassign: (id: string, dto: ReassignOrderBookerRequest) => reassign.mutateAsync({ id, dto }),
    isReassigning: reassign.isPending,
  };
}
