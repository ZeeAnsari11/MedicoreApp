import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormScreen } from '@/components/ui/form-screen';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { Text } from '@/components/ui/text';
import { BranchField } from '@/features/branches/branch-field';
import { useBranchField } from '@/features/branches/use-branch-field';
import { useInventoryRollup, useProductBatches } from '@/features/inventory/use-inventory';
import { formatDate } from '@/lib/dates';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing, useTheme } from '@/theme';

import { NOTE_MAX, validateLineQuantity, validateTransfer, type TransferHeader, type TransferLineDraft } from './schema';

interface Props {
  onSubmit: (header: TransferHeader, lines: TransferLineDraft[], names: { from: string; to: string }) => Promise<void>;
}

export function TransferForm({ onSubmit }: Props) {
  const theme = useTheme();
  const branchField = useBranchField();
  const [fromBranchId, setFromBranchId] = useState(branchField.defaultBranchId);
  const [toBranchId, setToBranchId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<TransferLineDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const guard = useSubmitGuard();

  // line picker
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lineError, setLineError] = useState<string | null>(null);

  const { rollup } = useInventoryRollup(fromBranchId || null);
  const stocked = fromBranchId ? rollup.filter((r) => r.totalQuantity > 0) : [];
  const { batches } = useProductBatches(productId || null, fromBranchId || null, !!fromBranchId);
  const available = batches.filter((b) => b.quantity > 0);
  const batch = available.find((b) => b.id === batchId);
  const product = stocked.find((r) => r.productId === productId);

  const branchName = (id: string) => branchField.branches.find((b) => b.id === id)?.name ?? (id === branchField.defaultBranchId ? branchField.lockedBranchName : '');
  const destinations = branchField.branches.filter((b) => b.isActive !== false && b.id !== fromBranchId);

  const changeFrom = (id: string) => {
    setFromBranchId(id);
    // lines belong to the source branch's batches
    setLines([]);
    setProductId('');
    setBatchId('');
    if (id === toBranchId) setToBranchId('');
  };

  const addLine = () => {
    if (!batch || !product) {
      setLineError('Select a product and a batch');
      return;
    }
    if (lines.some((l) => l.batchId === batch.id)) {
      setLineError('This batch is already in the transfer');
      return;
    }
    const problem = validateLineQuantity(quantity, batch.quantity);
    if (problem) {
      setLineError(problem);
      return;
    }
    setLines((prev) => [...prev, { batchId: batch.id, productId: batch.productId, productName: product.productName, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, available: batch.quantity, quantity }]);
    setBatchId('');
    setQuantity('');
    setLineError(null);
  };

  const submit = () =>
    guard.run(async () => {
      const header = { fromBranchId, toBranchId, note };
      const problem = validateTransfer(header, lines);
      setFormError(problem);
      if (problem) return;
      await onSubmit(header, lines, { from: branchName(fromBranchId), to: branchName(toBranchId) });
    });

  return (
    <FormScreen>
      <BranchField field={branchField} value={fromBranchId} onChange={changeFrom} />
      <Text variant="caption" muted style={styles.hint}>Source branch</Text>
      <PickerField
        label="Destination branch"
        required
        value={toBranchId}
        onChange={setToBranchId}
        placeholder="Select destination"
        options={destinations.map((b) => ({ value: b.id, label: b.name }))}
      />

      <Text variant="heading">Batches to transfer</Text>
      {lines.map((l) => (
        <Card key={l.batchId}>
          <View style={styles.between}>
            <Text variant="label" style={styles.flex}>{l.productName}</Text>
            <Text variant="heading">{l.quantity}</Text>
          </View>
          <Text muted>Batch {l.batchNumber} · expires {formatDate(l.expiryDate)} · {l.available} available</Text>
          <Button label="Remove" variant="secondary" onPress={() => setLines((prev) => prev.filter((x) => x.batchId !== l.batchId))} />
        </Card>
      ))}

      <Card>
        <PickerField
          label="Product"
          value={productId}
          onChange={(v) => { setProductId(v); setBatchId(''); }}
          disabled={!fromBranchId}
          placeholder={fromBranchId ? 'Select product with stock' : 'Select the source branch first'}
          options={stocked.map((r) => ({ value: r.productId, label: r.productName, hint: `${r.totalQuantity} on hand` }))}
        />
        <PickerField
          label="Batch"
          value={batchId}
          onChange={setBatchId}
          disabled={!productId}
          placeholder="Select batch"
          options={available.map((b) => ({ value: b.id, label: `${b.batchNumber} · exp ${formatDate(b.expiryDate)}`, hint: `${b.quantity} available` }))}
        />
        <Input label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder={batch ? `Up to ${batch.quantity}` : undefined} error={lineError ?? undefined} />
        <Button label="Add to transfer" variant="secondary" onPress={addLine} />
      </Card>

      <Input label={`Note (optional, max ${NOTE_MAX})`} value={note} onChangeText={setNote} maxLength={NOTE_MAX} />
      {formError ? <Text color={theme.danger}>{formError}</Text> : null}
      <Button label="Create transfer" loading={guard.busy} onPress={submit} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hint: { marginTop: -spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
