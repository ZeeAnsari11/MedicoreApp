import { keepPreviousData } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { LEDGERS_QUERY_KEY, toQuery, type LedgerParams } from '@/features/ledgers/use-party-ledger';
import { useTenantQuery } from '@/lib/tenant-query';
import type { GeneralLedgerResponse } from '@/types/medicore';

/** `GET /accounting/general-ledger?accountId&from&to&page&limit` (the whole `to` day is included). */
export function useGeneralLedger(accountId: string | null, params: LedgerParams) {
  const query = useTenantQuery<GeneralLedgerResponse>({
    queryKey: [...LEDGERS_QUERY_KEY, 'gl', accountId, params],
    queryFn: () => apiFetch<GeneralLedgerResponse>(`/accounting/general-ledger?${toQuery({ accountId: accountId ?? undefined, ...params })}`),
    enabled: !!accountId,
    placeholderData: keepPreviousData,
  });
  return { ledger: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch };
}
