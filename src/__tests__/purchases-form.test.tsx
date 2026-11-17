import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { PurchaseForm } from '@/features/purchases/purchase-form';
import { confirmAction } from '@/lib/confirm';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { PaymentStatus, TenantRole } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.setTimeout(20000);
// The first picker open waits for vendors/products to load; a busy CI machine needs more than the 1s default.
configure({ asyncUtilTimeout: 5000 });

interface Call { method: string; path: string; body: unknown }
const calls: Call[] = [];
type Handler = (call: Call) => { status?: number; body?: unknown; gate?: Promise<void> };
let routes: Record<string, Handler> = {};
let me: Record<string, unknown>;
let inFlight = 0;
const confirmMock = confirmAction as jest.Mock;
const { router } = jest.requireMock('expo-router');

const branches = [{ id: 'b1', name: 'Main', code: 'M', isMain: true, isActive: true }, { id: 'b2', name: 'North', code: 'N', isMain: false, isActive: true }];
const vendors = [{ id: 'v1', company: 'Acme Pharma', isActive: true }, { id: 'v2', company: 'Beta Traders', isActive: true }];
const products = [
  { id: 'p1', name: 'Panadol', genericName: 'Paracetamol', cp: 100, tp: 120, status: 'ACTIVE' },
  { id: 'p9', name: 'Unlinked', genericName: 'None', cp: 10, tp: 12, status: 'ACTIVE' },
];
const links = [{ id: 'l1', vendorId: 'v1', productId: 'p1', purchasePrice: 100, isActive: true }];
const clerk = { userId: 'u1', tenantId: 't1', username: 'store', tenantRole: TenantRole.TENANT_USER, branchId: 'b1', permissions: ['purchases:read', 'purchases:create', 'purchases:update'] };
const lockedEdit = { id: 'pu1', branchId: 'b1', vendorId: 'v1', purchaseNumber: '0001', vendorInvoiceNumber: 'INV-1', purchaseDate: '2026-11-10T00:00:00.000Z', status: 'RECEIVED', paymentStatus: PaymentStatus.UNPAID, amountPaid: 0, grandTotal: 1000, isEditable: true, items: [{ productId: 'p1', productName: 'Panadol', batchNumber: 'B-1', batchId: 'bt1', expiryDate: '2027-01-31T00:00:00.000Z', quantity: 10, purchasePrice: 100, sellingPrice: 120, lineTotal: 1000 }] };

beforeEach(() => {
  calls.length = 0;
  inFlight = 0;
  confirmMock.mockReset();
  router.back.mockReset();
  me = clerk;
  routes = {
    'GET /auth/me': () => ({ body: me }),
    'GET /branches': () => ({ body: branches }),
    'GET /vendors': () => ({ body: vendors }),
    'GET /products': () => ({ body: products }),
    'GET /vendor-products': () => ({ body: links }),
    'GET /purchases/last-price': () => ({ body: [] }),
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

async function pick(label: string, option: string) {
  // The pickers ignore presses until the branch is known and its vendors/products have loaded.
  await waitFor(() => expect(screen.getByLabelText('Branch').props.value).toBe('Main'));
  await waitFor(() => expect(callsTo('GET', '/vendors').length).toBeGreaterThan(0));
  await waitFor(() => expect(callsTo('GET', '/products').length).toBeGreaterThan(0));
  await new Promise((r) => setTimeout(r, 30));
  await fireEvent.press(await screen.findByLabelText(label));
  await fireEvent.press(await screen.findByRole('button', { name: new RegExp(option) }));
}

/** Vendor Acme + one Panadol line (price overridden when given). */
async function fillOneLine(price?: string) {
  await pick('Vendor', 'Acme Pharma');
  await pick('Product', 'Panadol');
  await fireEvent.changeText(screen.getByLabelText('Batch #'), 'B-9');
  await fireEvent.changeText(screen.getByLabelText('Expiry (YYYY-MM-DD)'), '2030-01-31');
  await fireEvent.changeText(screen.getByLabelText('Qty'), '10');
  if (price) await fireEvent.changeText(screen.getByLabelText('Price'), price);
  await fireEvent.press(button('Add line'));
}

describe('PurchaseForm (create)', () => {
  it('cannot receive a purchase with no lines', async () => {
    await wrap(<PurchaseForm />);
    await screen.findByLabelText('Vendor');
    expect(disabled(button('Receive purchase'))).toBe(true);
    expect(callsTo('POST', '/purchases')).toHaveLength(0);
  });

  it('pins a branch user to their own branch', async () => {
    await wrap(<PurchaseForm />);
    await waitFor(() => expect(screen.getByLabelText('Branch').props.value).toBe('Main'));
    expect(screen.getByLabelText('Branch').props.editable).toBe(false);
  });

  it('asks for a vendor before lines can be added', async () => {
    await wrap(<PurchaseForm />);
    expect(await screen.findByText('Select a vendor first')).toBeTruthy();
    expect(disabled(button('Add line'))).toBe(true);
  });

  it('only offers products the vendor is linked to, prefilling the cost and sale price', async () => {
    await wrap(<PurchaseForm />);
    await pick('Vendor', 'Acme Pharma');
    await fireEvent.press(await screen.findByLabelText('Product'));
    expect(await screen.findByRole('button', { name: /Panadol/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Unlinked/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Panadol/ }));
    expect(screen.getByLabelText('Price').props.value).toBe('100');
    expect(screen.getByLabelText('Sale price').props.value).toBe('120');
    expect(await screen.findByText('First purchase')).toBeTruthy();
  });

  it('shows the web validation message for an incomplete line and adds nothing', async () => {
    await wrap(<PurchaseForm />);
    await pick('Vendor', 'Acme Pharma');
    await pick('Product', 'Panadol');
    await fireEvent.press(button('Add line'));
    expect((await screen.findAllByText(/Batch # is required/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Edit')).toBeNull();
    expect(disabled(button('Receive purchase'))).toBe(true);
  });

  it('receives the purchase once, with branchId in the body and the typed line, then resets the form', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /purchases'] = () => ({ body: { id: 'pu1', purchaseNumber: '0007', priceChanges: [] } });
    await wrap(<PurchaseForm />);
    await fillOneLine();
    await fireEvent.press(button('Receive purchase'));
    await waitFor(() => expect(toastTexts()).toEqual(['Purchase 0007 received']));
    const posts = callsTo('POST', '/purchases');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({
      branchId: 'b1',
      vendorId: 'v1',
      paymentStatus: 'UNPAID',
      items: [{ productId: 'p1', batchNumber: 'B-9', expiryDate: '2030-01-31', quantity: 10, purchasePrice: 100, sellingPrice: 120 }],
    });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(disabled(button('Receive purchase'))).toBe(true));
  });

  it('a double press sends one request', async () => {
    confirmMock.mockResolvedValue(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    routes['POST /purchases'] = () => ({ body: { id: 'pu1', purchaseNumber: '0007', priceChanges: [] }, gate });
    await wrap(<PurchaseForm />);
    await fillOneLine();
    const receive = button('Receive purchase');
    // The press resolves with the async handler, which here waits on the gated POST: don't await it.
    const first = fireEvent.press(receive);
    await waitFor(() => expect(callsTo('POST', '/purchases')).toHaveLength(1));
    const second = fireEvent.press(receive);
    release();
    await Promise.all([first, second]);
    await waitFor(() => expect(toastTexts()).toEqual(['Purchase 0007 received']));
    expect(callsTo('POST', '/purchases')).toHaveLength(1);
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it('declining the confirmation sends nothing', async () => {
    confirmMock.mockResolvedValue(false);
    await wrap(<PurchaseForm />);
    await fillOneLine();
    await fireEvent.press(button('Receive purchase'));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(callsTo('POST', '/purchases')).toHaveLength(0);
  });

  it('keeps everything typed and shows the server message when the backend rejects', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /purchases'] = () => ({ status: 409, body: { message: 'Batch "B-9" for Panadol already exists with a different expiry date (2027-02-28)' } });
    await wrap(<PurchaseForm />);
    await fillOneLine();
    await fireEvent.press(button('Receive purchase'));
    await waitFor(() => expect(toastTexts()).toEqual(['Batch "B-9" for Panadol already exists with a different expiry date (2027-02-28)']));
    expect(callsTo('POST', '/purchases')).toHaveLength(1);
    expect(disabled(button('Receive purchase'))).toBe(false);
    expect(screen.queryByText(/received/)).toBeNull();
  });

  it('changing the vendor with lines asks first, and declining keeps the lines', async () => {
    confirmMock.mockResolvedValue(false);
    await wrap(<PurchaseForm />);
    await fillOneLine();
    await pick('Vendor', 'Beta Traders');
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: 'Change vendor?', message: 'Changing the vendor will clear all line items you have added.' });
    expect(disabled(button('Receive purchase'))).toBe(false);
  });

  it('confirming a vendor change clears the lines', async () => {
    confirmMock.mockResolvedValue(true);
    await wrap(<PurchaseForm />);
    await fillOneLine();
    await pick('Vendor', 'Beta Traders');
    await waitFor(() => expect(disabled(button('Receive purchase'))).toBe(true));
  });

  it('a decreased price asks Approve / Save without updating / Cancel, and Cancel sends nothing', async () => {
    await wrap(<PurchaseForm />);
    await fillOneLine('90');
    // The submit handler waits for the dialog decision, so the press promise stays pending until then.
    const submitting = fireEvent.press(button('Receive purchase'));
    expect(await screen.findByText('Purchase price decreased')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve & save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save without updating prices' })).toBeTruthy();
    // FormModal also has its own Cancel (close) control; both mean "cancel".
    await fireEvent.press(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    await waitFor(() => expect(screen.queryByText('Purchase price decreased')).toBeNull());
    expect(confirmMock).not.toHaveBeenCalled();
    expect(callsTo('POST', '/purchases')).toHaveLength(0);
    await submitting;
  });

  it('"Approve & save" sends priceUpdates with updatePrices true', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /purchases'] = () => ({ body: { id: 'pu1', purchaseNumber: '0008', priceChanges: [{ productId: 'p1', productName: 'Panadol', oldPurchasePrice: 100, newPurchasePrice: 90 }] } });
    await wrap(<PurchaseForm />);
    await fillOneLine('90');
    // The submit handler waits for the dialog decision, so the press promise stays pending until then.
    const submitting = fireEvent.press(button('Receive purchase'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Approve & save' }));
    await waitFor(() => expect(toastTexts()).toEqual(['Purchase 0008 received. Price updated: Panadol 100 → 90']));
    expect(callsTo('POST', '/purchases')[0].body).toMatchObject({ priceUpdates: [{ productId: 'p1', updatePrices: true }] });
    await submitting;
  });

  it('"Save without updating prices" sends updatePrices false', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /purchases'] = () => ({ body: { id: 'pu1', purchaseNumber: '0009', priceChanges: [] } });
    await wrap(<PurchaseForm />);
    await fillOneLine('90');
    // The submit handler waits for the dialog decision, so the press promise stays pending until then.
    const submitting = fireEvent.press(button('Receive purchase'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Save without updating prices' }));
    await waitFor(() => expect(toastTexts()).toEqual(['Purchase 0009 received']));
    expect(callsTo('POST', '/purchases')[0].body).toMatchObject({ priceUpdates: [{ productId: 'p1', updatePrices: false }] });
    await submitting;
  });

  it('a partial payment sends the typed amount paid', async () => {
    confirmMock.mockResolvedValue(true);
    routes['POST /purchases'] = () => ({ body: { id: 'pu1', purchaseNumber: '0010', priceChanges: [] } });
    await wrap(<PurchaseForm />);
    await fillOneLine();
    await fireEvent.press(screen.getByLabelText('Payment: Partial'));
    await fireEvent.changeText(await screen.findByLabelText('Amount paid'), '300');
    await fireEvent.press(button('Receive purchase'));
    await waitFor(() => expect(toastTexts()).toEqual(['Purchase 0010 received']));
    expect(callsTo('POST', '/purchases')[0].body).toMatchObject({ paymentStatus: 'PARTIAL', amountPaid: 300 });
  });
});

describe('PurchaseForm (edit)', () => {
  it('shows the purchase branch read-only and its lines, and patches without branchId in the body', async () => {
    confirmMock.mockResolvedValue(true);
    routes['PATCH /purchases/pu1'] = () => ({ body: { id: 'pu1', purchaseNumber: '0001' } });
    await wrap(<PurchaseForm editPurchase={lockedEdit as never} />);
    await waitFor(() => expect(screen.getByLabelText('Branch').props.value).toBe('Main'));
    expect(screen.getByLabelText('Branch').props.editable).toBe(false);
    expect(screen.getByLabelText('Vendor invoice # (optional)').props.value).toBe('INV-1');
    await fireEvent.press(button('Save changes'));
    await waitFor(() => expect(toastTexts()).toEqual(['Purchase 0001 updated']));
    const patches = callsTo('PATCH', '/purchases/pu1');
    expect(patches).toHaveLength(1);
    expect(patches[0].path).toContain('branchId=b1');
    expect(patches[0].body).toMatchObject({ vendorId: 'v1', purchaseDate: '2026-11-10', items: [{ productId: 'p1', batchNumber: 'B-1', quantity: 10 }] });
    expect(router.back).toHaveBeenCalled();
  });

  it('a "locked" 409 shows the server message and leaves the form', async () => {
    confirmMock.mockResolvedValue(true);
    routes['PATCH /purchases/pu1'] = () => ({ status: 409, body: { message: 'Invoice is locked: Payment recorded. Only returns and further payments are allowed.' } });
    await wrap(<PurchaseForm editPurchase={lockedEdit as never} />);
    await screen.findByLabelText('Vendor');
    await fireEvent.press(button('Save changes'));
    await waitFor(() => expect(toastTexts()).toEqual(['Invoice is locked: Payment recorded. Only returns and further payments are allowed.']));
    expect(router.back).toHaveBeenCalled();
  });

  it('any other failure keeps the form open', async () => {
    confirmMock.mockResolvedValue(true);
    routes['PATCH /purchases/pu1'] = () => ({ status: 400, body: { message: 'Products not sold by Acme: Panadol' } });
    await wrap(<PurchaseForm editPurchase={lockedEdit as never} />);
    await screen.findByLabelText('Vendor');
    await fireEvent.press(button('Save changes'));
    await waitFor(() => expect(toastTexts()).toEqual(['Products not sold by Acme: Panadol']));
    expect(router.back).not.toHaveBeenCalled();
  });
});
