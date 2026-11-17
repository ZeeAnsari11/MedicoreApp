/**
 * Live contract test for Products / Manufacturers / Vendors against a REAL Medicore API (skipped unless LIVE_API_URL is set).
 *
 *   LIVE_API_URL=http://127.0.0.1:4100/api LIVE_PLATFORM_USER=platform LIVE_PLATFORM_PASSWORD=... npx jest src/__tests__/live
 *
 * Point it at a throwaway database: it creates a tenant, branches, a role, users and catalog records.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { apiFetch } from '@/api/client';
import { useManufacturers } from '@/features/manufacturers/use-manufacturers';
import { buildManufacturerCreate, buildManufacturerUpdate, manufacturerDefaults } from '@/features/manufacturers/schema';
import { buildCreateProduct, buildUpdateProduct, productDefaults } from '@/features/products/schema';
import { useProducts } from '@/features/products/use-products';
import { useCategories } from '@/features/categories/use-categories';
import { useVendorProductsForVendor, useVendorSearchByProduct, useVendorSummary } from '@/features/vendor-products/use-vendor-products';
import { buildVendorCreate, vendorDefaults } from '@/features/vendors/schema';
import { useVendors } from '@/features/vendors/use-vendors';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { LIVE_LOCATION } from '@/test-support/live';
import { ProductStatus } from '@/types/medicore';
import type { AuthResponse, Branch, Product } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: process.env.LIVE_API_URL ?? '', API_URL_CONFIGURED: !!process.env.LIVE_API_URL, REQUEST_TIMEOUT_MS: 20000 }));


// jest-expo swaps in Expo's fetch, which does not return a real Response under Node; use a minimal http-based fetch.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http') as typeof import('node:http');
const nodeFetch = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}) =>
  new Promise<Response>((resolve, reject) => {
    const req = http.request(url, { method: init.method ?? 'GET', headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: res.statusMessage ?? '',
          headers: { get: (k: string) => (res.headers[k.toLowerCase()] as string | undefined) ?? null },
          json: async () => JSON.parse(text),
          text: async () => text,
        } as unknown as Response);
      });
    });
    req.on('error', reject);
    init.signal?.addEventListener('abort', () => req.destroy(new Error('aborted')));
    if (init.body) req.write(init.body);
    req.end();
  });
globalThis.fetch = nodeFetch as unknown as typeof fetch;

const live = process.env.LIVE_API_URL ? describe : describe.skip;
jest.setTimeout(60000);

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return Wrapper;
};
const toasts = () => useToastStore.getState().toasts.map((t) => t.text);
const login = async (username: string, password: string) => {
  const res = await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: { username, password }, auth: false });
  await useSessionStore.getState().setToken(res.accessToken);
  useBranchStore.setState({ selection: null });
  useToastStore.setState({ toasts: [] });
};

live('catalog modules against the real API', () => {
  const suffix = Date.now().toString(36);
  let mainBranch: Branch;
  let northBranch: Branch;
  let branchUser = { username: `cashier${suffix}`, password: '' };

  beforeAll(async () => {
   try {
    useSessionStore.setState({ hydrated: true, token: null, impersonationToken: null });
    await login(process.env.LIVE_PLATFORM_USER ?? 'platform', process.env.LIVE_PLATFORM_PASSWORD ?? '');
    const tenant = await apiFetch<{ temporaryPassword: string }>('/platform/tenants', {
      method: 'POST',
      body: { tenantName: `Live Pharma ${suffix}`, adminFullName: 'Live Admin', adminUsername: `liveadmin${suffix}` },
    });
    await login(`liveadmin${suffix}`, tenant.temporaryPassword);
    const branches = await apiFetch<Branch[]>('/branches');
    mainBranch = branches[0] ?? (await apiFetch<Branch>('/branches', { method: 'POST', body: { name: 'Main', code: 'MN', isMain: true } }));
    northBranch = await apiFetch<Branch>('/branches', { method: 'POST', body: { name: 'North', code: `N${suffix}`.slice(0, 6).toUpperCase() } });
    // A restricted role: catalog read/create/update but NOT products:edit_prices.
    const role = await apiFetch<{ id: string }>('/roles', {
      method: 'POST',
      body: { name: `Catalog clerk ${suffix}`, allowedModules: ['products:read', 'products:create', 'products:update', 'manufacturers:read', 'manufacturers:create', 'vendors:read', 'vendors:create', 'vendors:update', 'branches:read'] },
    });
    const user = await apiFetch<{ temporaryPassword: string }>('/users', {
      method: 'POST',
      body: { username: branchUser.username, fullName: 'Clerk', ...LIVE_LOCATION, tenantRole: 'TENANT_USER', roleId: role.id, branchId: mainBranch.id },
    });
    branchUser = { ...branchUser, password: user.temporaryPassword };
    await login(`liveadmin${suffix}`, tenant.temporaryPassword);
   } catch (e) { console.log('SETUP FAIL', String(e), JSON.stringify(e)); throw e; }
  });

  it('Manufacturers: create, duplicate rejected, update, status, alsoCreateVendor', async () => {
    const { result } = await renderHook(() => useManufacturers(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const values = { ...manufacturerDefaults(undefined, mainBranch.id), name: `GSK ${suffix}`, country: 'UK' };
    let created!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { created = await result.current.create(buildManufacturerCreate(values)); });
    expect(created).toMatchObject({ name: `GSK ${suffix}`, branchId: mainBranch.id, country: 'UK', isActive: true });

    await act(async () => { await expect(result.current.create(buildManufacturerCreate(values))).rejects.toMatchObject({ status: 409 }); });
    expect(toasts().join()).toMatch(/already exists/);

    const edited = { ...manufacturerDefaults(created), country: 'Ireland' };
    await act(async () => { await result.current.update(created.id, buildManufacturerUpdate(edited, created)); });
    await waitFor(() => expect(result.current.manufacturers.find((m) => m.id === created.id)?.country).toBe('Ireland'));

    await act(async () => { await result.current.setStatus(created.id, false); });
    await waitFor(() => expect(result.current.manufacturers.find((m) => m.id === created.id)?.isActive).toBe(false));

    await act(async () => { await result.current.create(buildManufacturerCreate({ ...manufacturerDefaults(undefined, mainBranch.id), name: `Both ${suffix}` }, true)); });
    const vendors = await apiFetch<{ company: string }[]>('/vendors');
    expect(vendors.map((v) => v.company)).toContain(`Both ${suffix}`);
  });

  it('Products + categories + vendor pricing: full lifecycle with the server rules', async () => {
    const mfr = await apiFetch<{ id: string }>('/manufacturers', { method: 'POST', body: { name: `Reckitt ${suffix}`, branchId: mainBranch.id } });
    const cat = await renderHook(() => useCategories(), { wrapper: wrapper() });
    await waitFor(() => expect(cat.result.current.isLoading).toBe(false));
    let category!: { id: string };
    await act(async () => { category = await cat.result.current.create({ name: `Analgesics ${suffix}` }); });

    const products = await renderHook(() => useProducts(), { wrapper: wrapper() });
    await waitFor(() => expect(products.result.current.isLoading).toBe(false));
    const form = { ...productDefaults(undefined, mainBranch.id), name: `Panadol ${suffix}`, genericName: 'Paracetamol', manufacturerId: mfr.id, categoryId: category.id, unit: 'tablet', barcode: `890${suffix}`, tp: '10', cp: '8', rp: '12' };
    let product!: Product;
    await act(async () => { product = await products.result.current.create(buildCreateProduct(form)); });
    expect(product).toMatchObject({ name: `Panadol ${suffix}`, tp: 10, cp: 8, rp: 12, status: ProductStatus.ACTIVE, branchId: mainBranch.id });
    expect(product.manufacturerId).toBe(mfr.id);

    // duplicate barcode in the same branch -> 409
    await act(async () => { await expect(products.result.current.create(buildCreateProduct({ ...form, name: `Other ${suffix}` }))).rejects.toMatchObject({ status: 409 }); });
    // backend price rule (bypassing the client check) -> 400 with its message
    await act(async () => { await expect(products.result.current.create(buildCreateProduct({ ...form, name: `Bad ${suffix}`, barcode: '', tp: '5' }))).rejects.toMatchObject({ status: 400 }); });
    expect(toasts().join()).toMatch(/must be at least the cost price/);

    // update as admin (prices allowed) + status
    await act(async () => { await products.result.current.update(product.id, buildUpdateProduct({ ...productDefaults(product), tp: '11', rp: '13' }, { priceLocked: false })); });
    await act(async () => { await products.result.current.setStatus(product.id, ProductStatus.DISCONTINUED); });
    const reread = await apiFetch<Product[]>(`/products?search=${encodeURIComponent('paracetamol')}`);
    expect(reread.find((p) => p.id === product.id)).toMatchObject({ tp: 11, rp: 13, status: ProductStatus.DISCONTINUED });

    // vendor + pricing links
    const vendors = await renderHook(() => useVendors(mainBranch.id), { wrapper: wrapper() });
    await waitFor(() => expect(vendors.result.current.isLoading).toBe(false));
    let vendor!: { id: string; company: string };
    await act(async () => { vendor = await vendors.result.current.create(buildVendorCreate({ ...vendorDefaults(undefined, mainBranch.id), company: `City Pharma ${suffix}`, distributorType: 'Distributor' })); });
    await act(async () => { await vendors.result.current.update(vendor.id, { contactPhone: '0300' }); });
    await act(async () => { await vendors.result.current.setStatus(vendor.id, false); });
    await act(async () => { await vendors.result.current.setStatus(vendor.id, true); });
    await act(async () => { await expect(vendors.result.current.create(buildVendorCreate({ ...vendorDefaults(undefined, mainBranch.id), company: `City Pharma ${suffix}` }))).rejects.toMatchObject({ status: 409 }); });

    const links = await renderHook(() => useVendorProductsForVendor(vendor.id), { wrapper: wrapper() });
    await waitFor(() => expect(links.result.current.isLoading).toBe(false));
    let link!: { id: string };
    await act(async () => { link = await links.result.current.create({ vendorId: vendor.id, productId: product.id, purchasePrice: 7.5 }); });
    await act(async () => { await expect(links.result.current.create({ vendorId: vendor.id, productId: product.id, purchasePrice: 7.5 })).rejects.toMatchObject({ status: 409 }); });
    await act(async () => { await links.result.current.update(link.id, { purchasePrice: 7, isPreferred: true }); });
    await waitFor(() => expect(links.result.current.vendorProducts[0]).toMatchObject({ purchasePrice: 7, isPreferred: true }));

    const summary = await renderHook(() => useVendorSummary(), { wrapper: wrapper() });
    await waitFor(() => expect(summary.result.current.get(product.id)?.[0]).toMatchObject({ company: vendor.company, purchasePrice: 7 }));
    const search = await renderHook(() => useVendorSearchByProduct('panadol', true), { wrapper: wrapper() });
    await waitFor(() => expect(search.result.current.results.map((r) => r.vendorId)).toContain(vendor.id));

    await act(async () => { await links.result.current.remove(link.id); });
    await waitFor(() => expect(links.result.current.vendorProducts).toHaveLength(0));
  });

  it('Permissions and branch isolation for a restricted branch user', async () => {
    const adminPass = useSessionStore.getState().token;
    await login(branchUser.username, branchUser.password);
    const me = await apiFetch<{ branchId?: string; permissions: string[] }>('/auth/me');
    expect(me.branchId).toBe(mainBranch.id);
    expect(me.permissions).not.toContain('products:edit_prices');

    // the clerk can list catalog, but a price change is refused with the backend's message
    const list = await apiFetch<Product[]>('/products');
    const target = list[0];
    const products = await renderHook(() => useProducts(), { wrapper: wrapper() });
    await waitFor(() => expect(products.result.current.isLoading).toBe(false));
    await act(async () => { await expect(products.result.current.update(target.id, { tp: 99 })).rejects.toMatchObject({ status: 403 }); });
    expect(toasts().join()).toMatch(/permission to edit prices/);
    // the non-price payload the app builds when prices are locked is accepted
    await act(async () => { await products.result.current.update(target.id, buildUpdateProduct({ ...productDefaults(target), name: `${target.name} x` }, { priceLocked: true })); });

    // branch isolation: creating in another branch is refused; no vendors:... permission (e.g. roles) is refused too
    await act(async () => { await expect(products.result.current.create(buildCreateProduct({ ...productDefaults(undefined, northBranch.id), name: `Nope ${suffix}`, genericName: 'x', manufacturerId: target.manufacturerId, unit: 'u', tp: '2', cp: '1', rp: '3' }))).rejects.toMatchObject({ status: 403 }); });
    await expect(apiFetch('/roles')).rejects.toMatchObject({ status: 403 });
    // a foreign X-Branch-Id on a read is refused
    useBranchStore.setState({ selection: northBranch.id });
    await expect(apiFetch('/products')).rejects.toMatchObject({ status: 403 });
    useBranchStore.setState({ selection: null });
    void adminPass;
  });
});
