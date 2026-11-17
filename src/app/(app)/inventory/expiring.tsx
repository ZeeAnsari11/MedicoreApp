import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { ChipRow } from '@/components/chip-row';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useBranches } from '@/features/branches/use-branches';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useExpiringBatches } from '@/features/inventory/use-inventory';
import { expiryStatus, formatDate } from '@/lib/dates';
import { useClientList } from '@/lib/use-client-list';
import { spacing, useTheme } from '@/theme';

const WINDOWS = ['30', '60', '90'] as const;

/** Batches with stock expiring within N days (`GET /inventory/expiring`; already-expired stock is included by the backend). */
export default function ExpiringScreen() {
  const theme = useTheme();
  const { branchId } = useBranchFilter();
  const { branches } = useBranches();
  const [days, setDays] = useState<(typeof WINDOWS)[number]>('30');
  const { batches, isLoading, error, refetch } = useExpiringBatches(Number(days), branchId);
  const [refreshing, setRefreshing] = useState(false);
  const list = useClientList(batches, {
    searchText: (b) => [b.productName, b.batchNumber].join(' '),
    sorters: { expiry: (a, b) => a.expiryDate.localeCompare(b.expiryDate) },
    defaultSort: 'expiry',
  });

  if (isLoading) return <LoadingState />;
  if (error && batches.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={list.visible}
      keyExtractor={(b) => b.id}
      onEndReached={() => list.hasMore && list.loadMore()}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <BranchFilter />
          <ChipRow label="Within" value={days} onChange={setDays} options={WINDOWS.map((d) => ({ value: d, label: `${d} days` }))} />
          <SearchBar value={list.query} onChangeText={list.setQuery} placeholder="Search product or batch" />
        </View>
      }
      ListEmptyComponent={<EmptyState title="Nothing expiring" message={`No stock expires within ${days} days.`} />}
      renderItem={({ item }) => {
        const status = expiryStatus(item.expiryDate);
        return (
          <Card>
            <View style={styles.between}>
              <Text variant="heading" style={styles.flex} onPress={() => router.push({ pathname: '/inventory/batches', params: { productId: item.productId, productName: item.productName ?? '', branchId: item.branchId } } as never)}>{item.productName ?? 'Product'}</Text>
              <Badge label={status.label} tone={status.tone} />
            </View>
            <Text muted>Batch {item.batchNumber} · expires {formatDate(item.expiryDate)}</Text>
            <Text>Quantity: {item.quantity}</Text>
            {branchId === null ? <Text variant="caption" muted>Branch: {branches.find((b) => b.id === item.branchId)?.name ?? '—'}</Text> : null}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
