import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { ChipRow } from '@/components/chip-row';
import { SortBar } from '@/components/sort-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { Input } from '@/components/ui/input';
import { SearchBar } from '@/components/ui/search-bar';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { useKeyedPage } from '@/features/accounting/use-keyed-page';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useDocumentFile } from '@/features/documents/use-document-file';
import { MIME } from '@/lib/files';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { spacing, useTheme } from '@/theme';
import type { SsrRow, SsrView } from '@/types/medicore';

import { OrderBookerFilter } from './order-booker-filter';
import { FIRST_HEADER, nextSort, reportColumns, type SsrColumn } from './ssr-columns';
import { activePresetKey, defaultSsrRange, SSR_PRESETS, ssrRangeInvalid } from './ssr-dates';
import { SsrDrilldown } from './ssr-drilldown';
import { ssrExportPath, useSsr, type SsrExportFormat } from './use-ssr';

const VIEWS: { value: SsrView; label: string }[] = [
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'product', label: 'Product' },
  { value: 'grouped', label: 'Manufacturer > Vendor > Product' },
];

const EXPORTS: { format: SsrExportFormat; label: string; mime: string }[] = [
  { format: 'xlsx', label: 'Excel (.xlsx)', mime: MIME.xlsx },
  { format: 'csv', label: 'CSV', mime: MIME.csv },
  { format: 'pdf', label: 'PDF', mime: MIME.pdf },
];

/** Port of the web SSR (Secondary Sales Report) page. Every figure comes from `GET /reports/ssr`; Android only formats. */
export function SsrScreen() {
  return (
    <RequirePermission permission="ssr:read" what="view the SSR">
      <Ssr />
    </RequirePermission>
  );
}

function Ssr() {
  const { has } = useAuth();
  const doc = useDocumentFile();
  const { branchId } = useBranchFilter();
  const [range, setRange] = useState(() => defaultSsrRange());
  const [view, setView] = useState<SsrView>('manufacturer');
  const [sort, setSort] = useState('netSaleValue:desc');
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query.trim(), 300);
  const [bookers, setBookers] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [drill, setDrill] = useState<{ id: string; label: string } | null>(null);
  const invalid = ssrRangeInvalid(range);
  const [page, setPage] = useKeyedPage(`${range.from}|${range.to}|${branchId}|${view}|${sort}|${search}|${bookers.join(',')}`);

  const filters = { from: range.from, to: range.to, branchId: branchId || undefined, salesmanIds: bookers.join(',') || undefined };
  const params = { ...filters, view, sort, search: search || undefined, page: view === 'product' ? String(page) : undefined };
  const { report, isLoading, isFetching, error, refetch } = useSsr(params, !invalid);

  const cols = report ? reportColumns(report) : [];
  const shown = cols.filter((c) => !hidden.has(c.key));
  // Exports include only the columns still ticked in the Columns menu.
  const exportParams = { ...params, columns: report ? cols.filter((c) => !hidden.has(c.key)).map((c) => c.key).join(',') : undefined };
  const active = activePresetKey(range);
  const canExport = has('ssr:export');

  const sortOptions = shown.filter((c) => c.sortKey).map((c) => ({ key: c.sortKey as string, label: c.label }));
  const [sortField, sortDir] = sort.split(':');

  const exportAs = (e: (typeof EXPORTS)[number]) =>
    doc.share({ path: ssrExportPath(exportParams, e.format), fileName: `ssr-${range.from}-to-${range.to}.${e.format}`, mimeType: e.mime });

  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <ChipRow label="Period" value={active ?? ''} onChange={(key) => { const p = SSR_PRESETS.find((x) => x.key === key); if (p) setRange(p.range()); }} options={SSR_PRESETS.map((p) => ({ value: p.key, label: p.label }))} />
      <View style={styles.row}>
        <View style={styles.flex}><Input label="From" value={range.from} onChangeText={(v) => setRange({ ...range, from: v.trim() })} autoCapitalize="none" placeholder="YYYY-MM-DD" /></View>
        <View style={styles.flex}><Input label="To" value={range.to} onChangeText={(v) => setRange({ ...range, to: v.trim() })} autoCapitalize="none" placeholder="YYYY-MM-DD" /></View>
      </View>
      <BranchFilter />
      {has('sales:view_all') ? <OrderBookerFilter value={bookers} onChange={setBookers} /> : null}
      {canExport ? (
        <View style={styles.row}>
          {EXPORTS.map((e) => (
            <View key={e.format} style={styles.flex}><Button label={e.label} variant="secondary" disabled={!report || invalid || doc.isBusy} onPress={() => void exportAs(e)} /></View>
          ))}
        </View>
      ) : null}

      {invalid ? <Alert text="The From date must be on or before the To date." /> : null}
      {error && !invalid ? <Alert text={error.message} /> : null}
      {report?.warnings.map((w) => <Alert key={w} text={w} tone="info" />)}

      {isLoading && !invalid ? (
        <LoadingState />
      ) : error && !report && !invalid ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : report ? (
        <View style={[styles.gap, isFetching ? styles.dim : null]}>
          <ChipRow label="View" value={view} onChange={(v) => setView(v)} options={VIEWS} />
          {report.rows.length === 0 ? (
            <Card><Text muted>No sales found for these filters.</Text></Card>
          ) : (
            <>
              <SearchBar value={query} onChangeText={setQuery} placeholder="Search in table..." />
              <Button label="Columns" variant="secondary" onPress={() => setColumnsOpen(true)} />
              <SortBar options={sortOptions} sortKey={sortField} dir={sortDir === 'asc' ? 'asc' : 'desc'} onSort={(k) => setSort(nextSort(sort, k))} />
              <Text variant="caption" muted>{FIRST_HEADER[report.view]}</Text>
              {report.rows.map((r) => <RowCard key={`${r.kind}:${r.key}`} row={r} depth={0} path="" cols={shown} onInvoices={(id, label) => setDrill({ id, label })} />)}
              <Card>
                <Text variant="label">{query.trim() ? 'Total (matching search)' : 'Grand total'}</Text>
                <Lines row={report.totals} cols={shown} />
              </Card>
              {report.view === 'product' && Math.ceil(report.totalRows / report.pageSize) > 1 ? (
                <View style={styles.gap}>
                  <Text variant="caption" muted>Page {report.page} of {Math.max(1, Math.ceil(report.totalRows / report.pageSize))} ({report.totalRows} products)</Text>
                  <View style={styles.row}>
                    <View style={styles.flex}><Button label="Previous" variant="secondary" disabled={report.page <= 1} onPress={() => setPage(report.page - 1)} /></View>
                    <View style={styles.flex}><Button label="Next" variant="secondary" disabled={report.page >= Math.ceil(report.totalRows / report.pageSize)} onPress={() => setPage(report.page + 1)} /></View>
                  </View>
                </View>
              ) : null}
            </>
          )}
          <Text variant="caption" muted>
            {report.returnsAttribution === 'RETURN_DATE' ? 'Returns are counted on the date they were made.' : 'Returns are counted against the original sale date.'} Gross Sale is units sold less units returned; Net Sale Value includes tax. Pur Qty is net receipts (purchases less cancellations and returns, plus manual stock adjustments). Rate is the selling price. Bonus and Exp Brk are not recorded yet. Opening and Closing are rebuilt from stock movements. Dates are Pakistan time.
          </Text>
        </View>
      ) : null}

      {columnsOpen ? (
        <FormModal visible title="Columns" onClose={() => setColumnsOpen(false)}>
          <ScrollView contentContainerStyle={styles.pad}>
            {cols.map((c) => (
              <SwitchRow key={c.key} label={c.label} value={!hidden.has(c.key)} onValueChange={() => setHidden((prev) => { const next = new Set(prev); if (next.has(c.key)) next.delete(c.key); else next.add(c.key); return next; })} />
            ))}
          </ScrollView>
        </FormModal>
      ) : null}
      <SsrDrilldown product={drill} params={filters} onClose={() => setDrill(null)} />
    </ScrollView>
  );
}

function Alert({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'info' }) {
  const theme = useTheme();
  return (
    <Card>
      <Text color={tone === 'danger' ? theme.danger : theme.text} accessibilityRole="alert">{text}</Text>
    </Card>
  );
}

function Lines({ row, cols }: { row: SsrRow; cols: SsrColumn[] }) {
  return (
    <View style={styles.gapSm}>
      {cols.map((c) => {
        const value = c.text(row);
        if (value === '' && (c.key === 'pack' || c.key === 'rate')) return null;
        return (
          <View key={c.key} style={styles.between}>
            <Text muted>{c.label}</Text>
            <Text variant={c.bold ? 'label' : 'body'}>{value}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** One report row; manufacturer/vendor rows expand to their children, product rows to their batches. */
function RowCard({ row, depth, path, cols, onInvoices }: { row: SsrRow; depth: number; path: string; cols: SsrColumn[]; onInvoices: (id: string, label: string) => void }) {
  const k = `${path}/${row.kind}:${row.key}`;
  const [open, setOpen] = useState(false);
  const children = row.children ?? [];
  const batches = row.batches ?? [];
  const expandable = children.length + batches.length > 0;
  const name = row.kind === 'batch' ? `Batch ${row.label}` : row.label;
  const marginLeft = useMemo(() => depth * spacing.md, [depth]);
  return (
    <View style={{ marginLeft }}>
      <Card>
        <View style={styles.between}>
          <Pressable style={styles.flex} disabled={!expandable} accessibilityRole="button" accessibilityLabel={expandable ? `${open ? 'Collapse' : 'Expand'} ${name}` : name} onPress={() => setOpen((o) => !o)}>
            <View style={styles.marker}>
              {expandable ? <Text>{open ? '▾' : '▸'}</Text> : null}
              <Text variant={depth === 0 ? 'label' : 'body'}>{name}</Text>
            </View>
          </Pressable>
          {row.kind === 'product' ? <Button label={`Show invoices ${row.label}`} variant="secondary" onPress={() => onInvoices(row.key, row.label)} /> : null}
        </View>
        <Lines row={row} cols={cols} />
      </Card>
      {open ? (
        <View style={styles.gap}>
          {children.map((c) => <RowCard key={`${k}/${c.kind}:${c.key}`} row={c} depth={depth + 1} path={k} cols={cols} onInvoices={onInvoices} />)}
          {batches.length > 0 ? <Text variant="caption" muted>BATCHES</Text> : null}
          {batches.map((c) => <RowCard key={`${k}/${c.kind}:${c.key}`} row={c} depth={depth + 1} path={k} cols={cols} onInvoices={onInvoices} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  gap: { gap: spacing.md },
  marker: { flexDirection: 'row', gap: spacing.xs },
  gapSm: { gap: spacing.xs },
  dim: { opacity: 0.7 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
