import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { FormScreen } from '@/components/ui/form-screen';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { BranchField } from '@/features/branches/branch-field';
import { useBranchField } from '@/features/branches/use-branch-field';
import { useBranches } from '@/features/branches/use-branches';
import { CustomerForm } from '@/features/customers/customer-form';
import { buildCustomerCreate } from '@/features/customers/schema';
import { useCustomers } from '@/features/customers/use-customers';
import { useProducts } from '@/features/products/use-products';
import { confirmAction } from '@/lib/confirm';
import { formatRs } from '@/lib/format';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';
import { PaymentMethod, PaymentStatus } from '@/types/medicore';
import type { Sale } from '@/types/medicore';

import { LineEntry } from './line-entry';
import { buildSaleItems, estimateLineTotal, linesFromSale, restoreMapFromSale, validateSaleDraft, type SaleLine } from './sale-lines';
import { useLastSalePrices, useOrderBookers, useSaleMutations } from './use-sales';

const METHODS = [
  { value: PaymentMethod.CASH, label: 'Cash' },
  { value: PaymentMethod.CARD, label: 'Card' },
  { value: PaymentMethod.CREDIT, label: 'Credit' },
  { value: PaymentMethod.BANK_TRANSFER, label: 'Bank transfer' },
];
const STATUSES = [
  { value: PaymentStatus.UNPAID, label: 'Unpaid' },
  { value: PaymentStatus.PARTIAL, label: 'Partial' },
  { value: PaymentStatus.PAID, label: 'Paid' },
];

/** The New Sale screen, or (with `editSale`) the same screen prefilled to edit an unpaid sale. */
export function SaleForm({ editSale }: { editSale?: Sale }) {
  const isEdit = !!editSale;
  const { user, has } = useAuth();
  const { branches } = useBranches();
  const branchField = useBranchField();
  const guard = useSubmitGuard();

  // The sale's branch is this form's own field (defaults to the main branch, locked for branch users), never the viewing filter.
  const [pickedBranch, setPickedBranch] = useState(editSale?.branchId ?? '');
  const mainBranchId = (branches.find((b) => b.isMain) ?? branches[0])?.id;
  const branchId = editSale?.branchId ?? (pickedBranch || branchField.defaultBranchId || mainBranchId || null);

  const canPickBooker = has('sales:book_for_others');
  const { orderBookers } = useOrderBookers(isEdit ? null : branchId, !isEdit && canPickBooker);
  const [pickedBooker, setPickedBooker] = useState('');
  const ownId = user?.userId ?? '';
  const orderBookerId = pickedBooker && orderBookers.some((o) => o.id === pickedBooker) ? pickedBooker : ownId;

  const customersApi = useCustomers(branchId);
  const productsApi = useProducts({ branchId }, !!branchId);
  const api = useSaleMutations(branchId);

  const [customerId, setCustomerId] = useState(editSale?.customerId ?? '');
  const [method, setMethod] = useState<PaymentMethod>(editSale?.paymentMethod ?? PaymentMethod.CASH);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(PaymentStatus.UNPAID);
  const [amountPaid, setAmountPaid] = useState('');
  const [lines, setLines] = useState<SaleLine[]>(() => (editSale ? linesFromSale(editSale) : []));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [entryToken, setEntryToken] = useState(0);
  const [pickedProduct, setPickedProduct] = useState('');
  const [customerModal, setCustomerModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const editing = lines.find((l) => l.key === editingKey) ?? null;
  const lastPrices = useLastSalePrices(customerId || null, [pickedProduct], branchId);
  const estimate = lines.reduce((s, l) => s + estimateLineTotal(l), 0);
  const branchName = branches.find((b) => b.id === branchId)?.name ?? '';

  const changeBranch = (id: string) => {
    if (id === branchId) return;
    // Customers, products and batches belong to a branch, and who may sell differs per branch.
    setPickedBranch(id);
    setPickedBooker('');
    setCustomerId('');
    setLines([]);
    setEditingKey(null);
    setEntryToken((t) => t + 1);
  };

  const submit = () =>
    guard.run(async () => {
      const problem = validateSaleDraft({ branchId, lines, paymentStatus: isEdit ? undefined : paymentStatus, amountPaid });
      setFormError(problem);
      if (problem || !branchId) return;
      const items = buildSaleItems(lines);
      const ok = await confirmAction({
        title: isEdit ? `Save changes to invoice ${editSale?.invoiceNumber}?` : 'Place this sale?',
        message: isEdit
          ? 'Stock and the journal entry are re-posted by the server. The invoice number stays the same.'
          : `${lines.length} ${lines.length === 1 ? 'line' : 'lines'} from ${branchName}. Totals, batches and numbering are decided by the server.`,
        confirmLabel: isEdit ? 'Save' : 'Place sale',
      });
      if (!ok) return;
      try {
        if (editSale) {
          await api.update(editSale.id, { customerId: customerId || undefined, items });
          router.back();
        } else {
          await api.create({
            branchId,
            orderBookerId: canPickBooker ? orderBookerId : undefined,
            customerId: customerId || undefined,
            paymentMethod: method,
            paymentStatus,
            // PAID/UNPAID amounts are derived by the backend; only a partial payment needs the typed amount.
            amountPaid: paymentStatus === PaymentStatus.PARTIAL ? Number(amountPaid) : undefined,
            items,
          });
          // Ready for the next sale on the same branch, like the web.
          setLines([]);
          setEditingKey(null);
          setCustomerId('');
          setMethod(PaymentMethod.CASH);
          setPaymentStatus(PaymentStatus.UNPAID);
          setAmountPaid('');
          setEntryToken((t) => t + 1);
        }
      } catch (error) {
        // The mutation already toasted the server's message; keep everything typed. A 409 on edit means a payment or
        // return landed meanwhile, so leave for the list where the invoice now shows as locked.
        if (isEdit && (error as { status?: number }).status === 409) router.back();
      }
    });

  return (
    <>
      <FormScreen>
        {isEdit || branchField.locked ? (
          <Input label="Branch" value={branchName} editable={false} />
        ) : (
          <BranchField field={branchField} value={branchId ?? ''} onChange={changeBranch} />
        )}
        <PickerField
          label="Customer"
          value={customerId}
          onChange={setCustomerId}
          clearable
          disabled={!branchId}
          placeholder={branchId ? 'Walk-in (no customer)' : 'Select a branch first'}
          options={customersApi.customers.map((c) => ({ value: c.id, label: c.name, hint: c.phone }))}
          onCreateNew={has('customers:create') ? () => setCustomerModal(true) : undefined}
          createLabel="Create new customer"
        />
        {isEdit ? (
          <Input label="Order Booker" value={editSale?.orderBookerName ?? ''} editable={false} />
        ) : canPickBooker ? (
          <PickerField label="Order Booker" value={orderBookerId} onChange={setPickedBooker} options={orderBookers.map((o) => ({ value: o.id, label: o.name }))} />
        ) : (
          <Input label="Order Booker" value={user?.fullName ?? user?.username ?? ''} editable={false} />
        )}
        {isEdit ? null : <ChipRow label="Method" value={method} onChange={setMethod} options={METHODS} />}

        <Text variant="heading">Line items</Text>
        <LineEntry
          key={`${editingKey ?? 'new'}-${entryToken}`}
          products={productsApi.products}
          branchId={branchId}
          lines={lines}
          editing={editing}
          restoreByBatch={editSale ? restoreMapFromSale(editSale) : undefined}
          lastPrices={lastPrices}
          canDiscount={has('sales:discount')}
          onProductChange={setPickedProduct}
          onCommit={(line) => {
            setLines((prev) => (editingKey ? prev.map((l) => (l.key === editingKey ? line : l)) : [...prev, line]));
            setEditingKey(null);
          }}
          onCancelEdit={() => setEditingKey(null)}
        />
        {lines.length === 0 ? <Text muted>No lines yet.</Text> : null}
        {lines.map((l, i) => (
          <Card key={l.key}>
            <View style={styles.between}>
              <Text variant="label" style={styles.flex}>{i + 1}. {l.productName}</Text>
              <Text variant="label">{formatRs(estimateLineTotal(l))}</Text>
            </View>
            <Text muted>
              {l.quantity} × {formatRs(l.unitPrice)}{l.discountPercent ? ` − ${l.discountPercent}%` : ''}{l.taxPercent ? ` + ${l.taxPercent}% tax` : ''}
            </Text>
            <Text variant="caption" muted>{l.allocations ? `Batches: ${l.allocations.map((a) => `${a.batchNumber} (${a.quantity})`).join(', ')}` : 'Batches: automatic (nearest expiry first)'}</Text>
            <View style={styles.row}>
              <View style={styles.flex}><Button label="Edit" variant="secondary" disabled={guard.busy} onPress={() => setEditingKey(l.key)} /></View>
              <View style={styles.flex}><Button label="Remove" variant="secondary" disabled={guard.busy} onPress={() => { setLines((prev) => prev.filter((x) => x.key !== l.key)); if (editingKey === l.key) setEditingKey(null); }} /></View>
            </View>
          </Card>
        ))}

        {isEdit ? (
          <Text muted>Unpaid invoice: payment is recorded separately after saving.</Text>
        ) : (
          <Card>
            <ChipRow label="Payment" value={paymentStatus} onChange={setPaymentStatus} options={STATUSES} />
            {paymentStatus === PaymentStatus.PARTIAL ? <Input label="Amount paid" value={amountPaid} onChangeText={setAmountPaid} keyboardType="decimal-pad" /> : null}
            {paymentStatus === PaymentStatus.PAID ? <Text variant="caption" muted>The full invoice amount is recorded as paid by the server.</Text> : null}
          </Card>
        )}
        <Card>
          <Text muted>Estimated total</Text>
          <Text variant="heading">{formatRs(estimate)}</Text>
          <Text variant="caption" muted>An estimate from the lines above. The server calculates the final subtotal, discount, tax and total.</Text>
        </Card>
        {formError ? <Text style={styles.error}>{formError}</Text> : null}
        <Button label={isEdit ? 'Save changes' : 'Place sale'} loading={guard.busy} disabled={!branchId || lines.length === 0} onPress={submit} />
      </FormScreen>

      <FormModal visible={customerModal} title="Create Customer" onClose={() => setCustomerModal(false)}>
        <CustomerForm
          mode="create"
          defaultBranchId={branchId ?? undefined}
          onSubmit={async (values) => {
            try {
              const created = await customersApi.create(buildCustomerCreate(values));
              setCustomerId(created.id);
              setCustomerModal(false);
            } catch {
              // toasted by the mutation; keep the form open with what was typed
            }
          }}
        />
      </FormModal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  error: { color: '#B3261E' },
});
