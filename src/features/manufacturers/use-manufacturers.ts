import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { CreateManufacturerRequest, Manufacturer, UpdateManufacturerRequest } from '@/types/medicore';

export const MANUFACTURERS_QUERY_KEY = ['manufacturers'] as const;

/** The API lists manufacturers tenant-wide (no search/paging needed server-side); screens filter by branch/name. */
export function useManufacturers() {
  const cache = useTenantCache();
  const query = useTenantQuery<Manufacturer[]>({
    queryKey: MANUFACTURERS_QUERY_KEY,
    queryFn: () => apiFetch<Manufacturer[]>('/manufacturers'),
    staleTime: 5 * 60_000,
  });

  const replace = (data: Manufacturer) =>
    cache.update<Manufacturer[]>(MANUFACTURERS_QUERY_KEY, (old) => (old ? old.map((m) => (m.id === data.id ? data : m)) : [data]));

  const create = useMutation({
    mutationFn: (dto: CreateManufacturerRequest) => apiFetch<Manufacturer>('/manufacturers', { method: 'POST', body: dto }),
    onSuccess: (data, variables) => {
      cache.update<Manufacturer[]>(MANUFACTURERS_QUERY_KEY, (old) => [...(old ?? []), data]);
      if (variables.alsoCreateVendor) {
        // The matching vendor now exists too: refresh vendor lists/pickers.
        void cache.invalidate(['vendors']);
        toast.success('Manufacturer and vendor created');
      } else {
        toast.success('Manufacturer created');
      }
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create manufacturer')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateManufacturerRequest }) =>
      apiFetch<Manufacturer>(`/manufacturers/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: (data) => {
      replace(data);
      toast.success('Manufacturer updated');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update manufacturer')),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<Manufacturer>(`/manufacturers/${id}/status`, { method: 'PATCH', body: { isActive } }),
    onSuccess: (data) => {
      replace(data);
      toast.success(`Manufacturer ${data.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update status')),
  });

  return {
    manufacturers: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    create: create.mutateAsync,
    isCreating: create.isPending,
    update: (id: string, dto: UpdateManufacturerRequest) => update.mutateAsync({ id, dto }),
    isUpdating: update.isPending,
    setStatus: (id: string, isActive: boolean) => setStatus.mutateAsync({ id, isActive }),
    isSettingStatus: setStatus.isPending,
  };
}
