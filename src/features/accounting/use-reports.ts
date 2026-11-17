import { apiFetch } from '@/api/client';
import { useTenantQuery } from '@/lib/tenant-query';
import type { BalanceSheetResponse, ProfitLossResponse, TrialBalanceResponse } from '@/types/medicore';

const KEY = ['accounting', 'reports'] as const;

function path(base: string, params: Record<string, string | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return `/accounting/reports/${base}${s ? `?${s}` : ''}`;
}

/** Report figures come from the backend as is; the date is sent exactly as chosen (a bare end date means midnight, so that day is excluded). */
export function useTrialBalance(branchId: string | null, asOfDate: string, enabled = true) {
  const q = useTenantQuery<TrialBalanceResponse>({ queryKey: [...KEY, 'trial-balance', branchId, asOfDate], queryFn: () => apiFetch<TrialBalanceResponse>(path('trial-balance', { branchId, asOfDate })), enabled });
  return { data: q.data, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

export function useProfitLoss(branchId: string | null, startDate: string, endDate: string, enabled = true) {
  const q = useTenantQuery<ProfitLossResponse>({ queryKey: [...KEY, 'profit-loss', branchId, startDate, endDate], queryFn: () => apiFetch<ProfitLossResponse>(path('profit-loss', { branchId, startDate, endDate })), enabled });
  return { data: q.data, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

export function useBalanceSheet(branchId: string | null, asOfDate: string, enabled = true) {
  const q = useTenantQuery<BalanceSheetResponse>({ queryKey: [...KEY, 'balance-sheet', branchId, asOfDate], queryFn: () => apiFetch<BalanceSheetResponse>(path('balance-sheet', { branchId, asOfDate })), enabled });
  return { data: q.data, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

/** The web's client-built CSV (`exportToCsv`): every cell quoted, amounts to 2 decimals. Pure so it can be tested. */
export function trialBalanceCsv(rows: TrialBalanceResponse['rows']): string {
  const cell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Code', 'Account', 'Type', 'Debit', 'Credit'].join(',')];
  for (const r of rows) lines.push([r.accountCode, r.accountName, r.type, r.debit.toFixed(2), r.credit.toFixed(2)].map(cell).join(','));
  return lines.join('\n');
}
