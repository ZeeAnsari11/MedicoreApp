import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { useDocumentFile } from '@/features/documents/use-document-file';
import { confirmAction } from '@/lib/confirm';
import { formatDate, isValidIsoDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { parseNumber } from '@/lib/numbers';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing, useTheme } from '@/theme';
import { PaymentMethod, PaymentStatus, PurchaseStatus, ReturnStatus } from '@/types/medicore';

import { outstandingOf, paymentDateTime, paymentProblem, round2, todayIso } from './purchase-lines';
import { buildPurchaseReturnRequest, buildPurchaseReturnRows, canReturnPurchase, defaultReturnChoices, fullReturnSelection } from './purchase-returns';
import { usePurchase, usePurchaseMutations, usePurchasePayments, usePurchaseReturns } from './use-purchases';

/** Payment methods the web offers (Credit exists in the enum but is not offered). */
const METHODS = [
  { value: PaymentMethod.CASH, label: 'Cash' },
  { value: PaymentMethod.CARD, label: 'Card' },
  { value: PaymentMethod.BANK_TRANSFER, label: 'Bank transfer' },
];
const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', CREDIT: 'Credit' };
const TONE = { [PaymentStatus.PAID]: 'success', [PaymentStatus.PARTIAL]: 'warning', [PaymentStatus.UNPAID]: 'neutral' } as const;

export function PurchaseDetailScreen() {
  return (
    <RequirePermission permission="purchases:read" what="view purchases">
      <PurchaseDetail />
    </RequirePermission>
  );
}

function PurchaseDetail() {
  const theme = useTheme();
  const { id, branchId } = useLocalSearchParams<{ id: string; branchId?: string }>();
  const { has } = useAuth();
  const { purchase, isLoading, error, refetch } = usePurchase(id, branchId ?? null);
  const { payments } = usePurchasePayments(id, branchId ?? null);
  const { returns } = usePurchaseReturns(id, branchId ?? null);
  const api = usePurchaseMutations(branchId ?? purchase?.branchId ?? null);
  const doc = useDocumentFile();
  const guard = useSubmitGuard();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [day, setDay] = useState(todayIso);
  const [reference, setReference] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const returnedByBatch = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of returns) for (const i of r.items) m.set(i.batchId, (m.get(i.batchId) ?? 0) + i.quantity);
    return m;
  }, [returns]);

  if (isLoading) return <LoadingState />;
  if (error && !purchase) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!purchase) return <EmptyState title="Purchase not found" />;

  const cancelled = purchase.status === PurchaseStatus.CANCELLED;
  const outstanding = outstandingOf(purchase);
  const query = `?branchId=${purchase.branchId}`;
  const pdf = { path: `/purchases/${purchase.id}/pdf${query}`, fileName: `${purchase.purchaseNumber}.pdf`, dialogTitle: `Purchase ${purchase.purchaseNumber}` };
  const canEdit = has('purchases:update') && purchase.isEditable === true;
  const canReturn = canReturnPurchase(purchase, has('purchases:return'));
  const canPay = has('purchases:record_payment') && !cancelled;
  const rows = buildPurchaseReturnRows(purchase, returns);
  const anythingToReturn = rows.some((r) => r.returnable > 0);

  const savePayment = () =>
    guard.run(async () => {
      const problem = paymentProblem(amount, outstanding) ?? (isValidIsoDate(day) ? (day > todayIso() ? 'The date cannot be in the future' : null) : 'Enter a valid date as YYYY-MM-DD');
      setFieldError(problem);
      if (problem) return;
      const value = parseNumber(amount) as number;
      if (!(await confirmAction({ title: `Record ${formatRs(value)} payment?`, message: `${purchase.purchaseNumber} · ${METHOD_LABEL[method]}`, confirmLabel: 'Record' }))) return;
      try {
        // The server wants the new cumulative total; it ignores the status and derives the real one.
        await api.recordPayment(purchase.id, {
          paymentStatus: purchase.paymentStatus,
          amountPaid: round2(purchase.amountPaid + value),
          method,
          paymentDate: paymentDateTime(day),
          reference: reference.trim() || undefined,
        });
        setAmount('');
        setReference('');
        setDay(todayIso());
      } catch {
        // toasted by the mutation; nothing was recorded and the form keeps what was typed
      }
    });

  const fullReturn = () =>
    guard.run(async () => {
      const ok = await confirmAction({
        title: 'Full return',
        message: `Are you sure you want to make a full return of ${purchase.purchaseNumber}? All remaining items will be returned.`,
        confirmLabel: 'Yes, full return',
        destructive: true,
      });
      if (!ok) return;
      const { ticked, qty } = fullReturnSelection(rows);
      try {
        await api.createReturn(purchase.id, buildPurchaseReturnRequest(purchase, rows, ticked, qty, defaultReturnChoices(), 0));
      } catch {
        // toasted by the mutation; nothing was recorded
      }
    });

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: purchase.purchaseNumber }} />
      <Card>
        <View style={styles.between}>
          <Text variant="heading">{purchase.purchaseNumber}</Text>
          <Badge label={purchase.status} tone={cancelled ? 'danger' : 'neutral'} />
        </View>
        <Text muted>{purchase.vendorName ?? 'Vendor'} · {formatDate(purchase.purchaseDate)}</Text>
        {purchase.vendorInvoiceNumber ? <Text muted>Vendor invoice: {purchase.vendorInvoiceNumber}</Text> : null}
        <View style={styles.badges}>
          <Badge label={purchase.paymentStatus} tone={TONE[purchase.paymentStatus]} />
          {purchase.returnStatus === ReturnStatus.PARTIAL ? <Badge label="Partially returned" tone="warning" /> : null}
          {purchase.returnStatus === ReturnStatus.FULL ? <Badge label="Fully returned" /> : null}
        </View>
        {purchase.isEditable === false && purchase.lockReason ? <Text variant="caption" muted>Not editable: {purchase.lockReason}</Text> : null}
      </Card>

      <Text variant="heading">Items</Text>
      {purchase.items.map((item, i) => (
        <Card key={`${item.productId}-${item.batchNumber}-${i}`}>
          <View style={styles.between}>
            <Text variant="label" style={styles.flex}>{item.productName ?? item.productId}</Text>
            <Text variant="label">{formatRs(item.lineTotal)}</Text>
          </View>
          <Text muted>
            {item.quantity} × {formatRs(item.purchasePrice)}{item.discountPercent ? ` − ${item.discountPercent}%` : ''}{item.taxPercent ? ` + ${item.taxPercent}% tax` : ''}
          </Text>
          <Text variant="caption" muted>Batch {item.batchNumber} · exp {formatDate(item.expiryDate)} · sale price {formatRs(item.sellingPrice)}</Text>
          {item.batchId && returnedByBatch.get(item.batchId) ? <Text variant="caption" muted>Returned: {returnedByBatch.get(item.batchId)}</Text> : null}
        </Card>
      ))}
      <Card>
        <Line label="Subtotal" value={purchase.subtotal} />
        <Line label="Discount" value={purchase.discountTotal} />
        <Line label="Tax" value={purchase.taxTotal} />
        <Line label="Grand total" value={purchase.grandTotal} strong />
        {purchase.returnedTotal ? <Line label="Returned" value={purchase.returnedTotal} /> : null}
        {purchase.returnedTotal ? <Line label="Net total" value={purchase.netTotal ?? purchase.grandTotal - purchase.returnedTotal} strong /> : null}
        <Line label="Total paid" value={purchase.amountPaid - (purchase.refundedTotal ?? 0)} />
        <Line label="Outstanding" value={outstanding} strong />
      </Card>

      <Text variant="heading">Payments</Text>
      {payments.length === 0 ? <Text muted>No payments recorded.</Text> : payments.map((p) => (
        <Card key={p.id}>
          <View style={styles.between}>
            <Text variant="label">{p.isRefund ? 'Refund' : p.isInitial ? 'Paid at purchase' : 'Payment'}</Text>
            <Text variant="label">{p.isRefund ? '-' : ''}{formatRs(p.amount)}</Text>
          </View>
          <Text variant="caption" muted>
            {new Date(p.paymentDate).toLocaleString()}
            {p.method ? ` · ${p.isRefund ? 'Refund · ' : ''}${METHOD_LABEL[p.method] ?? p.method}` : ''}
            {p.reference ? ` · ${p.reference}` : ''}
            {p.recordedBy ? ` · ${p.recordedBy}` : ''}
          </Text>
        </Card>
      ))}

      <Text variant="heading">Returns</Text>
      {returns.length === 0 ? <Text muted>No returns.</Text> : returns.map((r) => {
        const slip = { path: `/purchases/${purchase.id}/returns/${r.id}/pdf${query}`, fileName: `${r.returnNumber ?? 'purchase-return'}.pdf`, dialogTitle: `Return ${r.returnNumber ?? ''}`.trim() };
        return (
          <Card key={r.id}>
            <View style={styles.between}>
              <Text variant="label">{r.returnNumber ?? 'Return'}{r.kind === 'CANCELLATION' ? ' (cancellation)' : ''}</Text>
              <Text variant="label">{formatRs(r.total ?? 0)}</Text>
            </View>
            <Text variant="caption" muted>{formatDate(r.returnDate)}{r.reason ? ` · ${r.reason}` : ''}</Text>
            {r.items.map((i, idx) => <Text key={`${i.batchId}-${idx}`} variant="caption" muted>{i.productName ?? i.productId} · batch {i.batchNumber ?? i.batchId} · {i.quantity}</Text>)}
            <View style={styles.row}>
              <View style={styles.flex}><Button label="Share slip" variant="secondary" disabled={doc.isBusy} onPress={() => void doc.share(slip)} /></View>
              <View style={styles.flex}><Button label="Print slip" variant="secondary" disabled={doc.isBusy} onPress={() => void doc.print(slip)} /></View>
            </View>
          </Card>
        );
      })}

      {canPay ? (
        <>
          <Text variant="heading">Record a payment</Text>
          {outstanding <= 0.01 ? (
            <Text muted>This purchase is fully paid.</Text>
          ) : (
            <Card>
              <Text muted>Outstanding: {formatRs(outstanding)}</Text>
              <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={fieldError ?? undefined} />
              <Button label="Full amount" variant="secondary" onPress={() => setAmount(String(outstanding))} />
              <ChipRow label="Method" value={method} onChange={setMethod} options={METHODS} />
              <Input label="Date (YYYY-MM-DD)" value={day} onChangeText={(v) => setDay(v.trim())} autoCapitalize="none" />
              <Input label="Reference # (optional)" value={reference} onChangeText={setReference} />
              <Button label="Record payment" loading={guard.busy} onPress={savePayment} />
            </Card>
          )}
        </>
      ) : null}

      <Text variant="heading">Actions</Text>
      <Button label="Edit purchase" variant="secondary" disabled={!canEdit} onPress={() => router.push({ pathname: '/purchases/edit', params: { id: purchase.id, branchId: purchase.branchId } } as never)} />
      <Button label="Return items" variant="secondary" disabled={!canReturn || !anythingToReturn} onPress={() => router.push({ pathname: '/purchases/return', params: { id: purchase.id, branchId: purchase.branchId } } as never)} />
      <Button label="Full return" variant="danger" loading={guard.busy} disabled={!canReturn || !anythingToReturn} onPress={() => void fullReturn()} />
      <Button label="Share PO PDF" loading={doc.isBusy} onPress={() => void doc.share(pdf)} />
      <Button label="Print PO" variant="secondary" disabled={doc.isBusy} onPress={() => void doc.print(pdf)} />
    </ScrollView>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
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
  row: { flexDirection: 'row', gap: spacing.md },
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});

