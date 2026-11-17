import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { apiFetch } from '@/api/client';
import { queryClient } from '@/lib/query-client';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import type { AuthMeResponse, AuthResponse, LoginRequest } from '@/types/medicore';

import { buildPermissionChecker } from './permissions';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

/** A new identity must never see the previous one's cached data or branch selection. */
export function resetClientState() {
  queryClient.clear();
  useBranchStore.getState().setSelection(null);
}

export async function signOut() {
  await useSessionStore.getState().clear();
  resetClientState();
}

export function useAuth() {
  const token = useSessionStore((s) => s.token);
  const impersonationToken = useSessionStore((s) => s.impersonationToken);
  const hydrated = useSessionStore((s) => s.hydrated);
  const signedIn = !!(impersonationToken ?? token);

  const me = useQuery({
    // Keyed by token so an impersonation switch refetches instead of reusing the super admin's profile.
    queryKey: [...AUTH_QUERY_KEY, impersonationToken ? 'impersonation' : 'session'],
    queryFn: () => apiFetch<AuthMeResponse>('/auth/me'),
    enabled: hydrated && signedIn,
    // Short: the backend checks permissions per request; this keeps the UI close behind admin changes.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const user = signedIn ? (me.data ?? null) : null;
  const permissions = useMemo(() => buildPermissionChecker(user), [user]);
  const logout = useCallback(() => signOut(), []);

  return {
    user,
    ...permissions,
    signedIn,
    /** Hydrating the stored token, or loading the profile of a stored token. */
    isLoading: !hydrated || (signedIn && me.isLoading),
    profileError: me.error,
    refetchProfile: me.refetch,
    logout,
  };
}

export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginRequest) => apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: input, auth: false }),
    onSuccess: async (data) => {
      resetClientState();
      await useSessionStore.getState().setToken(data.accessToken);
    },
  });
}
