import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type {
  CreateVendorProductRequest,
  ProductVendorSummary,
  UpdateVendorProductRequest,
  VendorProduct,
  VendorProductSearchResult,
} from '@/types/medicore';

export const VENDOR_PRODUCTS_QUERY_KEY = ['vendor-products'] as const;

/**
 * A VendorProduct link is reachable from both the product screen and the vendor pricing screens, so every mutation
 * invalidates the broad `vendor-products` prefix (and the product list's vendor summary rides on it).
 */
function useVendorProductMutations() {
  const cache = useTenantCache();
  const invalidateAll = () => cache.invalidate(VENDOR_PRODUCTS_QUERY_KEY);

  const create = useMutation({
    mutationFn: (dto: CreateVendorProductRequest) => apiFetch<VendorProduct>('/vendor-products', { method: 'POST', body: dto }),
    onSuccess: () => {
      void invalidateAll();
      toast.success('Vendor pricing added');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to add vendor pricing')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateVendorProductRequest }) =>
      apiFetch<VendorProduct>(`/vendor-products/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: () => {
      void invalidateAll();
      toast.success('Vendor pricing updated');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update vendor pricing')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/vendor-products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void invalidateAll();
      toast.success('Vendor pricing removed');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to remove vendor pricing')),
  });

  return {
    create: create.mutateAsync,
    isCreating: create.isPending,
    update: (id: string, dto: UpdateVendorProductRequest) => update.mutateAsync({ id, dto }),
    isUpdating: update.isPending,
    remove: remove.mutateAsync,
    isRemoving: remove.isPending,
  };
}

export function useVendorProductsForProduct(productId: string | null) {
  const query = useTenantQuery<VendorProduct[]>({
    queryKey: [...VENDOR_PRODUCTS_QUERY_KEY, 'product', productId],
    queryFn: () => apiFetch<VendorProduct[]>(`/vendor-products?productId=${productId}`),
    enabled: !!productId,
    staleTime: 30_000,
  });
  return { vendorProducts: query.data ?? [], isLoading: query.isLoading, error: query.error, ...useVendorProductMutations() };
}

export function useVendorProductsForVendor(vendorId: string | null) {
  const query = useTenantQuery<VendorProduct[]>({
    queryKey: [...VENDOR_PRODUCTS_QUERY_KEY, 'vendor', vendorId],
    queryFn: () => apiFetch<VendorProduct[]>(`/vendor-products?vendorId=${vendorId}`),
    enabled: !!vendorId,
    staleTime: 30_000,
  });
  return { vendorProducts: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch, ...useVendorProductMutations() };
}

/** Active vendors and prices per product, one request for the whole product list. */
export function useVendorSummary(enabled = true) {
  const query = useTenantQuery<ProductVendorSummary[]>({
    queryKey: [...VENDOR_PRODUCTS_QUERY_KEY, 'summary'],
    queryFn: () => apiFetch<ProductVendorSummary[]>('/vendor-products/summary'),
    staleTime: 30_000,
    enabled,
  });
  return new Map((query.data ?? []).map((r) => [r.productId, r.vendors]));
}

/** Vendors selling a product whose name matches `term` (server-side search; idle when the term is empty). */
export function useVendorSearchByProduct(term: string, includeInactive: boolean) {
  const query = useTenantQuery<VendorProductSearchResult[]>({
    queryKey: [...VENDOR_PRODUCTS_QUERY_KEY, 'search', term, includeInactive],
    queryFn: () => {
      const params = new URLSearchParams({ product: term });
      if (includeInactive) params.set('includeInactive', 'true');
      return apiFetch<VendorProductSearchResult[]>(`/vendor-products/search?${params.toString()}`);
    },
    enabled: term.length > 0,
    staleTime: 30_000,
  });
  return { results: query.data ?? [], isLoading: query.isLoading && term.length > 0, refetch: query.refetch };
}
