import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { spacing } from '@/theme';
import type { Product } from '@/types/medicore';

import { estimateLineTotal, lineError, newLineKey, type PurchaseLine } from './purchase-lines';
import type { LastPurchasePrice } from './use-purchases';

interface Props {
  /** Only the selected vendor's active, linked products (web rule). */
  products: Product[];
  vendorSelected: boolean;
  /** The committed line being edited, if any. */
  editing: PurchaseLine | null;
  lastPrices: Map<string, LastPurchasePrice>;
  onProductChange: (productId: string) => void;
  onCommit: (line: PurchaseLine) => void;
  onCancelEdit: () => void;
}

const fromLine = (l: PurchaseLine | null): PurchaseLine => l ?? { key: newLineKey(), productId: '', productName: '', batchNumber: '', expiryDate: '', quantity: '', purchasePrice: '', sellingPrice: '', discountPercent: '', taxPercent: '' };

/** The line entry card of the purchase form (web `purchase-entry-row`): product, batch, expiry, qty, prices, discount and tax. */
export function PurchaseLineEntry({ products, vendorSelected, editing, lastPrices, onProductChange, onCommit, onCancelEdit }: Props) {
  const [draft, setDraft] = useState<PurchaseLine>(() => fromLine(editing));
  const [attempted, setAttempted] = useState(false);
  const set = (patch: Partial<PurchaseLine>) => setDraft((d) => ({ ...d, ...patch }));

  const error = lineError(draft);
  const last = lastPrices.get(draft.productId);

  const pickProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    // Web: picking a product prefills the price from the product's cost price and the sale price from its trade price.
    set({ productId: id, productName: p?.name ?? '', purchasePrice: p ? String(p.cp) : '', sellingPrice: p ? String(p.tp) : '' });
    onProductChange(id);
  };

  const commit = () => {
    setAttempted(true);
    if (error) return;
    onCommit({ ...draft, key: editing?.key ?? newLineKey() });
    setDraft(fromLine(null));
    setAttempted(false);
    onProductChange('');
  };

  return (
    <Card>
      <Text variant="label">{editing ? 'Edit line' : 'Add a line'}</Text>
      {!vendorSelected ? <Text muted>Select a vendor first</Text> : null}
      <PickerField
        label="Product"
        required
        value={draft.productId}
        onChange={pickProduct}
        disabled={!vendorSelected}
        placeholder="Search product"
        options={products.map((p) => ({ value: p.id, label: p.name, hint: p.genericName }))}
      />
      {draft.productId ? (
        <Text variant="caption" muted>{last?.price != null ? `Last price: ${formatRs(last.price)}${last.date ? ` (${formatDate(last.date)})` : ''}` : 'First purchase'}</Text>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}><Input label="Batch #" value={draft.batchNumber} onChangeText={(v) => set({ batchNumber: v })} autoCapitalize="characters" editable={vendorSelected} /></View>
        <View style={styles.flex}><Input label="Expiry (YYYY-MM-DD)" value={draft.expiryDate} onChangeText={(v) => set({ expiryDate: v.trim() })} autoCapitalize="none" editable={vendorSelected} /></View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}><Input label="Qty" value={draft.quantity} onChangeText={(v) => set({ quantity: v })} keyboardType="decimal-pad" editable={vendorSelected} /></View>
        <View style={styles.flex}><Input label="Price" value={draft.purchasePrice} onChangeText={(v) => set({ purchasePrice: v })} keyboardType="decimal-pad" editable={vendorSelected} /></View>
        <View style={styles.flex}><Input label="Sale price" value={draft.sellingPrice} onChangeText={(v) => set({ sellingPrice: v })} keyboardType="decimal-pad" editable={vendorSelected} /></View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}><Input label="Disc %" value={draft.discountPercent} onChangeText={(v) => set({ discountPercent: v })} keyboardType="decimal-pad" editable={vendorSelected} /></View>
        <View style={styles.flex}><Input label="Tax %" value={draft.taxPercent} onChangeText={(v) => set({ taxPercent: v })} keyboardType="decimal-pad" editable={vendorSelected} /></View>
      </View>
      <Text variant="caption" muted>Line estimate: {formatRs(estimateLineTotal(draft))} (the server calculates the final amount)</Text>
      {attempted && error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button label={editing ? 'Update line' : 'Add line'} variant="secondary" disabled={!vendorSelected} onPress={commit} />
      {editing ? <Button label="Cancel edit" variant="secondary" onPress={onCancelEdit} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  error: { color: '#B3261E' },
});
