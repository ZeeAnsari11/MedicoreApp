import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { Account, CreateAccountRequest, UpdateAccountRequest } from '@/types/medicore';

export const ACCOUNTS_QUERY_KEY = ['accounting', 'accounts'] as const;

/**
 * Chart of accounts (tenant-wide, not branch-scoped). The backend seeds the 15 system accounts on first read, enforces
 * unique codes (409), and refuses to deactivate/delete system accounts; nothing about that is decided here.
 */
export function useAccounts(enabled = true) {
  const cache = useTenantCache();
  const query = useTenantQuery<Account[]>({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: () => apiFetch<Account[]>('/accounting/accounts'),
    staleTime: 60_000,
    enabled,
  });
  const invalidate = () => cache.invalidate(ACCOUNTS_QUERY_KEY);

  const create = useMutation({
    mutationFn: (dto: CreateAccountRequest) => apiFetch<Account>('/accounting/accounts', { method: 'POST', body: dto }),
    onSuccess: () => {
      void invalidate();
      toast.success('Account created');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create account')),
  });
  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAccountRequest }) => apiFetch<Account>(`/accounting/accounts/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: () => {
      void invalidate();
      toast.success('Account updated');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update account')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/accounting/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void invalidate();
      toast.success('Account removed');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to remove account')),
  });

  return {
    accounts: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    create: create.mutateAsync,
    isCreating: create.isPending,
    update: (id: string, dto: UpdateAccountRequest) => update.mutateAsync({ id, dto }),
    isUpdating: update.isPending,
    remove: remove.mutateAsync,
    isRemoving: remove.isPending,
  };
}

/** Accounts a payment/expense can be paid from: active ASSET accounts except the control/stock ones (same filter as the web dialogs). */
export const EXCLUDED_PAY_FROM_KEYS = ['ACCOUNTS_RECEIVABLE', 'INVENTORY', 'VENDOR_ADVANCES'];
export const payFromAccounts = (accounts: readonly Account[]) => accounts.filter((a) => a.isActive && a.type === 'ASSET' && !EXCLUDED_PAY_FROM_KEYS.includes(a.systemKey ?? ''));
export const expenseCategoryAccounts = (accounts: readonly Account[]) => accounts.filter((a) => a.isActive && a.type === 'EXPENSE');
