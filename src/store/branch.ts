import { create } from 'zustand';

export const ALL_BRANCHES_VALUE = 'all';

/**
 * The admin's selected branch filter ('all' or a branch id). Sent as `X-Branch-Id` on non-POST requests and part of
 * every query key, so switching branches never shows another branch's cached data. Session-scoped like the web
 * (sessionStorage): not persisted, reset on login/logout.
 */
interface BranchState {
  selection: string | null;
  setSelection: (value: string | null) => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  selection: null,
  setSelection: (selection) => set({ selection }),
}));

export function branchHeaders(): Record<string, string> {
  const value = useBranchStore.getState().selection;
  return value && value !== ALL_BRANCHES_VALUE ? { 'X-Branch-Id': value } : {};
}
