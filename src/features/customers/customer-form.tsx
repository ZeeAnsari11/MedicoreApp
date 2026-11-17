import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import { TextField } from '@/components/form/fields';
import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { SwitchRow } from '@/components/ui/switch-row';
import { BranchField } from '@/features/branches/branch-field';
import { useBranchField } from '@/features/branches/use-branch-field';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import type { Customer } from '@/types/medicore';

import { customerDefaults, customerSchemaFor, type CustomerFormValues } from './schema';

interface Props {
  mode: 'create' | 'edit';
  customer?: Customer;
  /** Pre-selects the Branch field (nested create from the New Sale form); otherwise the locked branch, or empty. */
  defaultBranchId?: string;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
}

export function CustomerForm({ mode, customer, defaultBranchId, onSubmit }: Props) {
  const branchField = useBranchField();
  const { control, handleSubmit } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchemaFor(mode)),
    defaultValues: customerDefaults(customer, defaultBranchId ?? branchField.defaultBranchId),
  });
  const guard = useSubmitGuard();
  const submit = handleSubmit((v) =>
    guard.run(() => onSubmit(v)),
  );

  return (
    <FormScreen>
      <TextField control={control} name="name" label="Name" placeholder="e.g., Ali Medical Store" />
      {mode === 'create' ? (
        <Controller
          control={control}
          name="branchId"
          render={({ field, fieldState }) => (
            <BranchField field={branchField} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
          )}
        />
      ) : null}
      <TextField control={control} name="phone" label="Phone" placeholder="Optional" keyboardType="phone-pad" />
      <TextField control={control} name="address" label="Address" placeholder="Optional" />
      <Controller
        control={control}
        name="isDealer"
        render={({ field }) => <SwitchRow label="Dealer (gets wholesale pricing)" value={field.value} onValueChange={field.onChange} />}
      />
      <Button label="Save" loading={guard.busy} onPress={submit} />
    </FormScreen>
  );
}
