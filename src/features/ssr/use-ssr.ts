import { keepPreviousData } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { useTenantQuery } from '@/lib/tenant-query';
import type { SsrInvoice, SsrReport } from '@/types/medicore';

export type SsrParams = Record<string, string | undefined>;
export type SsrExportFormat = 'xlsx' | 'csv' | 'pdf';

/** Web `ssrQuery`: falsy values are skipped. */
export const ssrQuery = (params: SsrParams) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return q.toString();
};

/** `GET /reports/ssr`: every figure is computed by the backend; the previous report stays visible while a new one loads. */
export function useSsr(params: SsrParams, enabled: boolean) {
  const query = useTenantQuery<SsrReport>({
    queryKey: ['reports', 'ssr', params],
    queryFn: () => apiFetch<SsrReport>(`/reports/ssr?${ssrQuery(params)}`),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  return { report: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch };
}

/** `GET /reports/ssr/product/:id/invoices` (filters only: no view, sort or search). */
export function useSsrInvoices(productId: string | null, params: SsrParams) {
  const query = useTenantQuery<SsrInvoice[]>({
    queryKey: ['reports', 'ssr', 'invoices', productId, params],
    queryFn: () => apiFetch<SsrInvoice[]>(`/reports/ssr/product/${productId}/invoices?${ssrQuery(params)}`),
    enabled: !!productId,
  });
  return { invoices: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/** `GET /reports/ssr/export`: the server builds the file from the same params, the visible `columns` and the `format`. */
export const ssrExportPath = (params: SsrParams, format: SsrExportFormat) => `/reports/ssr/export?${ssrQuery({ ...params, format })}`;
