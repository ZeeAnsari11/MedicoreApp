import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { CreateVendorRequest, UpdateVendorRequest, Vendor } from '@/types/medicore';

export const VENDORS_QUERY_KEY = ['vendors'] as const;

/** `branchId` lists that branch's vendors (create forms with their own Branch field); default follows the branch filter. */
export function useVendors(branchId?: string | null) {
  const cache = useTenantCache();
  const query = useTenantQuery<Vendor[]>({
    queryKey: [...VENDORS_QUERY_KEY, branchId ?? null],
    queryFn: () => apiFetch<Vendor[]>('/vendors', { headers: branchId ? { 'X-Branch-Id': branchId } : undefined }),
    staleTime: 5 * 60_000,
  });
  const invalidate = () => cache.invalidate(VENDORS_QUERY_KEY);

  const create = useMutation({
    mutationFn: (dto: CreateVendorRequest) => apiFetch<Vendor>('/vendors', { method: 'POST', body: dto }),
    onSuccess: () => {
      void invalidate();
      toast.success('Vendor created');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create vendor')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateVendorRequest }) => apiFetch<Vendor>(`/vendors/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: () => {
      void invalidate();
      toast.success('Vendor updated');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update vendor')),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<Vendor>(`/vendors/${id}/status`, { method: 'PATCH', body: { isActive } }),
    onSuccess: (data) => {
      void invalidate();
      toast.success(`Vendor ${data.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update status')),
  });

  return {
    vendors: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    create: create.mutateAsync,
    isCreating: create.isPending,
    update: (id: string, dto: UpdateVendorRequest) => update.mutateAsync({ id, dto }),
    isUpdating: update.isPending,
    setStatus: (id: string, isActive: boolean) => setStatus.mutateAsync({ id, isActive }),
    isSettingStatus: setStatus.isPending,
  };
}
