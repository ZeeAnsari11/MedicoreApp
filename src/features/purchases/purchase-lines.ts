import { isValidIsoDate, toIsoDate } from '@/lib/dates';
import { parseNumber } from '@/lib/numbers';
import { PaymentStatus, type CreatePurchaseItemRequest, type Purchase } from '@/types/medicore';

/** One purchase line as typed in the form (text fields; parsed only when validating or sending). */
export interface PurchaseLine {
  key: string;
  productId: string;
  productName: string;
  batchNumber: string;
  /** YYYY-MM-DD */
  expiryDate: string;
  quantity: string;
  purchasePrice: string;
  sellingPrice: string;
  discountPercent: string;
  taxPercent: string;
}

const EPS = 0.01;
let counter = 0;
export const newLineKey = () => `pl-${Date.now()}-${counter++}`;

export const emptyLine = (): PurchaseLine => ({
  key: newLineKey(),
  productId: '',
  productName: '',
  batchNumber: '',
  expiryDate: '',
  quantity: '',
  purchasePrice: '',
  sellingPrice: '',
  discountPercent: '',
  taxPercent: '',
});

const num = (v: string) => parseNumber(v) ?? 0;
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Display only (web `purchase-line-utils`): qty × price × (1 − disc%) × (1 + tax%). The backend computes the real totals. */
export const estimateLineTotal = (l: Pick<PurchaseLine, 'quantity' | 'purchasePrice' | 'discountPercent' | 'taxPercent'>) =>
  num(l.quantity) * num(l.purchasePrice) * (1 - num(l.discountPercent) / 100) * (1 + num(l.taxPercent) / 100);

export const estimateGrandTotal = (lines: readonly PurchaseLine[]) => lines.reduce((sum, l) => sum + estimateLineTotal(l), 0);

/** Today's local calendar date, the same basis as the web `todayIso()`. */
export const todayIso = () => toIsoDate(new Date());

/** Web `purchase-entry-row` validation, same messages. Returns every problem (the web joins them with " · "). */
export function lineProblems(l: PurchaseLine, today = todayIso()): string[] {
  const problems: string[] = [];
  if (!l.productId) problems.push('Select a product');
  if (!l.batchNumber.trim()) problems.push('Batch # is required');
  if (!l.expiryDate.trim()) problems.push('Expiry is required');
  else if (l.expiryDate < today) problems.push('Expiry cannot be in the past');
  const qty = parseNumber(l.quantity);
  if (qty === null || !(qty > 0)) problems.push('Qty must be greater than 0');
  const price = parseNumber(l.purchasePrice);
  if (price === null || price < 0) problems.push('Price must be 0 or more');
  const sale = parseNumber(l.sellingPrice);
  if (sale === null || sale < 0) problems.push('Sale price must be 0 or more');
  const disc = l.discountPercent.trim() === '' ? 0 : parseNumber(l.discountPercent);
  if (disc === null || disc < 0 || disc > 100) problems.push('Disc % must be 0-100');
  const tax = l.taxPercent.trim() === '' ? 0 : parseNumber(l.taxPercent);
  if (tax === null || tax < 0 || tax > 100) problems.push('Tax % must be 0-100');
  return problems;
}

export const lineError = (l: PurchaseLine, today = todayIso()) => lineProblems(l, today).join(' · ') || null;

export interface PurchaseDraft {
  vendorId: string;
  purchaseDate: string;
  lines: readonly PurchaseLine[];
}

/** First problem that blocks submitting, or null. Business rules beyond these (vendor links, stock, numbering) are the backend's. */
export function validatePurchaseDraft(d: PurchaseDraft, today = todayIso()): string | null {
  if (!d.vendorId) return 'Select a vendor before receiving this purchase.';
  if (!d.purchaseDate.trim()) return 'Purchase date is required';
  if (!isValidIsoDate(d.purchaseDate)) return 'Enter a valid purchase date as YYYY-MM-DD';
  if (d.lines.length === 0) return 'Add at least one line';
  for (const l of d.lines) {
    const e = lineError(l, today);
    if (e) return `${l.productName || 'A line'}: ${e}`;
  }
  return null;
}

/** Request lines; only validated lines should be passed. */
export function buildPurchaseItems(lines: readonly PurchaseLine[]): CreatePurchaseItemRequest[] {
  return lines.map((l) => ({
    productId: l.productId,
    batchNumber: l.batchNumber.trim(),
    expiryDate: l.expiryDate.trim(),
    quantity: num(l.quantity),
    purchasePrice: num(l.purchasePrice),
    sellingPrice: num(l.sellingPrice),
    ...(l.discountPercent.trim() !== '' ? { discountPercent: num(l.discountPercent) } : {}),
    ...(l.taxPercent.trim() !== '' ? { taxPercent: num(l.taxPercent) } : {}),
  }));
}

export interface PriceChangeRow {
  productId: string;
  productName: string;
  oldPrice: number;
  newPrice: number;
}

/**
 * Web `price-change-dialog`: for each product, the highest purchase price entered; if it is below the vendor link's
 * current price the user decides whether to update it. Increases are applied by the backend without asking.
 */
export function buildPriceChangeRows(lines: readonly PurchaseLine[], linkPrices: ReadonlyMap<string, number>): PriceChangeRow[] {
  const highest = new Map<string, { name: string; price: number }>();
  for (const l of lines) {
    const price = parseNumber(l.purchasePrice);
    if (!l.productId || price === null) continue;
    const cur = highest.get(l.productId);
    if (!cur || price > cur.price) highest.set(l.productId, { name: l.productName, price });
  }
  const rows: PriceChangeRow[] = [];
  for (const [productId, { name, price }] of highest) {
    const old = linkPrices.get(productId);
    if (old !== undefined && price < old) rows.push({ productId, productName: name, oldPrice: old, newPrice: price });
  }
  return rows;
}

/** Amount actually owed: grand total − returned − (paid − refunded), never negative (backend `outstanding`). */
export const outstandingOf = (p: Pick<Purchase, 'grandTotal' | 'amountPaid' | 'returnedTotal' | 'refundedTotal'>) =>
  Math.max(round2(p.grandTotal - (p.returnedTotal ?? 0) - (p.amountPaid - (p.refundedTotal ?? 0))), 0);

/** Web client guard for "Record payment": amount > 0 and no more than the outstanding balance. */
export function paymentProblem(amountText: string, outstanding: number): string | null {
  const amount = parseNumber(amountText);
  if (amount === null || !(amount > 0)) return 'Enter an amount greater than 0';
  if (amount > outstanding + EPS) return `Amount cannot exceed the outstanding ${outstanding.toFixed(2)}.`;
  return null;
}

/** Create-form payment amount when the status changes: PAID fills the total, UNPAID is 0 (web effect). */
export const amountForStatus = (status: PaymentStatus, grandTotal: number, current: string) =>
  status === PaymentStatus.PAID ? String(round2(grandTotal)) : status === PaymentStatus.UNPAID ? '0' : current;

/** Lines for the edit form from a loaded purchase (expiry sliced to the date, as the web does). */
export const linesFromPurchase = (p: Purchase): PurchaseLine[] =>
  p.items.map((i) => ({
    key: newLineKey(),
    productId: i.productId,
    productName: i.productName ?? '',
    batchNumber: i.batchNumber,
    expiryDate: i.expiryDate.slice(0, 10),
    quantity: String(i.quantity),
    purchasePrice: String(i.purchasePrice),
    sellingPrice: String(i.sellingPrice),
    discountPercent: i.discountPercent ? String(i.discountPercent) : '',
    taxPercent: i.taxPercent ? String(i.taxPercent) : '',
  }));

/** Web `paymentDateTime`: the chosen local day combined with the current local time of day, as an ISO string. */
export function paymentDateTime(day: string, now = new Date()): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}
