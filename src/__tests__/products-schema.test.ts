import { buildCreateProduct, buildUpdateProduct, createProductSchema, productDefaults, type ProductFormValues } from '@/features/products/schema';
import { ProductStatus } from '@/types/medicore';
import type { Product } from '@/types/medicore';

const valid = (over: Partial<ProductFormValues> = {}): ProductFormValues => ({
  ...productDefaults(undefined, 'b1'),
  name: 'Panadol 500mg',
  genericName: 'Paracetamol',
  manufacturerId: 'm1',
  unit: 'tablet',
  tp: '10',
  cp: '8',
  rp: '12',
  ...over,
});

const issues = (values: ProductFormValues, requireVendor = false) => {
  const r = createProductSchema({ requireVendor }).safeParse(values);
  if (r.success) return {};
  // The form shows the first error per field.
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[i.path.join('.')] ??= i.message;
  return out;
};

describe('product schema (mirrors web form + backend price rules)', () => {
  it('accepts a valid product', () => expect(issues(valid())).toEqual({}));

  it('requires branch, name (≥2), generic name, manufacturer, unit and prices', () => {
    const r = issues(valid({ branchId: '', name: 'A', genericName: ' ', manufacturerId: '', unit: '', tp: '', cp: '', rp: '' }));
    expect(Object.keys(r).sort()).toEqual(['branchId', 'cp', 'genericName', 'manufacturerId', 'name', 'rp', 'tp', 'unit']);
  });

  it('enforces TP ≥ CP and RP ≥ TP with the neighbour value in the message', () => {
    expect(issues(valid({ tp: '7', cp: '8' })).tp).toBe('Must be ≥ CP (8)');
    expect(issues(valid({ tp: '10', rp: '9' })).rp).toBe('Must be ≥ TP (10)');
    expect(issues(valid({ tp: '8', cp: '8', rp: '8' }))).toEqual({});
  });

  it('rejects negative and non-numeric prices and min stock', () => {
    expect(issues(valid({ tp: '-1' })).tp).toBe('Must be ≥ 0');
    expect(issues(valid({ cp: 'abc' })).cp).toBe('Enter a number');
    expect(issues(valid({ minStockLevel: '-3' })).minStockLevel).toBe('Must be ≥ 0');
    expect(issues(valid({ minStockLevel: '' }))).toEqual({});
  });

  it('requires a vendor only when the vendor field is shown', () => {
    expect(issues(valid(), true).vendorId).toBe('Vendor is required');
    expect(issues(valid({ vendorId: 'v1' }), true)).toEqual({});
    expect(issues(valid(), false)).toEqual({});
  });
});

describe('product payloads', () => {
  it('builds a create payload with numbers, trimmed barcode and no empty optionals', () => {
    const dto = buildCreateProduct(valid({ barcode: ' 123 ', categoryId: '', packing: '', minStockLevel: '5' }));
    expect(dto).toEqual({
      branchId: 'b1', name: 'Panadol 500mg', genericName: 'Paracetamol', manufacturerId: 'm1', categoryId: undefined,
      barcode: '123', unit: 'tablet', packing: undefined, minStockLevel: 5, tp: 10, cp: 8, rp: 12,
    });
  });

  const existing: Product = {
    id: 'p1', tenantId: 't', branchId: 'b1', createdAt: '', updatedAt: '', name: 'X', genericName: 'G', manufacturerId: 'm1',
    unit: 'u', tp: 10, cp: 8, rp: 12, status: ProductStatus.ACTIVE,
  } as Product;

  it('omits prices on edit when the user lacks products:edit_prices', () => {
    const dto = buildUpdateProduct(productDefaults(existing), { priceLocked: true });
    expect(dto).not.toHaveProperty('tp');
    expect(dto).not.toHaveProperty('cp');
    expect(dto).not.toHaveProperty('rp');
  });

  it('includes prices on edit when allowed', () => {
    expect(buildUpdateProduct(productDefaults(existing), { priceLocked: false })).toMatchObject({ tp: 10, cp: 8, rp: 12 });
  });
});
