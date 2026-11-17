import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { LEDGERS_QUERY_KEY } from '@/features/ledgers/use-party-ledger';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { CreateCustomerRequest, Customer, UpdateCustomerRequest } from '@/types/medicore';

export const CUSTOMERS_QUERY_KEY = ['customers'] as const;

/** `branchId` lists that branch's customers (create forms with their own Branch field); default follows the branch filter. */
export function useCustomers(branchId?: string | null) {
  const cache = useTenantCache();
  const query = useTenantQuery<Customer[]>({
    queryKey: [...CUSTOMERS_QUERY_KEY, branchId ?? null],
    queryFn: () => apiFetch<Customer[]>('/customers', { headers: branchId ? { 'X-Branch-Id': branchId } : undefined }),
    staleTime: 60_000,
  });
  // Balances come from the accounting ledger, so any ledger change can move them. Customer names also appear on sales
  // and in the party ledgers (purchases have no customer).
  const invalidate = () => Promise.all([CUSTOMERS_QUERY_KEY, ['sales'], LEDGERS_QUERY_KEY].map((key) => cache.invalidate(key)));

  const create = useMutation({
    mutationFn: (dto: CreateCustomerRequest) => apiFetch<Customer>('/customers', { method: 'POST', body: dto }),
    onSuccess: () => {
      void invalidate();
      toast.success('Customer created');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create customer')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCustomerRequest }) => apiFetch<Customer>(`/customers/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: () => {
      void invalidate();
      toast.success('Customer updated');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update customer')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void invalidate();
      toast.success('Customer deleted');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to delete customer')),
  });

  return {
    customers: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    create: create.mutateAsync,
    isCreating: create.isPending,
    update: (id: string, dto: UpdateCustomerRequest) => update.mutateAsync({ id, dto }),
    isUpdating: update.isPending,
    remove: remove.mutateAsync,
    isRemoving: remove.isPending,
  };
}
