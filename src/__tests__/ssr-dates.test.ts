import { activePresetKey, defaultSsrRange, karachiDateLabel, karachiDay, SSR_PRESETS, ssrRangeInvalid } from '@/features/ssr/ssr-dates';
import { nextSort } from '@/features/ssr/ssr-columns';

const at = (iso: string) => new Date(iso).getTime();
const preset = (key: string, now: number) => SSR_PRESETS.find((p) => p.key === key)!.range(now);

describe('Pakistan-time days (UTC+5, no DST)', () => {
  it('rolls to the next Pakistan day at 19:00 UTC, whatever the device zone is', () => {
    expect(karachiDay(0, at('2026-11-16T18:59:59Z'))).toBe('2026-11-16');
    expect(karachiDay(0, at('2026-11-16T19:00:00Z'))).toBe('2026-11-17');
    expect(karachiDay(-1, at('2026-11-16T19:00:00Z'))).toBe('2026-11-16');
  });

  it('builds every preset exactly like the web', () => {
    const now = at('2026-11-16T10:00:00Z');
    expect(preset('today', now)).toEqual({ from: '2026-11-16', to: '2026-11-16' });
    expect(preset('yesterday', now)).toEqual({ from: '2026-11-15', to: '2026-11-15' });
    expect(preset('7d', now)).toEqual({ from: '2026-11-10', to: '2026-11-16' });
    expect(preset('30d', now)).toEqual({ from: '2026-10-18', to: '2026-11-16' });
    expect(preset('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-16' });
    expect(preset('lastMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(preset('year', now)).toEqual({ from: '2026-01-01', to: '2026-11-16' });
    expect(SSR_PRESETS.map((p) => p.label)).toEqual(['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This year']);
  });

  it('last month wraps over the year boundary and handles leap February', () => {
    expect(preset('lastMonth', at('2026-01-10T10:00:00Z'))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(preset('lastMonth', at('2028-03-10T10:00:00Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('opens on This month and highlights the preset whose range matches exactly', () => {
    const now = at('2026-11-16T10:00:00Z');
    expect(defaultSsrRange(now)).toEqual({ from: '2026-11-01', to: '2026-11-16' });
    expect(activePresetKey({ from: '2026-11-01', to: '2026-11-16' }, now)).toBe('month');
    expect(activePresetKey({ from: '2026-11-02', to: '2026-11-16' }, now)).toBeUndefined();
  });

  it('flags a reversed range and formats a drilldown date as the Pakistan day', () => {
    expect(ssrRangeInvalid({ from: '2026-11-17', to: '2026-11-16' })).toBe(true);
    expect(ssrRangeInvalid({ from: '2026-11-16', to: '2026-11-16' })).toBe(false);
    expect(karachiDateLabel('2026-11-16T20:00:00.000Z')).toBe('17/11/2026');
    expect(karachiDateLabel('nope')).toBe('');
  });
});

describe('sorting', () => {
  it('a new column sorts descending first; the same column flips desc to asc and back', () => {
    expect(nextSort('netSaleValue:desc', 'opening')).toBe('opening:desc');
    expect(nextSort('netSaleValue:desc', 'netSaleValue')).toBe('netSaleValue:asc');
    expect(nextSort('netSaleValue:asc', 'netSaleValue')).toBe('netSaleValue:desc');
  });
});
