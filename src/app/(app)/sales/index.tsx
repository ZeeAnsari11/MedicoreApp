import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { ChipRow } from '@/components/chip-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useCustomers } from '@/features/customers/use-customers';
import { useOrderBookers, useSalesPage } from '@/features/sales/use-sales';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { spacing, useTheme } from '@/theme';
import { PaymentStatus } from '@/types/medicore';

const PAGE_SIZE = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function SalesScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { branchId } = useBranchFilter();
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [bookerId, setBookerId] = useState('');
  const [payment, setPayment] = useState('');
  const [returns, setReturns] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const debounced = useDebouncedValue(search, 300);

  const { customers } = useCustomers(branchId);
  const { orderBookers } = useOrderBookers(branchId, has('sales:view_all'));
  const { sales, total, isLoading, isFetching, error, refetch } = useSalesPage({
    branchId,
    search: debounced.trim() || undefined,
    customerId: customerId || undefined,
    orderBookerId: bookerId || undefined,
    paymentStatus: payment || undefined,
    returnStatus: returns || undefined,
    startDate: ISO_DATE.test(start) ? start : undefined,
    endDate: ISO_DATE.test(end) ? end : undefined,
    page,
    limit: PAGE_SIZE,
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  if (isLoading) return <LoadingState />;
  if (error && sales.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={sales}
      keyExtractor={(s) => s.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Button label="New Sale" disabled={!has('sales:create')} onPress={() => router.push('/sales/new' as never)} />
          <BranchFilter />
          <SearchBar value={search} onChangeText={reset(setSearch)} placeholder="Search invoice number or customer" />
          <PickerField label="Customer" value={customerId} onChange={reset(setCustomerId)} clearable placeholder="All customers" options={customers.map((c) => ({ value: c.id, label: c.name }))} />
          {has('sales:view_all') ? (
            <PickerField label="Order Booker" value={bookerId} onChange={reset(setBookerId)} clearable placeholder="All order bookers" options={orderBookers.map((o) => ({ value: o.id, label: o.name }))} />
          ) : null}
          <ChipRow
            label="Payment"
            value={payment}
            onChange={reset(setPayment)}
            options={[{ value: '', label: 'All' }, { value: PaymentStatus.PAID, label: 'Paid' }, { value: PaymentStatus.PARTIAL, label: 'Partial' }, { value: PaymentStatus.UNPAID, label: 'Unpaid' }]}
          />
          <ChipRow
            label="Returns"
            value={returns}
            onChange={reset(setReturns)}
            options={[{ value: '', label: 'All' }, { value: 'NONE', label: 'None' }, { value: 'PARTIAL', label: 'Partial' }, { value: 'FULL', label: 'Full' }]}
          />
          <View style={styles.row}>
            <View style={styles.flex}><Input label="From (YYYY-MM-DD)" value={start} onChangeText={reset(setStart)} autoCapitalize="none" /></View>
            <View style={styles.flex}><Input label="To (YYYY-MM-DD)" value={end} onChangeText={reset(setEnd)} autoCapitalize="none" /></View>
          </View>
          <Text variant="caption" muted>Sorted newest first by the server. Pending orders appear in Process Orders until they are confirmed.</Text>
        </View>
      }
      ListEmptyComponent={<EmptyState title="No sales found" message="Try a different search or filter" />}
      renderItem={({ item }) => (
        <Card>
          <View style={styles.between}>
            <Text variant="heading" style={styles.flex} onPress={() => router.push({ pathname: '/sales/detail', params: { id: item.id, branchId: item.branchId } } as never)}>{item.invoiceNumber}</Text>
            <Badge label={item.paymentStatus} tone={item.paymentStatus === PaymentStatus.PAID ? 'success' : item.paymentStatus === PaymentStatus.PARTIAL ? 'warning' : 'neutral'} />
          </View>
          <Text muted>{formatDate(item.saleDate)} · {item.customerName ?? 'Walk-in'}</Text>
          <Text muted>Order Booker: {item.orderBookerName}</Text>
          <View style={styles.between}>
            <Text muted>Total</Text>
            <Text variant="label">{formatRs(item.grandTotal)}</Text>
          </View>
          {item.returnStatus && item.returnStatus !== 'NONE' ? <Badge label={`Returns: ${item.returnStatus}`} tone="warning" /> : null}
          <Button label="View details" variant="secondary" onPress={() => router.push({ pathname: '/sales/detail', params: { id: item.id, branchId: item.branchId } } as never)} />
        </Card>
      )}
      ListFooterComponent={
        <View style={styles.header}>
          <View style={styles.row}>
            <View style={styles.flex}><Button label="Previous" variant="secondary" disabled={page <= 1 || isFetching} onPress={() => setPage((p) => p - 1)} /></View>
            <View style={styles.flex}><Button label="Next" variant="secondary" disabled={page >= pageCount || isFetching} onPress={() => setPage((p) => p + 1)} /></View>
          </View>
          <Text variant="caption" muted style={styles.center}>Page {page} of {pageCount} · {total} sales</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  center: { textAlign: 'center' },
});
