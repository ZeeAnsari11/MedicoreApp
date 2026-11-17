/**
 * Display-side maths for the Record Payment form (port of the web `payment-dialog.tsx`). The backend decides the real
 * split, journal entries and invoice updates; this only mirrors when the web enables Submit and what it sends.
 */
import { InvoiceType, PartyType, type CreatePaymentRequest, type PaymentMethod } from '@/types/medicore';

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface OpenInvoice {
  invoiceType: InvoiceType;
  id: string;
  number: string;
  grandTotal: number;
  amountPaid: number;
  outstanding: number;
}

/** Web: open = `grandTotal - amountPaid > 0.01`. */
export const isOpenInvoice = (grandTotal: number, amountPaid: number) => round2(grandTotal - amountPaid) > 0.01;

export interface AllocationDraft { checked: boolean; amount: string }
export type AllocationDrafts = Record<string, AllocationDraft>;

export const allocatedTotal = (drafts: AllocationDrafts) =>
  round2(Object.values(drafts).reduce((s, d) => s + (d.checked ? Number(d.amount) || 0 : 0), 0));

/** Amount still unapplied: becomes an advance when positive; negative = over-allocated. */
export const remainderOf = (amount: number, drafts: AllocationDrafts) => round2(amount - allocatedTotal(drafts));

/** Ticking an invoice pre-fills `min(outstanding, what is left of the payment)`. */
export function toggleAllocation(drafts: AllocationDrafts, invoice: OpenInvoice, checked: boolean, amount: number): AllocationDrafts {
  if (!checked) return { ...drafts, [invoice.id]: { checked: false, amount: '' } };
  const others = round2(Object.entries(drafts).reduce((s, [id, d]) => s + (id !== invoice.id && d.checked ? Number(d.amount) || 0 : 0), 0));
  const left = Math.max(round2(amount - others), 0);
  return { ...drafts, [invoice.id]: { checked: true, amount: String(Math.min(invoice.outstanding, left)) } };
}

export interface PaymentDraft {
  partyType: PartyType;
  partyId: string;
  amount: string;
  method: PaymentMethod;
  accountId: string;
  paymentDate: string;
  reference: string;
  notes: string;
  allocations: AllocationDrafts;
}

/** Web: `partyId && amount > 0 && accountId && remainder >= -0.01`. */
export function canSubmitPayment(d: PaymentDraft): boolean {
  const amount = Number(d.amount);
  return !!d.partyId && amount > 0 && !!d.accountId && remainderOf(amount, d.allocations) >= -0.01;
}

/** No `branchId`: a payment lands in the branch of the party it pays (the backend resolves it). */
export function buildPaymentRequest(d: PaymentDraft, invoices: readonly OpenInvoice[]): CreatePaymentRequest {
  const allocations = invoices
    .filter((i) => d.allocations[i.id]?.checked && Number(d.allocations[i.id].amount) > 0)
    .map((i) => ({ invoiceType: i.invoiceType, invoiceId: i.id, amount: Number(d.allocations[i.id].amount) }));
  return {
    partyType: d.partyType,
    partyId: d.partyId,
    amount: Number(d.amount),
    method: d.method,
    accountId: d.accountId,
    paymentDate: d.paymentDate,
    reference: d.reference.trim() || undefined,
    notes: d.notes.trim() || undefined,
    allocations: allocations.length ? allocations : undefined,
  };
}

export const voidMessage = (amountLabel: string, partyName?: string) =>
  `${amountLabel} from ${partyName ?? 'this party'} will be reversed in the ledger and taken off the invoice(s) it paid. An invoice with no other payment becomes editable again.`;

export const isAdvance = (unallocated: number) => unallocated > 0.01;
export { InvoiceType, PartyType };
