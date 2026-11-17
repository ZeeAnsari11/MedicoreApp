import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { useCustomers } from '@/features/customers/use-customers';
import { useAdjustStock } from '@/features/inventory/use-inventory';
import { useProducts } from '@/features/products/use-products';
import { useCreateTransfer } from '@/features/transfers/use-transfers';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { TenantRole } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));

const me = { userId: 'u1', tenantId: 't1', username: 'admin', tenantRole: TenantRole.TENANT_SUPER_ADMIN, permissions: [] };
const ok: Record<string, unknown> = {
  'GET /auth/me': me,
  'POST /inventory/adjustments': { id: 'bt1' },
  'POST /inventory/transfers': { _id: 'tr1', transferNumber: 'TR-M-000001' },
  'PATCH /products/p1': { id: 'p1' },
  'PATCH /customers/c1': { id: 'c1' },
  'DELETE /customers/c1': undefined,
  'GET /products': [],
  'GET /customers': [],
};

let client: QueryClient;
let invalidated: unknown[][];

beforeEach(() => {
  useSessionStore.setState({ hydrated: true, token: 'tok', impersonationToken: null });
  useBranchStore.setState({ selection: null });
  useToastStore.setState({ toasts: [] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  invalidated = [];
  const original = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((filters?: { queryKey?: unknown[] }) => {
    invalidated.push(filters?.queryKey ?? []);
    return original(filters);
  }) as typeof client.invalidateQueries;
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const key = `${init.method ?? 'GET'} ${url.replace('http://api.test/api', '').split('?')[0]}`;
    const found = key in ok;
    const status = !found ? 404 : init.method === 'DELETE' ? 204 : 200;
    return { ok: found, status, statusText: 'x', json: async () => ok[key] } as unknown as Response;
  }) as unknown as typeof fetch;
});

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

/** Renders `hook` next to useAuth and waits for the tenant, so cache keys carry `t1`. */
async function withTenant<T>(hook: () => T) {
  const r = await renderHook(() => ({ auth: useAuth(), api: hook() }), { wrapper });
  await waitFor(() => expect(r.result.current.auth.user?.tenantId).toBe('t1'));
  invalidated = [];
  return r;
}

describe('cache refresh after writes', () => {
  it('a stock adjustment refreshes inventory, the dashboard and reports', async () => {
    const r = await withTenant(() => useAdjustStock());
    await act(async () => { await r.result.current.api.adjust({ productId: 'p1', branchId: 'b1', batchNumber: 'B1', expiryDate: '2027-12-31', operation: 'add', quantity: 1 }); });
    expect(invalidated).toEqual([['t1', 'inventory'], ['t1', 'dashboard'], ['t1', 'reports']]);
  });

  it('a transfer refreshes inventory, the dashboard and reports', async () => {
    const r = await withTenant(() => useCreateTransfer());
    await act(async () => { await r.result.current.api.create({ fromBranchId: 'b1', toBranchId: 'b2', lines: [{ batchId: 'bt1', quantity: 1 }] }); });
    expect(invalidated).toEqual([['t1', 'inventory'], ['t1', 'dashboard'], ['t1', 'reports']]);
  });

  it('a product edit also refreshes sales, purchases, stock and ledgers', async () => {
    const r = await withTenant(() => useProducts());
    await act(async () => { await r.result.current.api.update('p1', { rp: 13 }); });
    expect(invalidated).toEqual([['t1', 'products'], ['t1', 'sales'], ['t1', 'purchases'], ['t1', 'inventory'], ['t1', 'accounting', 'ledgers']]);
  });

  it.each(['update', 'remove'] as const)('a customer %s also refreshes sales and ledgers', async (action) => {
    const r = await withTenant(() => useCustomers());
    await act(async () => {
      if (action === 'update') await r.result.current.api.update('c1', { name: 'New name' });
      else await r.result.current.api.remove('c1');
    });
    expect(invalidated).toEqual([['t1', 'customers'], ['t1', 'sales'], ['t1', 'accounting', 'ledgers']]);
  });
});
