import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { SortBar } from '@/components/sort-bar';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { ListRow, pickBySeed } from '@/components/ui/list-row';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranches } from '@/features/branches/use-branches';
import { useVendors } from '@/features/vendors/use-vendors';
import { compareText, useClientList } from '@/lib/use-client-list';
import { spacing, useTheme } from '@/theme';
import type { Vendor } from '@/types/medicore';

const ICONS = ['truck-delivery-outline', 'store-outline', 'warehouse', 'package-variant-closed'] as const;

const SORTS = [
  { key: 'company', label: 'Company' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
];

export default function VendorsScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { vendors, isLoading, error, refetch, setStatus } = useVendors();
  const { branches } = useBranches();
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name ?? '—';

  const list = useClientList(vendors, {
    searchText: (v) => [v.company, branchName(v.branchId), v.distributorType, v.contactPhone, v.contactName, v.isActive ? 'active' : 'inactive'].join(' '),
    sorters: {
      company: (a, b) => compareText(a.company, b.company),
      type: (a, b) => compareText(a.distributorType, b.distributorType),
      status: (a, b) => Number(b.isActive) - Number(a.isActive),
    },
    defaultSort: 'company',
  });
  const canUpdate = has('vendors:update');
  const edit = (v: Vendor) => canUpdate && router.push({ pathname: '/vendors/form', params: { id: v.id } } as never);

  if (isLoading) return <LoadingState />;
  if (error && vendors.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={list.visible}
      keyExtractor={(v) => v.id}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => list.hasMore && list.loadMore()}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Button label="New Vendor" disabled={!has('vendors:create')} onPress={() => router.push('/vendors/form' as never)} />
          <Button label="Manage Pricing" variant="secondary" onPress={() => router.push('/vendors/pricing' as never)} />
          <BranchFilter />
          <SearchBar value={list.query} onChangeText={list.setQuery} placeholder="Search vendors" />
          <SortBar options={SORTS} sortKey={list.sortKey} dir={list.dir} onSort={list.setSort} />
        </View>
      }
      ListEmptyComponent={vendors.length === 0 ? <EmptyState title="No vendors yet" message="Add a vendor to start recording purchases" /> : <EmptyState title="No matching vendors" message="Try a different search" />}
      renderItem={({ item }) => (
        <ListRow
          title={item.company}
          subtitle={`${branchName(item.branchId)} · ${item.distributorType || '—'}`}
          icon={pickBySeed(item.id, ICONS)}
          seed={item.id}
          status={item.isActive ? { label: 'Active', tone: 'success' } : { label: 'Inactive', tone: 'neutral' }}
          onPress={() => setSelected(item)}
        />
      )}
      ListFooterComponent={
        <>
          {list.hasMore ? <Text muted style={styles.footer}>Showing {list.visible.length} of {list.total}</Text> : null}
          <ActionSheet
            title={selected?.company}
            subtitle={selected ? `Contact: ${[selected.contactName, selected.contactPhone].filter(Boolean).join(' · ') || '—'}` : undefined}
            onClose={() => setSelected(null)}
            actions={
              selected && [
                ...(canUpdate ? [{ label: 'Edit', onPress: () => edit(selected) }] : []),
                { label: 'Manage pricing', onPress: () => router.push({ pathname: '/vendors/pricing/vendor', params: { vendorId: selected.id } } as never) },
                { label: 'View ledger', disabled: !has('acc_vendor_ledger:read'), onPress: () => router.push({ pathname: '/accounting/vendor-ledger', params: { view: 'ledger', party: selected.id } } as never) },
                { label: selected.isActive ? 'Deactivate' : 'Activate', disabled: !canUpdate, destructive: selected.isActive, onPress: () => void setStatus(selected.id, !selected.isActive).catch(() => undefined) },
              ]
            }
          />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { gap: spacing.md, padding: spacing.lg },
  footer: { textAlign: 'center', padding: spacing.md },
});
