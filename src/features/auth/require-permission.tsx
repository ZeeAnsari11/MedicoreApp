import type { ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';

import { useAuth } from './use-auth';

/**
 * Screen-level permission gate. Permissions arrive with `/auth/me`, so "No access" is only shown once the profile has
 * loaded; while it loads the screen shows Loading, and if it fails the user gets the error with a retry, never a false denial.
 */
export function RequirePermission({ permission, what, children }: { permission: string; what: string; children: ReactNode }) {
  const { has, user, isLoading, profileError, refetchProfile } = useAuth();
  if (isLoading) return <LoadingState />;
  if (profileError && !user) return <ErrorState error={profileError} onRetry={() => void refetchProfile()} />;
  if (!has(permission)) return <EmptyState title="No access" message={`You do not have permission to ${what}.`} />;
  return <>{children}</>;
}
