import type { PendingOrderRow } from '@/types/medicore';

const KARACHI_OFFSET_MS = 5 * 3_600_000;

/** Web `karachiToday()`: the backend's order day is the Pakistan (UTC+5) calendar day, so the default date must be too. */
export const pakistanToday = (now = Date.now()) => new Date(now + KARACHI_OFFSET_MS).toISOString().slice(0, 10);

export type SelectionState = 'none' | 'some' | 'all';

/** Selected ids that are still in the list: orders processed elsewhere drop out of the selection (web `selected`). */
export const pruneSelection = (picked: ReadonlySet<string>, orders: readonly PendingOrderRow[]): Set<string> => {
  const live = new Set(orders.map((o) => o.id));
  return new Set([...picked].filter((id) => live.has(id)));
};

export const toggleOrder = (selected: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** Header checkbox: select everything, or clear when everything is already selected. */
export const toggleAll = (selected: ReadonlySet<string>, orders: readonly PendingOrderRow[]): Set<string> =>
  orders.length > 0 && selected.size === orders.length ? new Set() : new Set(orders.map((o) => o.id));

export const selectionState = (selected: ReadonlySet<string>, orders: readonly PendingOrderRow[]): SelectionState =>
  selected.size === 0 ? 'none' : selected.size === orders.length ? 'all' : 'some';

export type ProcessAction = 'confirm' | 'reject';

const plural = (n: number) => `${n} order${n === 1 ? '' : 's'}`;

/** Same wording as the web dialog. */
export const processDialog = (action: ProcessAction, count: number) =>
  action === 'confirm'
    ? { title: `Confirm ${plural(count)}?`, message: 'Each gets an invoice number and appears on the Sales page.', confirmLabel: 'Yes, confirm', destructive: false }
    : { title: `Reject ${plural(count)}?`, message: 'The stock goes back to its batches and the orders are removed. This cannot be undone.', confirmLabel: 'Yes, reject', destructive: true };

/** Success text, built from the count the backend reports (never from what was selected). */
export const processedToast = (action: ProcessAction, processed: number) => `${plural(processed)} ${action === 'confirm' ? 'confirmed' : 'rejected'}`;
