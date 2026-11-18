import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import InventoryScreen from '@/app/(app)/inventory/index';
import ManufacturersScreen from '@/app/(app)/manufacturers/index';
import ProductsScreen from '@/app/(app)/products/index';
import { confirmAction } from '@/lib/confirm';
import { createHarness, makeUser } from '@/test-support/screen-harness';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.setTimeout(20000);
configure({ asyncUtilTimeout: 5000 });

const h = createHarness();
beforeEach(() => {
  h.reset();
  mockPush.mockReset();
  h.routes['GET /manufacturers'] = () => ({
    body: [
      { id: 'm1', tenantId: 't1', branchId: 'b1', name: 'Demo Pharma', country: 'Pakistan', contactPhone: '0300', isActive: true },
      { id: 'm2', tenantId: 't1', branchId: 'b1', name: 'Isis Pharmaceuticals', isActive: false },
    ],
  });
  h.routes['PATCH /manufacturers/m1/status'] = (c) => ({ body: { id: 'm1', name: 'Demo Pharma', branchId: 'b1', ...(c.body as object) } });
  h.routes['GET /products'] = () => ({
    body: [{ id: 'p1', tenantId: 't1', branchId: 'b1', name: 'Paracetamol 500mg', genericName: 'Paracetamol', manufacturerId: 'm1', manufacturer: { id: 'm1', name: 'Demo Pharma' }, unit: 'Strip', tp: 18, cp: 15, rp: 22, status: 'ACTIVE' }],
  });
  h.routes['GET /vendor-products'] = () => ({ body: [] });
  h.routes['PATCH /products/p1/status'] = (c) => ({ body: { id: 'p1', ...(c.body as object) } });
  (confirmAction as jest.Mock).mockReset().mockResolvedValue(true);
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
  h.routes['GET /inventory'] = () => ({
    body: [
      { productId: 'p1', productName: 'Paracetamol 500mg', unit: 'Strip', barcode: 'DEMO-0001', totalQuantity: 200, minStockLevel: 5, isLowStock: false, nearestExpiryDate: inDays(400) },
      { productId: 'p2', productName: 'Cetirizine 10mg', unit: 'Strip', totalQuantity: 3, minStockLevel: 5, isLowStock: true, nearestExpiryDate: inDays(10) },
      { productId: 'p3', productName: 'ORS', unit: 'Sachet', totalQuantity: 0, isLowStock: true, expiredQuantity: 4, nearestExpiryDate: inDays(-2) },
    ],
  });
});
afterEach(() => h.settle());

describe('Manufacturers list rows', () => {
  it('shows name, status pill and "branch · country" per row', async () => {
    h.me = makeUser(['manufacturers:read', 'branches:read']);
    await h.wrap(<ManufacturersScreen />);
    expect(await screen.findByRole('button', { name: 'Demo Pharma' })).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(await screen.findByText('Main · Pakistan')).toBeTruthy();
    expect(screen.getByText('Main · —')).toBeTruthy();
  });

  it('tapping a row opens its actions: Edit and Deactivate (sends the status change)', async () => {
    h.me = makeUser(['manufacturers:read', 'manufacturers:update']);
    await h.wrap(<ManufacturersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Demo Pharma' }));
    expect(screen.getByText('Contact: 0300')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/manufacturers/form', params: { id: 'm1' } });

    await fireEvent.press(screen.getByRole('button', { name: 'Demo Pharma' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(h.callsTo('PATCH', '/manufacturers/m1/status')).toHaveLength(1));
    expect(h.callsTo('PATCH', '/manufacturers/m1/status')[0].body).toEqual({ isActive: false });
  });

  it('without manufacturers:update there is no Edit and the status action is disabled', async () => {
    h.me = makeUser(['manufacturers:read']);
    await h.wrap(<ManufacturersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Demo Pharma' }));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Deactivate' }).props.accessibilityState?.disabled).toBe(true);
  });
});

describe('Products list rows', () => {
  it('shows name, status pill, "branch · manufacturer" and "generic · prices"', async () => {
    h.me = makeUser(['products:read', 'branches:read']);
    await h.wrap(<ProductsScreen />);
    expect(await screen.findByRole('button', { name: 'Paracetamol 500mg' })).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(await screen.findByText('Main · Demo Pharma')).toBeTruthy();
    expect(screen.getByText('Paracetamol · TP 18.00 · CP 15.00 · RP 22.00')).toBeTruthy();
  });

  it('the row opens Edit, Print barcode and Discontinue (confirmed, then sent)', async () => {
    h.me = makeUser(['products:read', 'products:update']);
    await h.wrap(<ProductsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Paracetamol 500mg' }));
    expect(screen.getByText(/Unit: Strip · Vendors: —/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Print barcode' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/products/barcode', params: { id: 'p1' } });

    await fireEvent.press(screen.getByRole('button', { name: 'Paracetamol 500mg' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Discontinue' }));
    await waitFor(() => expect(h.callsTo('PATCH', '/products/p1/status')).toHaveLength(1));
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Discontinue product?', destructive: true }));
    expect(h.callsTo('PATCH', '/products/p1/status')[0].body).toEqual({ status: 'DISCONTINUED' });
  });

  it('without products:update, Edit and Discontinue are disabled; Print barcode stays available', async () => {
    h.me = makeUser(['products:read']);
    await h.wrap(<ProductsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Paracetamol 500mg' }));
    expect(screen.getByRole('button', { name: 'Edit' }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Discontinue' }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Print barcode' }).props.accessibilityState?.disabled).toBe(false);
  });
});

describe('Inventory list rows', () => {
  it('shows stock status, on-hand quantity with unit, nearest expiry and details per product', async () => {
    h.me = makeUser(['inventory:read']);
    await h.wrap(<InventoryScreen />);
    // The Stock filter chips use the same words, so each pill is checked inside its own row.
    const row = async (name: string) => within(await screen.findByRole('button', { name }));
    const para = await row('Paracetamol 500mg');
    expect(para.getByText('In stock')).toBeTruthy();
    expect(para.getByText('200')).toBeTruthy();
    expect(para.getByText(/^Expiry .* · 400d left$/)).toBeTruthy();
    // Vendors only appear with vendors:read (same rule as before).
    expect(para.getByText('DEMO-0001 · Min 5')).toBeTruthy();
    const ceti = await row('Cetirizine 10mg');
    expect(ceti.getByText('Low stock')).toBeTruthy();
    expect(ceti.getByText(/^Expiry .* · 10d left$/)).toBeTruthy();
    const ors = await row('ORS');
    expect(ors.getByText('Out of stock')).toBeTruthy();
    expect(ors.getByText('Sachet')).toBeTruthy();
    expect(ors.getByText(/^Expiry .* · Expired · 4 expired$/)).toBeTruthy();
  });

  it('tapping a product opens its batches for the selected branch', async () => {
    h.me = makeUser(['inventory:read']);
    await h.wrap(<InventoryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Cetirizine 10mg' }));
    // The test user is a branch user pinned to b1.
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/inventory/batches', params: { productId: 'p2', productName: 'Cetirizine 10mg', branchId: 'b1' } });
  });
});
