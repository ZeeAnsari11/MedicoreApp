import { InventoryRollup } from './batch';

/**
 * Reports are always computed from source-of-truth data (Sale/Batch/
 * StockMovement/Product) on each request — nothing here is persisted.
 */

export interface SalesReportPoint {
  date: string;
  revenue: number;
  transactions: number;
}

export interface SalesReportTopProduct {
  productId: string;
  productName: string;
  revenue: number;
  quantity: number;
}

export interface SalesReportCategoryBreakdown {
  categoryName: string;
  revenue: number;
}

export interface SalesReportPaymentStatusBreakdown {
  paymentStatus: string;
  count: number;
  total: number;
}

export interface SalesReportSummary {
  totalRevenue: number;
  totalTransactions: number;
  averageOrderValue: number;
  totalTaxCollected: number;
  totalDiscountGiven: number;
}

export interface SalesReport {
  summary: SalesReportSummary;
  revenueTrend: SalesReportPoint[];
  topProducts: SalesReportTopProduct[];
  categoryBreakdown: SalesReportCategoryBreakdown[];
  paymentStatusBreakdown: SalesReportPaymentStatusBreakdown[];
}

/** One Order Booker's sales over a date range. Names only: ids never reach the UI. */
export interface OrderBookerReportRow {
  /** Used as a stable key and for filtering; never displayed. */
  orderBookerId: string;
  orderBookerName: string;
  totalSales: number;
  salesCount: number;
  returns: number;
  /** Sum of amount paid on the booker's sales in the range. */
  collected: number;
}

export interface OrderBookerReport {
  rows: OrderBookerReportRow[];
  totals: { totalSales: number; salesCount: number; returns: number; collected: number };
}

export interface InventoryReportSummary {
  totalItems: number;
  totalCostValue: number;
  totalRetailValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface InventoryReportCategoryBreakdown {
  categoryName: string;
  totalQuantity: number;
}

export interface InventoryReportMovementPoint {
  date: string;
  purchaseIn: number;
  saleOut: number;
  adjustment: number;
}

export interface InventoryReport {
  summary: InventoryReportSummary;
  items: InventoryRollup[];
  categoryBreakdown: InventoryReportCategoryBreakdown[];
  movementTrend: InventoryReportMovementPoint[];
}

export interface DashboardBranchRow {
  branchId: string;
  branchName: string;
  salesOrders: number;
  salesOrdersToday: number;
  salesAmount: number;
  salesAmountToday: number;
  purchaseOrders: number;
  purchaseOrdersToday: number;
}

/** Live headline numbers for the dashboard. Orders exclude cancelled purchases and voided sales. */
export interface DashboardSummary {
  totals: {
    salesOrders: number;
    salesOrdersToday: number;
    salesAmount: number;
    salesAmountToday: number;
    purchaseOrders: number;
    purchaseOrdersToday: number;
    /** Sales that are not fully paid. */
    openInvoices: number;
  };
  /** Tenant-wide, not split by branch. */
  catalog: {
    manufacturers: number;
    vendors: number;
    products: number;
    customers: number;
    branches: number;
  };
  branches: DashboardBranchRow[];
}
