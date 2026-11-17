import { useEffect } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { ALL_BRANCHES_VALUE, useBranchStore } from '@/store/branch';

import { useBranches } from './use-branches';

/**
 * The branch a list screen is scoped to (port of the web `useBranchFilter`).
 * - Branch users are locked to their own branch (no dropdown, no "all").
 * - Admins default to "All branches" and may switch; the choice is what the API receives as `X-Branch-Id`.
 * - An admin with a single branch is locked to it. The server enforces the same rules.
 */
export function useBranchFilter() {
  const { user, isAdmin } = useAuth();
  const { branches } = useBranches();
  const stored = useBranchStore((s) => s.selection);
  const setSelection = useBranchStore((s) => s.setSelection);

  const lockedAdminBranch = isAdmin && branches.length === 1 ? branches[0] : undefined;

  let branchId: string | null;
  if (!isAdmin) branchId = user?.branchId ?? null;
  else if (lockedAdminBranch) branchId = lockedAdminBranch.id;
  else if (stored && stored !== ALL_BRANCHES_VALUE && branches.some((b) => b.id === stored)) branchId = stored;
  else branchId = null;

  // Persist the resolved default so API calls (header) and query keys agree with what the screen shows.
  useEffect(() => {
    if (isAdmin && branchId && stored !== branchId) setSelection(branchId);
  }, [isAdmin, branchId, stored, setSelection]);

  return {
    branchId,
    setBranchId: (id: string | null) => setSelection(id ?? ALL_BRANCHES_VALUE),
    /** True only for an admin viewing every branch combined. */
    isAll: isAdmin && branchId === null,
    showDropdown: isAdmin && branches.length > 1,
    branches,
    /** Branch users: their own branch name, for the read-only label. */
    lockedBranchName: isAdmin ? null : (branches.find((b) => b.id === user?.branchId)?.name ?? 'Unassigned branch'),
  };
}
