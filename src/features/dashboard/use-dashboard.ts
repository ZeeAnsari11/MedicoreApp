import { keepPreviousData } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { useTenantQuery } from '@/lib/tenant-query';
import type { AccountingOverviewResponse, DashboardSummary } from '@/types/medicore';

export function useDashboardSummary(branchId: string | null) {
  return useTenantQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', branchId],
    queryFn: () => {
      // "Today" is the viewer's local day, not the server's (the backend takes the bounds from the client).
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const params = new URLSearchParams({ todayStart: start.toISOString(), todayEnd: end.toISOString() });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<DashboardSummary>(`/reports/dashboard-summary?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}

export const useAccountingOverview = (enabled: boolean) =>
  useTenantQuery<AccountingOverviewResponse>({
    queryKey: ['accounting', 'overview'],
    queryFn: () => apiFetch<AccountingOverviewResponse>('/accounting/reports/overview'),
    enabled,
  });
