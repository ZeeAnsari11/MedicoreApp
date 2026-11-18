import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { ChipRow } from '@/components/chip-row';
import { SortBar } from '@/components/sort-bar';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { matchesStockFilter, STOCK_FILTERS, type StockFilter } from '@/features/inventory/stock-filters';
import { useInventoryRollup } from '@/features/inventory/use-inventory';
import { productIcon } from '@/features/products/product-icon';
import { useVendorSummary } from '@/features/vendor-products/use-vendor-products';
import { expiryStatus, formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { compareNumber, compareText, useClientList } from '@/lib/use-client-list';
import { spacing, useTheme } from '@/theme';
import type { InventoryRollup } from '@/types/medicore';

const SORTS = [
  { key: 'product', label: 'Product' },
  { key: 'onHand', label: 'On hand' },
  { key: 'expiry', label: 'Nearest expiry' },
];

export default function InventoryScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { branchId } = useBranchFilter();
  const { rollup, isLoading, error, refetch } = useInventoryRollup(branchId);
  const vendorsByProduct = useVendorSummary(has('vendors:read'));
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => rollup.filter((r) => matchesStockFilter(r, stockFilter)), [rollup, stockFilter]);
  const list = useClientList(filtered, {
    searchText: (r) => [r.productName, r.unit, r.barcode].join(' '),
    sorters: {
      product: (a, b) => compareText(a.productName, b.productName),
      onHand: (a, b) => compareNumber(a.totalQuantity, b.totalQuantity),
      // no expiry sorts last in ascending order
      expiry: (a, b) => (a.nearestExpiryDate ?? '9999').localeCompare(b.nearestExpiryDate ?? '9999'),
    },
    defaultSort: 'product',
  });

  const openBatches = (r: InventoryRollup) =>
    router.push({ pathname: '/inventory/batches', params: { productId: r.productId, productName: r.productName, branchId: branchId ?? '' } } as never);

  if (isLoading) return <LoadingState />;
  if (error && rollup.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={list.visible}
      keyExtractor={(r) => r.productId}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => list.hasMore && list.loadMore()}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Button label="Adjust Stock" disabled={!has('inventory:adjust')} onPress={() => router.push({ pathname: '/inventory/adjust', params: { branchId: branchId ?? '' } } as never)} />
          <View style={styles.actions}>
            <View style={styles.flex}><Button label="Expiring stock" variant="secondary" onPress={() => router.push('/inventory/expiring' as never)} /></View>
            <View style={styles.flex}><Button label="Transfers" variant="secondary" onPress={() => router.push('/inventory/transfers' as never)} /></View>
          </View>
          <BranchFilter />
          <SearchBar value={list.query} onChangeText={list.setQuery} placeholder="Search product, unit or barcode" />
          <ChipRow label="Stock" value={stockFilter} onChange={setStockFilter} options={STOCK_FILTERS} />
          <SortBar options={SORTS} sortKey={list.sortKey} dir={list.dir} onSort={list.setSort} />
        </View>
      }
      ListEmptyComponent={
        rollup.length === 0 ? <EmptyState title="No stock yet" message="Receive a purchase or adjust stock to get started" /> : <EmptyState title="No matching products" message="Try a different search or stock filter" />
      }
      renderItem={({ item }) => {
        const vendors = vendorsByProduct.get(item.productId) ?? [];
        const expiry = item.nearestExpiryDate ? expiryStatus(item.nearestExpiryDate) : null;
        const out = item.totalQuantity <= 0;
        // Expired units or an expiry within 30 days are highlighted; further-out dates stay muted.
        const expiryColor = item.expiredQuantity || expiry?.tone === 'danger' ? theme.danger : expiry?.tone === 'warning' ? theme.warning : undefined;
        const details = [
          item.barcode,
          item.minStockLevel !== undefined ? `Min ${item.minStockLevel}` : undefined,
          has('vendors:read') ? `Vendors: ${vendors.length === 0 ? '—' : vendors.map((v) => `${v.company}: ${formatRs(v.purchasePrice)}`).join(', ')}` : undefined,
        ].filter(Boolean);
        return (
          <ListRow
            title={item.productName}
            subtitleIcon="calendar-clock"
            subtitleColor={expiryColor}
            subtitle={[
              item.nearestExpiryDate ? `Expiry ${formatDate(item.nearestExpiryDate)} · ${expiry!.label}` : 'No expiry date',
              item.expiredQuantity ? `${item.expiredQuantity} expired` : undefined,
            ].filter(Boolean).join(' · ')}
            detail={details.length ? details.join(' · ') : undefined}
            icon={productIcon(item.productId)}
            seed={item.productId}
            status={out ? { label: 'Out of stock', tone: 'danger' } : item.isLowStock ? { label: 'Low stock', tone: 'warning' } : { label: 'In stock', tone: 'success' }}
            trailing={
              <View style={styles.qty}>
                <Text variant="heading" color={out ? theme.danger : undefined}>{item.totalQuantity}</Text>
                <Text variant="caption" muted>{item.unit}</Text>
              </View>
            }
            onPress={() => openBatches(item)}
          />
        );
      }}
      ListFooterComponent={list.hasMore ? <Text muted style={styles.footer}>Showing {list.visible.length} of {list.total}</Text> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { gap: spacing.md, padding: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md },
  qty: { alignItems: 'flex-end', minWidth: 48 },
  footer: { textAlign: 'center', padding: spacing.md },
});
