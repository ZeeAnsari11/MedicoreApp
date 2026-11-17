import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useLastPurchasePrices, usePurchaseMutations, usePurchasesPage } from '@/features/purchases/use-purchases';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { PaymentStatus, ReturnReasonCode, TenantRole } from '@/types/medicore';

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

const createDto = { branchId: 'b1', vendorId: 'v1', purchaseDate: '2026-11-16', paymentStatus: PaymentStatus.UNPAID, amountPaid: 0, items: [{ productId: 'p1', batchNumber: 'B-1', expiryDate: '2027-01-31', quantity: 10, purchasePrice: 100, sellingPrice: 120 }] };

describe('purchase reads', () => {
  it('lists with server-side filters, the date range names the API expects, and the viewing-branch header', async () => {
    useBranchStore.setState({ selection: 'b2' });
    routes['GET /purchases'] = () => ({ body: { items: [{ id: 'pu1' }], total: 1, page: 2, limit: 20 } });
    const { result } = await renderHook(
      () => usePurchasesPage({ branchId: 'b2', vendorId: 'v1', paymentStatus: 'PAID', returnStatus: 'ANY', status: 'RECEIVED', dateFrom: '2026-11-01', dateTo: '2026-11-16', search: '0001', page: 2, limit: 20 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.purchases).toHaveLength(1));
    const call = callsTo('GET', '/purchases')[0];
    expect(params(call)).toEqual({ page: '2', limit: '20', branchId: 'b2', vendorId: 'v1', paymentStatus: 'PAID', returnStatus: 'ANY', status: 'RECEIVED', dateFrom: '2026-11-01', dateTo: '2026-11-16', search: '0001' });
    expect(call.headers['X-Branch-Id']).toBe('b2');
  });

  it('an admin viewing all branches sends no branchId', async () => {
    routes['GET /purchases'] = () => ({ body: { items: [], total: 0, page: 1, limit: 20 } });
    await renderHook(() => usePurchasesPage({ branchId: null, page: 1, limit: 20 }), { wrapper: wrapper() });
    await waitFor(() => expect(callsTo('GET', '/purchases')).toHaveLength(1));
    expect(params(callsTo('GET', '/purchases')[0])).toEqual({ page: '1', limit: '20' });
  });

  it('a failed list is exposed as an error, not an empty list', async () => {
    routes['GET /purchases'] = () => ({ status: 403, body: { message: 'Insufficient permissions' } });
    const { result } = await renderHook(() => usePurchasesPage({ branchId: null, page: 1, limit: 20 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(callsTo('GET', '/purchases')).toHaveLength(1);
  });

  it('last-price needs a vendor and products, then sends them once', async () => {
    routes['GET /purchases/last-price'] = () => ({ body: [{ productId: 'p1', price: 90, date: '2026-10-01' }] });
    const none = await renderHook(() => useLastPurchasePrices(null, ['p1'], 'b1'), { wrapper: wrapper() });
    expect(none.result.current.size).toBe(0);
    expect(callsTo('GET', '/purchases/last-price')).toHaveLength(0);
    const { result } = await renderHook(() => useLastPurchasePrices('v1', ['p2', 'p1', 'p1'], 'b1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.get('p1')?.price).toBe(90));
    expect(params(callsTo('GET', '/purchases/last-price')[0])).toEqual({ vendorId: 'v1', productIds: 'p1,p2', branchId: 'b1' });
  });
});

describe('purchase writes', () => {
  it('create posts once with branchId in the body and no branch header, and toasts only after the backend answers', async () => {
    routes['POST /purchases'] = () => ({ body: { id: 'pu1', purchaseNumber: '0001', priceChanges: [] } });
    const { result } = await renderHook(() => usePurchaseMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await result.current.create(createDto); });
    const posts = callsTo('POST', '/purchases');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual(createDto);
    expect(posts[0].headers['X-Branch-Id']).toBeUndefined();
    expect(toastTexts()).toEqual(['Purchase 0001 received']);
  });

  it('create reports the price changes the backend applied', async () => {
    routes['POST /purchases'] = () => ({ body: { id: 'pu1', purchaseNumber: '0002', priceChanges: [{ productId: 'p1', productName: 'Panadol', oldPurchasePrice: 90, newPurchasePrice: 100 }] } });
    const { result } = await renderHook(() => usePurchaseMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await result.current.create(createDto); });
    expect(toastTexts()).toEqual(['Purchase 0002 received. Price updated: Panadol 90 → 100']);
  });

  it.each([
    ['400 product not sold by the vendor', 400, 'Products not sold by Acme: Panadol'],
    ['403 foreign branch', 403, 'You do not have access to that branch'],
    ['404 vendor', 404, 'Vendor not found'],
    ['409 batch with a different expiry', 409, 'Batch "B-1" for Panadol already exists with a different expiry date (2027-02-28)'],
  ])('a failed create (%s) shows the server message, is never retried and reports no success', async (_name, status, message) => {
    routes['POST /purchases'] = () => ({ status, body: { message } });
    const { result } = await renderHook(() => usePurchaseMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.create(createDto)).rejects.toBeTruthy(); });
    expect(callsTo('POST', '/purchases')).toHaveLength(1);
    expect(toastTexts()).toEqual([message]);
  });

  it('a network failure is reported without a success toast', async () => {
    const { result } = await renderHook(() => usePurchaseMutations('b1'), { wrapper: wrapper() });
    (global.fetch as jest.Mock).mockImplementationOnce(async () => { throw new TypeError('Network request failed'); });
    await act(async () => { await expect(result.current.create(createDto)).rejects.toBeTruthy(); });
    expect(toastTexts()).toHaveLength(1);
    expect(toastTexts()[0]).not.toMatch(/received/);
  });

  it('edit patches the purchase with the branch scope and reports a locked 409 verbatim', async () => {
    routes['PATCH /purchases/pu1'] = () => ({ body: { id: 'pu1', purchaseNumber: '0001' } });
    const { result } = await renderHook(() => usePurchaseMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await result.current.update('pu1', { items: createDto.items }); });
    expect(callsTo('PATCH', '/purchases/pu1')[0].path).toContain('branchId=b1');
    expect(toastTexts()).toEqual(['Purchase 0001 updated']);

    useToastStore.setState({ toasts: [] });
    routes['PATCH /purchases/pu1'] = () => ({ status: 409, body: { message: 'Invoice is locked: Payment recorded. Only returns and further payments are allowed.' } });
    await act(async () => { await expect(result.current.update('pu1', { items: createDto.items })).rejects.toBeTruthy(); });
    expect(callsTo('PATCH', '/purchases/pu1')).toHaveLength(2);
    expect(toastTexts()).toEqual(['Invoice is locked: Payment recorded. Only returns and further payments are allowed.']);
  });

  it('record payment sends the cumulative amount to /payment with the branch scope', async () => {
    routes['PATCH /purchases/pu1/payment'] = () => ({ body: { id: 'pu1' } });
    const { result } = await renderHook(() => usePurchaseMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await result.current.recordPayment('pu1', { paymentStatus: PaymentStatus.PARTIAL, amountPaid: 500 }); });
    const call = callsTo('PATCH', '/purchases/pu1/payment')[0];
    expect(call.path).toContain('branchId=b1');
    expect(call.body).toEqual({ paymentStatus: 'PARTIAL', amountPaid: 500 });
    expect(toastTexts()).toEqual(['Payment recorded']);
  });

  it('a rejected payment (over the outstanding balance) shows the server message', async () => {
    routes['PATCH /purchases/pu1/payment'] = () => ({ status: 400, body: { message: 'Payment of 900 exceeds the outstanding balance of 700' } });
    const { result } = await renderHook(() => usePurchaseMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.recordPayment('pu1', { paymentStatus: PaymentStatus.PAID, amountPaid: 900 })).rejects.toBeTruthy(); });
    expect(callsTo('PATCH', '/purchases/pu1/payment')).toHaveLength(1);
    expect(toastTexts()).toEqual(['Payment of 900 exceeds the outstanding balance of 700']);
  });

  it('a return posts once to /purchases/:id/returns and an over-return 400 is surfaced', async () => {
    const dto = { purchaseId: 'pu1', items: [{ productId: 'p1', batchId: 'bt1', quantity: 2 }], reasonCode: ReturnReasonCode.DAMAGED };
    routes['POST /purchases/pu1/returns'] = () => ({ body: { id: 'r1' } });
    const { result } = await renderHook(() => usePurchaseMutations('b1'), { wrapper: wrapper() });
    await act(async () => { await result.current.createReturn('pu1', dto); });
    expect(callsTo('POST', '/purchases/pu1/returns')[0].body).toEqual(dto);
    expect(toastTexts()).toEqual(['Purchase return recorded']);

    useToastStore.setState({ toasts: [] });
    routes['POST /purchases/pu1/returns'] = () => ({ status: 400, body: { message: 'Cannot return 5 from batch B-1 — only 3 remains returnable (already returned 1 of 4)' } });
    await act(async () => { await expect(result.current.createReturn('pu1', dto)).rejects.toBeTruthy(); });
    expect(toastTexts()).toEqual(['Cannot return 5 from batch B-1 — only 3 remains returnable (already returned 1 of 4)']);
  });
});
