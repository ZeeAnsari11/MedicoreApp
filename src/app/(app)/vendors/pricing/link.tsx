import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormScreen } from '@/components/ui/form-screen';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useProducts } from '@/features/products/use-products';
import { useVendorProductsForVendor } from '@/features/vendor-products/use-vendor-products';
import { useVendors } from '@/features/vendors/use-vendors';
import { confirmAction } from '@/lib/confirm';
import { formatRs } from '@/lib/format';
import { parseNumber } from '@/lib/numbers';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { toast } from '@/store/toast';
import { spacing } from '@/theme';
import { ProductStatus } from '@/types/medicore';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text muted>{label}</Text>
      <Text variant="label" style={styles.value}>{value}</Text>
    </View>
  );
}

/** Vendor Product Pricing, step 3: product details plus this vendor's price / preferred flag / removal. */
export default function VendorPricingLinkScreen() {
  const { has } = useAuth();
  const { vendorId, linkId } = useLocalSearchParams<{ vendorId: string; linkId: string }>();
  const vendor = useVendors().vendors.find((v) => v.id === vendorId);
  const links = useVendorProductsForVendor(vendorId ?? null);
  const link = links.vendorProducts.find((l) => l.id === linkId);
  const product = useProducts({ branchId: vendor?.branchId }, !!vendor).products.find((p) => p.id === link?.productId);
  const guard = useSubmitGuard();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState('');
  const canUpdate = has('vendors:update');

  if (links.isLoading) return <LoadingState />;
  if (links.error && !link) return <ErrorState error={links.error} onRetry={() => links.refetch()} />;
  if (!link) return <EmptyState title="Pricing not found" message="It may have been removed." />;

  const savePrice = () =>
    guard.run(async () => {
      const n = parseNumber(price);
      if (n === null || n < 0) {
        toast.error('Enter a valid price');
        return;
      }
      try {
        await links.update(link.id, { purchasePrice: n });
        setEditing(false);
      } catch {
        // toasted by the mutation
      }
    });

  const remove = async () => {
    const ok = await confirmAction({ title: 'Remove this vendor pricing?', message: `${product?.name ?? 'This product'} will no longer be linked to ${vendor?.company ?? 'this vendor'}.`, confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    await guard.run(async () => {
      try {
        await links.remove(link.id);
        router.back();
      } catch {
        // toasted by the mutation
      }
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: link.product?.name ?? 'Product pricing' }} />
      <FormScreen>
        <Card>
          <Text variant="heading">Product details</Text>
          {product ? (
            <>
              <Row label="Name" value={product.name} />
              <Row label="Generic name" value={product.genericName || '—'} />
              <Row label="Manufacturer" value={product.manufacturer?.name ?? '—'} />
              <Row label="Category" value={product.category?.name ?? '—'} />
              <Row label="Barcode" value={product.barcode || '—'} />
              <Row label="Unit" value={product.unit} />
              <Row label="Packing" value={product.packing || '—'} />
              <Row label="TP (trade)" value={formatRs(product.tp)} />
              <Row label="CP (cost)" value={formatRs(product.cp)} />
              <Row label="RP (retail)" value={formatRs(product.rp)} />
              <Row label="Min stock level" value={product.minStockLevel !== undefined ? String(product.minStockLevel) : '—'} />
              <Row label="Status" value={product.status === ProductStatus.ACTIVE ? 'Active' : 'Discontinued'} />
              <Button label="Edit product" variant="secondary" disabled={!has('products:update')} onPress={() => router.push({ pathname: '/products/form', params: { id: product.id } } as never)} />
            </>
          ) : <Text muted>Loading product details…</Text>}
        </Card>

        <Card>
          <Text variant="heading">Vendor details</Text>
          {editing ? (
            <>
              <Input label="Purchase price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" autoFocus />
              <Button label="Save price" loading={guard.busy} onPress={savePrice} />
              <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} />
            </>
          ) : (
            <>
              <Row label="Purchase price" value={formatRs(link.purchasePrice)} />
              <Row label="Last purchase price" value={link.lastPurchasePrice !== undefined ? formatRs(link.lastPurchasePrice) : '—'} />
              <Row label="Status" value={link.isActive ? 'Active' : 'Inactive'} />
              {link.isPreferred ? <Badge label="Preferred vendor" tone="success" /> : null}
              {canUpdate ? <Button label="Edit price" variant="secondary" onPress={() => { setPrice(String(link.purchasePrice)); setEditing(true); }} /> : null}
              {canUpdate && !link.isPreferred ? <Button label="Mark preferred" variant="secondary" loading={guard.busy} onPress={() => void guard.run(() => links.update(link.id, { isPreferred: true }).catch(() => undefined))} /> : null}
              {canUpdate ? <Button label="Remove this vendor pricing" variant="danger" loading={guard.busy} onPress={remove} /> : null}
            </>
          )}
        </Card>
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  value: { flex: 1, textAlign: 'right' },
});
