import { parseNumber } from '@/lib/numbers';

import type { CreateStockTransferRequest } from './types';

export const NOTE_MAX = 300;

/** A line being assembled on the form, with the facts shown to the user (the backend re-checks everything). */
export interface TransferLineDraft {
  batchId: string;
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  /** Quantity the batch held when it was picked; a hint only, the backend enforces the real stock. */
  available: number;
  quantity: string;
}

/** null when the quantity is acceptable. The DTO allows positive numbers with at most 3 decimals. */
export function validateLineQuantity(value: string, available: number): string | null {
  const n = parseNumber(value);
  if (n === null) return 'Enter a quantity';
  if (n <= 0) return 'Must be greater than 0';
  if (Math.round(n * 1000) / 1000 !== n) return 'At most 3 decimal places';
  if (n > available) return `Only ${available} in stock in this batch`;
  return null;
}

export interface TransferHeader {
  fromBranchId: string;
  toBranchId: string;
  note: string;
}

/** First problem with the whole transfer, or null. */
export function validateTransfer(header: TransferHeader, lines: TransferLineDraft[]): string | null {
  if (!header.fromBranchId) return 'Select the source branch';
  if (!header.toBranchId) return 'Select the destination branch';
  if (header.fromBranchId === header.toBranchId) return 'Source and destination branch must differ';
  if (header.note.length > NOTE_MAX) return `Note must be at most ${NOTE_MAX} characters`;
  if (lines.length === 0) return 'Add at least one batch to transfer';
  for (const l of lines) {
    const problem = validateLineQuantity(l.quantity, l.available);
    if (problem) return `${l.productName} (${l.batchNumber}): ${problem}`;
  }
  return null;
}

export function buildTransfer(header: TransferHeader, lines: TransferLineDraft[]): CreateStockTransferRequest {
  return {
    fromBranchId: header.fromBranchId,
    toBranchId: header.toBranchId,
    lines: lines.map((l) => ({ batchId: l.batchId, quantity: parseNumber(l.quantity) as number })),
    note: header.note.trim() ? header.note.trim() : undefined,
  };
}
