/**
 * Cash Receipt sheet logic, ported from the web page (`sales/cash-receipt/page.tsx`). Display-side only: the backend
 * re-validates every row against the live invoice, posts the payments and numbers the voucher.
 */
import { PaymentMethod, type CashReceiptRowError, type CashTransaction, type LookupInvoice, type UpdateCashTransactionRequest } from '@/types/medicore';

export type { CashReceiptRowError, LookupInvoice };

export interface SheetRow {
  key: string;
  /** Set for an entry loaded from a saved transaction; absent for a row added in this session. */
  entryId?: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  /** Customer balance as looked up when the first row of that customer was added. */
  customerBalance: number;
  saleDate: string;
  voucherAmount: number;
  received: number;
  balance: number;
  amount: string;
  error?: string;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** `1,234.50`: the web's `money()`. */
export const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Local calendar day, `YYYY-MM-DD` (the web sends the browser's today). */
export const todayLocal = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function amountError(raw: string, balance: number): string | undefined {
  const n = Number(raw);
  if (raw.trim() === '' || Number.isNaN(n) || n <= 0) return 'Enter an amount greater than 0';
  if (round2(n) !== n && Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return 'Max 2 decimals';
  if (n > balance + 0.005) return `Cannot exceed the balance of ${money(balance)}`;
  return undefined;
}

/** Idempotency key for one sheet (`batchId` must be a UUID). Only needs to be unique, not secret. */
export function newBatchId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let counter = 0;
export const newRowKey = () => `row-${Date.now().toString(36)}-${counter++}`;

export type AddRowResult = { ok: true; row: SheetRow } | { ok: false; error: string };

/** The web's "Add" step: validates the selected invoice + amount and builds the sheet row. */
export function buildRow(selected: LookupInvoice | null, amountInput: string, rows: readonly SheetRow[]): AddRowResult {
  if (!selected) return { ok: false, error: 'Select a voucher first' };
  if (rows.some((r) => r.invoiceId === selected.id)) return { ok: false, error: 'Already in sheet' };
  if (!selected.payable) return { ok: false, error: 'Already paid' };
  const error = amountError(amountInput, selected.balance);
  if (error) return { ok: false, error };
  return {
    ok: true,
    row: {
      key: newRowKey(),
      invoiceId: selected.id,
      invoiceNumber: selected.invoiceNumber,
      customerId: selected.customerId,
      customerName: selected.customerName,
      customerBalance: selected.customerBalance,
      saleDate: selected.saleDate,
      voucherAmount: selected.netTotal,
      received: selected.received,
      balance: selected.balance,
      amount: amountInput,
    },
  };
}

/** Customer balance before and after each row: the base balance minus the amounts entered in rows above for the same customer. */
export function runningBalances(rows: readonly SheetRow[]): { custBal: number; finalBal: number }[] {
  const entered = new Map<string, number>();
  const base = new Map<string, number>();
  return rows.map((r) => {
    if (!base.has(r.customerId)) base.set(r.customerId, r.customerBalance);
    const before = round2(base.get(r.customerId)! - (entered.get(r.customerId) ?? 0));
    const amt = Number(r.amount) || 0;
    entered.set(r.customerId, (entered.get(r.customerId) ?? 0) + amt);
    return { custBal: before, finalBal: round2(before - amt) };
  });
}

/** The "Account Balance" tile for the selected invoice's customer, net of what the sheet already receipts from them. */
export function accountBalance(selected: LookupInvoice | null, rows: readonly SheetRow[]): number | null {
  if (!selected) return null;
  const first = rows.find((r) => r.customerId === selected.customerId);
  const base = first ? first.customerBalance : selected.customerBalance;
  const entered = rows.filter((r) => r.customerId === selected.customerId).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return round2(base - entered);
}

export const sheetTotal = (rows: readonly SheetRow[]) => round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));

/** Validates every row; returns the rows with `error` set and whether any failed. */
export function validateRows(rows: readonly SheetRow[]): { rows: SheetRow[]; hasErrors: boolean } {
  const checked = rows.map((r) => ({ ...r, error: r.error === VOIDED_REASON ? VOIDED_REASON : amountError(r.amount, r.balance) }));
  return { rows: checked, hasErrors: checked.some((r) => r.error) };
}

export function buildSaveRequest(rows: readonly SheetRow[], batchId: string, now = new Date()) {
  return { batchId, date: todayLocal(now), method: PaymentMethod.CASH, rows: rows.map((r) => ({ invoiceId: r.invoiceId, amount: Number(r.amount) })) };
}

/** Shown on a loaded entry whose payment was voided elsewhere; it can only be removed. */
export const VOIDED_REASON = 'Its payment was voided elsewhere; remove this entry';

/** A saved transaction as sheet rows. `balance` is the most an entry can be set to (what is still owed plus its own amount). */
export const rowsOfTransaction = (tx: CashTransaction): SheetRow[] =>
  tx.rows.map((r) => ({
    key: r.entryId,
    entryId: r.entryId,
    invoiceId: r.invoiceId,
    invoiceNumber: r.invoiceNumber,
    customerId: r.customerId,
    customerName: r.customerName,
    customerBalance: r.customerBalance,
    saleDate: r.saleDate,
    voucherAmount: r.voucherAmount,
    received: r.received,
    balance: r.balance,
    amount: String(r.amount),
    error: r.paymentVoided ? VOIDED_REASON : undefined,
  }));

/** `T-0001`, `t-1` and `1` all mean the same transaction; anything else is not a transaction number. */
export function normalizeTransactionNumber(raw: string): string | null {
  const m = /^(?:t-?)?(\d{1,9})$/i.exec(raw.trim());
  return m ? `T-${m[1].padStart(4, '0')}` : null;
}

/** Rows with an `entryId` update their entry, the others are added, and loaded entries left out are removed. */
export const buildUpdateRequest = (rows: readonly SheetRow[], expectedVersion: number): UpdateCashTransactionRequest => ({
  expectedVersion,
  rows: rows.map((r) => ({ entryId: r.entryId, invoiceId: r.invoiceId, amount: Number(r.amount) })),
});

/** Maps the server's per-row reasons onto the sheet (rows without a reason lose their old error). */
export const applyRowErrors = (rows: readonly SheetRow[], errors: readonly CashReceiptRowError[]): SheetRow[] =>
  rows.map((r) => ({ ...r, error: errors.find((e) => e.invoiceId === r.invoiceId)?.reason }));

/** Failing rows from a rejected save (400 with `errors[]`), if the error body carries them. */
export function rowErrorsOf(body: unknown): CashReceiptRowError[] {
  const errors = (body as { errors?: unknown } | undefined)?.errors;
  return Array.isArray(errors) ? (errors as CashReceiptRowError[]) : [];
}

export interface SheetDraft {
  rows: SheetRow[];
  batchId: string;
  branchId: string | null;
}

export const serializeDraft = (draft: SheetDraft) => JSON.stringify(draft);

/** Reads a stored draft defensively; anything malformed is ignored. */
export function parseDraft(raw: string | null): SheetDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<SheetDraft>;
    if (!d || !Array.isArray(d.rows) || d.rows.length === 0 || typeof d.batchId !== 'string') return null;
    return { rows: d.rows.map((r) => ({ ...r, error: undefined })), batchId: d.batchId, branchId: typeof d.branchId === 'string' ? d.branchId : null };
  } catch {
    return null;
  }
}

/** Per tenant and user, so a shared device never shows one user's unsaved sheet to another. */
export const draftKey = (tenantId: string, userId: string) => `cash-receipt-sheet:${tenantId}:${userId}`;
