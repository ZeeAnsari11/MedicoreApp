import { BranchOwnedEntity } from './base';
import { StockMovementType } from './enums';

/**
 * Append-only ledger entry for every batch quantity change (purchase receipt,
 * sale, transfer, manual adjustment). quantity is always positive — `type`
 * conveys direction. Same offline-creation profile as Batch: UUIDv7 id, soft
 * delete only (corrections are reversing entries, not edits).
 */
export interface StockMovement extends BranchOwnedEntity {
  productId: string;
  batchId: string;
  batchNumber?: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  referenceType?: 'PURCHASE' | 'SALE' | 'TRANSFER' | 'ADJUSTMENT';
  referenceId?: string;
  performedBy: string;
  performedByName?: string;
  deletedAt: string | null;
}
