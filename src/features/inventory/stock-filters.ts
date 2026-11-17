import type { InventoryRollup } from '@/types/medicore';

export type StockFilter = 'all' | 'in-stock' | 'low' | 'out' | 'expired' | 'expiring';

export const STOCK_FILTERS: { value: StockFilter; label: string }[] = [
  { value: 'all', label: 'All stock' },
  { value: 'in-stock', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'expired', label: 'Has expired stock' },
  { value: 'expiring', label: 'Expiring in 30 days' },
];

const DAY_MS = 86_400_000;

/** Same rules as the web inventory page's stock-status Select (the flags themselves come from the backend rollup). */
export function matchesStockFilter(r: InventoryRollup, filter: StockFilter, now = Date.now()): boolean {
  switch (filter) {
    case 'in-stock':
      return r.totalQuantity > 0;
    case 'low':
      return r.isLowStock;
    case 'out':
      return r.totalQuantity <= 0;
    case 'expired':
      return !!r.expiredQuantity;
    case 'expiring': {
      if (!r.nearestExpiryDate) return false;
      const days = (new Date(r.nearestExpiryDate).getTime() - now) / DAY_MS;
      return days >= 0 && days <= 30;
    }
    default:
      return true;
  }
}
