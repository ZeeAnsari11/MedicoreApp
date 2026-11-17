import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { ChipRow } from '@/components/chip-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { SearchBar } from '@/components/ui/search-bar';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { todayLocal } from '@/features/cash-receipt/sheet';
import { usePurchasesPage } from '@/features/purchases/use-purchases';
import { useSalesPage } from '@/features/sales/use-sales';
import { formatDate, isValidIsoDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';

import { clampQty, hasAnyQty, purchaseReturnItems, qtyKey, saleReturnItems, type ReturnMode, type ReturnQuantities } from './returns-logic';
import { useReturnablePurchaseItems, useReturnableSaleItems, useReturnMutations, useReturnsHistory } from './use-returns';

/** Port of the web Accounting → Returns page: return sold or purchased stock with cumulative quantity tracking done by the backend. */
export function ReturnsScreen() {
  return (
    <RequirePermission permission="acc_returns:read" what="view returns">
      <Returns />
    </RequirePermission>
  );
}

function Returns() {
  const { has } = useAuth();
  const { branchId } = useBranchFilter();
  const guard = useSubmitGuard();
  const [mode, setMode] = useState<ReturnMode>('sale');
  const [docId, setDocId] = useState('');
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(todayLocal());
  const [quantities, setQuantities] = useState<ReturnQuantities>({});
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query.trim(), 300);
  const mutations = useReturnMutations();
  const history = useReturnsHistory(mode);

  const salesPage = useSalesPage({ branchId, search: search || undefined, page: 1, limit: 50 });
  const purchasesPage = usePurchasesPage({ branchId, search: search || undefined, page: 1, limit: 50 });
  const sale = useReturnableSaleItems(mode === 'sale' ? docId || null : null);
  const purchase = useReturnablePurchaseItems(mode === 'purchase' ? docId || null : null);

  const reset = () => { setDocId(''); setQuantities({}); };
  const options = mode === 'sale' ? salesPage.sales.map((s) => ({ value: s.id, label: s.invoiceNumber })) : purchasesPage.purchases.map((p) => ({ value: p.id, label: p.purchaseNumber }));
  const setQty = (key: string, text: string, max: number) => setQuantities((prev) => ({ ...prev, [key]: clampQty(Number(text), max) }));
  const dateOk = isValidIsoDate(returnDate);
  const canSubmit = hasAnyQty(quantities) && has('acc_returns:create') && dateOk;

  const submit = () =>
    guard.run(async () => {
      if (!canSubmit) return;
      try {
        if (mode === 'sale') {
          const items = saleReturnItems(sale.items, quantities);
          if (items.length === 0) return;
          await mutations.createSale({ saleId: docId, items, reason: reason.trim() || undefined, returnDate });
        } else {
          const items = purchaseReturnItems(purchase.items, quantities);
          if (items.length === 0) return;
          await mutations.createPurchase({ purchaseId: docId, items, reason: reason.trim() || undefined, returnDate });
        }
        reset();
        setReason('');
      } catch {
        // The mutation already showed the server's message; keep the quantities so the user can adjust.
      }
    });

  const qtyInput = (key: string, label: string, returnable: number) => (
    <Input label={label} keyboardType="number-pad" editable={returnable > 0} value={quantities[key] ? String(quantities[key]) : ''} onChangeText={(v) => setQty(key, v, returnable)} placeholder={`Max ${returnable}`} />
  );

  const loadingItems = mode === 'sale' ? sale.isLoading : purchase.isLoading;
  const itemsError = mode === 'sale' ? sale.error : purchase.error;

  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <ChipRow label="Return type" value={mode} onChange={(v) => { setMode(v as ReturnMode); reset(); }} options={[{ value: 'sale', label: 'Sale Return' }, { value: 'purchase', label: 'Purchase Return' }]} />
      <BranchFilter />
      <SearchBar value={query} onChangeText={setQuery} placeholder={mode === 'sale' ? 'Search invoices...' : 'Search purchases...'} />
      <PickerField label={mode === 'sale' ? 'Invoice' : 'Purchase'} value={docId} placeholder={mode === 'sale' ? 'Select an invoice' : 'Select a purchase'} onChange={(v) => { setDocId(v); setQuantities({}); }} options={options} />

      {!docId ? (
        <Text muted>Select {mode === 'sale' ? 'an invoice' : 'a purchase'} to view returnable items.</Text>
      ) : itemsError ? (
        <ErrorState error={itemsError} onRetry={() => void (mode === 'sale' ? sale.refetch() : purchase.refetch())} />
      ) : loadingItems ? (
        <LoadingState />
      ) : (
        <Card>
          {mode === 'sale' ? (
            sale.items.length === 0 ? <Text muted>Nothing returnable on this invoice.</Text> : sale.items.map((item) => (
              <View key={item.productId} style={styles.gap}>
                <Text variant="label">{item.productName}</Text>
                {item.batchAllocations.map((b) => (
                  <View key={b.batchId} style={styles.gap}>
                    <Text muted>Batch {b.batchNumber} · Sold {b.originalQuantity} · Returned {b.alreadyReturned} · Returnable {b.returnable}</Text>
                    {qtyInput(qtyKey(item.productId, b.batchId), `Return qty ${item.productName} ${b.batchNumber}`, b.returnable)}
                  </View>
                ))}
              </View>
            ))
          ) : purchase.items.length === 0 ? (
            <Text muted>Nothing returnable on this purchase.</Text>
          ) : (
            purchase.items.map((item) => (
              <View key={qtyKey(item.productId, item.batchId)} style={styles.gap}>
                <Text variant="label">{item.productName}</Text>
                <Text muted>Batch {item.batchNumber} · Received {item.originalQuantity} · Returned {item.alreadyReturned} · Returnable {item.returnable}</Text>
                {qtyInput(qtyKey(item.productId, item.batchId), `Return qty ${item.productName} ${item.batchNumber}`, item.returnable)}
              </View>
            ))
          )}
          <Input label="Return Date (YYYY-MM-DD)" value={returnDate} onChangeText={(v) => setReturnDate(v.trim())} autoCapitalize="none" error={returnDate && !dateOk ? 'Use YYYY-MM-DD' : undefined} />
          <Input label="Reason" value={reason} onChangeText={setReason} placeholder="Optional" />
          <Button label="Record Return" loading={guard.busy} disabled={!canSubmit} onPress={() => void submit()} />
        </Card>
      )}

      <Text variant="heading">Recorded {mode} returns</Text>
      {history.error && history.returns.length === 0 ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : history.isLoading ? (
        <LoadingState />
      ) : history.returns.length === 0 ? (
        <Text muted>No returns recorded yet</Text>
      ) : (
        history.returns.map((r) => (
          <Card key={r.id}>
            <View style={styles.between}>
              <Text variant="label">{r.returnNumber ?? '—'}</Text>
              <Text variant="label">{formatRs(r.total ?? 0)}</Text>
            </View>
            <Text variant="caption" muted>{formatDate(r.returnDate)} · {r.reason ?? '—'}</Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  gap: { gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
