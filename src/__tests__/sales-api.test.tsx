import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSaleMutations, useSalesPage } from '@/features/sales/use-sales';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { PaymentMethod, PaymentStatus, TenantRole } from '@/types/medicore';

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
const toastTexts = () => useToastStore.getState().toasts.map((t) => t.text);
const dto = { branchId: 'b1', paymentMethod: PaymentMethod.CASH, paymentStatus: PaymentStatus.UNPAID, items: [{ productId: 'p1', quantity: 1 }] };

describe('sales API', () => {
  it('lists with server-side filters and the viewing-branch header', async () => {
    useBranchStore.setState({ selection: 'b2' });
    routes['GET /sales'] = () => ({ body: { items: [{ id: 's1' }], total: 1, page: 1, limit: 20 } });
    const { result } = await renderHook(() => useSalesPage({ branchId: 'b2', paymentStatus: 'PAID', search: 'INV', page: 2, limit: 20 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.sales).toHaveLength(1));
    const call = callsTo('GET', '/sales')[0];
    expect(Object.fromEntries(new URLSearchParams(call.path.split('?')[1]))).toEqual({ page: '2', limit: '20', branchId: 'b2', paymentStatus: 'PAID', search: 'INV' });
    expect(call.headers['X-Branch-Id']).toBe('b2');
  });

  it('create posts once, without a branch header, and reports the pending order only after the backend answers', async () => {
    routes['POST /sales'] = () => ({ body: { id: 's1', invoiceNumber: '', orderNumber: 'PO-M-000001' } });
    const { result } = await renderHook(() => useSaleMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await result.current.create(dto); });
    const posts = callsTo('POST', '/sales');
    expect(posts).toHaveLength(1);
    expect(posts[0].headers['X-Branch-Id']).toBeUndefined();
    expect(posts[0].body).toEqual(dto);
    expect(toastTexts()).toContain('Order PO-M-000001 placed. It is waiting in Process Orders.');
  });

  it('a failed create shows the server message, is never retried, and no success toast appears', async () => {
    routes['POST /sales'] = () => ({ status: 400, body: { message: 'Insufficient stock for Panadol' } });
    const { result } = await renderHook(() => useSaleMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.create(dto)).rejects.toBeTruthy(); });
    expect(callsTo('POST', '/sales')).toHaveLength(1);
    expect(toastTexts()).toEqual(['Insufficient stock for Panadol']);
  });

  it('a 403 from a foreign branch is surfaced, not retried', async () => {
    routes['POST /sales'] = () => ({ status: 403, body: { message: 'Forbidden' } });
    const { result } = await renderHook(() => useSaleMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.create(dto)).rejects.toBeTruthy(); });
    expect(callsTo('POST', '/sales')).toHaveLength(1);
    expect(toastTexts().some((t) => t.includes('Forbidden'))).toBe(true);
  });

  it('edit, payment, void and return target the sale with the branch scope and one request each', async () => {
    routes['PATCH /sales/s1'] = () => ({ body: { invoiceNumber: 'INV-1' } });
    routes['PATCH /sales/s1/payment'] = () => ({ body: {} });
    routes['DELETE /sales/s1'] = () => ({ body: undefined });
    routes['POST /sales/s1/returns'] = () => ({ body: {} });
    const { result } = await renderHook(() => useSaleMutations('b1'), { wrapper: wrapper() });
    await act(async () => {
      await result.current.update('s1', { items: [{ productId: 'p1', quantity: 1 }] });
      await result.current.recordPayment('s1', { paymentStatus: PaymentStatus.PAID, amountPaid: 10, method: PaymentMethod.CASH });
      await result.current.voidSale('s1');
      await result.current.createReturn('s1', { saleId: '', branchId: 'b1' } as never);
    });
    for (const [m, p] of [['PATCH', '/sales/s1'], ['PATCH', '/sales/s1/payment'], ['DELETE', '/sales/s1'], ['POST', '/sales/s1/returns']] as const) expect(callsTo(m, p)).toHaveLength(1);
    expect(callsTo('PATCH', '/sales/s1')[0].path).toContain('branchId=b1');
  });

  it('a 409 on edit is reported with the server reason', async () => {
    routes['PATCH /sales/s1'] = () => ({ status: 409, body: { message: 'Invoice has payments and can no longer be edited' } });
    const { result } = await renderHook(() => useSaleMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.update('s1', { items: [] })).rejects.toBeTruthy(); });
    expect(callsTo('PATCH', '/sales/s1')).toHaveLength(1);
    expect(toastTexts()).toContain('Invoice has payments and can no longer be edited');
  });
});
