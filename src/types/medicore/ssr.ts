/**
 * Secondary Sales Report types. The web declares these locally in `hooks/use-ssr.ts` (they are not in shared-types),
 * so they are copied field for field. Every figure is computed by the backend.
 */

export type SsrView = 'manufacturer' | 'vendor' | 'product' | 'grouped';

export interface SsrRow {
  key: string;
  label: string;
  kind: 'manufacturer' | 'vendor' | 'product' | 'batch' | 'customer';
  unitsSold: number;
  unitsReturned: number;
  netUnits: number;
  gross: number;
  discounts: number;
  returnsValue: number;
  netSales: number;
  tax: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
  avgPrice: number | null;
  closingStock: number;
  voidedUnits: number;
  voidedValue: number;
  invoices: number;
  customers: number;
  opening: number;
  purchased: number;
  purchaseValue: number;
  totalStock: number;
  grossSale: number;
  bonus: number;
  netSale: number;
  netSaleValue: number;
  expBrk: number;
  transferIn: number;
  transferOut: number;
  closingQty: number;
  closingValue: number;
  closingValueCp: number;
  /** Product rows only. */
  pack?: string;
  rate?: number;
  prevNetSales?: number | null;
  changePct?: number | null;
  children?: SsrRow[];
  batches?: SsrRow[];
  customerRows?: SsrRow[];
}

export interface SsrReport {
  view: SsrView;
  from: string;
  to: string;
  returnsAttribution: 'RETURN_DATE' | 'SALE_DATE';
  canViewCost: boolean;
  totals: SsrRow;
  summary: {
    netSales: number;
    netUnits: number;
    returnsValue: number;
    grossProfit: number | null;
    marginPct: number | null;
    topManufacturer: { label: string; netSales: number } | null;
    topProduct: { label: string; netSales: number } | null;
    prevNetSales?: number | null;
    changePct?: number | null;
  };
  chart: {
    manufacturers: { label: string; netSales: number; netUnits: number }[];
    products: { label: string; netSales: number; netUnits: number }[];
  };
  rows: SsrRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  warnings: string[];
}

export interface SsrInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  voided: boolean;
  unitsSold: number;
  value: number;
  unitsReturned: number;
  returnsValue: number;
  batches: { batchNumber: string; quantity: number }[];
}
