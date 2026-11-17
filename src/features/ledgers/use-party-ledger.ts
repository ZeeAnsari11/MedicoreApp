import { keepPreviousData } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { useTenantQuery } from '@/lib/tenant-query';
import type { PartyBalancesResponse, PartyLedgerResponse } from '@/types/medicore';

export const LEDGERS_QUERY_KEY = ['accounting', 'ledgers'] as const;

export type PartyKind = 'customers' | 'vendors';

export interface LedgerParams {
  branchId?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export interface PartyBalancesParams {
  branchId?: string;
  search?: string;
  hasBalance?: boolean;
  sortBy: 'name' | 'balance';
  sortDir: 'asc' | 'desc';
  page: number;
  limit: number;
}

export function toQuery(params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) q.set(key, String(value));
  }
  return q.toString();
}

/** `GET /accounting/<kind>/:id/ledger` (customers need acc_customer_ledger:read). Pages are server-side (page/limit). */
export function usePartyLedger(kind: PartyKind, partyId: string | null, params: LedgerParams, enabled = true) {
  const query = useTenantQuery<PartyLedgerResponse>({
    queryKey: [...LEDGERS_QUERY_KEY, kind, 'ledger', partyId, params],
    queryFn: () => apiFetch<PartyLedgerResponse>(`/accounting/${kind}/${partyId}/ledger?${toQuery({ ...params })}`),
    enabled: !!partyId && enabled,
    placeholderData: keepPreviousData,
  });
  return { ledger: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch };
}

/** `GET /accounting/<kind>/balances`: ledger-derived balances with server-side search/sort/paging. */
export function usePartyBalances(kind: PartyKind, params: PartyBalancesParams, enabled = true) {
  const query = useTenantQuery<PartyBalancesResponse>({
    queryKey: [...LEDGERS_QUERY_KEY, kind, 'balances', params],
    queryFn: () => apiFetch<PartyBalancesResponse>(`/accounting/${kind}/balances?${toQuery({ ...params })}`),
    enabled,
    placeholderData: keepPreviousData,
  });
  return { balances: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch };
}
