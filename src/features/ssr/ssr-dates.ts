/**
 * Pakistan-time days, ported from the web SSR page: the API cuts days at a fixed UTC+5 (no DST), so the device's own
 * time zone must never decide what "today" is. All values are plain `yyyy-mm-dd` strings.
 */
const KARACHI_OFFSET_MS = 5 * 3600_000;
const DAY_MS = 86400_000;

/** The Pakistan calendar day `offsetDays` from `now`. */
export const karachiDay = (offsetDays = 0, now = Date.now()) => new Date(now + KARACHI_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
const monthStart = (day: string) => `${day.slice(0, 8)}01`;
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

export interface SsrRange { from: string; to: string }
export interface SsrPreset { key: string; label: string; range: (now?: number) => SsrRange }

export const SSR_PRESETS: SsrPreset[] = [
  { key: 'today', label: 'Today', range: (n) => ({ from: karachiDay(0, n), to: karachiDay(0, n) }) },
  { key: 'yesterday', label: 'Yesterday', range: (n) => ({ from: karachiDay(-1, n), to: karachiDay(-1, n) }) },
  { key: '7d', label: 'Last 7 days', range: (n) => ({ from: karachiDay(-6, n), to: karachiDay(0, n) }) },
  { key: '30d', label: 'Last 30 days', range: (n) => ({ from: karachiDay(-29, n), to: karachiDay(0, n) }) },
  { key: 'month', label: 'This month', range: (n) => ({ from: monthStart(karachiDay(0, n)), to: karachiDay(0, n) }) },
  {
    key: 'lastMonth',
    label: 'Last month',
    range: (n) => {
      const t = karachiDay(0, n);
      const y = Number(t.slice(0, 4));
      const m = Number(t.slice(5, 7));
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { from: `${ly}-${String(lm).padStart(2, '0')}-01`, to: lastDayOfMonth(ly, lm) };
    },
  },
  { key: 'year', label: 'This year', range: (n) => ({ from: `${karachiDay(0, n).slice(0, 4)}-01-01`, to: karachiDay(0, n) }) },
];

/** The report opens on "This month". */
export const defaultSsrRange = (now?: number) => SSR_PRESETS[4].range(now);

/** The preset whose range matches exactly (highlighted in the UI). */
export const activePresetKey = (r: SsrRange, now?: number) => SSR_PRESETS.find((p) => { const x = p.range(now); return x.from === r.from && x.to === r.to; })?.key;

/** Web: `from > to` disables the query and the export. String compare is right for `yyyy-mm-dd`. */
export const ssrRangeInvalid = (r: SsrRange) => r.from > r.to;

/** A drilldown invoice date, shown as the Pakistan day (dd/mm/yyyy) so it matches the report's day boundaries. */
export function karachiDateLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const [y, m, d] = new Date(t + KARACHI_OFFSET_MS).toISOString().slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
