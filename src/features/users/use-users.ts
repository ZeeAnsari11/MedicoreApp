import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import type { CreateUserRequest, CreateUserResponse, UpdateUserRequest, User, UserStatus } from '@/types/medicore';

export const USERS_QUERY_KEY = ['users'] as const;

/**
 * User administration. Create returns the one-time `temporaryPassword`; it is handed to the caller and never put in the
 * cache (the web strips it the same way). Self/last-admin/escalation rules are the backend's.
 */
export function useUsers() {
  const cache = useTenantCache();
  const query = useTenantQuery<User[]>({
    queryKey: USERS_QUERY_KEY,
    queryFn: () => apiFetch<User[]>('/users'),
    staleTime: 5 * 60_000,
  });
  const replace = (data: User) => cache.update<User[]>(USERS_QUERY_KEY, (old) => (old ? old.map((u) => (u.id === data.id ? data : u)) : [data]));

  const create = useMutation({
    mutationFn: (dto: CreateUserRequest) => apiFetch<CreateUserResponse>('/users', { method: 'POST', body: dto }),
    onSuccess: (data) => {
      const { temporaryPassword: _password, ...user } = data;
      cache.update<User[]>(USERS_QUERY_KEY, (old) => [...(old ?? []), user]);
      toast.success('User created successfully');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to create user')),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateUserRequest }) => apiFetch<User>(`/users/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: (data) => {
      replace(data);
      toast.success('User updated successfully');
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update user')),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) => apiFetch<User>(`/users/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: (data) => {
      replace(data);
      toast.success(`User ${data.status.toLowerCase()}`);
    },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to update user status')),
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
    create: create.mutateAsync,
    update: (id: string, dto: UpdateUserRequest) => update.mutateAsync({ id, dto }),
    setStatus: (id: string, status: UserStatus) => setStatus.mutateAsync({ id, status }),
  };
}
