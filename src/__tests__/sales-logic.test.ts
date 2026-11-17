import { buildReturnRequest, buildReturnRows, validateReturn } from '@/features/sales/returns';
import { allocateAcrossBatches, belowCostFloor, buildSaleItems, validateSaleDraft, type SaleLine } from '@/features/sales/sale-lines';
import { PaymentMethod, ReturnCondition, ReturnReasonCode, ReturnSettlementMode } from '@/types/medicore';
import type { Batch, Sale, SaleReturn } from '@/types/medicore';

const line = (over: Partial<SaleLine> = {}): SaleLine => ({ key: 'k', productId: 'p1', productName: 'Panadol', quantity: 2, unitPrice: 10, priceExplicit: false, ...over });

describe('buildSaleItems', () => {
  it('leaves price and batches to the backend unless the user chose them', () => {
    const [item] = buildSaleItems([line()]);
    expect(item).not.toHaveProperty('unitPrice');
    expect(item).not.toHaveProperty('manualAllocations');
  });
  it('sends an explicit price and manual batches', () => {
    const [item] = buildSaleItems([line({ priceExplicit: true, unitPrice: 12, allocations: [{ batchId: 'b1', batchNumber: 'B1', quantity: 2 }] })]);
    expect(item.unitPrice).toBe(12);
    expect(item.manualAllocations).toEqual([{ batchId: 'b1', quantity: 2 }]);
  });
});

describe('validateSaleDraft', () => {
  it('requires a branch, a line, and an amount for partial payment', () => {
    expect(validateSaleDraft({ branchId: null, lines: [line()] })).toBe('Select a branch');
    expect(validateSaleDraft({ branchId: 'b', lines: [] })).toBe('Add at least one line item');
    expect(validateSaleDraft({ branchId: 'b', lines: [line()], paymentStatus: 'PARTIAL' as never, amountPaid: '' })).toMatch(/amount paid/);
    expect(validateSaleDraft({ branchId: 'b', lines: [line()], paymentStatus: 'PARTIAL' as never, amountPaid: '5' })).toBeNull();
    expect(validateSaleDraft({ branchId: 'b', lines: [line()], paymentStatus: 'PAID' as never })).toBeNull();
  });
});

describe('allocation and cost floor', () => {
  const batches = [{ id: 'a', quantity: 3 }, { id: 'b', quantity: 5 }] as Batch[];
  it('spills a manual batch choice into the next batches', () => {
    const { allocations, unmet } = allocateAcrossBatches(batches, 'a', 6);
    expect(allocations.map((x) => [x.batch.id, x.quantity])).toEqual([['a', 3], ['b', 3]]);
    expect(unmet).toBe(0);
    expect(allocateAcrossBatches(batches, 'a', 10).unmet).toBe(2);
  });
  it('flags a net price under cost', () => {
    expect(belowCostFloor(10, 20, 9)).toBe(true);
    expect(belowCostFloor(10, 0, 9)).toBe(false);
  });
});

describe('returns', () => {
  const sale = { items: [{ productId: 'p1', productName: 'Panadol', batchAllocations: [{ batchId: 'b1', batchNumber: 'B1', quantity: 5 }] }] } as unknown as Sale;
  const prior = [{ items: [{ batchAllocations: [{ batchId: 'b1', quantity: 2 }] }] }] as unknown as SaleReturn[];
  const rows = buildReturnRows(sale, prior);

  it('subtracts earlier returns from what can still come back', () => {
    expect(rows[0]).toMatchObject({ original: 5, returned: 2, returnable: 3 });
  });
  it('validates ticked quantities', () => {
    expect(validateReturn(rows, {})).toMatch(/at least one/);
    expect(validateReturn(rows, { b1: 4 })).toMatch(/only 3/);
    expect(validateReturn(rows, { b1: 3 })).toBeNull();
  });
  it('sends settlement as a mode only, with the method for refunds', () => {
    const base = { qty: { b1: 1 }, condition: {}, reasonCode: ReturnReasonCode.DAMAGED, notes: '', method: PaymentMethod.CASH };
    const adjust = buildReturnRequest('br', rows, { ...base, mode: ReturnSettlementMode.ADJUST });
    expect(adjust.settlement).toEqual({ mode: ReturnSettlementMode.ADJUST });
    expect(adjust.items[0].batchAllocations[0]).toEqual({ batchId: 'b1', quantity: 1, condition: ReturnCondition.RESTOCK });
    const refund = buildReturnRequest('br', rows, { ...base, mode: ReturnSettlementMode.REFUND });
    expect(refund.settlement).toEqual({ mode: ReturnSettlementMode.REFUND, method: PaymentMethod.CASH });
    expect(buildReturnRequest('br', rows, { ...base, mode: ReturnSettlementMode.ADJUST }, false).items[0].batchAllocations[0].quantity).toBe(3);
  });
});
