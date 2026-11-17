import { z } from 'zod';

import { parseNumber } from '@/lib/numbers';
import type { CreateProductRequest, Product, UpdateProductRequest } from '@/types/medicore';

const priceField = z
  .string()
  .trim()
  .min(1, 'Required')
  .refine((v) => parseNumber(v) !== null, 'Enter a number')
  .refine((v) => (parseNumber(v) ?? 0) >= 0, 'Must be ≥ 0');

const minStockField = z
  .string()
  .trim()
  .refine((v) => v === '' || parseNumber(v) !== null, 'Enter a number')
  .refine((v) => v === '' || (parseNumber(v) ?? 0) >= 0, 'Must be ≥ 0');

/**
 * Same rules as the web form and the backend (`assertPriceRules`): TP ≥ CP and RP ≥ TP. `requireVendor` is true when the
 * create form shows the Vendor field (web: shown for create when the user has vendors:create).
 */
export function createProductSchema({ requireVendor }: { requireVendor: boolean }) {
  return z
    .object({
      branchId: z.string().min(1, 'Branch is required'),
      name: z.string().trim().min(2, 'Name must be at least 2 characters'),
      genericName: z.string().trim().min(1, 'Generic name is required'),
      manufacturerId: z.string().min(1, 'Manufacturer is required'),
      categoryId: z.string().optional(),
      barcode: z.string().optional(),
      unit: z.string().trim().min(1, 'Unit is required'),
      packing: z.string().optional(),
      tp: priceField,
      cp: priceField,
      rp: priceField,
      minStockLevel: minStockField,
      vendorId: z.string().optional(),
    })
    .superRefine((v, ctx) => {
      const tp = parseNumber(v.tp);
      const cp = parseNumber(v.cp);
      const rp = parseNumber(v.rp);
      if (tp !== null && cp !== null && tp < cp) ctx.addIssue({ code: 'custom', path: ['tp'], message: `Must be ≥ CP (${cp})` });
      if (rp !== null && tp !== null && rp < tp) ctx.addIssue({ code: 'custom', path: ['rp'], message: `Must be ≥ TP (${tp})` });
      if (requireVendor && !v.vendorId) ctx.addIssue({ code: 'custom', path: ['vendorId'], message: 'Vendor is required' });
    });
}
export type ProductFormValues = z.infer<ReturnType<typeof createProductSchema>>;

const asText = (n: number | undefined) => (n === undefined || n === null ? '' : String(n));

export const productDefaults = (p?: Product, defaultBranchId = ''): ProductFormValues => ({
  branchId: p?.branchId ?? defaultBranchId,
  name: p?.name ?? '',
  genericName: p?.genericName ?? '',
  manufacturerId: p?.manufacturerId ?? '',
  categoryId: p?.categoryId ?? '',
  barcode: p?.barcode ?? '',
  unit: p?.unit ?? '',
  packing: p?.packing ?? '',
  tp: asText(p?.tp),
  cp: asText(p?.cp),
  rp: asText(p?.rp),
  minStockLevel: asText(p?.minStockLevel),
  vendorId: '',
});

function common(values: ProductFormValues) {
  const minStock = parseNumber(values.minStockLevel);
  return {
    name: values.name,
    genericName: values.genericName,
    manufacturerId: values.manufacturerId,
    categoryId: values.categoryId ? values.categoryId : undefined,
    barcode: values.barcode?.trim() || undefined,
    unit: values.unit,
    packing: values.packing?.trim() ? values.packing : undefined,
    minStockLevel: minStock === null ? undefined : minStock,
  };
}

export function buildCreateProduct(values: ProductFormValues): CreateProductRequest {
  return {
    ...common(values),
    branchId: values.branchId,
    tp: Number(values.tp),
    cp: Number(values.cp),
    rp: Number(values.rp),
  };
}

/**
 * Edit payload. Without `products:edit_prices` the backend rejects any price field (403), so prices are omitted,
 * exactly as the web dialog does.
 */
export function buildUpdateProduct(values: ProductFormValues, { priceLocked }: { priceLocked: boolean }): UpdateProductRequest {
  const base = common(values);
  return priceLocked ? base : { ...base, tp: Number(values.tp), cp: Number(values.cp), rp: Number(values.rp) };
}
