import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AdjustmentForm } from '@/features/inventory/adjustment-form';
import { adjustmentDefaults, adjustmentSchema, buildAdjustment } from '@/features/inventory/schema';
import { matchesStockFilter } from '@/features/inventory/stock-filters';
import { useAdjustStock, useExpiringBatches, useInventoryRollup, useProductBatches } from '@/features/inventory/use-inventory';
import { buildTransfer, validateLineQuantity, validateTransfer, type TransferLineDraft } from '@/features/transfers/schema';
import { TransferForm } from '@/features/transfers/transfer-form';
import { useCreateTransfer, useStockTransfer, useStockTransfers } from '@/features/transfers/use-transfers';
import { expiryStatus } from '@/lib/dates';
import { useBranchStore } from '@/store/branch';
import { useSessionStore } from '@/store/session';
import { useToastStore } from '@/store/toast';
import { TenantRole } from '@/types/medicore';
import type { InventoryRollup } from '@/types/medicore';

// babel-jest hoists this above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
jest.setTimeout(20000);

interface Call { method: string; path: string; headers: Record<string, string>; body: unknown }
const calls: Call[] = [];
type Handler = (call: Call) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};
const me = { userId: 'u1', tenantId: 't1', username: 'admin', tenantRole: TenantRole.TENANT_SUPER_ADMIN, permissions: [] };
const branches = [{ id: 'b1', name: 'Main', code: 'M', isMain: true, isActive: true }, { id: 'b2', name: 'North', code: 'N', isMain: false, isActive: true }, { id: 'b3', name: 'Closed', code: 'C', isMain: false, isActive: false }];

beforeEach(() => {
  calls.length = 0;
  routes = { 'GET /auth/me': () => ({ body: me }), 'GET /branches': () => ({ body: branches }), 'GET /products': () => ({ body: [{ id: 'p1', name: 'Panadol', genericName: 'Para', unit: 'tab' }] }) };
  useSessionStore.setState({ hydrated: true, token: 'tok', impersonationToken: null });
  useBranchStore.setState({ selection: null });
  useToastStore.setState({ toasts: [] });
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('http://api.test/api', '');
    const call: Call = { method: init.method ?? 'GET', path, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined };
    calls.push(call);
    const handler = routes[`${call.method} ${path.split('?')[0]}`];
    const { status = 200, body } = handler ? handler(call) : { status: 404, body: { message: 'no route' } };
    return { ok: status < 400, status, statusText: 'x', json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
const wrapper = () => {
  const c = client();
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={c}>{children}</QueryClientProvider>;
  return Wrapper;
};
const callTo = (method: string, path: string) => calls.find((c) => c.method === method && c.path.split('?')[0] === path);
const toastTexts = () => useToastStore.getState().toasts.map((t) => t.text);
const query = (c: Call) => Object.fromEntries(new URLSearchParams(c.path.split('?')[1] ?? ''));

const rollupRow = (o: Partial<InventoryRollup>): InventoryRollup => ({ productId: 'p', productName: 'P', unit: 'tab', totalQuantity: 10, isLowStock: false, ...o });

describe('adjustment schema and payload', () => {
  const valid = { ...adjustmentDefaults({ branchId: 'b1', productId: 'p1' }), batchNumber: ' B-1 ', expiryDate: '2027-12-31', quantity: '5' };
  it('accepts a complete adjustment and trims', () => {
    expect(adjustmentSchema.safeParse(valid).success).toBe(true);
    expect(buildAdjustment(valid)).toEqual({ productId: 'p1', branchId: 'b1', batchNumber: 'B-1', expiryDate: '2027-12-31', operation: 'add', quantity: 5, purchasePrice: undefined, sellingPrice: undefined, reason: undefined });
  });
  it.each([
    ['branchId', '', 'Branch is required'],
    ['productId', '', 'Product is required'],
    ['batchNumber', '  ', 'Batch number is required'],
    ['expiryDate', '2027-02-30', 'Use a valid date (YYYY-MM-DD)'],
    ['quantity', '', 'Quantity is required'],
    ['quantity', '0', 'Must be at least 1'],
    ['purchasePrice', '-1', 'Purchase price must be 0 or more'],
    ['sellingPrice', 'abc', 'Sale price must be 0 or more'],
  ])('rejects %s = %j', (field, value, message) => {
    const result = adjustmentSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues.map((i) => i.message)).toContain(message);
  });
  it('sends optional prices and a reason only when given, keeping 0 as a real price', () => {
    expect(buildAdjustment({ ...valid, operation: 'set', purchasePrice: '0', sellingPrice: '12.5', reason: ' recount ' })).toMatchObject({ operation: 'set', purchasePrice: 0, sellingPrice: 12.5, reason: 'recount' });
  });
  it('prefills batch and expiry date from an existing batch', () => {
    expect(adjustmentDefaults({ batch: { batchNumber: 'B9', expiryDate: '2027-05-01T00:00:00.000Z' } })).toMatchObject({ batchNumber: 'B9', expiryDate: '2027-05-01' });
  });
});

describe('stock filters and expiry status (web parity)', () => {
  const now = new Date('2026-11-14T00:00:00Z').getTime();
  it('filters rollups as the web inventory page does', () => {
    expect(matchesStockFilter(rollupRow({ totalQuantity: 0 }), 'out', now)).toBe(true);
    expect(matchesStockFilter(rollupRow({ totalQuantity: 0 }), 'in-stock', now)).toBe(false);
    expect(matchesStockFilter(rollupRow({ isLowStock: true }), 'low', now)).toBe(true);
    expect(matchesStockFilter(rollupRow({ expiredQuantity: 3 }), 'expired', now)).toBe(true);
    expect(matchesStockFilter(rollupRow({ nearestExpiryDate: '2026-12-01T00:00:00Z' }), 'expiring', now)).toBe(true);
    expect(matchesStockFilter(rollupRow({ nearestExpiryDate: '2027-03-01T00:00:00Z' }), 'expiring', now)).toBe(false);
    expect(matchesStockFilter(rollupRow({ nearestExpiryDate: '2026-10-01T00:00:00Z' }), 'expiring', now)).toBe(false);
    expect(matchesStockFilter(rollupRow({}), 'all', now)).toBe(true);
  });
  it('labels expiry like the web badge', () => {
    expect(expiryStatus('2026-11-01T00:00:00Z', now)).toEqual({ label: 'Expired', tone: 'danger' });
    expect(expiryStatus('2026-12-01T00:00:00Z', now).tone).toBe('warning');
    expect(expiryStatus('2027-01-20T00:00:00Z', now).tone).toBe('neutral');
    expect(expiryStatus('2027-12-01T00:00:00Z', now).tone).toBe('success');
  });
});

describe('inventory API', () => {
  it('requests the rollup with ?branchId= (as the web does) and omits it for "all branches"', async () => {
    routes['GET /inventory'] = () => ({ body: [rollupRow({ productId: 'p1' })] });
    const one = await renderHook(() => useInventoryRollup('b1'), { wrapper: wrapper() });
    await waitFor(() => expect(one.result.current.rollup).toHaveLength(1));
    expect(callTo('GET', '/inventory')?.path).toBe('/inventory?branchId=b1');
    calls.length = 0;
    await renderHook(() => useInventoryRollup(null), { wrapper: wrapper() });
    await waitFor(() => expect(callTo('GET', '/inventory')).toBeDefined());
    expect(callTo('GET', '/inventory')?.path).toBe('/inventory');
  });

  it('loads batches for a product and expiring batches with the window', async () => {
    routes['GET /inventory/p1/batches'] = () => ({ body: [{ id: 'bt1', productId: 'p1', batchNumber: 'B1', quantity: 4 }] });
    routes['GET /inventory/expiring'] = () => ({ body: [{ id: 'bt1', productId: 'p1', productName: 'Panadol', batchNumber: 'B1', quantity: 4 }] });
    const batches = await renderHook(() => useProductBatches('p1', 'b1'), { wrapper: wrapper() });
    await waitFor(() => expect(batches.result.current.batches).toHaveLength(1));
    expect(callTo('GET', '/inventory/p1/batches')?.path).toBe('/inventory/p1/batches?branchId=b1');
    const expiring = await renderHook(() => useExpiringBatches(60, null), { wrapper: wrapper() });
    await waitFor(() => expect(expiring.result.current.batches[0]?.productName).toBe('Panadol'));
    expect(query(callTo('GET', '/inventory/expiring')!)).toEqual({ withinDays: '60' });
  });

  it('does not request batches without a product', async () => {
    await renderHook(() => useProductBatches(null, 'b1'), { wrapper: wrapper() });
    await waitFor(() => expect(callTo('GET', '/auth/me')).toBeDefined());
    expect(calls.some((c) => c.path.includes('/batches'))).toBe(false);
  });

  it('posts an adjustment with the form branch (no X-Branch-Id on POST) and confirms only after the backend answers', async () => {
    useBranchStore.setState({ selection: 'b2' });
    routes['POST /inventory/adjustments'] = () => ({ status: 201, body: { id: 'bt1' } });
    const { result } = await renderHook(() => useAdjustStock(), { wrapper: wrapper() });
    const dto = buildAdjustment({ ...adjustmentDefaults({ branchId: 'b1', productId: 'p1' }), batchNumber: 'B1', expiryDate: '2027-12-31', quantity: '5', operation: 'subtract' });
    await act(async () => { await result.current.adjust(dto); });
    const post = callTo('POST', '/inventory/adjustments')!;
    expect(post.body).toMatchObject({ productId: 'p1', branchId: 'b1', operation: 'subtract', quantity: 5 });
    expect(post.headers['X-Branch-Id']).toBeUndefined();
    expect(toastTexts()).toContain('Stock adjusted');
  });

  it('shows the backend validation message, never claims success, and does not retry', async () => {
    routes['POST /inventory/adjustments'] = () => ({ status: 400, body: { message: 'Batch "B1" does not have enough quantity to subtract 99' } });
    const { result } = await renderHook(() => useAdjustStock(), { wrapper: wrapper() });
    const dto = buildAdjustment({ ...adjustmentDefaults({ branchId: 'b1', productId: 'p1' }), batchNumber: 'B1', expiryDate: '2027-12-31', quantity: '99', operation: 'subtract' });
    await act(async () => { await expect(result.current.adjust(dto)).rejects.toMatchObject({ status: 400 }); });
    expect(toastTexts()).toContain('Batch "B1" does not have enough quantity to subtract 99');
    expect(toastTexts()).not.toContain('Stock adjusted');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('surfaces a 403 when the user lacks inventory:adjust', async () => {
    routes['POST /inventory/adjustments'] = () => ({ status: 403, body: { message: 'Forbidden resource' } });
    const { result } = await renderHook(() => useAdjustStock(), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.adjust({ productId: 'p1', branchId: 'b1', batchNumber: 'B', expiryDate: '2027-01-01', operation: 'add', quantity: 1 })).rejects.toMatchObject({ status: 403 }); });
    expect(toastTexts()).toContain('Forbidden resource');
  });
});

describe('transfer validation and payload', () => {
  const line = (o: Partial<TransferLineDraft> = {}): TransferLineDraft => ({ batchId: 'bt1', productId: 'p1', productName: 'Panadol', batchNumber: 'B1', expiryDate: '2027-12-31T00:00:00Z', available: 10, quantity: '4', ...o });
  const header = { fromBranchId: 'b1', toBranchId: 'b2', note: '' };

  it('checks line quantities against the DTO rules and the batch stock hint', () => {
    expect(validateLineQuantity('4', 10)).toBeNull();
    expect(validateLineQuantity('2.125', 10)).toBeNull();
    expect(validateLineQuantity('', 10)).toBe('Enter a quantity');
    expect(validateLineQuantity('0', 10)).toBe('Must be greater than 0');
    expect(validateLineQuantity('-2', 10)).toBe('Must be greater than 0');
    expect(validateLineQuantity('1.2345', 10)).toBe('At most 3 decimal places');
    expect(validateLineQuantity('11', 10)).toBe('Only 10 in stock in this batch');
  });
  it('validates the whole transfer', () => {
    expect(validateTransfer(header, [line()])).toBeNull();
    expect(validateTransfer({ ...header, fromBranchId: '' }, [line()])).toBe('Select the source branch');
    expect(validateTransfer({ ...header, toBranchId: '' }, [line()])).toBe('Select the destination branch');
    expect(validateTransfer({ ...header, toBranchId: 'b1' }, [line()])).toBe('Source and destination branch must differ');
    expect(validateTransfer(header, [])).toBe('Add at least one batch to transfer');
    expect(validateTransfer({ ...header, note: 'x'.repeat(301) }, [line()])).toMatch(/at most 300/);
    expect(validateTransfer(header, [line({ quantity: '50' })])).toBe('Panadol (B1): Only 10 in stock in this batch');
  });
  it('builds the DTO with numeric quantities and a trimmed optional note', () => {
    expect(buildTransfer({ ...header, note: '  weekly  ' }, [line(), line({ batchId: 'bt2', quantity: '1.5' })])).toEqual({
      fromBranchId: 'b1', toBranchId: 'b2', lines: [{ batchId: 'bt1', quantity: 4 }, { batchId: 'bt2', quantity: 1.5 }], note: 'weekly',
    });
    expect(buildTransfer(header, [line()]).note).toBeUndefined();
  });
});

describe('transfers API', () => {
  const transfer = { _id: 'tr1', tenantId: 't1', branchId: 'b1', toBranchId: 'b2', transferNumber: 'TR-M-000001', lines: [], createdBy: 'u1', createdAt: '2026-11-14T00:00:00Z', updatedAt: '' };

  it('lists and reads transfers', async () => {
    routes['GET /inventory/transfers'] = () => ({ body: [transfer] });
    routes['GET /inventory/transfers/tr1'] = () => ({ body: transfer });
    const list = await renderHook(() => useStockTransfers('b1'), { wrapper: wrapper() });
    await waitFor(() => expect(list.result.current.transfers).toHaveLength(1));
    expect(callTo('GET', '/inventory/transfers')?.path).toBe('/inventory/transfers?branchId=b1');
    const one = await renderHook(() => useStockTransfer('tr1'), { wrapper: wrapper() });
    await waitFor(() => expect(one.result.current.transfer?.transferNumber).toBe('TR-M-000001'));
  });

  it('creates a transfer, reports the backend-issued number, and refreshes inventory', async () => {
    routes['POST /inventory/transfers'] = () => ({ status: 201, body: transfer });
    const { result } = await renderHook(() => useCreateTransfer(), { wrapper: wrapper() });
    await act(async () => { await result.current.create({ fromBranchId: 'b1', toBranchId: 'b2', lines: [{ batchId: 'bt1', quantity: 4 }] }); });
    expect(callTo('POST', '/inventory/transfers')?.body).toEqual({ fromBranchId: 'b1', toBranchId: 'b2', lines: [{ batchId: 'bt1', quantity: 4 }] });
    expect(callTo('POST', '/inventory/transfers')?.headers['X-Branch-Id']).toBeUndefined();
    expect(toastTexts()).toContain('Transfer TR-M-000001 created');
  });

  it('shows the backend error and does not retry when the transfer is refused', async () => {
    routes['POST /inventory/transfers'] = () => ({ status: 400, body: { message: 'Batch bt1 not found in the source branch or has less than 4 in stock' } });
    const { result } = await renderHook(() => useCreateTransfer(), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.create({ toBranchId: 'b2', lines: [{ batchId: 'bt1', quantity: 4 }] })).rejects.toMatchObject({ status: 400 }); });
    expect(toastTexts().join()).toMatch(/less than 4 in stock/);
    expect(toastTexts().join()).not.toMatch(/created/);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
});

describe('AdjustmentForm', () => {
  it('blocks an empty submit with field errors and calls onSubmit once when valid', async () => {
    const onSubmit = jest.fn(async () => undefined);
    await render(<QueryClientProvider client={client()}><AdjustmentForm initial={adjustmentDefaults({ branchId: 'b1', productId: 'p1' })} onSubmit={onSubmit} /></QueryClientProvider>);
    await fireEvent.press(await screen.findByText('Save adjustment'));
    expect(await screen.findByText('Batch number is required')).toBeTruthy();
    expect(await screen.findByText('Use a valid date (YYYY-MM-DD)')).toBeTruthy();
    expect(await screen.findByText('Quantity is required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Batch number'), 'B-7');
    await fireEvent.changeText(screen.getByLabelText('Expiry date (YYYY-MM-DD)'), '2027-12-31');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '12');
    await fireEvent.press(screen.getByText('Save adjustment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'b1', productId: 'p1', batchNumber: 'B-7', expiryDate: '2027-12-31', quantity: '12', operation: 'add' }));
  });

  it('lets the user choose the operation and explains it', async () => {
    await render(<QueryClientProvider client={client()}><AdjustmentForm initial={adjustmentDefaults({ branchId: 'b1' })} onSubmit={jest.fn()} /></QueryClientProvider>);
    await fireEvent.press(await screen.findByLabelText('Operation: Set to'));
    expect(await screen.findByText(/Replaces the batch quantity/)).toBeTruthy();
  });
});

describe('TransferForm', () => {
  it('refuses to submit without destination or lines and never calls onSubmit', async () => {
    const onSubmit = jest.fn(async () => undefined);
    await render(<QueryClientProvider client={client()}><TransferForm onSubmit={onSubmit} /></QueryClientProvider>);
    await fireEvent.press(await screen.findByLabelText('Branch'));
    await fireEvent.press(await screen.findByText('Main (Main)'));
    await fireEvent.press(screen.getByText('Create transfer'));
    expect(await screen.findByText('Select the destination branch')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('offers only active branches other than the source as destinations', async () => {
    await render(<QueryClientProvider client={client()}><TransferForm onSubmit={jest.fn()} /></QueryClientProvider>);
    await fireEvent.press(await screen.findByLabelText('Branch'));
    await fireEvent.press(await screen.findByText('Main (Main)'));
    await fireEvent.press(await screen.findByLabelText('Destination branch'));
    expect(await screen.findByText('North')).toBeTruthy();
    expect(screen.queryByText('Closed')).toBeNull();
  });
});
