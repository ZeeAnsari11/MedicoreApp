import { keepPreviousData, useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { ApiError } from '@/api/errors';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';

import type { CashReceiptRequest as SharedCashReceiptRequest, CashReceiptResult, CashTransaction, PaginatedCashTransactions, PaymentMethod, UpdateCashTransactionRequest } from '@/types/medicore';

import { rowErrorsOf, type LookupInvoice } from './sheet';

export type { CashReceiptResult };

/** The shared request, with the payment method also accepted as its plain string value (`'CASH'`). */
export type CashReceiptRequest = Omit<SharedCashReceiptRequest, 'method'> & { method: `${PaymentMethod}` };

/** Invoices, ledgers, payments, customer balances, dashboard and reports all move when a receipt is saved or edited. */
const RECEIPT_QUERY_KEYS = [['sales'], ['accounting'], ['customers'], ['dashboard'], ['reports']] as const;

const withBranch = (path: string, branchId: string | null) => (branchId ? `${path}${path.includes('?') ? '&' : '?'}branchId=${branchId}` : path);

/** `GET /sales/invoices/lookup?q=`: outstanding invoices by number (needs `cash_receipt:read`; max 10 rows, newest first). */
export function useInvoiceLookup(q: string, branchId: string | null) {
  const query = useTenantQuery<LookupInvoice[]>({
    queryKey: ['sales', 'invoice-lookup', branchId, q],
    queryFn: () => apiFetch<LookupInvoice[]>(withBranch(`/sales/invoices/lookup?q=${encodeURIComponent(q)}`, branchId)),
    enabled: q.length > 0,
    staleTime: 0,
  });
  return { invoices: query.data ?? [], isFetching: query.isFetching, error: query.error };
}

export const cashReceiptPdfPath = (id: string, branchId: string | null, invoiceId?: string) =>
  `/sales/cash-receipts/${id}/pdf?branchId=${branchId ?? ''}${invoiceId ? `&invoiceId=${invoiceId}` : ''}`;

/**
 * `POST /sales/cash-receipts`: one request, never retried. The backend validates each row against the live invoice and
 * posts all the payments (or none) in one transaction; `batchId` makes a repeat of the same sheet return the same receipt.
 * The sheet carries no `branchId`: the backend takes it from the invoices (like the web).
 */
export function useSaveCashReceipt() {
  const cache = useTenantCache();
  const mutation = useMutation({
    mutationFn: (dto: CashReceiptRequest) => apiFetch<CashReceiptResult>('/sales/cash-receipts', { method: 'POST', body: dto }),
    onSuccess: () => {
      for (const key of RECEIPT_QUERY_KEYS) void cache.invalidate([...key]);
    },
    // Per-row failures are shown on the rows by the screen; anything else is toasted here.
    onError: (error) => {
      if (rowErrorsOf(error instanceof ApiError ? error.body : undefined).length === 0) toast.error(mutationErrorMessage(error, 'Failed to save cash receipt'));
    },
  });
  return { save: mutation.mutateAsync, isSaving: mutation.isPending };
}

/** `GET /sales/cash-receipts/by-number/:number`: a saved transaction with its invoices as they are now (needs `cash_receipt:read`). */
export function useLoadCashTransaction() {
  const mutation = useMutation({
    mutationFn: (number: string) => apiFetch<CashTransaction>(`/sales/cash-receipts/by-number/${encodeURIComponent(number)}`),
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to load the transaction')),
  });
  return { loadTransaction: mutation.mutateAsync, isLoading: mutation.isPending };
}

/**
 * `PATCH /sales/cash-receipts/by-number/:number` (needs `cash_receipt:update`): edits the transaction in place, once and
 * never retried. A 409 means someone else changed it first; the screen reloads it.
 */
export function useUpdateCashTransaction() {
  const cache = useTenantCache();
  const mutation = useMutation({
    mutationFn: ({ number, dto }: { number: string; dto: UpdateCashTransactionRequest }) =>
      apiFetch<CashTransaction>(`/sales/cash-receipts/by-number/${encodeURIComponent(number)}`, { method: 'PATCH', body: dto }),
    onSuccess: () => {
      for (const key of RECEIPT_QUERY_KEYS) void cache.invalidate([...key]);
    },
    onError: (error) => {
      if (rowErrorsOf(error instanceof ApiError ? error.body : undefined).length === 0) toast.error(mutationErrorMessage(error, 'Failed to save edits'));
    },
  });
  return { updateTransaction: mutation.mutateAsync, isUpdating: mutation.isPending };
}

export interface CashTransactionListParams {
  branchId: string | null;
  q?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
}

/** `GET /sales/cash-receipts`: saved transactions, newest first, filtered and paged on the server (needs `cash_receipt:read`). */
export function useCashTransactionsPage(p: CashTransactionListParams, enabled = true) {
  const query = useTenantQuery<PaginatedCashTransactions>({
    queryKey: ['sales', 'cash-transactions', p],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(p.page), limit: String(p.limit) });
      if (p.branchId) params.set('branchId', p.branchId);
      if (p.q) params.set('q', p.q);
      if (p.startDate) params.set('startDate', p.startDate);
      if (p.endDate) params.set('endDate', p.endDate);
      return apiFetch<PaginatedCashTransactions>(`/sales/cash-receipts?${params.toString()}`);
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  return { transactions: query.data?.items ?? [], total: query.data?.total ?? 0, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch };
}
