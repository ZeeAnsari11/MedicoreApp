import { TenantOwnedEntity, BranchOwnedEntity } from './base';
import {
  AccountType,
  NormalBalance,
  JournalEntrySourceType,
  JournalEntryStatus,
  PartyType,
  InvoiceType,
  PaymentMethod,
  ReturnCondition,
  ReturnReasonCode,
  ReturnSettlementMode,
} from './enums';

/* ------------------------------------------------------------------ */
/* Chart of Accounts                                                   */
/* ------------------------------------------------------------------ */

/**
 * Chart of Accounts entry. Tenant-wide (not branch-scoped), matching how
 * Customer/Vendor are tenant-wide master data. `systemKey` is how the
 * posting engine resolves "the AR account" etc. regardless of display name.
 */
export interface Account extends TenantOwnedEntity {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  systemKey?: string;
  parentAccountId?: string;
  isSystemAccount: boolean;
  isActive: boolean;
  description?: string;
  deletedAt: string | null;
}

export interface CreateAccountRequest {
  code: string;
  name: string;
  type: AccountType;
  parentAccountId?: string;
  description?: string;
}

export interface UpdateAccountRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
}

/* ------------------------------------------------------------------ */
/* Journal Entries                                                     */
/* ------------------------------------------------------------------ */

export interface JournalEntryLine {
  accountId: string;
  accountName?: string;
  debit: number;
  credit: number;
  partyType?: PartyType;
  partyId?: string;
  partyName?: string;
  description?: string;
}

/**
 * The immutable ledger record. Never edited after posting — a correction is
 * always a new, equal-and-opposite entry referencing this one via
 * reversalOfEntryId, with this entry's status flipped to REVERSED.
 */
export interface JournalEntry extends TenantOwnedEntity {
  branchId?: string;
  entryNumber: string;
  entryDate: string;
  sourceType: JournalEntrySourceType;
  sourceId?: string;
  description: string;
  lines: JournalEntryLine[];
  totalDebit: number;
  totalCredit: number;
  status: JournalEntryStatus;
  reversalOfEntryId?: string;
  reversedByEntryId?: string;
  createdBy: string;
}

export interface CreateManualJournalEntryLineRequest {
  accountId: string;
  debit: number;
  credit: number;
  partyType?: PartyType;
  partyId?: string;
  description?: string;
}

export interface CreateManualJournalEntryRequest {
  branchId?: string;
  entryDate?: string;
  description: string;
  lines: CreateManualJournalEntryLineRequest[];
}

export interface CreateOpeningBalanceRequest {
  branchId?: string;
  entryDate?: string;
  description?: string;
  lines: CreateManualJournalEntryLineRequest[];
}

/* ------------------------------------------------------------------ */
/* Payments                                                             */
/* ------------------------------------------------------------------ */

export interface PaymentAllocation {
  invoiceType: InvoiceType;
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
}

/**
 * One real cash/bank movement. `allocations` records which invoice(s) it has
 * been matched against — populated at creation and/or appended later via the
 * allocate action. `amount - Σallocations` is the currently-unapplied
 * advance/credit remainder, which the posting engine routes to the
 * Customer/Vendor Advances account rather than leaving as an implicit
 * negative AR/AP balance.
 */
export interface Payment extends BranchOwnedEntity {
  partyType: PartyType;
  partyId: string;
  partyName?: string;
  amount: number;
  method: PaymentMethod;
  accountId: string;
  accountName?: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
  allocations: PaymentAllocation[];
  unallocatedAmount: number;
  journalEntryId: string;
  createdBy: string;
  /** Inherited from the sale it belongs to; absent on older records. */
  orderBookerName?: string;
  deletedAt: string | null;
}

export interface CreatePaymentAllocationRequest {
  invoiceType: InvoiceType;
  invoiceId: string;
  amount: number;
}

export interface CreatePaymentRequest {
  branchId?: string;
  partyType: PartyType;
  partyId: string;
  amount: number;
  method: PaymentMethod;
  accountId: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
  allocations?: CreatePaymentAllocationRequest[];
}

export interface AllocatePaymentRequest {
  invoiceType: InvoiceType;
  invoiceId: string;
  amount: number;
}

/* ------------------------------------------------------------------ */
/* Expenses                                                             */
/* ------------------------------------------------------------------ */

export interface Expense extends BranchOwnedEntity {
  expenseAccountId: string;
  expenseAccountName?: string;
  amount: number;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  paymentAccountId: string;
  paymentAccountName?: string;
  vendorId?: string;
  vendorName?: string;
  description: string;
  reference?: string;
  journalEntryId: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface CreateExpenseRequest {
  branchId?: string;
  expenseAccountId: string;
  amount: number;
  expenseDate?: string;
  paymentMethod: PaymentMethod;
  paymentAccountId: string;
  vendorId?: string;
  description: string;
  reference?: string;
}

/* ------------------------------------------------------------------ */
/* Returns                                                              */
/* ------------------------------------------------------------------ */

/** How a return was settled against the document's balance. */
export interface ReturnSettlement {
  mode: ReturnSettlementMode;
  /** For REFUND: how the money went out/came back. */
  method?: PaymentMethod;
  /** Taken off the document's outstanding balance. */
  appliedToOutstanding: number;
  /** Paid out now (customer refund) / received now (vendor refund). */
  refundAmount: number;
  /** Left as customer/vendor credit. */
  creditAmount: number;
}

export interface SaleReturnBatchAllocation {
  batchId: string;
  batchNumber: string;
  quantity: number;
  condition?: ReturnCondition;
  /** Revenue + tax returned for this allocation, from the original price/discount/tax. */
  total?: number;
  unitCost?: number;
}

export interface SaleReturnItem {
  productId: string;
  productName?: string;
  unitPrice?: number;
  discountPercent?: number;
  taxPercent?: number;
  batchAllocations: SaleReturnBatchAllocation[];
}

export interface SaleReturn extends BranchOwnedEntity {
  saleId: string;
  invoiceNumber?: string;
  returnNumber?: string;
  /** CANCELLATION rows are the remainder reversed by Void invoice. */
  kind?: 'RETURN' | 'CANCELLATION';
  items: SaleReturnItem[];
  reason?: string;
  reasonCode?: ReturnReasonCode;
  notes?: string;
  total?: number;
  settlement?: ReturnSettlement;
  returnDate: string;
  journalEntryId: string;
  createdBy: string;
  /** Inherited from the sale it belongs to; absent on older records. */
  orderBookerName?: string;
  deletedAt: string | null;
}

export interface ReturnSettlementRequest {
  mode: ReturnSettlementMode;
  method?: PaymentMethod;
}

export interface CreateSaleReturnItemRequest {
  productId: string;
  batchAllocations: { batchId: string; quantity: number; condition?: ReturnCondition }[];
}

export interface CreateSaleReturnRequest {
  saleId: string;
  branchId?: string;
  items: CreateSaleReturnItemRequest[];
  reason?: string;
  reasonCode?: ReturnReasonCode;
  notes?: string;
  settlement?: ReturnSettlementRequest;
  returnDate?: string;
}

export interface PurchaseReturnItem {
  productId: string;
  productName?: string;
  batchId: string;
  batchNumber?: string;
  quantity: number;
  unitPrice?: number;
  /** Share of the original line total (tax included) returned. */
  total?: number;
}

export interface PurchaseReturn extends BranchOwnedEntity {
  purchaseId: string;
  purchaseNumber?: string;
  returnNumber?: string;
  kind?: 'RETURN' | 'CANCELLATION';
  items: PurchaseReturnItem[];
  reason?: string;
  reasonCode?: ReturnReasonCode;
  notes?: string;
  total?: number;
  settlement?: ReturnSettlement;
  returnDate: string;
  journalEntryId: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface CreatePurchaseReturnItemRequest {
  productId: string;
  batchId: string;
  quantity: number;
}

export interface CreatePurchaseReturnRequest {
  purchaseId: string;
  branchId?: string;
  items: CreatePurchaseReturnItemRequest[];
  reason?: string;
  reasonCode?: ReturnReasonCode;
  notes?: string;
  settlement?: ReturnSettlementRequest;
  returnDate?: string;
}

/** How much of a given sale/purchase line's batch allocation remains returnable. */
export interface ReturnableBatchAllocation {
  batchId: string;
  batchNumber: string;
  originalQuantity: number;
  alreadyReturned: number;
  returnable: number;
}

export interface ReturnableSaleItem {
  productId: string;
  productName: string;
  unitPrice?: number;
  discountPercent?: number;
  taxPercent?: number;
  batchAllocations: ReturnableBatchAllocation[];
}

export interface ReturnablePurchaseItem {
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  originalQuantity: number;
  alreadyReturned: number;
  returnable: number;
  /** Original line total (tax included) and quantity, so the dialog can price a partial return. */
  lineTotal?: number;
  lineQuantity?: number;
}

/* ------------------------------------------------------------------ */
/* Ledger reports                                                       */
/* ------------------------------------------------------------------ */

/** The document a ledger row came from, so the UI can open it. */
export interface LedgerReference {
  type: 'SALE' | 'PURCHASE' | 'PAYMENT' | 'EXPENSE';
  id: string;
  number: string;
}

/** One posted journal line. Returns, voids, cancellations and advances are their own rows. */
export interface LedgerRow {
  entryId: string;
  entryNumber: string;
  date: string;
  sourceType: JournalEntrySourceType;
  /** Human label, e.g. Invoice, Payment, Advance, Sale return, Void. */
  documentType: string;
  description: string;
  reference?: LedgerReference;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface LedgerPage {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  rows: LedgerRow[];
  /** Rows in the period (all pages). */
  total: number;
  page: number;
  limit: number;
}

export interface GeneralLedgerResponse extends LedgerPage {
  accountId: string;
  accountCode: string;
  accountName: string;
  normalBalance: 'DEBIT' | 'CREDIT';
}

export interface PartyLedgerSummary {
  openingBalance: number;
  /** Customer: invoiced. Vendor: purchased. */
  billed: number;
  /** Customer: received. Vendor: paid. */
  settled: number;
  returns: number;
  /** Customer: voids. Vendor: cancellations. */
  voids: number;
  /** Net advances taken (customer) or paid (vendor) in the period, unapplied or applied. */
  advances: number;
  /** Opening-balance entries and manual journals, so the cards always add up to the closing balance. */
  other: number;
  closingBalance: number;
}

/**
 * closingBalance is net of advances: for a customer, what they owe (negative = credit/advance);
 * for a vendor, what we owe (negative = prepayment).
 */
export interface PartyLedgerResponse extends LedgerPage {
  partyId: string;
  partyName: string;
  summary: PartyLedgerSummary;
}

export interface PartyBalanceRow {
  partyId: string;
  name: string;
  /** Accounts Receivable (customer) / Accounts Payable (vendor) balance. */
  accountBalance: number;
  /** Unapplied advance held (customer) / prepayment with the vendor. */
  advanceBalance: number;
  /** accountBalance minus advanceBalance. */
  balance: number;
}

export interface PartyBalancesResponse {
  items: PartyBalanceRow[];
  total: number;
  page: number;
  limit: number;
  totals: {
    /** Sum of every party's account balance (all parties, ignoring filters). */
    partiesAccountTotal: number;
    /** Accounts Receivable / Payable total, the figure on the dashboard. */
    accountTotal: number;
    /** accountTotal minus partiesAccountTotal: balance not tied to any party (e.g. walk-in sales). */
    unattributed: number;
    advanceTotal: number;
  };
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export interface TrialBalanceResponse {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
}

export interface ProfitLossRow {
  accountId: string;
  accountName: string;
  amount: number;
}

export interface ProfitLossResponse {
  revenue: ProfitLossRow[];
  totalRevenue: number;
  expenses: ProfitLossRow[];
  totalExpenses: number;
  netIncome: number;
}

export interface BalanceSheetRow {
  accountId: string;
  accountName: string;
  amount: number;
}

export interface BalanceSheetResponse {
  assets: BalanceSheetRow[];
  totalAssets: number;
  liabilities: BalanceSheetRow[];
  totalLiabilities: number;
  equity: BalanceSheetRow[];
  totalEquity: number;
  netIncome: number;
  isBalanced: boolean;
}

export interface AccountingOverviewResponse {
  totalReceivable: number;
  totalPayable: number;
  cashAndBankBalance: number;
  netIncomeThisMonth: number;
}
