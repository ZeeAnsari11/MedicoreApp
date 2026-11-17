/**
 * SaaS-level role: applies to Medicore's own operators, not tenant staff.
 */
export enum SystemRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/**
 * Tenant-scoped roles. Extend this as tenant RBAC grows (e.g. INVENTORY_MANAGER,
 * SALES_REP) — keep it a flat enum so permission checks stay simple to reason about.
 * TENANT_SUPER_ADMIN: the fixed, non-deletable per-tenant owner. Implicit admin (all permissions).
 * TENANT_USER: ordinary tenant user, subject to role-based permissions.
 */
export enum TenantRole {
  TENANT_SUPER_ADMIN = 'TENANT_SUPER_ADMIN',
  TENANT_USER = 'TENANT_USER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INVITED = 'INVITED',
  DISABLED = 'DISABLED',
}

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TRIAL = 'TRIAL',
}

export enum PlanStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum BillingInterval {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  DISCONTINUED = 'DISCONTINUED',
}

export enum StockMovementType {
  PURCHASE_IN = 'PURCHASE_IN',
  SALE_OUT = 'SALE_OUT',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
  ADJUSTMENT_ADD = 'ADJUSTMENT_ADD',
  ADJUSTMENT_SUBTRACT = 'ADJUSTMENT_SUBTRACT',
  ADJUSTMENT_SET = 'ADJUSTMENT_SET',
  /** Returned goods that are not fit for sale (damaged/expired): recorded, never added to sellable stock. */
  WRITE_OFF = 'WRITE_OFF',
}

export enum ReturnReasonCode {
  DAMAGED = 'DAMAGED',
  EXPIRED = 'EXPIRED',
  WRONG_ITEM = 'WRONG_ITEM',
  EXCESS = 'EXCESS',
  OTHER = 'OTHER',
}

/** What happens to returned sale goods. Only RESTOCK goes back into sellable stock. */
export enum ReturnCondition {
  RESTOCK = 'RESTOCK',
  DAMAGED = 'DAMAGED',
  EXPIRED = 'EXPIRED',
}

/** ADJUST settles against the outstanding balance then credit; REFUND pays the excess out now. */
export enum ReturnSettlementMode {
  ADJUST = 'ADJUST',
  REFUND = 'REFUND',
}

export enum ReturnStatus {
  NONE = 'NONE',
  PARTIAL = 'PARTIAL',
  FULL = 'FULL',
}

/** Batch-allocation strategy for a sale line item — FEFO by default, MANUAL as an override. */
export enum AllocationMode {
  FEFO = 'FEFO',
  MANUAL = 'MANUAL',
}

export enum PurchaseStatus {
  DRAFT = 'DRAFT',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

/** Lifecycle of a sale. A sale with no status is CONFIRMED. A rejected order is deleted, never stored. */
export enum SaleStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
}

/** Shared by Purchase and Sale. */
export enum PaymentStatus {
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  UNPAID = 'UNPAID',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  CREDIT = 'CREDIT',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

/** Chart of Accounts classification — drives which side (debit/credit) is "normal" for an account. */
export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export enum NormalBalance {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/** What triggered a journal entry — powers reversal lookups and the audit trail. */
export enum JournalEntrySourceType {
  SALE = 'SALE',
  SALE_CANCELLATION = 'SALE_CANCELLATION',
  /** Reversal of a sale's entry when the invoice is edited; a new SALE entry follows. */
  SALE_EDIT = 'SALE_EDIT',
  SALE_RETURN = 'SALE_RETURN',
  PURCHASE = 'PURCHASE',
  PURCHASE_CANCELLATION = 'PURCHASE_CANCELLATION',
  /** Reversal of a purchase's entry when the invoice is edited; a new PURCHASE entry follows. */
  PURCHASE_EDIT = 'PURCHASE_EDIT',
  /** Reversal of a payment's entries when the payment is voided. */
  PAYMENT_VOID = 'PAYMENT_VOID',
  PURCHASE_RETURN = 'PURCHASE_RETURN',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_MADE = 'PAYMENT_MADE',
  EXPENSE = 'EXPENSE',
  MANUAL = 'MANUAL',
  OPENING_BALANCE = 'OPENING_BALANCE',
}

export enum JournalEntryStatus {
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

export enum PartyType {
  CUSTOMER = 'CUSTOMER',
  VENDOR = 'VENDOR',
}

export enum InvoiceType {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
}

