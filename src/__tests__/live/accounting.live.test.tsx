/**
 * Live contract test for Accounting against a REAL Medicore API (skipped unless LIVE_API_URL is set).
 *
 *   LIVE_API_URL=http://127.0.0.1:4100/api LIVE_PLATFORM_USER=platform LIVE_PLATFORM_PASSWORD=... npx jest src/__tests__/live/accounting.live
 *
 * Point it at a throwaway database. Setup (products,
 * stock, invoiced sales) goes straight to the backend endpoints; the payment, journal and report calls use the app's hooks.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { apiFetch } from '@/api/client';
import { buildPaymentRequest, type PaymentDraft } from '@/features/accounting/payment-logic';
import { useJournalEntries } from '@/features/accounting/use-journal';
import { usePaymentMutations } from '@/features/accounting/use-payments';
import { useBalanceSheet, useTrialBalance } from '@/features/accounting/use-reports';
import { todayLocal } from '@/features/cash-receipt/sheet';
import { adjustmentDefaults, buildAdjustment } from '@/features/inventory/schema';
import { useAdjustStock } from '@/features/inventory/use-inventory';
import { usePartyBalances } from '@/features/ledgers/use-party-ledger';
import { buildSaleItems, type SaleLine } from '@/features/sales/sale-lines';
import { createLiveTenant, installNodeFetch, liveWrapper, type LiveTenant } from '@/test-support/live';
import { InvoiceType, PartyType, PaymentMethod, PaymentStatus } from '@/types/medicore';
import type { Account, Customer, Product, Sale } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: process.env.LIVE_API_URL ?? '', API_URL_CONFIGURED: !!process.env.LIVE_API_URL, REQUEST_TIMEOUT_MS: 20000 }));

installNodeFetch();
const live = process.env.LIVE_API_URL ? describe : describe.skip;
jest.setTimeout(120000);

const line = (productId: string, quantity: number): SaleLine => ({ key: `l${productId}${quantity}`, productId, productName: 'x', quantity, unitPrice: 0, priceExplicit: false });

live('accounting against the real API', () => {
  let t: LiveTenant;
  let product: Product;
  let customer: Customer;
  let cash: Account;
  let capital: Account;
  let W = liveWrapper();
  beforeEach(() => { W = liveWrapper(); });

  const invoice = async (quantity: number) => {
    const pending = await apiFetch<Sale>('/sales', { method: 'POST', body: { branchId: t.main.id, paymentMethod: PaymentMethod.CASH, paymentStatus: PaymentStatus.UNPAID, customerId: customer.id, items: buildSaleItems([line(product.id, quantity)]) } });
    await apiFetch('/sales/orders/confirm', { method: 'POST', body: { saleIds: [pending.id], branchId: t.main.id } });
    return apiFetch<Sale>(`/sales/${pending.id}?branchId=${t.main.id}`);
  };
  const draft = (over: Partial<PaymentDraft>): PaymentDraft => ({ partyType: PartyType.CUSTOMER, partyId: customer.id, amount: '', method: PaymentMethod.CASH, accountId: cash.id, paymentDate: todayLocal(), reference: '', notes: '', allocations: {}, ...over });

  beforeAll(async () => {
    t = await createLiveTenant('acc');
    const mfr = await apiFetch<{ id: string }>('/manufacturers', { method: 'POST', body: { name: `Mfr ${t.suffix}`, branchId: t.main.id } });
    product = await apiFetch<Product>('/products', { method: 'POST', body: { name: `Panadol ${t.suffix}`, genericName: 'Paracetamol', manufacturerId: mfr.id, unit: 'tablet', tp: 10, cp: 8, rp: 12, minStockLevel: 5, branchId: t.main.id } });
    customer = await apiFetch<Customer>('/customers', { method: 'POST', body: { name: `Cust ${t.suffix}`, branchId: t.main.id, isDealer: false } });
    const adjust = await renderHook(() => useAdjustStock(), { wrapper: liveWrapper() });
    await act(async () => {
      await adjust.result.current.adjust(buildAdjustment({ ...adjustmentDefaults({ branchId: t.main.id, productId: product.id }), operation: 'add', batchNumber: 'B1', expiryDate: '2030-12-31', quantity: '200' }));
    });
    const accounts = await apiFetch<Account[]>('/accounting/accounts');
    cash = accounts.find((a) => a.systemKey === 'CASH')!;
    capital = accounts.find((a) => a.type === 'EQUITY')!;
  });

  it('records a payment against an invoice, then voiding it restores the invoice balance', async () => {
    const sale = await invoice(5);
    const api = await renderHook(() => usePaymentMutations(), { wrapper: W });
    let created!: { id: string };
    await act(async () => { created = await api.result.current.create(buildPaymentRequest(draft({ amount: '10', allocations: { [sale.id]: { checked: true, amount: '10' } } }), [{ invoiceType: InvoiceType.SALE, id: sale.id, number: sale.invoiceNumber!, grandTotal: sale.grandTotal, amountPaid: 0, outstanding: sale.grandTotal }])); });
    expect((await apiFetch<Sale>(`/sales/${sale.id}?branchId=${t.main.id}`)).amountPaid).toBe(10);
    await act(async () => { await api.result.current.voidPayment(created.id, t.main.id); });
    expect((await apiFetch<Sale>(`/sales/${sale.id}?branchId=${t.main.id}`)).amountPaid).toBe(0);
    // A second void is rejected by the backend (404), nothing is posted twice.
    await act(async () => { await expect(api.result.current.voidPayment(created.id, t.main.id)).rejects.toBeTruthy(); });
  });

  it('the backend rejects an unbalanced manual entry and accepts a balanced one', async () => {
    const api = await renderHook(() => useJournalEntries(t.main.id), { wrapper: W });
    await act(async () => { await expect(api.result.current.create({ branchId: t.main.id, description: 'Unbalanced', lines: [{ accountId: cash.id, debit: 100, credit: 0 }, { accountId: capital.id, debit: 0, credit: 90 }] })).rejects.toBeTruthy(); });
    await act(async () => { await api.result.current.create({ branchId: t.main.id, description: 'Seed capital', lines: [{ accountId: cash.id, debit: 100, credit: 0 }, { accountId: capital.id, debit: 0, credit: 100 }] }); });
    await waitFor(() => expect(api.result.current.entries.some((e) => e.description === 'Seed capital')).toBe(true));
  });

  it('the trial balance and balance sheet agree after those postings', async () => {
    const day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const tb = await renderHook(() => useTrialBalance(t.main.id, day), { wrapper: W });
    await waitFor(() => expect(tb.result.current.data).toBeTruthy());
    expect(Math.abs(tb.result.current.data!.totalDebit - tb.result.current.data!.totalCredit)).toBeLessThan(0.01);
    const bs = await renderHook(() => useBalanceSheet(t.main.id, day), { wrapper: W });
    await waitFor(() => expect(bs.result.current.data).toBeTruthy());
    expect(bs.result.current.data!.isBalanced).toBe(true);
  });

  it('customer balances reflect the open invoices', async () => {
    const api = await renderHook(() => usePartyBalances('customers', { branchId: t.main.id, hasBalance: true, sortBy: 'balance', sortDir: 'desc', page: 1, limit: 25 }), { wrapper: W });
    await waitFor(() => expect(api.result.current.balances).toBeTruthy());
    expect(api.result.current.balances!.items.some((r) => r.partyId === customer.id && r.balance > 0)).toBe(true);
  });
});
