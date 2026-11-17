import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranches } from '@/features/branches/use-branches';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useCustomers } from '@/features/customers/use-customers';
import { usePartyLedger } from '@/features/ledgers/use-party-ledger';
import { confirmAction } from '@/lib/confirm';
import { DATE_PRESETS, defaultLedgerRange, formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { spacing, useTheme } from '@/theme';

const PAGE_SIZE = 25;

export default function CustomerDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { has } = useAuth();
  const { customers, isLoading, error, refetch, remove, isRemoving } = useCustomers();
  const { branches } = useBranches();
  const { branchId } = useBranchFilter();
  const customer = customers.find((c) => c.id === id);

  const [range, setRange] = useState(defaultLedgerRange);
  const [page, setPage] = useState(1);
  const canLedger = has('acc_customer_ledger:read');
  const ledgerQuery = usePartyLedger('customers', customer?.id ?? null, { branchId: branchId ?? undefined, from: range.from, to: range.to, page, limit: PAGE_SIZE }, canLedger);
  const { ledger } = ledgerQuery;
  const activePreset = DATE_PRESETS.find((p) => { const r = p.range(); return r.from === range.from && r.to === range.to; })?.key ?? 'custom';

  if (isLoading) return <LoadingState />;
  if (error && !customer) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!customer) return <EmptyState title="Customer not found" />;

  const due = customer.outstandingBalance ?? 0;
  const del = async () => {
    if (!(await confirmAction({ title: 'Delete this customer?', message: customer.name, confirmLabel: 'Delete', destructive: true }))) return;
    try {
      await remove(customer.id);
      router.back();
    } catch {
      // toasted by the mutation (e.g. "outstanding balance and cannot be removed")
    }
  };
  const pageCount = ledger ? Math.max(1, Math.ceil(ledger.total / ledger.limit)) : 1;
  const s = ledger?.summary;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: customer.name }} />
      <Card>
        <View style={styles.between}>
          <Text variant="heading">{customer.name}</Text>
          <Badge label={customer.isDealer ? 'Dealer' : 'Retail'} tone={customer.isDealer ? 'success' : 'neutral'} />
        </View>
        <Text muted>Phone: {customer.phone || '—'}</Text>
        <Text muted>Address: {customer.address || '—'}</Text>
        <Text muted>Branch: {branches.find((b) => b.id === customer.branchId)?.name ?? '—'}</Text>
        <View style={styles.between}>
          <Text muted>Outstanding balance</Text>
          <Badge label={formatRs(due)} tone={due > 0.01 ? 'warning' : 'neutral'} />
        </View>
        <View style={styles.actions}>
          <View style={styles.flex}><Button label="Edit" variant="secondary" disabled={!has('customers:update')} onPress={() => router.push({ pathname: '/customers/form', params: { id: customer.id } } as never)} /></View>
          <View style={styles.flex}><Button label="Delete" variant="danger" disabled={!has('customers:delete') || isRemoving} onPress={() => void del()} /></View>
        </View>
      </Card>

      <Text variant="heading">Ledger & payments</Text>
      {!canLedger ? (
        <Text muted>You don&apos;t have permission to view customer ledgers.</Text>
      ) : (
        <>
          <ChipRow
            label="Period"
            value={activePreset}
            onChange={(key) => {
              const preset = DATE_PRESETS.find((p) => p.key === key);
              if (preset) { setRange(preset.range()); setPage(1); }
            }}
            options={DATE_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
          />
          <Text variant="caption" muted>{range.from} to {range.to}</Text>
          {ledgerQuery.error && !ledger ? (
            <ErrorState error={ledgerQuery.error} onRetry={() => void ledgerQuery.refetch()} />
          ) : ledgerQuery.isLoading || !ledger || !s ? (
            <LoadingState />
          ) : (
            <>
              <Card>
                <Row label="Opening balance" value={s.openingBalance} />
                <Row label="Total invoiced" value={s.billed} />
                <Row label="Total received" value={s.settled} />
                <Row label="Returns" value={s.returns} />
                {s.voids ? <Row label="Reversed (edits & voids)" value={s.voids} /> : null}
                {s.advances ? <Row label="Advances" value={s.advances} /> : null}
                {s.other ? <Row label="Adjustments" value={s.other} /> : null}
                <Row label="Closing balance" value={s.closingBalance} strong />
                <Text variant="caption" muted>{s.closingBalance >= 0 ? 'Customer owes you' : 'Credit / advance with you'}</Text>
              </Card>
              {ledger.rows.length === 0 ? (
                <EmptyState title="No postings in this period" />
              ) : (
                ledger.rows.map((row, i) => (
                  <Card key={`${row.entryId}-${i}`}>
                    <View style={styles.between}>
                      <Text variant="label">{row.reference?.number ?? row.entryNumber}</Text>
                      <Badge label={row.documentType} />
                    </View>
                    <Text variant="caption" muted>{formatDate(row.date)} · {row.description}</Text>
                    <View style={styles.between}>
                      <Text muted>{row.debit ? `Debit ${formatRs(row.debit)}` : `Credit ${formatRs(row.credit)}`}</Text>
                      <Text variant="label">Balance {formatRs(row.runningBalance)}</Text>
                    </View>
                  </Card>
                ))
              )}
              <View style={styles.actions}>
                <View style={styles.flex}><Button label="Previous" variant="secondary" disabled={ledger.page <= 1} onPress={() => setPage((p) => p - 1)} /></View>
                <View style={styles.flex}><Button label="Next" variant="secondary" disabled={ledger.page >= pageCount} onPress={() => setPage((p) => p + 1)} /></View>
              </View>
              <Text variant="caption" muted style={styles.center}>Page {ledger.page} of {pageCount} · {ledger.total} entries</Text>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.between}>
      <Text muted>{label}</Text>
      <Text variant={strong ? 'label' : 'body'}>{formatRs(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  center: { textAlign: 'center' },
});
