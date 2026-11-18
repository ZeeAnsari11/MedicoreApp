import { configure, fireEvent, screen } from '@testing-library/react-native';

import CustomersScreen from '@/app/(app)/customers/index';
import VendorsScreen from '@/app/(app)/vendors/index';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
const mockPush = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) }, useLocalSearchParams: () => ({}), Stack: { Screen: () => null }, Link: (props: object) => require('@/test-support/link-mock').MockLink(props) }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();

beforeEach(() => {
  mockPush.mockClear();
  h.reset();
  h.routes['GET /customers'] = () => ({ body: [{ id: 'c1', branchId: 'b1', name: 'Ali Store', phone: '0300', isDealer: false, outstandingBalance: 0 }] });
  h.routes['GET /vendors'] = () => ({ body: [{ id: 'v1', branchId: 'b1', company: 'Acme Pharma', isActive: true }] });
});
afterEach(() => h.settle());

describe('"View ledger" entry points (web customers / vendors row action)', () => {
  it('customers: opens the customer ledger for that customer', async () => {
    h.me = makeUser(['customers:read', 'acc_customer_ledger:read']);
    await h.wrap(<CustomersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'View ledger' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/accounting/customer-ledger', params: { view: 'ledger', party: 'c1' } });
  });

  it('customers: disabled without acc_customer_ledger:read', async () => {
    h.me = makeUser(['customers:read']);
    await h.wrap(<CustomersScreen />);
    expect(disabled(await screen.findByRole('button', { name: 'View ledger' }))).toBe(true);
  });

  it('vendors: opens the vendor ledger for that vendor', async () => {
    h.me = makeUser(['vendors:read', 'acc_vendor_ledger:read']);
    await h.wrap(<VendorsScreen />);
    // Row actions live in the sheet that opens when the vendor row is tapped.
    await fireEvent.press(await screen.findByRole('button', { name: 'Acme Pharma' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'View ledger' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/accounting/vendor-ledger', params: { view: 'ledger', party: 'v1' } });
  });

  it('vendors: disabled without acc_vendor_ledger:read', async () => {
    h.me = makeUser(['vendors:read']);
    await h.wrap(<VendorsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Acme Pharma' }));
    expect(disabled(await screen.findByRole('button', { name: 'View ledger' }))).toBe(true);
  });
});
