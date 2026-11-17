import { z } from 'zod';

import type { CreateVendorRequest, UpdateVendorRequest, Vendor } from '@/types/medicore';

export const vendorSchema = z.object({
  company: z.string().trim().min(2, 'Company must be at least 2 characters'),
  branchId: z.string(),
  distributorType: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactPhone: z.string().trim().optional(),
  address: z.string().trim().optional(),
});
export type VendorFormValues = z.infer<typeof vendorSchema>;

export const vendorDefaults = (v?: Vendor, defaultBranchId = ''): VendorFormValues => ({
  company: v?.company ?? '',
  branchId: v?.branchId ?? defaultBranchId,
  distributorType: v?.distributorType ?? '',
  contactName: v?.contactName ?? '',
  contactPhone: v?.contactPhone ?? '',
  address: v?.address ?? '',
});

export function buildVendorUpdate(values: VendorFormValues, original: Vendor): UpdateVendorRequest {
  const dto: UpdateVendorRequest = {};
  if (values.company !== original.company) dto.company = values.company;
  if ((values.distributorType ?? '') !== (original.distributorType ?? '')) dto.distributorType = values.distributorType;
  if ((values.contactName ?? '') !== (original.contactName ?? '')) dto.contactName = values.contactName;
  if ((values.contactPhone ?? '') !== (original.contactPhone ?? '')) dto.contactPhone = values.contactPhone;
  if ((values.address ?? '') !== (original.address ?? '')) dto.address = values.address;
  return dto;
}

const orUndefined = (v: string | undefined) => (v && v.trim() ? v : undefined);

export function buildVendorCreate(values: VendorFormValues): CreateVendorRequest {
  return {
    company: values.company,
    branchId: values.branchId,
    distributorType: orUndefined(values.distributorType),
    contactName: orUndefined(values.contactName),
    contactPhone: orUndefined(values.contactPhone),
    address: orUndefined(values.address),
  };
}
