import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useDocumentFile } from '@/features/documents/use-document-file';
import { METHOD_LABELS } from '@/features/sales/returns';
import { useOrderBookers, useSale, useSaleMutations, useSalePayments, useSaleReturns } from '@/features/sales/use-sales';
import { confirmAction } from '@/lib/confirm';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { parseNumber } from '@/lib/numbers';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing, useTheme } from '@/theme';
import { PaymentMethod, PaymentStatus } from '@/types/medicore';

const EPS = 0.005;

export default function SaleDetailScreen() {
  const theme = useTheme();
  const { id, branchId } = useLocalSearchParams<{ id: string; branchId?: string }>();
  const { has, isAdmin } = useAuth();
  const { sale, isLoading, error, refetch } = useSale(id, branchId ?? null);
  const { payments } = useSalePayments(id, branchId ?? null);
  const { returns } = useSaleReturns(id, branchId ?? null);
  const api = useSaleMutations(branchId ?? sale?.branchId ?? null);
  const doc = useDocumentFile();
  const guard = useSubmitGuard();
  const [payOpen, setPayOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [reference, setReference] = useState('');
  const [bookerId, setBookerId] = useState('');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  // The backend only lets an admin reassign the Order Booker.
  const canReassign = isAdmin;
  const { orderBookers } = useOrderBookers(sale?.branchId ?? null, canReassign && reassignOpen);

  if (isLoading) return <LoadingState />;
  if (error && !sale) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!sale) return <EmptyState title="Sale not found" />;

  const pending = sale.status === 'PENDING';
  const voided = !!sale.deletedAt;
  const label = sale.invoiceNumber || sale.orderNumber || 'Sale';
  const outstanding = Math.max(sale.grandTotal - (sale.returnedTotal ?? 0) - sale.amountPaid, 0);
  const query = `?branchId=${sale.branchId}`;
  const pdf = { path: `/sales/${sale.id}/pdf${query}`, fileName: `${label}.pdf`, dialogTitle: `Invoice ${label}` };
  const canPay = has('sales:record_payment') && !pending && outstanding > EPS && !voided;
  const canReturn = has('sales:return') && !pending && !voided;

  const savePayment = () =>
    guard.run(async () => {
      const value = parseNumber(amount);
      if (value === null || !(value > 0)) return setFieldError('Enter an amount greater than 0');
      if (value > outstanding + EPS) return setFieldError(`Only ${formatRs(outstanding)} is outstanding`);
      setFieldError(null);
      if (!(await confirmAction({ title: `Record ${formatRs(value)} payment?`, message: `${label} · ${METHOD_LABELS[method]}`, confirmLabel: 'Record' }))) return;
      const cumulative = sale.amountPaid + value;
      try {
        await api.recordPayment(sale.id, {
          paymentStatus: cumulative >= sale.grandTotal - (sale.returnedTotal ?? 0) - EPS ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
          amountPaid: cumulative,
          method,
          reference: reference.trim() || undefined,
        });
        setPayOpen(false);
        setAmount('');
        setReference('');
      } catch {
        // toasted by the mutation; the dialog stays open and nothing was recorded
      }
    });

  const saveReassign = () =>
    guard.run(async () => {
      if (!bookerId) return setFieldError('Choose an Order Booker');
      setFieldError(null);
      try {
        await api.reassign(sale.id, { orderBookerId: bookerId, reason: reason.trim() || undefined });
        setReassignOpen(false);
      } catch {
        // toasted by the mutation
      }
    });

  const voidIt = () =>
    guard.run(async () => {
      if (!(await confirmAction({ title: 'Void this sale?', message: `${label}. Stock is restored and the accounting entries are reversed. This cannot be undone.`, confirmLabel: 'Void sale', destructive: true }))) return;
      try {
        await api.voidSale(sale.id);
        router.back();
      } catch {
        // toasted by the mutation
      }
    });

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: label }} />
      <Card>
        <View style={styles.between}>
          <Text variant="heading">{label}</Text>
          <Badge label={pending ? 'Pending' : voided ? 'Voided' : sale.paymentStatus} tone={sale.paymentStatus === PaymentStatus.PAID ? 'success' : 'warning'} />
        </View>
        <Text muted>{formatDate(sale.saleDate)} · {sale.customerName ?? 'Walk-in'}</Text>
        <Text muted>Order Booker: {sale.orderBookerName}</Text>
        <Text muted>Method: {METHOD_LABELS[sale.paymentMethod]}</Text>
        {pending ? <Text variant="caption" muted>Waiting in Process Orders. The invoice number is issued when it is confirmed.</Text> : null}
        {sale.lockReason ? <Text variant="caption" muted>{sale.lockReason}</Text> : null}
      </Card>

      <Text variant="heading">Items</Text>
      {sale.items.map((item, i) => (
        <Card key={`${item.productId}-${i}`}>
          <View style={styles.between}>
            <Text variant="label" style={styles.flex}>{item.productName}</Text>
            <Text variant="label">{formatRs(item.lineTotal)}</Text>
          </View>
          <Text muted>{item.quantity} × {formatRs(item.unitPrice)}{item.discountPercent ? ` − ${item.discountPercent}%` : ''}{item.taxPercent ? ` + ${item.taxPercent}% tax` : ''}</Text>
          <Text variant="caption" muted>Batches: {item.batchAllocations.map((a) => `${a.batchNumber} (${a.quantity})`).join(', ') || '—'}</Text>
        </Card>
      ))}
      <Card>
        <Line label="Subtotal" value={sale.subtotal} />
        <Line label="Discount" value={sale.discountTotal} />
        <Line label="Tax" value={sale.taxTotal} />
        <Line label="Total" value={sale.grandTotal} strong />
        {sale.returnedTotal ? <Line label="Returned" value={sale.returnedTotal} /> : null}
        <Line label="Paid" value={sale.amountPaid} />
        <Line label="Outstanding" value={outstanding} strong />
      </Card>

      <Text variant="heading">Payments</Text>
      {payments.length === 0 ? <Text muted>No payments recorded.</Text> : payments.map((p) => (
        <Card key={p.id}>
          <View style={styles.between}>
            <Text variant="label">{p.isRefund ? 'Refund' : p.isInitial ? 'Paid at sale' : 'Payment'}</Text>
            <Text variant="label">{formatRs(p.amount)}</Text>
          </View>
          <Text variant="caption" muted>{formatDate(p.paymentDate)}{p.method ? ` · ${METHOD_LABELS[p.method]}` : ''}{p.reference ? ` · ${p.reference}` : ''}</Text>
        </Card>
      ))}

      <Text variant="heading">Returns</Text>
      {returns.length === 0 ? <Text muted>No returns.</Text> : returns.map((r) => (
        <Card key={r.id}>
          <View style={styles.between}>
            <Text variant="label">{r.returnNumber ?? r.invoiceNumber ?? 'Return'}</Text>
            <Text variant="label">{formatRs(r.total ?? 0)}</Text>
          </View>
          <Text variant="caption" muted>{formatDate(r.returnDate)} · {r.reason}</Text>
        </Card>
      ))}

      <Text variant="heading">Actions</Text>
      <Button label="Share invoice PDF" loading={doc.isBusy} disabled={pending} onPress={() => void doc.share(pdf)} />
      <Button label="Print invoice" variant="secondary" disabled={doc.isBusy || pending} onPress={() => void doc.print(pdf)} />
      <Button label="Record payment" variant="secondary" disabled={!canPay} onPress={() => setPayOpen(true)} />
      <Button label="Edit sale" variant="secondary" disabled={!has('sales:update') || sale.isEditable === false || pending} onPress={() => router.push({ pathname: '/sales/edit', params: { id: sale.id, branchId: sale.branchId } } as never)} />
      <Button label="Return items" variant="secondary" disabled={!canReturn} onPress={() => router.push({ pathname: '/sales/return', params: { id: sale.id, branchId: sale.branchId } } as never)} />
      <Button label="Reassign Order Booker" variant="secondary" disabled={!canReassign || pending} onPress={() => setReassignOpen(true)} />
      <Button label="Void sale" variant="danger" loading={guard.busy} disabled={!has('sales:void') || pending || voided} onPress={() => void voidIt()} />

      <FormModal visible={payOpen} title="Record payment" onClose={() => setPayOpen(false)}>
        <Text muted>Outstanding: {formatRs(outstanding)}</Text>
        <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={fieldError ?? undefined} />
        <ChipRow label="Method" value={method} onChange={setMethod} options={Object.values(PaymentMethod).map((m) => ({ value: m, label: METHOD_LABELS[m] }))} />
        <Input label="Reference" value={reference} onChangeText={setReference} />
        <Button label="Record payment" loading={guard.busy} onPress={savePayment} />
      </FormModal>
      <FormModal visible={reassignOpen} title="Reassign Order Booker" onClose={() => setReassignOpen(false)}>
        <PickerField label="New Order Booker" value={bookerId} onChange={setBookerId} options={orderBookers.filter((o) => o.id !== sale.orderBookerId).map((o) => ({ value: o.id, label: o.name }))} error={fieldError ?? undefined} />
        <Input label="Reason" value={reason} onChangeText={setReason} />
        <Button label="Reassign" loading={guard.busy} onPress={saveReassign} />
      </FormModal>
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
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
