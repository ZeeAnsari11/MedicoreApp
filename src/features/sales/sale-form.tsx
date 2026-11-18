import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { PickerField } from '@/components/ui/picker-field';
import { SettingRow } from '@/components/ui/setting-row';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchField } from '@/features/branches/use-branch-field';
import { useBranches } from '@/features/branches/use-branches';
import { CustomerForm } from '@/features/customers/customer-form';
import { buildCustomerCreate } from '@/features/customers/schema';
import { useCustomers } from '@/features/customers/use-customers';
import { useProducts } from '@/features/products/use-products';
import { confirmAction } from '@/lib/confirm';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { radius, spacing, useTheme } from '@/theme';
import { PaymentMethod, PaymentStatus } from '@/types/medicore';
import type { Sale } from '@/types/medicore';

import { AddItemSheet } from './add-item-sheet';
import { LineItemCard } from './line-item-card';
import { PaymentSheet } from './payment-sheet';
import { buildSaleItems, estimateLineTotal, linesFromSale, restoreMapFromSale, validateSaleDraft, type SaleLine } from './sale-lines';
import { useLastSalePrices, useOrderBookers, useSaleMutations } from './use-sales';

const METHODS = [
  { value: PaymentMethod.CASH, label: 'Cash' },
  { value: PaymentMethod.CARD, label: 'Card' },
  { value: PaymentMethod.CREDIT, label: 'Credit' },
  { value: PaymentMethod.BANK_TRANSFER, label: 'Bank transfer' },
];

/**
 * New Sale in three steps (sale details + line items → Add item → Payment), or (with `editSale`) the same first screen
 * prefilled to edit an unpaid sale, saved directly (no payment step, as on the web).
 */
export function SaleForm({ editSale }: { editSale?: Sale }) {
  const isEdit = !!editSale;
  const theme = useTheme();
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
  // What the user typed in Amount paid; null = follow the payment status (see amountPaid below).
  const [typedAmount, setTypedAmount] = useState<string | null>(null);
  const [lines, setLines] = useState<SaleLine[]>(() => (editSale ? linesFromSale(editSale) : []));
  /** null = sheet closed; '' = adding a new line; otherwise the key of the line being edited. */
  const [itemSheet, setItemSheet] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [methodSheet, setMethodSheet] = useState(false);
  const [pickedProduct, setPickedProduct] = useState('');
  const [customerModal, setCustomerModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [restoreByBatch] = useState(() => (editSale ? restoreMapFromSale(editSale) : undefined));

  const editing = itemSheet ? (lines.find((l) => l.key === itemSheet) ?? null) : null;
  const lastPrices = useLastSalePrices(customerId || null, [pickedProduct], branchId);
  const estimate = lines.reduce((s, l) => s + estimateLineTotal(l), 0);
  const units = lines.reduce((s, l) => s + l.quantity, 0);

  // Same as the web form: Paid fills the amount with the total (and follows it as lines change), Unpaid sets 0, and
  // the field stays editable either way. Switching to Partial keeps the amount shown so far.
  const autoAmount = paymentStatus === PaymentStatus.PAID ? estimate.toFixed(2) : paymentStatus === PaymentStatus.UNPAID ? '0' : null;
  const amountPaid = typedAmount ?? autoAmount ?? '0';
  const changePaymentStatus = (status: PaymentStatus) => {
    setTypedAmount(status === PaymentStatus.PARTIAL ? amountPaid : null);
    setPaymentStatus(status);
  };
  const branchName = branches.find((b) => b.id === branchId)?.name ?? '';
  const customerName = customersApi.customers.find((c) => c.id === customerId)?.name ?? editSale?.customerName;
  const bookerName = isEdit
    ? (editSale?.orderBookerName ?? '')
    : (orderBookers.find((o) => o.id === orderBookerId)?.name ?? user?.fullName ?? user?.username ?? '');

  const changeBranch = (id: string) => {
    if (id === branchId) return;
    // Customers, products and batches belong to a branch, and who may sell differs per branch.
    setPickedBranch(id);
    setPickedBooker('');
    setCustomerId('');
    setLines([]);
    setItemSheet(null);
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
            // Sent for every status, like the web; the backend validates it against the invoice total.
            amountPaid: Number(amountPaid) || 0,
            items,
          });
          // Ready for the next sale on the same branch, like the web.
          setPaymentOpen(false);
          setLines([]);
          setCustomerId('');
          setMethod(PaymentMethod.CASH);
          setPaymentStatus(PaymentStatus.UNPAID);
          setTypedAmount(null);
        }
      } catch (error) {
        // The mutation already toasted the server's message; keep everything typed. A 409 on edit means a payment or
        // return landed meanwhile, so leave for the list where the invoice now shows as locked.
        if (isEdit && (error as { status?: number }).status === 409) router.back();
      }
    });

  const branchLocked = isEdit || branchField.locked;
  const branchOptions = branchField.branches.map((b) => ({ value: b.id, label: b.isMain ? `${b.name} (Main)` : b.name }));

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View>
              <Text variant="heading">{isEdit ? 'Edit Sale' : 'New Sale'}</Text>
              <Text variant="caption" muted>{isEdit ? `Invoice ${editSale?.invoiceNumber}` : branchName ? `Selling from ${branchName}` : 'Selling'}</Text>
            </View>
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <PickerField
            label="Customer"
            value={customerId}
            onChange={setCustomerId}
            clearable
            disabled={!branchId}
            options={customersApi.customers.map((c) => ({ value: c.id, label: c.name, hint: c.phone }))}
            onCreateNew={has('customers:create') ? () => setCustomerModal(true) : undefined}
            createLabel="Create new customer"
            renderTrigger={({ open }) => <SettingRow label="Customer" value={customerName} placeholder={branchId ? 'Walk-in (no customer)' : 'Select a branch first'} onPress={branchId ? open : undefined} />}
          />
          {isEdit ? null : (
            <SettingRow label="Payment method" value={METHODS.find((m) => m.value === method)?.label} onPress={() => setMethodSheet(true)} />
          )}
          {!isEdit && canPickBooker ? (
            <PickerField
              label="Order Booker"
              value={orderBookerId}
              onChange={setPickedBooker}
              options={orderBookers.map((o) => ({ value: o.id, label: o.name }))}
              renderTrigger={({ open }) => <SettingRow label="Order booker" value={bookerName} onPress={open} />}
            />
          ) : (
            <SettingRow label="Order booker" value={bookerName} />
          )}
          {branchLocked ? (
            <SettingRow label="Branch" value={branchName || (branchField.locked ? branchField.lockedBranchName : '')} locked last />
          ) : (
            <PickerField
              label="Branch"
              value={branchId ?? ''}
              onChange={changeBranch}
              options={branchOptions}
              renderTrigger={({ open }) => <SettingRow label="Branch" value={branchName} placeholder="Select a branch" onPress={open} last />}
            />
          )}
        </View>

        <View style={styles.linesHead}>
          <Text variant="heading">Line items</Text>
          <View style={[styles.count, { backgroundColor: `${theme.primary}1A` }]}>
            <Text variant="caption" color={theme.primary}>{lines.length}</Text>
          </View>
          <View style={styles.flex} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add item"
            accessibilityState={{ disabled: !branchId || guard.busy }}
            disabled={!branchId || guard.busy}
            onPress={() => setItemSheet('')}
            style={[styles.addButton, { backgroundColor: theme.primary, opacity: !branchId || guard.busy ? 0.5 : 1 }]}
          >
            <MaterialCommunityIcons name="plus" size={18} color={theme.onPrimary} />
            <Text variant="label" color={theme.onPrimary}>Add item</Text>
          </Pressable>
        </View>
        {lines.length === 0 ? <Text muted style={styles.empty}>No items added yet. Tap “Add item” to begin.</Text> : null}
        {lines.map((l) => (
          <LineItemCard
            key={l.key}
            line={l}
            disabled={guard.busy}
            onEdit={() => setItemSheet(l.key)}
            onRemove={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
          />
        ))}
        <Text variant="caption" muted>
          Each line defaults to the nearest-expiry batch. A quantity beyond that batch&apos;s stock splits into the next batches.
        </Text>
        {isEdit ? <Text variant="caption" muted>Unpaid invoice: payment is recorded separately after saving.</Text> : null}
        {isEdit && formError ? <Text accessibilityRole="alert" color={theme.danger}>{formError}</Text> : null}
      </ScrollView>

      <BottomBar caption="Grand total" amount={estimate.toFixed(2)}>
        {isEdit ? (
          <Button label="Save changes" loading={guard.busy} disabled={!branchId || lines.length === 0} onPress={submit} />
        ) : (
          <Button label="Next: Payment →" disabled={!branchId || lines.length === 0} onPress={() => { setFormError(null); setPaymentOpen(true); }} />
        )}
      </BottomBar>

      <AddItemSheet
        visible={itemSheet !== null}
        key={itemSheet ?? 'closed'}
        branchName={branchName}
        products={productsApi.products}
        branchId={branchId}
        lines={lines}
        editing={editing}
        restoreByBatch={restoreByBatch}
        lastPrices={lastPrices}
        canDiscount={has('sales:discount')}
        onProductChange={setPickedProduct}
        onCommit={(line) => {
          setLines((prev) => (editing ? prev.map((l) => (l.key === editing.key ? line : l)) : [...prev, line]));
          setItemSheet(null);
        }}
        onClose={() => setItemSheet(null)}
      />

      {isEdit ? null : (
        <PaymentSheet
          visible={paymentOpen}
          summary={{ customer: customerName ?? 'Walk-in', method: METHODS.find((m) => m.value === method)?.label ?? method, orderBooker: bookerName, lineCount: lines.length, units }}
          grandTotal={estimate}
          paymentStatus={paymentStatus}
          onPaymentStatus={changePaymentStatus}
          amountPaid={amountPaid}
          onAmountPaid={setTypedAmount}
          error={formError}
          busy={guard.busy}
          onComplete={submit}
          onClose={() => setPaymentOpen(false)}
        />
      )}

      <ActionSheet
        title="Payment method"
        onClose={() => setMethodSheet(false)}
        actions={methodSheet ? METHODS.map((m) => ({ label: m.label, checked: m.value === method, onPress: () => setMethod(m.value) })) : null}
      />

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
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  linesHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  count: { borderRadius: 999, minWidth: 24, paddingHorizontal: spacing.sm, paddingVertical: 2, alignItems: 'center' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  empty: { textAlign: 'center', paddingVertical: spacing.xl },
});
