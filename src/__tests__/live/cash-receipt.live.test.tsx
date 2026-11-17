/**
 * Live contract test for Cash Receipt against a REAL Medicore API (skipped unless LIVE_API_URL is set).
 *
 *   LIVE_API_URL=http://127.0.0.1:4100/api LIVE_PLATFORM_USER=platform LIVE_PLATFORM_PASSWORD=... npx jest src/__tests__/live/cash-receipt.live
 *
 * Point it at a throwaway database. Setup (products,
 * stock, invoiced sales) goes straight to the backend endpoints; only the receipt calls use the app's hooks.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { apiFetch } from '@/api/client';
import { newBatchId, todayLocal } from '@/features/cash-receipt/sheet';
import { useInvoiceLookup, useSaveCashReceipt } from '@/features/cash-receipt/use-cash-receipts';
import { adjustmentDefaults, buildAdjustment } from '@/features/inventory/schema';
import { useAdjustStock } from '@/features/inventory/use-inventory';
import { buildSaleItems, type SaleLine } from '@/features/sales/sale-lines';
import { createClerk, createLiveTenant, installNodeFetch, liveWrapper, login, type LiveTenant } from '@/test-support/live';
import { PaymentMethod, PaymentStatus } from '@/types/medicore';
import type { Customer, Product, Sale } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: process.env.LIVE_API_URL ?? '', API_URL_CONFIGURED: !!process.env.LIVE_API_URL, REQUEST_TIMEOUT_MS: 20000 }));

installNodeFetch();
const live = process.env.LIVE_API_URL ? describe : describe.skip;
jest.setTimeout(120000);

const line = (productId: string, quantity: number): SaleLine => ({ key: `l${productId}${quantity}`, productId, productName: 'x', quantity, unitPrice: 0, priceExplicit: false });

live('cash receipt against the real API', () => {
  let t: LiveTenant;
  let product: Product;
  let customer: Customer;
  let W = liveWrapper();
  beforeEach(() => { W = liveWrapper(); });

  /** An invoiced, unpaid sale (placed as a pending order, then confirmed through Process Orders' endpoint). */
  const invoice = async (quantity: number, branchId = t.main.id) => {
    const pending = await apiFetch<Sale>('/sales', { method: 'POST', body: { branchId, paymentMethod: PaymentMethod.CASH, paymentStatus: PaymentStatus.UNPAID, customerId: customer.id, items: buildSaleItems([line(product.id, quantity)]) } });
    await apiFetch('/sales/orders/confirm', { method: 'POST', body: { saleIds: [pending.id], branchId } });
    return apiFetch<Sale>(`/sales/${pending.id}?branchId=${branchId}`);
  };
  const body = (batchId: string, rows: { invoiceId: string; amount: number }[]) => ({ batchId, date: todayLocal(), method: 'CASH' as const, rows });

  beforeAll(async () => {
    t = await createLiveTenant('cr');
    const mfr = await apiFetch<{ id: string }>('/manufacturers', { method: 'POST', body: { name: `Mfr ${t.suffix}`, branchId: t.main.id } });
    product = await apiFetch<Product>('/products', { method: 'POST', body: { name: `Panadol ${t.suffix}`, genericName: 'Paracetamol', manufacturerId: mfr.id, unit: 'tablet', tp: 10, cp: 8, rp: 12, minStockLevel: 5, branchId: t.main.id } });
    customer = await apiFetch<Customer>('/customers', { method: 'POST', body: { name: `Cust ${t.suffix}`, branchId: t.main.id, isDealer: false } });
    const adjust = await renderHook(() => useAdjustStock(), { wrapper: liveWrapper() });
    await act(async () => {
      await adjust.result.current.adjust(buildAdjustment({ ...adjustmentDefaults({ branchId: t.main.id, productId: product.id }), operation: 'add', batchNumber: 'B1', expiryDate: '2030-12-31', quantity: '200' }));
    });
  });

  it('finds an outstanding invoice by number, receipts part of it, and the voucher is numbered CR-', async () => {
    const sale = await invoice(5);
    const lookup = await renderHook(() => useInvoiceLookup(sale.invoiceNumber!, t.main.id), { wrapper: W });
    await waitFor(() => expect(lookup.result.current.invoices.length).toBeGreaterThan(0));
    const found = lookup.result.current.invoices.find((i) => i.id === sale.id)!;
    expect(found.payable).toBe(true);
    const api = await renderHook(() => useSaveCashReceipt(), { wrapper: W });
    let result!: { id: string; voucherNumber: string; total: number };
    await act(async () => { result = await api.result.current.save(body(newBatchId(), [{ invoiceId: sale.id, amount: 10 }])); });
    expect(result.voucherNumber).toMatch(/^CR-\d{6}$/);
    expect(result.total).toBe(10);
    const after = await apiFetch<Sale>(`/sales/${sale.id}?branchId=${t.main.id}`);
    expect(after.amountPaid).toBe(10);
  });

  it('the same batchId returns the same receipt and posts nothing twice', async () => {
    const sale = await invoice(2);
    const api = await renderHook(() => useSaveCashReceipt(), { wrapper: W });
    const batchId = newBatchId();
    let a!: { id: string }; let b!: { id: string };
    await act(async () => { a = await api.result.current.save(body(batchId, [{ invoiceId: sale.id, amount: 5 }])); b = await api.result.current.save(body(batchId, [{ invoiceId: sale.id, amount: 5 }])); });
    expect(b.id).toBe(a.id);
    expect((await apiFetch<Sale>(`/sales/${sale.id}?branchId=${t.main.id}`)).amountPaid).toBe(5);
  });

  it('is all-or-nothing: one bad row (over the balance) saves nothing and reports that row', async () => {
    const good = await invoice(1);
    const other = await invoice(1);
    const api = await renderHook(() => useSaveCashReceipt(), { wrapper: W });
    let caught: { body?: { errors?: { invoiceId: string; reason: string }[] } } | undefined;
    await act(async () => { await api.result.current.save(body(newBatchId(), [{ invoiceId: good.id, amount: 1 }, { invoiceId: other.id, amount: 999999 }])).catch((e) => { caught = e; }); });
    expect(caught?.body?.errors?.[0]).toMatchObject({ invoiceId: other.id });
    expect((await apiFetch<Sale>(`/sales/${good.id}?branchId=${t.main.id}`)).amountPaid).toBe(0);
  });

  it('rejects the same invoice twice in one sheet', async () => {
    const sale = await invoice(1);
    const api = await renderHook(() => useSaveCashReceipt(), { wrapper: W });
    await act(async () => { await expect(api.result.current.save(body(newBatchId(), [{ invoiceId: sale.id, amount: 1 }, { invoiceId: sale.id, amount: 1 }]))).rejects.toBeTruthy(); });
  });

  it('a clerk without cash_receipt permissions is refused; a clerk on another branch cannot see or receipt this invoice', async () => {
    const sale = await invoice(1);
    const noPerm = await createClerk(`${t.suffix}a`, t.main.id, ['sales:read']);
    const northClerk = await createClerk(`${t.suffix}b`, t.north.id, ['cash_receipt:read', 'cash_receipt:create', 'branches:read']);
    await login(noPerm.username, noPerm.password);
    const denied = await renderHook(() => useSaveCashReceipt(), { wrapper: W });
    await act(async () => { await expect(denied.result.current.save(body(newBatchId(), [{ invoiceId: sale.id, amount: 1 }]))).rejects.toBeTruthy(); });
    await login(northClerk.username, northClerk.password);
    const foreign = await renderHook(() => useSaveCashReceipt(), { wrapper: W });
    await act(async () => { await expect(foreign.result.current.save(body(newBatchId(), [{ invoiceId: sale.id, amount: 1 }]))).rejects.toBeTruthy(); });
    await login(t.admin.username, t.admin.password);
    expect((await apiFetch<Sale>(`/sales/${sale.id}?branchId=${t.main.id}`)).amountPaid).toBe(0);
  });
});
