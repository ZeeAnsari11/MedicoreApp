import { z } from 'zod';

import type { CreateManufacturerRequest, Manufacturer, UpdateManufacturerRequest } from '@/types/medicore';

export const manufacturerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  branchId: z.string().min(1, 'Branch is required'),
  country: z.string().trim().optional(),
  contactPhone: z.string().trim().optional(),
  website: z.string().trim().optional(),
});
export type ManufacturerFormValues = z.infer<typeof manufacturerSchema>;

export const manufacturerDefaults = (m?: Manufacturer, defaultBranchId = ''): ManufacturerFormValues => ({
  name: m?.name ?? '',
  branchId: m?.branchId ?? defaultBranchId,
  country: m?.country ?? '',
  contactPhone: m?.contactPhone ?? '',
  website: m?.website ?? '',
});

/** Sends only what changed (same as the web edit dialog); the backend skips undefined fields. */
export function buildManufacturerUpdate(values: ManufacturerFormValues, original: Manufacturer): UpdateManufacturerRequest {
  const dto: UpdateManufacturerRequest = {};
  if (values.name !== original.name) dto.name = values.name;
  if ((values.country ?? '') !== (original.country ?? '')) dto.country = values.country;
  if ((values.contactPhone ?? '') !== (original.contactPhone ?? '')) dto.contactPhone = values.contactPhone;
  if ((values.website ?? '') !== (original.website ?? '')) dto.website = values.website;
  if (values.branchId && values.branchId !== original.branchId) dto.branchId = values.branchId;
  return dto;
}

const orUndefined = (v: string | undefined) => (v && v.trim() ? v : undefined);

export function buildManufacturerCreate(values: ManufacturerFormValues, alsoCreateVendor = false): CreateManufacturerRequest {
  return {
    name: values.name,
    branchId: values.branchId,
    country: orUndefined(values.country),
    contactPhone: orUndefined(values.contactPhone),
    website: orUndefined(values.website),
    alsoCreateVendor: alsoCreateVendor || undefined,
  };
}
