import { PaymentMethod } from '@/types/medicore';
import {
  accountBalance, amountError, applyRowErrors, buildRow, buildSaveRequest, draftKey, money, newBatchId, parseDraft, rowErrorsOf,
  buildUpdateRequest, normalizeTransactionNumber, rowsOfTransaction, runningBalances, serializeDraft, sheetTotal, todayLocal, validateRows, VOIDED_REASON,
  type LookupInvoice, type SheetRow,
} from '@/features/cash-receipt/sheet';

const inv = (over: Partial<LookupInvoice> = {}): LookupInvoice => ({ id: 'i1', invoiceNumber: '0001', saleDate: '2026-11-10T00:00:00.000Z', customerId: 'c1', customerName: 'Ali', grandTotal: 1000, netTotal: 1000, received: 400, balance: 600, payable: true, customerBalance: 2000, ...over });
const row = (over: Partial<SheetRow> = {}): SheetRow => ({ key: 'k1', invoiceId: 'i1', invoiceNumber: '0001', customerId: 'c1', customerName: 'Ali', customerBalance: 2000, saleDate: '2026-11-10', voucherAmount: 1000, received: 400, balance: 600, amount: '100', ...over });

describe('amountError (web messages)', () => {
  it.each([['', 'Enter an amount greater than 0'], ['0', 'Enter an amount greater than 0'], ['-5', 'Enter an amount greater than 0'], ['abc', 'Enter an amount greater than 0'], ['10.123', 'Max 2 decimals'], ['600.01', 'Cannot exceed the balance of 600.00']])('%p → %s', (raw, msg) => {
    expect(amountError(raw, 600)).toBe(msg);
  });
  it('accepts up to the balance with two decimals', () => {
    expect(amountError('600', 600)).toBeUndefined();
    expect(amountError('0.5', 600)).toBeUndefined();
    expect(amountError('599.99', 600)).toBeUndefined();
  });
  it('formats money with thousands separators', () => expect(money(1234.5)).toBe('1,234.50'));
});

describe('buildRow', () => {
  it('needs a voucher, rejects duplicates and paid invoices, then validates the amount', () => {
    expect(buildRow(null, '10', [])).toEqual({ ok: false, error: 'Select a voucher first' });
    expect(buildRow(inv(), '10', [row()])).toEqual({ ok: false, error: 'Already in sheet' });
    expect(buildRow(inv({ payable: false, balance: 0 }), '10', [])).toEqual({ ok: false, error: 'Already paid' });
    expect(buildRow(inv(), '700', [])).toEqual({ ok: false, error: 'Cannot exceed the balance of 600.00' });
  });
  it('builds a row from the lookup (invoice amount = netTotal)', () => {
    const r = buildRow(inv({ netTotal: 900 }), '50', []);
    expect(r.ok && r.row).toMatchObject({ invoiceId: 'i1', customerId: 'c1', voucherAmount: 900, received: 400, balance: 600, amount: '50', customerBalance: 2000 });
  });
});

describe('running balances', () => {
  it('subtracts earlier rows of the same customer only', () => {
    const rows = [row({ key: 'a', invoiceId: 'i1', amount: '100' }), row({ key: 'b', invoiceId: 'i2', amount: '50' }), row({ key: 'c', invoiceId: 'i3', customerId: 'c2', customerBalance: 300, amount: '300' })];
    expect(runningBalances(rows)).toEqual([{ custBal: 2000, finalBal: 1900 }, { custBal: 1900, finalBal: 1850 }, { custBal: 300, finalBal: 0 }]);
  });
  it('account balance tile nets what the sheet already receipts from that customer', () => {
    expect(accountBalance(null, [])).toBeNull();
    expect(accountBalance(inv(), [])).toBe(2000);
    expect(accountBalance(inv({ id: 'i9', customerBalance: 9999 }), [row({ amount: '150' })])).toBe(1850);
  });
  it('totals the sheet to two decimals', () => expect(sheetTotal([row({ amount: '0.1' }), row({ key: 'k2', amount: '0.2' })])).toBe(0.3));
});

describe('validate and save request', () => {
  it('flags every bad row', () => {
    const { rows, hasErrors } = validateRows([row({ amount: '' }), row({ key: 'k2', amount: '50' })]);
    expect(hasErrors).toBe(true);
    expect(rows.map((r) => r.error)).toEqual(['Enter an amount greater than 0', undefined]);
  });
  it('sends only batchId, local date, CASH and invoice/amount pairs (no branchId, like the web)', () => {
    expect(buildSaveRequest([row({ amount: '75.5' })], 'b-1', new Date(2026, 10, 16, 23, 30))).toEqual({ batchId: 'b-1', date: '2026-11-16', method: 'CASH', rows: [{ invoiceId: 'i1', amount: 75.5 }] });
    expect(todayLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('maps server reasons onto rows and clears the rest', () => {
    const out = applyRowErrors([row({ error: 'old' }), row({ key: 'k2', invoiceId: 'i2' })], [{ invoiceId: 'i2', reason: 'Invoice is already paid' }]);
    expect(out.map((r) => r.error)).toEqual([undefined, 'Invoice is already paid']);
  });
  it('reads errors[] from a rejection body only when present', () => {
    expect(rowErrorsOf({ message: 'x', errors: [{ invoiceId: 'i1', reason: 'r' }] })).toHaveLength(1);
    expect(rowErrorsOf({ message: 'x' })).toEqual([]);
    expect(rowErrorsOf(undefined)).toEqual([]);
  });
});

describe('batch id and draft', () => {
  it('is a UUID, and different each time', () => {
    const a = newBatchId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newBatchId()).not.toBe(a);
  });
  it('round-trips a draft, drops row errors, ignores junk and empty sheets', () => {
    const raw = serializeDraft({ rows: [row({ error: 'x' })], batchId: 'b', branchId: 'br1' });
    expect(parseDraft(raw)).toEqual({ rows: [{ ...row(), error: undefined }], batchId: 'b', branchId: 'br1' });
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('{bad')).toBeNull();
    expect(parseDraft(serializeDraft({ rows: [], batchId: 'b', branchId: null }))).toBeNull();
  });
  it('is keyed by tenant and user', () => expect(draftKey('t1', 'u1')).not.toBe(draftKey('t1', 'u2')));
});

describe('transactions', () => {
  it.each([['T-0001', 'T-0001'], ['t-1', 'T-0001'], ['1', 'T-0001'], [' T0042 ', 'T-0042'], ['T-12345', 'T-12345']])('%p → %s', (raw, out) => {
    expect(normalizeTransactionNumber(raw)).toBe(out);
  });
  it.each([[''], ['CR-000001'], ['T-'], ['abc'], ['T-1x']])('%p is not a transaction number', (raw) => {
    expect(normalizeTransactionNumber(raw)).toBeNull();
  });

  const tx = {
    id: 'r1', transactionNumber: 'T-0001', voucherNumber: 'CR-000001', branchId: 'b1', version: 3, date: '2026-11-18T00:00:00.000Z', method: PaymentMethod.CASH, total: 150,
    rows: [
      { entryId: 'e1', invoiceId: 'i1', invoiceNumber: '0001', customerId: 'c1', customerName: 'Ali', saleDate: '2026-11-10', customerBalance: 2000, voucherAmount: 1000, received: 400, balance: 700, amount: 100, paymentVoided: false },
      { entryId: 'e2', invoiceId: 'i2', invoiceNumber: '0002', customerId: 'c1', customerName: 'Ali', saleDate: '2026-11-10', customerBalance: 2000, voucherAmount: 500, received: 0, balance: 50, amount: 50, paymentVoided: true },
    ],
  };

  it('turns a transaction into sheet rows keyed by entry, with the editable maximum as the balance', () => {
    const rows = rowsOfTransaction(tx);
    expect(rows[0]).toMatchObject({ key: 'e1', entryId: 'e1', invoiceId: 'i1', balance: 700, amount: '100', error: undefined });
    expect(rows[1].error).toBe(VOIDED_REASON);
  });

  it('builds the edit request: loaded entries keep their entryId, added rows have none', () => {
    const rows = [...rowsOfTransaction(tx).slice(0, 1), row({ key: 'new', invoiceId: 'i9', amount: '25' })];
    expect(buildUpdateRequest(rows, 3)).toEqual({
      expectedVersion: 3,
      rows: [{ entryId: 'e1', invoiceId: 'i1', amount: 100 }, { entryId: undefined, invoiceId: 'i9', amount: 25 }],
    });
  });

  it('keeps the voided-payment error on re-validation but still checks amounts on the others', () => {
    const rows = rowsOfTransaction(tx).map((r) => (r.entryId === 'e1' ? { ...r, amount: '9999' } : r));
    const checked = validateRows(rows);
    expect(checked.hasErrors).toBe(true);
    expect(checked.rows[0].error).toMatch(/Cannot exceed the balance of 700.00/);
    expect(checked.rows[1].error).toBe(VOIDED_REASON);
  });
});
