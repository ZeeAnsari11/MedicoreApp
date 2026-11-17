import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useBranches } from '@/features/branches/use-branches';
import { useManufacturers } from '@/features/manufacturers/use-manufacturers';
import { spacing, useTheme } from '@/theme';
import type { Manufacturer } from '@/types/medicore';

export default function ManufacturersScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { manufacturers, isLoading, error, refetch, setStatus } = useManufacturers();
  const { branchId } = useBranchFilter();
  const { branches } = useBranches();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
        <Card>
          <View style={styles.rowHead}>
            <Text variant="heading" style={styles.flex} onPress={() => edit(item)}>{item.name}</Text>
            <Badge label={item.isActive ? 'Active' : 'Inactive'} tone={item.isActive ? 'success' : 'neutral'} />
          </View>
          <Text muted>Branch: {branchName(item.branchId)}</Text>
          <Text muted>Country: {item.country || '—'}</Text>
          <Text muted>Contact: {item.contactPhone || '—'}</Text>
          <SwitchRow label="Active" value={item.isActive} disabled={!canUpdate} onValueChange={(v) => void setStatus(item.id, v).catch(() => undefined)} />
          {canUpdate ? <Button label="Edit" variant="secondary" onPress={() => edit(item)} /> : null}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
