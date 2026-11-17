import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { SwitchRow } from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useVendorProductsForProduct } from '@/features/vendor-products/use-vendor-products';
import { buildVendorCreate } from '@/features/vendors/schema';
import { VendorForm } from '@/features/vendors/vendor-form';
import { useVendors } from '@/features/vendors/use-vendors';
import { confirmAction } from '@/lib/confirm';
import { formatRs } from '@/lib/format';
import { parseNumber } from '@/lib/numbers';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { toast } from '@/store/toast';
import { spacing, useTheme } from '@/theme';
import type { VendorProduct } from '@/types/medicore';

/** "Vendor pricing" block on the product edit screen: vendors that sell this product and what each charges. */
export function VendorPricingSection({ productId, branchId }: { productId: string; branchId: string }) {
  const theme = useTheme();
  const { has } = useAuth();
  const { vendorProducts, isLoading, create, update, remove } = useVendorProductsForProduct(productId);
  const vendorsApi = useVendors(branchId);
  const guard = useSubmitGuard();
  const [vendorModal, setVendorModal] = useState(false);
  const [newVendorId, setNewVendorId] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const linked = new Set(vendorProducts.map((vp) => vp.vendorId));
  const available = vendorsApi.vendors.filter((v) => !linked.has(v.id));
  const canCreate = has('vendors:create');
  const canUpdate = has('vendors:update');

  const add = () =>
    guard.run(async () => {
      const price = parseNumber(newPrice);
      if (!newVendorId || price === null || price < 0) {
        toast.error('Pick a vendor and enter a valid price');
        return;
      }
      await create({ vendorId: newVendorId, productId, purchasePrice: price });
      setNewVendorId('');
      setNewPrice('');
    });

  return (
    <Card>
      <Text variant="heading">Vendor pricing</Text>
      <Text variant="caption" muted>Vendors that sell this product, and what each one charges.</Text>

      {isLoading ? <Text muted>Loading…</Text> : vendorProducts.length === 0 ? <Text muted>No vendors linked yet.</Text> : (
        vendorProducts.map((vp) => <LinkRow key={vp.id} vp={vp} canUpdate={canUpdate} update={update} remove={remove} />)
      )}

      {canCreate ? (
        <View style={[styles.add, { borderColor: theme.border }]}>
          <PickerField
            label="Vendor"
            value={newVendorId}
            options={available.map((v) => ({ value: v.id, label: v.company }))}
            onChange={setNewVendorId}
            placeholder="Select vendor"
            onCreateNew={() => setVendorModal(true)}
            createLabel="Create new vendor"
          />
          <Input label="Price" value={newPrice} onChangeText={setNewPrice} keyboardType="decimal-pad" placeholder="0.00" />
          <Button label="Add vendor pricing" variant="secondary" loading={guard.busy} onPress={add} />
        </View>
      ) : null}

      <FormModal visible={vendorModal} title="Create Vendor" onClose={() => setVendorModal(false)}>
        <VendorForm
          mode="create"
          defaultBranchId={branchId}
          onSubmit={async (values) => {
            const created = await vendorsApi.create(buildVendorCreate(values));
            setNewVendorId(created.id);
            setVendorModal(false);
          }}
        />
      </FormModal>
    </Card>
  );
}

function LinkRow({ vp, canUpdate, update, remove }: {
  vp: VendorProduct;
  canUpdate: boolean;
  update: (id: string, dto: { purchasePrice?: number; isPreferred?: boolean; isActive?: boolean }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}) {
  const theme = useTheme();
  const guard = useSubmitGuard();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(vp.purchasePrice));

  const save = () =>
    guard.run(async () => {
      const n = parseNumber(price);
      if (n === null || n < 0) {
        toast.error('Enter a valid price');
        return;
      }
      await update(vp.id, { purchasePrice: n });
      setEditing(false);
    });

  const del = async () => {
    const ok = await confirmAction({ title: 'Remove vendor pricing?', message: `${vp.vendor?.company ?? 'This vendor'} will no longer be linked to this product.`, confirmLabel: 'Remove', destructive: true });
    if (ok) await guard.run(() => remove(vp.id));
  };

  return (
    <View style={[styles.link, { borderColor: theme.border, opacity: vp.isActive ? 1 : 0.6 }]}>
      <View style={styles.linkHead}>
        <Text variant="label" style={styles.flex}>{vp.vendor?.company ?? vp.vendorId}</Text>
        {vp.isPreferred ? <Badge label="Preferred" tone="success" /> : null}
      </View>
      {editing ? (
        <View style={styles.editRow}>
          <View style={styles.flex}><Input label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></View>
          <Button label="Save" loading={guard.busy} onPress={save} />
          <Button label="Cancel" variant="secondary" onPress={() => { setEditing(false); setPrice(String(vp.purchasePrice)); }} />
        </View>
      ) : (
        <Text>{formatRs(vp.purchasePrice)}</Text>
      )}
      {canUpdate && !editing ? (
        <View style={styles.actions}>
          <Button label="Edit price" variant="secondary" onPress={() => setEditing(true)} />
          {!vp.isPreferred ? <Button label="Mark preferred" variant="secondary" onPress={() => void guard.run(() => update(vp.id, { isPreferred: true }))} /> : null}
          <Button label="Remove" variant="danger" onPress={del} />
        </View>
      ) : null}
      {canUpdate ? <SwitchRow label="Active" value={vp.isActive} onValueChange={(v) => void guard.run(() => update(vp.id, { isActive: v }))} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  add: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  link: { gap: spacing.sm, borderWidth: 1, borderRadius: 10, padding: spacing.md },
  linkHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editRow: { gap: spacing.sm },
  actions: { gap: spacing.sm },
});
