import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { PickerField } from '@/components/ui/picker-field';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { defaultLedgerRange } from '@/lib/dates';
import { spacing } from '@/theme';

import { useKeyedPage } from './use-keyed-page';
import { LedgerExportButtons } from './ledger-export';
import { LedgerFilters, LedgerRows, PAGE_LIMITS, Pager, rangeIsValid } from './ledger-ui';
import { useAccounts } from './use-accounts';
import { useGeneralLedger } from './use-general-ledger';

/** Port of the web General Ledger: pick an account, filter the period, read the postings with opening/closing balance. */
export function GeneralLedgerScreen() {
  return (
    <RequirePermission permission="acc_general_ledger:read" what="view the general ledger">
      <GeneralLedger />
    </RequirePermission>
  );
}

function GeneralLedger() {
  const { branchId } = useBranchFilter();
  const { accounts } = useAccounts();
  const [accountId, setAccountId] = useState('');
  const [range, setRange] = useState(defaultLedgerRange);
  const [limit, setLimit] = useState(50);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useKeyedPage(`${accountId}|${range.from}|${range.to}|${branchId}|${limit}`);
  const options = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accounts]);
  const valid = rangeIsValid(range);
  const { ledger, isLoading, isFetching, error, refetch } = useGeneralLedger(accountId || null, { branchId: branchId ?? undefined, from: range.from, to: range.to, page, limit });
  const enabledLedger = valid ? ledger : undefined;

  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
    >
      <PickerField label="Account" value={accountId} placeholder="Select an account" onChange={setAccountId} options={options} />
      {accountId ? (
        <LedgerExportButtons permission="acc_general_ledger:export" path="/accounting/general-ledger/export" query={{ accountId, branchId: branchId ?? undefined, from: range.from, to: range.to }} baseName={`general-ledger-${range.from}-to-${range.to}`} disabled={!enabledLedger} />
      ) : null}
      <LedgerFilters range={range} onChange={setRange} />
      <ChipRow label="Rows per page" value={String(limit)} onChange={(v) => setLimit(Number(v))} options={PAGE_LIMITS.map((l) => ({ value: l, label: l }))} />
      {!accountId ? (
        <Text muted>Select an account to view its ledger.</Text>
      ) : !valid ? (
        <Text muted>Enter a valid date range.</Text>
      ) : error && !ledger ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !ledger ? (
        <LoadingState />
      ) : (
        <View style={[styles.gap, isFetching ? styles.dim : null]}>
          <Text muted>{ledger.accountCode} · {ledger.accountName} — {ledger.normalBalance === 'DEBIT' ? 'debit' : 'credit'}-normal account</Text>
          <LedgerRows rows={ledger.rows} variant="gl" openingBalance={ledger.openingBalance} totalDebit={ledger.totalDebit} totalCredit={ledger.totalCredit} closingBalance={ledger.closingBalance} closingLabel="Closing balance" page={ledger.page} total={ledger.total} />
          <Pager page={ledger.page} limit={ledger.limit} total={ledger.total} onPage={setPage} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  gap: { gap: spacing.md },
  dim: { opacity: 0.7 },
});
