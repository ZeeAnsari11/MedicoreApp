import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useDocumentFile } from '@/features/documents/use-document-file';
import { confirmAction } from '@/lib/confirm';
import { formatDate } from '@/lib/dates';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';
import { toast } from '@/store/toast';

import {
  accountBalance,
  applyRowErrors,
  buildRow,
  buildSaveRequest,
  draftKey,
  money,
  newBatchId,
  parseDraft,
  rowErrorsOf,
  runningBalances,
  serializeDraft,
  sheetTotal,
  validateRows,
  type LookupInvoice,
  type SheetRow,
} from './sheet';
import { cashReceiptPdfPath, useInvoiceLookup, useSaveCashReceipt, type CashReceiptResult } from './use-cash-receipts';

/** Port of the web Cash Receipt page: an entry sheet of voucher (invoice) numbers and amounts, saved as one batch. */
export function CashReceiptScreen() {
  return (
    <RequirePermission permission="cash_receipt:read" what="enter cash receipts">
      <CashReceiptSheet />
    </RequirePermission>
  );
}

function CashReceiptSheet() {
  const theme = useTheme();
  const { user, has } = useAuth();
  const { branchId, setBranchId, showDropdown, branches, lockedBranchName } = useBranchFilter();
  const doc = useDocumentFile();
  const guard = useSubmitGuard();
  const { save, isSaving } = useSaveCashReceipt();

  const [rows, setRows] = useState<SheetRow[]>([]);
  const [batchId, setBatchId] = useState(newBatchId);
  const [restored, setRestored] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [selected, setSelected] = useState<LookupInvoice | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ result: CashReceiptResult; branchId: string | null } | null>(null);

  const storageKey = user ? draftKey(user.tenantId, user.userId) : null;

  // Restore the unsaved sheet (the web keeps it in sessionStorage); a stored branch the user cannot use is simply replaced.
  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    (async () => {
      try {
        const draft = parseDraft(await AsyncStorage.getItem(storageKey));
        if (draft && !cancelled) {
          setRows(draft.rows);
          setBatchId(draft.batchId);
          if (draft.branchId && showDropdown) setBranchId(draft.branchId);
        }
      } catch {
        // Storage unavailable: start with an empty sheet.
      }
      if (!cancelled) setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
    // Restore once per user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!restored || !storageKey) return;
    (async () => {
      try {
        if (rows.length === 0) await AsyncStorage.removeItem(storageKey);
        else await AsyncStorage.setItem(storageKey, serializeDraft({ rows, batchId, branchId }));
      } catch {
        // Not persisting the draft is not fatal.
      }
    })();
  }, [restored, rows, batchId, branchId, storageKey]);

  const query = useDebouncedValue(voucherInput.trim(), 300);
  // Typing again after picking an invoice means searching again.
  const searching = !selected || voucherInput.trim() !== selected.invoiceNumber;
  const lookup = useInvoiceLookup(searching ? query : '', branchId);
  const matches = searching ? lookup.invoices : [];

  const computed = useMemo(() => runningBalances(rows), [rows]);
  const total = sheetTotal(rows);
  const tileBalance = accountBalance(selected, rows);
  const branchLocked = rows.length > 0;

  const resetForm = () => {
    setSelected(null);
    setVoucherInput('');
    setAmountInput('');
    setFormError(null);
  };

  const pick = (inv: LookupInvoice) => {
    if (rows.some((r) => r.invoiceId === inv.id)) {
      setFormError('Already in sheet');
      return;
    }
    setSelected(inv);
    setVoucherInput(inv.invoiceNumber);
    setFormError(null);
  };

  const addRow = () => {
    const result = buildRow(selected, amountInput, rows);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setRows((prev) => [...prev, result.row]);
    resetForm();
  };

  // Enter in the voucher box: an exact invoice-number match wins, otherwise the first suggestion.
  const submitVoucher = () => {
    const inv = matches.find((m) => m.invoiceNumber === voucherInput.trim()) ?? matches[0];
    if (inv) pick(inv);
  };

  const updateRow = (key: string, amount: string) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, amount, error: undefined } : r)));
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const submit = () =>
    guard.run(async () => {
      if (rows.length === 0) return;
      const checked = validateRows(rows);
      if (checked.hasErrors) {
        setRows(checked.rows);
        toast.error('Fix the highlighted rows before saving');
        return;
      }
      if (!branchId) {
        toast.error('Select a branch first');
        return;
      }
      const ok = await confirmAction({
        title: 'Save cash receipt?',
        message: `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}, total Rs. ${money(total)}. Payments are posted to the customers' accounts by the server.`,
        confirmLabel: 'Save',
      });
      if (!ok) return;
      try {
        const result = await save(buildSaveRequest(rows, batchId));
        setSaved({ result, branchId });
        setRows([]);
        setBatchId(newBatchId());
        resetForm();
      } catch (error) {
        const errs = rowErrorsOf(error instanceof ApiError ? error.body : undefined);
        if (errs.length) {
          setRows((prev) => applyRowErrors(prev, errs));
          toast.error('Nothing was saved. Some rows failed validation.');
        }
      }
    });

  const canSave = has('cash_receipt:create') && rows.length > 0;
  const payable = !!selected?.payable;
  const needsBranch = !branchId;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {showDropdown ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {branches.map((b) => {
            const active = b.id === branchId;
            return (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                accessibilityLabel={`Branch: ${b.name}`}
                accessibilityState={{ selected: active, disabled: branchLocked }}
                disabled={branchLocked}
                onPress={() => setBranchId(b.id)}
                style={[styles.chip, { backgroundColor: active ? theme.primary : theme.surface, borderColor: active ? theme.primary : theme.border, opacity: branchLocked && !active ? 0.5 : 1 }]}
              >
                <Text variant="label" color={active ? theme.onPrimary : theme.text}>{b.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : lockedBranchName ? (
        <Text variant="caption" muted>Branch: {lockedBranchName}</Text>
      ) : null}
      {showDropdown && branchLocked ? <Text variant="caption" muted>The branch is locked while the sheet has entries.</Text> : null}

      {needsBranch ? <Card><Text>Select a branch to enter receipts.</Text></Card> : null}

      {saved ? (
        <Card>
          <Text variant="label">
            {saved.result.count} {saved.result.count === 1 ? 'receipt' : 'receipts'} saved, total Rs. {money(saved.result.total)} ({saved.result.voucherNumber})
          </Text>
          <Button label="Share voucher" loading={doc.isBusy} onPress={() => void doc.share({ path: cashReceiptPdfPath(saved.result.id, saved.branchId), fileName: `${saved.result.voucherNumber}.pdf` })} />
          <Button label="Print voucher" variant="secondary" disabled={doc.isBusy} onPress={() => void doc.print({ path: cashReceiptPdfPath(saved.result.id, saved.branchId), fileName: `${saved.result.voucherNumber}.pdf` })} />
          {saved.result.rows.map((r) => (
            <Button
              key={r.invoiceId}
              label={`Share ${r.invoiceNumber}`}
              variant="secondary"
              disabled={doc.isBusy}
              onPress={() => void doc.share({ path: cashReceiptPdfPath(saved.result.id, saved.branchId, r.invoiceId), fileName: `${saved.result.voucherNumber}-${r.invoiceNumber}.pdf` })}
            />
          ))}
          <Button label="Dismiss" variant="secondary" onPress={() => setSaved(null)} />
        </Card>
      ) : null}

      <Card>
        <Input
          label="Voucher #"
          value={voucherInput}
          onChangeText={(v) => {
            setVoucherInput(v);
            setSelected(null);
            setFormError(null);
          }}
          onSubmitEditing={submitVoucher}
          placeholder="Search invoice number"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!needsBranch}
        />
        {searching && voucherInput.trim() ? (
          lookup.isFetching && matches.length === 0 ? (
            <Text muted>Searching...</Text>
          ) : matches.length === 0 && query === voucherInput.trim() ? (
            <Text muted>No outstanding invoices found</Text>
          ) : (
            matches.map((m) => (
              <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Invoice ${m.invoiceNumber}`} onPress={() => pick(m)} style={[styles.suggestion, { borderColor: theme.border, opacity: m.payable ? 1 : 0.6 }]}>
                <View style={styles.between}>
                  <Text variant="label">{m.invoiceNumber}</Text>
                  {!m.payable ? <Badge label="Paid" tone="success" /> : <Text variant="label">{money(m.balance)}</Text>}
                </View>
                <Text variant="caption" muted>{m.customerName} · {formatDate(m.saleDate)}</Text>
              </Pressable>
            ))
          )
        ) : null}

        <Input label="Date" value={selected ? formatDate(selected.saleDate) : ''} editable={false} />
        <Input
          label="Amount"
          value={amountInput}
          onChangeText={(v) => {
            setAmountInput(v);
            setFormError(null);
          }}
          keyboardType="decimal-pad"
          editable={payable}
          placeholder={selected && !selected.payable ? 'Already paid' : undefined}
          onSubmitEditing={addRow}
        />
        <View style={styles.row}>
          <View style={styles.flex}><Button label="Full" variant="secondary" disabled={!payable} onPress={() => selected && setAmountInput(String(selected.balance))} /></View>
          <View style={styles.flex}><Button label="Add" disabled={needsBranch} onPress={addRow} /></View>
        </View>
        {formError ? <Text variant="caption" color={theme.danger}>{formError}</Text> : null}

        <View style={styles.tiles}>
          {([
            ['Account Balance', tileBalance],
            ['S-Invoice Amount', selected?.netTotal ?? null],
            ['S-I-Received Amount', selected?.received ?? null],
            ['Balance', selected?.balance ?? null],
          ] as const).map(([label, value]) => (
            <View key={label} style={styles.tile}>
              <Text variant="caption" muted>{label}</Text>
              <Text variant="label">{value === null ? '-' : money(value)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Text variant="heading">Entries</Text>
      {rows.length === 0 ? <Text muted>No entries yet. Type a voucher number above.</Text> : null}
      {rows.map((r, i) => (
        <Card key={r.key}>
          <View style={styles.between}>
            <Text variant="label">{i + 1}. {r.customerName}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Remove row" onPress={() => removeRow(r.key)} hitSlop={8}>
              <Text variant="label" color={theme.danger}>Remove</Text>
            </Pressable>
          </View>
          <Text variant="caption" muted>S-Invoice# {r.invoiceNumber} · Invoice {money(r.voucherAmount)} · Received {money(r.received)}</Text>
          <Text variant="caption" muted>Cust. Bal. {money(computed[i].custBal)} · Final Bal. {money(computed[i].finalBal)}</Text>
          <Input label={`Amount ${r.invoiceNumber}`} value={r.amount} onChangeText={(v) => updateRow(r.key, v)} keyboardType="decimal-pad" error={r.error} />
        </Card>
      ))}
      <View style={styles.between}>
        <Text variant="label">Entries: {rows.length}</Text>
        <Text variant="label">Total: Rs. {money(total)}</Text>
      </View>
      <Button label="Save cash receipt" loading={guard.busy || isSaving} disabled={!canSave} onPress={() => void submit()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  row: { flexDirection: 'row', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: { minHeight: TOUCH_TARGET - 8, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, justifyContent: 'center' },
  suggestion: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47%', gap: 2 },
});
