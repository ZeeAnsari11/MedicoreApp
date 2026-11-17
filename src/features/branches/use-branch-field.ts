import { useBranchFilter } from './use-branch-filter';

/**
 * The branch a NEW record is created in, as a form field (port of the web `useBranchField`). The top-bar branch is a
 * read filter only and never pre-selects it; the form's own value is what gets sent as `branchId`. Branch users and
 * single-branch admins have no choice: the field is pre-filled and locked.
 */
export function useBranchField() {
  const filter = useBranchFilter();
  const locked = !filter.showDropdown && !!filter.branchId;
  return {
    defaultBranchId: locked ? (filter.branchId ?? '') : '',
    locked,
    branches: filter.branches,
    lockedBranchName: filter.branches.find((b) => b.id === filter.branchId)?.name ?? filter.lockedBranchName ?? '',
  };
}
export type BranchFieldState = ReturnType<typeof useBranchField>;
