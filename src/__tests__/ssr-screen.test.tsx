import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SsrScreen } from '@/features/ssr/ssr-screen';
import { ssrExportPath, ssrQuery } from '@/features/ssr/use-ssr';
import { defaultSsrRange } from '@/features/ssr/ssr-dates';
import { navSections } from '@/navigation/nav-config';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) }, useLocalSearchParams: () => ({}), Stack: { Screen: () => null }, Link: ({ children }: { children: unknown }) => children }));
const mockShare = jest.fn(async (_req: { path: string; fileName: string; mimeType?: string }) => {});
jest.mock('@/features/documents/use-document-file', () => ({ useDocumentFile: () => ({ isBusy: false, share: (r: { path: string; fileName: string; mimeType?: string }) => mockShare(r), print: jest.fn() }) }));
jest.setTimeout(30000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const row = (over: Record<string, unknown>) => ({ key: 'k', label: 'L', kind: 'product', unitsSold: 0, unitsReturned: 0, netUnits: 0, gross: 0, discounts: 0, returnsValue: 0, netSales: 0, tax: 0, cogs: 0, grossProfit: 0, marginPct: null, avgPrice: null, closingStock: 0, voidedUnits: 0, voidedValue: 0, invoices: 0, customers: 0, opening: 10, purchased: 5, purchaseValue: 0, totalStock: 15, grossSale: 8, bonus: 0, netSale: 8, netSaleValue: 1234.5, expBrk: 0, transferIn: 1, transferOut: 2, closingQty: 7, closingValue: 700, closingValueCp: 500, ...over });
const product = row({ key: 'p1', label: 'Panadol', kind: 'product', pack: '10x10', rate: 12, batches: [row({ key: 'bt1', label: 'B-1', kind: 'batch', netSaleValue: 99 })] });
const report = (over: Record<string, unknown> = {}) => ({ view: 'manufacturer', from: '', to: '', returnsAttribution: 'RETURN_DATE', canViewCost: false, totals: row({ key: 'all', label: 'Total', kind: 'manufacturer', netSaleValue: 5000 }), summary: {}, chart: {}, rows: [row({ key: 'm1', label: 'GSK', kind: 'manufacturer', children: [product] })], page: 1, pageSize: 50, totalRows: 1, warnings: [], ...over });
const params = (path: string) => Object.fromEntries(new URLSearchParams(path.split('?')[1]));
const reportCalls = () => h.callsTo('GET', '/reports/ssr');

beforeEach(() => {
  mockShare.mockClear();
  mockPush.mockClear();
  h.reset();
  h.me = makeUser(['ssr:read']);
  h.routes['GET /reports/ssr'] = () => ({ body: report() });
  h.routes['GET /sales/order-bookers'] = () => ({ body: [{ id: 'o1', name: 'Bilal' }, { id: 'o2', name: 'Sana' }] });
});
afterEach(() => h.settle());

describe('query helpers', () => {
  it('skips falsy values and builds the export path with the format', () => {
    expect(ssrQuery({ from: '2026-11-01', branchId: undefined, search: '' })).toBe('from=2026-11-01');
    expect(ssrExportPath({ from: 'a', columns: 'x,y' }, 'csv')).toBe('/reports/ssr/export?from=a&columns=x%2Cy&format=csv');
  });
});

describe('SSR screen: access and navigation', () => {
  it('is gated and loads nothing without ssr:read; the menu entry needs ssr:read', async () => {
    h.me = makeUser(['sales:read']);
    await h.wrap(<SsrScreen />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(reportCalls()).toHaveLength(0);
    const insights = navSections.find((s) => s.title === 'Insights')!;
    expect(insights.items).toEqual([expect.objectContaining({ label: 'SSR', href: '/reports/ssr', anyOf: ['ssr:read'] })]);
  });
});

describe('SSR screen: report', () => {
  it('requests This month, the manufacturer view, newest sort and the branch; no page, no order booker', async () => {
    await h.wrap(<SsrScreen />);
    expect(await screen.findByText('GSK')).toBeTruthy();
    const p = params(reportCalls()[0].path);
    const def = defaultSsrRange();
    expect(p).toEqual({ from: def.from, to: def.to, branchId: 'b1', view: 'manufacturer', sort: 'netSaleValue:desc' });
  });

  it('shows the grand total and expands manufacturer → product → batches', async () => {
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    expect(screen.getByText('Grand total')).toBeTruthy();
    expect(screen.queryByText('Panadol')).toBeNull();
    await fireEvent.press(button('Expand GSK'));
    expect(await screen.findByText('Panadol')).toBeTruthy();
    expect(screen.getByText('10x10')).toBeTruthy();
    await fireEvent.press(button('Expand Panadol'));
    expect(await screen.findByText('Batch B-1')).toBeTruthy();
    expect(screen.getAllByText('1,234.50').length).toBeGreaterThan(0);
  });

  it('cost and comparison columns only appear when the report says so', async () => {
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    expect(screen.queryByText('Closing Stock (CP)')).toBeNull();
    expect(screen.queryByText('Prev. net sales')).toBeNull();
    expect(screen.getAllByText('Closing Stock (TP)').length).toBeGreaterThan(0);
  });

  it('with canViewCost and a comparison the extra columns are listed', async () => {
    h.routes['GET /reports/ssr'] = () => ({ body: report({ canViewCost: true, totals: row({ key: 'all', label: 'Total', kind: 'manufacturer', prevNetSales: 100, changePct: -5 }) }) });
    await h.wrap(<SsrScreen />);
    expect((await screen.findAllByText('Closing Stock (CP)')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prev. net sales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('▼ 5%').length).toBeGreaterThan(0);
  });

  it('a view change sends view; only the product view sends page and the pager steps through', async () => {
    h.routes['GET /reports/ssr'] = (c) => ({ body: report({ view: params(c.path).view, totalRows: 120, pageSize: 50, page: Number(params(c.path).page ?? 1) }) });
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    expect(screen.queryByText(/products\)/)).toBeNull();
    await fireEvent.press(button('View: Product'));
    await waitFor(() => expect(reportCalls().some((c) => params(c.path).view === 'product' && params(c.path).page === '1')).toBe(true));
    expect(await screen.findByText('Page 1 of 3 (120 products)')).toBeTruthy();
    await fireEvent.press(button('Next'));
    await waitFor(() => expect(reportCalls().some((c) => params(c.path).page === '2')).toBe(true));
    expect(await screen.findByText('Page 2 of 3 (120 products)')).toBeTruthy();
    await fireEvent.press(button('View: Vendor'));
    await waitFor(() => expect(reportCalls().some((c) => params(c.path).view === 'vendor')).toBe(true));
    expect(reportCalls().filter((c) => params(c.path).view === 'vendor').every((c) => params(c.path).page === undefined)).toBe(true);
  });

  it('search is debounced into one server request and the total row says so', async () => {
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    const before = reportCalls().length;
    for (const t of ['p', 'pa', 'pan']) await fireEvent.changeText(screen.getByPlaceholderText('Search in table...'), t);
    await waitFor(() => expect(reportCalls().some((c) => params(c.path).search === 'pan')).toBe(true));
    expect(reportCalls().length).toBe(before + 1);
    expect(await screen.findByText('Total (matching search)')).toBeTruthy();
  });

  it('sorts server-side: a new column descending first, the same column again ascending', async () => {
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    await fireEvent.press(button(/Sort by Opening Qty/));
    await waitFor(() => expect(reportCalls().some((c) => params(c.path).sort === 'opening:desc')).toBe(true));
    await fireEvent.press(button(/Sort by Opening Qty/));
    await waitFor(() => expect(reportCalls().some((c) => params(c.path).sort === 'opening:asc')).toBe(true));
    expect(screen.queryByRole('button', { name: /Sort by Pack/ })).toBeNull();
  });

  it('a preset changes the dates; a reversed range sends nothing and disables export', async () => {
    h.me = makeUser(['ssr:read', 'ssr:export']);
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    await fireEvent.press(button('Period: Last 7 days'));
    await waitFor(() => expect(reportCalls().length).toBe(2));
    const week = params(reportCalls()[1].path);
    expect(week.from < week.to).toBe(true);
    const before = reportCalls().length;
    await fireEvent.changeText(screen.getByLabelText('From'), '2999-01-01');
    expect(await screen.findByText('The From date must be on or before the To date.')).toBeTruthy();
    expect(reportCalls()).toHaveLength(before);
    expect(disabled(button('CSV'))).toBe(true);
  });

  it('shows warnings, the returns footnote and the Pakistan-time note', async () => {
    h.routes['GET /reports/ssr'] = () => ({ body: report({ warnings: ['Totals differ between views'], returnsAttribution: 'SALE_DATE' }) });
    await h.wrap(<SsrScreen />);
    expect(await screen.findByText('Totals differ between views')).toBeTruthy();
    expect(screen.getByText(/Returns are counted against the original sale date\./)).toBeTruthy();
    expect(screen.getByText(/Dates are Pakistan time\./)).toBeTruthy();
  });

  it('empty report: the web message and no table controls', async () => {
    h.routes['GET /reports/ssr'] = () => ({ body: report({ rows: [], totalRows: 0 }) });
    await h.wrap(<SsrScreen />);
    expect(await screen.findByText('No sales found for these filters.')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search in table...')).toBeNull();
    expect(screen.getByRole('button', { name: 'View: Product' })).toBeTruthy();
  });

  it('a failed first load shows the server message with retry and is not retried automatically', async () => {
    h.routes['GET /reports/ssr'] = () => ({ status: 500, body: { message: 'Boom' } });
    await h.wrap(<SsrScreen />);
    expect((await screen.findAllByText('Boom')).length).toBeGreaterThan(0);
    expect(reportCalls()).toHaveLength(1);
  });

  it('a foreign-branch rejection is shown verbatim', async () => {
    h.routes['GET /reports/ssr'] = () => ({ status: 403, body: { message: 'You do not have access to that branch' } });
    await h.wrap(<SsrScreen />);
    expect((await screen.findAllByText('You do not have access to that branch')).length).toBeGreaterThan(0);
  });
});

describe('SSR screen: order booker filter', () => {
  it('is hidden without sales:view_all (and its options are not fetched)', async () => {
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    expect(screen.queryByRole('button', { name: 'All order bookers' })).toBeNull();
    expect(h.callsTo('GET', '/sales/order-bookers')).toHaveLength(0);
  });

  it('with sales:view_all, ticking bookers sends salesmanIds and labels the filter', async () => {
    h.me = makeUser(['ssr:read', 'sales:view_all']);
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    await fireEvent.press(button('All order bookers'));
    await fireEvent(await screen.findByLabelText('Bilal'), 'valueChange', true);
    await fireEvent(screen.getByLabelText('Sana'), 'valueChange', true);
    await waitFor(() => expect(reportCalls().some((c) => params(c.path).salesmanIds === 'o1,o2')).toBe(true));
    await fireEvent.changeText(screen.getByPlaceholderText('Search...'), 'zzz');
    expect(await screen.findByText('Nothing found.')).toBeTruthy();
  });
});

describe('SSR screen: columns and export', () => {
  it('export is hidden without ssr:export', async () => {
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    expect(screen.queryByRole('button', { name: 'CSV' })).toBeNull();
  });

  it('each format hits /reports/ssr/export with the same filters and only the visible columns', async () => {
    h.me = makeUser(['ssr:read', 'ssr:export']);
    await h.wrap(<SsrScreen />);
    await screen.findByText('GSK');
    await waitFor(() => expect(disabled(button('CSV'))).toBe(false));
    await fireEvent.press(button('Columns'));
    await fireEvent(await screen.findByLabelText('Opening Qty'), 'valueChange', false);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    await fireEvent.press(button('Excel (.xlsx)'));
    await fireEvent.press(button('CSV'));
    await fireEvent.press(button('PDF'));
    expect(mockShare).toHaveBeenCalledTimes(3);
    const calls = mockShare.mock.calls.map((c) => c[0]);
    const def = defaultSsrRange();
    expect(calls.map((c) => c.fileName)).toEqual([`ssr-${def.from}-to-${def.to}.xlsx`, `ssr-${def.from}-to-${def.to}.csv`, `ssr-${def.from}-to-${def.to}.pdf`]);
    expect(calls.map((c) => c.mimeType)).toEqual(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/pdf']);
    const q = params(calls[1].path);
    expect(calls[1].path.startsWith('/reports/ssr/export?')).toBe(true);
    expect(q).toMatchObject({ from: def.from, to: def.to, branchId: 'b1', view: 'manufacturer', sort: 'netSaleValue:desc', format: 'csv' });
    expect(q.columns.split(',')).not.toContain('opening');
    expect(q.columns.split(',')).toContain('netSaleValue');
    expect(q.columns.split(',')).not.toContain('closingValueCp');
  });

  it('export is disabled until a report has loaded', async () => {
    h.me = makeUser(['ssr:read', 'ssr:export']);
    h.routes['GET /reports/ssr'] = () => ({ status: 500, body: { message: 'Boom' } });
    await h.wrap(<SsrScreen />);
    await screen.findAllByText('Boom');
    expect(disabled(button('PDF'))).toBe(true);
  });
});

describe('SSR drilldown', () => {
  const invoices = [
    { id: 's1', invoiceNumber: 'INV-1', date: '2026-11-16T20:00:00.000Z', customerName: 'Ali Store', voided: false, unitsSold: 5, value: 600, unitsReturned: 1, returnsValue: 120, batches: [{ batchNumber: 'B-1', quantity: 5 }] },
    { id: 's2', invoiceNumber: 'INV-2', date: '2026-11-10T08:00:00.000Z', customerName: 'Walk-in', voided: true, unitsSold: 2, value: 240, unitsReturned: 0, returnsValue: 0, batches: [] },
  ];
  const open = async () => {
    await screen.findByText('GSK');
    await fireEvent.press(button('Expand GSK'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Show invoices Panadol' }));
  };

  it('loads the invoices with the filters only (no view, sort or search) and lists them', async () => {
    h.routes['GET /reports/ssr/product/p1/invoices'] = () => ({ body: invoices });
    await h.wrap(<SsrScreen />);
    await open();
    expect(await screen.findByText('INV-1')).toBeTruthy();
    const p = params(h.callsTo('GET', '/reports/ssr/product/p1/invoices')[0].path);
    expect(p).toEqual({ from: defaultSsrRange().from, to: defaultSsrRange().to, branchId: 'b1' });
    expect(screen.getByText('17/11/2026 · Ali Store')).toBeTruthy();
    expect(screen.getByText('Batch: B-1 (5)')).toBeTruthy();
    expect(screen.getByText('Returned 1 (120.00)')).toBeTruthy();
    expect(screen.getByText('Voided')).toBeTruthy();
    expect(screen.getByText('Batch: -')).toBeTruthy();
  });

  it('an invoice number opens the sale', async () => {
    h.routes['GET /reports/ssr/product/p1/invoices'] = () => ({ body: invoices });
    await h.wrap(<SsrScreen />);
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: 'Open INV-1' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/sales/detail', params: { id: 's1' } });
  });

  it('empty and error states', async () => {
    h.routes['GET /reports/ssr/product/p1/invoices'] = () => ({ body: [] });
    await h.wrap(<SsrScreen />);
    await open();
    expect(await screen.findByText('No invoices for these filters.')).toBeTruthy();
  });

  it('a failed drilldown shows the error (the web silently shows "empty")', async () => {
    h.routes['GET /reports/ssr/product/p1/invoices'] = () => ({ status: 400, body: { message: 'Invalid product id' } });
    await h.wrap(<SsrScreen />);
    await open();
    expect(await screen.findByText('Invalid product id')).toBeTruthy();
  });
});
