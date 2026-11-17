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
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useVendors } from '@/features/vendors/use-vendors';
import { formatDate, isValidIsoDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { spacing, useTheme } from '@/theme';
import { PaymentStatus, PurchaseStatus, ReturnStatus } from '@/types/medicore';

import { usePurchasesPage } from './use-purchases';

/** Web page-size options. */
export const PAGE_SIZES = ['10', '25', '50', '100', '250', '500'] as const;

const ALL = { value: '', label: 'All' };
const PAYMENT_OPTIONS = [ALL, ...Object.values(PaymentStatus).map((s) => ({ value: s as string, label: s }))];
const RETURN_OPTIONS = [ALL, { value: 'ANY', label: 'Any return' }, { value: ReturnStatus.PARTIAL as string, label: 'Partially returned' }, { value: ReturnStatus.FULL as string, label: 'Fully returned' }];
const STATUS_OPTIONS = [ALL, ...Object.values(PurchaseStatus).map((s) => ({ value: s as string, label: s }))];
const PAYMENT_TONE = { [PaymentStatus.PAID]: 'success', [PaymentStatus.PARTIAL]: 'warning', [PaymentStatus.UNPAID]: 'neutral' } as const;

export function PurchasesListScreen() {
  return (
    <RequirePermission permission="purchases:read" what="view purchases">
      <PurchasesList />
    </RequirePermission>
  );
}

function PurchasesList() {
  const theme = useTheme();
  const { has } = useAuth();
  const { branchId, branches } = useBranchFilter();
  const [search, setSearch] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [payment, setPayment] = useState('');
  const [returns, setReturns] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pageSize, setPageSize] = useState<string>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const debounced = useDebouncedValue(search, 300);

  const vendorsApi = useVendors(branchId);
  const limit = Number(pageSize);
  const { purchases, total, isLoading, isFetching, error, refetch } = usePurchasesPage({
    branchId,
    vendorId: vendorId || undefined,
    paymentStatus: payment || undefined,
    returnStatus: returns || undefined,
    status: status || undefined,
    dateFrom: isValidIsoDate(dateFrom) ? dateFrom : undefined,
    dateTo: isValidIsoDate(dateTo) ? dateTo : undefined,
    search: debounced.trim() || undefined,
    page,
    limit,
  });
  const pageCount = Math.max(1, Math.ceil(total / limit));
  // Any filter change goes back to the first page (web).
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const hasFilters = !!(vendorId || payment || returns || status || dateFrom || dateTo || search);
  const clear = () => { setVendorId(''); setPayment(''); setReturns(''); setStatus(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1); };

  if (isLoading) return <LoadingState />;
  if (error && purchases.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={purchases}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Button label="New Purchase" disabled={!has('purchases:create')} onPress={() => router.push('/purchases/new' as never)} />
          <BranchFilter />
          <SearchBar value={search} onChangeText={reset(setSearch)} placeholder="Search by PO #..." />
          <PickerField label="Vendor" value={vendorId} onChange={reset(setVendorId)} clearable placeholder="All vendors" options={vendorsApi.vendors.map((v) => ({ value: v.id, label: v.company }))} />
          <ChipRow label="Payment" value={payment} onChange={reset(setPayment)} options={PAYMENT_OPTIONS} />
          <ChipRow label="Returns" value={returns} onChange={reset(setReturns)} options={RETURN_OPTIONS} />
          <ChipRow label="Status" value={status} onChange={reset(setStatus)} options={STATUS_OPTIONS} />
          <View style={styles.row}>
            <View style={styles.flex}><Input label="From (YYYY-MM-DD)" value={dateFrom} onChangeText={reset(setDateFrom)} autoCapitalize="none" /></View>
            <View style={styles.flex}><Input label="To (YYYY-MM-DD)" value={dateTo} onChangeText={reset(setDateTo)} autoCapitalize="none" /></View>
          </View>
          <ChipRow label="Rows" value={pageSize} onChange={reset(setPageSize)} options={PAGE_SIZES.map((s) => ({ value: s, label: s }))} />
          {hasFilters ? <Button label="Clear filters" variant="secondary" onPress={clear} /> : null}
        </View>
      }
      ListEmptyComponent={
        hasFilters ? <EmptyState title="No purchases found" message="Try a different search or filter" /> : <EmptyState title="No purchases yet" message="Receive your first purchase from a vendor" />
      }
      renderItem={({ item }) => (
        <Card>
          <View style={styles.between}>
            <Text variant="heading" style={styles.flex} onPress={() => router.push({ pathname: '/purchases/detail', params: { id: item.id, branchId: item.branchId } } as never)}>{item.purchaseNumber}</Text>
            <Badge label={item.status} tone={item.status === PurchaseStatus.CANCELLED ? 'danger' : 'neutral'} />
          </View>
          <Text muted>{item.vendorName ?? 'Vendor'} · {branches.find((b) => b.id === item.branchId)?.name ?? ''}</Text>
          <Text muted>{formatDate(item.purchaseDate)} · {item.items.length} {item.items.length === 1 ? 'item' : 'items'}</Text>
          <View style={styles.between}>
            <Text muted>Total</Text>
            <Text variant="label">{formatRs(item.grandTotal)}</Text>
          </View>
          <View style={styles.badges}>
            <Badge label={item.paymentStatus} tone={PAYMENT_TONE[item.paymentStatus]} />
            {item.returnStatus === ReturnStatus.PARTIAL ? <Badge label="Partially returned" tone="warning" /> : null}
            {item.returnStatus === ReturnStatus.FULL ? <Badge label="Fully returned" /> : null}
          </View>
          <Button label="View details" variant="secondary" onPress={() => router.push({ pathname: '/purchases/detail', params: { id: item.id, branchId: item.branchId } } as never)} />
        </Card>
      )}
      ListFooterComponent={
        <View style={styles.header}>
          <View style={styles.row}>
            <View style={styles.flex}><Button label="Previous" variant="secondary" disabled={page <= 1 || isFetching} onPress={() => setPage((p) => p - 1)} /></View>
            <View style={styles.flex}><Button label="Next" variant="secondary" disabled={page >= pageCount || isFetching} onPress={() => setPage((p) => p + 1)} /></View>
          </View>
          <Text variant="caption" muted style={styles.center}>Page {page} of {pageCount} · {total} purchases</Text>
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
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  center: { textAlign: 'center' },
});
