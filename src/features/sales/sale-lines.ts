import { AllocationMode } from '@/types/medicore';
import type { Batch, CreateSaleItemRequest, Sale } from '@/types/medicore';

/**
 * A committed line on the New Sale form. `allocations` is only present when the user picked a specific batch (MANUAL);
 * without it the line is sent without `manualAllocations` and the backend allocates by FEFO.
 */
export interface SaleLine {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  /** False while the price is just the product's list price shown for reference: it is then left out so the backend prices the line. */
  priceExplicit: boolean;
  discountPercent?: number;
  taxPercent?: number;
  /** `expiryDate` is for display only (the request sends batch and quantity). */
  allocations?: { batchId: string; batchNumber: string; quantity: number; expiryDate?: string }[];
}

/** Batches that can still be sold: stock left and not expired, nearest expiry first. */
export function eligibleBatches(batches: Batch[], now = new Date()): Batch[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return batches
    .filter((b) => b.quantity > 0 && new Date(b.expiryDate) >= today)
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
}

/** Quantity already committed per batch by manual lines, optionally ignoring one line (the one being edited). */
export function usedByBatch(lines: SaleLine[], excludeKey?: string | null): Map<string, number> {
  const used = new Map<string, number>();
  for (const line of lines) {
    if (line.key === excludeKey) continue;
    for (const a of line.allocations ?? []) used.set(a.batchId, (used.get(a.batchId) ?? 0) + a.quantity);
  }
  return used;
}

/** Quantity committed to a product by FEFO lines (the backend picks their batches, so it counts against the product total). */
export function autoQuantityForProduct(lines: SaleLine[], productId: string, excludeKey?: string | null): number {
  return lines.filter((l) => l.key !== excludeKey && l.productId === productId && !l.allocations).reduce((s, l) => s + l.quantity, 0);
}

/** Adds quantity back to batches (an edited sale's original allocations count as available again). */
export function restoreStock(batches: Batch[], restore?: Map<string, number>): Batch[] {
  if (!restore || restore.size === 0) return batches;
  return batches.map((b) => ({ ...b, quantity: b.quantity + (restore.get(b.id) ?? 0) }));
}

/** Batches with committed quantity subtracted; fully used batches drop out. */
export function withRemainingStock(batches: Batch[], used: Map<string, number>): Batch[] {
  return batches.map((b) => ({ ...b, quantity: b.quantity - (used.get(b.id) ?? 0) })).filter((b) => b.quantity > 0);
}

export interface Allocation {
  batch: Batch;
  quantity: number;
}

/** Covers `quantity` from the chosen batch, then later-expiry batches, then earlier ones. `unmet` is what no batch could cover. */
export function allocateAcrossBatches(available: Batch[], startBatchId: string, quantity: number): { allocations: Allocation[]; unmet: number } {
  const start = Math.max(available.findIndex((b) => b.id === startBatchId), 0);
  const ordered = [...available.slice(start), ...available.slice(0, start)];
  const allocations: Allocation[] = [];
  let remaining = quantity;
  for (const batch of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    allocations.push({ batch, quantity: take });
    remaining -= take;
  }
  return { allocations, unmet: Math.max(remaining, 0) };
}

/**
 * Display-only estimate of a line (the web shows the same figure while entering lines). The backend recalculates every
 * total when the sale is saved and its figures are the ones shown afterwards.
 */
export function estimateLineTotal(line: Pick<SaleLine, 'quantity' | 'unitPrice' | 'discountPercent' | 'taxPercent'>): number {
  const subtotal = (line.quantity || 0) * (line.unitPrice || 0);
  const taxable = subtotal - subtotal * ((line.discountPercent || 0) / 100);
  return taxable + taxable * ((line.taxPercent || 0) / 100);
}

/** The backend refuses a net price below cost; the form warns early with the same comparison (to the paisa). */
export function belowCostFloor(unitPrice: number, discountPercent: number, cp: number): boolean {
  const net = unitPrice * (1 - (discountPercent || 0) / 100);
  return Math.round(net * 100) < Math.round(cp * 100);
}

/** Request items: manual lines carry their chosen batches, every other line is left to the backend's FEFO allocation. */
export function buildSaleItems(lines: SaleLine[]): CreateSaleItemRequest[] {
  return lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    ...(l.priceExplicit ? { unitPrice: l.unitPrice } : {}),
    discountPercent: l.discountPercent,
    taxPercent: l.taxPercent,
    ...(l.allocations ? { manualAllocations: l.allocations.map((a) => ({ batchId: a.batchId, quantity: a.quantity })) } : {}),
  }));
}

let seq = 0;
export const newLineKey = () => `line-${++seq}`;

/** Lines of an existing sale: manual items keep their batches, FEFO items stay FEFO. */
export function linesFromSale(sale: Sale): SaleLine[] {
  return sale.items.map((item) => ({
    key: newLineKey(),
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    priceExplicit: true,
    discountPercent: item.discountPercent,
    taxPercent: item.taxPercent,
    allocations: item.allocationMode === AllocationMode.MANUAL ? item.batchAllocations.map((a) => ({ batchId: a.batchId, batchNumber: a.batchNumber, quantity: a.quantity, expiryDate: a.expiryDate })) : undefined,
  }));
}

/** Original allocations of an edited sale, per batch: they count as available stock again while editing. */
export function restoreMapFromSale(sale: Sale): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of sale.items) for (const a of item.batchAllocations) map.set(a.batchId, (map.get(a.batchId) ?? 0) + a.quantity);
  return map;
}

export interface SaleDraftCheck {
  branchId: string | null;
  lines: SaleLine[];
  paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID';
  amountPaid?: string;
}

/** First problem the user can fix before sending; the backend still validates everything. */
export function validateSaleDraft({ branchId, lines, paymentStatus, amountPaid }: SaleDraftCheck): string | null {
  if (!branchId) return 'Select a branch';
  if (lines.length === 0) return 'Add at least one line item';
  if (paymentStatus === 'PARTIAL') {
    const n = Number(amountPaid);
    if (!amountPaid?.trim() || !(n > 0)) return 'Enter the amount paid for a partial payment';
  }
  return null;
}
