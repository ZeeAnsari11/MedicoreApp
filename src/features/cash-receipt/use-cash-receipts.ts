import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { ApiError } from '@/api/errors';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';

import { rowErrorsOf, type LookupInvoice } from './sheet';

export interface CashReceiptRequest {
  batchId: string;
  date: string;
  method: 'CASH';
  rows: { invoiceId: string; amount: number }[];
}

export interface CashReceiptResult {
  id: string;
  voucherNumber: string;
  count: number;
  total: number;
  rows: { invoiceId: string; invoiceNumber: string; customerName: string; amount: number }[];
}

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
      for (const key of [['sales'], ['accounting'], ['customers'], ['dashboard'], ['reports']]) void cache.invalidate(key);
    },
    // Per-row failures are shown on the rows by the screen; anything else is toasted here.
    onError: (error) => {
      if (rowErrorsOf(error instanceof ApiError ? error.body : undefined).length === 0) toast.error(mutationErrorMessage(error, 'Failed to save cash receipt'));
    },
  });
  return { save: mutation.mutateAsync, isSaving: mutation.isPending };
}
