import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { TextField } from '@/components/form/fields';
import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { useSubmitGuard } from '@/lib/use-submit-guard';

import { categorySchema, type CategoryFormValues } from './schema';

/** Quick-create category (the web's nested-creation dialog over the Product form). */
export function CategoryForm({ onSubmit }: { onSubmit: (values: CategoryFormValues) => Promise<void> }) {
  const { control, handleSubmit } = useForm<CategoryFormValues>({ resolver: zodResolver(categorySchema), defaultValues: { name: '' } });
  const guard = useSubmitGuard();
  return (
    <FormScreen>
      <TextField control={control} name="name" label="Name" placeholder="e.g., Analgesics" />
      <Button label="Create" loading={guard.busy} onPress={handleSubmit((v) => guard.run(() => onSubmit(v)))} />
    </FormScreen>
  );
}
