import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import { TextField } from '@/components/form/fields';
import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { BranchField } from '@/features/branches/branch-field';
import { useBranchField } from '@/features/branches/use-branch-field';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import type { Manufacturer } from '@/types/medicore';

import { manufacturerDefaults, manufacturerSchema, type ManufacturerFormValues } from './schema';

interface Props {
  mode: 'create' | 'edit';
  manufacturer?: Manufacturer;
  /** Pre-selects the Branch field (nested create from the product form); otherwise the locked branch, or empty. */
  defaultBranchId?: string;
  /** Shows "Save as Manufacturer + Vendor" (create only; needs vendors:create). */
  canCreateVendor?: boolean;
  onSubmit: (values: ManufacturerFormValues, alsoCreateVendor: boolean) => Promise<void>;
}

export function ManufacturerForm({ mode, manufacturer, defaultBranchId, canCreateVendor, onSubmit }: Props) {
  const branchField = useBranchField();
  const { control, handleSubmit } = useForm<ManufacturerFormValues>({
    resolver: zodResolver(manufacturerSchema),
    defaultValues: manufacturerDefaults(manufacturer, defaultBranchId ?? branchField.defaultBranchId),
  });
  const guard = useSubmitGuard();
  const submit = (alsoVendor: boolean) => handleSubmit((v) => guard.run(() => onSubmit(v, alsoVendor)));

  return (
    <FormScreen>
      <TextField control={control} name="name" label="Name" placeholder="e.g., GSK" />
      <Controller
        control={control}
        name="branchId"
        render={({ field, fieldState }) => (
          <BranchField field={branchField} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
        )}
      />
      <TextField control={control} name="country" label="Country" placeholder="Optional" />
      <TextField control={control} name="contactPhone" label="Contact phone" placeholder="Optional" keyboardType="phone-pad" />
      <TextField control={control} name="website" label="Website" placeholder="Optional" keyboardType="url" autoCapitalize="none" />
      <Button label="Save" loading={guard.busy} onPress={submit(false)} />
      {mode === 'create' && canCreateVendor ? (
        <Button label="Save as Manufacturer + Vendor" variant="secondary" loading={guard.busy} onPress={submit(true)} />
      ) : null}
    </FormScreen>
  );
}
