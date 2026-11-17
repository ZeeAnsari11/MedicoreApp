import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { PickerController, TextField } from '@/components/form/fields';
import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { FormScreen } from '@/components/ui/form-screen';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { BranchField } from '@/features/branches/branch-field';
import { useBranchField } from '@/features/branches/use-branch-field';
import { CategoryForm } from '@/features/categories/category-form';
import { useCategories } from '@/features/categories/use-categories';
import { ManufacturerForm } from '@/features/manufacturers/manufacturer-form';
import { buildManufacturerCreate } from '@/features/manufacturers/schema';
import { useManufacturers } from '@/features/manufacturers/use-manufacturers';
import { buildVendorCreate } from '@/features/vendors/schema';
import { VendorForm } from '@/features/vendors/vendor-form';
import { useVendors } from '@/features/vendors/use-vendors';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';
import type { Product } from '@/types/medicore';

import { createProductSchema, productDefaults, type ProductFormValues } from './schema';

interface Props {
  mode: 'create' | 'edit';
  product?: Product;
  /** Create in this branch with the Branch field locked (opened from a branch-bound screen). */
  lockedBranchId?: string;
  /** Shows the required Vendor field (web: create + vendors:create, unless the caller links the vendor itself). */
  showVendor?: boolean;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  children?: React.ReactNode;
}

type Nested = 'manufacturer' | 'vendor' | 'category' | null;

export function ProductForm({ mode, product, lockedBranchId, showVendor = false, onSubmit, children }: Props) {
  const { has } = useAuth();
  const branchField = useBranchField();
  const manufacturersApi = useManufacturers();
  const categoriesApi = useCategories();
  const [nested, setNested] = useState<Nested>(null);
  const guard = useSubmitGuard();

  const schema = useMemo(() => createProductSchema({ requireVendor: showVendor }), [showVendor]);
  const { control, handleSubmit, setValue } = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: productDefaults(product, lockedBranchId ?? branchField.defaultBranchId),
  });

  const branchId = useWatch({ control, name: 'branchId' });
  const vendorsApi = useVendors(showVendor && branchId ? branchId : undefined);
  // Prices are fixed at creation; changing them later needs products:edit_prices.
  const priceLocked = mode === 'edit' && !has('products:edit_prices');
  const branchName = branchField.branches.find((b) => b.id === (product?.branchId ?? lockedBranchId))?.name ?? '—';

  // A manufacturer with no branch is shared; nothing is offered until a branch is chosen.
  const manufacturerOptions = branchId
    ? manufacturersApi.manufacturers.filter((m) => !m.branchId || m.branchId === branchId).map((m) => ({ value: m.id, label: m.name }))
    : [];
  const vendorOptions = branchId ? vendorsApi.vendors.filter((v) => v.branchId === branchId).map((v) => ({ value: v.id, label: v.company })) : [];

  const submit = handleSubmit((values) => guard.run(() => onSubmit(values)));

  return (
    <>
      <FormScreen>
        {mode === 'edit' || lockedBranchId ? (
          <Input label="Branch" value={branchName} editable={false} />
        ) : (
          <Controller
            control={control}
            name="branchId"
            render={({ field, fieldState }) => (
              <BranchField
                field={branchField}
                value={field.value}
                error={fieldState.error?.message}
                onChange={(v) => {
                  field.onChange(v);
                  // The chosen manufacturer/vendor may not exist in the new branch.
                  setValue('manufacturerId', '');
                  setValue('vendorId', '');
                }}
              />
            )}
          />
        )}

        <TextField control={control} name="name" label="Name" placeholder="e.g., Panadol 500mg" />
        <TextField control={control} name="genericName" label="Generic name *" placeholder="e.g., Paracetamol" />

        <PickerController
          control={control}
          name="manufacturerId"
          label="Manufacturer"
          required
          options={manufacturerOptions}
          placeholder={branchId ? 'Select manufacturer' : 'Select a branch first'}
          disabled={!branchId}
          onCreateNew={() => setNested('manufacturer')}
          createLabel="Create new manufacturer"
        />

        {showVendor ? (
          <PickerController
            control={control}
            name="vendorId"
            label="Vendor"
            required
            options={vendorOptions}
            placeholder={branchId ? 'Select vendor' : 'Select a branch first'}
            disabled={!branchId}
            onCreateNew={() => setNested('vendor')}
            createLabel="Create new vendor"
          />
        ) : null}

        <PickerController
          control={control}
          name="categoryId"
          label="Category"
          clearable
          options={categoriesApi.categories.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="Select category (optional)"
          onCreateNew={() => setNested('category')}
          createLabel="Create new category"
        />

        <TextField control={control} name="barcode" label="Barcode" placeholder="Optional" autoCapitalize="none" />

        <View style={styles.row}>
          <View style={styles.half}><TextField control={control} name="unit" label="Unit" placeholder="e.g., tablet" autoCapitalize="none" /></View>
          <View style={styles.half}><TextField control={control} name="packing" label="Packing" placeholder="e.g., 10x10" autoCapitalize="none" /></View>
        </View>

        <View style={styles.row}>
          <View style={styles.third}><TextField control={control} name="tp" label="TP (trade)" placeholder="0.00" keyboardType="decimal-pad" editable={!priceLocked} /></View>
          <View style={styles.third}><TextField control={control} name="cp" label="CP (cost)" placeholder="0.00" keyboardType="decimal-pad" editable={!priceLocked} /></View>
          <View style={styles.third}><TextField control={control} name="rp" label="RP (retail)" placeholder="0.00" keyboardType="decimal-pad" editable={!priceLocked} /></View>
        </View>
        {priceLocked ? <Text variant="caption" muted>Changing prices needs the &quot;edit prices&quot; permission.</Text> : null}

        <TextField control={control} name="minStockLevel" label="Min stock level" placeholder="Optional" keyboardType="number-pad" />

        <Button label="Save" loading={guard.busy} onPress={submit} />
        {children}
      </FormScreen>

      <FormModal visible={nested === 'manufacturer'} title="Create Manufacturer" onClose={() => setNested(null)}>
        <ManufacturerForm
          mode="create"
          defaultBranchId={branchId || undefined}
          onSubmit={async (values) => {
            const created = await manufacturersApi.create(buildManufacturerCreate(values));
            setValue('manufacturerId', created.id, { shouldValidate: true });
            setNested(null);
          }}
        />
      </FormModal>
      <FormModal visible={nested === 'vendor'} title="Create Vendor" onClose={() => setNested(null)}>
        <VendorForm
          mode="create"
          defaultBranchId={branchId || undefined}
          onSubmit={async (values) => {
            const created = await vendorsApi.create(buildVendorCreate(values));
            setValue('vendorId', created.id, { shouldValidate: true });
            setNested(null);
          }}
        />
      </FormModal>
      <FormModal visible={nested === 'category'} title="Create Category" onClose={() => setNested(null)}>
        <CategoryForm
          onSubmit={async (values) => {
            const created = await categoriesApi.create(values);
            setValue('categoryId', created.id, { shouldValidate: true });
            setNested(null);
          }}
        />
      </FormModal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  third: { flex: 1 },
});
