import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { cashReceiptPdfPath, useInvoiceLookup, useLoadCashTransaction, useSaveCashReceipt, useUpdateCashTransaction } from '@/features/cash-receipt/use-cash-receipts';
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
const toastTexts = () => useToastStore.getState().toasts.map((t) => t.text);
const dto = { batchId: '11111111-1111-4111-8111-111111111111', date: '2026-11-16', method: 'CASH' as const, rows: [{ invoiceId: 'i1', amount: 100 }] };

describe('invoice lookup', () => {
  it('does nothing for an empty query', async () => {
    await renderHook(() => useInvoiceLookup('', 'b1'), { wrapper: wrapper() });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(callsTo('GET', '/sales/invoices/lookup')).toHaveLength(0);
  });

  it('encodes the query, scopes to the branch (query and header)', async () => {
    useBranchStore.setState({ selection: 'b1' });
    routes['GET /sales/invoices/lookup'] = () => ({ body: [{ id: 'i1', invoiceNumber: '0001' }] });
    const { result } = await renderHook(() => useInvoiceLookup('00 1&x', 'b1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.invoices).toHaveLength(1));
    const call = callsTo('GET', '/sales/invoices/lookup')[0];
    expect(call.path).toBe('/sales/invoices/lookup?q=00%201%26x&branchId=b1');
    expect(call.headers['X-Branch-Id']).toBe('b1');
  });

  it('a failed lookup is an error, not an empty list', async () => {
    routes['GET /sales/invoices/lookup'] = () => ({ status: 403, body: { message: 'Insufficient permissions' } });
    const { result } = await renderHook(() => useInvoiceLookup('1', 'b1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});

describe('save cash receipt', () => {
  it('posts once, with no branch header and no branchId (the backend uses the invoices\' branch), and toasts nothing itself', async () => {
    routes['POST /sales/cash-receipts'] = () => ({ body: { id: 'r1', voucherNumber: 'CR-000001', count: 1, total: 100, rows: [] } });
    const { result } = await renderHook(() => useSaveCashReceipt(), { wrapper: wrapper() });
    let out: { voucherNumber: string } | undefined;
    await act(async () => { out = await result.current.save(dto); });
    expect(out?.voucherNumber).toBe('CR-000001');
    const posts = callsTo('POST', '/sales/cash-receipts');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual(dto);
    expect(posts[0].headers['X-Branch-Id']).toBeUndefined();
    expect(toastTexts()).toEqual([]);
  });

  it('a retry of the same sheet sends the same batchId', async () => {
    routes['POST /sales/cash-receipts'] = () => ({ body: { id: 'r1', voucherNumber: 'CR-000001', count: 1, total: 100, rows: [] } });
    const { result } = await renderHook(() => useSaveCashReceipt(), { wrapper: wrapper() });
    await act(async () => { await result.current.save(dto); await result.current.save(dto); });
    expect(callsTo('POST', '/sales/cash-receipts').map((c) => (c.body as { batchId: string }).batchId)).toEqual([dto.batchId, dto.batchId]);
  });

  it.each([
    ['403 foreign branch', 403, 'You do not have access to that branch'],
    ['404 invoice', 404, 'Invoice not found'],
    ['400 mixed branches', 400, 'A cash receipt sheet cannot mix invoices from different branches'],
    ['400 duplicate invoice', 400, 'An invoice appears more than once in the sheet'],
  ])('%s: server message shown once, never retried', async (_n, status, message) => {
    routes['POST /sales/cash-receipts'] = () => ({ status, body: { message } });
    const { result } = await renderHook(() => useSaveCashReceipt(), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.save(dto)).rejects.toBeTruthy(); });
    expect(callsTo('POST', '/sales/cash-receipts')).toHaveLength(1);
    expect(toastTexts()).toEqual([message]);
  });

  it('per-row rejections are left to the screen: no toast, the error carries errors[]', async () => {
    routes['POST /sales/cash-receipts'] = () => ({ status: 400, body: { message: 'Some rows could not be saved', errors: [{ invoiceId: 'i1', reason: 'Invoice is already paid' }] } });
    const { result } = await renderHook(() => useSaveCashReceipt(), { wrapper: wrapper() });
    let caught: { body?: { errors?: unknown[] } } | undefined;
    await act(async () => { await result.current.save(dto).catch((e) => { caught = e; }); });
    expect(toastTexts()).toEqual([]);
    expect(caught?.body?.errors).toHaveLength(1);
  });

  it('a network failure is reported and never claims success', async () => {
    const { result } = await renderHook(() => useSaveCashReceipt(), { wrapper: wrapper() });
    (global.fetch as jest.Mock).mockImplementationOnce(async () => { throw new TypeError('Network request failed'); });
    await act(async () => { await expect(result.current.save(dto)).rejects.toBeTruthy(); });
    expect(toastTexts()).toHaveLength(1);
  });
});

const tx = { id: 'r1', transactionNumber: 'T-0001', voucherNumber: 'CR-000001', branchId: 'b1', version: 2, date: '2026-11-18T00:00:00.000Z', method: 'CASH', total: 100, rows: [] };
const editDto = { expectedVersion: 2, rows: [{ entryId: 'e1', invoiceId: 'i1', amount: 120 }, { invoiceId: 'i2', amount: 30 }] };

describe('load a transaction', () => {
  it('GETs it by number once and returns the saved transaction', async () => {
    routes['GET /sales/cash-receipts/by-number/T-0001'] = () => ({ body: tx });
    const { result } = await renderHook(() => useLoadCashTransaction(), { wrapper: wrapper() });
    let out: { version: number } | undefined;
    await act(async () => { out = await result.current.loadTransaction('T-0001'); });
    expect(out?.version).toBe(2);
    expect(callsTo('GET', '/sales/cash-receipts/by-number/T-0001')).toHaveLength(1);
    expect(toastTexts()).toEqual([]);
  });

  it('says so when there is no such transaction', async () => {
    routes['GET /sales/cash-receipts/by-number/T-0009'] = () => ({ status: 404, body: { message: 'Transaction not found' } });
    const { result } = await renderHook(() => useLoadCashTransaction(), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.loadTransaction('T-0009')).rejects.toBeTruthy(); });
    expect(toastTexts()).toEqual(['Transaction not found']);
  });
});

describe('save edits', () => {
  it('PATCHes the transaction once with the expected version and the rows, and toasts nothing itself', async () => {
    routes['PATCH /sales/cash-receipts/by-number/T-0001'] = () => ({ body: { ...tx, version: 3 } });
    const { result } = await renderHook(() => useUpdateCashTransaction(), { wrapper: wrapper() });
    let out: { version: number } | undefined;
    await act(async () => { out = await result.current.updateTransaction({ number: 'T-0001', dto: editDto }); });
    expect(out?.version).toBe(3);
    const patches = callsTo('PATCH', '/sales/cash-receipts/by-number/T-0001');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual(editDto);
    expect(toastTexts()).toEqual([]);
  });

  it('a stale edit (409) is reported once and never retried', async () => {
    routes['PATCH /sales/cash-receipts/by-number/T-0001'] = () => ({ status: 409, body: { message: 'This transaction was changed by someone else. Reload it and try again.', currentVersion: 3 } });
    const { result } = await renderHook(() => useUpdateCashTransaction(), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.updateTransaction({ number: 'T-0001', dto: editDto })).rejects.toBeTruthy(); });
    expect(callsTo('PATCH', '/sales/cash-receipts/by-number/T-0001')).toHaveLength(1);
    expect(toastTexts()).toEqual(['This transaction was changed by someone else. Reload it and try again.']);
  });

  it('per-row rejections are left to the screen: no toast, the error carries errors[]', async () => {
    routes['PATCH /sales/cash-receipts/by-number/T-0001'] = () => ({ status: 400, body: { message: 'Some rows could not be saved', errors: [{ invoiceId: 'i1', reason: 'Amount exceeds the balance of 120.00' }] } });
    const { result } = await renderHook(() => useUpdateCashTransaction(), { wrapper: wrapper() });
    let caught: { body?: { errors?: unknown[] } } | undefined;
    await act(async () => { await result.current.updateTransaction({ number: 'T-0001', dto: editDto }).catch((e) => { caught = e; }); });
    expect(toastTexts()).toEqual([]);
    expect(caught?.body?.errors).toHaveLength(1);
  });
});

describe('pdf path', () => {
  it('whole voucher and single invoice', () => {
    expect(cashReceiptPdfPath('r1', 'b1')).toBe('/sales/cash-receipts/r1/pdf?branchId=b1');
    expect(cashReceiptPdfPath('r1', 'b1', 'i9')).toBe('/sales/cash-receipts/r1/pdf?branchId=b1&invoiceId=i9');
    expect(cashReceiptPdfPath('r1', null)).toBe('/sales/cash-receipts/r1/pdf?branchId=');
  });
});
