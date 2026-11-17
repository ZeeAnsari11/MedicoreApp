import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { usePendingOrderSummary, usePendingOrders, usePendingOrdersPreview, useProcessOrders } from '@/features/process-orders/use-process-orders';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { TenantRole } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));

interface Call { method: string; path: string; headers: Record<string, string>; body: unknown }
const calls: Call[] = [];
type Handler = (call: Call) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};

beforeEach(() => {
  calls.length = 0;
  routes = { 'GET /auth/me': () => ({ body: { userId: 'u1', tenantId: 't1', username: 'a', tenantRole: TenantRole.TENANT_SUPER_ADMIN, permissions: [] } }) };
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

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return Wrapper;
};
const callsTo = (method: string, path: string) => calls.filter((c) => c.method === method && c.path.split('?')[0] === path);
const params = (call: Call) => Object.fromEntries(new URLSearchParams(call.path.split('?')[1]));
const toastTexts = () => useToastStore.getState().toasts.map((t) => t.text);

describe('pending order reads', () => {
  it('summary sends the date and branch, with the viewing-branch header', async () => {
    useBranchStore.setState({ selection: 'b2' });
    routes['GET /sales/orders/summary'] = () => ({ body: [{ orderBookerId: 'o1', orderBookerName: 'Ali', count: 2 }] });
    const { result } = await renderHook(() => usePendingOrderSummary('2026-11-15', 'b2'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.summary).toHaveLength(1));
    const call = callsTo('GET', '/sales/orders/summary')[0];
    expect(params(call)).toEqual({ date: '2026-11-15', branchId: 'b2' });
    expect(call.headers['X-Branch-Id']).toBe('b2');
  });

  it('an admin viewing all branches sends no branchId', async () => {
    routes['GET /sales/orders/summary'] = () => ({ body: [] });
    await renderHook(() => usePendingOrderSummary('2026-11-15', null), { wrapper: wrapper() });
    await waitFor(() => expect(callsTo('GET', '/sales/orders/summary')).toHaveLength(1));
    expect(params(callsTo('GET', '/sales/orders/summary')[0])).toEqual({ date: '2026-11-15' });
  });

  it('does not call the API for an invalid date', async () => {
    await renderHook(() => usePendingOrderSummary('2026-02-31', null), { wrapper: wrapper() });
    await renderHook(() => usePendingOrders('', 'o1', null), { wrapper: wrapper() });
    await waitFor(() => expect(callsTo('GET', '/auth/me').length).toBeGreaterThanOrEqual(0));
    expect(callsTo('GET', '/sales/orders/summary')).toHaveLength(0);
    expect(callsTo('GET', '/sales/orders')).toHaveLength(0);
  });

  it('the order list needs a booker and sends orderBookerId', async () => {
    routes['GET /sales/orders'] = () => ({ body: [{ id: 's1', orderNumber: 'PO-M-000001', placedAt: '2026-11-15T05:00:00Z', itemCount: 1, grandTotal: 10 }] });
    const none = await renderHook(() => usePendingOrders('2026-11-15', null, 'b1'), { wrapper: wrapper() });
    expect(none.result.current.orders).toEqual([]);
    expect(callsTo('GET', '/sales/orders')).toHaveLength(0);
    const { result } = await renderHook(() => usePendingOrders('2026-11-15', 'o1', 'b1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    expect(params(callsTo('GET', '/sales/orders')[0])).toEqual({ date: '2026-11-15', orderBookerId: 'o1', branchId: 'b1' });
  });

  it('a failed read is exposed as an error, not an empty list', async () => {
    routes['GET /sales/orders/summary'] = () => ({ status: 403, body: { message: 'Insufficient permissions' } });
    const { result } = await renderHook(() => usePendingOrderSummary('2026-11-15', null), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(callsTo('GET', '/sales/orders/summary')).toHaveLength(1);
  });

  it('the preview is only fetched while it is open', async () => {
    routes['GET /sales/orders/preview'] = () => ({ body: [] });
    const { rerender } = await renderHook((p: { open: boolean }) => usePendingOrdersPreview('2026-11-15', 'o1', null, p.open), { wrapper: wrapper(), initialProps: { open: false } });
    expect(callsTo('GET', '/sales/orders/preview')).toHaveLength(0);
    await rerender({ open: true });
    await waitFor(() => expect(callsTo('GET', '/sales/orders/preview')).toHaveLength(1));
  });
});

describe('confirm / reject', () => {
  it('confirm posts once, with branchId in the body and no branch header, and toasts the backend count', async () => {
    routes['POST /sales/orders/confirm'] = () => ({ body: { processed: 2 } });
    const { result } = await renderHook(() => useProcessOrders('b1'), { wrapper: wrapper() });
    await act(async () => { await result.current.confirm(['s1', 's2']); });
    const posts = callsTo('POST', '/sales/orders/confirm');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ saleIds: ['s1', 's2'], branchId: 'b1' });
    expect(posts[0].headers['X-Branch-Id']).toBeUndefined();
    expect(toastTexts()).toEqual(['2 orders confirmed']);
  });

  it('reject posts to /reject; with no branch selected the body has no branchId', async () => {
    routes['POST /sales/orders/reject'] = () => ({ body: { processed: 1 } });
    const { result } = await renderHook(() => useProcessOrders(null), { wrapper: wrapper() });
    await act(async () => { await result.current.reject(['s1']); });
    expect(callsTo('POST', '/sales/orders/reject')[0].body).toEqual({ saleIds: ['s1'] });
    expect(callsTo('POST', '/sales/orders/confirm')).toHaveLength(0);
    expect(toastTexts()).toEqual(['1 order rejected']);
  });

  it('the toast reports what the backend processed, not what was selected', async () => {
    routes['POST /sales/orders/confirm'] = () => ({ body: { processed: 1 } });
    const { result } = await renderHook(() => useProcessOrders('b1'), { wrapper: wrapper() });
    await act(async () => { await result.current.confirm(['s1', 's1']); });
    expect(toastTexts()).toEqual(['1 order confirmed']);
  });

  it('a 409 (order no longer pending) shows the server message, is never retried and never reports success', async () => {
    routes['POST /sales/orders/confirm'] = () => ({ status: 409, body: { message: 'Some of the selected orders are no longer pending — refresh and try again' } });
    const { result } = await renderHook(() => useProcessOrders('b1'), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.confirm(['s1'])).rejects.toBeTruthy(); });
    expect(callsTo('POST', '/sales/orders/confirm')).toHaveLength(1);
    expect(toastTexts()).toEqual(['Some of the selected orders are no longer pending — refresh and try again']);
  });

  it.each([
    ['403 for a foreign branch', 403, 'You do not have access to that branch'],
    ['403 without permission', 403, 'Insufficient permissions'],
    ['500', 500, 'Internal server error'],
  ])('%s is surfaced and not retried', async (_name, status, message) => {
    routes['POST /sales/orders/reject'] = () => ({ status, body: { message } });
    const { result } = await renderHook(() => useProcessOrders('b9'), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.reject(['s1'])).rejects.toBeTruthy(); });
    expect(callsTo('POST', '/sales/orders/reject')).toHaveLength(1);
    expect(toastTexts()).toEqual([message]);
  });

  it('a network failure is reported as an error', async () => {
    const { result } = await renderHook(() => useProcessOrders('b1'), { wrapper: wrapper() });
    (global.fetch as jest.Mock).mockImplementationOnce(async () => { throw new TypeError('Network request failed'); });
    await act(async () => { await expect(result.current.confirm(['s1'])).rejects.toBeTruthy(); });
    expect(toastTexts()).toHaveLength(1);
    expect(toastTexts()[0]).not.toMatch(/confirmed/);
  });

  it('exposes a processing flag while the request is in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    routes['POST /sales/orders/confirm'] = () => ({ body: { processed: 1 } });
    const { result } = await renderHook(() => useProcessOrders('b1'), { wrapper: wrapper() });
    const base = global.fetch as jest.Mock;
    const impl = base.getMockImplementation()!;
    base.mockImplementation(async (url: string, init: RequestInit) => { if (init.method === 'POST') await gate; return impl(url, init); });
    let pending: Promise<unknown> = Promise.resolve();
    act(() => { pending = result.current.confirm(['s1']); });
    await waitFor(() => expect(result.current.isProcessing).toBe(true));
    expect(toastTexts()).toEqual([]);
    await act(async () => { release(); await pending; });
    await waitFor(() => expect(result.current.isProcessing).toBe(false));
  });
});
