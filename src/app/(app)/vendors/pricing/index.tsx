import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { SearchBar } from '@/components/ui/search-bar';
import { SwitchRow } from '@/components/ui/switch-row';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useVendorSearchByProduct } from '@/features/vendor-products/use-vendor-products';
import { useVendors } from '@/features/vendors/use-vendors';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

/** Vendor Product Pricing, step 1: pick a vendor (by name, or by a product they sell). */
export default function VendorPricingScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { vendors, isLoading, error, refetch } = useVendors();
  const [vendorSearch, setVendorSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const term = useDebouncedValue(productSearch.trim(), 300);
  const searching = term.length > 0;
  const productResults = useVendorSearchByProduct(term, includeInactive);

  const q = vendorSearch.trim().toLowerCase();
  const filteredVendors = useMemo(() => vendors.filter((v) => v.company.toLowerCase().includes(q)), [vendors, q]);
  const filteredResults = useMemo(() => productResults.results.filter((r) => r.company.toLowerCase().includes(q)), [productResults.results, q]);

  if (!has('vendors:read')) return <EmptyState title="No access" message="You don't have permission to view vendors." />;
  if (isLoading) return <LoadingState />;
  if (error && vendors.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  const open = (vendorId: string, linkId?: string) => {
    router.push({ pathname: '/vendors/pricing/vendor', params: { vendorId } } as never);
    if (linkId) router.push({ pathname: '/vendors/pricing/link', params: { vendorId, linkId } } as never);
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <SearchBar value={vendorSearch} onChangeText={setVendorSearch} placeholder="Search vendors" />
        <SearchBar value={productSearch} onChangeText={setProductSearch} placeholder="Search vendors by product" />
        {searching ? <SwitchRow label="Include inactive pricing" value={includeInactive} onValueChange={setIncludeInactive} /> : null}
      </View>
      {searching ? (
        productResults.isLoading ? <LoadingState /> : (
          <FlatList
            data={filteredResults}
            keyExtractor={(r) => r.vendorId}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await productResults.refetch(); setRefreshing(false); }} />}
            ListEmptyComponent={<EmptyState title="No vendors found for this product" />}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" onPress={() => open(item.vendorId, item.matches[0]?.linkId)} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text variant="label">{item.company}</Text>
                {item.matches.map((m) => <Text key={m.linkId} variant="caption" muted>{m.productName} · Rs {m.purchasePrice.toFixed(2)}{m.isActive ? '' : ' (inactive)'}</Text>)}
              </Pressable>
            )}
          />
        )
      ) : (
        <FlatList
          data={filteredVendors}
          keyExtractor={(v) => v.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState title="No vendors found" />}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => open(item.id)} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text variant="label">{item.company}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: spacing.lg, gap: spacing.md },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm, flexGrow: 1 },
  row: { minHeight: TOUCH_TARGET, justifyContent: 'center', gap: 2, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
