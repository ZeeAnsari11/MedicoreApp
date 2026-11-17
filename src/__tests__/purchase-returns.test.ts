import {
  buildPurchaseReturnRequest,
  buildPurchaseReturnRows,
  canReturnPurchase,
  defaultReturnChoices,
  fullReturnSelection,
  returnFigures,
  returnQuantitiesInvalid,
  settlementFootnote,
} from '@/features/purchases/purchase-returns';
import { PaymentMethod, PaymentStatus, ReturnReasonCode, ReturnSettlementMode, ReturnStatus, type Purchase, type PurchaseReturn } from '@/types/medicore';

const purchase = {
  id: 'pu1',
  branchId: 'b1',
  status: 'RECEIVED',
  grandTotal: 1100,
  amountPaid: 1000,
  returnedTotal: 0,
  refundedTotal: 0,
  returnStatus: ReturnStatus.NONE,
  paymentStatus: PaymentStatus.PARTIAL,
  items: [
    { productId: 'p1', productName: 'Panadol', batchNumber: 'B-1', batchId: 'bt1', expiryDate: '2027-01-31', quantity: 10, purchasePrice: 100, sellingPrice: 120, lineTotal: 1000 },
    { productId: 'p2', productName: 'Brufen', batchNumber: 'B-2', batchId: 'bt2', expiryDate: '2027-02-28', quantity: 2, purchasePrice: 50, sellingPrice: 60, lineTotal: 100 },
  ],
} as unknown as Purchase;

const earlier = [{ items: [{ productId: 'p1', batchId: 'bt1', quantity: 4 }] }] as unknown as PurchaseReturn[];

describe('return rows', () => {
  it('subtracts earlier returns per batch and prices a unit at lineTotal / quantity', () => {
    const rows = buildPurchaseReturnRows(purchase, earlier);
    expect(rows[0]).toMatchObject({ key: 'bt1', quantity: 10, returned: 4, returnable: 6, unitAmount: 100 });
    expect(rows[1]).toMatchObject({ key: 'bt2', returned: 0, returnable: 2, unitAmount: 50 });
  });

  it('never goes below zero', () => {
    const over = [{ items: [{ productId: 'p2', batchId: 'bt2', quantity: 5 }] }] as unknown as PurchaseReturn[];
    expect(buildPurchaseReturnRows(purchase, over)[1].returnable).toBe(0);
  });
});

describe('quantity validation (web message rule: 1 .. returnable)', () => {
  const rows = buildPurchaseReturnRows(purchase, earlier);
  it('flags quantities below 1 or above the returnable amount, only for ticked rows', () => {
    const ticked = new Set(['bt1']);
    expect(returnQuantitiesInvalid(rows, ticked, { bt1: '6' })).toBe(false);
    expect(returnQuantitiesInvalid(rows, ticked, { bt1: '7' })).toBe(true);
    expect(returnQuantitiesInvalid(rows, ticked, { bt1: '0.5' })).toBe(true);
    expect(returnQuantitiesInvalid(rows, ticked, { bt1: '' })).toBe(true);
    expect(returnQuantitiesInvalid(rows, new Set(), { bt1: '99' })).toBe(false);
  });
});

describe('figures', () => {
  const rows = buildPurchaseReturnRows(purchase, []);

  it('adjusts a return that fits inside the outstanding balance', () => {
    // outstanding = 1100 − 1000 = 100; returning 1 × 50 stays inside it.
    const f = returnFigures(purchase, rows, new Set(['bt2']), { bt2: '1' }, ReturnSettlementMode.ADJUST);
    expect(f).toMatchObject({ returnTotal: 50, outstanding: 100, applied: 50, excess: 0, refund: 0, newNet: 1050, newPaid: 1000, newOutstanding: 50 });
    expect(settlementFootnote(ReturnSettlementMode.ADJUST, f, String)).toBe('Adjusted against the outstanding balance.');
  });

  it('keeps the excess as vendor credit by default, or refunds it on request', () => {
    const ticked = new Set(['bt1']);
    const qty = { bt1: '10' };
    const credit = returnFigures(purchase, rows, ticked, qty, ReturnSettlementMode.ADJUST);
    expect(credit).toMatchObject({ returnTotal: 1000, applied: 100, excess: 900, refund: 0, newNet: 100, newPaid: 1000, newOutstanding: 0 });
    expect(settlementFootnote(ReturnSettlementMode.ADJUST, credit, String)).toBe('Adjusted against outstanding; excess 900 becomes vendor credit.');
    const refund = returnFigures(purchase, rows, ticked, qty, ReturnSettlementMode.REFUND);
    expect(refund).toMatchObject({ excess: 900, refund: 900, newPaid: 100 });
    expect(settlementFootnote(ReturnSettlementMode.REFUND, refund, String)).toBe('Adjusted against outstanding; 900 refunded now.');
  });
});

describe('request body', () => {
  const rows = buildPurchaseReturnRows(purchase, []);

  it('sends reason code and label, trimmed notes, the purchase branch and no returnDate; plain ADJUST when nothing is refunded', () => {
    const body = buildPurchaseReturnRequest(purchase, rows, new Set(['bt2']), { bt2: '1' }, { ...defaultReturnChoices(), reasonCode: ReturnReasonCode.DAMAGED, notes: '  box crushed ' }, 0);
    expect(body).toEqual({
      purchaseId: 'pu1',
      branchId: 'b1',
      reasonCode: 'DAMAGED',
      reason: 'Damaged',
      notes: 'box crushed',
      settlement: { mode: 'ADJUST' },
      items: [{ productId: 'p2', batchId: 'bt2', quantity: 1 }],
    });
    expect(body).not.toHaveProperty('returnDate');
  });

  it('includes the refund mode and method only when money is refunded', () => {
    const body = buildPurchaseReturnRequest(purchase, rows, new Set(['bt1']), { bt1: '10' }, { ...defaultReturnChoices(), mode: ReturnSettlementMode.REFUND, method: PaymentMethod.BANK_TRANSFER }, 900);
    expect(body.settlement).toEqual({ mode: 'REFUND', method: 'BANK_TRANSFER' });
    expect(body.notes).toBeUndefined();
    expect(body.reasonCode).toBe('OTHER');
  });

  it('a full return takes every returnable batch at its returnable quantity', () => {
    const partly = buildPurchaseReturnRows(purchase, earlier);
    const { ticked, qty } = fullReturnSelection(partly);
    const body = buildPurchaseReturnRequest(purchase, partly, ticked, qty, defaultReturnChoices(), 0);
    expect(body.items).toEqual([{ productId: 'p1', batchId: 'bt1', quantity: 6 }, { productId: 'p2', batchId: 'bt2', quantity: 2 }]);
  });
});

describe('who may return', () => {
  it('needs the permission, a non-cancelled purchase and something left to return', () => {
    expect(canReturnPurchase(purchase, true)).toBe(true);
    expect(canReturnPurchase(purchase, false)).toBe(false);
    expect(canReturnPurchase({ ...purchase, status: 'CANCELLED' } as unknown as Purchase, true)).toBe(false);
    expect(canReturnPurchase({ ...purchase, returnStatus: ReturnStatus.FULL }, true)).toBe(false);
  });
});
