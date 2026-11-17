/**
 * Live contract test for Sales against a REAL Medicore API (skipped unless LIVE_API_URL is set).
 *
 *   LIVE_API_URL=http://127.0.0.1:4100/api LIVE_PLATFORM_USER=platform LIVE_PLATFORM_PASSWORD=... npx jest src/__tests__/live/sales.live
 *
 * Point it at a throwaway database. Confirming an order belongs to Process Orders (not built yet), so the test calls that
 * backend endpoint directly, as setup only, to obtain invoiced sales for the edit / payment / return / void flows.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { apiFetch, apiFetchBytes } from '@/api/client';
import { useCustomers } from '@/features/customers/use-customers';
import { adjustmentDefaults, buildAdjustment } from '@/features/inventory/schema';
import { useAdjustStock } from '@/features/inventory/use-inventory';
import { buildReturnRequest, buildReturnRows, emptyReturnDraft } from '@/features/sales/returns';
import { buildSaleItems, type SaleLine } from '@/features/sales/sale-lines';
import { useLastSalePrices, useOrderBookers, useSale, useSaleMutations, useSalePayments, useSaleReturns, useSalesPage } from '@/features/sales/use-sales';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { createClerk, createLiveTenant, installNodeFetch, liveWrapper, login, toasts, type LiveTenant } from '@/test-support/live';
import { PaymentMethod, PaymentStatus, ReturnSettlementMode } from '@/types/medicore';
import type { Batch, Customer, Product, Sale } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: process.env.LIVE_API_URL ?? '', API_URL_CONFIGURED: !!process.env.LIVE_API_URL, REQUEST_TIMEOUT_MS: 20000 }));

installNodeFetch();
const live = process.env.LIVE_API_URL ? describe : describe.skip;
jest.setTimeout(120000);

const line = (productId: string, quantity: number, over: Partial<SaleLine> = {}): SaleLine => ({ key: `l${productId}${quantity}`, productId, productName: 'x', quantity, unitPrice: 0, priceExplicit: false, ...over });

live('sales against the real API', () => {
  let t: LiveTenant;
  let clerk: { username: string; password: string };
  let northClerk: { username: string; password: string };
  let product: Product;
  let customer: Customer;
  let W = liveWrapper();
  beforeEach(() => { W = liveWrapper(); });

  const batchesOf = (branchId: string) => apiFetch<Batch[]>(`/inventory/${product.id}/batches?branchId=${branchId}`);
  const qty = async (batchNumber: string, branchId = t.main.id) => (await batchesOf(branchId)).find((b) => b.batchNumber === batchNumber)?.quantity;
  const place = async (body: Record<string, unknown>) => apiFetch<Sale>('/sales', { method: 'POST', body });
  /** Setup only: confirm through the backend's Process Orders endpoint so the sale gets an invoice number. */
  const confirm = async (sale: Sale) => {
    await apiFetch('/sales/orders/confirm', { method: 'POST', body: { saleIds: [sale.id], branchId: sale.branchId } });
    return apiFetch<Sale>(`/sales/${sale.id}?branchId=${sale.branchId}`);
  };
  const base = () => ({ branchId: t.main.id, paymentMethod: PaymentMethod.CASH, paymentStatus: PaymentStatus.UNPAID });

  beforeAll(async () => {
    t = await createLiveTenant('sl');
    const mfr = await apiFetch<{ id: string }>('/manufacturers', { method: 'POST', body: { name: `Mfr ${t.suffix}`, branchId: t.main.id } });
    product = await apiFetch<Product>('/products', { method: 'POST', body: { name: `Panadol ${t.suffix}`, genericName: 'Paracetamol', manufacturerId: mfr.id, unit: 'tablet', tp: 10, cp: 8, rp: 12, minStockLevel: 5, branchId: t.main.id } });
    customer = await apiFetch<Customer>('/customers', { method: 'POST', body: { name: `Cust ${t.suffix}`, branchId: t.main.id, isDealer: false } });
    const adjust = await renderHook(() => useAdjustStock(), { wrapper: liveWrapper() });
    const stock = (batchNumber: string, expiryDate: string, quantity: string) => buildAdjustment({ ...adjustmentDefaults({ branchId: t.main.id, productId: product.id }), operation: 'add', batchNumber, expiryDate, quantity });
    await act(async () => {
      await adjust.result.current.adjust(stock('B1', '2027-12-31', '50'));
      await adjust.result.current.adjust(stock('B2', '2028-06-30', '30'));
    });
    clerk = await createClerk(t.suffix, t.main.id, ['sales:read', 'sales:create', 'customers:read', 'products:read', 'inventory:read', 'branches:read']);
    // a clerk on the other branch
    const north = await createClerk(`${t.suffix}n`, t.north.id, ['sales:read', 'sales:create', 'customers:read', 'products:read', 'inventory:read', 'branches:read']);
    northClerk = north;
    await login(t.admin.username, t.admin.password);
  });

  it('places a FEFO sale as a pending order: server prices, nearest-expiry batch, stock deducted, no invoice yet', async () => {
    const api = await renderHook(() => useSaleMutations(t.main.id), { wrapper: W });
    let sale!: Sale;
    await act(async () => { sale = await api.result.current.create({ ...base(), customerId: customer.id, items: buildSaleItems([line(product.id, 4)]) }); });
    expect(sale.status).toBe('PENDING');
    expect(sale.orderNumber).toMatch(/^PO-/);
    expect(sale.invoiceNumber || '').toBe('');
    expect(sale.items[0].batchAllocations.map((a) => [a.batchNumber, a.quantity])).toEqual([['B1', 4]]);
    expect(sale.items[0].unitPrice).toBeGreaterThan(0);
    expect(sale.grandTotal).toBeCloseTo(sale.items[0].unitPrice * 4, 2);
    expect(toasts().some((x) => x.startsWith('Order PO-'))).toBe(true);
    expect(await qty('B1')).toBe(46);
  });

  it('honours a manual batch and an explicit price; rejects a net price below cost and oversell, leaving stock untouched', async () => {
    const api = await renderHook(() => useSaleMutations(t.main.id), { wrapper: W });
    let sale!: Sale;
    const manual = line(product.id, 3, { priceExplicit: true, unitPrice: 11, allocations: [{ batchId: (await batchesOf(t.main.id)).find((b) => b.batchNumber === 'B2')!.id, batchNumber: 'B2', quantity: 3 }] });
    await act(async () => { sale = await api.result.current.create({ ...base(), items: buildSaleItems([manual]) }); });
    expect(sale.items[0].batchAllocations.map((a) => [a.batchNumber, a.quantity])).toEqual([['B2', 3]]);
    expect(sale.items[0].unitPrice).toBe(11);
    expect(await qty('B2')).toBe(27);

    const before = await qty('B1');
    await act(async () => { await expect(api.result.current.create({ ...base(), items: buildSaleItems([line(product.id, 2, { priceExplicit: true, unitPrice: 5 })]) })).rejects.toMatchObject({ status: 400 }); });
    await act(async () => { await expect(api.result.current.create({ ...base(), items: buildSaleItems([line(product.id, 9999)]) })).rejects.toMatchObject({ status: 400 }); });
    expect(await qty('B1')).toBe(before);
    expect(toasts().length).toBeGreaterThan(0);
  });

  it('a double press of Place sale sends exactly one request (client guard) and deducts stock once', async () => {
    const api = await renderHook(() => useSaleMutations(t.main.id), { wrapper: W });
    const guard = await renderHook(() => useSubmitGuard(), { wrapper: W });
    const before = (await qty('B1'))!;
    const send = () => guard.result.current.run(() => api.result.current.create({ ...base(), items: buildSaleItems([line(product.id, 1)]) }));
    await act(async () => { await Promise.all([send(), send(), send()]); });
    expect(await qty('B1')).toBe(before - 1);
  });

  it('pending orders are not listed and the list filters/pages server-side once invoiced', async () => {
    const pending = await place({ ...base(), customerId: customer.id, items: buildSaleItems([line(product.id, 1)]) });
    const invoiced = await confirm(pending);
    expect(invoiced.invoiceNumber).toBeTruthy();
    expect(invoiced.status).toBe('CONFIRMED');

    const list = await renderHook(() => useSalesPage({ branchId: t.main.id, search: invoiced.invoiceNumber, page: 1, limit: 5 }), { wrapper: W });
    await waitFor(() => expect(list.result.current.sales.map((s) => s.id)).toEqual([invoiced.id]));
    const byCustomer = await renderHook(() => useSalesPage({ branchId: t.main.id, customerId: customer.id, paymentStatus: PaymentStatus.UNPAID, page: 1, limit: 100 }), { wrapper: liveWrapper() });
    await waitFor(() => expect(byCustomer.result.current.sales.some((s) => s.id === invoiced.id)).toBe(true));
    expect(byCustomer.result.current.sales.every((s) => s.invoiceNumber)).toBe(true);
    const paid = await apiFetch<{ items: Sale[] }>(`/sales?branchId=${t.main.id}&paymentStatus=PAID&page=1&limit=100`);
    expect(paid.items.some((s) => s.id === invoiced.id)).toBe(false);
  });

  it('edit, payment, PDF, return and void on an invoiced sale follow the backend rules', async () => {
    const api = await renderHook(() => useSaleMutations(t.main.id), { wrapper: W });
    const invoiced = await confirm(await place({ ...base(), customerId: customer.id, items: buildSaleItems([line(product.id, 5)]) }));
    expect(invoiced.isEditable).toBe(true);

    // edit: quantity change is re-allocated by the backend, invoice number unchanged
    let edited!: Sale;
    await act(async () => { edited = await api.result.current.update(invoiced.id, { customerId: customer.id, items: buildSaleItems([line(product.id, 6)]) }); });
    expect(edited.invoiceNumber).toBe(invoiced.invoiceNumber);
    expect(edited.items[0].quantity).toBe(6);

    // PDF
    const bytes = new Uint8Array(await apiFetchBytes(`/sales/${invoiced.id}/pdf?branchId=${t.main.id}`));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF');

    // partial payment, then the rest
    await act(async () => { await api.result.current.recordPayment(invoiced.id, { paymentStatus: PaymentStatus.PARTIAL, amountPaid: 10, method: PaymentMethod.CASH }); });
    const detail = await renderHook(() => useSale(invoiced.id, t.main.id), { wrapper: W });
    await waitFor(() => expect(detail.result.current.sale?.amountPaid).toBe(10));
    expect(detail.result.current.sale).toMatchObject({ paymentStatus: PaymentStatus.PARTIAL, isEditable: false });
    // a locked invoice is refused by the backend (409) and the app reports the server reason
    await act(async () => { await expect(api.result.current.update(invoiced.id, { items: buildSaleItems([line(product.id, 1)]) })).rejects.toMatchObject({ status: 409 }); });
    const payments = await renderHook(() => useSalePayments(invoiced.id, t.main.id), { wrapper: W });
    await waitFor(() => expect(payments.result.current.payments.length).toBeGreaterThan(0));

    // partial return, settled by reducing the balance; the backend computes the amounts
    const returns = await renderHook(() => useSaleReturns(invoiced.id, t.main.id), { wrapper: W });
    const rows = buildReturnRows(detail.result.current.sale!, []);
    const draft = { ...emptyReturnDraft(), qty: { [rows[0].key]: 2 }, mode: ReturnSettlementMode.ADJUST };
    const stockBefore = (await qty('B1'))!;
    await act(async () => { await api.result.current.createReturn(invoiced.id, buildReturnRequest(t.main.id, rows, draft)); });
    expect((await qty('B1'))! + (await qty('B2'))!).toBeGreaterThan(stockBefore);
    await waitFor(() => expect(returns.result.current.returns).toHaveLength(1));
    expect(returns.result.current.returns[0].total).toBeGreaterThan(0);

    // returning more than was sold is refused
    const over = buildReturnRows(detail.result.current.sale!, returns.result.current.returns);
    await act(async () => { await expect(api.result.current.createReturn(invoiced.id, buildReturnRequest(t.main.id, over, { ...draft, qty: { [over[0].key]: 999 } }))).rejects.toMatchObject({ status: 400 }); });
  });

  it('voids an unpaid invoice, restoring stock', async () => {
    const api = await renderHook(() => useSaleMutations(t.main.id), { wrapper: W });
    const before = (await qty('B1'))!;
    const invoiced = await confirm(await place({ ...base(), items: buildSaleItems([line(product.id, 2)]) }));
    expect(await qty('B1')).toBe(before - 2);
    await act(async () => { await api.result.current.voidSale(invoiced.id); });
    expect(await qty('B1')).toBe(before);
    expect(toasts()).toContain('Sale voided and stock restored');
  });

  it('last price and order bookers come from the backend', async () => {
    const prices = await renderHook(() => useLastSalePrices(customer.id, [product.id], t.main.id), { wrapper: W });
    await waitFor(() => expect(prices.result.current.get(product.id)?.price).toBeGreaterThan(0));
    const bookers = await renderHook(() => useOrderBookers(t.main.id), { wrapper: liveWrapper() });
    await waitFor(() => expect(bookers.result.current.orderBookers.length).toBeGreaterThan(0));
  });

  it('a branch clerk can sell on their own branch only and cannot void or take another branch', async () => {
    const sale = await confirm(await place({ ...base(), items: buildSaleItems([line(product.id, 1)]) }));
    await login(clerk.username, clerk.password);
    const api = await renderHook(() => useSaleMutations(t.main.id), { wrapper: W });
    let mine!: Sale;
    await act(async () => { mine = await api.result.current.create({ ...base(), items: buildSaleItems([line(product.id, 1)]) }); });
    expect(mine.branchId).toBe(t.main.id);
    // foreign branch in the body
    await act(async () => { await expect(api.result.current.create({ ...base(), branchId: t.north.id, items: buildSaleItems([line(product.id, 1)]) })).rejects.toMatchObject({ status: 403 }); });
    // no sales:void / sales:update / sales:return
    await act(async () => { await expect(api.result.current.voidSale(sale.id)).rejects.toMatchObject({ status: 403 }); });
    await act(async () => { await expect(api.result.current.update(sale.id, { items: buildSaleItems([line(product.id, 1)]) })).rejects.toMatchObject({ status: 403 }); });

    await login(northClerk.username, northClerk.password);
    // a north user cannot read main-branch sales or list them with a foreign branch header
    await expect(apiFetch(`/sales/${sale.id}`)).rejects.toMatchObject({ status: expect.any(Number) });
    const list = await renderHook(() => useSalesPage({ branchId: t.main.id, page: 1, limit: 10 }), { wrapper: liveWrapper() });
    await waitFor(() => expect(list.result.current.error ?? list.result.current.sales).toBeTruthy());
    expect(list.result.current.sales.filter((s) => s.branchId === t.main.id)).toHaveLength(0);
    await login(t.admin.username, t.admin.password);
  });

  it('the stock transfer slip PDF downloads through the shared helper path', async () => {
    const batch = (await batchesOf(t.main.id)).find((b) => b.quantity > 0)!;
    const transfer = await apiFetch<{ _id: string }>('/inventory/transfers', { method: 'POST', body: { fromBranchId: t.main.id, toBranchId: t.north.id, lines: [{ batchId: batch.id, quantity: 1 }] } });
    const bytes = new Uint8Array(await apiFetchBytes(`/inventory/transfers/${transfer._id}/pdf`));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF');
  });

  it('customers are listed for the sale branch only', async () => {
    const mainCustomers = await renderHook(() => useCustomers(t.main.id), { wrapper: W });
    await waitFor(() => expect(mainCustomers.result.current.customers.some((c) => c.id === customer.id)).toBe(true));
    const north = await apiFetch<Customer[]>('/customers', { headers: { 'X-Branch-Id': t.north.id } });
    expect(north.some((c) => c.id === customer.id)).toBe(false);
  });
});
