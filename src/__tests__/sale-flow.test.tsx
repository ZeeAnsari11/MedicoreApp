import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SaleForm } from '@/features/sales/sale-form';
import { confirmAction } from '@/lib/confirm';
import { createHarness, disabled, makeUser } from '@/test-support/screen-harness';
import { TenantRole, type Sale } from '@/types/medicore';

// babel-jest hoists these above the imports.
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', API_URL_CONFIGURED: true, REQUEST_TIMEOUT_MS: 1000 }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...a: unknown[]) => mockBack(...a), push: jest.fn() },
  // Renders the custom header title ("New Sale" / "Selling from …").
  Stack: { Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) => options?.headerTitle?.() ?? null },
}));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.setTimeout(30000);
configure({ asyncUtilTimeout: 8000 });

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
// Listed far-expiry first on purpose: the form must order by expiry itself.
const batches = [
  { id: 'bt-far', productId: 'p1', branchId: 'b1', batchNumber: 'B-FAR', expiryDate: inDays(400), quantity: 50 },
  { id: 'bt-near', productId: 'p1', branchId: 'b1', batchNumber: 'B-NEAR', expiryDate: inDays(60), quantity: 5 },
];
const clerk = (extra: string[] = []) =>
  makeUser(['sales:create', 'sales:read', 'products:read', 'customers:read', 'inventory:read', 'sales:discount', ...extra], { tenantRole: TenantRole.TENANT_USER, branchId: 'b1', fullName: 'Demo Clerk' });

const h = createHarness();
beforeEach(() => {
  h.reset();
  mockBack.mockReset();
  h.me = clerk();
  h.routes['GET /products'] = () => ({ body: [{ id: 'p1', branchId: 'b1', name: 'Paracetamol 500mg', genericName: 'Paracetamol', unit: 'Strip', tp: 18, cp: 15, rp: 22, status: 'ACTIVE' }] });
  h.routes['GET /inventory/p1/batches'] = () => ({ body: batches });
  h.routes['GET /customers'] = () => ({ body: [{ id: 'c1', name: 'Demo Customer One', branchId: 'b1' }] });
  h.routes['GET /sales/last-price'] = () => ({ body: [] });
  h.routes['POST /sales'] = () => ({ status: 201, body: { id: 's1', invoiceNumber: '' } });
  (confirmAction as jest.Mock).mockReset().mockResolvedValue(true);
});
afterEach(() => h.settle());

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const pick = async (label: string, option: string | RegExp) => {
  await fireEvent.press(screen.getByLabelText(label));
  await fireEvent.press(await screen.findByText(option));
};
/** Opens Add item and picks the product; waits for the pre-selected batch. */
const openItem = async () => {
  // Add item is enabled once the user's branch has loaded.
  await waitFor(() => expect(disabled(screen.getByRole('button', { name: 'Add item' }))).toBe(false));
  await fireEvent.press(button('Add item'));
  await pick('Product', 'Paracetamol 500mg');
  await screen.findByText(/^B-NEAR · exp /);
};
const addItem = async (qty: string) => {
  await openItem();
  await fireEvent.changeText(screen.getByLabelText('Quantity'), qty);
  await fireEvent.press(button('Add to sale'));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Add to sale' })).toBeNull());
};
const completeSale = async () => {
  await fireEvent.press(button('Next: Payment →'));
  await fireEvent.press(await screen.findByRole('button', { name: 'Complete Sale' }));
  await waitFor(() => expect(h.callsTo('POST', '/sales')).toHaveLength(1));
  return h.callsTo('POST', '/sales')[0].body as { items: { manualAllocations?: { batchId: string; quantity: number }[] }[]; paymentStatus: string; amountPaid: number; paymentMethod: string };
};

describe('New Sale, screen 1 (sale and line items)', () => {
  it('shows the header, the sale details and a fixed branch for a branch user; Next is disabled without items', async () => {
    await h.wrap(<SaleForm />);
    expect(await screen.findByText('New Sale')).toBeTruthy();
    expect(await screen.findByText('Selling from Main')).toBeTruthy();
    expect(screen.getByText('Walk-in (no customer)')).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('Demo Clerk')).toBeTruthy();
    expect(screen.getByText('Fixed')).toBeTruthy();
    expect(disabled(button('Next: Payment →'))).toBe(true);
  });

  it('payment method and customer are picked from their rows', async () => {
    await h.wrap(<SaleForm />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Payment method: Cash' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Card' }));
    expect(await screen.findByRole('button', { name: 'Payment method: Card' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Customer: / }));
    await fireEvent.press(await screen.findByText('Demo Customer One'));
    expect(await screen.findByRole('button', { name: 'Customer: Demo Customer One' })).toBeTruthy();
  });
});

describe('New Sale, screen 2 (Add item)', () => {
  it('pre-selects the nearest-expiry batch with its stock, and it can be changed', async () => {
    await h.wrap(<SaleForm />);
    await openItem();
    expect(screen.getByText('In stock: 55 · nearest expiry')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Batch'));
    await fireEvent.press(await screen.findByRole('button', { name: /^B-FAR · exp .* · 50$/ }));
    expect(await screen.findByText(/^B-FAR · exp /)).toBeTruthy();
    expect(screen.getByText('In stock: 55 · this batch: 50')).toBeTruthy();
  });

  it('shows the checks live, like the web, and Add to sale stays disabled while one fails', async () => {
    await h.wrap(<SaleForm />);
    await openItem();
    expect(disabled(button('Add to sale'))).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '111111110');
    expect(await screen.findByText('Only 55 in stock')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '10');
    expect(screen.queryByText('Only 55 in stock')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Unit price'), '8');
    expect(await screen.findByText('Price after discount (8.00) is below the cost price 15.00')).toBeTruthy();
    expect(disabled(button('Add to sale'))).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Unit price'), '20');
    await fireEvent.changeText(screen.getByLabelText('Discount %'), '120');
    expect(await screen.findByText('Disc % must be 0-100')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Discount %'), '');
    await fireEvent.changeText(screen.getByLabelText('Tax %'), '101');
    expect(await screen.findByText('Tax % must be 0-100')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Tax %'), '');
    expect(disabled(button('Add to sale'))).toBe(false);
    expect(screen.getByText('200.00')).toBeTruthy(); // line total 10 × 20
  });

  it('the price is the list price (TP) until typed; the stepper changes the quantity', async () => {
    await h.wrap(<SaleForm />);
    await openItem();
    expect(screen.getByLabelText('Unit price').props.value).toBe('18');
    await fireEvent.press(button('Increase quantity'));
    await fireEvent.press(button('Increase quantity'));
    expect(screen.getByLabelText('Quantity').props.value).toBe('2');
    await fireEvent.press(button('Decrease quantity'));
    expect(screen.getByLabelText('Quantity').props.value).toBe('1');
  });

  it('discount is locked without sales:discount', async () => {
    h.me = makeUser(['sales:create', 'sales:read', 'products:read', 'inventory:read'], { tenantRole: TenantRole.TENANT_USER, branchId: 'b1' });
    await h.wrap(<SaleForm />);
    await openItem();
    expect(screen.getByLabelText('Discount %').props.editable).toBe(false);
  });

  it('an added item becomes a card with its batch, tiles and total; it can be edited and removed', async () => {
    await h.wrap(<SaleForm />);
    await addItem('3');
    expect(screen.getByText(/^B-NEAR · exp /)).toBeTruthy();
    expect(screen.getAllByText('54.00')).toHaveLength(2); // line total 3 × 18, and the grand total
    await fireEvent.press(button('Edit Paracetamol 500mg'));
    expect(await screen.findByText('Edit item')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '4');
    await fireEvent.press(button('Update item'));
    await waitFor(() => expect(screen.queryByText('Edit item')).toBeNull());
    expect(screen.getAllByText('72.00').length).toBeGreaterThan(0);
    await fireEvent.press(button('Remove Paracetamol 500mg'));
    expect(await screen.findByText(/No items added yet/)).toBeTruthy();
  });
});

describe('New Sale, screen 3 (Payment) and submit', () => {
  it('sends the pre-selected nearest-expiry batch', async () => {
    await h.wrap(<SaleForm />);
    await addItem('3');
    const body = await completeSale();
    expect(body.items[0].manualAllocations).toEqual([{ batchId: 'bt-near', quantity: 3 }]);
    expect(body.paymentMethod).toBe('CASH');
  });

  it('a quantity larger than the pre-selected batch continues into the next batch by expiry', async () => {
    await h.wrap(<SaleForm />);
    await addItem('8');
    const body = await completeSale();
    expect(body.items[0].manualAllocations).toEqual([{ batchId: 'bt-near', quantity: 5 }, { batchId: 'bt-far', quantity: 3 }]);
  });

  it('shows the summary; Paid fills the total, Unpaid sets 0, Partial keeps what is typed; balance due follows', async () => {
    await h.wrap(<SaleForm />);
    await addItem('2');
    await fireEvent.press(button('Next: Payment →'));
    expect(await screen.findByText('1 line · 2 units')).toBeTruthy();
    expect(screen.getByLabelText('Amount paid').props.value).toBe('0');
    await fireEvent.press(button('Payment status: Paid'));
    await waitFor(() => expect(screen.getByLabelText('Amount paid').props.value).toBe('36.00'));
    await fireEvent.press(button('Payment status: Unpaid'));
    await waitFor(() => expect(screen.getByLabelText('Amount paid').props.value).toBe('0'));
    await fireEvent.press(button('Payment status: Partial'));
    await fireEvent.changeText(screen.getByLabelText('Amount paid'), '10');
    expect(screen.getByText('26.00')).toBeTruthy(); // balance due 36 − 10
    await fireEvent.press(button('Complete Sale'));
    await waitFor(() => expect(h.callsTo('POST', '/sales')).toHaveLength(1));
    const body = h.callsTo('POST', '/sales')[0].body as { paymentStatus: string; amountPaid: number };
    expect([body.paymentStatus, body.amountPaid]).toEqual(['PARTIAL', 10]);
  });

  it('a partial payment needs an amount above 0 (nothing is sent)', async () => {
    await h.wrap(<SaleForm />);
    await addItem('2');
    await fireEvent.press(button('Next: Payment →'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Payment status: Partial' }));
    await fireEvent.press(button('Complete Sale'));
    expect(await screen.findByText('Enter the amount paid for a partial payment')).toBeTruthy();
    expect(h.callsTo('POST', '/sales')).toHaveLength(0);
  });

  it('after a sale the form is ready for the next one', async () => {
    await h.wrap(<SaleForm />);
    await addItem('1');
    await completeSale();
    expect(await screen.findByText(/No items added yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Complete Sale' })).toBeNull();
  });
});

describe('Edit Sale', () => {
  const sale = {
    id: 's9', branchId: 'b1', invoiceNumber: 'INV-0009', customerId: 'c1', customerName: 'Demo Customer One', paymentMethod: 'CASH', paymentStatus: 'UNPAID', orderBookerId: 'u1', orderBookerName: 'Demo Clerk',
    items: [{ productId: 'p1', productName: 'Paracetamol 500mg', quantity: 2, unitPrice: 18, allocationMode: 'MANUAL', batchAllocations: [{ batchId: 'bt-near', batchNumber: 'B-NEAR', expiryDate: inDays(60), quantity: 2 }] }],
  } as unknown as Sale;

  it('saves directly with "Save changes" (no payment step) and goes back', async () => {
    h.routes['PATCH /sales/s9'] = () => ({ body: { ...sale } });
    await h.wrap(<SaleForm editSale={sale} />);
    expect(await screen.findByText('Edit Sale')).toBeTruthy();
    expect(screen.getByText('Invoice INV-0009')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Payment method/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next: Payment →' })).toBeNull();
    await fireEvent.press(button('Save changes'));
    await waitFor(() => expect(h.callsTo('PATCH', '/sales/s9')).toHaveLength(1));
    expect(h.callsTo('PATCH', '/sales/s9')[0].body).toEqual({ customerId: 'c1', items: [{ productId: 'p1', quantity: 2, unitPrice: 18, manualAllocations: [{ batchId: 'bt-near', quantity: 2 }] }] });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
