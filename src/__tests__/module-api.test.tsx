import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useManufacturers } from '@/features/manufacturers/use-manufacturers';
import { useProducts } from '@/features/products/use-products';
import { useVendorProductsForVendor, useVendorSearchByProduct, useVendorSummary } from '@/features/vendor-products/use-vendor-products';
import { useVendors } from '@/features/vendors/use-vendors';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { ProductStatus, TenantRole } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));

interface Call { method: string; path: string; headers: Record<string, string>; body: unknown }
const calls: Call[] = [];
type Handler = (call: Call) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};

const me = { userId: 'u1', tenantId: 't1', username: 'admin', tenantRole: TenantRole.TENANT_SUPER_ADMIN, permissions: [] };

beforeEach(() => {
  calls.length = 0;
  routes = { 'GET /auth/me': () => ({ body: me }) };
  useSessionStore.setState({ hydrated: true, token: 'tok', impersonationToken: null });
  useBranchStore.setState({ selection: null });
  useToastStore.setState({ toasts: [] });
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('http://api.test/api', '');
    const call: Call = { method: init.method ?? 'GET', path, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined };
    calls.push(call);
    const handler = routes[`${call.method} ${path.split('?')[0]}`];
    const { status = 200, body } = handler ? handler(call) : { status: 404, body: { message: 'no route' } };
    return { ok: status < 400, status, statusText: 'x', json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return Wrapper;
}
const callTo = (method: string, path: string) => calls.find((c) => c.method === method && c.path.split('?')[0] === path);
const waitForCall = (method: string, path: string) => waitFor(() => expect(callTo(method, path)).toBeDefined());
const toastTexts = () => useToastStore.getState().toasts.map((t) => t.text);

describe('manufacturers API', () => {
  it('lists tenant manufacturers with the bearer token', async () => {
    routes['GET /manufacturers'] = () => ({ body: [{ id: 'm1', name: 'GSK', isActive: true }] });
    const { result } = await renderHook(() => useManufacturers(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.manufacturers).toHaveLength(1));
    expect(callTo('GET', '/manufacturers')?.headers.Authorization).toBe('Bearer tok');
  });

  it('creates with alsoCreateVendor, never sends the branch header on POST, and refreshes vendors', async () => {
    useBranchStore.setState({ selection: 'b-viewing' });
    routes['GET /manufacturers'] = () => ({ body: [] });
    routes['POST /manufacturers'] = (c) => ({ body: { id: 'm2', ...(c.body as object), isActive: true } });
    const { result } = await renderHook(() => useManufacturers(), { wrapper: wrapper() });
    await waitForCall('GET', '/manufacturers');
    await act(async () => {
      await result.current.create({ name: 'GSK', branchId: 'b1', alsoCreateVendor: true });
    });
    const post = callTo('POST', '/manufacturers')!;
    expect(post.body).toEqual({ name: 'GSK', branchId: 'b1', alsoCreateVendor: true });
    expect(post.headers['X-Branch-Id']).toBeUndefined();
    expect(toastTexts()).toContain('Manufacturer and vendor created');
    // the list read does carry the viewing branch
    expect(callTo('GET', '/manufacturers')?.headers['X-Branch-Id']).toBe('b-viewing');
  });

  it('updates via PATCH and toggles status via PATCH /status', async () => {
    routes['GET /manufacturers'] = () => ({ body: [{ id: 'm1', name: 'GSK', isActive: true }] });
    routes['PATCH /manufacturers/m1'] = () => ({ body: { id: 'm1', name: 'GSK2', isActive: true } });
    routes['PATCH /manufacturers/m1/status'] = (c) => ({ body: { id: 'm1', name: 'GSK2', isActive: (c.body as { isActive: boolean }).isActive } });
    const { result } = await renderHook(() => useManufacturers(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.manufacturers).toHaveLength(1));
    await act(async () => { await result.current.update('m1', { name: 'GSK2' }); });
    expect(callTo('PATCH', '/manufacturers/m1')?.body).toEqual({ name: 'GSK2' });
    await waitFor(() => expect(result.current.manufacturers[0].name).toBe('GSK2'));
    await act(async () => { await result.current.setStatus('m1', false); });
    expect(callTo('PATCH', '/manufacturers/m1/status')?.body).toEqual({ isActive: false });
    await waitFor(() => expect(result.current.manufacturers[0].isActive).toBe(false));
  });

  it('surfaces the server message (409 duplicate, 403 permission) as an error toast and rejects', async () => {
    routes['GET /manufacturers'] = () => ({ body: [] });
    routes['POST /manufacturers'] = () => ({ status: 409, body: { message: 'A manufacturer named "GSK" already exists' } });
    const { result } = await renderHook(() => useManufacturers(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await expect(result.current.create({ name: 'GSK', branchId: 'b1' })).rejects.toMatchObject({ status: 409 });
    });
    expect(toastTexts()).toContain('A manufacturer named "GSK" already exists');
    routes['POST /manufacturers'] = () => ({ status: 403, body: { message: 'Insufficient permissions to create a vendor' } });
    await act(async () => {
      await expect(result.current.create({ name: 'X1', branchId: 'b1', alsoCreateVendor: true })).rejects.toMatchObject({ status: 403 });
    });
    expect(toastTexts()).toContain('Insufficient permissions to create a vendor');
  });
});

describe('products API', () => {
  it('passes filters and a per-call branch override (header) to GET /products', async () => {
    routes['GET /products'] = () => ({ body: [] });
    await renderHook(() => useProducts({ branchId: 'b-vendor', manufacturerId: 'm1', search: 'para' }), { wrapper: wrapper() });
    await waitForCall('GET', '/products');
    const call = callTo('GET', '/products')!;
    expect(call.path).toBe('/products?manufacturerId=m1&search=para');
    expect(call.headers['X-Branch-Id']).toBe('b-vendor');
  });

  it('creates, updates (price-locked payload has no prices) and changes status', async () => {
    routes['GET /products'] = () => ({ body: [] });
    routes['POST /products'] = () => ({ body: { id: 'p1' } });
    routes['PATCH /products/p1'] = () => ({ body: { id: 'p1' } });
    routes['PATCH /products/p1/status'] = () => ({ body: { id: 'p1' } });
    const { result } = await renderHook(() => useProducts(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.create({ branchId: 'b1', name: 'Panadol', genericName: 'Paracetamol', manufacturerId: 'm1', unit: 'tab', tp: 10, cp: 8, rp: 12 }); });
    expect(callTo('POST', '/products')?.body).toMatchObject({ name: 'Panadol', tp: 10 });
    await act(async () => { await result.current.update('p1', { name: 'Panadol Extra' }); });
    expect(callTo('PATCH', '/products/p1')?.body).toEqual({ name: 'Panadol Extra' });
    await act(async () => { await result.current.setStatus('p1', ProductStatus.DISCONTINUED); });
    expect(callTo('PATCH', '/products/p1/status')?.body).toEqual({ status: 'DISCONTINUED' });
    expect(toastTexts()).toEqual(expect.arrayContaining(['Product created', 'Product updated', 'Product status updated']));
  });

  it('shows the backend price-permission and price-rule errors', async () => {
    routes['GET /products'] = () => ({ body: [] });
    routes['PATCH /products/p1'] = () => ({ status: 403, body: { message: 'You do not have permission to edit prices' } });
    const { result } = await renderHook(() => useProducts(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await expect(result.current.update('p1', { tp: 1 })).rejects.toMatchObject({ status: 403 }); });
    expect(toastTexts()).toContain('You do not have permission to edit prices');
    routes['PATCH /products/p1'] = () => ({ status: 400, body: { message: ['Trade price (TP 5) must be at least the cost price (CP 8)'] } });
    await act(async () => { await expect(result.current.update('p1', { tp: 5 })).rejects.toThrow(/Trade price/); });
  });
});

describe('vendors and vendor pricing API', () => {
  it('creates vendors with the branch in the body', async () => {
    routes['GET /vendors'] = () => ({ body: [] });
    routes['POST /vendors'] = () => ({ body: { id: 'v1' } });
    const { result } = await renderHook(() => useVendors('b1'), { wrapper: wrapper() });
    await waitForCall('GET', '/vendors');
    expect(callTo('GET', '/vendors')?.headers['X-Branch-Id']).toBe('b1');
    await act(async () => { await result.current.create({ company: 'City Pharma', branchId: 'b1' }); });
    expect(callTo('POST', '/vendors')?.body).toEqual({ company: 'City Pharma', branchId: 'b1' });
  });

  it('manages vendor-product links: list by vendor, create, update, delete (204)', async () => {
    routes['GET /vendor-products'] = () => ({ body: [{ id: 'l1', vendorId: 'v1', productId: 'p1', purchasePrice: 5, isPreferred: false, isActive: true }] });
    routes['POST /vendor-products'] = () => ({ body: { id: 'l2' } });
    routes['PATCH /vendor-products/l1'] = () => ({ body: { id: 'l1' } });
    routes['DELETE /vendor-products/l1'] = () => ({ status: 204 });
    const { result } = await renderHook(() => useVendorProductsForVendor('v1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.vendorProducts).toHaveLength(1));
    expect(callTo('GET', '/vendor-products')?.path).toBe('/vendor-products?vendorId=v1');
    await act(async () => { await result.current.create({ vendorId: 'v1', productId: 'p2', purchasePrice: 7 }); });
    expect(callTo('POST', '/vendor-products')?.body).toEqual({ vendorId: 'v1', productId: 'p2', purchasePrice: 7 });
    await act(async () => { await result.current.update('l1', { isPreferred: true }); });
    expect(callTo('PATCH', '/vendor-products/l1')?.body).toEqual({ isPreferred: true });
    await act(async () => { await result.current.remove('l1'); });
    expect(callTo('DELETE', '/vendor-products/l1')).toBeDefined();
    expect(toastTexts()).toEqual(expect.arrayContaining(['Vendor pricing added', 'Vendor pricing updated', 'Vendor pricing removed']));
  });

  it('surfaces a duplicate link (409) from the server', async () => {
    routes['GET /vendor-products'] = () => ({ body: [] });
    routes['POST /vendor-products'] = () => ({ status: 409, body: { message: 'This vendor is already linked to this product' } });
    const { result } = await renderHook(() => useVendorProductsForVendor('v1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await expect(result.current.create({ vendorId: 'v1', productId: 'p1', purchasePrice: 1 })).rejects.toMatchObject({ status: 409 }); });
    expect(toastTexts()).toContain('This vendor is already linked to this product');
  });

  it('searches vendors by product only when a term is given, and builds the vendor price summary map', async () => {
    routes['GET /vendor-products/search'] = () => ({ body: [{ vendorId: 'v1', company: 'City', matches: [] }] });
    routes['GET /vendor-products/summary'] = () => ({ body: [{ productId: 'p1', vendors: [{ vendorId: 'v1', company: 'City', purchasePrice: 5 }] }] });
    const idle = await renderHook(() => useVendorSearchByProduct('', false), { wrapper: wrapper() });
    await waitFor(() => expect(idle.result.current.isLoading).toBe(false));
    expect(callTo('GET', '/vendor-products/search')).toBeUndefined();

    const search = await renderHook(() => useVendorSearchByProduct('para', true), { wrapper: wrapper() });
    await waitFor(() => expect(search.result.current.results).toHaveLength(1));
    expect(callTo('GET', '/vendor-products/search')?.path).toBe('/vendor-products/search?product=para&includeInactive=true');

    const summary = await renderHook(() => useVendorSummary(), { wrapper: wrapper() });
    await waitFor(() => expect(summary.result.current.get('p1')?.[0].purchasePrice).toBe(5));
  });
});
