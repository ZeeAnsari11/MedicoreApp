import { z } from 'zod';

import type { CreateCustomerRequest, Customer, UpdateCustomerRequest } from '@/types/medicore';

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  branchId: z.string(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  isDealer: z.boolean(),
});
/** Create requires the form's own Branch; edit never shows it (a customer never changes branch). */
export const customerSchemaFor = (mode: 'create' | 'edit') =>
  mode === 'create' ? customerSchema.extend({ branchId: z.string().min(1, 'Branch is required') }) : customerSchema;
export type CustomerFormValues = z.infer<typeof customerSchema>;

export const customerDefaults = (c?: Customer, defaultBranchId = ''): CustomerFormValues => ({
  name: c?.name ?? '',
  branchId: c?.branchId ?? defaultBranchId,
  phone: c?.phone ?? '',
  address: c?.address ?? '',
  isDealer: c?.isDealer ?? false,
});

const orUndefined = (v: string | undefined) => (v && v.trim() ? v : undefined);

export function buildCustomerCreate(values: CustomerFormValues): CreateCustomerRequest {
  return {
    name: values.name,
    branchId: values.branchId,
    phone: orUndefined(values.phone),
    address: orUndefined(values.address),
    isDealer: values.isDealer,
  };
}

/**
 * Full PATCH body, like the web dialog sends. Deliberately NOT a diff: `PATCH /customers/:id` assigns every DTO property onto
 * the document (including the ones left undefined), so a partial body fails with a 500 ("name is required"). A customer never
 * changes branch, so `branchId` is not sent.
 */
export function buildCustomerUpdate(values: CustomerFormValues): UpdateCustomerRequest {
  return { name: values.name, phone: values.phone ?? '', address: values.address ?? '', isDealer: values.isDealer };
}
