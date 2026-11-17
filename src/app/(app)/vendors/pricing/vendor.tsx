import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { ProductForm } from '@/features/products/product-form';
import { buildCreateProduct } from '@/features/products/schema';
import { useProducts } from '@/features/products/use-products';
import { useVendorProductsForVendor } from '@/features/vendor-products/use-vendor-products';
import { useVendors } from '@/features/vendors/use-vendors';
import { formatRs } from '@/lib/format';
import { parseNumber } from '@/lib/numbers';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { toast } from '@/store/toast';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

/** Vendor Product Pricing, step 2: the products a vendor sells, with link / create actions. */
export default function VendorPricingVendorScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { vendorId } = useLocalSearchParams<{ vendorId: string }>();
  const vendorsApi = useVendors();
  const vendor = vendorsApi.vendors.find((v) => v.id === vendorId);
  // A vendor only sells products of its own branch.
  const productsApi = useProducts({ branchId: vendor?.branchId }, !!vendor);
  const links = useVendorProductsForVendor(vendorId ?? null);
  const guard = useSubmitGuard();

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [linkProductId, setLinkProductId] = useState('');
  const [linkPrice, setLinkPrice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () =>
      links.vendorProducts
        .filter((vp) => showInactive || vp.isActive)
        .filter((vp) => (vp.product?.name ?? '').toLowerCase().includes(search.trim().toLowerCase())),
    [links.vendorProducts, search, showInactive],
  );
  const linkedIds = new Set(links.vendorProducts.map((vp) => vp.productId));
  const linkable = productsApi.products.filter((p) => !linkedIds.has(p.id));
  const canCreateLink = has('vendors:create');

  if (!has('vendors:read')) return <EmptyState title="No access" message="You don't have permission to view vendors." />;
  if (vendorsApi.isLoading || links.isLoading) return <LoadingState />;
  if (vendorsApi.error && !vendor) return <ErrorState error={vendorsApi.error} onRetry={() => vendorsApi.refetch()} />;
  if (!vendor) return <EmptyState title="Vendor not found" />;

  const openLink = (linkId: string) => router.push({ pathname: '/vendors/pricing/link', params: { vendorId: vendor.id, linkId } } as never);

  const linkExisting = () =>
    guard.run(async () => {
      const price = parseNumber(linkPrice);
      if (!linkProductId || price === null || price < 0) {
        toast.error('Pick a product and enter a valid price');
        return;
      }
      try {
        const link = await links.create({ vendorId: vendor.id, productId: linkProductId, purchasePrice: price });
        setLinkProductId('');
        setLinkPrice('');
        openLink(link.id);
      } catch {
        // toasted by the mutation
      }
    });

  return (
    <>
      <Stack.Screen options={{ title: vendor.company }} />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        data={filtered}
        keyExtractor={(vp) => vp.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([links.refetch(), vendorsApi.refetch()]); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {has('vendors:create') && has('products:create') ? <Button label="Add product" onPress={() => setCreateOpen(true)} /> : null}
            {canCreateLink ? (
              <Card>
                <Text variant="label">Link existing product</Text>
                <PickerField
                  label="Product"
                  value={linkProductId}
                  options={linkable.map((p) => ({ value: p.id, label: p.name, hint: p.genericName }))}
                  placeholder="Select product"
                  onChange={(id) => {
                    setLinkProductId(id);
                    setLinkPrice(String(productsApi.products.find((p) => p.id === id)?.cp ?? ''));
                  }}
                />
                <Input label="Price" value={linkPrice} onChangeText={setLinkPrice} keyboardType="decimal-pad" placeholder="0.00" />
                <Button label="Link" variant="secondary" disabled={!linkProductId} loading={guard.busy} onPress={linkExisting} />
              </Card>
            ) : null}
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search products" />
            <SwitchRow label="Show inactive" value={showInactive} onValueChange={setShowInactive} />
          </View>
        }
        ListEmptyComponent={<EmptyState title="No products linked" message="This vendor has no linked products yet." />}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => openLink(item.id)} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border, opacity: item.isActive ? 1 : 0.55 }]}>
            <Text variant="label" style={styles.flex}>{item.isPreferred ? '★ ' : ''}{item.product?.name ?? item.productId}</Text>
            <Text>{formatRs(item.purchasePrice)}</Text>
          </Pressable>
        )}
      />

      <FormModal visible={createOpen} title="Create Product" onClose={() => setCreateOpen(false)}>
        <ProductForm
          mode="create"
          lockedBranchId={vendor.branchId}
          onSubmit={async (values) => {
            try {
              const created = await productsApi.create(buildCreateProduct(values));
              // The product is saved; link it to this vendor at its cost price (as the web does).
              const link = await links.create({ vendorId: vendor.id, productId: created.id, purchasePrice: created.cp });
              setCreateOpen(false);
              openLink(link.id);
            } catch {
              // toasted by the mutation; the form stays open
            }
          }}
        />
      </FormModal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TOUCH_TARGET, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
