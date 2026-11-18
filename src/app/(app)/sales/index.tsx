import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { DocumentCard, type Pill } from '@/components/document-card';
import { Button } from '@/components/ui/button';
import { useDocumentFile } from '@/features/documents/use-document-file';
import { MIME } from '@/lib/files';
import { FilterPanel, FilterSelect, HeaderIconButton } from '@/components/filter-panel';
import { PageFooter } from '@/components/page-footer';
import { Input } from '@/components/ui/input';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useCustomers } from '@/features/customers/use-customers';
import { PAGE_SIZES } from '@/features/purchases/purchases-list-screen';
import { salesReportPath, useOrderBookers, useSalesPage } from '@/features/sales/use-sales';
import { formatRs } from '@/lib/format';
import { formatDate, isValidIsoDate } from '@/lib/dates';
import { PAYMENT_PILL, returnPill } from '@/lib/document-pills';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useDraftFilters } from '@/lib/use-draft-filters';
import { radius, spacing, useTheme } from '@/theme';
import { PaymentStatus, ReturnStatus, type Sale } from '@/types/medicore';

const ALL = { value: '', label: 'All' };
const PAYMENT_OPTIONS = [ALL, { value: PaymentStatus.PAID, label: 'Paid' }, { value: PaymentStatus.PARTIAL, label: 'Partial' }, { value: PaymentStatus.UNPAID, label: 'Unpaid' }];
// Same choices as the web sales page.
const RETURN_OPTIONS = [ALL, { value: 'ANY', label: 'Any return' }, { value: ReturnStatus.PARTIAL, label: 'Partially returned' }, { value: ReturnStatus.FULL, label: 'Fully returned' }];
const ROW_OPTIONS = PAGE_SIZES.map((s) => ({ value: s, label: s }));

const DEFAULTS = { branch: '', customerId: '', bookerId: '', payment: '', returns: '', start: '', end: '', rows: PAGE_SIZES[0] as string };

export default function SalesScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { branchId, setBranchId, showDropdown, branches, lockedBranchName } = useBranchFilter();
  const filters = useDraftFilters(DEFAULTS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const debounced = useDebouncedValue(search, 300);

  const { customers } = useCustomers(branchId);
  const { orderBookers } = useOrderBookers(branchId, has('sales:view_all'));
  const f = filters.applied;
  const limit = Number(f.rows);
  const filterParams = {
    branchId,
    search: debounced.trim() || undefined,
    customerId: f.customerId || undefined,
    orderBookerId: f.bookerId || undefined,
    paymentStatus: f.payment || undefined,
    returnStatus: f.returns || undefined,
    startDate: isValidIsoDate(f.start) ? f.start : undefined,
    endDate: isValidIsoDate(f.end) ? f.end : undefined,
  };
  const { sales, total, summary, isLoading, isFetching, error, refetch } = useSalesPage({ ...filterParams, page, limit });
  const report = useDocumentFile();
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? lockedBranchName ?? '';

  const toggleFilters = () => {
    filters.toggle();
    if (!filters.open) filters.setField('branch')(branchId ?? '');
  };
  const apply = () => {
    filters.apply();
    if (showDropdown) setBranchId(filters.draft.branch || null);
    setPage(1);
  };
  const reset = () => {
    filters.reset();
    setSearch('');
    if (showDropdown) setBranchId(null);
    setPage(1);
  };
  const open = (s: Sale) => router.push({ pathname: '/sales/detail', params: { id: s.id, branchId: s.branchId } } as never);

  if (isLoading) return <LoadingState />;
  if (error && sales.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <HeaderIconButton icon="plus" label="New Sale" disabled={!has('sales:create')} onPress={() => router.push('/sales/new' as never)} />
              <HeaderIconButton icon="filter-variant" label="Filters" highlighted={filters.open} active={filters.isActive} onPress={toggleFilters} />
            </View>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        data={sales}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} placeholder="Search invoice number or customer" />
            {summary ? (
              <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {([
                  ['Orders', String(summary.orders)],
                  ['Gross Sale', formatRs(summary.gross)],
                  ['Sale Return', formatRs(summary.returned)],
                  ['Net Sale / Payable', formatRs(summary.net)],
                  ['Paid', formatRs(summary.paid)],
                  ['Remaining Bal', formatRs(summary.remaining)],
                ] as const).map(([label, value]) => (
                  <View key={label} style={styles.summaryRow}>
                    <Text muted>{label}</Text>
                    <Text variant="heading">{value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Button
              label="Report (PDF)"
              variant="secondary"
              disabled={report.isBusy || total === 0}
              onPress={() => void report.share({ path: salesReportPath(filterParams), fileName: 'sales-report.pdf', mimeType: MIME.pdf })}
            />
            {!showDropdown && lockedBranchName ? <Text variant="caption" muted>Viewing: {lockedBranchName}</Text> : null}
            {filters.open ? (
              <FilterPanel onReset={reset} onApply={apply} onCollapse={filters.close}>
                <FilterSelect icon="credit-card-outline" label="Payment" value={filters.draft.payment} options={PAYMENT_OPTIONS} highlighted={!!filters.draft.payment} onChange={filters.setField('payment')} />
                <FilterSelect icon="undo-variant" label="Returns" value={filters.draft.returns} options={RETURN_OPTIONS} highlighted={!!filters.draft.returns} onChange={filters.setField('returns')} />
                <FilterSelect icon="format-list-bulleted" label="Rows" value={filters.draft.rows} options={ROW_OPTIONS} onChange={filters.setField('rows')} />
                <FilterSelect
                  icon="account-outline"
                  label="Customer"
                  value={filters.draft.customerId}
                  options={[{ value: '', label: 'All customers' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
                  highlighted={!!filters.draft.customerId}
                  onChange={filters.setField('customerId')}
                />
                {has('sales:view_all') ? (
                  <FilterSelect
                    icon="account-tie-outline"
                    label="Order Booker"
                    value={filters.draft.bookerId}
                    options={[{ value: '', label: 'All order bookers' }, ...orderBookers.map((o) => ({ value: o.id, label: o.name }))]}
                    highlighted={!!filters.draft.bookerId}
                    onChange={filters.setField('bookerId')}
                  />
                ) : null}
                {showDropdown ? (
                  <FilterSelect
                    icon="source-branch"
                    label="Branch"
                    value={filters.draft.branch}
                    options={[{ value: '', label: 'All branches' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                    highlighted={!!filters.draft.branch}
                    onChange={filters.setField('branch')}
                  />
                ) : null}
                <View style={styles.row}>
                  <View style={styles.flex}><Input label="From (YYYY-MM-DD)" value={filters.draft.start} onChangeText={filters.setField('start')} autoCapitalize="none" /></View>
                  <View style={styles.flex}><Input label="To (YYYY-MM-DD)" value={filters.draft.end} onChangeText={filters.setField('end')} autoCapitalize="none" /></View>
                </View>
              </FilterPanel>
            ) : null}
            <Text variant="caption" muted>Newest first. Pending orders appear in Process Orders until they are confirmed.</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No sales found" message="Try a different search or filter" />}
        renderItem={({ item }) => (
          <DocumentCard
            icon="receipt-text-outline"
            number={item.invoiceNumber}
            status={returnPill(item.returnStatus) ?? undefined}
            party={`${item.customerName ?? 'Walk-in'} · ${branchName(item.branchId)}`}
            date={formatDate(item.saleDate)}
            itemCount={item.items.length}
            meta={`Order Booker: ${item.orderBookerName}`}
            total={item.grandTotal}
            amounts={saleAmounts(item)}
            pills={[PAYMENT_PILL[item.paymentStatus]].filter((p): p is Pill => !!p)}
            onOpen={() => open(item)}
          />
        )}
        ListFooterComponent={
          <PageFooter page={page} pageCount={pageCount} total={total} noun="sales" busy={isFetching} onPrevious={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
        }
      />
    </>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sale return, net payable, paid and remaining balance (same formula as the web list). */
function saleAmounts(s: Sale) {
  const returned = s.returnedTotal ?? 0;
  const net = round2(s.grandTotal - returned);
  const remaining = Math.max(round2(net - (s.amountPaid - (s.refundedTotal ?? 0))), 0);
  return [
    { label: 'Sale Return', value: returned },
    { label: 'Net Sale / Payable', value: net },
    { label: 'Paid', value: s.amountPaid },
    { label: 'Remaining Bal', value: remaining },
  ];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md },
  headerButtons: { flexDirection: 'row', gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
  summary: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
