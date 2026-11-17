import { BranchOwnedEntity } from './base';
import { PurchaseStatus, PaymentStatus, PaymentMethod, ReturnStatus } from './enums';

export interface PurchaseItem {
  productId: string;
  productName?: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  lineTotal: number;
  batchId?: string;
}

/**
 * v1 folds "create PO" and "receive stock" into one step — status is written
 * directly as RECEIVED and the matching Batches/StockMovements are created
 * atomically. DRAFT/CANCELLED are modeled now so a later two-step
 * create-then-receive workflow doesn't require a schema migration.
 */
export interface Purchase extends BranchOwnedEntity {
  vendorId: string;
  vendorName?: string;
  purchaseNumber: string;
  vendorInvoiceNumber?: string;
  status: PurchaseStatus;
  items: PurchaseItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  purchaseDate: string;
  createdBy: string;
  deletedAt: string | null;
  /** Return counters; the original lines and prices are never edited. */
  notes?: string;
  paymentTerms?: string;
  /** False once a payment or return exists, or the purchase is cancelled. */
  isEditable?: boolean;
  lockReason?: string;
  returnedTotal?: number;
  refundedTotal?: number;
  returnStatus?: ReturnStatus;
  /** grandTotal minus returnedTotal. */
  netTotal?: number;
}

export interface CreatePurchaseItemRequest {
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}

/** The user's decision for a product whose price dropped below the vendor's linked price. */
export interface PurchasePriceUpdateRequest {
  productId: string;
  updatePrices: boolean;
}

export interface PurchasePriceChange {
  productId: string;
  productName: string;
  oldPurchasePrice: number;
  newPurchasePrice: number;
}

export interface CreatePurchaseRequest {
  notes?: string;
  paymentTerms?: string;
  branchId?: string;
  vendorId: string;
  vendorInvoiceNumber?: string;
  purchaseDate?: string;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  items: CreatePurchaseItemRequest[];
  priceUpdates?: PurchasePriceUpdateRequest[];
}

export type CreatePurchaseResponse = Purchase & { priceChanges: PurchasePriceChange[] };

export interface UpdatePurchasePaymentRequest {
  paymentStatus: PaymentStatus;
  /** New cumulative amount paid (existing amountPaid + the payment being recorded). */
  amountPaid: number;
  method?: PaymentMethod;
  /** ISO date or date-time of the payment; defaults to now. */
  paymentDate?: string;
  reference?: string;
  notes?: string;
}

/** One row of a purchase's payment history. */
export interface PurchasePaymentRow {
  id: string;
  paymentDate: string;
  /** The part of the payment applied to this purchase. */
  amount: number;
  /** Absent for the amount paid when the purchase was created (no separate payment record). */
  method?: PaymentMethod;
  reference?: string;
  notes?: string;
  recordedBy?: string;
  isInitial?: boolean;
  /** A refund received from the vendor for a return (shown as money back, not a payment). */
  isRefund?: boolean;
}

export interface PaginatedPurchases {
  items: Purchase[];
  total: number;
  page: number;
  limit: number;
}

/** Editable fields of an unpaid purchase; the purchase number never changes. */
export interface UpdatePurchaseRequest {
  vendorId?: string;
  vendorInvoiceNumber?: string;
  purchaseDate?: string;
  notes?: string;
  paymentTerms?: string;
  items: CreatePurchaseItemRequest[];
}
