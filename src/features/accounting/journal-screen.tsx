import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

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
import { useCustomers } from '@/features/customers/use-customers';
import { useVendors } from '@/features/vendors/use-vendors';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { compareText, filterAndSort } from '@/lib/use-client-list';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';
import { JournalEntryStatus, PartyType, type JournalEntry } from '@/types/medicore';

import { JournalEntryBody } from './journal-detail';
import { useAccounts } from './use-accounts';
import { canPostEntry, EMPTY_LINE, lineTotals, toRequestLines, useJournalEntries, type LineDraft } from './use-journal';

/** Port of the web Journal Entries page: list, detail, and the manual / opening-balance dialog. */
export function JournalScreen() {
  return (
    <RequirePermission permission="acc_journal_entries:read" what="view journal entries">
      <Journal />
    </RequirePermission>
  );
}

function Journal() {
  const { has } = useAuth();
  const { open } = useLocalSearchParams<{ open?: string }>();
  const { branchId } = useBranchFilter();
  const api = useJournalEntries(branchId);
  const [query, setQuery] = useState('');
  const [posting, setPosting] = useState(false);
  const [picked, setPicked] = useState<JournalEntry | null>(null);
  const [dismissedOpen, setDismissedOpen] = useState(false);

  // `?open=<id>` (a link from elsewhere) opens that entry once the list has it.
  const linked = !dismissedOpen && open ? api.entries.find((e) => e.id === open) : undefined;
  const detail = picked ?? linked ?? null;

  const visible = useMemo(
    () => filterAndSort(api.entries, query, { searchText: (e) => `${e.entryNumber} ${e.sourceType} ${e.description} ${e.status}`, sorters: { date: (a, b) => compareText(b.entryDate, a.entryDate) } }, 'date', 'asc'),
    [api.entries, query],
  );

  if (api.isLoading) return <LoadingState />;
  if (api.error && api.entries.length === 0) return <ErrorState error={api.error} onRetry={() => void api.refetch()} />;

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        <BranchFilter />
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search entries..." />
        <Button label="New Entry" disabled={!has('acc_journal_entries:create')} onPress={() => setPosting(true)} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={api.isFetching && !api.isLoading} onRefresh={() => void api.refetch()} />}
        ListEmptyComponent={<EmptyState title="No journal entries found" />}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Entry ${item.entryNumber}`} onPress={() => setPicked(item)}>
            <Card>
              <View style={styles.between}>
                <Text variant="label">{item.entryNumber}</Text>
                <Badge label={item.status} tone={item.status === JournalEntryStatus.REVERSED ? 'warning' : 'neutral'} />
              </View>
              <Text>{item.description}</Text>
              <Text variant="caption" muted>{formatDate(item.entryDate)} · {item.sourceType.replace(/_/g, ' ')}</Text>
              <Text variant="caption" muted>Debit {formatRs(item.totalDebit)} · Credit {formatRs(item.totalCredit)}</Text>
            </Card>
          </Pressable>
        )}
      />
      {detail ? (
        <FormModal visible title="Journal Entry" onClose={() => { setPicked(null); setDismissedOpen(true); }}>
          <ScrollView contentContainerStyle={styles.form}><JournalEntryBody entry={detail} /></ScrollView>
        </FormModal>
      ) : null}
      {posting ? <PostDialog onClose={() => setPosting(false)} api={api} /> : null}
    </View>
  );
}

const TYPES = [{ value: 'manual', label: 'Manual Entry' }, { value: 'opening', label: 'Opening Balance' }];
const PARTIES = [{ value: '', label: 'No party' }, { value: PartyType.CUSTOMER, label: 'Customer' }, { value: PartyType.VENDOR, label: 'Vendor' }];

function PostDialog({ onClose, api }: { onClose: () => void; api: ReturnType<typeof useJournalEntries> }) {
  const guard = useSubmitGuard();
  const field = useBranchField();
  const accounts = useAccounts();
  const customers = useCustomers();
  const vendors = useVendors();
  const [formBranch, setFormBranch] = useState('');
  const branchId = field.locked ? field.defaultBranchId : formBranch;
  const [type, setType] = useState<'manual' | 'opening'>('manual');
  const [entryDate, setDate] = useState(todayLocal());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  const [attempted, setAttempted] = useState(false);

  const patch = (i: number, p: Partial<LineDraft>) => setLines((prev) => prev.map((l, x) => (x === i ? { ...l, ...p } : l)));
  const totals = lineTotals(lines);
  const ready = canPostEntry(type, description, lines);
  const balanced = Math.abs(totals.debit - totals.credit) < 0.01 && totals.debit > 0;

  const submit = () =>
    guard.run(async () => {
      setAttempted(true);
      if (!branchId || !ready) return;
      try {
        if (type === 'manual') await api.create({ branchId, entryDate, description: description.trim(), lines: toRequestLines(lines) });
        else await api.createOpening({ branchId, entryDate, description: description.trim() || undefined, lines: toRequestLines(lines) });
        onClose();
      } catch {
        // The mutation already showed the server's message; keep the form.
      }
    });

  return (
    <FormModal visible title="New Journal Entry" onClose={onClose}>
      <FlatList
        data={[]}
        renderItem={() => null}
        contentContainerStyle={styles.form}
        ListHeaderComponent={
          <View style={styles.form}>
            <BranchField field={field} value={branchId} onChange={setFormBranch} error={attempted && !branchId ? 'Branch is required' : undefined} />
            <ChipRow label="Entry Type" value={type} onChange={(v) => setType(v as 'manual' | 'opening')} options={TYPES} />
            <Input label="Date (YYYY-MM-DD)" value={entryDate} onChangeText={(v) => setDate(v.trim())} autoCapitalize="none" />
            <Input label={type === 'opening' ? 'Description (optional)' : 'Description'} value={description} onChangeText={setDescription} placeholder="What is this entry for?" />
            <Badge label={`Debit ${totals.debit.toFixed(2)} / Credit ${totals.credit.toFixed(2)}`} tone={balanced ? 'success' : 'danger'} />
            {lines.map((l, i) => (
              <Card key={i}>
                <PickerField label={`Account ${i + 1}`} value={l.accountId} placeholder="Account" onChange={(v) => patch(i, { accountId: v })} options={accounts.accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
                <Input label={`Debit ${i + 1}`} value={l.debit} keyboardType="decimal-pad" onChangeText={(v) => patch(i, { debit: v, credit: v ? '' : l.credit })} />
                <Input label={`Credit ${i + 1}`} value={l.credit} keyboardType="decimal-pad" onChangeText={(v) => patch(i, { credit: v, debit: v ? '' : l.debit })} />
                <ChipRow label={`Party ${i + 1}`} value={l.partyType} onChange={(v) => patch(i, { partyType: v as LineDraft['partyType'], partyId: '' })} options={PARTIES} />
                {l.partyType ? (
                  <PickerField label={`Party name ${i + 1}`} value={l.partyId} placeholder="Select" onChange={(v) => patch(i, { partyId: v })} options={l.partyType === PartyType.CUSTOMER ? customers.customers.map((c) => ({ value: c.id, label: c.name })) : vendors.vendors.map((v) => ({ value: v.id, label: v.company }))} />
                ) : null}
                <Button label={`Remove line ${i + 1}`} variant="secondary" disabled={lines.length <= 2} onPress={() => setLines((prev) => prev.filter((_, x) => x !== i))} />
              </Card>
            ))}
            <Button label="Add Line" variant="secondary" onPress={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])} />
            <Button label="Post Entry" loading={guard.busy} disabled={!ready} onPress={() => void submit()} />
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
});
