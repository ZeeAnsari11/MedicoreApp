import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { SortBar } from '@/components/sort-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranches } from '@/features/branches/use-branches';
import { useProducts } from '@/features/products/use-products';
import { useVendorSummary } from '@/features/vendor-products/use-vendor-products';
import { confirmAction } from '@/lib/confirm';
import { formatRs } from '@/lib/format';
import { compareNumber, compareText, useClientList } from '@/lib/use-client-list';
import { spacing, useTheme } from '@/theme';
import { ProductStatus, type Product } from '@/types/medicore';

const SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'generic', label: 'Generic' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'tp', label: 'TP' },
  { key: 'cp', label: 'CP' },
  { key: 'rp', label: 'RP' },
  { key: 'status', label: 'Status' },
];

export default function ProductsScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { products, isLoading, error, refetch, setStatus } = useProducts();
  const { branches } = useBranches();
  const vendorsByProduct = useVendorSummary(has('vendors:read'));
  const [genericSearch, setGenericSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name ?? '—';

  const byGeneric = useMemo(() => {
    const q = genericSearch.trim().toLowerCase();
    return q ? products.filter((p) => p.genericName?.toLowerCase().includes(q)) : products;
  }, [products, genericSearch]);

  const list = useClientList(byGeneric, {
    searchText: (p) => [p.name, p.genericName, p.manufacturer?.name, branchName(p.branchId), p.unit, p.barcode, p.tp, p.cp, p.rp, p.status].join(' '),
    sorters: {
      name: (a, b) => compareText(a.name, b.name),
      generic: (a, b) => compareText(a.genericName, b.genericName),
      manufacturer: (a, b) => compareText(a.manufacturer?.name, b.manufacturer?.name),
      tp: (a, b) => compareNumber(a.tp, b.tp),
      cp: (a, b) => compareNumber(a.cp, b.cp),
      rp: (a, b) => compareNumber(a.rp, b.rp),
      status: (a, b) => compareText(a.status, b.status),
    },
    defaultSort: 'name',
  });

  const canUpdate = has('products:update');
  const edit = (p: Product) => canUpdate && router.push({ pathname: '/products/form', params: { id: p.id } } as never);

  const toggleStatus = async (p: Product) => {
    const discontinue = p.status === ProductStatus.ACTIVE;
    const ok = await confirmAction({
      title: discontinue ? 'Discontinue product?' : 'Reactivate product?',
      message: discontinue ? `${p.name} will be marked discontinued.` : `${p.name} will be active again.`,
      confirmLabel: discontinue ? 'Discontinue' : 'Reactivate',
      destructive: discontinue,
    });
    if (ok) await setStatus(p.id, discontinue ? ProductStatus.DISCONTINUED : ProductStatus.ACTIVE).catch(() => undefined);
  };

  if (isLoading) return <LoadingState />;
  if (error && products.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={list.visible}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => list.hasMore && list.loadMore()}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Button label="New Product" disabled={!has('products:create')} onPress={() => router.push('/products/form' as never)} />
          <BranchFilter />
          <SearchBar value={list.query} onChangeText={list.setQuery} placeholder="Search products" />
          <SearchBar value={genericSearch} onChangeText={setGenericSearch} placeholder="Search by generic name" />
          <SortBar options={SORTS} sortKey={list.sortKey} dir={list.dir} onSort={list.setSort} />
        </View>
      }
      ListEmptyComponent={products.length === 0 ? <EmptyState title="No products yet" message="Add your first product to the catalog" /> : <EmptyState title="No matching products" message="Try a different search" />}
      renderItem={({ item }) => {
        const vendors = vendorsByProduct.get(item.id) ?? [];
        return (
          <Card>
            <View style={styles.rowHead}>
              <Text variant="heading" style={styles.flex} onPress={() => edit(item)}>{item.name}</Text>
              <Badge label={item.status === ProductStatus.ACTIVE ? 'Active' : 'Discontinued'} tone={item.status === ProductStatus.ACTIVE ? 'success' : 'neutral'} />
            </View>
            <Text muted>{item.genericName || '—'} · {item.manufacturer?.name || '—'}</Text>
            <Text muted>Branch: {branchName(item.branchId)} · Unit: {item.unit}</Text>
            <Text muted>Vendors: {vendors.length === 0 ? '—' : vendors.map((v) => `${v.company}: ${formatRs(v.purchasePrice)}`).join(', ')}</Text>
            <View style={styles.prices}>
              <Text variant="label">TP {item.tp.toFixed(2)}</Text>
              <Text variant="label">CP {item.cp.toFixed(2)}</Text>
              <Text variant="label">RP {item.rp.toFixed(2)}</Text>
            </View>
            <View style={styles.actions}>
              <Button label="Edit" variant="secondary" disabled={!canUpdate} onPress={() => edit(item)} />
              <Button label="Print barcode" variant="secondary" onPress={() => router.push({ pathname: '/products/barcode', params: { id: item.id } } as never)} />
              <Button label={item.status === ProductStatus.ACTIVE ? 'Discontinue' : 'Reactivate'} variant="secondary" disabled={!canUpdate} onPress={() => void toggleStatus(item)} />
            </View>
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
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  prices: { flexDirection: 'row', gap: spacing.lg },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  footer: { textAlign: 'center', padding: spacing.md },
});
