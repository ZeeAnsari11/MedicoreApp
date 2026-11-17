import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import { TextField } from '@/components/form/fields';
import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { BranchField } from '@/features/branches/branch-field';
import { useBranchField } from '@/features/branches/use-branch-field';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import type { Vendor } from '@/types/medicore';

import { vendorDefaults, vendorSchema, type VendorFormValues } from './schema';

interface Props {
  mode: 'create' | 'edit';
  vendor?: Vendor;
  defaultBranchId?: string;
  onSubmit: (values: VendorFormValues) => Promise<void>;
}

export function VendorForm({ mode, vendor, defaultBranchId, onSubmit }: Props) {
  const branchField = useBranchField();
  const { control, handleSubmit, setError } = useForm<VendorFormValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: vendorDefaults(vendor, defaultBranchId ?? branchField.defaultBranchId),
  });
  const guard = useSubmitGuard();
  const submit = handleSubmit((v) =>
    guard.run(async () => {
      // The Branch field only exists on create (a vendor never changes branch).
      if (mode === 'create' && !v.branchId) {
        setError('branchId', { message: 'Branch is required' });
        return;
      }
      await onSubmit(v);
    }),
  );

  return (
    <FormScreen>
      <TextField control={control} name="company" label="Company" placeholder="e.g., City Pharma Distributors" />
      {mode === 'create' ? (
        <Controller
          control={control}
          name="branchId"
          render={({ field, fieldState }) => (
            <BranchField field={branchField} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
          )}
        />
      ) : null}
      <TextField control={control} name="distributorType" label="Type" placeholder="e.g., Distributor, Wholesaler" />
      <TextField control={control} name="contactName" label="Contact name" placeholder="Optional" />
      <TextField control={control} name="contactPhone" label="Contact phone" placeholder="Optional" keyboardType="phone-pad" />
      <TextField control={control} name="address" label="Address" placeholder="Optional" />
      <Button label="Save" loading={guard.busy} onPress={submit} />
    </FormScreen>
  );
}
