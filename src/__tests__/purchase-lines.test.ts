import {
  amountForStatus,
  buildPriceChangeRows,
  buildPurchaseItems,
  emptyLine,
  estimateGrandTotal,
  estimateLineTotal,
  lineError,
  linesFromPurchase,
  outstandingOf,
  paymentProblem,
  validatePurchaseDraft,
  type PurchaseLine,
} from '@/features/purchases/purchase-lines';
import { PaymentStatus, type Purchase } from '@/types/medicore';

const TODAY = '2026-11-16';
const line = (over: Partial<PurchaseLine> = {}): PurchaseLine => ({
  ...emptyLine(),
  productId: 'p1',
  productName: 'Panadol',
  batchNumber: 'B-1',
  expiryDate: '2027-01-31',
  quantity: '10',
  purchasePrice: '100',
  sellingPrice: '120',
  ...over,
});

describe('line validation (web messages)', () => {
  it('accepts a complete line', () => {
    expect(lineError(line(), TODAY)).toBeNull();
  });

  it('reports every missing field, joined with " · "', () => {
    const msg = lineError(emptyLine(), TODAY)!;
    expect(msg).toBe('Select a product · Batch # is required · Expiry is required · Qty must be greater than 0 · Price must be 0 or more · Sale price must be 0 or more');
  });

  it('rejects an expiry in the past but allows today', () => {
    expect(lineError(line({ expiryDate: '2026-11-15' }), TODAY)).toBe('Expiry cannot be in the past');
    expect(lineError(line({ expiryDate: TODAY }), TODAY)).toBeNull();
  });

  it('checks quantity, prices and percentages', () => {
    expect(lineError(line({ quantity: '0' }), TODAY)).toBe('Qty must be greater than 0');
    expect(lineError(line({ purchasePrice: '-1' }), TODAY)).toBe('Price must be 0 or more');
    expect(lineError(line({ sellingPrice: 'abc' }), TODAY)).toBe('Sale price must be 0 or more');
    expect(lineError(line({ discountPercent: '101' }), TODAY)).toBe('Disc % must be 0-100');
    expect(lineError(line({ taxPercent: '-5' }), TODAY)).toBe('Tax % must be 0-100');
    expect(lineError(line({ purchasePrice: '0', discountPercent: '', taxPercent: '' }), TODAY)).toBeNull();
  });
});

describe('draft validation', () => {
  it('needs a vendor, a date and at least one valid line', () => {
    expect(validatePurchaseDraft({ vendorId: '', purchaseDate: TODAY, lines: [line()] }, TODAY)).toBe('Select a vendor before receiving this purchase.');
    expect(validatePurchaseDraft({ vendorId: 'v1', purchaseDate: '', lines: [line()] }, TODAY)).toBe('Purchase date is required');
    expect(validatePurchaseDraft({ vendorId: 'v1', purchaseDate: TODAY, lines: [] }, TODAY)).toBe('Add at least one line');
    expect(validatePurchaseDraft({ vendorId: 'v1', purchaseDate: TODAY, lines: [line({ batchNumber: ' ' })] }, TODAY)).toBe('Panadol: Batch # is required');
    expect(validatePurchaseDraft({ vendorId: 'v1', purchaseDate: TODAY, lines: [line()] }, TODAY)).toBeNull();
  });
});

describe('estimates and request building', () => {
  it('estimates qty × price × (1 − disc) × (1 + tax)', () => {
    expect(estimateLineTotal(line({ quantity: '10', purchasePrice: '100', discountPercent: '10', taxPercent: '5' }))).toBeCloseTo(945, 5);
    expect(estimateGrandTotal([line(), line({ quantity: '1', purchasePrice: '50' })])).toBe(1050);
  });

  it('sends numbers, trims text, and omits blank discount/tax', () => {
    expect(buildPurchaseItems([line({ batchNumber: ' B-1 ', expiryDate: ' 2027-01-31 ' })])).toEqual([
      { productId: 'p1', batchNumber: 'B-1', expiryDate: '2027-01-31', quantity: 10, purchasePrice: 100, sellingPrice: 120 },
    ]);
    expect(buildPurchaseItems([line({ discountPercent: '0', taxPercent: '17' })])[0]).toMatchObject({ discountPercent: 0, taxPercent: 17 });
  });
});

describe('price-decrease rows', () => {
  it('uses the highest price entered per product and only lists drops below the vendor price', () => {
    const lines = [line({ productId: 'p1', purchasePrice: '90' }), line({ productId: 'p1', purchasePrice: '95' }), line({ productId: 'p2', productName: 'Brufen', purchasePrice: '60' }), line({ productId: 'p3', purchasePrice: '10' })];
    const rows = buildPriceChangeRows(lines, new Map([['p1', 100], ['p2', 50]]));
    expect(rows).toEqual([{ productId: 'p1', productName: 'Panadol', oldPrice: 100, newPrice: 95 }]);
  });

  it('is empty when no linked price exists or the price rises or stays', () => {
    expect(buildPriceChangeRows([line({ purchasePrice: '100' })], new Map([['p1', 100]]))).toEqual([]);
    expect(buildPriceChangeRows([line()], new Map())).toEqual([]);
  });
});

describe('payments', () => {
  const p = { grandTotal: 1000, amountPaid: 300, returnedTotal: 0, refundedTotal: 0 };

  it('outstanding = grand − returned − (paid − refunded), never negative', () => {
    expect(outstandingOf(p)).toBe(700);
    expect(outstandingOf({ ...p, returnedTotal: 200 })).toBe(500);
    expect(outstandingOf({ ...p, returnedTotal: 900, amountPaid: 300, refundedTotal: 0 })).toBe(0);
    expect(outstandingOf({ grandTotal: 100, amountPaid: 100 })).toBe(0);
  });

  it('guards the amount like the web dialog', () => {
    expect(paymentProblem('', 700)).toBe('Enter an amount greater than 0');
    expect(paymentProblem('0', 700)).toBe('Enter an amount greater than 0');
    expect(paymentProblem('700.01', 700)).toBeNull();
    expect(paymentProblem('701', 700)).toBe('Amount cannot exceed the outstanding 700.00.');
    expect(paymentProblem('250', 700)).toBeNull();
  });

  it('PAID fills the total, UNPAID is 0, PARTIAL keeps what was typed', () => {
    expect(amountForStatus(PaymentStatus.PAID, 1234.5, '0')).toBe('1234.5');
    expect(amountForStatus(PaymentStatus.UNPAID, 1234.5, '99')).toBe('0');
    expect(amountForStatus(PaymentStatus.PARTIAL, 1234.5, '99')).toBe('99');
  });
});

describe('edit form lines', () => {
  it('slices the expiry to a date and leaves blank discount/tax blank', () => {
    const purchase = {
      items: [{ productId: 'p1', productName: 'Panadol', batchNumber: 'B-1', expiryDate: '2027-01-31T00:00:00.000Z', quantity: 4, purchasePrice: 10, sellingPrice: 12, discountPercent: 0, taxPercent: 5, lineTotal: 42 }],
    } as unknown as Purchase;
    expect(linesFromPurchase(purchase)[0]).toMatchObject({ expiryDate: '2027-01-31', quantity: '4', purchasePrice: '10', discountPercent: '', taxPercent: '5' });
  });
});
