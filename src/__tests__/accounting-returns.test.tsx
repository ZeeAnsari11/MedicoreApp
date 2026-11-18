import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ReturnsScreen } from '@/features/accounting/returns-screen';
import { clampQty, hasAnyQty, purchaseReturnItems, saleReturnItems } from '@/features/accounting/returns-logic';
import { navSections } from '@/navigation/nav-config';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, Stack: { Screen: () => null }, Link: (props: object) => require('@/test-support/link-mock').MockLink(props) }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const saleItems = [{ productId: 'p1', productName: 'Panadol', batchAllocations: [{ batchId: 'bt1', batchNumber: 'B-1', originalQuantity: 10, alreadyReturned: 4, returnable: 6 }, { batchId: 'bt2', batchNumber: 'B-2', originalQuantity: 5, alreadyReturned: 5, returnable: 0 }] }];
const purchaseItems = [{ productId: 'p1', productName: 'Panadol', batchId: 'bt1', batchNumber: 'B-1', originalQuantity: 20, alreadyReturned: 2, returnable: 18 }];
const emptyPage = { items: [], total: 0, page: 1, limit: 50 };

beforeEach(() => {
  h.reset();
  h.me = makeUser(['acc_returns:read', 'acc_returns:create']);
  h.routes['GET /sales'] = () => ({ body: { ...emptyPage, items: [{ id: 's1', invoiceNumber: 'INV-1' }] } });
  h.routes['GET /purchases'] = () => ({ body: { ...emptyPage, items: [{ id: 'pu1', purchaseNumber: 'PO-1' }] } });
  h.routes['GET /accounting/returns/sale/returnable'] = () => ({ body: saleItems });
  h.routes['GET /accounting/returns/purchase/returnable'] = () => ({ body: purchaseItems });
  h.routes['GET /accounting/returns/sale'] = () => ({ body: [{ id: 'r1', returnNumber: 'SR-1', returnDate: '2026-11-10T00:00:00.000Z', reason: 'Damaged', total: 120 }] });
  h.routes['GET /accounting/returns/purchase'] = () => ({ body: [] });
});
afterEach(() => h.settle());

async function pickSale() {
  await fireEvent.press(await screen.findByLabelText('Invoice'));
  await fireEvent.press(await screen.findByRole('button', { name: 'INV-1' }));
}

describe('returns logic', () => {
  it('clamps typed quantities to 0..returnable', () => {
    expect(clampQty(9, 6)).toBe(6);
    expect(clampQty(-3, 6)).toBe(0);
    expect(clampQty(Number.NaN, 6)).toBe(0);
    expect(clampQty(4, 6)).toBe(4);
  });
  it('builds sale items grouped by product with only the batches that have a quantity', () => {
    expect(saleReturnItems(saleItems as never, { 'p1:bt1': 2 })).toEqual([{ productId: 'p1', batchAllocations: [{ batchId: 'bt1', quantity: 2 }] }]);
    expect(saleReturnItems(saleItems as never, {})).toEqual([]);
    expect(hasAnyQty({ a: 0, b: 0 })).toBe(false);
    expect(hasAnyQty({ a: 0, b: 1 })).toBe(true);
  });
  it('builds purchase items per batch', () => {
    expect(purchaseReturnItems(purchaseItems as never, { 'p1:bt1': 3 })).toEqual([{ productId: 'p1', batchId: 'bt1', quantity: 3 }]);
  });
});

describe('Returns screen', () => {
  it('is gated, listed in the menu, and loads nothing without acc_returns:read', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<ReturnsScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/returns/sale')).toHaveLength(0);
    expect(navSections.find((s) => s.title === 'Accounting')!.items.find((i) => i.href === '/accounting/returns')!.anyOf).toEqual(['acc_returns:read']);
  });

  it('asks for an invoice first and shows the recorded-returns history', async () => {
    await h.wrap(<ReturnsScreen />);
    expect(await screen.findByText('Select an invoice to view returnable items.')).toBeTruthy();
    expect(await screen.findByText('SR-1')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/returns/sale/returnable')).toHaveLength(0);
  });

  it('shows what is returnable per batch and a fully-returned batch cannot be edited', async () => {
    await h.wrap(<ReturnsScreen />);
    await pickSale();
    expect(await screen.findByText('Batch B-1 · Sold 10 · Returned 4 · Returnable 6')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/returns/sale/returnable')[0].path).toContain('saleId=s1');
    expect(screen.getByLabelText('Return qty Panadol B-2').props.editable).toBe(false);
  });

  it('clamps a typed quantity to what is returnable', async () => {
    await h.wrap(<ReturnsScreen />);
    await pickSale();
    await fireEvent.changeText(await screen.findByLabelText('Return qty Panadol B-1'), '99');
    expect(screen.getByLabelText('Return qty Panadol B-1').props.value).toBe('6');
  });

  it('Record Return stays disabled until a quantity is entered, then posts once without a branch and resets', async () => {
    h.routes['POST /accounting/returns/sale'] = () => ({ body: { id: 'r2' } });
    await h.wrap(<ReturnsScreen />);
    await pickSale();
    expect(disabled(await screen.findByRole('button', { name: 'Record Return' }))).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Return qty Panadol B-1'), '2');
    await fireEvent.changeText(screen.getByLabelText('Reason'), ' Broken seal ');
    await fireEvent.press(button('Record Return'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Sale return recorded']));
    const posts = h.callsTo('POST', '/accounting/returns/sale');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ saleId: 's1', items: [{ productId: 'p1', batchAllocations: [{ batchId: 'bt1', quantity: 2 }] }], reason: 'Broken seal' });
    expect(posts[0].body).not.toHaveProperty('branchId');
    expect(posts[0].headers['X-Branch-Id']).toBeUndefined();
    expect(await screen.findByText('Select an invoice to view returnable items.')).toBeTruthy();
  });

  it('a purchase return uses the purchase endpoints', async () => {
    h.routes['POST /accounting/returns/purchase'] = () => ({ body: { id: 'r3' } });
    await h.wrap(<ReturnsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Return type: Purchase Return' }));
    await fireEvent.press(await screen.findByLabelText('Purchase'));
    await fireEvent.press(await screen.findByRole('button', { name: 'PO-1' }));
    expect(await screen.findByText('Batch B-1 · Received 20 · Returned 2 · Returnable 18')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Return qty Panadol B-1'), '3');
    await fireEvent.press(button('Record Return'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Purchase return recorded']));
    expect(h.callsTo('POST', '/accounting/returns/purchase')[0].body).toMatchObject({ purchaseId: 'pu1', items: [{ productId: 'p1', batchId: 'bt1', quantity: 3 }] });
  });

  it('Record Return needs acc_returns:create', async () => {
    h.me = makeUser(['acc_returns:read']);
    await h.wrap(<ReturnsScreen />);
    await pickSale();
    await fireEvent.changeText(await screen.findByLabelText('Return qty Panadol B-1'), '1');
    expect(disabled(button('Record Return'))).toBe(true);
  });

  it('a rejected return shows the server message and keeps the quantities', async () => {
    h.routes['POST /accounting/returns/sale'] = () => ({ status: 400, body: { message: 'Cannot return 5 from batch B-1 — only 3 remains returnable' } });
    await h.wrap(<ReturnsScreen />);
    await pickSale();
    await fireEvent.changeText(await screen.findByLabelText('Return qty Panadol B-1'), '5');
    await fireEvent.press(button('Record Return'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Cannot return 5 from batch B-1 — only 3 remains returnable']));
    expect(screen.getByLabelText('Return qty Panadol B-1').props.value).toBe('5');
  });

  it('a double press sends one request', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.routes['POST /accounting/returns/sale'] = () => ({ body: { id: 'r2' }, gate });
    await h.wrap(<ReturnsScreen />);
    await pickSale();
    await fireEvent.changeText(await screen.findByLabelText('Return qty Panadol B-1'), '2');
    const record = button('Record Return');
    const first = fireEvent.press(record);
    await waitFor(() => expect(h.callsTo('POST', '/accounting/returns/sale')).toHaveLength(1));
    const second = fireEvent.press(record);
    release();
    await Promise.all([first, second]);
    await waitFor(() => expect(h.toastTexts()).toEqual(['Sale return recorded']));
    expect(h.callsTo('POST', '/accounting/returns/sale')).toHaveLength(1);
  });

  it('searches documents server-side and scopes them to the branch', async () => {
    await h.wrap(<ReturnsScreen />);
    await screen.findByText('SR-1');
    await fireEvent.changeText(screen.getByPlaceholderText('Search invoices...'), 'INV-9');
    await waitFor(() => expect(h.callsTo('GET', '/sales').some((c) => c.path.includes('search=INV-9'))).toBe(true));
    expect(h.callsTo('GET', '/sales')[0].path).toContain('branchId=b1');
  });

  it('shows a server error for the returnable list', async () => {
    h.routes['GET /accounting/returns/sale/returnable'] = () => ({ status: 404, body: { message: 'Sale not found' } });
    await h.wrap(<ReturnsScreen />);
    await pickSale();
    expect(await screen.findByText('Sale not found')).toBeTruthy();
  });
});
