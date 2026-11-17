import { keepPreviousData, useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import { InvoiceType, PartyType, type CreatePaymentRequest, type Payment, type PaginatedPurchases, type PaginatedSales } from '@/types/medicore';

import { isOpenInvoice, round2, type OpenInvoice } from './payment-logic';

export const PAYMENTS_QUERY_KEY = ['accounting', 'payments'] as const;

/** `GET /accounting/payments?branchId&partyType&partyId`: live (non-voided) payments, newest first. */
export function usePayments(params: { branchId: string | null; partyType?: PartyType | '' }) {
  const query = useTenantQuery<Payment[]>({
    queryKey: [...PAYMENTS_QUERY_KEY, params],
    queryFn: () => {
      const q = new URLSearchParams();
      if (params.branchId) q.set('branchId', params.branchId);
      if (params.partyType) q.set('partyType', params.partyType);
      const qs = q.toString();
      return apiFetch<Payment[]>(`/accounting/payments${qs ? `?${qs}` : ''}`);
    },
    staleTime: 30_000,
    // Keep the list (and the filter controls) on screen while another filter loads.
    placeholderData: keepPreviousData,
  });
  return { payments: query.data ?? [], isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch };
}

/**
 * The party's open invoices for the allocation panel: UNPAID and PARTIAL invoices (the web filters its full list by
 * `grandTotal - amountPaid > 0.01`). Newest 200 of each status; pending orders are not in `/sales`.
 */
export function useOpenInvoices(partyType: PartyType | null, partyId: string | null, branchId: string | null) {
  const query = useTenantQuery<OpenInvoice[]>({
    queryKey: [...PAYMENTS_QUERY_KEY, 'open-invoices', partyType, partyId, branchId],
    enabled: !!partyType && !!partyId,
    staleTime: 0,
    queryFn: async () => {
      const isCustomer = partyType === PartyType.CUSTOMER;
      const base = isCustomer ? '/sales' : '/purchases';
      const out: OpenInvoice[] = [];
      for (const paymentStatus of ['UNPAID', 'PARTIAL']) {
        const q = new URLSearchParams({ page: '1', limit: '200', paymentStatus, [isCustomer ? 'customerId' : 'vendorId']: partyId! });
        if (branchId) q.set('branchId', branchId);
        if (isCustomer) {
          const page = await apiFetch<PaginatedSales>(`${base}?${q.toString()}`);
          for (const s of page.items) out.push({ invoiceType: InvoiceType.SALE, id: s.id, number: s.invoiceNumber, grandTotal: s.grandTotal, amountPaid: s.amountPaid, outstanding: 0 });
        } else {
          const page = await apiFetch<PaginatedPurchases>(`${base}?${q.toString()}`);
          for (const p of page.items) out.push({ invoiceType: InvoiceType.PURCHASE, id: p.id, number: p.purchaseNumber, grandTotal: p.grandTotal, amountPaid: p.amountPaid, outstanding: 0 });
        }
      }
      return out.filter((i) => isOpenInvoice(i.grandTotal, i.amountPaid)).map((i) => ({ ...i, outstanding: round2(i.grandTotal - i.amountPaid) }));
    },
  });
  return { invoices: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/**
 * Record and void. Each is one request that is never retried; the backend posts/reverses the journal entries, updates
 * the invoices and rejects anything invalid (409 when the advance was applied elsewhere or an invoice has returns).
 */
export function usePaymentMutations() {
  const cache = useTenantCache();
  const invalidate = () => {
    for (const key of [PAYMENTS_QUERY_KEY, ['accounting'], ['sales'], ['purchases'], ['customers'], ['vendors'], ['dashboard']]) void cache.invalidate(key);
  };

  const create = useMutation({
    mutationFn: (dto: CreatePaymentRequest) => apiFetch<Payment>('/accounting/payments', { method: 'POST', body: dto }),
    onSuccess: () => {
      invalidate();
      toast.success('Payment recorded');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to record payment')),
  });
  const voidPayment = useMutation({
    mutationFn: ({ id, branchId }: { id: string; branchId: string | null }) => apiFetch<void>(`/accounting/payments/${id}${branchId ? `?branchId=${branchId}` : ''}`, { method: 'DELETE' }),
    // A timeout may still have voided it, so refresh either way.
    onSettled: () => invalidate(),
    onSuccess: () => toast.success('Payment voided'),
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to void payment')),
  });

  return {
    create: create.mutateAsync,
    isCreating: create.isPending,
    voidPayment: (id: string, branchId: string | null) => voidPayment.mutateAsync({ id, branchId }),
    isVoiding: voidPayment.isPending,
  };
}
