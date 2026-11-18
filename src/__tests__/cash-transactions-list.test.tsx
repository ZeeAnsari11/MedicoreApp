import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import CashTransactionsRoute from '@/app/(app)/sales/cash-receipt-transactions';
import { navSections } from '@/navigation/nav-config';
import { createHarness, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) } }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const t1 = { id: 'r2', transactionNumber: 'T-0002', voucherNumber: 'CR-000002', branchId: 'b1', date: '2026-11-18T00:00:00.000Z', count: 3, total: 220, customers: ['Ali Traders', 'Baig Store', 'Chaudhry Med'], version: 2, editedAt: '2026-11-19T00:00:00.000Z' };
const t2 = { id: 'r1', transactionNumber: 'T-0001', voucherNumber: 'CR-000001', branchId: 'b1', date: '2026-11-17T00:00:00.000Z', count: 1, total: 50, customers: ['Ali Traders'], version: 1, editedAt: null };

const h = createHarness();
beforeEach(() => {
  h.reset();
  mockPush.mockReset();
  h.routes['GET /sales/cash-receipts'] = (c) => {
    const q = new URLSearchParams(c.path.split('?')[1]).get('q');
    const items = [t1, t2].filter((t) => !q || t.transactionNumber.includes(q));
    return { body: { items, total: items.length, page: 1, limit: 20 } };
  };
});
afterEach(() => h.settle());

describe('Cash Receipt Transactions list', () => {
  it('lists transactions newest first with number, voucher, customers, entries, total and an edited badge', async () => {
    h.me = makeUser(['cash_receipt:read']);
    await h.wrap(<CashTransactionsRoute />);
    expect(await screen.findByText('T-0002')).toBeTruthy();
    expect(screen.getByText('T-0001')).toBeTruthy();
    expect(screen.getByText('Ali Traders, Baig Store +1')).toBeTruthy();
    expect(screen.getByText('3 entries')).toBeTruthy();
    expect(screen.getByText('Rs. 220.00')).toBeTruthy();
    expect(screen.getByText('Edited v2')).toBeTruthy();
    expect(screen.getAllByText(/^Edited/)).toHaveLength(1);
  });

  it('searches on the server and opens a transaction on the Cash Receipt screen', async () => {
    h.me = makeUser(['cash_receipt:read']);
    await h.wrap(<CashTransactionsRoute />);
    await fireEvent.changeText(await screen.findByPlaceholderText(/Search T-0001/), 'T-0001');
    await waitFor(() => expect(h.callsTo('GET', '/sales/cash-receipts').some((c) => c.path.includes('q=T-0001'))).toBe(true));
    await waitFor(() => expect(screen.queryByText('T-0002')).toBeNull());
    await fireEvent.press(screen.getByRole('button', { name: 'Open T-0001' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/sales/cash-receipt', params: { transaction: 'T-0001' } });
  });

  it('shows "No access" without cash_receipt:read and makes no request', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<CashTransactionsRoute />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/sales/cash-receipts')).toHaveLength(0);
  });

  it('has a menu entry under Operations that needs cash_receipt:read', () => {
    const item = navSections.flatMap((s) => s.items).find((i) => i.href === '/sales/cash-receipt-transactions')!;
    expect(item.label).toBe('Cash Receipt Transactions');
    expect(item.anyOf).toEqual(['cash_receipt:read']);
    expect(navSections.find((s) => s.title === 'Operations')!.items).toContain(item);
  });
});
