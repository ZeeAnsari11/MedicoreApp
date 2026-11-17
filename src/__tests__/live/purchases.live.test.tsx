/**
 * Live contract test for Purchases against a REAL Medicore API (skipped unless LIVE_API_URL is set).
 *
 *   LIVE_API_URL=http://127.0.0.1:4100/api LIVE_PLATFORM_USER=platform LIVE_PLATFORM_PASSWORD=... npx jest src/__tests__/live/purchases.live
 *
 * Point it at a throwaway database.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { apiFetch } from '@/api/client';
import { usePurchase, usePurchaseMutations, usePurchasesPage } from '@/features/purchases/use-purchases';
import { createClerk, createLiveTenant, installNodeFetch, liveWrapper, login, toasts, type LiveTenant } from '@/test-support/live';
import { PaymentStatus, ReturnReasonCode } from '@/types/medicore';
import type { Product, Purchase } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: process.env.LIVE_API_URL ?? '', API_URL_CONFIGURED: !!process.env.LIVE_API_URL, REQUEST_TIMEOUT_MS: 20000 }));

installNodeFetch();
const live = process.env.LIVE_API_URL ? describe : describe.skip;
jest.setTimeout(120000);

live('purchases against the real API', () => {
  let t: LiveTenant;
  let product: Product;
  let vendorId: string;
  let northVendorId: string;
  let W = liveWrapper();
  beforeEach(() => { W = liveWrapper(); });

  const item = (batchNumber: string, quantity = 10, purchasePrice = 8) => ({ productId: product.id, batchNumber, expiryDate: '2031-12-31', quantity, purchasePrice, sellingPrice: 12 });
  const receive = (over: Record<string, unknown> = {}) => ({ branchId: t.main.id, vendorId, purchaseDate: new Date().toISOString().slice(0, 10), paymentStatus: PaymentStatus.UNPAID, items: [item(`B${Date.now() % 100000}`)], ...over });

  beforeAll(async () => {
    t = await createLiveTenant('pu');
    const mfr = await apiFetch<{ id: string }>('/manufacturers', { method: 'POST', body: { name: `Mfr ${t.suffix}`, branchId: t.main.id } });
    product = await apiFetch<Product>('/products', { method: 'POST', body: { name: `Panadol ${t.suffix}`, genericName: 'Paracetamol', manufacturerId: mfr.id, unit: 'tablet', tp: 10, cp: 8, rp: 12, minStockLevel: 5, branchId: t.main.id } });
    const vendor = await apiFetch<{ id: string }>('/vendors', { method: 'POST', body: { company: `Acme ${t.suffix}`, branchId: t.main.id } });
    vendorId = vendor.id;
    await apiFetch('/vendor-products', { method: 'POST', body: { vendorId, productId: product.id, purchasePrice: 8 } });
    const northVendor = await apiFetch<{ id: string }>('/vendors', { method: 'POST', body: { company: `North ${t.suffix}`, branchId: t.north.id } });
    northVendorId = northVendor.id;
    await login(t.admin.username, t.admin.password);
  });

  it('receives a purchase (status RECEIVED), then lists it with the server filters', async () => {
    const api = await renderHook(() => usePurchaseMutations(t.main.id), { wrapper: W });
    let created!: Purchase;
    await act(async () => { created = await api.result.current.create(receive()) as unknown as Purchase; });
    expect(created.status).toBe('RECEIVED');
    expect(toasts()[0]).toMatch(/^Purchase .+ received/);
    const page = await renderHook(() => usePurchasesPage({ branchId: t.main.id, paymentStatus: 'UNPAID', page: 1, limit: 10 }), { wrapper: W });
    // useTenantQuery waits for /auth/me before fetching, so wait for the data rather than calling refetch() early.
    await waitFor(() => expect(page.result.current.purchases.map((p) => p.id)).toContain(created.id));
  });

  it('a vendor from another branch is rejected and nothing is created', async () => {
    const api = await renderHook(() => usePurchaseMutations(t.main.id), { wrapper: W });
    await act(async () => { await expect(api.result.current.create(receive({ vendorId: northVendorId }))).rejects.toBeTruthy(); });
  });

  it('an unpaid purchase is editable; a payment locks it; payments over the outstanding are rejected', async () => {
    const api = await renderHook(() => usePurchaseMutations(t.main.id), { wrapper: W });
    let created!: Purchase;
    await act(async () => { created = await api.result.current.create(receive()) as unknown as Purchase; });
    const total = created.grandTotal;
    await act(async () => { await api.result.current.recordPayment(created.id, { paymentStatus: PaymentStatus.PARTIAL, amountPaid: 10 }); });
    const detail = await renderHook(() => usePurchase(created.id, t.main.id), { wrapper: W });
    await waitFor(() => expect(detail.result.current.purchase?.isEditable).toBe(false));
    await act(async () => { await expect(api.result.current.recordPayment(created.id, { paymentStatus: PaymentStatus.PAID, amountPaid: total + 1000 })).rejects.toBeTruthy(); });
  });

  it('returns part of a batch, and returning more than is left is rejected', async () => {
    const api = await renderHook(() => usePurchaseMutations(t.main.id), { wrapper: W });
    let created!: Purchase;
    await act(async () => { created = await api.result.current.create(receive()) as unknown as Purchase; });
    const batchId = created.items[0].batchId as string;
    const dto = (quantity: number) => ({ purchaseId: created.id, branchId: t.main.id, reasonCode: ReturnReasonCode.DAMAGED, settlement: { mode: 'ADJUST' }, items: [{ productId: product.id, batchId, quantity }] });
    await act(async () => { await api.result.current.createReturn(created.id, dto(4) as never); });
    await act(async () => { await expect(api.result.current.createReturn(created.id, dto(7) as never)).rejects.toBeTruthy(); });
  });

  it('a branch clerk cannot see or receive into another branch', async () => {
    const clerk = await createClerk(t.suffix, t.north.id, ['purchases:read', 'purchases:create', 'vendors:read', 'products:read', 'branches:read']);
    await login(clerk.username, clerk.password);
    const api = await renderHook(() => usePurchaseMutations(t.main.id), { wrapper: W });
    await act(async () => { await expect(api.result.current.create(receive())).rejects.toBeTruthy(); });
    await login(t.admin.username, t.admin.password);
  });
});
