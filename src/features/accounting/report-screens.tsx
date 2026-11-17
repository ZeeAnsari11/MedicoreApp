import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { todayLocal } from '@/features/cash-receipt/sheet';
import { errorMessage } from '@/api/errors';
import { isValidIsoDate, toIsoDate } from '@/lib/dates';
import { MIME, safeFileName, saveToCache, shareFile } from '@/lib/files';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';
import { toast } from '@/store/toast';

import { SummaryLine } from './ledger-ui';
import { trialBalanceCsv, useBalanceSheet, useProfitLoss, useTrialBalance } from './use-reports';

const daysAgoLocal = (days: number) => toIsoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

function ReportShell({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Input label={label} value={value} onChangeText={(v) => onChange(v.trim())} autoCapitalize="none" placeholder="YYYY-MM-DD" error={value && !isValidIsoDate(value) ? 'Use YYYY-MM-DD' : undefined} />;
}

function Section({ title, rows, total, totalLabel }: { title: string; rows: { accountId: string; accountName: string; amount: number }[]; total: number; totalLabel: string }) {
  return (
    <Card>
      <Text variant="heading">{title}</Text>
      {rows.map((r) => <SummaryLine key={r.accountId} label={r.accountName} value={r.amount} />)}
      <SummaryLine label={totalLabel} value={total} strong />
    </Card>
  );
}

/** Port of the web Trial Balance: as-of date, Balanced badge, search, and a client-built CSV (no server export exists). */
export function TrialBalanceScreen() {
  return (
    <RequirePermission permission="acc_trial_balance:read" what="view the trial balance">
      <TrialBalance />
    </RequirePermission>
  );
}

function TrialBalance() {
  const { has } = useAuth();
  const { branchId } = useBranchFilter();
  const [asOf, setAsOf] = useState(todayLocal());
  const [query, setQuery] = useState('');
  const guard = useSubmitGuard();
  const valid = isValidIsoDate(asOf);
  const { data, isLoading, error, refetch } = useTrialBalance(branchId, asOf, valid);

  const exportCsv = () =>
    guard.run(async () => {
      if (!data) return;
      try {
        const uri = saveToCache(new TextEncoder().encode(trialBalanceCsv(data.rows)), safeFileName(`trial-balance-${asOf}.csv`));
        await shareFile(uri, MIME.csv, `trial-balance-${asOf}.csv`);
      } catch (e) {
        toast.error(errorMessage(e) || 'Export failed');
      }
    });

  const needle = query.trim().toLowerCase();
  const rows = data ? data.rows.filter((r) => !needle || `${r.accountCode} ${r.accountName} ${r.type}`.toLowerCase().includes(needle)) : [];
  const balanced = data ? Math.abs(data.totalDebit - data.totalCredit) < 0.01 : false;

  return (
    <ReportShell>
      <BranchFilter />
      <DateField label="As of date" value={asOf} onChange={setAsOf} />
      <Button label="Export CSV" variant="secondary" loading={guard.busy} disabled={!data || !has('acc_trial_balance:export')} onPress={() => void exportCsv()} />
      {!valid ? (
        <Text muted>Enter a valid date.</Text>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <View style={styles.gap}>
          <SummaryLine label="Total Debit" value={data.totalDebit} />
          <SummaryLine label="Total Credit" value={data.totalCredit} />
          <Badge label={balanced ? 'Balanced' : 'Out of balance'} tone={balanced ? 'success' : 'danger'} />
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search accounts..." />
          {rows.length === 0 ? <EmptyState title="No accounts found" /> : null}
          {rows.map((r) => (
            <Card key={r.accountId}>
              <View style={styles.between}>
                <Text variant="label">{r.accountCode} · {r.accountName}</Text>
                <Badge label={r.type} />
              </View>
              <View style={styles.between}>
                <Text muted>{r.debit > 0 ? `Debit ${r.debit.toFixed(2)}` : ''}</Text>
                <Text muted>{r.credit > 0 ? `Credit ${r.credit.toFixed(2)}` : ''}</Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </ReportShell>
  );
}

/** Port of the web Profit & Loss: revenue vs expenses for a range that opens on the last 30 days. */
export function ProfitLossScreen() {
  return (
    <RequirePermission permission="acc_profit_loss:read" what="view profit & loss">
      <ProfitLoss />
    </RequirePermission>
  );
}

function ProfitLoss() {
  const { branchId } = useBranchFilter();
  const [from, setFrom] = useState(() => daysAgoLocal(30));
  const [to, setTo] = useState(todayLocal());
  const valid = isValidIsoDate(from) && isValidIsoDate(to) && from <= to;
  const { data, isLoading, error, refetch } = useProfitLoss(branchId, from, to, valid);
  return (
    <ReportShell>
      <BranchFilter />
      <DateField label="From date" value={from} onChange={setFrom} />
      <DateField label="To date" value={to} onChange={setTo} />
      {!valid ? (
        <Text muted>Enter a valid date range.</Text>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <View style={styles.gap}>
          <Section title="Revenue" rows={data.revenue} total={data.totalRevenue} totalLabel="Total Revenue" />
          <Section title="Expenses" rows={data.expenses} total={data.totalExpenses} totalLabel="Total Expenses" />
          <Card>
            <Text muted>Net Income</Text>
            <Text variant="heading">{data.netIncome.toFixed(2)}</Text>
          </Card>
        </View>
      )}
    </ReportShell>
  );
}

/** Port of the web Balance Sheet: assets, liabilities, equity as of a date; net income is already inside equity. */
export function BalanceSheetScreen() {
  return (
    <RequirePermission permission="acc_balance_sheet:read" what="view the balance sheet">
      <BalanceSheet />
    </RequirePermission>
  );
}

function BalanceSheet() {
  const { branchId } = useBranchFilter();
  const [asOf, setAsOf] = useState(todayLocal());
  const valid = isValidIsoDate(asOf);
  const { data, isLoading, error, refetch } = useBalanceSheet(branchId, asOf, valid);
  return (
    <ReportShell>
      <BranchFilter />
      <DateField label="As of date" value={asOf} onChange={setAsOf} />
      {!valid ? (
        <Text muted>Enter a valid date.</Text>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <View style={styles.gap}>
          <Badge label={data.isBalanced ? 'Balanced (Assets = Liabilities + Equity)' : 'Out of balance'} tone={data.isBalanced ? 'success' : 'danger'} />
          <Section title="Assets" rows={data.assets} total={data.totalAssets} totalLabel="Total Assets" />
          <Section title="Liabilities" rows={data.liabilities} total={data.totalLiabilities} totalLabel="Total Liabilities" />
          <Section title="Equity" rows={data.equity} total={data.totalEquity} totalLabel="Total Equity" />
          <Card>
            <Text muted>Net Income (included in Equity)</Text>
            <Text variant="heading">{data.netIncome.toFixed(2)}</Text>
          </Card>
        </View>
      )}
    </ReportShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  gap: { gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
