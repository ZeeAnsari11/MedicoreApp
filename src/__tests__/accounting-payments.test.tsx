import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { allocatedTotal, buildPaymentRequest, canSubmitPayment, isOpenInvoice, remainderOf, toggleAllocation, voidMessage, type OpenInvoice, type PaymentDraft } from '@/features/accounting/payment-logic';
import { PaymentsScreen } from '@/features/accounting/payments-screen';
import { confirmAction } from '@/lib/confirm';
import { navSections } from '@/navigation/nav-config';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';
import { InvoiceType, PartyType, PaymentMethod } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, Stack: { Screen: () => null }, Link: ({ children }: { children: unknown }) => children }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const confirmMock = confirmAction as jest.Mock;
const button = (name: string | RegExp) => screen.getByRole('button', { name });

const inv = (id: string, outstanding: number): OpenInvoice => ({ invoiceType: InvoiceType.SALE, id, number: `INV-${id}`, grandTotal: outstanding + 100, amountPaid: 100, outstanding });
const draft = (over: Partial<PaymentDraft> = {}): PaymentDraft => ({ partyType: PartyType.CUSTOMER, partyId: 'c1', amount: '500', method: PaymentMethod.CASH, accountId: 'a1', paymentDate: '2026-11-16', reference: '', notes: '', allocations: {}, ...over });

describe('payment logic (web payment-dialog rules)', () => {
  it('an invoice is open above one cent outstanding', () => {
    expect(isOpenInvoice(1000, 999.99)).toBe(false);
    expect(isOpenInvoice(1000, 999.98)).toBe(true);
  });
  it('ticking pre-fills min(outstanding, what is left of the payment)', () => {
    let d = toggleAllocation({}, inv('1', 300), true, 500);
    expect(d['1']).toEqual({ checked: true, amount: '300' });
    d = toggleAllocation(d, inv('2', 400), true, 500);
    expect(d['2'].amount).toBe('200');
    expect(allocatedTotal(d)).toBe(500);
    expect(remainderOf(500, d)).toBe(0);
    d = toggleAllocation(d, inv('1', 300), false, 500);
    expect(allocatedTotal(d)).toBe(200);
  });
  it('shows the remainder as an advance, and over-allocation as negative', () => {
    expect(remainderOf(500, { a: { checked: true, amount: '200' } })).toBe(300);
    expect(remainderOf(100, { a: { checked: true, amount: '150' } })).toBe(-50);
  });
  it('Submit needs party, amount > 0, account and no over-allocation', () => {
    expect(canSubmitPayment(draft())).toBe(true);
    expect(canSubmitPayment(draft({ partyId: '' }))).toBe(false);
    expect(canSubmitPayment(draft({ amount: '0' }))).toBe(false);
    expect(canSubmitPayment(draft({ accountId: '' }))).toBe(false);
    expect(canSubmitPayment(draft({ amount: '100', allocations: { a: { checked: true, amount: '150' } } }))).toBe(false);
  });
  it('the request has no branchId, only ticked allocations above zero, and trims optional text', () => {
    const body = buildPaymentRequest(draft({ reference: ' CHQ ', notes: '', allocations: { '1': { checked: true, amount: '300' }, '2': { checked: false, amount: '50' }, '3': { checked: true, amount: '0' } } }), [inv('1', 300), inv('2', 100), inv('3', 100)]);
    expect(body).toEqual({ partyType: 'CUSTOMER', partyId: 'c1', amount: 500, method: 'CASH', accountId: 'a1', paymentDate: '2026-11-16', reference: 'CHQ', notes: undefined, allocations: [{ invoiceType: 'SALE', invoiceId: '1', amount: 300 }] });
    expect(body).not.toHaveProperty('branchId');
  });
  it('uses the web void wording', () => {
    expect(voidMessage('Rs 100', 'Ali')).toBe('Rs 100 from Ali will be reversed in the ledger and taken off the invoice(s) it paid. An invoice with no other payment becomes editable again.');
    expect(voidMessage('Rs 100')).toContain('from this party');
  });
});

const accountsList = [
  { id: 'a1', code: '1000', name: 'Cash', type: 'ASSET', systemKey: 'CASH', isSystemAccount: true, isActive: true },
  { id: 'a2', code: '1100', name: 'Accounts Receivable', type: 'ASSET', systemKey: 'ACCOUNTS_RECEIVABLE', isSystemAccount: true, isActive: true },
  { id: 'a3', code: '1010', name: 'Bank', type: 'ASSET', systemKey: 'BANK', isSystemAccount: true, isActive: true },
  { id: 'a4', code: '5300', name: 'Rent', type: 'EXPENSE', isSystemAccount: false, isActive: true },
];
const payment = { id: 'p1', branchId: 'b1', partyType: 'CUSTOMER', partyId: 'c1', amount: 500, method: 'CASH', accountId: 'a1', paymentDate: '2026-11-10T00:00:00.000Z', reference: 'R-1', allocations: [{ invoiceType: 'SALE', invoiceId: 's1', amount: 300 }], unallocatedAmount: 200 };
const ALL = ['acc_payments:read', 'acc_payments:create', 'acc_payments:void'];

beforeEach(() => {
  h.reset();
  confirmMock.mockReset();
  h.me = makeUser(ALL);
  h.routes['GET /accounting/payments'] = () => ({ body: [payment, { ...payment, id: 'p2', partyType: 'VENDOR', partyId: 'v1', amount: 90, unallocatedAmount: 0, reference: undefined }] });
  h.routes['GET /accounting/accounts'] = () => ({ body: accountsList });
  h.routes['GET /customers'] = () => ({ body: [{ id: 'c1', name: 'Ali Traders' }] });
  h.routes['GET /vendors'] = () => ({ body: [{ id: 'v1', company: 'Acme Pharma' }] });
  h.routes['GET /sales'] = (c) => ({ body: { items: new URLSearchParams(c.path.split('?')[1]).get('paymentStatus') === 'UNPAID' ? [{ id: 's9', invoiceNumber: '0009', grandTotal: 1000, amountPaid: 0 }] : [{ id: 's8', invoiceNumber: '0008', grandTotal: 500, amountPaid: 100 }, { id: 's7', invoiceNumber: '0007', grandTotal: 300, amountPaid: 300 }], total: 1, page: 1, limit: 200 } });
});
afterEach(() => h.settle());

describe('Payments screen', () => {
  it('is gated: Loading first, "No access" without acc_payments:read, menu entry present', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<PaymentsScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/payments')).toHaveLength(0);
    expect(navSections.find((s) => s.title === 'Accounting')!.items.find((i) => i.href === '/accounting/payments')!.anyOf).toEqual(['acc_payments:read']);
  });

  it('lists payments with party names, advance badge, method, account and reference', async () => {
    await h.wrap(<PaymentsScreen />);
    expect(await screen.findByText('Ali Traders')).toBeTruthy();
    expect(await screen.findByText('Acme Pharma')).toBeTruthy();
    expect(screen.getByText('Advance Rs 200')).toBeTruthy();
    expect(screen.getAllByText(/Cash · Cash/)).toHaveLength(2);
    expect(screen.getByText('Ref R-1')).toBeTruthy();
  });

  it('filters by party type on the server and searches locally', async () => {
    await h.wrap(<PaymentsScreen />);
    await screen.findByText('Ali Traders');
    await fireEvent.press(screen.getByLabelText('Party: Vendors'));
    await waitFor(() => expect(h.calls.some((c) => c.path.includes('partyType=VENDOR'))).toBe(true));
    await fireEvent.changeText(screen.getByLabelText('Search payments...'), 'acme');
    await waitFor(() => expect(screen.queryByText('Ali Traders')).toBeNull());
  });

  it('shows a server error with retry, not an empty list', async () => {
    h.routes['GET /accounting/payments'] = () => ({ status: 403, body: { message: 'Insufficient permissions' } });
    await h.wrap(<PaymentsScreen />);
    expect(await screen.findByText('Insufficient permissions')).toBeTruthy();
  });

  it('Record Payment needs acc_payments:create and Void needs acc_payments:void', async () => {
    h.me = makeUser(['acc_payments:read']);
    await h.wrap(<PaymentsScreen />);
    await screen.findByText('Ali Traders');
    expect(disabled(button('Record Payment'))).toBe(true);
    expect(screen.queryByRole('button', { name: /Void payment/ })).toBeNull();
  });

  it('voiding asks with the web text; confirming sends one DELETE scoped to the payment branch', async () => {
    confirmMock.mockResolvedValue(true);
    h.routes['DELETE /accounting/payments/p1'] = () => ({ status: 204, body: undefined });
    await h.wrap(<PaymentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Void payment p1' }));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Payment voided']));
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: 'Void this payment?', confirmLabel: 'Void payment', message: expect.stringContaining('Rs 500 from Ali Traders will be reversed in the ledger') });
    expect(h.callsTo('DELETE', '/accounting/payments/p1')).toHaveLength(1);
    expect(h.callsTo('DELETE', '/accounting/payments/p1')[0].path).toContain('branchId=b1');
  });

  it('declining the void sends nothing', async () => {
    confirmMock.mockResolvedValue(false);
    await h.wrap(<PaymentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Void payment p1' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(h.callsTo('DELETE', '/accounting/payments/p1')).toHaveLength(0);
  });

  it.each([
    ['advance already applied', 409, 'Cannot void: the advance from this payment has already been applied elsewhere'],
    ['invoice has returns', 409, 'Cannot void: an invoice paid by this payment has returns'],
    ['already voided', 404, 'Payment not found'],
  ])('a rejected void (%s) shows the server message and never claims success', async (_n, status, message) => {
    confirmMock.mockResolvedValue(true);
    h.routes['DELETE /accounting/payments/p1'] = () => ({ status, body: { message } });
    await h.wrap(<PaymentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Void payment p1' }));
    await waitFor(() => expect(h.toastTexts()).toEqual([message]));
    expect(h.callsTo('DELETE', '/accounting/payments/p1')).toHaveLength(1);
  });

  it('records a customer payment with allocation: no branchId in the body, one request, form closes', async () => {
    h.routes['POST /accounting/payments'] = () => ({ body: { id: 'p3' } });
    await h.wrap(<PaymentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Payment' }));
    await fireEvent.press(await screen.findByLabelText('Customer'));
    await fireEvent.press(await screen.findByRole('button', { name: /Ali Traders/ }));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '600');
    await fireEvent.press(screen.getByLabelText('Cash/Bank Account'));
    await fireEvent.press(await screen.findByRole('button', { name: /1000 · Cash/ }));
    expect(screen.queryByRole('button', { name: /Accounts Receivable/ })).toBeNull();
    await fireEvent(await screen.findByLabelText('Allocate 0009'), 'valueChange', true);
    expect((await screen.findByLabelText('Allocation 0009')).props.value).toBe('600');
    expect(screen.queryByLabelText('Allocate 0007')).toBeNull();
    expect(screen.getByText('Remainder → advance: Rs 0')).toBeTruthy();
    await fireEvent.press(button('Save payment'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Payment recorded']));
    const posts = h.callsTo('POST', '/accounting/payments');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ partyType: 'CUSTOMER', partyId: 'c1', amount: 600, method: 'CASH', accountId: 'a1', allocations: [{ invoiceType: 'SALE', invoiceId: 's9', amount: 600 }] });
    expect(posts[0].body).not.toHaveProperty('branchId');
  });

  it('only invoices with more than one cent outstanding are offered, and over-allocation blocks Save', async () => {
    await h.wrap(<PaymentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Payment' }));
    await fireEvent.press(await screen.findByLabelText('Customer'));
    await fireEvent.press(await screen.findByRole('button', { name: /Ali Traders/ }));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '100');
    expect(await screen.findByLabelText('Allocate 0008')).toBeTruthy();
    expect(screen.queryByLabelText('Allocate 0007')).toBeNull();
    await fireEvent(screen.getByLabelText('Allocate 0009'), 'valueChange', true);
    await fireEvent.changeText(await screen.findByLabelText('Allocation 0009'), '400');
    expect(await screen.findByText('Over-allocated by Rs 300')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cash/Bank Account'));
    await fireEvent.press(await screen.findByRole('button', { name: /1000 · Cash/ }));
    expect(disabled(button('Save payment'))).toBe(true);
  });

  it('with no open invoices the full amount is an advance', async () => {
    h.routes['GET /sales'] = () => ({ body: { items: [], total: 0, page: 1, limit: 200 } });
    await h.wrap(<PaymentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Payment' }));
    await fireEvent.press(await screen.findByLabelText('Customer'));
    await fireEvent.press(await screen.findByRole('button', { name: /Ali Traders/ }));
    expect(await screen.findByText('No open invoices for this party — the full amount will post as an advance.')).toBeTruthy();
  });

  it('a vendor payment loads purchases, and Save stays disabled until the form is complete', async () => {
    h.routes['GET /purchases'] = (c) => ({ body: { items: new URLSearchParams(c.path.split('?')[1]).get('paymentStatus') === 'UNPAID' ? [{ id: 'pu1', purchaseNumber: '0001', grandTotal: 800, amountPaid: 0 }] : [], total: 1, page: 1, limit: 200 } });
    await h.wrap(<PaymentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Payment' }));
    expect(disabled(await screen.findByRole('button', { name: 'Save payment' }))).toBe(true);
    await fireEvent.press(await screen.findByLabelText('Party type: Vendor'));
    await fireEvent.press(await screen.findByLabelText('Vendor'));
    await fireEvent.press(await screen.findByRole('button', { name: /Acme Pharma/ }));
    expect(await screen.findByLabelText('Allocate 0001')).toBeTruthy();
    expect(h.calls.some((c) => c.path.startsWith('/purchases?') && c.path.includes('vendorId=v1'))).toBe(true);
  });

  it('a failed save shows the server message, keeps the form and sends one request', async () => {
    h.routes['POST /accounting/payments'] = () => ({ status: 404, body: { message: 'Cash/bank account not found' } });
    await h.wrap(<PaymentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Payment' }));
    await fireEvent.press(await screen.findByLabelText('Customer'));
    await fireEvent.press(await screen.findByRole('button', { name: /Ali Traders/ }));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '50');
    await fireEvent.press(screen.getByLabelText('Cash/Bank Account'));
    await fireEvent.press(await screen.findByRole('button', { name: /1000 · Cash/ }));
    await fireEvent.press(button('Save payment'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Cash/bank account not found']));
    expect(h.callsTo('POST', '/accounting/payments')).toHaveLength(1);
    expect(screen.getByLabelText('Amount').props.value).toBe('50');
  });

  it('a double press sends one request', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.routes['POST /accounting/payments'] = () => ({ body: { id: 'p3' }, gate });
    await h.wrap(<PaymentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Payment' }));
    await fireEvent.press(await screen.findByLabelText('Customer'));
    await fireEvent.press(await screen.findByRole('button', { name: /Ali Traders/ }));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '50');
    await fireEvent.press(screen.getByLabelText('Cash/Bank Account'));
    await fireEvent.press(await screen.findByRole('button', { name: /1000 · Cash/ }));
    const save = button('Save payment');
    // The press resolves with the async handler, which waits on the gated POST: don't await it until released.
    const first = fireEvent.press(save);
    await waitFor(() => expect(h.callsTo('POST', '/accounting/payments')).toHaveLength(1));
    const second = fireEvent.press(save);
    release();
    await Promise.all([first, second]);
    await waitFor(() => expect(h.toastTexts()).toEqual(['Payment recorded']));
    expect(h.callsTo('POST', '/accounting/payments')).toHaveLength(1);
  });
});
