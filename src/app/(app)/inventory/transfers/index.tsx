import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranches } from '@/features/branches/use-branches';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useStockTransfers } from '@/features/transfers/use-transfers';
import { formatDate } from '@/lib/dates';
import { useClientList } from '@/lib/use-client-list';
import { spacing, useTheme } from '@/theme';

export default function TransfersScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { branchId } = useBranchFilter();
  const { branches } = useBranches();
  const { transfers, isLoading, error, refetch } = useStockTransfers(branchId);
  const [refreshing, setRefreshing] = useState(false);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const list = useClientList(transfers, {
    searchText: (t) => [t.transferNumber, branchName(t.branchId), branchName(t.toBranchId), t.note, ...t.lines.map((l) => `${l.productName} ${l.batchNumber}`)].join(' '),
    // the API already returns newest first
    sorters: { newest: (a, b) => b.createdAt.localeCompare(a.createdAt) },
    defaultSort: 'newest',
  });

  if (isLoading) return <LoadingState />;
  if (error && transfers.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={list.visible}
      keyExtractor={(t) => t._id}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => list.hasMore && list.loadMore()}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Button label="New Transfer" disabled={!has('inventory:adjust')} onPress={() => router.push('/inventory/transfers/new' as never)} />
          <BranchFilter />
          <SearchBar value={list.query} onChangeText={list.setQuery} placeholder="Search number, branch or product" />
        </View>
      }
      ListEmptyComponent={transfers.length === 0 ? <EmptyState title="No transfers yet" message="Move stock between branches with New Transfer" /> : <EmptyState title="No matching transfers" message="Try a different search" />}
      renderItem={({ item }) => (
        <Card>
          <View style={styles.between}>
            <Text variant="heading" onPress={() => router.push({ pathname: '/inventory/transfers/detail', params: { id: item._id } } as never)}>{item.transferNumber}</Text>
            <Text muted>{formatDate(item.createdAt)}</Text>
          </View>
          <Text>{branchName(item.branchId)} → {branchName(item.toBranchId)}</Text>
          <Text muted>{item.lines.length} {item.lines.length === 1 ? 'line' : 'lines'} · {item.lines.reduce((s, l) => s + l.quantity, 0)} units</Text>
          {item.note ? <Text muted>Note: {item.note}</Text> : null}
          <Button label="View" variant="secondary" onPress={() => router.push({ pathname: '/inventory/transfers/detail', params: { id: item._id } } as never)} />
        </Card>
      )}
      ListFooterComponent={list.hasMore ? <Text muted style={styles.footer}>Showing {list.visible.length} of {list.total}</Text> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  footer: { textAlign: 'center', padding: spacing.md },
});
