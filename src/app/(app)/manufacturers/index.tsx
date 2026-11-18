import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { ListRow, pickBySeed } from '@/components/ui/list-row';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useBranches } from '@/features/branches/use-branches';
import { useManufacturers } from '@/features/manufacturers/use-manufacturers';
import { spacing, useTheme } from '@/theme';
import type { Manufacturer } from '@/types/medicore';

const ICONS = ['pill', 'office-building', 'flask-outline', 'medical-bag', 'factory'] as const;

export default function ManufacturersScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { manufacturers, isLoading, error, refetch, setStatus } = useManufacturers();
  const { branchId } = useBranchFilter();
  const { branches } = useBranches();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Manufacturer | null>(null);

  // A specific branch shows only its own manufacturers; legacy ones with no branch appear under "All branches".
  const visible = useMemo(
    () => manufacturers.filter((m) => (!branchId || m.branchId === branchId) && m.name.toLowerCase().includes(search.trim().toLowerCase())),
    [manufacturers, branchId, search],
  );
  const branchName = (id?: string) => (id ? (branches.find((b) => b.id === id)?.name ?? '—') : 'All branches');
  const canUpdate = has('manufacturers:update');

  const edit = (m: Manufacturer) => canUpdate && router.push({ pathname: '/manufacturers/form', params: { id: m.id } } as never);

  if (isLoading) return <LoadingState />;
  if (error && manufacturers.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={visible}
      keyExtractor={(m) => m.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Button label="New Manufacturer" disabled={!has('manufacturers:create')} onPress={() => router.push('/manufacturers/form' as never)} />
          <BranchFilter />
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search manufacturers" />
        </View>
      }
      ListEmptyComponent={
        manufacturers.length === 0
          ? <EmptyState title="No manufacturers yet" message="Add the companies that make your products before adding products" />
          : <EmptyState title="No matching manufacturers" message="Try a different search or branch" />
      }
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={`${branchName(item.branchId)} · ${item.country || '—'}`}
          icon={pickBySeed(item.id, ICONS)}
          seed={item.id}
          status={item.isActive ? { label: 'Active', tone: 'success' } : { label: 'Inactive', tone: 'neutral' }}
          onPress={() => setSelected(item)}
        />
      )}
      ListFooterComponent={
        <ActionSheet
          title={selected?.name}
          subtitle={selected ? `Contact: ${selected.contactPhone || '—'}` : undefined}
          onClose={() => setSelected(null)}
          actions={
            selected && [
              ...(canUpdate ? [{ label: 'Edit', onPress: () => edit(selected) }] : []),
              { label: selected.isActive ? 'Deactivate' : 'Activate', disabled: !canUpdate, destructive: selected.isActive, onPress: () => void setStatus(selected.id, !selected.isActive).catch(() => undefined) },
            ]
          }
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { gap: spacing.md, padding: spacing.lg },
});
