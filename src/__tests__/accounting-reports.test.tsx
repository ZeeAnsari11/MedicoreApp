import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { BalanceSheetScreen, ProfitLossScreen, TrialBalanceScreen } from '@/features/accounting/report-screens';
import { trialBalanceCsv } from '@/features/accounting/use-reports';
import { navSections } from '@/navigation/nav-config';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, Stack: { Screen: () => null }, Link: ({ children }: { children: unknown }) => children }));
const mockSave = jest.fn((_bytes: Uint8Array, _name: string) => 'file:///cache/tb.csv');
const mockShareFile = jest.fn(async (_uri: string, _mime: string, _title?: string) => {});
jest.mock('@/lib/files', () => ({ ...jest.requireActual('@/lib/files'), saveToCache: (b: Uint8Array, n: string) => mockSave(b, n), shareFile: (u: string, m: string, t?: string) => mockShareFile(u, m, t) }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const tb = { rows: [{ accountId: 'a1', accountCode: '1000', accountName: 'Cash "Main"', type: 'ASSET', debit: 500, credit: 0 }, { accountId: 'a2', accountCode: '3000', accountName: 'Capital', type: 'EQUITY', debit: 0, credit: 500 }], totalDebit: 500, totalCredit: 500 };
const pl = { revenue: [{ accountId: 'r1', accountName: 'Sales Revenue', amount: 900 }], totalRevenue: 900, expenses: [{ accountId: 'e1', accountName: 'Rent', amount: 250 }], totalExpenses: 250, netIncome: 650 };
const bs = { assets: [{ accountId: 'a1', accountName: 'Cash', amount: 700 }], totalAssets: 700, liabilities: [{ accountId: 'l1', accountName: 'Accounts Payable', amount: 50 }], totalLiabilities: 50, equity: [{ accountId: 'q1', accountName: 'Capital', amount: 650 }], totalEquity: 650, netIncome: 150, isBalanced: true };

beforeEach(() => {
  mockSave.mockClear();
  mockShareFile.mockClear();
  h.reset();
  h.me = makeUser(['acc_trial_balance:read', 'acc_profit_loss:read', 'acc_balance_sheet:read']);
  h.routes['GET /accounting/reports/trial-balance'] = () => ({ body: tb });
  h.routes['GET /accounting/reports/profit-loss'] = () => ({ body: pl });
  h.routes['GET /accounting/reports/balance-sheet'] = () => ({ body: bs });
});
afterEach(() => h.settle());
const params = (path: string) => Object.fromEntries(new URLSearchParams(path.split('?')[1]));

describe('trial balance CSV', () => {
  it('quotes every cell, escapes quotes and writes amounts to 2 decimals like the web export', () => {
    expect(trialBalanceCsv(tb.rows as never)).toBe('"Code","Account","Type","Debit","Credit"\n"1000","Cash ""Main""","ASSET","500.00","0.00"\n"3000","Capital","EQUITY","0.00","500.00"'.replace(/^"Code","Account","Type","Debit","Credit"/, 'Code,Account,Type,Debit,Credit'));
  });
});

describe('report gating', () => {
  it.each([['trial-balance', TrialBalanceScreen], ['profit-loss', ProfitLossScreen], ['balance-sheet', BalanceSheetScreen]] as const)('%s needs its read permission and loads nothing without it', async (slug, Screen) => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<Screen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(h.callsTo('GET', `/accounting/reports/${slug}`)).toHaveLength(0);
  });
  it('are in the menu with their permission', () => {
    const items = navSections.find((s) => s.title === 'Accounting')!.items;
    expect(items.find((i) => i.href === '/accounting/trial-balance')!.anyOf).toEqual(['acc_trial_balance:read']);
    expect(items.find((i) => i.href === '/accounting/profit-loss')!.anyOf).toEqual(['acc_profit_loss:read']);
    expect(items.find((i) => i.href === '/accounting/balance-sheet')!.anyOf).toEqual(['acc_balance_sheet:read']);
  });
});

describe('Trial Balance', () => {
  it('sends asOfDate and the branch, shows totals, the Balanced badge and rows', async () => {
    await h.wrap(<TrialBalanceScreen />);
    expect(await screen.findByText('Balanced')).toBeTruthy();
    const p = params(h.callsTo('GET', '/accounting/reports/trial-balance')[0].path);
    expect(p.branchId).toBe('b1');
    expect(p.asOfDate).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(screen.getByText('1000 · Cash "Main"')).toBeTruthy();
  });

  it('flags an out-of-balance ledger from the backend totals', async () => {
    h.routes['GET /accounting/reports/trial-balance'] = () => ({ body: { ...tb, totalCredit: 400 } });
    await h.wrap(<TrialBalanceScreen />);
    expect(await screen.findByText('Out of balance')).toBeTruthy();
  });

  it('filters rows client-side', async () => {
    await h.wrap(<TrialBalanceScreen />);
    await screen.findByText('Balanced');
    await fireEvent.changeText(screen.getByPlaceholderText('Search accounts...'), 'capital');
    expect(screen.queryByText('1000 · Cash "Main"')).toBeNull();
    expect(screen.getByText('3000 · Capital')).toBeTruthy();
  });

  it('a bad date sends no request', async () => {
    await h.wrap(<TrialBalanceScreen />);
    await screen.findByText('Balanced');
    const before = h.callsTo('GET', '/accounting/reports/trial-balance').length;
    await fireEvent.changeText(screen.getByLabelText('As of date'), '2026-99-01');
    expect(await screen.findByText('Enter a valid date.')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/reports/trial-balance')).toHaveLength(before);
  });

  it('Export CSV needs acc_trial_balance:export', async () => {
    await h.wrap(<TrialBalanceScreen />);
    await screen.findByText('Balanced');
    expect(disabled(button('Export CSV'))).toBe(true);
  });

  it('Export CSV writes the file and opens the share sheet once, even on a double press', async () => {
    h.me = makeUser(['acc_trial_balance:read', 'acc_trial_balance:export']);
    await h.wrap(<TrialBalanceScreen />);
    await screen.findByText('Balanced');
    await waitFor(() => expect(disabled(button('Export CSV'))).toBe(false));
    // Hold the share sheet open so the second press lands while the first export is still running.
    let release: () => void = () => {};
    mockShareFile.mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    const exportButton = button('Export CSV');
    const first = fireEvent.press(exportButton);
    await waitFor(() => expect(mockShareFile).toHaveBeenCalledTimes(1));
    const second = fireEvent.press(exportButton);
    release();
    await Promise.all([first, second]);
    expect(mockShareFile).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(new TextDecoder().decode(mockSave.mock.calls[0][0])).toContain('"1000","Cash ""Main""","ASSET","500.00","0.00"');
    expect(mockSave.mock.calls[0][1]).toMatch(/^trial-balance-\d{4}-\d\d-\d\d\.csv$/);
    expect(mockShareFile.mock.calls[0][1]).toBe('text/csv');
  });

  it('reports a sharing failure instead of silently doing nothing', async () => {
    h.me = makeUser(['acc_trial_balance:read', 'acc_trial_balance:export']);
    mockShareFile.mockRejectedValueOnce(new Error('Sharing is not available on this device.'));
    await h.wrap(<TrialBalanceScreen />);
    await screen.findByText('Balanced');
    await waitFor(() => expect(disabled(button('Export CSV'))).toBe(false));
    await fireEvent.press(button('Export CSV'));
    await waitFor(() => expect(h.toastTexts()).toEqual(['Sharing is not available on this device.']));
  });

  it('shows a server error', async () => {
    h.routes['GET /accounting/reports/trial-balance'] = () => ({ status: 500, body: { message: 'Boom' } });
    await h.wrap(<TrialBalanceScreen />);
    expect(await screen.findByText('Boom')).toBeTruthy();
  });
});

describe('Profit & Loss', () => {
  it('opens on the last 30 days and shows revenue, expenses and net income', async () => {
    await h.wrap(<ProfitLossScreen />);
    expect(await screen.findByText('Sales Revenue')).toBeTruthy();
    const p = params(h.callsTo('GET', '/accounting/reports/profit-loss')[0].path);
    const days = (new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / 86_400_000;
    expect(days).toBe(30);
    expect(p.branchId).toBe('b1');
    expect(screen.getByText('Total Revenue')).toBeTruthy();
    expect(screen.getByText('Total Expenses')).toBeTruthy();
    expect(screen.getByText('650.00')).toBeTruthy();
  });

  it('a reversed range sends no request', async () => {
    await h.wrap(<ProfitLossScreen />);
    await screen.findByText('Sales Revenue');
    const before = h.callsTo('GET', '/accounting/reports/profit-loss').length;
    await fireEvent.changeText(screen.getByLabelText('From date'), '2999-01-01');
    expect(await screen.findByText('Enter a valid date range.')).toBeTruthy();
    expect(h.callsTo('GET', '/accounting/reports/profit-loss')).toHaveLength(before);
  });
});

describe('Balance Sheet', () => {
  it('shows the sections, the balanced badge and net income', async () => {
    await h.wrap(<BalanceSheetScreen />);
    expect(await screen.findByText('Balanced (Assets = Liabilities + Equity)')).toBeTruthy();
    expect(screen.getByText('Total Assets')).toBeTruthy();
    expect(screen.getByText('Total Liabilities')).toBeTruthy();
    expect(screen.getByText('Total Equity')).toBeTruthy();
    expect(screen.getByText('Net Income (included in Equity)')).toBeTruthy();
    expect(params(h.callsTo('GET', '/accounting/reports/balance-sheet')[0].path).asOfDate).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  it('flags out of balance', async () => {
    h.routes['GET /accounting/reports/balance-sheet'] = () => ({ body: { ...bs, isBalanced: false } });
    await h.wrap(<BalanceSheetScreen />);
    expect(await screen.findByText('Out of balance')).toBeTruthy();
  });
});
