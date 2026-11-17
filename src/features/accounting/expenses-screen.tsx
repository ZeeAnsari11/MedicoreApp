import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { ChipRow } from '@/components/chip-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { SearchBar } from '@/components/ui/search-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { BranchField } from '@/features/branches/branch-field';
import { useBranchField } from '@/features/branches/use-branch-field';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { todayLocal } from '@/features/cash-receipt/sheet';
import { useVendors } from '@/features/vendors/use-vendors';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { compareText, filterAndSort } from '@/lib/use-client-list';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';
import { PaymentMethod } from '@/types/medicore';

import { expenseCategoryAccounts, payFromAccounts, useAccounts } from './use-accounts';
import { canSubmitExpense, useExpenses } from './use-expenses';

const METHODS = [
  { value: PaymentMethod.CASH, label: 'Cash' },
  { value: PaymentMethod.CARD, label: 'Card' },
  { value: PaymentMethod.BANK_TRANSFER, label: 'Bank transfer' },
];
const methodLabel = (m: string) => METHODS.find((x) => x.value === m)?.label ?? m;

/** Port of the web Expenses page: list and record an expense (no edit or void exists on the web or the backend). */
export function ExpensesScreen() {
  return (
    <RequirePermission permission="acc_expenses:read" what="view expenses">
      <Expenses />
    </RequirePermission>
  );
}

function Expenses() {
  const { has } = useAuth();
  const { branchId } = useBranchFilter();
  const api = useExpenses(branchId);
  const accounts = useAccounts();
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState(false);

  const category = (id: string, name?: string) => name ?? accounts.accounts.find((a) => a.id === id)?.name ?? '';
  const visible = useMemo(
    () =>
      filterAndSort(api.expenses, query, {
        searchText: (e) => `${category(e.expenseAccountId, e.expenseAccountName)} ${e.description} ${e.vendorName ?? ''} ${e.reference ?? ''} ${e.paymentMethod} ${e.amount}`,
        sorters: { date: (a, b) => compareText(b.expenseDate, a.expenseDate) },
      }, 'date', 'asc'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api.expenses, query, accounts.accounts],
  );

  if (api.isLoading) return <LoadingState />;
  if (api.error && api.expenses.length === 0) return <ErrorState error={api.error} onRetry={() => void api.refetch()} />;

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        <BranchFilter />
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search expenses..." />
        <Button label="Record Expense" disabled={!has('acc_expenses:create')} onPress={() => setRecording(true)} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={api.isFetching && !api.isLoading} onRefresh={() => void api.refetch()} />}
        ListEmptyComponent={<EmptyState title="No expenses found" />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.between}>
              <Text variant="label">{item.description}</Text>
              <Text variant="label">{formatRs(item.amount)}</Text>
            </View>
            <View style={styles.badges}><Badge label={category(item.expenseAccountId, item.expenseAccountName) || 'Expense'} /></View>
            <Text variant="caption" muted>{formatDate(item.expenseDate)} · {methodLabel(item.paymentMethod)} · Paid from {item.paymentAccountName ?? accounts.accounts.find((a) => a.id === item.paymentAccountId)?.name ?? ''}</Text>
            {item.vendorName ? <Text variant="caption" muted>Vendor: {item.vendorName}</Text> : null}
            {item.reference ? <Text variant="caption" muted>Ref {item.reference}</Text> : null}
          </Card>
        )}
      />
      {recording ? <ExpenseDialog onClose={() => setRecording(false)} api={api} /> : null}
    </View>
  );
}

function ExpenseDialog({ onClose, api }: { onClose: () => void; api: ReturnType<typeof useExpenses> }) {
  const guard = useSubmitGuard();
  const field = useBranchField();
  const accounts = useAccounts();
  const [formBranch, setFormBranch] = useState('');
  const branchId = field.locked ? field.defaultBranchId : formBranch;
  const vendors = useVendors(branchId || undefined);
  const [expenseAccountId, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paymentAccountId, setPaidFrom] = useState('');
  const [expenseDate, setDate] = useState(todayLocal());
  const [vendorId, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [attempted, setAttempted] = useState(false);

  const ready = canSubmitExpense({ expenseAccountId, amount, paymentAccountId, description });
  const submit = () =>
    guard.run(async () => {
      setAttempted(true);
      if (!branchId || !ready) return;
      try {
        await api.create({ branchId, expenseAccountId, amount: Number(amount), expenseDate, paymentMethod, paymentAccountId, vendorId: vendorId || undefined, description: description.trim(), reference: reference.trim() || undefined });
        onClose();
      } catch {
        // The mutation already showed the server's message; keep the form.
      }
    });

  return (
    <FormModal visible title="Record an Expense" onClose={onClose}>
      <FlatList
        data={[]}
        renderItem={() => null}
        contentContainerStyle={styles.form}
        ListHeaderComponent={
          <View style={styles.form}>
            <BranchField field={field} value={branchId} onChange={(b) => { setFormBranch(b); setVendor(''); }} error={attempted && !branchId ? 'Branch is required' : undefined} />
            <PickerField label="Expense Category" required value={expenseAccountId} placeholder="Select category" onChange={setCategory} options={expenseCategoryAccounts(accounts.accounts).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
            <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <ChipRow label="Payment Method" value={paymentMethod} onChange={(v) => setMethod(v as PaymentMethod)} options={METHODS} />
            <PickerField label="Paid From" required value={paymentAccountId} placeholder="Select account" onChange={setPaidFrom} options={payFromAccounts(accounts.accounts).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
            <Input label="Date (YYYY-MM-DD)" value={expenseDate} onChangeText={(v) => setDate(v.trim())} autoCapitalize="none" />
            <PickerField label="Vendor (optional)" value={vendorId} placeholder="None" clearable onChange={setVendor} options={vendors.vendors.map((v) => ({ value: v.id, label: v.company }))} />
            <Input label="Description" value={description} onChangeText={setDescription} placeholder="What was this expense for?" />
            <Input label="Reference" value={reference} onChangeText={setReference} placeholder="Optional" />
            <Button label="Save expense" loading={guard.busy} disabled={!ready} onPress={() => void submit()} />
          </View>
        }
      />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { padding: spacing.lg, gap: spacing.md },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  form: { padding: spacing.lg, gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  badges: { flexDirection: 'row', gap: spacing.sm },
});
