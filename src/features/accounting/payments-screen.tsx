import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Switch, View } from 'react-native';

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
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { useCustomers } from '@/features/customers/use-customers';
import { useVendors } from '@/features/vendors/use-vendors';
import { confirmAction } from '@/lib/confirm';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { compareText, filterAndSort } from '@/lib/use-client-list';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing, useTheme } from '@/theme';
import { PartyType, PaymentMethod, type Payment } from '@/types/medicore';

import { todayLocal } from '@/features/cash-receipt/sheet';

import { buildPaymentRequest, canSubmitPayment, isAdvance, remainderOf, toggleAllocation, voidMessage, type PaymentDraft } from './payment-logic';
import { payFromAccounts, useAccounts } from './use-accounts';
import { useOpenInvoices, usePaymentMutations, usePayments } from './use-payments';

const METHODS = [
  { value: PaymentMethod.CASH, label: 'Cash' },
  { value: PaymentMethod.CARD, label: 'Card' },
  { value: PaymentMethod.BANK_TRANSFER, label: 'Bank transfer' },
];
const PARTY_FILTER = [{ value: '', label: 'All parties' }, { value: PartyType.CUSTOMER as string, label: 'Customers' }, { value: PartyType.VENDOR as string, label: 'Vendors' }];
const methodLabel = (m: string) => METHODS.find((x) => x.value === m)?.label ?? m;

/** Port of the web Payments page: every customer/vendor payment, record a payment (with optional allocation) and void one. */
export function PaymentsScreen() {
  return (
    <RequirePermission permission="acc_payments:read" what="view payments">
      <Payments />
    </RequirePermission>
  );
}

function Payments() {
  const { has } = useAuth();
  const { branchId } = useBranchFilter();
  const [partyType, setPartyType] = useState('');
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState(false);
  const api = usePayments({ branchId, partyType: partyType as PartyType | '' });
  const mutations = usePaymentMutations();
  const guard = useSubmitGuard();
  const customers = useCustomers();
  const vendors = useVendors();
  const accounts = useAccounts();

  const partyName = (p: Payment) =>
    p.partyName ?? (p.partyType === PartyType.CUSTOMER ? customers.customers.find((c) => c.id === p.partyId)?.name : vendors.vendors.find((v) => v.id === p.partyId)?.company);
  const accountName = (p: Payment) => p.accountName ?? accounts.accounts.find((a) => a.id === p.accountId)?.name ?? '';

  const visible = useMemo(
    () =>
      filterAndSort(api.payments, query, {
        searchText: (p) => `${partyName(p) ?? ''} ${p.reference ?? ''} ${p.method} ${accountName(p)} ${p.amount}`,
        sorters: { date: (a, b) => compareText(b.paymentDate, a.paymentDate) },
      }, 'date', 'asc'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api.payments, query, customers.customers, vendors.vendors, accounts.accounts],
  );

  const voidIt = (p: Payment) =>
    guard.run(async () => {
      const ok = await confirmAction({ title: 'Void this payment?', message: voidMessage(formatRs(p.amount), partyName(p)), confirmLabel: 'Void payment', destructive: true });
      if (!ok) return;
      try {
        await mutations.voidPayment(p.id, p.branchId ?? branchId);
      } catch {
        // The mutation already showed the server's message (e.g. the advance was already applied elsewhere).
      }
    });

  if (api.isLoading) return <LoadingState />;
  if (api.error && api.payments.length === 0) return <ErrorState error={api.error} onRetry={() => void api.refetch()} />;

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        <BranchFilter />
        <ChipRow label="Party" value={partyType} onChange={setPartyType} options={PARTY_FILTER} />
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search payments..." />
        <Button label="Record Payment" disabled={!has('acc_payments:create')} onPress={() => setRecording(true)} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={api.isFetching && !api.isLoading} onRefresh={() => void api.refetch()} />}
        ListEmptyComponent={<EmptyState title="No payments found" />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.between}>
              <Text variant="label">{partyName(item) ?? item.partyId}</Text>
              <Text variant="label">{formatRs(item.amount)}</Text>
            </View>
            <View style={styles.badges}>
              <Badge label={item.partyType === PartyType.CUSTOMER ? 'Customer' : 'Vendor'} />
              {isAdvance(item.unallocatedAmount) ? <Badge label={`Advance ${formatRs(item.unallocatedAmount)}`} tone="warning" /> : null}
            </View>
            <Text variant="caption" muted>{formatDate(item.paymentDate)} · {methodLabel(item.method)} · {accountName(item)}</Text>
            {item.reference ? <Text variant="caption" muted>Ref {item.reference}</Text> : null}
            {has('acc_payments:void') ? <Button label={`Void payment ${item.id}`} variant="danger" loading={guard.busy} onPress={() => void voidIt(item)} /> : null}
          </Card>
        )}
      />
      {recording ? <RecordPaymentDialog branchId={branchId} onClose={() => setRecording(false)} /> : null}
    </View>
  );
}

function RecordPaymentDialog({ branchId, onClose }: { branchId: string | null; onClose: () => void }) {
  const theme = useTheme();
  const guard = useSubmitGuard();
  const { create } = usePaymentMutations();
  const accounts = useAccounts();
  const customers = useCustomers();
  const vendors = useVendors();
  const [draft, setDraft] = useState<PaymentDraft>({ partyType: PartyType.CUSTOMER, partyId: '', amount: '', method: PaymentMethod.CASH, accountId: '', paymentDate: todayLocal(), reference: '', notes: '', allocations: {} });
  const set = (patch: Partial<PaymentDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const open = useOpenInvoices(draft.partyId ? draft.partyType : null, draft.partyId || null, branchId);
  const amount = Number(draft.amount) || 0;
  const remainder = remainderOf(amount, draft.allocations);
  const partyOptions = draft.partyType === PartyType.CUSTOMER ? customers.customers.map((c) => ({ value: c.id, label: c.name })) : vendors.vendors.map((v) => ({ value: v.id, label: v.company }));
  const accountOptions = payFromAccounts(accounts.accounts).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));

  const submit = () =>
    guard.run(async () => {
      if (!canSubmitPayment(draft)) return;
      try {
        await create(buildPaymentRequest(draft, open.invoices));
        onClose();
      } catch {
        // The mutation already showed the server's message; keep the form so nothing typed is lost.
      }
    });

  return (
    <FormModal visible title="Record a Payment" onClose={onClose}>
      <FlatList
        data={draft.partyId ? open.invoices : []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.form}
        ListHeaderComponent={
          <View style={styles.form}>
            <ChipRow label="Party type" value={draft.partyType} onChange={(v) => set({ partyType: v as PartyType, partyId: '', allocations: {} })} options={[{ value: PartyType.CUSTOMER, label: 'Customer' }, { value: PartyType.VENDOR, label: 'Vendor' }]} />
            <PickerField label={draft.partyType === PartyType.CUSTOMER ? 'Customer' : 'Vendor'} required value={draft.partyId} options={partyOptions} placeholder={draft.partyType === PartyType.CUSTOMER ? 'Select a customer' : 'Select a vendor'} onChange={(v) => set({ partyId: v, allocations: {} })} />
            <Input label="Amount" value={draft.amount} onChangeText={(v) => set({ amount: v })} keyboardType="decimal-pad" />
            <ChipRow label="Method" value={draft.method} onChange={(v) => set({ method: v as PaymentMethod })} options={METHODS} />
            <PickerField label="Cash/Bank Account" required value={draft.accountId} options={accountOptions} placeholder="Select account" onChange={(v) => set({ accountId: v })} />
            <Input label="Date (YYYY-MM-DD)" value={draft.paymentDate} onChangeText={(v) => set({ paymentDate: v.trim() })} autoCapitalize="none" />
            <Input label="Reference" value={draft.reference} onChangeText={(v) => set({ reference: v })} />
            <Input label="Notes" value={draft.notes} onChangeText={(v) => set({ notes: v })} />
            {draft.partyId ? (
              <View style={styles.form}>
                <Text variant="label">Allocate to open invoices (optional)</Text>
                {remainder < -0.01 ? <Badge label={`Over-allocated by ${formatRs(-remainder)}`} tone="danger" /> : <Badge label={`Remainder → advance: ${formatRs(Math.max(remainder, 0))}`} />}
                {open.isLoading ? <LoadingState /> : open.invoices.length === 0 ? <Text muted>No open invoices for this party — the full amount will post as an advance.</Text> : null}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const d = draft.allocations[item.id];
          return (
            <Card>
              <View style={styles.between}>
                <View style={styles.flex}>
                  <Text variant="label">{item.number}</Text>
                  <Text variant="caption" muted>Outstanding: {formatRs(item.outstanding)}</Text>
                </View>
                <Switch accessibilityLabel={`Allocate ${item.number}`} value={!!d?.checked} onValueChange={(c) => set({ allocations: toggleAllocation(draft.allocations, item, c, amount) })} trackColor={{ true: theme.primary, false: theme.border }} />
              </View>
              {d?.checked ? (
                <Input label={`Allocation ${item.number}`} value={d.amount} keyboardType="decimal-pad" onChangeText={(v) => set({ allocations: { ...draft.allocations, [item.id]: { checked: true, amount: v } } })} />
              ) : null}
            </Card>
          );
        }}
        ListFooterComponent={<Button label="Save payment" loading={guard.busy} disabled={!canSubmitPayment(draft)} onPress={() => void submit()} />}
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
  badges: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});
