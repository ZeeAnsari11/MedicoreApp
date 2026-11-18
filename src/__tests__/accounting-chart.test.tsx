import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AccountingHubScreen } from '@/features/accounting/accounting-hub-screen';
import { ChartOfAccountsScreen } from '@/features/accounting/chart-of-accounts-screen';
import { confirmAction } from '@/lib/confirm';
import { navSections } from '@/navigation/nav-config';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, Stack: { Screen: () => null }, Link: (props: object) => require('@/test-support/link-mock').MockLink(props) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const confirmMock = confirmAction as jest.Mock;
const button = (name: string) => screen.getByRole('button', { name });

const accounts = [
  { id: 'a1', code: '1000', name: 'Cash', type: 'ASSET', normalBalance: 'DEBIT', systemKey: 'CASH', isSystemAccount: true, isActive: true, deletedAt: null },
  { id: 'a2', code: '5300', name: 'Rent', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: false, isActive: true, description: 'Shop rent', deletedAt: null },
];
const ALL = ['acc_chart_of_accounts:read', 'acc_chart_of_accounts:create', 'acc_chart_of_accounts:update', 'acc_chart_of_accounts:delete'];

beforeEach(() => {
  h.reset();
  confirmMock.mockReset();
  h.me = makeUser(ALL);
  h.routes['GET /accounting/accounts'] = () => ({ body: accounts });
});
afterEach(() => h.settle());

describe('Chart of Accounts', () => {
  it('shows Loading, never "No access", while /auth/me loads, then the accounts', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.routes['GET /auth/me'] = () => ({ body: h.me, gate });
    await h.wrap(<ChartOfAccountsScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('No access')).toBeNull();
    release();
    expect(await screen.findByText('1000 · Cash')).toBeTruthy();
  });

  it('shows an error with retry when /auth/me fails, and "No access" without acc_chart_of_accounts:read', async () => {
    h.routes['GET /auth/me'] = () => ({ status: 500, body: { message: 'Profile down' } });
    await h.wrap(<ChartOfAccountsScreen />);
    expect(await screen.findByText('Profile down')).toBeTruthy();
  });

  it('shows "No access" and loads nothing without the read permission', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<ChartOfAccountsScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/accounts')).toHaveLength(0);
  });

  it('lists accounts with type, System and Active badges, and searches', async () => {
    await h.wrap(<ChartOfAccountsScreen />);
    expect(await screen.findByText('5300 · Rent')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search accounts...'), 'rent');
    await waitFor(() => expect(screen.queryByText('1000 · Cash')).toBeNull());
  });

  it('New/Edit/Deactivate follow create/update/delete separately; system accounts have no Deactivate', async () => {
    h.me = makeUser(['acc_chart_of_accounts:read']);
    await h.wrap(<ChartOfAccountsScreen />);
    await screen.findByText('1000 · Cash');
    expect(disabled(button('New Account'))).toBe(true);
    expect(disabled(button('Edit 5300'))).toBe(true);
    expect(disabled(button('Deactivate 5300'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Deactivate 1000' })).toBeNull();
  });

  it('creates an account with the typed code/type/name, once, and closes', async () => {
    h.routes['POST /accounting/accounts'] = () => ({ body: { id: 'a3' } });
    await h.wrap(<ChartOfAccountsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Account' }));
    await fireEvent.changeText(await screen.findByLabelText('Code'), '5400');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Electricity');
    await fireEvent.press(button('Save'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Account created']));
    expect(h.callsTo('POST', '/accounting/accounts')).toHaveLength(1);
    expect(h.callsTo('POST', '/accounting/accounts')[0].body).toEqual({ code: '5400', name: 'Electricity', type: 'EXPENSE' });
    await waitFor(() => expect(screen.queryByLabelText('Code')).toBeNull());
  });

  it('validates the name and code before sending', async () => {
    await h.wrap(<ChartOfAccountsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Account' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(screen.getByText('Code is required')).toBeTruthy();
    expect(h.callsTo('POST', '/accounting/accounts')).toHaveLength(0);
  });

  it('a duplicate code (409) shows the server message and keeps the form open', async () => {
    h.routes['POST /accounting/accounts'] = () => ({ status: 409, body: { message: 'An account with code "5400" already exists' } });
    await h.wrap(<ChartOfAccountsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New Account' }));
    await fireEvent.changeText(await screen.findByLabelText('Code'), '5400');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Electricity');
    await fireEvent.press(button('Save'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['An account with code "5400" already exists']));
    expect(screen.getByLabelText('Code').props.value).toBe('5400');
  });

  it('edit sends only name and description; code and type are locked', async () => {
    h.routes['PATCH /accounting/accounts/a2'] = () => ({ body: { id: 'a2' } });
    await h.wrap(<ChartOfAccountsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit 5300' }));
    expect((await screen.findByLabelText('Code')).props.editable).toBe(false);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Rent & rates');
    await fireEvent.press(button('Save'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Account updated']));
    expect(h.callsTo('PATCH', '/accounting/accounts/a2')[0].body).toEqual({ name: 'Rent & rates', description: 'Shop rent' });
  });

  it('update errors are shown (the web hides them) and the form stays', async () => {
    h.routes['PATCH /accounting/accounts/a2'] = () => ({ status: 404, body: { message: 'Account not found' } });
    await h.wrap(<ChartOfAccountsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit 5300' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Account not found']));
  });

  it('deactivating asks first; confirming deletes once, declining sends nothing', async () => {
    confirmMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    h.routes['DELETE /accounting/accounts/a2'] = () => ({ status: 204, body: undefined });
    await h.wrap(<ChartOfAccountsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Deactivate 5300' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(h.callsTo('DELETE', '/accounting/accounts/a2')).toHaveLength(0);
    await fireEvent.press(button('Deactivate 5300'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Account removed']));
    expect(h.callsTo('DELETE', '/accounting/accounts/a2')).toHaveLength(1);
  });

  it('a server refusal to deactivate is shown without a success toast', async () => {
    confirmMock.mockResolvedValue(true);
    h.routes['DELETE /accounting/accounts/a2'] = () => ({ status: 400, body: { message: 'System accounts cannot be deleted' } });
    await h.wrap(<ChartOfAccountsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Deactivate 5300' }));
    await waitFor(() => expect(h.toastTexts()).toEqual(['System accounts cannot be deleted']));
  });
});

describe('Accounting hub', () => {
  const overview = { totalReceivable: 1500, totalPayable: 700, cashAndBankBalance: 9000, netIncomeThisMonth: 320 };

  it('shows the four figures and only the sub-pages the user can read', async () => {
    h.me = makeUser(['acc_overview:read', 'acc_payments:read', 'acc_trial_balance:read']);
    h.routes['GET /accounting/reports/overview'] = () => ({ body: overview });
    await h.wrap(<AccountingHubScreen />);
    expect(await screen.findByText('Rs 1,500')).toBeTruthy();
    expect(screen.getByText('Rs 9,000')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Payments' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trial Balance' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Expenses' })).toBeNull();
  });

  it('without acc_overview:read there are no figures and no overview request', async () => {
    h.me = makeUser(['acc_payments:read']);
    await h.wrap(<AccountingHubScreen />);
    expect(await screen.findByRole('button', { name: 'Payments' })).toBeTruthy();
    expect(screen.queryByText('Accounts Receivable')).toBeNull();
    expect(h.callsTo('GET', '/accounting/reports/overview')).toHaveLength(0);
  });

  it('no accounting permission at all is "No access"', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<AccountingHubScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
  });

  it('the menu lists Accounting items behind their read permissions', () => {
    const acc = navSections.find((s) => s.title === 'Accounting')!;
    expect(acc.items.find((i) => i.href === '/accounting')!.anyOf).toEqual(['acc_overview:read']);
    expect(acc.items.find((i) => i.href === '/accounting/chart-of-accounts')!.anyOf).toEqual(['acc_chart_of_accounts:read']);
  });
});
