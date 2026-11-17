import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { PurchaseDetailScreen } from '@/features/purchases/purchase-detail-screen';
import { PurchaseReturnScreen } from '@/features/purchases/purchase-return-screen';
import { PurchasesListScreen } from '@/features/purchases/purchases-list-screen';
import { confirmAction } from '@/lib/confirm';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { PaymentStatus, TenantRole } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'pu1', branchId: 'b1' }),
}));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
const mockShare = jest.fn();
const mockPrint = jest.fn();
jest.mock('@/features/documents/use-document-file', () => ({ useDocumentFile: () => ({ isBusy: false, share: mockShare, print: mockPrint }) }));
jest.setTimeout(20000);

interface Call { method: string; path: string; body: unknown }
const calls: Call[] = [];
type Handler = (call: Call) => { status?: number; body?: unknown; gate?: Promise<void> };
let routes: Record<string, Handler> = {};
let me: Record<string, unknown>;
let inFlight = 0;
const confirmMock = confirmAction as jest.Mock;
const { router } = jest.requireMock('expo-router');

const branches = [{ id: 'b1', name: 'Main', code: 'M', isMain: true, isActive: true }, { id: 'b2', name: 'North', code: 'N', isMain: false, isActive: true }];
const purchase = {
  id: 'pu1',
  branchId: 'b1',
  vendorId: 'v1',
  vendorName: 'Acme Pharma',
  purchaseNumber: '0001',
  vendorInvoiceNumber: 'INV-77',
  status: 'RECEIVED',
  paymentStatus: PaymentStatus.PARTIAL,
  amountPaid: 1000,
  subtotal: 1100,
  discountTotal: 0,
  taxTotal: 0,
  grandTotal: 1100,
  purchaseDate: '2026-11-10T00:00:00.000Z',
  returnedTotal: 0,
  refundedTotal: 0,
  returnStatus: 'NONE',
  isEditable: false,
  lockReason: 'Payment recorded',
  items: [
    { productId: 'p1', productName: 'Panadol', batchNumber: 'B-1', batchId: 'bt1', expiryDate: '2027-01-31T00:00:00.000Z', quantity: 10, purchasePrice: 100, sellingPrice: 120, lineTotal: 1000 },
    { productId: 'p2', productName: 'Brufen', batchNumber: 'B-2', batchId: 'bt2', expiryDate: '2027-02-28T00:00:00.000Z', quantity: 2, purchasePrice: 50, sellingPrice: 60, lineTotal: 100 },
  ],
};
const earlierReturn = { id: 'r1', returnNumber: 'PR-0001', returnDate: '2026-11-12T00:00:00.000Z', total: 400, reason: 'Damaged', items: [{ productId: 'p1', productName: 'Panadol', batchId: 'bt1', batchNumber: 'B-1', quantity: 4 }] };

const ALL = ['purchases:read', 'purchases:create', 'purchases:update', 'purchases:return', 'purchases:record_payment'];
const user = (permissions: string[], extra: Record<string, unknown> = {}) => ({ userId: 'u1', tenantId: 't1', username: 'store', tenantRole: TenantRole.TENANT_USER, branchId: 'b1', permissions, ...extra });

beforeEach(() => {
  calls.length = 0;
  inFlight = 0;
  confirmMock.mockReset();
  mockShare.mockReset();
  mockPrint.mockReset();
  router.back.mockReset();
  router.push.mockReset();
  me = user(ALL);
  routes = {
    'GET /auth/me': () => ({ body: me }),
    'GET /branches': () => ({ body: branches }),
    'GET /vendors': () => ({ body: [{ id: 'v1', company: 'Acme Pharma', isActive: true }] }),
    'GET /purchases': () => ({ body: { items: [purchase], total: 1, page: 1, limit: 10 } }),
    'GET /purchases/pu1': () => ({ body: purchase }),
    'GET /purchases/pu1/payments': () => ({ body: [{ id: 'initial', isInitial: true, paymentDate: '2026-11-10T09:00:00.000Z', amount: 1000 }] }),
    'GET /purchases/pu1/returns': () => ({ body: [] }),
  };
  useSessionStore.setState({ hydrated: true, token: 'tok', impersonationToken: null });
  useBranchStore.setState({ selection: null });
  useToastStore.setState({ toasts: [] });
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('http://api.test/api', '');
    const call: Call = { method: init.method ?? 'GET', path, body: init.body ? JSON.parse(init.body as string) : undefined };
    calls.push(call);
    inFlight += 1;
    const handler = routes[`${call.method} ${path.split('?')[0]}`];
    const { status = 200, body, gate } = handler ? handler(call) : { status: 404, body: { message: 'no route' }, gate: undefined };
    if (gate) await gate;
    inFlight -= 1;
    return { ok: status < 400, status, statusText: 'x', json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
});

// Let every request settle (and its React Query notification flush) before unmounting, so nothing leaks into the next test.
afterEach(async () => {
  await waitFor(() => expect(inFlight).toBe(0));
  await new Promise((r) => setTimeout(r, 20));
  cleanup();
});

const wrap = (ui: ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })}>{ui}</QueryClientProvider>);
const callsTo = (method: string, path: string) => calls.filter((c) => c.method === method && c.path.split('?')[0] === path);
const toastTexts = () => useToastStore.getState().toasts.map((t) => t.text);
const disabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) => !!el.props.accessibilityState?.disabled;
const button = (name: string) => screen.getByRole('button', { name });

describe('Purchases list', () => {
  it('shows Loading, never "No access", while /auth/me loads; then the purchases', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    routes['GET /auth/me'] = () => ({ body: me, gate });
    await wrap(<PurchasesListScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
    expect(callsTo('GET', '/purchases')).toHaveLength(0);
    release();
    expect(await screen.findByText('0001')).toBeTruthy();
  });

  it('shows an error with retry, not "No access", when /auth/me fails', async () => {
    routes['GET /auth/me'] = () => ({ status: 500, body: { message: 'Profile service down' } });
    await wrap(<PurchasesListScreen />);
    expect(await screen.findByText('Profile service down')).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
    expect(callsTo('GET', '/purchases')).toHaveLength(0);
  });

  it('shows "No access" and loads nothing for a user without purchases:read', async () => {
    me = user(['sales:read', 'sales:create']);
    await wrap(<PurchasesListScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(callsTo('GET', '/purchases')).toHaveLength(0);
  });

  it('lists purchases with vendor, branch, totals and the payment, return and status badges', async () => {
    routes['GET /purchases'] = () => ({ body: { items: [{ ...purchase, returnStatus: 'PARTIAL' }], total: 1, page: 1, limit: 10 } });
    await wrap(<PurchasesListScreen />);
    expect(await screen.findByText('0001')).toBeTruthy();
    expect(screen.getByText(/Acme Pharma · Main/)).toBeTruthy();
    expect(screen.getAllByText('PARTIAL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Partially returned').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RECEIVED').length).toBeGreaterThan(0);
    expect(screen.getByText('Page 1 of 1 · 1 purchases')).toBeTruthy();
  });

  it('pins a branch user to their branch in the query', async () => {
    await wrap(<PurchasesListScreen />);
    await screen.findByText('0001');
    const q = new URLSearchParams(callsTo('GET', '/purchases')[0].path.split('?')[1]);
    expect(q.get('branchId')).toBe('b1');
    expect(q.get('limit')).toBe('10');
  });

  it('sends filters to the server, resets to page 1, and clears them', async () => {
    await wrap(<PurchasesListScreen />);
    await screen.findByText('0001');
    await fireEvent.press(screen.getByLabelText('Payment: PAID'));
    await waitFor(() => expect(callsTo('GET', '/purchases').some((c) => c.path.includes('paymentStatus=PAID'))).toBe(true));
    await fireEvent.press(screen.getByLabelText('Returns: Any return'));
    await waitFor(() => expect(callsTo('GET', '/purchases').some((c) => c.path.includes('returnStatus=ANY'))).toBe(true));
    await fireEvent.press(screen.getByLabelText('Rows: 25'));
    await waitFor(() => expect(callsTo('GET', '/purchases').some((c) => c.path.includes('limit=25'))).toBe(true));
    await fireEvent.press(screen.getByText('Clear filters'));
    await waitFor(() => expect(screen.queryByText('Clear filters')).toBeNull());
  });

  it('the New Purchase button needs purchases:create', async () => {
    me = user(['purchases:read']);
    await wrap(<PurchasesListScreen />);
    await screen.findByText('0001');
    expect(disabled(button('New Purchase'))).toBe(true);
  });

  it('opens a purchase with its id and branch', async () => {
    await wrap(<PurchasesListScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'View details' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/purchases/detail', params: { id: 'pu1', branchId: 'b1' } });
  });

  it('shows the empty states', async () => {
    routes['GET /purchases'] = () => ({ body: { items: [], total: 0, page: 1, limit: 10 } });
    await wrap(<PurchasesListScreen />);
    expect(await screen.findByText('No purchases yet')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Payment: PAID'));
    expect(await screen.findByText('No purchases found')).toBeTruthy();
  });

  it('shows an error with retry when the list fails', async () => {
    routes['GET /purchases'] = () => ({ status: 500, body: { message: 'Boom' } });
    await wrap(<PurchasesListScreen />);
    expect(await screen.findByText('Boom')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});

describe('Purchase detail', () => {
  it('shows items, totals, outstanding, payments and the lock reason', async () => {
    await wrap(<PurchaseDetailScreen />);
    expect(await screen.findByText('Panadol')).toBeTruthy();
    expect(screen.getByText('Brufen')).toBeTruthy();
    expect(screen.getByText('Not editable: Payment recorded')).toBeTruthy();
    expect(screen.getByText('Paid at purchase')).toBeTruthy();
    expect(screen.getByText('Outstanding')).toBeTruthy();
    expect(screen.getByText('Outstanding: Rs 100')).toBeTruthy();
  });

  it('shows earlier returns with their slip buttons and the returned quantity on the line', async () => {
    routes['GET /purchases/pu1/returns'] = () => ({ body: [earlierReturn] });
    await wrap(<PurchaseDetailScreen />);
    expect(await screen.findByText('PR-0001')).toBeTruthy();
    expect(screen.getByText('Returned: 4')).toBeTruthy();
    await fireEvent.press(screen.getByText('Share slip'));
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ path: '/purchases/pu1/returns/r1/pdf?branchId=b1', fileName: 'PR-0001.pdf' }));
    await fireEvent.press(screen.getByText('Print slip'));
    expect(mockPrint).toHaveBeenCalledWith(expect.objectContaining({ path: '/purchases/pu1/returns/r1/pdf?branchId=b1' }));
  });

  it('shares and prints the purchase order PDF from the purchase branch', async () => {
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Panadol');
    await fireEvent.press(button('Share PO PDF'));
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ path: '/purchases/pu1/pdf?branchId=b1', fileName: '0001.pdf' }));
    await fireEvent.press(button('Print PO'));
    expect(mockPrint).toHaveBeenCalledWith(expect.objectContaining({ path: '/purchases/pu1/pdf?branchId=b1' }));
  });

  it('hides the payment panel without purchases:record_payment and disables return and edit without their permissions', async () => {
    me = user(['purchases:read']);
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Panadol');
    expect(screen.queryByText('Record a payment')).toBeNull();
    expect(disabled(button('Edit purchase'))).toBe(true);
    expect(disabled(button('Return items'))).toBe(true);
    expect(disabled(button('Full return'))).toBe(true);
  });

  it('edit needs purchases:update and an editable purchase', async () => {
    routes['GET /purchases/pu1'] = () => ({ body: { ...purchase, isEditable: true, amountPaid: 0, paymentStatus: 'UNPAID' } });
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Panadol');
    expect(disabled(button('Edit purchase'))).toBe(false);
    await fireEvent.press(button('Edit purchase'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/purchases/edit', params: { id: 'pu1', branchId: 'b1' } });
  });

  it('rejects an amount above the outstanding balance with the web message and sends nothing', async () => {
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Record a payment');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '500');
    await fireEvent.press(button('Record payment'));
    expect(await screen.findByText('Amount cannot exceed the outstanding 100.00.')).toBeTruthy();
    expect(callsTo('PATCH', '/purchases/pu1/payment')).toHaveLength(0);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('"Full amount" fills the outstanding balance', async () => {
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Record a payment');
    await fireEvent.press(button('Full amount'));
    expect(screen.getByLabelText('Amount').props.value).toBe('100');
  });

  it('records a payment as the new cumulative amount, then resets the form', async () => {
    confirmMock.mockResolvedValue(true);
    routes['PATCH /purchases/pu1/payment'] = () => ({ body: { ...purchase, amountPaid: 1040 } });
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Record a payment');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '40');
    await fireEvent.changeText(screen.getByLabelText('Reference # (optional)'), ' CHQ-9 ');
    await fireEvent.press(screen.getByLabelText('Method: Bank transfer'));
    await fireEvent.press(button('Record payment'));
    await waitFor(() => expect(toastTexts()).toEqual(['Payment recorded']));
    const patches = callsTo('PATCH', '/purchases/pu1/payment');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toMatchObject({ paymentStatus: 'PARTIAL', amountPaid: 1040, method: 'BANK_TRANSFER', reference: 'CHQ-9' });
    expect((patches[0].body as { paymentDate: string }).paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await waitFor(() => expect(screen.getByLabelText('Amount').props.value).toBe(''));
  });

  it('a second press while the payment is in flight sends nothing extra', async () => {
    confirmMock.mockResolvedValue(true);
    routes['PATCH /purchases/pu1/payment'] = () => ({ body: purchase });
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Record a payment');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '40');
    const pay = button('Record payment');
    await fireEvent.press(pay);
    await fireEvent.press(pay);
    await waitFor(() => expect(toastTexts()).toEqual(['Payment recorded']));
    expect(callsTo('PATCH', '/purchases/pu1/payment')).toHaveLength(1);
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it('a failed payment shows the server message, keeps the amount and reports no success', async () => {
    confirmMock.mockResolvedValue(true);
    routes['PATCH /purchases/pu1/payment'] = () => ({ status: 400, body: { message: 'Payment of 90 exceeds the outstanding balance of 80' } });
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Record a payment');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '90');
    await fireEvent.press(button('Record payment'));
    await waitFor(() => expect(toastTexts()).toEqual(['Payment of 90 exceeds the outstanding balance of 80']));
    expect(callsTo('PATCH', '/purchases/pu1/payment')).toHaveLength(1);
    expect(screen.getByLabelText('Amount').props.value).toBe('90');
  });

  it('says so when the purchase is fully paid', async () => {
    routes['GET /purchases/pu1'] = () => ({ body: { ...purchase, amountPaid: 1100, paymentStatus: 'PAID' } });
    await wrap(<PurchaseDetailScreen />);
    expect(await screen.findByText('This purchase is fully paid.')).toBeTruthy();
  });

  it('a full return asks with the web text, then posts every returnable batch with plain ADJUST', async () => {
    confirmMock.mockResolvedValue(true);
    routes['GET /purchases/pu1/returns'] = () => ({ body: [earlierReturn] });
    routes['POST /purchases/pu1/returns'] = () => ({ body: { id: 'r2' } });
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('PR-0001');
    await fireEvent.press(button('Full return'));
    await waitFor(() => expect(toastTexts()).toEqual(['Purchase return recorded']));
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: 'Full return', confirmLabel: 'Yes, full return', message: 'Are you sure you want to make a full return of 0001? All remaining items will be returned.' });
    const posts = callsTo('POST', '/purchases/pu1/returns');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({
      branchId: 'b1',
      reasonCode: 'OTHER',
      settlement: { mode: 'ADJUST' },
      items: [{ productId: 'p1', batchId: 'bt1', quantity: 6 }, { productId: 'p2', batchId: 'bt2', quantity: 2 }],
    });
  });

  it('cancelling the full-return dialog sends nothing', async () => {
    confirmMock.mockResolvedValue(false);
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Panadol');
    await fireEvent.press(button('Full return'));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(callsTo('POST', '/purchases/pu1/returns')).toHaveLength(0);
  });

  it('a fully returned or cancelled purchase offers no more returns, and no payment panel when cancelled', async () => {
    routes['GET /purchases/pu1'] = () => ({ body: { ...purchase, status: 'CANCELLED' } });
    await wrap(<PurchaseDetailScreen />);
    await screen.findByText('Panadol');
    expect(disabled(button('Return items'))).toBe(true);
    expect(disabled(button('Full return'))).toBe(true);
    expect(screen.queryByText('Record a payment')).toBeNull();
  });

  it('a foreign-branch 403 on the purchase is shown as an error, not as an empty purchase', async () => {
    routes['GET /purchases/pu1'] = () => ({ status: 403, body: { message: 'You do not have access to that branch' } });
    await wrap(<PurchaseDetailScreen />);
    expect(await screen.findByText('You do not have access to that branch')).toBeTruthy();
  });
});

describe('Purchase return', () => {
  it('shows No access without purchases:return and loads no purchase', async () => {
    me = user(['purchases:read']);
    await wrap(<PurchaseReturnScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(callsTo('GET', '/purchases/pu1')).toHaveLength(0);
  });

  it('lists the batches with what is still returnable and dims fully returned ones', async () => {
    routes['GET /purchases/pu1/returns'] = () => ({ body: [{ ...earlierReturn, items: [{ productId: 'p2', batchId: 'bt2', batchNumber: 'B-2', quantity: 2 }] }] });
    await wrap(<PurchaseReturnScreen />);
    expect(await screen.findByText('Panadol')).toBeTruthy();
    expect(screen.getByText('Fully returned')).toBeTruthy();
    expect(screen.getByText('0 of 1 selected')).toBeTruthy();
    expect(disabled(button('Confirm return'))).toBe(true);
  });

  it('select-all fills each quantity and shows the web figures with the vendor-credit choice', async () => {
    await wrap(<PurchaseReturnScreen />);
    await screen.findByText('Panadol');
    await fireEvent.press(screen.getByLabelText('Select all items'));
    expect(await screen.findByText('Excess Rs 1,000 over the outstanding balance')).toBeTruthy();
    expect(screen.getByText('Rs 1,100')).toBeTruthy();
    expect(screen.getByText('Adjusted against outstanding; excess Rs 1,000 becomes vendor credit.')).toBeTruthy();
    expect(disabled(button('Confirm return'))).toBe(false);
  });

  it('a quantity above what can be returned shows the web message and blocks confirming', async () => {
    await wrap(<PurchaseReturnScreen />);
    await screen.findByText('Panadol');
    await fireEvent.press(screen.getByLabelText('Select Panadol batch B-1'));
    await fireEvent.changeText(screen.getAllByLabelText('Return qty')[0], '11');
    expect(await screen.findByText('Return quantities must be between 1 and what can still be returned.')).toBeTruthy();
    expect(disabled(button('Confirm return'))).toBe(true);
    await fireEvent.changeText(screen.getAllByLabelText('Return qty')[0], '0.5');
    expect(disabled(button('Confirm return'))).toBe(true);
  });

  it('posts a partial return with the reason, notes and plain ADJUST, then goes back', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /purchases/pu1/returns'] = () => ({ body: { id: 'r1' } });
    await wrap(<PurchaseReturnScreen />);
    await screen.findByText('Panadol');
    await fireEvent.press(screen.getByLabelText('Select Brufen batch B-2'));
    await fireEvent.changeText(screen.getAllByLabelText('Return qty')[1], '1');
    await fireEvent.press(screen.getByLabelText('Reason: Damaged'));
    await fireEvent.changeText(screen.getByLabelText('Notes (optional)'), ' crushed ');
    await fireEvent.press(button('Confirm return'));
    await waitFor(() => expect(toastTexts()).toEqual(['Purchase return recorded']));
    expect(callsTo('POST', '/purchases/pu1/returns')[0].body).toEqual({
      purchaseId: 'pu1',
      branchId: 'b1',
      reasonCode: 'DAMAGED',
      reason: 'Damaged',
      notes: 'crushed',
      settlement: { mode: 'ADJUST' },
      items: [{ productId: 'p2', batchId: 'bt2', quantity: 1 }],
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('"Refund now" sends the refund mode and method', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /purchases/pu1/returns'] = () => ({ body: { id: 'r1' } });
    await wrap(<PurchaseReturnScreen />);
    await screen.findByText('Panadol');
    await fireEvent.press(screen.getByLabelText('Select all items'));
    await fireEvent.press(await screen.findByLabelText('Refund now'));
    await fireEvent.press(await screen.findByLabelText('Refund method: Bank transfer'));
    expect(screen.getByText('Adjusted against outstanding; Rs 1,000 refunded now.')).toBeTruthy();
    await fireEvent.press(button('Confirm return'));
    await waitFor(() => expect(callsTo('POST', '/purchases/pu1/returns')).toHaveLength(1));
    expect((callsTo('POST', '/purchases/pu1/returns')[0].body as { settlement: unknown }).settlement).toEqual({ mode: 'REFUND', method: 'BANK_TRANSFER' });
  });

  it('a rejected return (over-return) shows the server message, stays on the screen and reports no success', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /purchases/pu1/returns'] = () => ({ status: 400, body: { message: 'Cannot return 5 from batch B-1 — only 3 remains returnable (already returned 1 of 4)' } });
    await wrap(<PurchaseReturnScreen />);
    await screen.findByText('Panadol');
    await fireEvent.press(screen.getByLabelText('Select all items'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Confirm return' }));
    await waitFor(() => expect(toastTexts()).toEqual(['Cannot return 5 from batch B-1 — only 3 remains returnable (already returned 1 of 4)']));
    expect(router.back).not.toHaveBeenCalled();
    expect(callsTo('POST', '/purchases/pu1/returns')).toHaveLength(1);
  });

  it('cancelling the confirmation sends nothing', async () => {
    confirmMock.mockResolvedValue(false);
    await wrap(<PurchaseReturnScreen />);
    await screen.findByText('Panadol');
    await fireEvent.press(screen.getByLabelText('Select all items'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Confirm return' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(callsTo('POST', '/purchases/pu1/returns')).toHaveLength(0);
  });

  it('a fully returned purchase has nothing to return', async () => {
    routes['GET /purchases/pu1'] = () => ({ body: { ...purchase, returnStatus: 'FULL' } });
    await wrap(<PurchaseReturnScreen />);
    expect(await screen.findByText('Nothing to return')).toBeTruthy();
  });
});
