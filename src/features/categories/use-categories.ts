import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { Category, CreateCategoryRequest } from '@/types/medicore';

export const CATEGORIES_QUERY_KEY = ['categories'] as const;

/** GET /categories needs products:read; create needs products:create. */
export function useCategories() {
  const cache = useTenantCache();
  const query = useTenantQuery<Category[]>({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => apiFetch<Category[]>('/categories'),
    staleTime: 5 * 60_000,
  });

  const create = useMutation({
    mutationFn: (dto: CreateCategoryRequest) => apiFetch<Category>('/categories', { method: 'POST', body: dto }),
    onSuccess: (data) => {
      cache.update<Category[]>(CATEGORIES_QUERY_KEY, (old) => [...(old ?? []), data]);
      toast.success('Category created');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create category')),
  });

  return {
    categories: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: create.mutateAsync,
    isCreating: create.isPending,
  };
}
