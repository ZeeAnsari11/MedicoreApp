import type { SsrReport, SsrRow } from '@/types/medicore';

export const money = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export interface SsrColumn {
  key: string;
  label: string;
  /** Server-side sort field; columns without one are not sortable. */
  sortKey?: string;
  /** Only with `report.canViewCost`. */
  cost?: boolean;
  /** Only when the report carries a comparison. */
  compare?: boolean;
  /** Emphasised (web: bold). */
  bold?: boolean;
  text: (r: SsrRow) => string;
}

/** Web `COLS` (ssr-table.tsx), same order and labels. */
export const SSR_COLUMNS: SsrColumn[] = [
  { key: 'pack', label: 'Pack', text: (r) => r.pack || '' },
  { key: 'rate', label: 'Rate', text: (r) => (r.rate === undefined ? '' : money(r.rate)) },
  { key: 'opening', label: 'Opening Qty', sortKey: 'opening', text: (r) => qty(r.opening) },
  { key: 'purchased', label: 'Pur Qty', sortKey: 'purchased', text: (r) => qty(r.purchased) },
  { key: 'totalStock', label: 'Total Stock', sortKey: 'totalStock', text: (r) => qty(r.totalStock) },
  { key: 'grossSale', label: 'Gross Sale', sortKey: 'grossSale', text: (r) => qty(r.grossSale) },
  { key: 'bonus', label: 'Bonus N. Sale', text: (r) => qty(r.bonus) },
  { key: 'netSale', label: 'Net Sale', sortKey: 'netSale', text: (r) => qty(r.netSale) },
  { key: 'netSaleValue', label: 'Net Sale Value', sortKey: 'netSaleValue', bold: true, text: (r) => money(r.netSaleValue) },
  { key: 'expBrk', label: 'Exp Brk', text: (r) => qty(r.expBrk) },
  { key: 'transferIn', label: 'Trnf IN', sortKey: 'transferIn', text: (r) => qty(r.transferIn) },
  { key: 'transferOut', label: 'Trnf OUT', sortKey: 'transferOut', text: (r) => qty(r.transferOut) },
  { key: 'closingQty', label: 'Closing Qty', sortKey: 'closingQty', text: (r) => qty(r.closingQty) },
  { key: 'closingValue', label: 'Closing Stock (TP)', sortKey: 'closingValue', text: (r) => money(r.closingValue) },
  { key: 'closingValueCp', label: 'Closing Stock (CP)', sortKey: 'closingValueCp', cost: true, text: (r) => money(r.closingValueCp) },
  { key: 'prevNetSales', label: 'Prev. net sales', sortKey: 'prevNetSales', compare: true, text: (r) => money(r.prevNetSales) },
  { key: 'changePct', label: 'Change', sortKey: 'changePct', compare: true, text: (r) => (r.changePct === null || r.changePct === undefined ? '-' : `${r.changePct >= 0 ? '▲' : '▼'} ${Math.abs(r.changePct)}%`) },
];

/** Columns that exist for this report (cost and comparison columns are conditional). */
export const reportColumns = (report: SsrReport) => SSR_COLUMNS.filter((c) => (!c.cost || report.canViewCost) && (!c.compare || report.totals.prevNetSales !== undefined));

export const FIRST_HEADER: Record<string, string> = { manufacturer: 'Manufacturer', vendor: 'Vendor', product: 'Product', grouped: 'Manufacturer / Vendor / Product' };

/** Web header click: a new column sorts descending first, the same column again flips a descending sort to ascending. */
export function nextSort(current: string, key: string): string {
  const [field, dir] = current.split(':');
  return `${key}:${field === key && dir === 'desc' ? 'asc' : 'desc'}`;
}
