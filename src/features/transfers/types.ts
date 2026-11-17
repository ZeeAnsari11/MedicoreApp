/**
 * Stock transfers have no entry in `shared-types` (and no web UI), so these mirror the API's `StockTransfer` schema and
 * `CreateStockTransferDto` in apps/api/src/modules/inventory. The API returns the raw document: its id is `_id`.
 */
export interface StockTransferLine {
  productId: string;
  productName: string;
  /** Batch in the source branch. */
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  unitCost: number;
}

export interface StockTransfer {
  _id: string;
  tenantId: string;
  /** Source branch. */
  branchId: string;
  toBranchId: string;
  transferNumber: string;
  lines: StockTransferLine[];
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockTransferRequest {
  /** Required for admins; branch users are pinned to their own branch. */
  fromBranchId?: string;
  toBranchId: string;
  lines: { batchId: string; quantity: number }[];
  note?: string;
}
