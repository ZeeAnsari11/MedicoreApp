import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import SalesScreen from '@/app/(app)/sales/index';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) },
  // Renders the header's right-side buttons (the list's + and Filters live there).
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null },
}));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const sale = {
  id: 's1', tenantId: 't1', branchId: 'b1', invoiceNumber: 'INV-0007', saleDate: '2026-11-10T00:00:00.000Z', customerId: 'c1', customerName: 'Demo Customer One',
  items: [{ productId: 'p1' }, { productId: 'p2' }], grandTotal: 2360, returnedTotal: 360, refundedTotal: 0, amountPaid: 500, paymentStatus: 'UNPAID', returnStatus: 'PARTIAL', orderBookerId: 'u9', orderBookerName: 'Ali Booker',
};

const h = createHarness();
beforeEach(() => {
  h.reset();
  mockPush.mockReset();
  h.routes['GET /sales'] = (c) => ({ body: c.path.includes('paymentStatus=PAID') ? { items: [], total: 0, page: 1, limit: 10 } : { items: [sale], total: 1, page: 1, limit: 10 } });
  h.routes['GET /customers'] = () => ({ body: [{ id: 'c1', name: 'Demo Customer One' }] });
  h.routes['GET /sales/order-bookers'] = () => ({ body: [{ id: 'u9', name: 'Ali Booker' }] });
});
afterEach(() => h.settle());

const button = (name: string) => screen.getByRole('button', { name });
const pick = async (label: string, option: string) => {
  await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${label}: `) }));
  await fireEvent.press(await screen.findByRole('button', { name: option }));
};
const lastQuery = () => new URLSearchParams(h.callsTo('GET', '/sales').at(-1)!.path.split('?')[1]);

describe('Sales list', () => {
  it('shows the accumulated totals block only when the API returns a summary', async () => {
    h.me = makeUser(['sales:read', 'branches:read']);
    h.routes['GET /sales'] = () => ({ body: { items: [sale], total: 1, page: 1, limit: 10, summary: { orders: 40, gross: 9000, returned: 1000, net: 8000, paid: 5000, remaining: 3000 } } });
    await h.wrap(<SalesScreen />);
    expect(await screen.findByText('Orders')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('Rs 9,000')).toBeTruthy();
    expect(screen.getByText('Rs 3,000')).toBeTruthy();
  });

  it('cards show invoice, return pill, customer · branch, date and items, booker, total and payment', async () => {
    h.me = makeUser(['sales:read', 'branches:read']);
    await h.wrap(<SalesScreen />);
    expect(await screen.findByText('INV-0007')).toBeTruthy();
    expect(screen.getByText('PARTIALLY RETURNED')).toBeTruthy();
    expect(await screen.findByText('Demo Customer One · Main')).toBeTruthy();
    expect(screen.getByText(/ • 2 items$/)).toBeTruthy();
    expect(screen.getByText('Order Booker: Ali Booker')).toBeTruthy();
    expect(screen.getByText('UNPAID')).toBeTruthy();
    expect(screen.getByText('Sale Return')).toBeTruthy();
    expect(screen.getByText('Rs 360')).toBeTruthy();
    expect(screen.getByText('Rs 2,000')).toBeTruthy(); // net payable
    expect(screen.getByText('Rs 500')).toBeTruthy(); // paid
    expect(screen.getByText('Rs 1,500')).toBeTruthy(); // remaining
    expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  });

  it('filters (web return choices) are sent together on Apply, from page 1', async () => {
    h.me = makeUser(['sales:read', 'sales:view_all']);
    await h.wrap(<SalesScreen />);
    await screen.findByText('INV-0007');
    await fireEvent.press(button('Filters'));
    await pick('Payment', 'Unpaid');
    await pick('Returns', 'Any return');
    await pick('Order Booker', 'Ali Booker');
    await pick('Rows', '25');
    expect(h.callsTo('GET', '/sales').some((c) => c.path.includes('paymentStatus'))).toBe(false);
    await fireEvent.press(button('Apply Filters'));
    await waitFor(() => expect(lastQuery().get('paymentStatus')).toBe('UNPAID'));
    const q = lastQuery();
    expect([q.get('returnStatus'), q.get('orderBookerId'), q.get('limit'), q.get('page')]).toEqual(['ANY', 'u9', '25', '1']);
  });

  it('Reset brings back the unfiltered list', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<SalesScreen />);
    await screen.findByText('INV-0007');
    await fireEvent.press(button('Filters'));
    await pick('Payment', 'Paid');
    await fireEvent.press(button('Apply Filters'));
    expect(await screen.findByText('No sales found')).toBeTruthy();
    await fireEvent.press(button('Filters'));
    await fireEvent.press(button('Reset'));
    expect(await screen.findByText('INV-0007')).toBeTruthy();
  });

  it('the Order Booker filter needs sales:view_all', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<SalesScreen />);
    await screen.findByText('INV-0007');
    await fireEvent.press(button('Filters'));
    expect(screen.queryByRole('button', { name: /^Order Booker: / })).toBeNull();
  });

  it('+ (New Sale) needs sales:create; View Details opens the sale with its branch', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<SalesScreen />);
    await screen.findByText('INV-0007');
    expect(disabled(button('New Sale'))).toBe(true);
    await fireEvent.press(button('View details'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/sales/detail', params: { id: 's1', branchId: 'b1' } });
  });
});
