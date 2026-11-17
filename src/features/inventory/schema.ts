import { z } from 'zod';

import { isValidIsoDate } from '@/lib/dates';
import { parseNumber } from '@/lib/numbers';
import type { Batch, CreateBatchAdjustmentRequest } from '@/types/medicore';

export const ADJUST_OPERATIONS = [
  { value: 'add', label: 'Add' },
  { value: 'subtract', label: 'Subtract' },
  { value: 'set', label: 'Set to' },
] as const;

const optionalPrice = (label: string) =>
  z
    .string()
    .optional()
    .superRefine((v, ctx) => {
      if (!v || !v.trim()) return;
      const n = parseNumber(v);
      if (n === null || n < 0) ctx.addIssue({ code: 'custom', message: `${label} must be 0 or more` });
    });

/** Mirrors the web adjustment dialog (quantity ≥ 1, batch + expiry required) plus the DTO's date and price rules. */
export const adjustmentSchema = z.object({
  branchId: z.string().min(1, 'Branch is required'),
  productId: z.string().min(1, 'Product is required'),
  batchNumber: z.string().trim().min(1, 'Batch number is required'),
  expiryDate: z.string().trim().refine(isValidIsoDate, 'Use a valid date (YYYY-MM-DD)'),
  operation: z.enum(['add', 'subtract', 'set']),
  quantity: z.string().superRefine((v, ctx) => {
    const n = parseNumber(v);
    if (n === null) ctx.addIssue({ code: 'custom', message: 'Quantity is required' });
    else if (n < 1) ctx.addIssue({ code: 'custom', message: 'Must be at least 1' });
  }),
  purchasePrice: optionalPrice('Purchase price'),
  sellingPrice: optionalPrice('Sale price'),
  reason: z.string().trim().optional(),
});
export type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

export const adjustmentDefaults = (opts: { branchId?: string; productId?: string; batch?: Pick<Batch, 'batchNumber' | 'expiryDate'> } = {}): AdjustmentFormValues => ({
  branchId: opts.branchId ?? '',
  productId: opts.productId ?? '',
  batchNumber: opts.batch?.batchNumber ?? '',
  expiryDate: opts.batch ? opts.batch.expiryDate.slice(0, 10) : '',
  operation: 'add',
  quantity: '',
  purchasePrice: '',
  sellingPrice: '',
  reason: '',
});

/** Optional prices and reason are left out when blank, so the backend applies its own defaults (the product's CP/TP). */
export function buildAdjustment(values: AdjustmentFormValues): CreateBatchAdjustmentRequest {
  const purchasePrice = parseNumber(values.purchasePrice);
  const sellingPrice = parseNumber(values.sellingPrice);
  return {
    productId: values.productId,
    branchId: values.branchId,
    batchNumber: values.batchNumber.trim(),
    expiryDate: values.expiryDate.trim(),
    operation: values.operation,
    quantity: parseNumber(values.quantity) as number,
    purchasePrice: purchasePrice ?? undefined,
    sellingPrice: sellingPrice ?? undefined,
    reason: values.reason && values.reason.trim() ? values.reason.trim() : undefined,
  };
}
