/**
 * Live contract test for SSR against a REAL Medicore API (skipped unless LIVE_API_URL is set).
 *
 *   LIVE_API_URL=http://127.0.0.1:4100/api LIVE_PLATFORM_USER=platform LIVE_PLATFORM_PASSWORD=... npx jest src/__tests__/live/ssr.live
 *
 * Point it at a throwaway database. Setup (product,
 * stock, an invoiced sale) goes straight to the backend endpoints; the report and invoice reads use the app's hooks.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { apiFetch, apiFetchBytes } from '@/api/client';
import { adjustmentDefaults, buildAdjustment } from '@/features/inventory/schema';
import { useAdjustStock } from '@/features/inventory/use-inventory';
import { buildSaleItems, type SaleLine } from '@/features/sales/sale-lines';
import { defaultSsrRange } from '@/features/ssr/ssr-dates';
import { ssrExportPath, useSsr, useSsrInvoices } from '@/features/ssr/use-ssr';
import { createClerk, createLiveTenant, installNodeFetch, liveWrapper, login, type LiveTenant } from '@/test-support/live';
import { PaymentMethod, PaymentStatus } from '@/types/medicore';
import type { Customer, Product, Sale } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: process.env.LIVE_API_URL ?? '', API_URL_CONFIGURED: !!process.env.LIVE_API_URL, REQUEST_TIMEOUT_MS: 20000 }));

installNodeFetch();
const live = process.env.LIVE_API_URL ? describe : describe.skip;
jest.setTimeout(120000);

const line = (productId: string, quantity: number): SaleLine => ({ key: `l${productId}${quantity}`, productId, productName: 'x', quantity, unitPrice: 0, priceExplicit: false });

live('SSR against the real API', () => {
  let t: LiveTenant;
  let product: Product;
  let sale: Sale;
  const W = () => liveWrapper();
  const range = defaultSsrRange();
  const base = () => ({ from: range.from, to: range.to, branchId: t.main.id });

  beforeAll(async () => {
    t = await createLiveTenant('ssr');
    const mfr = await apiFetch<{ id: string }>('/manufacturers', { method: 'POST', body: { name: `Mfr ${t.suffix}`, branchId: t.main.id } });
    product = await apiFetch<Product>('/products', { method: 'POST', body: { name: `Panadol ${t.suffix}`, genericName: 'Paracetamol', manufacturerId: mfr.id, unit: 'tablet', tp: 10, cp: 8, rp: 12, minStockLevel: 5, branchId: t.main.id } });
    const customer = await apiFetch<Customer>('/customers', { method: 'POST', body: { name: `Cust ${t.suffix}`, branchId: t.main.id, isDealer: false } });
    const adjust = await renderHook(() => useAdjustStock(), { wrapper: W() });
    await act(async () => {
      await adjust.result.current.adjust(buildAdjustment({ ...adjustmentDefaults({ branchId: t.main.id, productId: product.id }), operation: 'add', batchNumber: 'B1', expiryDate: '2030-12-31', quantity: '100' }));
    });
    const pending = await apiFetch<Sale>('/sales', { method: 'POST', body: { branchId: t.main.id, paymentMethod: PaymentMethod.CASH, paymentStatus: PaymentStatus.UNPAID, customerId: customer.id, items: buildSaleItems([line(product.id, 4)]) } });
    await apiFetch('/sales/orders/confirm', { method: 'POST', body: { saleIds: [pending.id], branchId: t.main.id } });
    sale = await apiFetch<Sale>(`/sales/${pending.id}?branchId=${t.main.id}`);
  });

  it('the product view lists the product sold today, and the totals equal the sum of the rows', async () => {
    const api = await renderHook(() => useSsr({ ...base(), view: 'product', sort: 'netSaleValue:desc', page: '1' }, true), { wrapper: W() });
    await waitFor(() => expect(api.result.current.report).toBeTruthy());
    const row = api.result.current.report!.rows.find((r) => r.key === product.id)!;
    expect(row.netSale).toBe(4);
    const sum = api.result.current.report!.rows.reduce((s, r) => s + r.netSaleValue, 0);
    expect(Math.abs(sum - api.result.current.report!.totals.netSaleValue)).toBeLessThan(0.01);
    expect(api.result.current.report!.warnings).toEqual([]);
  });

  it('every view reconciles to the same grand total', async () => {
    const totals: number[] = [];
    for (const view of ['manufacturer', 'vendor', 'product', 'grouped']) {
      const api = await renderHook(() => useSsr({ ...base(), view }, true), { wrapper: W() });
      await waitFor(() => expect(api.result.current.report).toBeTruthy());
      totals.push(api.result.current.report!.totals.netSaleValue);
    }
    expect(new Set(totals.map((n) => n.toFixed(2))).size).toBe(1);
  });

  it('the drilldown returns the invoice behind the product row', async () => {
    const api = await renderHook(() => useSsrInvoices(product.id, base()), { wrapper: W() });
    await waitFor(() => expect(api.result.current.invoices.length).toBeGreaterThan(0));
    expect(api.result.current.invoices.some((i) => i.id === sale.id && i.unitsSold === 4)).toBe(true);
  });

  it('a reversed range is refused by the backend', async () => {
    await expect(apiFetch(`/reports/ssr?from=2026-12-31&to=2026-01-01&view=product`)).rejects.toBeTruthy();
  });

  it('exports CSV bytes, and a clerk without ssr:export or ssr:read is refused', async () => {
    const bytes = await apiFetchBytes(ssrExportPath({ ...base(), view: 'product' }, 'csv'));
    expect(bytes.byteLength).toBeGreaterThan(0);
    const noExport = await createClerk(`${t.suffix}a`, t.main.id, ['ssr:read']);
    const none = await createClerk(`${t.suffix}b`, t.main.id, ['sales:read']);
    await login(noExport.username, noExport.password);
    await expect(apiFetchBytes(ssrExportPath({ ...base(), view: 'product' }, 'csv'))).rejects.toBeTruthy();
    await login(none.username, none.password);
    await expect(apiFetch(`/reports/ssr?from=${range.from}&to=${range.to}&view=product`)).rejects.toBeTruthy();
    await login(t.admin.username, t.admin.password);
  });

  it('a clerk on another branch cannot read this branch', async () => {
    const north = await createClerk(`${t.suffix}c`, t.north.id, ['ssr:read']);
    await login(north.username, north.password);
    await expect(apiFetch(`/reports/ssr?from=${range.from}&to=${range.to}&view=product&branchId=${t.main.id}`)).rejects.toBeTruthy();
    await login(t.admin.username, t.admin.password);
  });
});
