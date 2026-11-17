import { parseNumber } from '@/lib/numbers';
import {
  PaymentMethod,
  ReturnReasonCode,
  ReturnSettlementMode,
  ReturnStatus,
  type CreatePurchaseReturnRequest,
  type Purchase,
  type PurchaseReturn,
} from '@/types/medicore';

import { outstandingOf, round2 } from './purchase-lines';

/** Web `use-return-mode` labels. */
export const REASON_LABELS: Record<ReturnReasonCode, string> = {
  [ReturnReasonCode.DAMAGED]: 'Damaged',
  [ReturnReasonCode.EXPIRED]: 'Expired',
  [ReturnReasonCode.WRONG_ITEM]: 'Wrong item',
  [ReturnReasonCode.EXCESS]: 'Excess',
  [ReturnReasonCode.OTHER]: 'Other',
};

/** Refund methods the web offers (Credit exists in the enum but is not offered). */
export const REFUND_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: PaymentMethod.CASH, label: 'Cash' },
  { value: PaymentMethod.CARD, label: 'Card' },
  { value: PaymentMethod.BANK_TRANSFER, label: 'Bank transfer' },
];

export const RETURN_QTY_MESSAGE = 'Return quantities must be between 1 and what can still be returned.';

const TOLERANCE = 0.0001;

export interface PurchaseReturnRow {
  /** batchId (a purchase line is one batch). */
  key: string;
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  returned: number;
  returnable: number;
  /** lineTotal / quantity: the original price per unit, tax and discount included. */
  unitAmount: number;
}

/** Rows of the return table: each purchase line minus what earlier returns already took from its batch. */
export function buildPurchaseReturnRows(purchase: Purchase, returns: readonly PurchaseReturn[]): PurchaseReturnRow[] {
  const returnedByBatch = new Map<string, number>();
  for (const r of returns) for (const i of r.items) returnedByBatch.set(i.batchId, (returnedByBatch.get(i.batchId) ?? 0) + i.quantity);
  return purchase.items
    .filter((i) => !!i.batchId)
    .map((i) => {
      const returned = returnedByBatch.get(i.batchId!) ?? 0;
      return {
        key: i.batchId!,
        productId: i.productId,
        productName: i.productName ?? '',
        batchId: i.batchId!,
        batchNumber: i.batchNumber,
        quantity: i.quantity,
        returned,
        returnable: Math.max(round2(i.quantity - returned), 0),
        unitAmount: i.quantity > 0 ? i.lineTotal / i.quantity : 0,
      };
    });
}

/** Ticked rows with a quantity; unticked rows count as 0. */
export type ReturnQuantities = Readonly<Record<string, string>>;
export const tickedQuantity = (row: PurchaseReturnRow, ticked: ReadonlySet<string>, qty: ReturnQuantities) =>
  ticked.has(row.key) ? (parseNumber(qty[row.key]) ?? 0) : 0;

/** True when any ticked quantity is below 1 or above what can still be returned. */
export const returnQuantitiesInvalid = (rows: readonly PurchaseReturnRow[], ticked: ReadonlySet<string>, qty: ReturnQuantities) =>
  rows.some((r) => {
    if (!ticked.has(r.key)) return false;
    const q = parseNumber(qty[r.key]) ?? 0;
    return q < 1 || q > r.returnable + TOLERANCE;
  });

export interface ReturnFigures {
  returnTotal: number;
  outstanding: number;
  applied: number;
  excess: number;
  refund: number;
  newNet: number;
  newPaid: number;
  newOutstanding: number;
}

/** Display only (web `use-return-mode`): the backend computes the real settlement. */
export function returnFigures(purchase: Purchase, rows: readonly PurchaseReturnRow[], ticked: ReadonlySet<string>, qty: ReturnQuantities, mode: ReturnSettlementMode): ReturnFigures {
  const returnTotal = round2(rows.reduce((sum, r) => sum + tickedQuantity(r, ticked, qty) * r.unitAmount, 0));
  const outstanding = outstandingOf(purchase);
  const applied = Math.min(returnTotal, outstanding);
  const excess = round2(returnTotal - applied);
  const refund = mode === ReturnSettlementMode.REFUND ? excess : 0;
  const returned = purchase.returnedTotal ?? 0;
  const refunded = purchase.refundedTotal ?? 0;
  return {
    returnTotal,
    outstanding,
    applied,
    excess,
    refund,
    newNet: round2(purchase.grandTotal - returned - returnTotal),
    newPaid: round2(purchase.amountPaid - refunded - refund),
    newOutstanding: round2(outstanding - applied),
  };
}

export function settlementFootnote(mode: ReturnSettlementMode, f: Pick<ReturnFigures, 'excess' | 'refund'>, fmt: (n: number) => string): string {
  if (f.excess <= 0) return 'Adjusted against the outstanding balance.';
  if (mode === ReturnSettlementMode.REFUND) return `Adjusted against outstanding; ${fmt(f.refund)} refunded now.`;
  return `Adjusted against outstanding; excess ${fmt(f.excess)} becomes vendor credit.`;
}

export interface ReturnChoices {
  reasonCode: ReturnReasonCode;
  notes: string;
  mode: ReturnSettlementMode;
  method: PaymentMethod;
}

export const defaultReturnChoices = (): ReturnChoices => ({
  reasonCode: ReturnReasonCode.OTHER,
  notes: '',
  mode: ReturnSettlementMode.ADJUST,
  method: PaymentMethod.CASH,
});

/** Rows a full return takes: everything still returnable, at its returnable quantity. */
export const fullReturnSelection = (rows: readonly PurchaseReturnRow[]) => {
  const selectable = rows.filter((r) => r.returnable > 0);
  return { ticked: new Set(selectable.map((r) => r.key)), qty: Object.fromEntries(selectable.map((r) => [r.key, String(r.returnable)])) as Record<string, string> };
};

/**
 * Request body exactly as the web sends it: the purchase's branch, reason code plus its label, optional notes, and
 * `{mode, method}` only when money is actually refunded (otherwise plain ADJUST). `returnDate` is left to the server.
 */
export function buildPurchaseReturnRequest(
  purchase: Purchase,
  rows: readonly PurchaseReturnRow[],
  ticked: ReadonlySet<string>,
  qty: ReturnQuantities,
  choices: ReturnChoices,
  refund: number,
): CreatePurchaseReturnRequest {
  return {
    purchaseId: purchase.id,
    branchId: purchase.branchId,
    reasonCode: choices.reasonCode,
    reason: REASON_LABELS[choices.reasonCode],
    notes: choices.notes.trim() || undefined,
    settlement: refund > 0 ? { mode: choices.mode, method: choices.method } : { mode: ReturnSettlementMode.ADJUST },
    items: rows.filter((r) => tickedQuantity(r, ticked, qty) > 0).map((r) => ({ productId: r.productId, batchId: r.batchId, quantity: tickedQuantity(r, ticked, qty) })),
  };
}

/** Web `canReturn`: not cancelled, not fully returned, and the user may return. */
export const canReturnPurchase = (purchase: Pick<Purchase, 'status' | 'returnStatus'>, mayReturn: boolean) =>
  mayReturn && purchase.status !== 'CANCELLED' && purchase.returnStatus !== ReturnStatus.FULL;
