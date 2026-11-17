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
import { useBranches } from '@/features/branches/use-branches';
import { useCustomers } from '@/features/customers/use-customers';
import { confirmAction } from '@/lib/confirm';
import { compareNumber, compareText, useClientList } from '@/lib/use-client-list';
import { formatRs } from '@/lib/format';
import { spacing, useTheme } from '@/theme';
import type { Customer } from '@/types/medicore';

const SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'type', label: 'Type' },
];
type TypeFilter = 'all' | 'retail' | 'dealer';
type BalanceFilter = 'all' | 'due';

const OWES_THRESHOLD = 0.01;

export default function CustomersScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { customers, isLoading, error, refetch, remove, isRemoving } = useCustomers();
  const { branches } = useBranches();
  const [refreshing, setRefreshing] = useState(false);
  const [type, setType] = useState<TypeFilter>('all');
  const [balance, setBalance] = useState<BalanceFilter>('all');
  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name ?? '—';

  const filtered = useMemo(
    () =>
      customers.filter((c) => (type === 'all' || (type === 'dealer') === c.isDealer) && (balance === 'all' || (c.outstandingBalance ?? 0) > OWES_THRESHOLD)),
    [customers, type, balance],
  );
  const list = useClientList(filtered, {
    searchText: (c) => [c.name, c.phone, c.address, branchName(c.branchId), c.isDealer ? 'dealer' : 'retail'].join(' '),
    sorters: {
      name: (a, b) => compareText(a.name, b.name),
      outstanding: (a, b) => compareNumber(a.outstandingBalance, b.outstandingBalance),
      type: (a, b) => Number(b.isDealer) - Number(a.isDealer),
    },
    defaultSort: 'name',
  });

  const open = (c: Customer) => router.push({ pathname: '/customers/detail', params: { id: c.id } } as never);
  const edit = (c: Customer) => router.push({ pathname: '/customers/form', params: { id: c.id } } as never);
  const del = async (c: Customer) => {
    if (!(await confirmAction({ title: 'Delete this customer?', message: c.name, confirmLabel: 'Delete', destructive: true }))) return;
    await remove(c.id).catch(() => undefined); // the mutation already toasted the server's reason (e.g. outstanding balance)
  };

  if (isLoading) return <LoadingState />;
  if (error && customers.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={list.visible}
      keyExtractor={(c) => c.id}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => list.hasMore && list.loadMore()}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Button label="New Customer" disabled={!has('customers:create')} onPress={() => router.push('/customers/form' as never)} />
          <BranchFilter />
          <SearchBar value={list.query} onChangeText={list.setQuery} placeholder="Search name, phone or address" />
          <ChipRow label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, { value: 'retail', label: 'Retail' }, { value: 'dealer', label: 'Dealer' }]} />
          <ChipRow label="Balance" value={balance} onChange={setBalance} options={[{ value: 'all', label: 'All' }, { value: 'due', label: 'Owes money' }]} />
          <SortBar options={SORTS} sortKey={list.sortKey} dir={list.dir} onSort={list.setSort} />
        </View>
      }
      ListEmptyComponent={
        customers.length === 0 ? <EmptyState title="No customers yet" message="Add a customer to start recording sales" /> : <EmptyState title="No matching customers" message="Try a different search or filter" />
      }
      renderItem={({ item }) => {
        const due = item.outstandingBalance ?? 0;
        return (
          <Card>
            <View style={styles.rowHead}>
              <Text variant="heading" style={styles.flex} onPress={() => open(item)}>{item.name}</Text>
              <Badge label={item.isDealer ? 'Dealer' : 'Retail'} tone={item.isDealer ? 'success' : 'neutral'} />
            </View>
            <Text muted>Phone: {item.phone || '—'}</Text>
            <Text muted>Branch: {branchName(item.branchId)}</Text>
            <View style={styles.rowHead}>
              <Text muted>Outstanding</Text>
              <Badge label={formatRs(due)} tone={due > OWES_THRESHOLD ? 'warning' : 'neutral'} />
            </View>
            <Button label="View details" variant="secondary" onPress={() => open(item)} />
            <Button label="View ledger" variant="secondary" disabled={!has('acc_customer_ledger:read')} onPress={() => router.push({ pathname: '/accounting/customer-ledger', params: { view: 'ledger', party: item.id } } as never)} />
            <View style={styles.actions}>
              <View style={styles.flex}><Button label="Edit" variant="secondary" disabled={!has('customers:update')} onPress={() => edit(item)} /></View>
              <View style={styles.flex}><Button label="Delete" variant="danger" disabled={!has('customers:delete') || isRemoving} onPress={() => void del(item)} /></View>
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
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: spacing.md },
  footer: { textAlign: 'center', padding: spacing.md },
});
