/** Local-calendar yyyy-mm-dd (what the API's date params and the web date inputs use). */
export const toIsoDate = (d: Date) => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/** True for a real calendar date written yyyy-mm-dd (rejects 2026-02-31). */
export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const DAY_MS = 86_400_000;

/** Whole days from now until `iso` (negative once past); same rounding as the web batch dialog. */
export const daysUntil = (iso: string, now = Date.now()) => Math.ceil((new Date(iso).getTime() - now) / DAY_MS);

export type ExpiryTone = 'danger' | 'warning' | 'neutral' | 'success';

/** Web `expiryBadge`: expired / <=30d warning / <=90d outline / else secondary. */
export function expiryStatus(iso: string, now = Date.now()): { label: string; tone: ExpiryTone } {
  const days = daysUntil(iso, now);
  if (days < 0) return { label: 'Expired', tone: 'danger' };
  if (days <= 30) return { label: `${days}d left`, tone: 'warning' };
  if (days <= 90) return { label: `${days}d left`, tone: 'neutral' };
  return { label: `${days}d left`, tone: 'success' };
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

export interface DateRange {
  from: string;
  to: string;
}
export const DATE_PRESETS: { key: string; label: string; range: (now?: Date) => DateRange }[] = [
  { key: 'today', label: 'Today', range: (n = new Date()) => ({ from: toIsoDate(n), to: toIsoDate(n) }) },
  { key: 'month', label: 'This month', range: (n = new Date()) => ({ from: toIsoDate(new Date(n.getFullYear(), n.getMonth(), 1)), to: toIsoDate(new Date(n.getFullYear(), n.getMonth() + 1, 0)) }) },
  { key: 'lastMonth', label: 'Last month', range: (n = new Date()) => ({ from: toIsoDate(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: toIsoDate(new Date(n.getFullYear(), n.getMonth(), 0)) }) },
  { key: 'year', label: 'This year', range: (n = new Date()) => ({ from: toIsoDate(new Date(n.getFullYear(), 0, 1)), to: toIsoDate(new Date(n.getFullYear(), 11, 31)) }) },
];
/** The web ledger opens on "This month". */
export const defaultLedgerRange = () => DATE_PRESETS[1].range();
