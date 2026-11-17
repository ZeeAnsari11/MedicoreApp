import { TenantOwnedEntity } from './base';

/**
 * Branch-owned: a customer belongs to the branch it was created in. Offline-creatable (created ad-hoc mid-sale), so it uses a
 * client-generatable UUIDv7 id and soft delete like Sale/Purchase/Batch.
 */
export interface Customer extends TenantOwnedEntity {
  branchId?: string;
  name: string;
  phone?: string;
  address?: string;
  isDealer: boolean;
  /**
   * @deprecated Not the source of truth for anything financial. Left in
   * place only because removing a populated field is a needless migration
   * risk. The authoritative outstanding balance is always derived from the
   * accounting ledger (see `PartyLedgerResponse` / `/accounting/reports/*`)
   * — do not read this for any balance display or business decision.
   */
  totalDue: number;
  /**
   * Ledger-derived outstanding balance (Accounts Receivable for this
   * customer, as of now). This is the field to display — computed on read
   * from posted journal entries, never stored. Present on list responses;
   * omitted where the caller doesn't need it.
   */
  outstandingBalance?: number;
  deletedAt: string | null;
}

export interface CreateCustomerRequest {
  /** Required for admins; ignored/pinned for branch users. */
  branchId?: string;
  name: string;
  phone?: string;
  address?: string;
  isDealer?: boolean;
}

export interface UpdateCustomerRequest {
  name?: string;
  phone?: string;
  address?: string;
  isDealer?: boolean;
}
