import { z } from 'zod';

import type { Branch, CreateBranchRequest, UpdateBranchRequest } from '@/types/medicore';

export const branchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').min(2, 'Too short'),
  code: z.string().trim().min(1, 'Code is required').min(2, 'Too short'),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  isMain: z.boolean(),
});
export type BranchFormValues = z.infer<typeof branchSchema>;

export const branchDefaults = (b?: Branch): BranchFormValues => ({
  name: b?.name ?? '',
  code: b?.code ?? '',
  address: b?.address ?? '',
  phone: b?.phone ?? '',
  isMain: b?.isMain ?? false,
});

const orUndefined = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** The server uppercases and uniqueness-checks the code; sending it uppercase just matches what the user will see. */
export const buildBranchCreate = (v: BranchFormValues): CreateBranchRequest => ({
  name: v.name,
  code: v.code.toUpperCase(),
  address: orUndefined(v.address),
  phone: orUndefined(v.phone),
  isMain: v.isMain || undefined,
});

/** Same as the web edit dialog: only changed fields. */
export function buildBranchUpdate(v: BranchFormValues, original: Branch): UpdateBranchRequest {
  const dto: UpdateBranchRequest = {};
  if (v.name !== original.name) dto.name = v.name;
  if (v.code.toUpperCase() !== original.code) dto.code = v.code.toUpperCase();
  if ((v.address ?? '') !== (original.address ?? '')) dto.address = v.address ?? '';
  if ((v.phone ?? '') !== (original.phone ?? '')) dto.phone = v.phone ?? '';
  if (v.isMain !== original.isMain) dto.isMain = v.isMain;
  return dto;
}
