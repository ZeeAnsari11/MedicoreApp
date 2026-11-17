import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { CashReceiptScreen } from '@/features/cash-receipt/cash-receipt-screen';
import { serializeDraft } from '@/features/cash-receipt/sheet';
import { confirmAction } from '@/lib/confirm';
import { navSections } from '@/navigation/nav-config';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { TenantRole } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
const mockShare = jest.fn();
const mockPrint = jest.fn();
jest.mock('@/features/documents/use-document-file', () => ({ useDocumentFile: () => ({ isBusy: false, share: mockShare, print: mockPrint }) }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

interface Call { method: string; path: string; body: unknown }
const calls: Call[] = [];
type Handler = (call: Call) => { status?: number; body?: unknown; gate?: Promise<void> };
let routes: Record<string, Handler> = {};
let me: Record<string, unknown>;
let inFlight = 0;
const confirmMock = confirmAction as jest.Mock;

const branches = [{ id: 'b1', name: 'Main', code: 'M', isMain: true, isActive: true }, { id: 'b2', name: 'North', code: 'N', isMain: false, isActive: true }];
const inv1 = { id: 'i1', invoiceNumber: '0001', saleDate: '2026-11-10T00:00:00.000Z', customerId: 'c1', customerName: 'Ali Traders', grandTotal: 1000, netTotal: 1000, received: 400, balance: 600, payable: true, customerBalance: 2000 };
const inv2 = { ...inv1, id: 'i2', invoiceNumber: '0002', balance: 300, received: 700 };
const paid = { ...inv1, id: 'i3', invoiceNumber: '0003', balance: 0, received: 1000, payable: false };
const user = (permissions: string[], extra: Record<string, unknown> = {}) => ({ userId: 'u1', tenantId: 't1', username: 'cashier', tenantRole: TenantRole.TENANT_USER, branchId: 'b1', permissions, ...extra });
const BOTH = ['cash_receipt:read', 'cash_receipt:create'];
const saved = { id: 'r1', voucherNumber: 'CR-000001', count: 2, total: 150, rows: [{ invoiceId: 'i1', invoiceNumber: '0001', customerName: 'Ali Traders', amount: 100 }, { invoiceId: 'i2', invoiceNumber: '0002', customerName: 'Ali Traders', amount: 50 }] };

beforeEach(async () => {
  calls.length = 0;
  inFlight = 0;
  confirmMock.mockReset();
  mockShare.mockReset();
  mockPrint.mockReset();
  await AsyncStorage.clear();
  me = user(BOTH);
  routes = {
    'GET /auth/me': () => ({ body: me }),
    'GET /branches': () => ({ body: branches }),
    'GET /sales/invoices/lookup': (c) => ({ body: [inv1, inv2, paid].filter((i) => i.invoiceNumber.includes(new URLSearchParams(c.path.split('?')[1]).get('q') ?? '')) }),
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

/** Types a voucher number, waits for the debounced lookup, picks the invoice. */
async function selectInvoice(number: string) {
  await fireEvent.changeText(await screen.findByLabelText('Voucher #'), number);
  await fireEvent.press(await screen.findByRole('button', { name: `Invoice ${number}` }));
}
async function addEntry(number: string, amount: string) {
  await selectInvoice(number);
  await fireEvent.changeText(screen.getByLabelText('Amount'), amount);
  await fireEvent.press(button('Add'));
}

describe('access', () => {
  it('shows Loading, never "No access", while /auth/me loads', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    routes['GET /auth/me'] = () => ({ body: me, gate });
    await wrap(<CashReceiptScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
    release();
    expect(await screen.findByLabelText('Voucher #')).toBeTruthy();
  });

  it('shows an error with retry, not "No access", when /auth/me fails', async () => {
    routes['GET /auth/me'] = () => ({ status: 500, body: { message: 'Profile service down' } });
    await wrap(<CashReceiptScreen />);
    expect(await screen.findByText('Profile service down')).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
  });

  it('shows "No access" for a user without cash_receipt:read, and makes no lookup', async () => {
    me = user(['sales:read', 'sales:create']);
    await wrap(<CashReceiptScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(callsTo('GET', '/sales/invoices/lookup')).toHaveLength(0);
  });

  it('read-only users can fill the sheet but cannot save it', async () => {
    me = user(['cash_receipt:read']);
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    expect(await screen.findByText('Entries: 1')).toBeTruthy();
    expect(disabled(button('Save cash receipt'))).toBe(true);
  });

  it('the menu entry needs cash_receipt:read', () => {
    const item = navSections.flatMap((s) => s.items).find((i) => i.href === '/sales/cash-receipt')!;
    expect(item.anyOf).toEqual(['cash_receipt:read']);
    expect(navSections.find((s) => s.title === 'Operations')!.items).toContain(item);
  });
});

describe('branch', () => {
  it('pins a branch user to their own branch', async () => {
    await wrap(<CashReceiptScreen />);
    expect(await screen.findByText('Branch: Main')).toBeTruthy();
    expect(screen.queryByText('Select a branch to enter receipts.')).toBeNull();
  });

  it('an admin must choose a branch first; the voucher box stays disabled until then', async () => {
    me = user([], { tenantRole: TenantRole.TENANT_SUPER_ADMIN, branchId: undefined });
    await wrap(<CashReceiptScreen />);
    expect(await screen.findByText('Select a branch to enter receipts.')).toBeTruthy();
    expect(screen.getByLabelText('Voucher #').props.editable).toBe(false);
    await fireEvent.press(screen.getByLabelText('Branch: North'));
    await waitFor(() => expect(screen.getByLabelText('Voucher #').props.editable).toBe(true));
    expect(screen.queryByText('Select a branch to enter receipts.')).toBeNull();
  });

  it('the branch is locked once the sheet has entries', async () => {
    me = user([], { tenantRole: TenantRole.TENANT_SUPER_ADMIN, branchId: undefined });
    await wrap(<CashReceiptScreen />);
    await fireEvent.press(await screen.findByLabelText('Branch: Main'));
    await waitFor(() => expect(screen.getByLabelText('Voucher #').props.editable).toBe(true));
    await addEntry('0001', '100');
    await screen.findByText('Entries: 1');
    expect(disabled(screen.getByLabelText('Branch: North'))).toBe(true);
    expect(screen.getByText('The branch is locked while the sheet has entries.')).toBeTruthy();
  });

  it('the lookup is scoped to the branch', async () => {
    await wrap(<CashReceiptScreen />);
    await selectInvoice('0001');
    expect(callsTo('GET', '/sales/invoices/lookup')[0].path).toContain('branchId=b1');
  });
});

describe('entering the sheet', () => {
  it('shows suggestions, with paid invoices muted and badged', async () => {
    await wrap(<CashReceiptScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Voucher #'), '000');
    expect(await screen.findByRole('button', { name: 'Invoice 0001' })).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
  });

  it('says so when no outstanding invoice matches', async () => {
    await wrap(<CashReceiptScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Voucher #'), '9999');
    expect(await screen.findByText('No outstanding invoices found')).toBeTruthy();
  });

  it('selecting an invoice fills the date and tiles; Full fills the balance', async () => {
    await wrap(<CashReceiptScreen />);
    await selectInvoice('0001');
    expect(screen.getAllByText('600.00').length).toBeGreaterThan(0);
    expect(screen.getByText('2,000.00')).toBeTruthy();
    await fireEvent.press(button('Full'));
    expect(screen.getByLabelText('Amount').props.value).toBe('600');
  });

  it('a paid invoice cannot be added: Amount is disabled and Add says "Already paid"', async () => {
    await wrap(<CashReceiptScreen />);
    await selectInvoice('0003');
    expect(screen.getByLabelText('Amount').props.editable).toBe(false);
    expect(disabled(button('Full'))).toBe(true);
    await fireEvent.press(button('Add'));
    expect(await screen.findByText('Already paid')).toBeTruthy();
  });

  it('adding needs a voucher, and validates the amount with the web messages', async () => {
    await wrap(<CashReceiptScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Select a voucher first')).toBeTruthy();
    await selectInvoice('0001');
    await fireEvent.press(button('Add'));
    expect(await screen.findByText('Enter an amount greater than 0')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '10.555');
    await fireEvent.press(button('Add'));
    expect(await screen.findByText('Max 2 decimals')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '700');
    await fireEvent.press(button('Add'));
    expect(await screen.findByText('Cannot exceed the balance of 600.00')).toBeTruthy();
    expect(screen.getByText('No entries yet. Type a voucher number above.')).toBeTruthy();
  });

  it('adds rows with running customer balances, the footer totals, and rejects the same invoice twice', async () => {
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    await addEntry('0002', '50');
    expect(await screen.findByText('Entries: 2')).toBeTruthy();
    expect(screen.getByText('Total: Rs. 150.00')).toBeTruthy();
    expect(screen.getByText(/Cust\. Bal\. 2,000\.00 · Final Bal\. 1,900\.00/)).toBeTruthy();
    expect(screen.getByText(/Cust\. Bal\. 1,900\.00 · Final Bal\. 1,850\.00/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Voucher #'), '0001');
    await fireEvent.press(await screen.findByRole('button', { name: 'Invoice 0001' }));
    expect(await screen.findByText('Already in sheet')).toBeTruthy();
  });

  it('removes a row', async () => {
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    await fireEvent.press(await screen.findByLabelText('Remove row'));
    expect(await screen.findByText('Entries: 0')).toBeTruthy();
  });

  it('restores an unsaved sheet for this user and keeps its batch id', async () => {
    const row = { key: 'k1', invoiceId: 'i1', invoiceNumber: '0001', customerId: 'c1', customerName: 'Ali Traders', customerBalance: 2000, saleDate: '2026-11-10', voucherAmount: 1000, received: 400, balance: 600, amount: '100' };
    await AsyncStorage.setItem('cash-receipt-sheet:t1:u1', serializeDraft({ rows: [row], batchId: '22222222-2222-4222-8222-222222222222', branchId: 'b1' }));
    confirmMock.mockResolvedValue(true);
    routes['POST /sales/cash-receipts'] = () => ({ body: saved });
    await wrap(<CashReceiptScreen />);
    expect(await screen.findByText('Entries: 1')).toBeTruthy();
    await fireEvent.press(button('Save cash receipt'));
    await waitFor(() => expect(callsTo('POST', '/sales/cash-receipts')).toHaveLength(1));
    expect((callsTo('POST', '/sales/cash-receipts')[0].body as { batchId: string }).batchId).toBe('22222222-2222-4222-8222-222222222222');
    await waitFor(async () => expect(await AsyncStorage.getItem('cash-receipt-sheet:t1:u1')).toBeNull());
  });

  it("another user's draft is not shown", async () => {
    await AsyncStorage.setItem('cash-receipt-sheet:t1:other', serializeDraft({ rows: [{ key: 'k', invoiceId: 'i1', invoiceNumber: '0001', customerId: 'c1', customerName: 'x', customerBalance: 1, saleDate: '', voucherAmount: 1, received: 0, balance: 1, amount: '1' }], batchId: 'b', branchId: null }));
    await wrap(<CashReceiptScreen />);
    expect(await screen.findByText('Entries: 0')).toBeTruthy();
  });
});

describe('saving', () => {
  it('cannot save an empty sheet', async () => {
    await wrap(<CashReceiptScreen />);
    await screen.findByLabelText('Voucher #');
    expect(disabled(button('Save cash receipt'))).toBe(true);
  });

  it('saves once after confirming, posts the sheet, shows the voucher banner and clears the sheet', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /sales/cash-receipts'] = () => ({ body: saved });
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    await addEntry('0002', '50');
    await screen.findByText('Entries: 2');
    await fireEvent.press(button('Save cash receipt'));
    expect(await screen.findByText('2 receipts saved, total Rs. 150.00 (CR-000001)')).toBeTruthy();
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: 'Save cash receipt?', message: expect.stringContaining('2 entries, total Rs. 150.00') });
    const posts = callsTo('POST', '/sales/cash-receipts');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ method: 'CASH', rows: [{ invoiceId: 'i1', amount: 100 }, { invoiceId: 'i2', amount: 50 }] });
    expect(posts[0].body).not.toHaveProperty('branchId');
    expect(screen.getByText('Entries: 0')).toBeTruthy();
  });

  it('declining the confirmation sends nothing and keeps the sheet', async () => {
    confirmMock.mockResolvedValue(false);
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    await fireEvent.press(await screen.findByRole('button', { name: 'Save cash receipt' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(callsTo('POST', '/sales/cash-receipts')).toHaveLength(0);
    expect(screen.getByText('Entries: 1')).toBeTruthy();
  });

  it('a double press sends one request', async () => {
    confirmMock.mockResolvedValue(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    routes['POST /sales/cash-receipts'] = () => ({ body: saved, gate });
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    const save = await screen.findByRole('button', { name: 'Save cash receipt' });
    // The press resolves with the async handler, which waits on the gated POST: don't await it until released.
    const first = fireEvent.press(save);
    await waitFor(() => expect(callsTo('POST', '/sales/cash-receipts')).toHaveLength(1));
    const second = fireEvent.press(save);
    release();
    await Promise.all([first, second]);
    await screen.findByText(/receipts? saved/);
    expect(callsTo('POST', '/sales/cash-receipts')).toHaveLength(1);
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it('highlights rows the server rejected, keeps the sheet and its batch id, and reports nothing saved', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /sales/cash-receipts'] = () => ({ status: 400, body: { message: 'Some rows could not be saved', errors: [{ invoiceId: 'i2', reason: 'Invoice is already paid' }] } });
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    await addEntry('0002', '50');
    await screen.findByText('Entries: 2');
    await fireEvent.press(button('Save cash receipt'));
    expect(await screen.findByText('Invoice is already paid')).toBeTruthy();
    await waitFor(() => expect(toastTexts()).toEqual(['Nothing was saved. Some rows failed validation.']));
    expect(screen.getByText('Entries: 2')).toBeTruthy();
    expect(screen.queryByText(/saved, total/)).toBeNull();
  });

  it.each([
    ['403', 403, 'You do not have access to that branch'],
    ['404', 404, 'Invoice not found'],
    ['400 mixed branches', 400, 'A cash receipt sheet cannot mix invoices from different branches'],
  ])('a %s shows the server message once and keeps the sheet', async (_n, status, message) => {
    confirmMock.mockResolvedValue(true);
    routes['POST /sales/cash-receipts'] = () => ({ status, body: { message } });
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    await fireEvent.press(await screen.findByRole('button', { name: 'Save cash receipt' }));
    await waitFor(() => expect(toastTexts()).toEqual([message]));
    expect(callsTo('POST', '/sales/cash-receipts')).toHaveLength(1);
    expect(screen.getByText('Entries: 1')).toBeTruthy();
    expect(screen.queryByText(/saved, total/)).toBeNull();
  });

  it('re-checks edited amounts before sending: a bad row blocks the save', async () => {
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    await fireEvent.changeText(await screen.findByLabelText('Amount 0001'), '900');
    await fireEvent.press(button('Save cash receipt'));
    await waitFor(() => expect(toastTexts()).toEqual(['Fix the highlighted rows before saving']));
    expect(await screen.findByText('Cannot exceed the balance of 600.00')).toBeTruthy();
    expect(callsTo('POST', '/sales/cash-receipts')).toHaveLength(0);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('the voucher banner shares and prints the voucher and each invoice from the sheet branch', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /sales/cash-receipts'] = () => ({ body: saved });
    await wrap(<CashReceiptScreen />);
    await addEntry('0001', '100');
    await fireEvent.press(await screen.findByRole('button', { name: 'Save cash receipt' }));
    await screen.findByText(/saved, total/);
    await fireEvent.press(button('Share voucher'));
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ path: '/sales/cash-receipts/r1/pdf?branchId=b1', fileName: 'CR-000001.pdf' }));
    await fireEvent.press(button('Print voucher'));
    expect(mockPrint).toHaveBeenCalledWith(expect.objectContaining({ path: '/sales/cash-receipts/r1/pdf?branchId=b1' }));
    await fireEvent.press(button('Share 0002'));
    expect(mockShare).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/sales/cash-receipts/r1/pdf?branchId=b1&invoiceId=i2' }));
    await fireEvent.press(button('Dismiss'));
    await waitFor(() => expect(screen.queryByText(/saved, total/)).toBeNull());
  });
});
