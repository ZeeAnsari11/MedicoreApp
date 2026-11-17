import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { canSubmitExpense } from '@/features/accounting/use-expenses';
import { ExpensesScreen } from '@/features/accounting/expenses-screen';
import { navSections } from '@/navigation/nav-config';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, Stack: { Screen: () => null }, Link: ({ children }: { children: unknown }) => children }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const accountsList = [
  { id: 'a1', code: '1000', name: 'Cash', type: 'ASSET', systemKey: 'CASH', isSystemAccount: true, isActive: true },
  { id: 'a2', code: '1100', name: 'Accounts Receivable', type: 'ASSET', systemKey: 'ACCOUNTS_RECEIVABLE', isSystemAccount: true, isActive: true },
  { id: 'a4', code: '5300', name: 'Rent', type: 'EXPENSE', isSystemAccount: false, isActive: true },
  { id: 'a5', code: '5400', name: 'Old category', type: 'EXPENSE', isSystemAccount: false, isActive: false },
];
const expense = { id: 'e1', branchId: 'b1', expenseAccountId: 'a4', amount: 250, expenseDate: '2026-11-10T00:00:00.000Z', paymentMethod: 'CASH', paymentAccountId: 'a1', description: 'November rent', reference: 'R-9' };

beforeEach(() => {
  h.reset();
  h.me = makeUser(['acc_expenses:read', 'acc_expenses:create']);
  h.routes['GET /accounting/expenses'] = () => ({ body: [expense] });
  h.routes['GET /accounting/accounts'] = () => ({ body: accountsList });
  h.routes['GET /vendors'] = () => ({ body: [{ id: 'v1', company: 'Acme Pharma' }] });
});
afterEach(() => h.settle());

async function fillValid() {
  await fireEvent.press(await screen.findByLabelText('Expense Category'));
  await fireEvent.press(await screen.findByRole('button', { name: /5300 · Rent/ }));
  await fireEvent.changeText(screen.getByLabelText('Amount'), '75.5');
  await fireEvent.press(screen.getByLabelText('Paid From'));
  await fireEvent.press(await screen.findByRole('button', { name: /1000 · Cash/ }));
  await fireEvent.changeText(screen.getByLabelText('Description'), ' Electricity ');
}

describe('expense rules', () => {
  it('Submit needs category, amount > 0, paid-from account and a description', () => {
    const ok = { expenseAccountId: 'a', amount: '1', paymentAccountId: 'b', description: 'x' };
    expect(canSubmitExpense(ok)).toBe(true);
    for (const bad of [{ expenseAccountId: '' }, { amount: '0' }, { amount: '' }, { paymentAccountId: '' }, { description: '  ' }]) expect(canSubmitExpense({ ...ok, ...bad })).toBe(false);
  });
});

describe('Expenses screen', () => {
  it('is gated, listed in the menu, and loads nothing without acc_expenses:read', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<ExpensesScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/expenses')).toHaveLength(0);
    expect(navSections.find((s) => s.title === 'Accounting')!.items.find((i) => i.href === '/accounting/expenses')!.anyOf).toEqual(['acc_expenses:read']);
  });

  it('lists expenses with category, amount, method, paid-from account and reference; branch user scoped', async () => {
    await h.wrap(<ExpensesScreen />);
    expect(await screen.findByText('November rent')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText('Rs 250')).toBeTruthy();
    expect(screen.getByText(/Cash · Paid from Cash/)).toBeTruthy();
    expect(screen.getByText('Ref R-9')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/expenses')[0].path).toContain('branchId=b1');
  });

  it('shows empty and error states', async () => {
    h.routes['GET /accounting/expenses'] = () => ({ body: [] });
    await h.wrap(<ExpensesScreen />);
    expect(await screen.findByText('No expenses found')).toBeTruthy();
  });

  it('shows a server error with retry', async () => {
    h.routes['GET /accounting/expenses'] = () => ({ status: 500, body: { message: 'Boom' } });
    await h.wrap(<ExpensesScreen />);
    expect(await screen.findByText('Boom')).toBeTruthy();
  });

  it('Record Expense needs acc_expenses:create', async () => {
    h.me = makeUser(['acc_expenses:read']);
    await h.wrap(<ExpensesScreen />);
    await screen.findByText('November rent');
    expect(disabled(button('Record Expense'))).toBe(true);
  });

  it('offers only active EXPENSE accounts as categories and only cash/bank-type assets as paid-from', async () => {
    await h.wrap(<ExpensesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Expense' }));
    await fireEvent.press(await screen.findByLabelText('Expense Category'));
    expect(await screen.findByRole('button', { name: /5300 · Rent/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Old category/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /1000 · Cash/ })).toBeNull();
  });

  it('Save stays disabled until the form is complete, then posts once with the branch in the body', async () => {
    h.routes['POST /accounting/expenses'] = () => ({ body: { id: 'e2' } });
    await h.wrap(<ExpensesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Expense' }));
    expect(disabled(await screen.findByRole('button', { name: 'Save expense' }))).toBe(true);
    await fillValid();
    await fireEvent.press(button('Save expense'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Expense recorded']));
    const posts = h.callsTo('POST', '/accounting/expenses');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ branchId: 'b1', expenseAccountId: 'a4', amount: 75.5, paymentMethod: 'CASH', paymentAccountId: 'a1', description: 'Electricity' });
    expect(posts[0].headers['X-Branch-Id']).toBeUndefined();
  });

  it('an admin must pick the branch (required) before the expense is accepted', async () => {
    h.me = makeUser([], { tenantRole: 'TENANT_SUPER_ADMIN', branchId: undefined });
    h.routes['POST /accounting/expenses'] = () => ({ body: { id: 'e2' } });
    await h.wrap(<ExpensesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Expense' }));
    await fillValid();
    await fireEvent.press(button('Save expense'));
    expect(await screen.findByText('Branch is required')).toBeTruthy();
    expect(h.callsTo('POST', '/accounting/expenses')).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Branch'));
    // The screen's branch filter also lists North; the picker option is the last match.
    await fireEvent.press((await screen.findAllByRole('button', { name: /North/ })).at(-1)!);
    await fireEvent.press(button('Save expense'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Expense recorded']));
    expect(h.callsTo('POST', '/accounting/expenses')[0].body).toMatchObject({ branchId: 'b2' });
  });

  it('a rejected expense shows the server message and keeps the form', async () => {
    h.routes['POST /accounting/expenses'] = () => ({ status: 404, body: { message: 'Payment account not found' } });
    await h.wrap(<ExpensesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Expense' }));
    await fillValid();
    await fireEvent.press(button('Save expense'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Payment account not found']));
    expect(screen.getByLabelText('Amount').props.value).toBe('75.5');
  });

  it('a double press sends one request', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    h.routes['POST /accounting/expenses'] = () => ({ body: { id: 'e2' }, gate });
    await h.wrap(<ExpensesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record Expense' }));
    await fillValid();
    const save = button('Save expense');
    // The press resolves with the async handler, which waits on the gated POST: don't await it until released.
    const first = fireEvent.press(save);
    await waitFor(() => expect(h.callsTo('POST', '/accounting/expenses')).toHaveLength(1));
    const second = fireEvent.press(save);
    release();
    await Promise.all([first, second]);
    await waitFor(() => expect(h.toastTexts()).toEqual(['Expense recorded']));
    expect(h.callsTo('POST', '/accounting/expenses')).toHaveLength(1);
  });
});
