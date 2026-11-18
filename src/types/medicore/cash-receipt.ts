import type { PaymentMethod } from './enums';

/** An invoice found by the cash-receipt lookup; `payable` is false once nothing is owed. */
export interface LookupInvoice {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  customerId: string;
  customerName: string;
  grandTotal: number;
  netTotal: number;
  received: number;
  balance: number;
  payable: boolean;
  customerBalance: number;
}

export interface CashReceiptRowInput {
  invoiceId: string;
  amount: number;
  method?: PaymentMethod;
  reference?: string;
}

export interface CashReceiptRequest {
  batchId: string;
  date: string;
  method: PaymentMethod;
  rows: CashReceiptRowInput[];
}

export interface CashReceiptRowError {
  invoiceId: string;
  reason: string;
}

export interface CashReceiptResult {
  id: string;
  voucherNumber: string;
  /** Per-tenant `T-0001`; absent only for a receipt saved before transactions existed and not yet migrated. */
  transactionNumber?: string;
  version?: number;
  date: string;
  method: PaymentMethod;
  count: number;
  total: number;
  rows: Array<{
    entryId?: string;
    invoiceId: string;
    invoiceNumber: string;
    customerName: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
  }>;
}

/**
 * One entry of a loaded transaction, with the invoice as it is now. `received` leaves out this entry's own amount and
 * `balance` is the most this entry can be set to (the live outstanding plus its own amount), so the sheet's usual
 * Cust. Bal. / Final Bal. arithmetic works unchanged.
 */
export interface CashTransactionRow {
  entryId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  saleDate: string;
  /** Customer balance before this transaction's entries (live balance plus this transaction's amounts for them). */
  customerBalance: number;
  voucherAmount: number;
  received: number;
  balance: number;
  amount: number;
  /** The entry's payment was voided elsewhere; it can no longer be edited here. */
  paymentVoided: boolean;
}

export interface CashTransaction {
  id: string;
  transactionNumber: string;
  voucherNumber: string;
  branchId: string;
  version: number;
  date: string;
  method: PaymentMethod;
  total: number;
  rows: CashTransactionRow[];
}

/** Rows with an `entryId` are updated, rows without are added, and stored entries missing from the list are removed. */
export interface UpdateCashTransactionRequest {
  expectedVersion: number;
  date?: string;
  rows: Array<{ entryId?: string; invoiceId: string; amount: number }>;
}

export interface CashTransactionHistoryEntry {
  id: string;
  version: number;
  actorId: string;
  at: string;
  changes: Array<{
    entryId: string;
    op: 'ADDED' | 'CHANGED' | 'REMOVED';
    invoiceId: string;
    invoiceNumber: string;
    before: { amount: number; date?: string } | null;
    after: { amount: number; date?: string } | null;
  }>;
}

/** One row of the transactions list. */
export interface CashTransactionSummary {
  id: string;
  transactionNumber: string;
  voucherNumber: string;
  branchId: string;
  date: string;
  /** Number of entries (invoices receipted). */
  count: number;
  total: number;
  /** Distinct customer names across the entries. */
  customers: string[];
  version: number;
  /** When it was last edited, or null if it never was. */
  editedAt: string | null;
}

export interface PaginatedCashTransactions {
  items: CashTransactionSummary[];
  total: number;
  page: number;
  limit: number;
}
