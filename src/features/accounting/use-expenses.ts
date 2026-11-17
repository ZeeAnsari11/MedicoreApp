import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { CreateExpenseRequest, Expense } from '@/types/medicore';

export const EXPENSES_QUERY_KEY = ['accounting', 'expenses'] as const;

/** `GET /accounting/expenses`: live expenses, newest first (viewing-branch scoped). */
export function useExpenses(branchId: string | null) {
  const cache = useTenantCache();
  const query = useTenantQuery<Expense[]>({
    queryKey: [...EXPENSES_QUERY_KEY, branchId],
    queryFn: () => apiFetch<Expense[]>(`/accounting/expenses${branchId ? `?branchId=${branchId}` : ''}`),
    staleTime: 30_000,
  });
  /** One request, never retried; the backend posts the journal entry (Dr expense, Cr paid-from account). No edit/void exists. */
  const create = useMutation({
    mutationFn: (dto: CreateExpenseRequest) => apiFetch<Expense>('/accounting/expenses', { method: 'POST', body: dto }),
    onSuccess: () => {
      void cache.invalidate(EXPENSES_QUERY_KEY);
      void cache.invalidate(['accounting']);
      void cache.invalidate(['dashboard']);
      toast.success('Expense recorded');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to record expense')),
  });
  return { expenses: query.data ?? [], isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch, create: create.mutateAsync, isCreating: create.isPending };
}

/** Web: Submit needs a category, amount > 0, a paid-from account and a description. */
export const canSubmitExpense = (d: { expenseAccountId: string; amount: string; paymentAccountId: string; description: string }) =>
  !!d.expenseAccountId && Number(d.amount) > 0 && !!d.paymentAccountId && d.description.trim().length > 0;
