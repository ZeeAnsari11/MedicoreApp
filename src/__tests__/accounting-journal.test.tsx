import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { JournalScreen } from '@/features/accounting/journal-screen';
import { canPostEntry, EMPTY_LINE, toRequestLines } from '@/features/accounting/use-journal';
import { navSections } from '@/navigation/nav-config';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => mockParams, Stack: { Screen: () => null }, Link: ({ children }: { children: unknown }) => children }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const accountsList = [
  { id: 'a1', code: '1000', name: 'Cash', type: 'ASSET', isSystemAccount: true, isActive: true },
  { id: 'a2', code: '3000', name: 'Capital', type: 'EQUITY', isSystemAccount: false, isActive: true },
];
const entry = { id: 'j1', branchId: 'b1', entryNumber: 'JE-0001', entryDate: '2026-11-10T00:00:00.000Z', sourceType: 'MANUAL', description: 'Owner capital', status: 'POSTED', totalDebit: 500, totalCredit: 500, lines: [{ accountId: 'a1', accountName: 'Cash', debit: 500, credit: 0 }, { accountId: 'a2', accountName: 'Capital', debit: 0, credit: 500 }] };

beforeEach(() => {
  mockParams = {};
  h.reset();
  h.me = makeUser(['acc_journal_entries:read', 'acc_journal_entries:create']);
  h.routes['GET /accounting/journal-entries'] = () => ({ body: [entry] });
  h.routes['GET /accounting/accounts'] = () => ({ body: accountsList });
  h.routes['GET /customers'] = () => ({ body: [{ id: 'c1', name: 'Ali' }] });
  h.routes['GET /vendors'] = () => ({ body: [{ id: 'v1', company: 'Acme Pharma' }] });
});
afterEach(() => h.settle());

async function fillBalanced(descriptionLabel = 'Description') {
  await fireEvent.press(await screen.findByLabelText('Account 1'));
  await fireEvent.press(await screen.findByRole('button', { name: /1000 · Cash/ }));
  await fireEvent.changeText(screen.getByLabelText('Debit 1'), '100');
  await fireEvent.press(screen.getByLabelText('Account 2'));
  await fireEvent.press(await screen.findByRole('button', { name: /3000 · Capital/ }));
  await fireEvent.changeText(screen.getByLabelText('Credit 2'), '100');
  await fireEvent.changeText(screen.getByLabelText(descriptionLabel), ' Seed ');
}

describe('journal rules', () => {
  const l = (accountId: string, debit: string, credit: string) => ({ ...EMPTY_LINE, accountId, debit, credit });
  it('needs a balanced, non-zero entry with an account on every line, and a description only for manual', () => {
    const ok = [l('a', '10', ''), l('b', '', '10')];
    expect(canPostEntry('manual', 'x', ok)).toBe(true);
    expect(canPostEntry('manual', ' ', ok)).toBe(false);
    expect(canPostEntry('opening', '', ok)).toBe(true);
    expect(canPostEntry('manual', 'x', [l('a', '10', ''), l('b', '', '9')])).toBe(false);
    expect(canPostEntry('manual', 'x', [l('a', '10', ''), l('b', '', '9.995')])).toBe(true);
    expect(canPostEntry('manual', 'x', [l('a', '10', ''), l('', '', '10')])).toBe(false);
    expect(canPostEntry('manual', 'x', [l('a', '0', ''), l('b', '', '0')])).toBe(false);
  });
  it('maps lines to the request and drops the party id when no party type is set', () => {
    expect(toRequestLines([{ ...l('a', '10', ''), partyId: 'stale' }, { ...l('b', '', '10'), partyType: 'CUSTOMER' as never, partyId: 'c1' }])).toEqual([
      { accountId: 'a', debit: 10, credit: 0, partyType: undefined, partyId: undefined, description: undefined },
      { accountId: 'b', debit: 0, credit: 10, partyType: 'CUSTOMER', partyId: 'c1', description: undefined },
    ]);
  });
});

describe('Journal Entries screen', () => {
  it('is gated, in the menu, and fetches nothing without acc_journal_entries:read', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<JournalScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/journal-entries')).toHaveLength(0);
    expect(navSections.find((s) => s.title === 'Accounting')!.items.find((i) => i.href === '/accounting/journal-entries')!.anyOf).toEqual(['acc_journal_entries:read']);
  });

  it('lists entries branch-scoped, searches, and opens the detail with lines and totals', async () => {
    await h.wrap(<JournalScreen />);
    expect(await screen.findByText('JE-0001')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/journal-entries')[0].path).toContain('branchId=b1');
    await fireEvent.changeText(screen.getByPlaceholderText('Search entries...'), 'nomatch');
    expect(await screen.findByText('No journal entries found')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Search entries...'), 'capital');
    await fireEvent.press(await screen.findByRole('button', { name: 'Entry JE-0001' }));
    expect(await screen.findByText('Description: Owner capital')).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getAllByText('Debit Rs 500 · Credit Rs 500').length).toBeGreaterThan(1);
  });

  it('?open=<id> opens that entry once the list has loaded', async () => {
    mockParams = { open: 'j1' };
    await h.wrap(<JournalScreen />);
    expect(await screen.findByText('Description: Owner capital')).toBeTruthy();
  });

  it('shows a server error', async () => {
    h.routes['GET /accounting/journal-entries'] = () => ({ status: 500, body: { message: 'Boom' } });
    await h.wrap(<JournalScreen />);
    expect(await screen.findByText('Boom')).toBeTruthy();
  });

  it('New Entry needs acc_journal_entries:create', async () => {
    h.me = makeUser(['acc_journal_entries:read']);
    await h.wrap(<JournalScreen />);
    await screen.findByText('JE-0001');
    expect(disabled(button('New Entry'))).toBe(true);
  });

  it('Post Entry stays disabled until balanced, then posts once with the branch in the body', async () => {
    h.routes['POST /accounting/journal-entries'] = () => ({ body: { ...entry, id: 'j2' } });
    await h.wrap(<JournalScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Entry' }));
    expect(disabled(await screen.findByRole('button', { name: 'Post Entry' }))).toBe(true);
    await fillBalanced();
    await fireEvent.press(button('Post Entry'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Journal entry posted']));
    const posts = h.callsTo('POST', '/accounting/journal-entries');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ branchId: 'b1', description: 'Seed', lines: [{ accountId: 'a1', debit: 100, credit: 0 }, { accountId: 'a2', debit: 0, credit: 100 }] });
    expect(posts[0].headers['X-Branch-Id']).toBeUndefined();
  });

  it('an opening balance goes to /accounting/opening-balances without a required description', async () => {
    h.routes['POST /accounting/opening-balances'] = () => ({ body: { ...entry, id: 'j3' } });
    await h.wrap(<JournalScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Entry' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Entry Type: Opening Balance' }));
    await fillBalanced('Description (optional)');
    await fireEvent.changeText(screen.getByLabelText('Description (optional)'), '');
    await fireEvent.press(button('Post Entry'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Opening balance posted']));
    const body = h.callsTo('POST', '/accounting/opening-balances')[0].body as Record<string, unknown>;
    expect(body.branchId).toBe('b1');
    expect(body).not.toHaveProperty('description');
    expect(h.callsTo('POST', '/accounting/journal-entries')).toHaveLength(0);
  });

  it('a party line sends partyType and partyId', async () => {
    h.routes['POST /accounting/journal-entries'] = () => ({ body: entry });
    await h.wrap(<JournalScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Entry' }));
    await fillBalanced();
    await fireEvent.press(screen.getByRole('button', { name: 'Party 1: Customer' }));
    await fireEvent.press(await screen.findByLabelText('Party name 1'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Ali' }));
    await fireEvent.press(button('Post Entry'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Journal entry posted']));
    expect(h.callsTo('POST', '/accounting/journal-entries')[0].body).toMatchObject({ lines: [{ partyType: 'CUSTOMER', partyId: 'c1' }, {}] });
  });

  it('lines can be added and removed down to two', async () => {
    await h.wrap(<JournalScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Entry' }));
    expect(disabled(await screen.findByRole('button', { name: 'Remove line 1' }))).toBe(true);
    await fireEvent.press(button('Add Line'));
    expect(await screen.findByLabelText('Account 3')).toBeTruthy();
    await fireEvent.press(button('Remove line 3'));
    expect(screen.queryByLabelText('Account 3')).toBeNull();
  });

  it('an admin must choose the branch before posting', async () => {
    h.me = makeUser([], { tenantRole: 'TENANT_SUPER_ADMIN', branchId: undefined });
    h.routes['POST /accounting/journal-entries'] = () => ({ body: entry });
    await h.wrap(<JournalScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Entry' }));
    await fillBalanced();
    await fireEvent.press(button('Post Entry'));
    expect(await screen.findByText('Branch is required')).toBeTruthy();
    expect(h.callsTo('POST', '/accounting/journal-entries')).toHaveLength(0);
  });

  it('a rejected entry shows the server message and keeps the form', async () => {
    h.routes['POST /accounting/journal-entries'] = () => ({ status: 400, body: { message: 'Entry is not balanced' } });
    await h.wrap(<JournalScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Entry' }));
    await fillBalanced();
    await fireEvent.press(button('Post Entry'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Entry is not balanced']));
    expect(screen.getByLabelText('Debit 1').props.value).toBe('100');
  });

  it('a double press sends one request', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.routes['POST /accounting/journal-entries'] = () => ({ body: entry, gate });
    await h.wrap(<JournalScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Entry' }));
    await fillBalanced();
    const post = button('Post Entry');
    const first = fireEvent.press(post);
    await waitFor(() => expect(h.callsTo('POST', '/accounting/journal-entries')).toHaveLength(1));
    const second = fireEvent.press(post);
    release();
    await Promise.all([first, second]);
    await waitFor(() => expect(h.toastTexts()).toEqual(['Journal entry posted']));
    expect(h.callsTo('POST', '/accounting/journal-entries')).toHaveLength(1);
  });
});
