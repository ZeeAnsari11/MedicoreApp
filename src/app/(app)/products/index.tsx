import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { SortBar } from '@/components/sort-bar';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranches } from '@/features/branches/use-branches';
import { productIcon } from '@/features/products/product-icon';
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
  const [selected, setSelected] = useState<Product | null>(null);
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
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={`${branchName(item.branchId)} · ${item.manufacturer?.name || '—'}`}
          detail={`${item.genericName || '—'} · TP ${item.tp.toFixed(2)} · CP ${item.cp.toFixed(2)} · RP ${item.rp.toFixed(2)}`}
          icon={productIcon(item.id)}
          seed={item.id}
          status={item.status === ProductStatus.ACTIVE ? { label: 'Active', tone: 'success' } : { label: 'Discontinued', tone: 'neutral' }}
          onPress={() => setSelected(item)}
        />
      )}
      ListFooterComponent={
        <>
          {list.hasMore ? <Text muted style={styles.footer}>Showing {list.visible.length} of {list.total}</Text> : null}
          <ActionSheet
            title={selected?.name}
            subtitle={selected ? productSheetSubtitle(selected, vendorsByProduct.get(selected.id) ?? []) : undefined}
            onClose={() => setSelected(null)}
            actions={
              selected && [
                { label: 'Edit', disabled: !canUpdate, onPress: () => edit(selected) },
                { label: 'Print barcode', onPress: () => router.push({ pathname: '/products/barcode', params: { id: selected.id } } as never) },
                {
                  label: selected.status === ProductStatus.ACTIVE ? 'Discontinue' : 'Reactivate',
                  disabled: !canUpdate,
                  destructive: selected.status === ProductStatus.ACTIVE,
                  onPress: () => void toggleStatus(selected),
                },
              ]
            }
          />
        </>
      }
    />
  );
}

/** Unit and the vendor prices that used to sit on the card (web Vendors column). */
const productSheetSubtitle = (p: Product, vendors: { company: string; purchasePrice: number }[]) =>
  `Unit: ${p.unit} · Vendors: ${vendors.length === 0 ? '—' : vendors.map((v) => `${v.company}: ${formatRs(v.purchasePrice)}`).join(', ')}`;

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { gap: spacing.md, padding: spacing.lg },
  footer: { textAlign: 'center', padding: spacing.md },
});
