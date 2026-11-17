import { manufacturerDefaults, manufacturerSchema, buildManufacturerCreate, buildManufacturerUpdate } from '@/features/manufacturers/schema';
import { vendorDefaults, vendorSchema, buildVendorCreate, buildVendorUpdate } from '@/features/vendors/schema';
import { categorySchema } from '@/features/categories/schema';
import type { Manufacturer, Vendor } from '@/types/medicore';

describe('manufacturer schema', () => {
  it('requires name ≥ 2 and a branch', () => {
    const r = manufacturerSchema.safeParse({ ...manufacturerDefaults(), name: 'G' });
    expect(r.success).toBe(false);
    const keys = !r.success ? r.error.issues.map((i) => i.path[0]) : [];
    expect(keys.sort()).toEqual(['branchId', 'name']);
    expect(manufacturerSchema.safeParse({ ...manufacturerDefaults(undefined, 'b1'), name: 'GSK' }).success).toBe(true);
  });

  const orig = { id: 'm', name: 'GSK', branchId: 'b1', country: 'UK', contactPhone: '1', website: 'w', isActive: true } as Manufacturer;
  it('sends only changed fields on edit', () => {
    const v = manufacturerDefaults(orig);
    expect(buildManufacturerUpdate(v, orig)).toEqual({});
    expect(buildManufacturerUpdate({ ...v, name: 'GSK2', branchId: 'b2' }, orig)).toEqual({ name: 'GSK2', branchId: 'b2' });
    expect(buildManufacturerUpdate({ ...v, country: '' }, orig)).toEqual({ country: '' });
  });
});

describe('vendor schema', () => {
  it('requires company ≥ 2', () => {
    expect(vendorSchema.safeParse({ ...vendorDefaults(), company: 'A' }).success).toBe(false);
    expect(vendorSchema.safeParse({ ...vendorDefaults(), company: 'City Pharma' }).success).toBe(true);
  });
  const orig = { id: 'v', company: 'City', branchId: 'b1', isActive: true, contactPhone: '1' } as Vendor;
  it('sends only changed fields and never the branch on edit', () => {
    const v = vendorDefaults(orig);
    expect(buildVendorUpdate(v, orig)).toEqual({});
    expect(buildVendorUpdate({ ...v, address: 'Main St', branchId: 'zzz' }, orig)).toEqual({ address: 'Main St' });
  });
});

describe('category schema', () => {
  it('requires name ≥ 2', () => {
    expect(categorySchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(categorySchema.safeParse({ name: 'Analgesics' }).success).toBe(true);
  });
});

describe('create payloads', () => {
  it('omits blank optional fields and only sets alsoCreateVendor when asked', () => {
    const v = { ...manufacturerDefaults(undefined, 'b1'), name: 'GSK', country: ' ', website: 'x.com' };
    expect(buildManufacturerCreate(v)).toEqual({ name: 'GSK', branchId: 'b1', country: undefined, contactPhone: undefined, website: 'x.com', alsoCreateVendor: undefined });
    expect(buildManufacturerCreate(v, true).alsoCreateVendor).toBe(true);
    expect(buildVendorCreate({ ...vendorDefaults(undefined, 'b1'), company: 'City', address: '' })).toEqual({
      company: 'City', branchId: 'b1', distributorType: undefined, contactName: undefined, contactPhone: undefined, address: undefined,
    });
  });
});
