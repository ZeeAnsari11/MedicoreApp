import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { LEDGERS_QUERY_KEY } from '@/features/ledgers/use-party-ledger';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { CreateProductRequest, Product, UpdateProductRequest, UpdateProductStatusRequest } from '@/types/medicore';

export const PRODUCTS_QUERY_KEY = ['products'] as const;

export interface ProductFilters {
  /** Branch whose products to list, for pickers inside a branch-owned form; defaults to the branch filter. */
  branchId?: string | null;
  manufacturerId?: string;
  categoryId?: string;
  search?: string;
}

function fetchProducts(filters: ProductFilters) {
  const params = new URLSearchParams();
  if (filters.manufacturerId) params.set('manufacturerId', filters.manufacturerId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return apiFetch<Product[]>(`/products${qs ? `?${qs}` : ''}`, {
    headers: filters.branchId ? { 'X-Branch-Id': filters.branchId } : undefined,
  });
}

export function useProducts(filters: ProductFilters = {}, enabled = true) {
  const cache = useTenantCache();
  const query = useTenantQuery<Product[]>({
    queryKey: [...PRODUCTS_QUERY_KEY, filters],
    queryFn: () => fetchProducts(filters),
    staleTime: 5 * 60_000,
    enabled,
  });
  // Product names and prices are shown inside sales, purchases, stock and ledger views too.
  const invalidate = () =>
    Promise.all([PRODUCTS_QUERY_KEY, ['sales'], ['purchases'], ['inventory'], LEDGERS_QUERY_KEY].map((key) => cache.invalidate(key)));

  const create = useMutation({
    mutationFn: (dto: CreateProductRequest) => apiFetch<Product>('/products', { method: 'POST', body: dto }),
    onSuccess: () => {
      void invalidate();
      toast.success('Product created');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create product')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateProductRequest }) => apiFetch<Product>(`/products/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: () => {
      void invalidate();
      toast.success('Product updated');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update product')),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UpdateProductStatusRequest['status'] }) =>
      apiFetch<Product>(`/products/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      void invalidate();
      toast.success('Product status updated');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update status')),
  });

  return {
    products: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    create: create.mutateAsync,
    isCreating: create.isPending,
    update: (id: string, dto: UpdateProductRequest) => update.mutateAsync({ id, dto }),
    isUpdating: update.isPending,
    setStatus: (id: string, status: UpdateProductStatusRequest['status']) => setStatus.mutateAsync({ id, status }),
    isSettingStatus: setStatus.isPending,
  };
}
