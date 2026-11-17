import { PaymentMethod, ReturnCondition, ReturnReasonCode, ReturnSettlementMode } from '@/types/medicore';
import type { CreateSaleReturnRequest, Sale, SaleReturn } from '@/types/medicore';

export const REASON_LABELS: Record<ReturnReasonCode, string> = {
  [ReturnReasonCode.DAMAGED]: 'Damaged',
  [ReturnReasonCode.EXPIRED]: 'Expired',
  [ReturnReasonCode.WRONG_ITEM]: 'Wrong item',
  [ReturnReasonCode.EXCESS]: 'Excess',
  [ReturnReasonCode.OTHER]: 'Other',
};

export const CONDITION_LABELS: Record<ReturnCondition, string> = {
  [ReturnCondition.RESTOCK]: 'Restock',
  [ReturnCondition.DAMAGED]: 'Damaged',
  [ReturnCondition.EXPIRED]: 'Expired',
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Cash',
  [PaymentMethod.CARD]: 'Card',
  [PaymentMethod.CREDIT]: 'Credit',
  [PaymentMethod.BANK_TRANSFER]: 'Bank transfer',
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface ReturnRow {
  key: string;
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  original: number;
  returned: number;
  returnable: number;
}

/** One row per sold batch allocation with what has already come back, from the sale and its recorded returns. */
export function buildReturnRows(sale: Sale, returns: SaleReturn[]): ReturnRow[] {
  const returnedByBatch = new Map<string, number>();
  for (const ret of returns) for (const i of ret.items) for (const a of i.batchAllocations) returnedByBatch.set(a.batchId, (returnedByBatch.get(a.batchId) ?? 0) + a.quantity);
  return sale.items.flatMap((item) =>
    item.batchAllocations.map((a) => {
      const returned = returnedByBatch.get(a.batchId) ?? 0;
      return { key: a.batchId, productId: item.productId, productName: item.productName, batchId: a.batchId, batchNumber: a.batchNumber, original: a.quantity, returned, returnable: Math.max(round2(a.quantity - returned), 0) };
    }),
  );
}

export interface ReturnDraft {
  qty: Record<string, number>;
  condition: Record<string, ReturnCondition>;
  reasonCode: ReturnReasonCode;
  notes: string;
  mode: ReturnSettlementMode;
  method: PaymentMethod;
}

export const emptyReturnDraft = (): ReturnDraft => ({ qty: {}, condition: {}, reasonCode: ReturnReasonCode.OTHER, notes: '', mode: ReturnSettlementMode.ADJUST, method: PaymentMethod.CASH });

/** Same rule as the web: every ticked row must be 1..returnable (the backend re-checks against the real stock and balances). */
export function validateReturn(rows: ReturnRow[], qty: Record<string, number>): string | null {
  const ticked = rows.filter((r) => (qty[r.key] ?? 0) !== 0);
  if (ticked.length === 0) return 'Select at least one item to return';
  for (const r of ticked) {
    const q = qty[r.key];
    if (!Number.isFinite(q) || q < 1) return `${r.productName}: return quantity must be at least 1`;
    if (q > r.returnable + 0.0001) return `${r.productName}: only ${r.returnable} can still be returned`;
  }
  return null;
}

/**
 * Settlement is sent as a mode only; the backend splits the return value into what reduces the balance, what is refunded
 * and what becomes credit. REFUND also names how the money is paid out.
 */
export function buildReturnRequest(branchId: string, rows: ReturnRow[], draft: ReturnDraft, onlyTicked = true): CreateSaleReturnRequest {
  const chosen = rows.filter((r) => (onlyTicked ? (draft.qty[r.key] ?? 0) > 0 : r.returnable > 0));
  const qtyOf = (r: ReturnRow) => (onlyTicked ? draft.qty[r.key] : r.returnable);
  const byProduct = new Map<string, ReturnRow[]>();
  for (const r of chosen) byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
  return {
    saleId: '', // taken from the URL by the API
    branchId,
    reasonCode: draft.reasonCode,
    reason: REASON_LABELS[draft.reasonCode],
    notes: draft.notes.trim() || undefined,
    settlement: draft.mode === ReturnSettlementMode.REFUND ? { mode: ReturnSettlementMode.REFUND, method: draft.method } : { mode: ReturnSettlementMode.ADJUST },
    items: [...byProduct.entries()].map(([productId, list]) => ({
      productId,
      batchAllocations: list.map((r) => ({ batchId: r.batchId, quantity: qtyOf(r), condition: draft.condition[r.key] ?? ReturnCondition.RESTOCK })),
    })),
  };
}
