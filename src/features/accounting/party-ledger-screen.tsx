import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { BranchFilter } from '@/components/branch-filter';
import { Card } from '@/components/ui/card';
import { PickerField } from '@/components/ui/picker-field';
import { SearchBar } from '@/components/ui/search-bar';
import { SortBar } from '@/components/sort-bar';
import { SwitchRow } from '@/components/ui/switch-row';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useCustomers } from '@/features/customers/use-customers';
import { LEDGERS_QUERY_KEY, usePartyBalances, usePartyLedger, type PartyKind } from '@/features/ledgers/use-party-ledger';
import { useVendors } from '@/features/vendors/use-vendors';
import { defaultLedgerRange } from '@/lib/dates';
import { useTenantCache } from '@/lib/tenant-query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { spacing } from '@/theme';

import { useKeyedPage } from './use-keyed-page';
import { LedgerExportButtons } from './ledger-export';
import { LedgerFilters, LedgerRows, PAGE_LIMITS, Pager, rangeIsValid, SummaryLine } from './ledger-ui';

interface Config {
  kind: PartyKind;
  singular: string;
  plural: string;
  billedLabel: string;
  settledLabel: string;
  voidLabel: string;
  accountLabel: string;
  positiveHint: string;
  negativeHint: string;
  read: string;
  exportPermission: string;
}

/** Wording is the web's (`customer-ledger/page.tsx`, `vendor-ledger/page.tsx`). */
export const PARTY_CONFIGS: Record<PartyKind, Config> = {
  customers: { kind: 'customers', singular: 'Customer', plural: 'customers', billedLabel: 'Total invoiced', settledLabel: 'Total received', voidLabel: 'Reversed (edits & voids)', accountLabel: 'Accounts Receivable', positiveHint: 'Customer owes you', negativeHint: 'Credit / advance with you', read: 'acc_customer_ledger:read', exportPermission: 'acc_customer_ledger:export' },
  vendors: { kind: 'vendors', singular: 'Vendor', plural: 'vendors', billedLabel: 'Total purchased', settledLabel: 'Total paid', voidLabel: 'Reversed (edits & cancellations)', accountLabel: 'Accounts Payable', positiveHint: 'You owe the vendor', negativeHint: 'Advance with the vendor', read: 'acc_vendor_ledger:read', exportPermission: 'acc_vendor_ledger:export' },
};

export function PartyLedgerScreen({ kind }: { kind: PartyKind }) {
  const config = PARTY_CONFIGS[kind];
  return (
    <RequirePermission permission={config.read} what={`view ${config.singular.toLowerCase()} ledgers`}>
      <PartyLedger config={config} />
    </RequirePermission>
  );
}

function PartyLedger({ config }: { config: Config }) {
  const params = useLocalSearchParams<{ view?: string; party?: string; bal?: string }>();
  const [view, setView] = useState<'list' | 'ledger'>(params.view === 'ledger' || (!params.view && params.party) ? 'ledger' : 'list');
  const [partyId, setPartyId] = useState(params.party ?? '');
  const { branchId } = useBranchFilter();
  const cache = useTenantCache();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      keyboardShouldPersistTaps="handled"
      // The list and ledger views own their queries; refetching the ledger prefix refreshes whichever is shown.
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await cache.invalidate(LEDGERS_QUERY_KEY); setRefreshing(false); }} />}
    >
      <ChipRow label="View" value={view} onChange={(v) => setView(v as 'list' | 'ledger')} options={[{ value: 'list', label: `All ${config.plural}` }, { value: 'ledger', label: 'Ledger' }]} />
      {view === 'list' ? (
        <BalanceList config={config} branchId={branchId} initialHasBalance={params.bal === '1'} onOpen={(id) => { setPartyId(id); setView('ledger'); }} />
      ) : (
        <LedgerView config={config} branchId={branchId} partyId={partyId} onParty={setPartyId} />
      )}
    </ScrollView>
  );
}

function BalanceList({ config, branchId, initialHasBalance, onOpen }: { config: Config; branchId: string | null; initialHasBalance: boolean; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query.trim(), 300);
  const [hasBalance, setHasBalance] = useState(initialHasBalance);
  const [sortBy, setSortBy] = useState<'name' | 'balance'>('balance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useKeyedPage(`${search}|${hasBalance}|${branchId}|${sortBy}|${sortDir}`);
  const { balances, isLoading, isFetching, error, refetch } = usePartyBalances(config.kind, { branchId: branchId ?? undefined, search: search || undefined, hasBalance, sortBy, sortDir, page, limit: 25 });

  const toggleSort = (key: string) => {
    const column = key as 'name' | 'balance';
    if (sortBy === column) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(column); setSortDir(column === 'name' ? 'asc' : 'desc'); }
  };

  return (
    <View style={styles.gap}>
      <BranchFilter />
      <SearchBar value={query} onChangeText={setQuery} placeholder={`Search ${config.plural}...`} />
      <SwitchRow label="Has balance only" value={hasBalance} onValueChange={setHasBalance} />
      <SortBar options={[{ key: 'name', label: config.singular }, { key: 'balance', label: 'Balance' }]} sortKey={sortBy} dir={sortDir} onSort={toggleSort} />
      {isLoading || !balances ? (
        error ? <ErrorState error={error} onRetry={() => void refetch()} /> : <LoadingState />
      ) : (
        <View style={[styles.gap, isFetching ? styles.dim : null]}>
          {Math.abs(balances.totals.unattributed) > 0.005 ? (
            <Card>
              <Text>
                {config.accountLabel} is {balances.totals.accountTotal.toFixed(2)}, but {config.singular.toLowerCase()} balances add up to {balances.totals.partiesAccountTotal.toFixed(2)}. {balances.totals.unattributed.toFixed(2)} is not linked to any {config.singular.toLowerCase()} (for example, the unpaid part of walk-in invoices).
              </Text>
            </Card>
          ) : null}
          {balances.items.length === 0 ? <EmptyState title={`No ${config.plural} found.`} /> : null}
          {balances.items.map((row) => (
            <Card key={row.partyId}>
              <Text variant="label" accessibilityRole="button" accessibilityLabel={`Open ledger ${row.name}`} onPress={() => onOpen(row.partyId)}>{row.name}</Text>
              <SummaryLine label={config.accountLabel} value={row.accountBalance} />
              <SummaryLine label="Advance" value={row.advanceBalance} />
              <SummaryLine label="Balance" value={row.balance} strong />
            </Card>
          ))}
          <Text variant="caption" muted>{balances.total} {balances.total === 1 ? config.singular.toLowerCase() : config.plural}</Text>
          <Pager page={balances.page} limit={balances.limit} total={balances.total} onPage={setPage} />
        </View>
      )}
    </View>
  );
}

function LedgerView({ config, branchId, partyId, onParty }: { config: Config; branchId: string | null; partyId: string; onParty: (id: string) => void }) {
  const customers = useCustomers();
  const vendors = useVendors();
  const options = useMemo(
    () => (config.kind === 'customers' ? customers.customers.map((c) => ({ value: c.id, label: c.name })) : vendors.vendors.map((v) => ({ value: v.id, label: v.company }))),
    [config.kind, customers.customers, vendors.vendors],
  );
  const [range, setRange] = useState(defaultLedgerRange);
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useKeyedPage(`${partyId}|${range.from}|${range.to}|${branchId}|${limit}`);
  const valid = rangeIsValid(range);
  const { ledger, isLoading, isFetching, error, refetch } = usePartyLedger(config.kind, partyId || null, { branchId: branchId ?? undefined, from: range.from, to: range.to, page, limit }, valid);
  const s = ledger?.summary;
  const closing = ledger?.closingBalance ?? 0;
  const hint = closing >= 0 ? config.positiveHint : config.negativeHint;
  const extras = s ? [s.voids ? `${config.voidLabel} ${s.voids.toFixed(2)}` : null, s.advances ? `Advances ${s.advances.toFixed(2)}` : null, s.other ? `Adjustments ${s.other.toFixed(2)}` : null].filter(Boolean) : [];

  return (
    <View style={styles.gap}>
      <PickerField label={config.singular} value={partyId} placeholder={`Select a ${config.singular.toLowerCase()}`} onChange={onParty} options={options} />
      {partyId ? (
        <LedgerExportButtons permission={config.exportPermission} path={`/accounting/${config.kind}/${partyId}/ledger/export`} query={{ branchId: branchId ?? undefined, from: range.from, to: range.to }} baseName={`${config.kind}-ledger-${range.from}-to-${range.to}`} statement disabled={!ledger || !valid} />
      ) : null}
      <LedgerFilters range={range} onChange={setRange} />
      <ChipRow label="Rows per page" value={String(limit)} onChange={(v) => setLimit(Number(v))} options={PAGE_LIMITS.map((l) => ({ value: l, label: l }))} />
      {!partyId ? (
        <Text muted>Select a {config.singular.toLowerCase()} to view their ledger.</Text>
      ) : !valid ? (
        <Text muted>Enter a valid date range.</Text>
      ) : error && !ledger ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !ledger || !s ? (
        <LoadingState />
      ) : (
        <View style={[styles.gap, isFetching ? styles.dim : null]}>
          <Card>
            <SummaryLine label="Opening balance" value={s.openingBalance} />
            <SummaryLine label={config.billedLabel} value={s.billed} />
            <SummaryLine label={config.settledLabel} value={s.settled} />
            <SummaryLine label="Total returns" value={s.returns} />
            <SummaryLine label="Closing balance" value={s.closingBalance} strong />
            <Text variant="caption" muted>{hint}</Text>
          </Card>
          {extras.length > 0 ? <Text variant="caption" muted>{extras.join(' · ')}</Text> : null}
          <LedgerRows rows={ledger.rows} variant="party" openingBalance={ledger.openingBalance} totalDebit={ledger.totalDebit} totalCredit={ledger.totalCredit} closingBalance={ledger.closingBalance} closingLabel={`Closing balance — ${hint.toLowerCase()}`} page={ledger.page} total={ledger.total} />
          <Pager page={ledger.page} limit={ledger.limit} total={ledger.total} onPage={setPage} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  gap: { gap: spacing.md },
  dim: { opacity: 0.7 },
});
