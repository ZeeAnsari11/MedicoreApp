import { BranchOwnedEntity } from './base';

/**
 * Every unit of stock belongs to a batch (lot number + expiry date). A
 * product's total stock is a sum across its batches — see docs/domain-model.md.
 * Offline-creatable (received via Purchase, which may run at a branch without
 * connectivity), so it uses a client-generatable UUIDv7 id and soft delete
 * rather than a server-assigned ObjectId and hard delete.
 */
export interface Batch extends BranchOwnedEntity {
  productId: string;
  productName?: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice?: number;
  receivedAt: string;
  purchaseId?: string;
  deletedAt: string | null;
}

export interface CreateBatchAdjustmentRequest {
  productId: string;
  branchId?: string;
  batchNumber: string;
  expiryDate: string;
  operation: 'add' | 'subtract' | 'set';
  quantity: number;
  purchasePrice?: number;
  sellingPrice?: number;
  reason?: string;
}

/** Product-level rollup: total stock across all of a product's batches at a branch. */
export interface InventoryRollup {
  productId: string;
  productName: string;
  unit: string;
  barcode?: string;
  totalQuantity: number;
  minStockLevel?: number;
  isLowStock: boolean;
  nearestExpiryDate?: string;
  /** Units on hand in batches already past expiry. */
  expiredQuantity?: number;
}
