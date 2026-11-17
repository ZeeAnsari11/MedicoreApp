import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { Text } from '@/components/ui/text';
import { useProductBatches } from '@/features/inventory/use-inventory';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { parseNumber } from '@/lib/numbers';
import { spacing, useTheme } from '@/theme';
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

interface Props {
  products: Product[];
  branchId: string | null;
  lines: SaleLine[];
  /** The committed line being edited (it is not counted against stock while its entry is open). */
  editing: SaleLine | null;
  /** An edited sale's original allocations count as available stock again. */
  restoreByBatch?: Map<string, number>;
  lastPrices: Map<string, LastPrice>;
  canDiscount: boolean;
  onProductChange: (productId: string) => void;
  onCommit: (line: SaleLine) => void;
  onCancelEdit: () => void;
}

const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** The line entry card of the New Sale form: product, optional batch, quantity, price, discount and tax. */
export function LineEntry({ products, branchId, lines, editing, restoreByBatch, lastPrices, canDiscount, onProductChange, onCommit, onCancelEdit }: Props) {
  const theme = useTheme();
  const [productId, setProductId] = useState(editing?.productId ?? '');
  const [batchId, setBatchId] = useState(editing?.allocations?.[0]?.batchId ?? '');
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : '');
  const [price, setPrice] = useState(editing ? String(editing.unitPrice) : '');
  const [priceTouched, setPriceTouched] = useState(!!editing?.priceExplicit);
  const [discount, setDiscount] = useState(editing?.discountPercent !== undefined ? String(editing.discountPercent) : '');
  const [tax, setTax] = useState(editing?.taxPercent !== undefined ? String(editing.taxPercent) : '');
  const [attempted, setAttempted] = useState(false);

  const product = products.find((p) => p.id === productId);
  const { batches, isLoading: batchesLoading } = useProductBatches(productId || null, branchId);
  const manualUsed = usedByBatch(lines, editing?.key);
  const available = withRemainingStock(eligibleBatches(restoreStock(batches, restoreByBatch)), manualUsed);
  const batchTotal = available.reduce((s, b) => s + b.quantity, 0);
  const totalAvailable = Math.max(batchTotal - autoQuantityForProduct(lines, productId, editing?.key), 0);
  const chosenBatch = available.find((b) => b.id === batchId);

  const last = lastPrices.get(productId);
  const listPrice = last?.price ?? product?.tp ?? 0;
  const shownPrice = priceTouched || !productId ? price : String(listPrice);
  const unitPrice = parseNumber(shownPrice);
  const discountN = parseNumber(discount) ?? 0;
  const belowFloor = !!product && unitPrice !== null && belowCostFloor(unitPrice, discountN, product.cp);

  const errors: Partial<Record<'product' | 'quantity' | 'price' | 'discount' | 'tax', string>> = {};
  const qty = parseNumber(quantity);
  if (!productId) errors.product = 'Select a product';
  if (qty === null || !(qty > 0)) errors.quantity = 'Quantity must be greater than 0';
  else if (productId && !batchesLoading) {
    const limit = chosenBatch ? batchTotal : totalAvailable;
    if (available.length === 0) errors.quantity = 'No stock available';
    else if (qty > limit) errors.quantity = `Only ${limit} in stock`;
  }
  if (unitPrice === null || unitPrice < 0) errors.price = 'Price must be 0 or more';
  else if (belowFloor && product) errors.price = `Price after discount is below the cost price ${formatRs(product.cp)}`;
  if (discount.trim() !== '' && !(discountN >= 0 && discountN <= 100)) errors.discount = 'Discount must be 0-100';
  const taxN = parseNumber(tax);
  if (tax.trim() !== '' && !(taxN !== null && taxN >= 0 && taxN <= 100)) errors.tax = 'Tax must be 0-100';

  const shown = (k: keyof typeof errors) => (attempted ? errors[k] : undefined);

  const commit = () => {
    setAttempted(true);
    if (Object.keys(errors).length > 0 || !product || qty === null || unitPrice === null) return;
    let allocations: SaleLine['allocations'];
    if (chosenBatch) {
      const { allocations: split, unmet } = allocateAcrossBatches(available, chosenBatch.id, qty);
      if (unmet > 0) return;
      allocations = split.map((a) => ({ batchId: a.batch.id, batchNumber: a.batch.batchNumber, quantity: a.quantity }));
    }
    onCommit({
      key: editing?.key ?? newLineKey(),
      productId,
      productName: product.name,
      quantity: qty,
      unitPrice,
      // A price the user typed or took from the customer's last invoice is sent; the plain list price is left to the backend.
      priceExplicit: priceTouched || last?.price != null,
      discountPercent: numOrUndef(discount),
      taxPercent: numOrUndef(tax),
      allocations,
    });
    setProductId('');
    setBatchId('');
    setQuantity('');
    setPrice('');
    setPriceTouched(false);
    setDiscount('');
    setTax('');
    setAttempted(false);
    onProductChange('');
  };

  const preview = estimateLineTotal({ quantity: qty ?? 0, unitPrice: unitPrice ?? 0, discountPercent: discountN, taxPercent: taxN ?? 0 });

  return (
    <Card>
      <Text variant="label">{editing ? 'Edit line' : 'Add a line'}</Text>
      <PickerField
        label="Product"
        required
        value={productId}
        onChange={(id) => {
          setProductId(id);
          setBatchId('');
          setPrice('');
          setPriceTouched(false);
          onProductChange(id);
        }}
        error={shown('product')}
        placeholder="Search product"
        options={products.filter((p) => p.status === 'ACTIVE' || p.id === productId).map((p) => ({ value: p.id, label: p.name, hint: p.genericName }))}
      />
      <PickerField
        label="Batch"
        value={batchId}
        onChange={setBatchId}
        clearable
        disabled={available.length === 0}
        placeholder="Auto (nearest expiry first)"
        options={available.map((b) => ({ value: b.id, label: `${b.batchNumber} · exp ${formatDate(b.expiryDate)}`, hint: `${b.quantity} available` }))}
      />
      {productId && !batchesLoading ? (
        <Text variant="caption" muted>
          In stock (sellable): {totalAvailable}
          {chosenBatch ? ` · batch ${chosenBatch.batchNumber}: ${chosenBatch.quantity}` : ''}
        </Text>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}><Input label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" error={shown('quantity')} /></View>
        <View style={styles.flex}>
          <Input label="Unit price" value={shownPrice} onChangeText={(v) => { setPrice(v); setPriceTouched(true); }} keyboardType="decimal-pad" error={shown('price')} />
        </View>
      </View>
      {last?.price != null ? <Text variant="caption" muted>Last sold to this customer: {formatRs(last.price)}{last.date ? ` (${formatDate(last.date)})` : ''}</Text> : null}
      <View style={styles.row}>
        <View style={styles.flex}><Input label="Discount %" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" editable={canDiscount} placeholder={canDiscount ? undefined : 'Not allowed'} error={shown('discount')} /></View>
        <View style={styles.flex}><Input label="Tax %" value={tax} onChangeText={setTax} keyboardType="decimal-pad" error={shown('tax')} /></View>
      </View>
      <Text variant="caption" style={{ color: theme.textMuted }}>Line estimate: {formatRs(preview)} (the server calculates the final amount)</Text>
      <Button label={editing ? 'Update line' : 'Add line'} variant="secondary" onPress={commit} />
      {editing ? <Button label="Cancel edit" variant="secondary" onPress={onCancelEdit} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
