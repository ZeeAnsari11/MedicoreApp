import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { ChipRow } from '@/components/chip-row';
import { SortBar } from '@/components/sort-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { matchesStockFilter, STOCK_FILTERS, type StockFilter } from '@/features/inventory/stock-filters';
import { useInventoryRollup } from '@/features/inventory/use-inventory';
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
        return (
          <Card>
            <View style={styles.between}>
              <Text variant="heading" style={styles.flex} onPress={() => openBatches(item)}>{item.productName}</Text>
              <Text variant="heading">{item.totalQuantity}</Text>
            </View>
            <Text muted>Unit: {item.unit}{item.barcode ? ` · ${item.barcode}` : ''}</Text>
            <View style={styles.badges}>
              {item.isLowStock ? <Badge label="Low stock" tone="warning" /> : null}
              {item.totalQuantity <= 0 ? <Badge label="Out of stock" tone="danger" /> : null}
              {item.expiredQuantity ? <Badge label={`${item.expiredQuantity} expired`} tone="danger" /> : null}
            </View>
            <View style={styles.between}>
              <Text muted>Nearest expiry: {item.nearestExpiryDate ? formatDate(item.nearestExpiryDate) : '—'}</Text>
              {expiry ? <Badge label={expiry.label} tone={expiry.tone} /> : null}
            </View>
            {has('vendors:read') ? <Text muted>Vendors: {vendors.length === 0 ? '—' : vendors.map((v) => `${v.company}: ${formatRs(v.purchasePrice)}`).join(', ')}</Text> : null}
            <Button label="View batches" variant="secondary" onPress={() => openBatches(item)} />
          </Card>
        );
      }}
      ListFooterComponent={list.hasMore ? <Text muted style={styles.footer}>Showing {list.visible.length} of {list.total}</Text> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  footer: { textAlign: 'center', padding: spacing.md },
});
