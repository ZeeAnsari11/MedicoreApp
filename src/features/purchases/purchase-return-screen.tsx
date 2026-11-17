import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { confirmAction } from '@/lib/confirm';
import { formatRs } from '@/lib/format';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing, useTheme } from '@/theme';
import { ReturnReasonCode, ReturnSettlementMode } from '@/types/medicore';

import {
  buildPurchaseReturnRequest,
  buildPurchaseReturnRows,
  canReturnPurchase,
  defaultReturnChoices,
  fullReturnSelection,
  REASON_LABELS,
  REFUND_METHODS,
  RETURN_QTY_MESSAGE,
  returnFigures,
  returnQuantitiesInvalid,
  settlementFootnote,
} from './purchase-returns';
import { usePurchase, usePurchaseMutations, usePurchaseReturns } from './use-purchases';

const REASONS = Object.values(ReturnReasonCode).map((r) => ({ value: r, label: REASON_LABELS[r] }));

export function PurchaseReturnScreen() {
  return (
    <RequirePermission permission="purchases:return" what="return purchases">
      <PurchaseReturn />
    </RequirePermission>
  );
}

function PurchaseReturn() {
  const theme = useTheme();
  const { id, branchId } = useLocalSearchParams<{ id: string; branchId?: string }>();
  const { has } = useAuth();
  const { purchase, isLoading, error, refetch } = usePurchase(id, branchId ?? null);
  const { returns, isLoading: returnsLoading } = usePurchaseReturns(id, branchId ?? null);
  const api = usePurchaseMutations(branchId ?? purchase?.branchId ?? null);
  const guard = useSubmitGuard();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState(defaultReturnChoices);
  const rows = useMemo(() => (purchase ? buildPurchaseReturnRows(purchase, returns) : []), [purchase, returns]);

  if (isLoading || returnsLoading) return <LoadingState />;
  if (error && !purchase) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!purchase) return <EmptyState title="Purchase not found" />;
  if (!canReturnPurchase(purchase, has('purchases:return'))) return <EmptyState title="Nothing to return" message="This purchase is cancelled or has already been fully returned." />;

  const selectable = rows.filter((r) => r.returnable > 0);
  const figures = returnFigures(purchase, rows, ticked, qty, choices.mode);
  const invalid = returnQuantitiesInvalid(rows, ticked, qty);
  const canConfirm = ticked.size > 0 && !invalid && !guard.busy;
  // With no excess there is nothing to refund, so the mode choice is irrelevant (web shows it only when excess > 0).
  const mode = figures.excess > 0 ? choices.mode : ReturnSettlementMode.ADJUST;

  const toggle = (key: string, returnable: number) => {
    const next = new Set(ticked);
    if (next.has(key)) {
      next.delete(key);
      setQty((q) => ({ ...q, [key]: '0' }));
    } else {
      next.add(key);
      setQty((q) => ({ ...q, [key]: String(returnable) }));
    }
    setTicked(next);
  };
  const toggleAll = () => {
    if (ticked.size === selectable.length) {
      setTicked(new Set());
      setQty({});
    } else {
      const all = fullReturnSelection(rows);
      setTicked(all.ticked);
      setQty(all.qty);
    }
  };

  const confirm = () =>
    guard.run(async () => {
      if (!canConfirm) return;
      const refund = returnFigures(purchase, rows, ticked, qty, mode).refund;
      const ok = await confirmAction({
        title: 'Record this return?',
        message: `${purchase.purchaseNumber}. Return total ${formatRs(figures.returnTotal)}. ${settlementFootnote(mode, figures, formatRs)} The server calculates the final amounts.`,
        confirmLabel: 'Confirm return',
        destructive: true,
      });
      if (!ok) return;
      try {
        await api.createReturn(purchase.id, buildPurchaseReturnRequest(purchase, rows, ticked, qty, { ...choices, mode }, refund));
        router.back();
      } catch {
        // toasted by the mutation; nothing was recorded and the form keeps what was typed
      }
    });

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Return ${purchase.purchaseNumber}` }} />
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Select all items" accessibilityState={{ checked: selectable.length > 0 && ticked.size === selectable.length ? true : ticked.size > 0 ? 'mixed' : false, disabled: selectable.length === 0 }} disabled={selectable.length === 0 || guard.busy} onPress={toggleAll} style={styles.row}>
        <MaterialCommunityIcons name={ticked.size === 0 ? 'checkbox-blank-outline' : ticked.size === selectable.length ? 'checkbox-marked' : 'minus-box'} size={24} color={theme.primary} />
        <Text>{ticked.size} of {selectable.length} selected</Text>
      </Pressable>

      {rows.map((r) => {
        const done = r.returnable <= 0;
        const on = ticked.has(r.key);
        return (
          <Card key={r.key} style={done ? { opacity: 0.55 } : undefined}>
            <View style={styles.row}>
              <Pressable accessibilityRole="checkbox" accessibilityLabel={`Select ${r.productName} batch ${r.batchNumber}`} accessibilityState={{ checked: on, disabled: done }} disabled={done || guard.busy} onPress={() => toggle(r.key, r.returnable)} hitSlop={8}>
                <MaterialCommunityIcons name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={theme.primary} />
              </Pressable>
              <Text variant="label" style={styles.flex}>{r.productName}</Text>
            </View>
            <Text muted>Batch {r.batchNumber} · Qty {r.quantity} · Returned {r.returned}</Text>
            {done ? (
              <Text variant="caption" muted>Fully returned</Text>
            ) : (
              <>
                <Input label="Return qty" value={on ? (qty[r.key] ?? '') : '0'} editable={on && !guard.busy} onChangeText={(v) => setQty((q) => ({ ...q, [r.key]: v }))} keyboardType="decimal-pad" />
                <Text variant="caption" muted>Up to {r.returnable} · Return amount {formatRs(on ? (Number(qty[r.key]) || 0) * r.unitAmount : 0)}</Text>
              </>
            )}
          </Card>
        );
      })}

      <ChipRow label="Reason" value={choices.reasonCode} onChange={(reasonCode) => setChoices((c) => ({ ...c, reasonCode }))} options={REASONS} />
      <Input label="Notes (optional)" value={choices.notes} onChangeText={(notes) => setChoices((c) => ({ ...c, notes }))} />

      {figures.excess > 0 ? (
        <Card>
          <Text variant="label">Excess {formatRs(figures.excess)} over the outstanding balance</Text>
          <ChipRow
            value={choices.mode}
            onChange={(m) => setChoices((c) => ({ ...c, mode: m }))}
            options={[{ value: ReturnSettlementMode.ADJUST, label: 'Keep as vendor credit' }, { value: ReturnSettlementMode.REFUND, label: 'Refund now' }]}
          />
          {choices.mode === ReturnSettlementMode.REFUND ? <ChipRow label="Refund method" value={choices.method} onChange={(method) => setChoices((c) => ({ ...c, method }))} options={REFUND_METHODS} /> : null}
        </Card>
      ) : null}

      <Card>
        <Line label="Return total" value={figures.returnTotal} />
        <Line label="New net total" value={figures.newNet} />
        <Line label="New paid" value={figures.newPaid} />
        <Line label="New outstanding" value={figures.newOutstanding} />
        <Text variant="caption" muted>{settlementFootnote(mode, figures, formatRs)}</Text>
      </Card>
      {invalid ? <Text accessibilityRole="alert" style={styles.error}>{RETURN_QTY_MESSAGE}</Text> : null}
      <Button label="Confirm return" variant="danger" loading={guard.busy} disabled={!canConfirm} onPress={confirm} />
    </ScrollView>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.between}>
      <Text muted>{label}</Text>
      <Text variant="label">{formatRs(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  error: { color: '#B3261E' },
});
