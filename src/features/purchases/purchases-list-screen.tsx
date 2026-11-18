import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { DocumentCard, type Pill } from '@/components/document-card';
import { FilterPanel, FilterSelect, HeaderIconButton } from '@/components/filter-panel';
import { PageFooter } from '@/components/page-footer';
import { Input } from '@/components/ui/input';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useVendors } from '@/features/vendors/use-vendors';
import { formatDate, isValidIsoDate } from '@/lib/dates';
import { PAYMENT_PILL, returnPill } from '@/lib/document-pills';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useDraftFilters } from '@/lib/use-draft-filters';
import { spacing, useTheme } from '@/theme';
import { PaymentStatus, PurchaseStatus, ReturnStatus, type Purchase } from '@/types/medicore';

import { usePurchasesPage } from './use-purchases';

/** Web page-size options. */
export const PAGE_SIZES = ['10', '25', '50', '100', '250', '500'] as const;

const ALL = { value: '', label: 'All' };
const PAYMENT_OPTIONS = [ALL, { value: PaymentStatus.PAID, label: 'Paid' }, { value: PaymentStatus.PARTIAL, label: 'Partial' }, { value: PaymentStatus.UNPAID, label: 'Unpaid' }];
const RETURN_OPTIONS = [ALL, { value: 'ANY', label: 'Any return' }, { value: ReturnStatus.PARTIAL, label: 'Partially returned' }, { value: ReturnStatus.FULL, label: 'Fully returned' }];
const STATUS_OPTIONS = [ALL, { value: PurchaseStatus.DRAFT, label: 'Draft' }, { value: PurchaseStatus.RECEIVED, label: 'Received' }, { value: PurchaseStatus.CANCELLED, label: 'Cancelled' }];
const ROW_OPTIONS = PAGE_SIZES.map((s) => ({ value: s, label: s }));

const STATUS_PILL: Record<PurchaseStatus, Pill> = {
  [PurchaseStatus.RECEIVED]: { label: 'RECEIVED', tone: 'success', icon: 'check' },
  [PurchaseStatus.DRAFT]: { label: 'DRAFT', tone: 'neutral', icon: 'pencil-outline' },
  [PurchaseStatus.CANCELLED]: { label: 'CANCELLED', tone: 'danger', icon: 'close-circle-outline' },
};

const DEFAULTS = { branch: '', vendorId: '', payment: '', returns: '', status: '', dateFrom: '', dateTo: '', rows: PAGE_SIZES[0] as string };

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
  const { branchId, setBranchId, showDropdown, branches, lockedBranchName } = useBranchFilter();
  const filters = useDraftFilters(DEFAULTS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const debounced = useDebouncedValue(search, 300);

  const vendorsApi = useVendors(branchId);
  const f = filters.applied;
  const limit = Number(f.rows);
  const { purchases, total, isLoading, isFetching, error, refetch } = usePurchasesPage({
    branchId,
    vendorId: f.vendorId || undefined,
    paymentStatus: f.payment || undefined,
    returnStatus: f.returns || undefined,
    status: f.status || undefined,
    dateFrom: isValidIsoDate(f.dateFrom) ? f.dateFrom : undefined,
    dateTo: isValidIsoDate(f.dateTo) ? f.dateTo : undefined,
    search: debounced.trim() || undefined,
    page,
    limit,
  });
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? lockedBranchName ?? '';

  // Opening starts from the applied values, including the (app-wide) branch filter.
  const toggleFilters = () => {
    filters.toggle();
    if (!filters.open) filters.setField('branch')(branchId ?? '');
  };
  // Any filter change goes back to the first page (web).
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
  const open = (p: Purchase) => router.push({ pathname: '/purchases/detail', params: { id: p.id, branchId: p.branchId } } as never);
  const hasFilters = filters.isActive || !!search;

  if (isLoading) return <LoadingState />;
  if (error && purchases.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <HeaderIconButton icon="plus" label="New Purchase" disabled={!has('purchases:create')} onPress={() => router.push('/purchases/new' as never)} />
              <HeaderIconButton icon="filter-variant" label="Filters" highlighted={filters.open} active={filters.isActive} onPress={toggleFilters} />
            </View>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        data={purchases}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} placeholder="Search purchases..." />
            {!showDropdown && lockedBranchName ? <Text variant="caption" muted>Viewing: {lockedBranchName}</Text> : null}
            {filters.open ? (
              <FilterPanel onReset={reset} onApply={apply} onCollapse={filters.close}>
                <FilterSelect icon="credit-card-outline" label="Payment" value={filters.draft.payment} options={PAYMENT_OPTIONS} onChange={filters.setField('payment')} />
                <FilterSelect icon="undo-variant" label="Returns" value={filters.draft.returns} options={RETURN_OPTIONS} onChange={filters.setField('returns')} />
                <FilterSelect icon="tag-outline" label="Status" value={filters.draft.status} options={STATUS_OPTIONS} onChange={filters.setField('status')} />
                <FilterSelect icon="format-list-bulleted" label="Rows" value={filters.draft.rows} options={ROW_OPTIONS} onChange={filters.setField('rows')} />
                <FilterSelect
                  icon="truck-delivery-outline"
                  label="Vendor"
                  value={filters.draft.vendorId}
                  options={[{ value: '', label: 'All vendors' }, ...vendorsApi.vendors.map((v) => ({ value: v.id, label: v.company }))]}
                  onChange={filters.setField('vendorId')}
                />
                {showDropdown ? (
                  <FilterSelect
                    icon="source-branch"
                    label="Branch"
                    value={filters.draft.branch}
                    options={[{ value: '', label: 'All branches' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                    onChange={filters.setField('branch')}
                  />
                ) : null}
                <View style={styles.row}>
                  <View style={styles.flex}><Input label="From (YYYY-MM-DD)" value={filters.draft.dateFrom} onChangeText={filters.setField('dateFrom')} autoCapitalize="none" /></View>
                  <View style={styles.flex}><Input label="To (YYYY-MM-DD)" value={filters.draft.dateTo} onChangeText={filters.setField('dateTo')} autoCapitalize="none" /></View>
                </View>
              </FilterPanel>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          hasFilters ? <EmptyState title="No purchases found" message="Try a different search or filter" /> : <EmptyState title="No purchases yet" message="Receive your first purchase from a vendor" />
        }
        renderItem={({ item }) => (
          <DocumentCard
            icon="cart-outline"
            number={item.purchaseNumber}
            status={STATUS_PILL[item.status]}
            party={`${item.vendorName ?? 'Vendor'} · ${branchName(item.branchId)}`}
            date={formatDate(item.purchaseDate)}
            itemCount={item.items.length}
            total={item.grandTotal}
            pills={[PAYMENT_PILL[item.paymentStatus], returnPill(item.returnStatus)].filter((p): p is Pill => !!p)}
            onOpen={() => open(item)}
          />
        )}
        ListFooterComponent={
          <PageFooter page={page} pageCount={pageCount} total={total} noun="purchases" busy={isFetching} onPrevious={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md },
  headerButtons: { flexDirection: 'row', gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
});
