import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ui/action-sheet';
import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { Text } from '@/components/ui/text';
import { useProductBatches } from '@/features/inventory/use-inventory';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { parseNumber } from '@/lib/numbers';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';
import type { Product } from '@/types/medicore';

import {
  allocateAcrossBatches,
  autoQuantityForProduct,
  belowCostFloor,
  eligibleBatches,
  estimateLineTotal,
  newLineKey,
  restoreStock,
  usedByBatch,
  withRemainingStock,
  type SaleLine,
} from './sale-lines';
import type { LastPrice } from './use-sales';

interface EntryInput {
  products: Product[];
  branchId: string | null;
  lines: SaleLine[];
  /** The committed line being edited (it is not counted against stock while its entry is open). */
  editing: SaleLine | null;
  /** An edited sale's original allocations count as available stock again. */
  restoreByBatch?: Map<string, number>;
  lastPrices: Map<string, LastPrice>;
}

type EntryErrors = Partial<Record<'product' | 'quantity' | 'price' | 'discount' | 'tax', string>>;

const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v));

/**
 * The line rules of the web's sale entry row: the nearest-expiry sellable batch is pre-selected (changeable), the
 * quantity is limited to the stock left after the other lines, the price is the customer's last price or TP until
 * typed, and the price after discount may not go below CP. Messages match the web.
 */
export function useSaleLineEntry({ products, branchId, lines, editing, restoreByBatch, lastPrices }: EntryInput) {
  const [productId, setProductId] = useState(editing?.productId ?? '');
  const [batchId, setBatchId] = useState(editing?.allocations?.[0]?.batchId ?? '');
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : '');
  const [price, setPrice] = useState(editing ? String(editing.unitPrice) : '');
  const [priceTouched, setPriceTouched] = useState(!!editing?.priceExplicit);
  const [discount, setDiscount] = useState(editing?.discountPercent !== undefined ? String(editing.discountPercent) : '');
  const [tax, setTax] = useState(editing?.taxPercent !== undefined ? String(editing.taxPercent) : '');

  const product = products.find((p) => p.id === productId);
  const { batches, isLoading: batchesLoading } = useProductBatches(productId || null, branchId);
  const available = withRemainingStock(eligibleBatches(restoreStock(batches, restoreByBatch)), usedByBatch(lines, editing?.key));
  const batchTotal = available.reduce((s, b) => s + b.quantity, 0);
  // Automatic (no batch) lines of an edited sale still count against the product.
  const totalAvailable = Math.max(batchTotal - autoQuantityForProduct(lines, productId, editing?.key), 0);
  // Like the web: the nearest-expiry sellable batch (FEFO) until the user picks another one (or it runs out).
  const effectiveBatchId = available.some((b) => b.id === batchId) ? batchId : (available[0]?.id ?? '');
  const chosenBatch = available.find((b) => b.id === effectiveBatchId);

  const last = lastPrices.get(productId);
  const listPrice = last?.price ?? product?.tp ?? 0;
  const shownPrice = priceTouched || !productId ? price : String(listPrice);
  const unitPrice = parseNumber(shownPrice);
  const discountN = parseNumber(discount) ?? 0;
  const taxN = parseNumber(tax);
  const qty = parseNumber(quantity);
  const netPrice = (unitPrice ?? 0) * (1 - discountN / 100);
  const belowFloor = !!product && unitPrice !== null && belowCostFloor(unitPrice, discountN, product.cp);

  const errors: EntryErrors = {};
  if (!productId) errors.product = 'Select a product';
  if (qty === null || !(qty > 0)) errors.quantity = 'Qty must be greater than 0';
  else if (productId && !batchesLoading) {
    if (available.length === 0) errors.quantity = 'No stock available';
    else if (qty > totalAvailable) errors.quantity = `Only ${totalAvailable} in stock`;
  }
  if (unitPrice === null || unitPrice < 0) errors.price = 'Price must be 0 or more';
  else if (belowFloor && product) errors.price = `Price after discount (${netPrice.toFixed(2)}) is below the cost price ${product.cp.toFixed(2)}`;
  if (discount.trim() !== '' && !(discountN >= 0 && discountN <= 100)) errors.discount = 'Disc % must be 0-100';
  if (tax.trim() !== '' && !(taxN !== null && taxN >= 0 && taxN <= 100)) errors.tax = 'Tax % must be 0-100';

  /** Errors shown while typing: a field's message appears once it has a value (a missing product just disables Add). */
  const visible: EntryErrors = {
    quantity: quantity.trim() !== '' || (productId && !batchesLoading && available.length === 0) ? errors.quantity : undefined,
    price: productId ? errors.price : undefined,
    discount: errors.discount,
    tax: errors.tax,
  };
  const valid = Object.keys(errors).length === 0 && !batchesLoading;

  /** The committed line, or null when a rule fails. */
  const build = (): SaleLine | null => {
    if (!valid || !product || qty === null || unitPrice === null || !chosenBatch) return null;
    const { allocations, unmet } = allocateAcrossBatches(available, chosenBatch.id, qty);
    if (unmet > 0 || allocations.length === 0) return null;
    return {
      key: editing?.key ?? newLineKey(),
      productId,
      productName: product.name,
      quantity: qty,
      unitPrice,
      // A price the user typed or took from the customer's last invoice is sent; the plain list price is left to the backend.
      priceExplicit: priceTouched || last?.price != null,
      discountPercent: numOrUndef(discount),
      taxPercent: numOrUndef(tax),
      allocations: allocations.map((a) => ({ batchId: a.batch.id, batchNumber: a.batch.batchNumber, quantity: a.quantity, expiryDate: a.batch.expiryDate })),
    };
  };

  return {
    product,
    productId,
    pickProduct: (id: string) => {
      setProductId(id);
      setBatchId('');
      setPrice('');
      setPriceTouched(false);
    },
    available,
    batchesLoading,
    totalAvailable,
    chosenBatch,
    pickBatch: setBatchId,
    quantity,
    setQuantity,
    shownPrice,
    setPrice: (v: string) => {
      setPrice(v);
      setPriceTouched(true);
    },
    discount,
    setDiscount,
    tax,
    setTax,
    lastPrice: last,
    lineTotal: estimateLineTotal({ quantity: qty ?? 0, unitPrice: unitPrice ?? 0, discountPercent: discountN, taxPercent: taxN ?? 0 }),
    errors: visible,
    valid,
    build,
  };
}

interface SheetProps extends EntryInput {
  visible: boolean;
  branchName: string;
  canDiscount: boolean;
  onProductChange: (productId: string) => void;
  onCommit: (line: SaleLine) => void;
  onClose: () => void;
}

/** Screen 2 of New Sale: "Add item" / "Edit item" as a full-screen sheet with live checks and the line total. */
export function AddItemSheet({ visible, branchName, canDiscount, onProductChange, onCommit, onClose, ...input }: SheetProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible ? <AddItemContent branchName={branchName} canDiscount={canDiscount} onProductChange={onProductChange} onCommit={onCommit} onClose={onClose} {...input} /> : null}
    </Modal>
  );
}

function AddItemContent({ branchName, canDiscount, onProductChange, onCommit, onClose, ...input }: Omit<SheetProps, 'visible'>) {
  const theme = useTheme();
  const entry = useSaleLineEntry(input);
  const [batchSheet, setBatchSheet] = useState(false);
  const nearest = entry.chosenBatch && entry.chosenBatch.id === entry.available[0]?.id;

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text variant="heading">{input.editing ? 'Edit item' : 'Add item'}</Text>
          {branchName ? <Text variant="caption" muted>Selling from {branchName}</Text> : null}
        </View>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <PickerField
            label="Product"
            required
            value={entry.productId}
            onChange={(id) => {
              entry.pickProduct(id);
              onProductChange(id);
            }}
            placeholder="Search product"
            options={input.products.filter((p) => p.status === 'ACTIVE' || p.id === entry.productId).map((p) => ({ value: p.id, label: p.name, hint: p.genericName }))}
          />

          <View style={styles.gapXs}>
            <Text variant="label" muted>Batch</Text>
            <Pressable
              accessibilityRole="combobox"
              accessibilityLabel="Batch"
              accessibilityState={{ disabled: entry.available.length === 0 }}
              disabled={entry.available.length === 0}
              onPress={() => setBatchSheet(true)}
              style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border, opacity: entry.available.length === 0 ? 0.6 : 1 }]}
            >
              <View style={styles.flex}>
                {entry.chosenBatch ? (
                  <>
                    <Text>{entry.chosenBatch.batchNumber} · exp {formatDate(entry.chosenBatch.expiryDate)}</Text>
                    <Text variant="caption" muted>
                      In stock: {entry.totalAvailable} · {nearest ? 'nearest expiry' : `this batch: ${entry.chosenBatch.quantity}`}
                    </Text>
                  </>
                ) : (
                  <Text muted>{!entry.productId ? 'Select a product first' : entry.batchesLoading ? 'Loading batches…' : 'No sellable stock'}</Text>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-down" size={22} color={theme.textMuted} />
            </Pressable>
          </View>

          <QuantityStepper label="Quantity" value={entry.quantity} onChange={entry.setQuantity} error={!!entry.errors.quantity} />
          <FieldError message={entry.errors.quantity} />

          <Input label="Unit price" value={entry.shownPrice} onChangeText={entry.setPrice} keyboardType="decimal-pad" invalid={!!entry.errors.price} />
          <FieldError message={entry.errors.price} />
          {entry.lastPrice?.price != null ? (
            <Text variant="caption" muted>Last sold to this customer: {formatRs(entry.lastPrice.price)}{entry.lastPrice.date ? ` (${formatDate(entry.lastPrice.date)})` : ''}</Text>
          ) : null}

          <View style={styles.row}>
            <View style={styles.flex}>
              <Input label="Discount %" value={entry.discount} onChangeText={entry.setDiscount} keyboardType="decimal-pad" editable={canDiscount} placeholder={canDiscount ? '0' : 'Not allowed'} invalid={!!entry.errors.discount} />
            </View>
            <View style={styles.flex}>
              <Input label="Tax %" value={entry.tax} onChangeText={entry.setTax} keyboardType="decimal-pad" placeholder="0" invalid={!!entry.errors.tax} />
            </View>
          </View>
          <FieldError message={entry.errors.discount} />
          <FieldError message={entry.errors.tax} />
        </ScrollView>
      </KeyboardAvoidingView>
      <BottomBar caption="Line total" amount={entry.lineTotal.toFixed(2)}>
        <Button
          label={input.editing ? 'Update item' : 'Add to sale'}
          disabled={!entry.valid}
          onPress={() => {
            const line = entry.build();
            if (line) onCommit(line);
          }}
        />
      </BottomBar>
      <ActionSheet
        title="Batch"
        subtitle="Nearest expiry first. A larger quantity continues into the next batches."
        onClose={() => setBatchSheet(false)}
        actions={
          batchSheet
            ? entry.available.map((b) => ({
                label: `${b.batchNumber} · exp ${formatDate(b.expiryDate)} · ${b.quantity}`,
                checked: b.id === entry.chosenBatch?.id,
                onPress: () => entry.pickBatch(b.id),
              }))
            : null
        }
      />
    </SafeAreaView>
  );
}

/** Red message box under a field (the web shows these under the input). */
function FieldError({ message }: { message?: string }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={[styles.error, { backgroundColor: theme.dangerSurface }]}>
      <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.danger} />
      <Text variant="caption" color={theme.danger} style={styles.flex}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapXs: { gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.md },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, minHeight: TOUCH_TARGET + 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm, marginTop: -spacing.xs },
});
