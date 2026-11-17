import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { ChipRow } from '@/components/chip-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { DATE_PRESETS, formatDate, isValidIsoDate, type DateRange } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { spacing, useTheme } from '@/theme';
import type { LedgerReference, LedgerRow } from '@/types/medicore';

/** Where a ledger reference opens on Android (web: `documentHref`). Payments/expenses have no record screen on the web either. */
export function referenceTarget(ref: LedgerReference | undefined): { pathname: string; params: { id: string } } | null {
  if (!ref) return null;
  if (ref.type === 'SALE') return { pathname: '/sales/detail', params: { id: ref.id } };
  if (ref.type === 'PURCHASE') return { pathname: '/purchases/detail', params: { id: ref.id } };
  return null;
}

export const journalEntryTarget = (entryId: string) => ({ pathname: '/accounting/journal-detail', params: { id: entryId } });

export const PAGE_LIMITS = ['25', '50', '100', '200'] as const;

/** Period filter shared by every ledger/report: presets plus a custom From/To (web `LedgerFilters`), and the branch filter. */
export function LedgerFilters({ range, onChange, showBranch = true }: { range: DateRange; onChange: (r: DateRange) => void; showBranch?: boolean }) {
  const theme = useTheme();
  const active = DATE_PRESETS.find((p) => {
    const r = p.range();
    return r.from === range.from && r.to === range.to;
  })?.key;
  const fromError = range.from && !isValidIsoDate(range.from) ? 'Use YYYY-MM-DD' : range.from && range.to && range.from > range.to ? 'From cannot be after To' : undefined;
  const toError = range.to && !isValidIsoDate(range.to) ? 'Use YYYY-MM-DD' : undefined;
  return (
    <View style={styles.gap}>
      {showBranch ? <BranchFilter /> : null}
      <ChipRow label="Period" value={active ?? ''} onChange={(key) => { const p = DATE_PRESETS.find((x) => x.key === key); if (p) onChange(p.range()); }} options={DATE_PRESETS.map((p) => ({ value: p.key, label: p.label }))} />
      {!active ? <Text variant="caption" color={theme.textMuted}>Custom range</Text> : null}
      <View style={styles.row}>
        <View style={styles.flex}><Input label="From" value={range.from} onChangeText={(v) => onChange({ ...range, from: v.trim() })} autoCapitalize="none" placeholder="YYYY-MM-DD" error={fromError} /></View>
        <View style={styles.flex}><Input label="To" value={range.to} onChangeText={(v) => onChange({ ...range, to: v.trim() })} autoCapitalize="none" placeholder="YYYY-MM-DD" error={toError} /></View>
      </View>
    </View>
  );
}

/** True when both dates are usable, so the screen only queries valid ranges. */
export const rangeIsValid = (r: DateRange) => isValidIsoDate(r.from) && isValidIsoDate(r.to) && r.from <= r.to;

export function SummaryLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.between}>
      <Text muted>{label}</Text>
      <Text variant={strong ? 'label' : 'body'}>{formatRs(value)}</Text>
    </View>
  );
}

/** Opening balance (page 1 only), the page's rows, period totals and the closing balance (web `LedgerTable`). */
export function LedgerRows({
  rows,
  variant,
  openingBalance,
  totalDebit,
  totalCredit,
  closingBalance,
  closingLabel,
  page,
  total,
}: {
  rows: LedgerRow[];
  variant: 'gl' | 'party';
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingLabel: string;
  page: number;
  total: number;
}) {
  return (
    <View style={styles.gap}>
      {page === 1 ? (
        <Card>
          <SummaryLine label="Opening balance" value={openingBalance} />
        </Card>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="No postings in this period." />
      ) : (
        rows.map((row, i) => <LedgerRowCard key={`${row.entryId}-${i}`} row={row} variant={variant} />)
      )}
      <Card>
        <Text variant="label">Period totals ({total} {total === 1 ? 'row' : 'rows'})</Text>
        <SummaryLine label="Debit" value={totalDebit} />
        <SummaryLine label="Credit" value={totalCredit} />
        <SummaryLine label={closingLabel} value={closingBalance} strong />
      </Card>
    </View>
  );
}

function LedgerRowCard({ row, variant }: { row: LedgerRow; variant: 'gl' | 'party' }) {
  const target = referenceTarget(row.reference);
  return (
    <Card>
      <View style={styles.between}>
        {variant === 'party' ? <Badge label={row.documentType} /> : <Text variant="label">{row.entryNumber}</Text>}
        <Text variant="caption" muted>{formatDate(row.date)}</Text>
      </View>
      <Text>{row.description}</Text>
      <View style={styles.links}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Entry ${row.entryNumber}`} onPress={() => router.push(journalEntryTarget(row.entryId) as never)}>
          <Text variant="caption" color="#2563EB">Entry {row.entryNumber}</Text>
        </Pressable>
        {row.reference ? (
          target ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${row.reference.number}`} onPress={() => router.push(target as never)}>
              <Text variant="caption" color="#2563EB">{row.reference.number}</Text>
            </Pressable>
          ) : (
            <Text variant="caption" muted>{row.reference.number}</Text>
          )
        ) : null}
      </View>
      <View style={styles.between}>
        <Text muted>{row.debit ? `Debit ${formatRs(row.debit)}` : `Credit ${formatRs(row.credit)}`}</Text>
        <Text variant="label">Balance {formatRs(row.runningBalance)}</Text>
      </View>
    </Card>
  );
}

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <View style={styles.flex}><Button label="Previous" variant="secondary" disabled={page <= 1} onPress={() => onPage(page - 1)} /></View>
        <View style={styles.flex}><Button label="Next" variant="secondary" disabled={page >= pages} onPress={() => onPage(page + 1)} /></View>
      </View>
      <Text variant="caption" muted style={styles.center}>Page {page} of {pages} · {total} entries</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  links: { flexDirection: 'row', gap: spacing.lg },
  center: { textAlign: 'center' },
});
