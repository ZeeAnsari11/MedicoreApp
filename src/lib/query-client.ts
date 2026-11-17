import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // "Focus" is the app returning to the foreground (see react-query-native.ts); only stale queries refetch.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Reads only: retry transient failures, never auth/permission/validation errors.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
    // Writes are never auto-retried: the backend has no idempotency keys, so a retry could duplicate a transaction.
    // 'always': offline writes fail now with NetworkError instead of pausing and silently firing on reconnect.
    mutations: { retry: false, networkMode: 'always' },
  },
});
