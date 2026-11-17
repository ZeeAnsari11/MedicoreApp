import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ProcessOrdersScreen } from '@/features/process-orders/process-orders-screen';
import { confirmAction } from '@/lib/confirm';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { TenantRole } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.setTimeout(20000);

interface Call { method: string; path: string; body: unknown }
const calls: Call[] = [];
type Handler = (call: Call) => { status?: number; body?: unknown; gate?: Promise<void> };
let routes: Record<string, Handler> = {};
let me: Record<string, unknown>;
const confirmMock = confirmAction as jest.Mock;

const branches = [{ id: 'b1', name: 'Main', code: 'M', isMain: true, isActive: true }, { id: 'b2', name: 'North', code: 'N', isMain: false, isActive: true }];
const summary = [{ orderBookerId: 'o1', orderBookerName: 'Ali Booker', count: 2 }];
const orderRows = [
  { id: 's1', orderNumber: 'PO-M-000001', placedAt: '2026-11-15T05:00:00Z', customerName: 'Care Pharmacy', itemCount: 2, grandTotal: 500 },
  { id: 's2', orderNumber: 'PO-M-000002', placedAt: '2026-11-15T06:00:00Z', itemCount: 1, grandTotal: 120 },
];

beforeEach(() => {
  calls.length = 0;
  confirmMock.mockReset();
  me = { userId: 'u1', tenantId: 't1', username: 'acct', tenantRole: TenantRole.TENANT_USER, branchId: 'b1', permissions: ['process_orders:read'] };
  routes = {
    'GET /auth/me': () => ({ body: me }),
    'GET /branches': () => ({ body: branches }),
    'GET /sales/orders/summary': () => ({ body: summary }),
    'GET /sales/orders': () => ({ body: orderRows }),
  };
  useSessionStore.setState({ hydrated: true, token: 'tok', impersonationToken: null });
  useBranchStore.setState({ selection: null });
  useToastStore.setState({ toasts: [] });
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('http://api.test/api', '');
    const call: Call = { method: init.method ?? 'GET', path, body: init.body ? JSON.parse(init.body as string) : undefined };
    calls.push(call);
    const handler = routes[`${call.method} ${path.split('?')[0]}`];
    const { status = 200, body, gate } = handler ? handler(call) : { status: 404, body: { message: 'no route' } } as { status?: number; body?: unknown; gate?: Promise<void> };
    if (gate) await gate;
    return { ok: status < 400, status, statusText: 'x', json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
});

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })}><ProcessOrdersScreen /></QueryClientProvider>);
const posts = (path: string) => calls.filter((c) => c.method === 'POST' && c.path === path);
const toastTexts = () => useToastStore.getState().toasts.map((t) => t.text);

// Unmount and flush before the next test: a request or dialog still in flight must not leak into it.
afterEach(() => {
  cleanup();
});

async function openBooker() {
  fireEvent.press(await screen.findByLabelText('Orders of Ali Booker'));
  await screen.findByText('PO-M-000001');
}

describe('ProcessOrdersScreen', () => {
  it('shows a no-access state, and loads nothing, without process_orders:read', async () => {
    me = { ...me, permissions: ['sales:read', 'sales:create', 'sales:void'] };
    await wrap();
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(calls.filter((c) => c.path.startsWith('/sales/orders'))).toHaveLength(0);
  });

  it('shows Loading, never "No access", while /auth/me is still loading, then the list once permissions arrive', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    routes['GET /auth/me'] = () => ({ body: me, gate });
    await wrap();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
    expect(calls.filter((c) => c.path.startsWith('/sales/orders'))).toHaveLength(0);
    release();
    expect(await screen.findByText('Ali Booker')).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
  });

  it('shows an error with retry, not "No access", when /auth/me fails', async () => {
    routes['GET /auth/me'] = () => ({ status: 500, body: { message: 'Profile service down' } });
    await wrap();
    expect(await screen.findByText('Profile service down')).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(calls.filter((c) => c.path.startsWith('/sales/orders'))).toHaveLength(0);
  });

  it('shows a loading state, then the Order Bookers with their counts', async () => {
    await wrap();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(await screen.findByText('Ali Booker')).toBeTruthy();
    expect(screen.getByText('2 orders')).toBeTruthy();
  });

  it('shows the empty state for a day without pending orders', async () => {
    routes['GET /sales/orders/summary'] = () => ({ body: [] });
    await wrap();
    expect(await screen.findByText('No pending orders for this date.')).toBeTruthy();
  });

  it('shows an error with retry when the summary fails', async () => {
    routes['GET /sales/orders/summary'] = () => ({ status: 500, body: { message: 'Boom' } });
    await wrap();
    expect(await screen.findByText('Boom')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('pins a branch user to their own branch in every request', async () => {
    await wrap();
    await openBooker();
    const reads = calls.filter((c) => c.method === 'GET' && c.path.startsWith('/sales/orders'));
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(new URLSearchParams(r.path.split('?')[1]).get('branchId')).toBe('b1');
  });

  it('rejects an invalid or future date locally without calling the API', async () => {
    await wrap();
    await screen.findByText('Ali Booker');
    const before = calls.filter((c) => c.path.startsWith('/sales/orders')).length;
    fireEvent.changeText(screen.getByLabelText('Date (YYYY-MM-DD)'), '2999-01-01');
    expect(await screen.findByText('The date cannot be in the future')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Date (YYYY-MM-DD)'), '2026-13-45');
    expect(await screen.findByText('Enter a valid date as YYYY-MM-DD')).toBeTruthy();
    expect(calls.filter((c) => c.path.startsWith('/sales/orders')).length).toBe(before);
  });

  it('cannot confirm or reject until something is selected, and select-all selects every order', async () => {
    await wrap();
    await openBooker();
    expect(screen.getByRole('button', { name: 'Confirm Selected' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Reject Selected' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText('Select all orders'));
    expect(await screen.findByText('2 orders selected')).toBeTruthy();
    expect(screen.getByLabelText('Select all orders').props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByLabelText('Select PO-M-000001'));
    expect(await screen.findByText('1 order selected')).toBeTruthy();
    expect(screen.getByLabelText('Select all orders').props.accessibilityState.checked).toBe('mixed');
  });

  it('does nothing when the confirmation dialog is cancelled', async () => {
    confirmMock.mockResolvedValue(false);
    await wrap();
    await openBooker();
    fireEvent.press(screen.getByLabelText('Select all orders'));
    fireEvent.press(await screen.findByRole('button', { name: 'Confirm Selected' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: 'Confirm 2 orders?', confirmLabel: 'Yes, confirm' });
    expect(posts('/sales/orders/confirm')).toHaveLength(0);
    expect(toastTexts()).toEqual([]);
  });

  it('confirms the selected orders with the branch in the body, then clears the selection and refetches', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /sales/orders/confirm'] = () => ({ body: { processed: 2 } });
    await wrap();
    await openBooker();
    fireEvent.press(screen.getByLabelText('Select all orders'));
    fireEvent.press(await screen.findByRole('button', { name: 'Confirm Selected' }));
    await waitFor(() => expect(toastTexts()).toEqual(['2 orders confirmed']));
    expect(posts('/sales/orders/confirm')).toHaveLength(1);
    expect(posts('/sales/orders/confirm')[0].body).toEqual({ saleIds: ['s1', 's2'], branchId: 'b1' });
    await waitFor(() => expect(screen.getByText('0 orders selected')).toBeTruthy());
  });

  it('rejecting asks with a destructive dialog and posts to /reject', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /sales/orders/reject'] = () => ({ body: { processed: 1 } });
    await wrap();
    await openBooker();
    fireEvent.press(screen.getByLabelText('Select PO-M-000002'));
    fireEvent.press(await screen.findByRole('button', { name: 'Reject Selected' }));
    await waitFor(() => expect(toastTexts()).toEqual(['1 order rejected']));
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: 'Reject 1 order?', destructive: true });
    expect(posts('/sales/orders/reject')[0].body).toEqual({ saleIds: ['s2'], branchId: 'b1' });
    expect(posts('/sales/orders/confirm')).toHaveLength(0);
  });

  it('a double press sends one request', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /sales/orders/confirm'] = () => ({ body: { processed: 2 } });
    await wrap();
    await openBooker();
    fireEvent.press(screen.getByLabelText('Select all orders'));
    const button = await screen.findByRole('button', { name: 'Confirm Selected' });
    // Both presses land before the first run's dialog has resolved, so the second must be ignored by the guard.
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    await waitFor(() => expect(toastTexts()).toEqual(['2 orders confirmed']));
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(posts('/sales/orders/confirm')).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview' }).props.accessibilityState.disabled).toBe(false));
  });

  it('on a 409 shows the server message, keeps the selection and never reports success', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /sales/orders/confirm'] = () => ({ status: 409, body: { message: 'Some of the selected orders are no longer pending — refresh and try again' } });
    await wrap();
    await openBooker();
    fireEvent.press(screen.getByLabelText('Select all orders'));
    fireEvent.press(await screen.findByRole('button', { name: 'Confirm Selected' }));
    await waitFor(() => expect(toastTexts()).toEqual(['Some of the selected orders are no longer pending — refresh and try again']));
    expect(posts('/sales/orders/confirm')).toHaveLength(1);
    expect(screen.getByText('2 orders selected')).toBeTruthy();
  });

  it('tells the user when no pending orders are left for the booker', async () => {
    routes['GET /sales/orders'] = () => ({ body: [] });
    await wrap();
    await openBooker().catch(() => undefined);
    expect(await screen.findByText('No pending orders left for this Order Booker.')).toBeTruthy();
  });

  it('opens the order detail from the order number', async () => {
    const { router } = jest.requireMock('expo-router');
    await wrap();
    await openBooker();
    fireEvent.press(screen.getByLabelText('Open PO-M-000001'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/sales/detail', params: { id: 's1', branchId: 'b1' } });
  });
});
