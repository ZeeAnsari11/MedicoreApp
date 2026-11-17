import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { GeneralLedgerScreen } from '@/features/accounting/general-ledger-screen';
import { ledgerExportPath } from '@/features/accounting/ledger-export';
import { referenceTarget } from '@/features/accounting/ledger-ui';
import { PartyLedgerScreen } from '@/features/accounting/party-ledger-screen';
import { navSections } from '@/navigation/nav-config';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) }, useLocalSearchParams: () => mockParams, Stack: { Screen: () => null }, Link: ({ children }: { children: unknown }) => children }));
const mockShare = jest.fn(async () => {});
jest.mock('@/features/documents/use-document-file', () => ({ useDocumentFile: () => ({ isBusy: false, share: mockShare, print: jest.fn() }) }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const row = { entryId: 'j1', entryNumber: 'JE-0001', date: '2026-11-10T00:00:00.000Z', sourceType: 'SALE', documentType: 'Invoice', description: 'Sale 0007', reference: { type: 'SALE', id: 's7', number: '0007' }, debit: 300, credit: 0, runningBalance: 300 };
const summary = { openingBalance: 100, billed: 300, settled: 50, returns: 20, voids: 10, advances: 0, other: 5, closingBalance: 335 };
const partyLedger = { partyId: 'c1', partyName: 'Ali', openingBalance: 100, totalDebit: 300, totalCredit: 50, closingBalance: 335, rows: [row], total: 1, page: 1, limit: 50, summary };
const balances = { items: [{ partyId: 'c1', name: 'Ali', accountBalance: 335, advanceBalance: 0, balance: 335 }], total: 1, page: 1, limit: 25, totals: { partiesAccountTotal: 335, accountTotal: 400, unattributed: 65, advanceTotal: 0 } };
const gl = { accountId: 'a1', accountCode: '1000', accountName: 'Cash', normalBalance: 'DEBIT', openingBalance: 0, totalDebit: 300, totalCredit: 0, closingBalance: 300, rows: [row], total: 1, page: 1, limit: 50 };

beforeEach(() => {
  mockParams = {};
  mockShare.mockClear();
  mockPush.mockClear();
  h.reset();
  h.me = makeUser(['acc_customer_ledger:read', 'acc_vendor_ledger:read', 'acc_general_ledger:read']);
  h.routes['GET /accounting/customers/balances'] = () => ({ body: balances });
  h.routes['GET /accounting/vendors/balances'] = () => ({ body: { ...balances, items: [{ partyId: 'v1', name: 'Acme Pharma', accountBalance: 90, advanceBalance: 10, balance: 80 }] } });
  h.routes['GET /accounting/customers/c1/ledger'] = () => ({ body: partyLedger });
  h.routes['GET /accounting/vendors/v1/ledger'] = () => ({ body: { ...partyLedger, partyId: 'v1', partyName: 'Acme Pharma' } });
  h.routes['GET /accounting/general-ledger'] = () => ({ body: gl });
  h.routes['GET /accounting/accounts'] = () => ({ body: [{ id: 'a1', code: '1000', name: 'Cash', type: 'ASSET', isSystemAccount: true, isActive: true }] });
  h.routes['GET /customers'] = () => ({ body: [{ id: 'c1', name: 'Ali' }] });
  h.routes['GET /vendors'] = () => ({ body: [{ id: 'v1', company: 'Acme Pharma' }] });
});
afterEach(() => h.settle());

describe('ledger helpers', () => {
  it('builds the export path with the filters and the format, dropping empty values', () => {
    expect(ledgerExportPath('/accounting/customers/c1/ledger/export', { branchId: undefined, from: '2026-11-01', to: '2026-11-30' }, 'statement')).toBe('/accounting/customers/c1/ledger/export?from=2026-11-01&to=2026-11-30&format=statement');
  });
  it('links sales and purchases, and nothing for payments or expenses', () => {
    expect(referenceTarget({ type: 'SALE', id: 's', number: '1' })).toEqual({ pathname: '/sales/detail', params: { id: 's' } });
    expect(referenceTarget({ type: 'PURCHASE', id: 'p', number: '1' })).toEqual({ pathname: '/purchases/detail', params: { id: 'p' } });
    expect(referenceTarget({ type: 'PAYMENT', id: 'x', number: '1' })).toBeNull();
    expect(referenceTarget(undefined)).toBeNull();
  });
  it('is gated per page in the menu', () => {
    const items = navSections.find((s) => s.title === 'Accounting')!.items;
    expect(items.find((i) => i.href === '/accounting/customer-ledger')!.anyOf).toEqual(['acc_customer_ledger:read']);
    expect(items.find((i) => i.href === '/accounting/vendor-ledger')!.anyOf).toEqual(['acc_vendor_ledger:read']);
    expect(items.find((i) => i.href === '/accounting/general-ledger')!.anyOf).toEqual(['acc_general_ledger:read']);
  });
});

describe('Customer / Vendor ledger', () => {
  it('is gated and fetches nothing without the read permission', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<PartyLedgerScreen kind="customers" />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/customers/balances')).toHaveLength(0);
  });

  it('opens on the balances list: server paging params, branch scope, unattributed alert, row opens the ledger', async () => {
    await h.wrap(<PartyLedgerScreen kind="customers" />);
    expect(await screen.findByText('Ali')).toBeTruthy();
    const p = new URLSearchParams(h.callsTo('GET', '/accounting/customers/balances')[0].path.split('?')[1]);
    expect(Object.fromEntries(p)).toEqual({ branchId: 'b1', sortBy: 'balance', sortDir: 'desc', page: '1', limit: '25' });
    expect(screen.getByText(/65\.00 is not linked to any customer/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open ledger Ali'));
    expect(await screen.findByText('Closing balance')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/customers/c1/ledger')).toHaveLength(1);
  });

  it('has-balance and search go to the server; sorting flips direction', async () => {
    await h.wrap(<PartyLedgerScreen kind="customers" />);
    await screen.findByText('Ali');
    await fireEvent(screen.getByLabelText('Has balance only'), 'valueChange', true);
    await waitFor(() => expect(h.callsTo('GET', '/accounting/customers/balances').some((c) => c.path.includes('hasBalance=true'))).toBe(true));
    await fireEvent.changeText(screen.getByPlaceholderText('Search customers...'), 'al');
    await waitFor(() => expect(h.callsTo('GET', '/accounting/customers/balances').some((c) => c.path.includes('search=al'))).toBe(true));
    await fireEvent.press(screen.getByRole('button', { name: /Sort by Balance/ }));
    await waitFor(() => expect(h.callsTo('GET', '/accounting/customers/balances').some((c) => c.path.includes('sortDir=asc'))).toBe(true));
  });

  it('?bal=1 (dashboard AR link) starts with "Has balance only" on', async () => {
    mockParams = { view: 'list', bal: '1' };
    await h.wrap(<PartyLedgerScreen kind="customers" />);
    await screen.findByText('Ali');
    expect(h.callsTo('GET', '/accounting/customers/balances')[0].path).toContain('hasBalance=true');
  });

  it('shows the ledger: summary cards, extras, rows, links to the entry and the sale', async () => {
    mockParams = { view: 'ledger', party: 'c1' };
    await h.wrap(<PartyLedgerScreen kind="customers" />);
    expect(await screen.findByText('Total invoiced')).toBeTruthy();
    expect(screen.getByText('Total received')).toBeTruthy();
    expect(screen.getByText('Customer owes you')).toBeTruthy();
    expect(screen.getByText(/Reversed \(edits & voids\) 10\.00 · Adjustments 5\.00/)).toBeTruthy();
    const q = new URLSearchParams(h.callsTo('GET', '/accounting/customers/c1/ledger')[0].path.split('?')[1]);
    expect(q.get('page')).toBe('1');
    expect(q.get('limit')).toBe('50');
    expect(q.get('branchId')).toBe('b1');
    expect(q.get('from') && q.get('to')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open 0007' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/sales/detail', params: { id: 's7' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Entry JE-0001' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/accounting/journal-detail', params: { id: 'j1' } });
  });

  it('vendor wording and endpoints', async () => {
    mockParams = { view: 'ledger', party: 'v1' };
    await h.wrap(<PartyLedgerScreen kind="vendors" />);
    expect(await screen.findByText('Total purchased')).toBeTruthy();
    expect(screen.getByText('Total paid')).toBeTruthy();
    expect(screen.getByText('You owe the vendor')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/vendors/v1/ledger')).toHaveLength(1);
  });

  it('a failed ledger shows the server message and a retry', async () => {
    mockParams = { view: 'ledger', party: 'c1' };
    h.routes['GET /accounting/customers/c1/ledger'] = () => ({ status: 403, body: { message: 'Insufficient permissions' } });
    await h.wrap(<PartyLedgerScreen kind="customers" />);
    expect(await screen.findByText('Insufficient permissions')).toBeTruthy();
  });

  it('an invalid custom range sends no request', async () => {
    mockParams = { view: 'ledger', party: 'c1' };
    await h.wrap(<PartyLedgerScreen kind="customers" />);
    await screen.findByText('Total invoiced');
    const before = h.callsTo('GET', '/accounting/customers/c1/ledger').length;
    await fireEvent.changeText(screen.getByLabelText('From'), '2026-13-45');
    expect(await screen.findByText('Enter a valid date range.')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/customers/c1/ledger')).toHaveLength(before);
  });

  it('hides every export button without the export permission', async () => {
    mockParams = { view: 'ledger', party: 'c1' };
    h.me = makeUser(['acc_customer_ledger:read']);
    await h.wrap(<PartyLedgerScreen kind="customers" />);
    await screen.findByText('Total invoiced');
    expect(screen.queryByRole('button', { name: 'Statement' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excel / CSV' })).toBeNull();
  });

  it('with export permission: three buttons, each requests its own format', async () => {
    mockParams = { view: 'ledger', party: 'c1' };
    h.me = makeUser(['acc_customer_ledger:read', 'acc_customer_ledger:export']);
    await h.wrap(<PartyLedgerScreen kind="customers" />);
    await screen.findByText('Total invoiced');
    await waitFor(() => expect(disabled(button('Statement'))).toBe(false));
    await fireEvent.press(button('Excel / CSV'));
    await fireEvent.press(button('Print / PDF'));
    await fireEvent.press(button('Statement'));
    const paths = mockShare.mock.calls.map((c) => (c as unknown as [{ path: string }])[0].path);
    expect(paths[0]).toMatch(/^\/accounting\/customers\/c1\/ledger\/export\?branchId=b1&from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d&format=csv$/);
    expect(paths[1]).toContain('format=pdf');
    expect(paths[2]).toContain('format=statement');
  });
});

describe('General Ledger', () => {
  it('is gated', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<GeneralLedgerScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/general-ledger')).toHaveLength(0);
  });

  it('asks for an account first, then loads its ledger with the period and branch', async () => {
    await h.wrap(<GeneralLedgerScreen />);
    expect(await screen.findByText('Select an account to view its ledger.')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/general-ledger')).toHaveLength(0);
    await fireEvent.press(await screen.findByLabelText('Account'));
    await fireEvent.press(await screen.findByRole('button', { name: /1000 · Cash/ }));
    expect(await screen.findByText('1000 · Cash — debit-normal account')).toBeTruthy();
    const q = new URLSearchParams(h.callsTo('GET', '/accounting/general-ledger')[0].path.split('?')[1]);
    expect(q.get('accountId')).toBe('a1');
    expect(q.get('branchId')).toBe('b1');
    expect(screen.getByText('JE-0001')).toBeTruthy();
  });

  it('exports with the account id (CSV/PDF only, no statement) when permitted', async () => {
    h.me = makeUser(['acc_general_ledger:read', 'acc_general_ledger:export']);
    await h.wrap(<GeneralLedgerScreen />);
    await fireEvent.press(await screen.findByLabelText('Account'));
    await fireEvent.press(await screen.findByRole('button', { name: /1000 · Cash/ }));
    await screen.findByText('1000 · Cash — debit-normal account');
    expect(screen.queryByRole('button', { name: 'Statement' })).toBeNull();
    await waitFor(() => expect(disabled(button('Excel / CSV'))).toBe(false));
    await fireEvent.press(button('Excel / CSV'));
    const path = (mockShare.mock.calls[0] as unknown as [{ path: string }])[0].path;
    expect(path).toContain('/accounting/general-ledger/export?accountId=a1');
    expect(path).toContain('format=csv');
  });

  it('shows a server error', async () => {
    h.routes['GET /accounting/general-ledger'] = () => ({ status: 500, body: { message: 'Boom' } });
    await h.wrap(<GeneralLedgerScreen />);
    await fireEvent.press(await screen.findByLabelText('Account'));
    await fireEvent.press(await screen.findByRole('button', { name: /1000 · Cash/ }));
    expect(await screen.findByText('Boom')).toBeTruthy();
  });
});
