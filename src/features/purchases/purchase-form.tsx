import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { FormScreen } from '@/components/ui/form-screen';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { Text } from '@/components/ui/text';
import { BranchField } from '@/features/branches/branch-field';
import { useBranchField } from '@/features/branches/use-branch-field';
import { useBranches } from '@/features/branches/use-branches';
import { useProducts } from '@/features/products/use-products';
import { useVendorProductsForVendor } from '@/features/vendor-products/use-vendor-products';
import { useVendors } from '@/features/vendors/use-vendors';
import { confirmAction } from '@/lib/confirm';
import { formatRs } from '@/lib/format';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';
import { PaymentStatus, type Purchase } from '@/types/medicore';

import { PurchaseLineEntry } from './purchase-line-entry';
import {
  amountForStatus,
  buildPriceChangeRows,
  buildPurchaseItems,
  estimateGrandTotal,
  estimateLineTotal,
  linesFromPurchase,
  todayIso,
  validatePurchaseDraft,
  type PriceChangeRow,
  type PurchaseLine,
} from './purchase-lines';
import { useLastPurchasePrices, usePurchaseMutations } from './use-purchases';

const STATUSES = [
  { value: PaymentStatus.UNPAID, label: 'Unpaid' },
  { value: PaymentStatus.PARTIAL, label: 'Partial' },
  { value: PaymentStatus.PAID, label: 'Paid' },
];

type PriceDecision = 'approve' | 'skip' | 'cancel';

/** Receive-purchase screen, or (with `editPurchase`) the same screen prefilled to edit an unpaid purchase. */
export function PurchaseForm({ editPurchase }: { editPurchase?: Purchase }) {
  const isEdit = !!editPurchase;
  const { branches } = useBranches();
  const branchField = useBranchField();
  const guard = useSubmitGuard();

  // The purchase's branch is this form's own field (locked for branch users), never the viewing filter.
  const [pickedBranch, setPickedBranch] = useState(editPurchase?.branchId ?? '');
  const mainBranchId = (branches.find((b) => b.isMain) ?? branches[0])?.id;
  const branchId = editPurchase?.branchId ?? (pickedBranch || branchField.defaultBranchId || mainBranchId || null);

  const [vendorId, setVendorId] = useState(editPurchase?.vendorId ?? '');
  const [invoiceNumber, setInvoiceNumber] = useState(editPurchase?.vendorInvoiceNumber ?? '');
  const [purchaseDate, setPurchaseDate] = useState(() => (editPurchase ? editPurchase.purchaseDate.slice(0, 10) : todayIso()));
  const [lines, setLines] = useState<PurchaseLine[]>(() => (editPurchase ? linesFromPurchase(editPurchase) : []));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [entryToken, setEntryToken] = useState(0);
  const [pickedProduct, setPickedProduct] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(PaymentStatus.UNPAID);
  const [amountPaid, setAmountPaid] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [priceAsk, setPriceAsk] = useState<PriceChangeRow[] | null>(null);
  const priceResolve = useRef<((d: PriceDecision) => void) | null>(null);

  const vendorsApi = useVendors(branchId);
  const productsApi = useProducts({ branchId }, !!branchId);
  const { vendorProducts } = useVendorProductsForVendor(vendorId || null);
  const api = usePurchaseMutations(branchId);
  const lastPrices = useLastPurchasePrices(vendorId || null, [pickedProduct], branchId);

  // Web rule: only the selected vendor's active product links can be bought from it.
  const activeLinks = useMemo(() => vendorProducts.filter((v) => v.isActive), [vendorProducts]);
  const linkPrices = useMemo(() => new Map(activeLinks.map((v) => [v.productId, v.purchasePrice])), [activeLinks]);
  const products = useMemo(() => productsApi.products.filter((p) => linkPrices.has(p.id)), [productsApi.products, linkPrices]);

  const editing = lines.find((l) => l.key === editingKey) ?? null;
  const estimate = estimateGrandTotal(lines);
  const branchName = branches.find((b) => b.id === branchId)?.name ?? '';

  const resetEntry = () => {
    setEditingKey(null);
    setEntryToken((t) => t + 1);
    setPickedProduct('');
  };

  const changeBranch = (id: string) => {
    if (id === branchId) return;
    // Vendors, products and batches belong to a branch.
    setPickedBranch(id);
    setVendorId('');
    setLines([]);
    resetEntry();
  };

  const changeVendor = async (id: string) => {
    if (id === vendorId) return;
    if (lines.length > 0) {
      const ok = await confirmAction({ title: 'Change vendor?', message: 'Changing the vendor will clear all line items you have added.', confirmLabel: 'Change vendor', destructive: true });
      if (!ok) return;
      setLines([]);
      resetEntry();
    }
    setVendorId(id);
  };

  const askPriceDecision = (rows: PriceChangeRow[]) =>
    new Promise<PriceDecision>((resolve) => {
      priceResolve.current = resolve;
      setPriceAsk(rows);
    });
  const decide = (d: PriceDecision) => {
    setPriceAsk(null);
    priceResolve.current?.(d);
    priceResolve.current = null;
  };

  const changePaymentStatus = (status: PaymentStatus) => {
    setPaymentStatus(status);
    setAmountPaid(amountForStatus(status, estimate, amountPaid));
  };

  const submit = () =>
    guard.run(async () => {
      const problem = validatePurchaseDraft({ vendorId, purchaseDate, lines });
      setFormError(problem);
      if (problem || !branchId) return;
      const items = buildPurchaseItems(lines);

      // A price entered below the vendor's current price needs the user's decision (create only, as on the web).
      let priceUpdates: { productId: string; updatePrices: boolean }[] | undefined;
      if (!isEdit) {
        const rows = buildPriceChangeRows(lines, linkPrices);
        if (rows.length > 0) {
          const decision = await askPriceDecision(rows);
          if (decision === 'cancel') return;
          priceUpdates = rows.map((r) => ({ productId: r.productId, updatePrices: decision === 'approve' }));
        }
      }

      const vendorName = vendorsApi.vendors.find((v) => v.id === vendorId)?.company ?? '';
      const ok = await confirmAction({
        title: isEdit ? `Save changes to purchase ${editPurchase?.purchaseNumber}?` : 'Receive this purchase?',
        message: isEdit
          ? 'Stock and the journal entry are re-posted by the server. The purchase number stays the same.'
          : `${lines.length} ${lines.length === 1 ? 'line' : 'lines'} from ${vendorName} into ${branchName}. Stock, totals and numbering are decided by the server.`,
        confirmLabel: isEdit ? 'Save' : 'Receive',
      });
      if (!ok) return;

      try {
        if (editPurchase) {
          await api.update(editPurchase.id, { vendorId, vendorInvoiceNumber: invoiceNumber.trim() || undefined, purchaseDate, items });
          router.back();
        } else {
          await api.create({
            branchId,
            vendorId,
            vendorInvoiceNumber: invoiceNumber.trim() || undefined,
            purchaseDate,
            paymentStatus,
            // PAID / UNPAID amounts are derived by the backend; only a partial payment needs the typed amount.
            amountPaid: paymentStatus === PaymentStatus.PARTIAL ? Number(amountPaid) : undefined,
            items,
            priceUpdates,
          });
          // Ready for the next purchase, like the web.
          setVendorId('');
          setInvoiceNumber('');
          setPurchaseDate(todayIso());
          setLines([]);
          setPaymentStatus(PaymentStatus.UNPAID);
          setAmountPaid('');
          resetEntry();
        }
      } catch (error) {
        // The mutation already toasted the server's message; keep everything typed. A "locked" 409 on edit means a
        // payment or return landed meanwhile, so leave for the list where the purchase now shows as locked.
        if (isEdit && (error as { status?: number }).status === 409 && /locked/i.test((error as Error).message)) router.back();
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
          label="Vendor"
          required
          value={vendorId}
          onChange={(id) => void changeVendor(id)}
          disabled={!branchId}
          placeholder={branchId ? 'Select vendor' : 'Select a branch first'}
          options={vendorsApi.vendors.filter((v) => v.isActive || v.id === vendorId).map((v) => ({ value: v.id, label: v.company, hint: v.contactName }))}
        />
        <Input label="Vendor invoice # (optional)" value={invoiceNumber} onChangeText={setInvoiceNumber} />
        <Input label="Purchase date (YYYY-MM-DD)" value={purchaseDate} onChangeText={(v) => setPurchaseDate(v.trim())} autoCapitalize="none" />

        <Text variant="heading">Line items</Text>
        <PurchaseLineEntry
          key={`${editingKey ?? 'new'}-${entryToken}-${vendorId}`}
          products={products}
          vendorSelected={!!vendorId}
          editing={editing}
          lastPrices={lastPrices}
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
              Batch {l.batchNumber} · exp {l.expiryDate} · {l.quantity} × {formatRs(Number(l.purchasePrice))}
              {l.discountPercent ? ` − ${l.discountPercent}%` : ''}
              {l.taxPercent ? ` + ${l.taxPercent}% tax` : ''}
            </Text>
            <Text variant="caption" muted>Sale price {formatRs(Number(l.sellingPrice))}</Text>
            <View style={styles.row}>
              <View style={styles.flex}><Button label="Edit" variant="secondary" disabled={guard.busy} onPress={() => setEditingKey(l.key)} /></View>
              <View style={styles.flex}><Button label="Remove" variant="secondary" disabled={guard.busy} onPress={() => { setLines((prev) => prev.filter((x) => x.key !== l.key)); if (editingKey === l.key) setEditingKey(null); }} /></View>
            </View>
          </Card>
        ))}

        {isEdit ? (
          <Text muted>Unpaid purchase: payment is recorded separately after saving.</Text>
        ) : (
          <Card>
            <ChipRow label="Payment" value={paymentStatus} onChange={changePaymentStatus} options={STATUSES} />
            {paymentStatus === PaymentStatus.PARTIAL ? <Input label="Amount paid" value={amountPaid} onChangeText={setAmountPaid} keyboardType="decimal-pad" /> : null}
            {paymentStatus === PaymentStatus.PAID ? <Text variant="caption" muted>The full purchase amount is recorded as paid by the server.</Text> : null}
          </Card>
        )}
        <Card>
          <Text muted>Estimated total</Text>
          <Text variant="heading">{formatRs(estimate)}</Text>
          <Text variant="caption" muted>An estimate from the lines above. The server calculates the final subtotal, discount, tax and total.</Text>
        </Card>
        {formError ? <Text accessibilityRole="alert" style={styles.error}>{formError}</Text> : null}
        <Button label={isEdit ? 'Save changes' : 'Receive purchase'} loading={guard.busy} disabled={!branchId || lines.length === 0} onPress={submit} />
      </FormScreen>

      <FormModal visible={!!priceAsk} title="Purchase price decreased" onClose={() => decide('cancel')}>
        <View style={styles.modalBody}>
          <Text muted>These products are cheaper than the price saved for this vendor. Update the saved price?</Text>
          {(priceAsk ?? []).map((r) => (
            <Card key={r.productId}>
              <Text variant="label">{r.productName}</Text>
              <Text muted>{formatRs(r.oldPrice)} → {formatRs(r.newPrice)}</Text>
            </Card>
          ))}
          <Button label="Approve & save" onPress={() => decide('approve')} />
          <Button label="Save without updating prices" variant="secondary" onPress={() => decide('skip')} />
          <Button label="Cancel" variant="secondary" onPress={() => decide('cancel')} />
        </View>
      </FormModal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  modalBody: { padding: spacing.lg, gap: spacing.md },
  error: { color: '#B3261E' },
});
