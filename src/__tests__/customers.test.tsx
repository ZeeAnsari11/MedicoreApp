import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { CustomerForm } from '@/features/customers/customer-form';
import { buildCustomerCreate, buildCustomerUpdate, customerDefaults, customerSchema } from '@/features/customers/schema';
import { useCustomers } from '@/features/customers/use-customers';
import { usePartyBalances, usePartyLedger } from '@/features/ledgers/use-party-ledger';
import { defaultLedgerRange, isValidIsoDate, toIsoDate } from '@/lib/dates';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { TenantRole } from '@/types/medicore';
import type { Customer } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.setTimeout(20000);

interface Call { method: string; path: string; headers: Record<string, string>; body: unknown }
const calls: Call[] = [];
type Handler = (call: Call) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};
const me = { userId: 'u1', tenantId: 't1', username: 'admin', tenantRole: TenantRole.TENANT_SUPER_ADMIN, permissions: [] };
const branches = [{ id: 'b1', name: 'Main', code: 'M', isMain: true, isActive: true }, { id: 'b2', name: 'North', code: 'N', isMain: false, isActive: true }];

beforeEach(() => {
  calls.length = 0;
  routes = { 'GET /auth/me': () => ({ body: me }), 'GET /branches': () => ({ body: branches }) };
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

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
const wrapper = () => {
  const c = client();
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={c}>{children}</QueryClientProvider>;
  return Wrapper;
};
const callTo = (method: string, path: string) => calls.find((c) => c.method === method && c.path.split('?')[0] === path);
const toastTexts = () => useToastStore.getState().toasts.map((t) => t.text);

const customer: Customer = { id: 'c1', tenantId: 't1', branchId: 'b1', name: 'Ali Store', phone: '0300', address: 'Lahore', isDealer: false, totalDue: 0, outstandingBalance: 120, deletedAt: null, createdAt: '', updatedAt: '' } as Customer;

describe('customer schema and payload builders', () => {
  it('requires a 2+ character name', () => {
    expect(customerSchema.safeParse({ ...customerDefaults(), name: 'A' }).success).toBe(false);
    expect(customerSchema.safeParse({ ...customerDefaults(), name: ' Al ' }).success).toBe(true);
  });
  it('creates with branch, omits blank optional fields, keeps the dealer flag', () => {
    expect(buildCustomerCreate({ name: 'Ali', branchId: 'b1', phone: ' ', address: '', isDealer: true })).toEqual({ name: 'Ali', branchId: 'b1', phone: undefined, address: undefined, isDealer: true });
  });
  it('updates with the full field set (the backend 500s on partial bodies) and never sends branchId', () => {
    expect(buildCustomerUpdate({ ...customerDefaults(customer), name: 'Ali Medical', isDealer: true })).toEqual({ name: 'Ali Medical', phone: '0300', address: 'Lahore', isDealer: true });
    expect(buildCustomerUpdate({ ...customerDefaults(customer), phone: '' })).toEqual({ name: 'Ali Store', phone: '', address: 'Lahore', isDealer: false });
  });
});

describe('customers API', () => {
  it('lists with ledger-derived outstandingBalance and carries the branch header on reads only', async () => {
    useBranchStore.setState({ selection: 'b2' });
    routes['GET /customers'] = () => ({ body: [customer] });
    const { result } = await renderHook(() => useCustomers(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    expect(result.current.customers[0].outstandingBalance).toBe(120);
    expect(callTo('GET', '/customers')?.headers['X-Branch-Id']).toBe('b2');
  });

  it('creates (no X-Branch-Id on POST), updates and deletes, reporting success only after the backend answers', async () => {
    useBranchStore.setState({ selection: 'b2' });
    routes['GET /customers'] = () => ({ body: [customer] });
    routes['POST /customers'] = (c) => ({ status: 201, body: { ...customer, id: 'c2', ...(c.body as object) } });
    routes['PATCH /customers/c1'] = (c) => ({ body: { ...customer, ...(c.body as object) } });
    routes['DELETE /customers/c1'] = () => ({ status: 204 });
    const { result } = await renderHook(() => useCustomers(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.create({ name: 'New', branchId: 'b1' }); });
    expect(callTo('POST', '/customers')?.body).toEqual({ name: 'New', branchId: 'b1' });
    expect(callTo('POST', '/customers')?.headers['X-Branch-Id']).toBeUndefined();
    expect(toastTexts()).toContain('Customer created');

    await act(async () => { await result.current.update('c1', { isDealer: true }); });
    expect(callTo('PATCH', '/customers/c1')?.body).toEqual({ isDealer: true });

    await act(async () => { await result.current.remove('c1'); });
    expect(callTo('DELETE', '/customers/c1')).toBeDefined();
    expect(toastTexts()).toContain('Customer deleted');
  });

  it('shows the backend reason when deletion is refused and never claims success', async () => {
    routes['GET /customers'] = () => ({ body: [customer] });
    routes['DELETE /customers/c1'] = () => ({ status: 409, body: { message: 'This customer has an outstanding balance and cannot be removed' } });
    const { result } = await renderHook(() => useCustomers(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await expect(result.current.remove('c1')).rejects.toMatchObject({ status: 409 }); });
    expect(toastTexts()).toContain('This customer has an outstanding balance and cannot be removed');
    expect(toastTexts()).not.toContain('Customer deleted');
  });

  it('does not retry a failed create', async () => {
    routes['GET /customers'] = () => ({ body: [] });
    routes['POST /customers'] = () => ({ status: 500, body: { message: 'boom' } });
    const { result } = await renderHook(() => useCustomers(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await expect(result.current.create({ name: 'X1', branchId: 'b1' })).rejects.toBeDefined(); });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
});

describe('party ledger API', () => {
  it('requests the customer ledger with the date range and server paging', async () => {
    routes['GET /accounting/customers/c1/ledger'] = () => ({ body: { partyId: 'c1', partyName: 'Ali', rows: [], total: 0, page: 2, limit: 25, openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0, summary: {} } });
    const { result } = await renderHook(() => usePartyLedger('customers', 'c1', { from: '2026-11-01', to: '2026-11-30', page: 2, limit: 25, branchId: 'b1' }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.ledger).toBeDefined());
    const q = callTo('GET', '/accounting/customers/c1/ledger')!.path.split('?')[1];
    expect(Object.fromEntries(new URLSearchParams(q))).toEqual({ branchId: 'b1', from: '2026-11-01', to: '2026-11-30', page: '2', limit: '25' });
  });
  it('does not call the API when disabled (no acc_customer_ledger:read) or without a party', async () => {
    const { result } = await renderHook(() => usePartyLedger('customers', 'c1', { page: 1, limit: 25 }, false), { wrapper: wrapper() });
    await renderHook(() => usePartyLedger('customers', null, { page: 1, limit: 25 }), { wrapper: wrapper() });
    await waitFor(() => expect(calls.some((c) => c.path === '/auth/me')).toBe(true));
    expect(calls.some((c) => c.path.includes('/ledger'))).toBe(false);
    expect(result.current.ledger).toBeUndefined();
  });
  it('requests balances with search, sort and paging', async () => {
    routes['GET /accounting/customers/balances'] = () => ({ body: { items: [], total: 0, page: 1, limit: 25, totals: {} } });
    await renderHook(() => usePartyBalances('customers', { search: 'ali', hasBalance: true, sortBy: 'balance', sortDir: 'desc', page: 1, limit: 25 }), { wrapper: wrapper() });
    await waitFor(() => expect(callTo('GET', '/accounting/customers/balances')).toBeDefined());
    expect(Object.fromEntries(new URLSearchParams(callTo('GET', '/accounting/customers/balances')!.path.split('?')[1]))).toEqual({ search: 'ali', hasBalance: 'true', sortBy: 'balance', sortDir: 'desc', page: '1', limit: '25' });
  });
});

describe('date helpers', () => {
  it('formats local dates and validates calendar dates', () => {
    expect(toIsoDate(new Date(2026, 10, 5))).toBe('2026-11-05');
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('11/05/2026')).toBe(false);
    const r = defaultLedgerRange();
    expect(r.from <= r.to).toBe(true);
  });
});

describe('CustomerForm', () => {
  it('blocks an empty submit, then submits with an explicitly chosen branch', async () => {
    const onSubmit = jest.fn(async () => undefined);
    await render(<QueryClientProvider client={client()}><CustomerForm mode="create" onSubmit={onSubmit} /></QueryClientProvider>);
    await fireEvent.press(await screen.findByText('Save'));
    expect(await screen.findByText('Name must be at least 2 characters')).toBeTruthy();
    expect(await screen.findByText('Branch is required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Ali Store');
    await fireEvent.press(await screen.findByLabelText('Branch'));
    await fireEvent.press(await screen.findByText('North'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ali Store', branchId: 'b2', isDealer: false }));
  });
  it('has no Branch field in edit mode', async () => {
    await render(<QueryClientProvider client={client()}><CustomerForm mode="edit" customer={customer} onSubmit={jest.fn()} /></QueryClientProvider>);
    expect(await screen.findByDisplayValue('Ali Store')).toBeTruthy();
    expect(screen.queryByLabelText('Branch')).toBeNull();
  });
});
