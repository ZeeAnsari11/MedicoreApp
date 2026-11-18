import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageFooter } from '@/components/page-footer';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { formatDate } from '@/lib/dates';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { spacing } from '@/theme';
import type { CashTransactionSummary } from '@/types/medicore';

import { money } from './sheet';
import { useCashTransactionsPage } from './use-cash-receipts';

const LIMIT = 20;

/** Saved cash-receipt transactions (T-0001...), searchable; tapping one opens it on the Cash Receipt screen. */
export function CashTransactionsScreen() {
  return (
    <RequirePermission permission="cash_receipt:read" what="see cash receipt transactions">
      <TransactionsList />
    </RequirePermission>
  );
}

const customersLabel = (names: string[]) => (names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`);

function TransactionsList() {
  const { branchId } = useBranchFilter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebouncedValue(search.trim(), 300);
  const { transactions, total, isLoading, isFetching, error, refetch } = useCashTransactionsPage({ branchId, q: q || undefined, page, limit: LIMIT });
  const pageCount = Math.max(1, Math.ceil(total / LIMIT));

  const open = (t: CashTransactionSummary) => router.push({ pathname: '/sales/cash-receipt', params: { transaction: t.transactionNumber } } as never);

  if (isLoading) return <LoadingState />;
  if (error && transactions.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={transactions}
      keyExtractor={(t) => t.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <SearchBar value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} placeholder="Search T-0001, CR-000001, customer or invoice" />
          <Button label="New cash receipt" variant="secondary" onPress={() => router.push('/sales/cash-receipt' as never)} />
        </View>
      }
      ListEmptyComponent={<EmptyState title={q ? 'No transactions found' : 'No transactions yet'} message={q ? 'Try a different search' : 'Every saved cash receipt gets a number like T-0001'} />}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.transactionNumber}`} onPress={() => open(item)}>
          <Card>
            <View style={styles.between}>
              <Text variant="heading">{item.transactionNumber}</Text>
              {item.editedAt ? <Badge label={`Edited v${item.version}`} tone="warning" /> : null}
            </View>
            <Text muted>{item.voucherNumber} · {formatDate(item.date)}</Text>
            <Text variant="caption" muted numberOfLines={1}>{customersLabel(item.customers)}</Text>
            <View style={styles.between}>
              <Text variant="caption" muted>{item.count} {item.count === 1 ? 'entry' : 'entries'}</Text>
              <Text variant="label">Rs. {money(item.total)}</Text>
            </View>
          </Card>
        </Pressable>
      )}
      ListFooterComponent={<PageFooter page={page} pageCount={pageCount} total={total} noun="transactions" busy={isFetching} onPrevious={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
