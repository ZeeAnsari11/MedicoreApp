import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { ChipRow } from '@/components/chip-row';
import { PickerController, TextField } from '@/components/form/fields';
import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { Text } from '@/components/ui/text';
import { BranchField } from '@/features/branches/branch-field';
import { useBranchField } from '@/features/branches/use-branch-field';
import { useProducts } from '@/features/products/use-products';
import { useSubmitGuard } from '@/lib/use-submit-guard';

import { ADJUST_OPERATIONS, adjustmentSchema, type AdjustmentFormValues } from './schema';

interface Props {
  initial: AdjustmentFormValues;
  onSubmit: (values: AdjustmentFormValues) => Promise<void>;
}

const HINTS = {
  add: 'Adds to the batch; creates it if it does not exist yet (e.g. opening stock).',
  subtract: 'Removes from an existing batch; the backend refuses if it holds less than this.',
  set: 'Replaces the batch quantity with this value; creates the batch if new.',
} as const;

export function AdjustmentForm({ initial, onSubmit }: Props) {
  const branchField = useBranchField();
  const { control, handleSubmit, setValue } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { ...initial, branchId: initial.branchId || branchField.defaultBranchId },
  });
  const branchId = useWatch({ control, name: 'branchId' });
  const operation = useWatch({ control, name: 'operation' });
  // Products are per branch: the picker lists the adjustment's own branch.
  const { products, isLoading: productsLoading } = useProducts({ branchId }, !!branchId);
  const guard = useSubmitGuard();
  const submit = handleSubmit((v) => guard.run(() => onSubmit(v)));

  return (
    <FormScreen>
      <Controller
        control={control}
        name="branchId"
        render={({ field, fieldState }) => (
          <BranchField
            field={branchField}
            value={field.value}
            onChange={(v) => {
              field.onChange(v);
              setValue('productId', '');
            }}
            error={fieldState.error?.message}
          />
        )}
      />
      <PickerController
        control={control}
        name="productId"
        label="Product"
        required
        disabled={!branchId}
        placeholder={!branchId ? 'Select a branch first' : productsLoading ? 'Loading products…' : 'Select product'}
        options={products.map((p) => ({ value: p.id, label: p.name, hint: p.genericName }))}
      />
      <TextField control={control} name="batchNumber" label="Batch number" autoCapitalize="characters" />
      <TextField control={control} name="expiryDate" label="Expiry date (YYYY-MM-DD)" placeholder="2027-12-31" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
      <Controller
        control={control}
        name="operation"
        render={({ field }) => <ChipRow label="Operation" value={field.value} onChange={field.onChange} options={ADJUST_OPERATIONS.map((o) => ({ value: o.value, label: o.label }))} />}
      />
      <Text variant="caption" muted>{HINTS[operation]}</Text>
      <TextField control={control} name="quantity" label="Quantity" keyboardType="decimal-pad" />
      <TextField control={control} name="purchasePrice" label="Purchase price (optional)" keyboardType="decimal-pad" />
      <TextField control={control} name="sellingPrice" label="Sale price (optional)" keyboardType="decimal-pad" />
      <TextField control={control} name="reason" label="Reason (optional)" placeholder="e.g. stock count correction" />
      <Button label="Save adjustment" loading={guard.busy} onPress={submit} />
    </FormScreen>
  );
}
