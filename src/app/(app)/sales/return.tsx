import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { buildReturnRequest, buildReturnRows, CONDITION_LABELS, emptyReturnDraft, METHOD_LABELS, REASON_LABELS, validateReturn } from '@/features/sales/returns';
import { useSale, useSaleMutations, useSaleReturns } from '@/features/sales/use-sales';
import { confirmAction } from '@/lib/confirm';
import { parseNumber } from '@/lib/numbers';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing, useTheme } from '@/theme';
import { PaymentMethod, ReturnCondition, ReturnReasonCode, ReturnSettlementMode } from '@/types/medicore';

export default function SaleReturnScreen() {
  const theme = useTheme();
  const { id, branchId } = useLocalSearchParams<{ id: string; branchId?: string }>();
  const { sale, isLoading, error, refetch } = useSale(id, branchId ?? null);
  const { returns, isLoading: returnsLoading } = useSaleReturns(id, branchId ?? null);
  const api = useSaleMutations(branchId ?? sale?.branchId ?? null);
  const guard = useSubmitGuard();
  const [draft, setDraft] = useState(emptyReturnDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const rows = useMemo(() => (sale ? buildReturnRows(sale, returns) : []), [sale, returns]);

  if (isLoading || returnsLoading) return <LoadingState />;
  if (error && !sale) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!sale) return <EmptyState title="Sale not found" />;

  const send = (full: boolean) =>
    guard.run(async () => {
      if (!full) {
        const problem = validateReturn(rows, draft.qty);
        setFormError(problem);
        if (problem) return;
      } else if (rows.every((r) => r.returnable <= 0)) {
        return setFormError('Nothing is left to return');
      }
      setFormError(null);
      const ok = await confirmAction({
        title: full ? 'Return everything that is left?' : 'Record this return?',
        message: `${sale.invoiceNumber}. ${draft.mode === ReturnSettlementMode.REFUND ? `Refund by ${METHOD_LABELS[draft.method]}.` : "Reduces the customer's balance."} The server calculates the amounts.`,
        confirmLabel: 'Record return',
      });
      if (!ok) return;
      try {
        await api.createReturn(sale.id, buildReturnRequest(sale.branchId, rows, draft, !full));
        router.back();
      } catch {
        // toasted by the mutation; nothing was recorded and the form keeps what was typed
      }
    });

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Return ${sale.invoiceNumber}` }} />
      {rows.map((r) => (
        <Card key={r.key}>
          <Text variant="label">{r.productName}</Text>
          <Text variant="caption" muted>Batch {r.batchNumber} · sold {r.original} · returned {r.returned} · can return {r.returnable}</Text>
          <Input
            label="Return quantity"
            keyboardType="decimal-pad"
            editable={r.returnable > 0}
            value={draft.qty[r.key] ? String(draft.qty[r.key]) : ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, qty: { ...d.qty, [r.key]: parseNumber(v) ?? 0 } }))}
          />
          <ChipRow
            label="Condition"
            value={draft.condition[r.key] ?? ReturnCondition.RESTOCK}
            onChange={(c) => setDraft((d) => ({ ...d, condition: { ...d.condition, [r.key]: c } }))}
            options={Object.values(ReturnCondition).map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
          />
        </Card>
      ))}
      <Card>
        <ChipRow label="Reason" value={draft.reasonCode} onChange={(reasonCode) => setDraft((d) => ({ ...d, reasonCode }))} options={Object.values(ReturnReasonCode).map((c) => ({ value: c, label: REASON_LABELS[c] }))} />
        <Input label="Notes" value={draft.notes} onChangeText={(notes) => setDraft((d) => ({ ...d, notes }))} />
        <ChipRow
          label="Settlement"
          value={draft.mode}
          onChange={(mode) => setDraft((d) => ({ ...d, mode }))}
          options={[{ value: ReturnSettlementMode.ADJUST, label: 'Reduce balance' }, { value: ReturnSettlementMode.REFUND, label: 'Refund' }]}
        />
        {draft.mode === ReturnSettlementMode.REFUND ? (
          <ChipRow label="Refund by" value={draft.method} onChange={(method) => setDraft((d) => ({ ...d, method }))} options={Object.values(PaymentMethod).map((m) => ({ value: m, label: METHOD_LABELS[m] }))} />
        ) : null}
      </Card>
      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      <Button label="Record return" loading={guard.busy} onPress={() => send(false)} />
      <Button label="Return everything left" variant="secondary" disabled={guard.busy} onPress={() => send(true)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  error: { color: '#B3261E' },
});
