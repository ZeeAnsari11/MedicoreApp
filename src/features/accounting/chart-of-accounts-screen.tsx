import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

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
import { confirmAction } from '@/lib/confirm';
import { filterAndSort, compareText } from '@/lib/use-client-list';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';
import { AccountType, type Account } from '@/types/medicore';

import { useAccounts } from './use-accounts';

const TYPES = [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY, AccountType.REVENUE, AccountType.EXPENSE].map((t) => ({ value: t as string, label: t.charAt(0) + t.slice(1).toLowerCase() }));

/** Port of the web Chart of Accounts page. Seeding, unique codes and system-account protection are all backend rules. */
export function ChartOfAccountsScreen() {
  return (
    <RequirePermission permission="acc_chart_of_accounts:read" what="view the chart of accounts">
      <Chart />
    </RequirePermission>
  );
}

function Chart() {
  const { has } = useAuth();
  const api = useAccounts();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Account | 'new' | null>(null);

  const visible = useMemo(
    () => filterAndSort(api.accounts, query, { searchText: (a) => `${a.code} ${a.name} ${a.type}`, sorters: { code: (a, b) => compareText(a.code, b.code) } }, 'code', 'asc'),
    [api.accounts, query],
  );

  const deactivate = async (a: Account) => {
    const ok = await confirmAction({ title: `Deactivate ${a.name}?`, message: 'The account is removed from the chart. Existing postings are kept.', confirmLabel: 'Deactivate', destructive: true });
    if (!ok) return;
    try {
      await api.remove(a.id);
    } catch {
      // The mutation already showed the server's message.
    }
  };

  if (api.isLoading) return <LoadingState />;
  if (api.error && api.accounts.length === 0) return <ErrorState error={api.error} onRetry={() => void api.refetch()} />;

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search accounts..." />
        <Button label="New Account" disabled={!has('acc_chart_of_accounts:create')} onPress={() => setEditing('new')} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={api.isFetching && !api.isLoading} onRefresh={() => void api.refetch()} />}
        ListEmptyComponent={<EmptyState title="No accounts found" />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.between}>
              <Text variant="label">{item.code} · {item.name}</Text>
              <Badge label={item.isActive ? 'Active' : 'Inactive'} tone={item.isActive ? 'success' : 'neutral'} />
            </View>
            <View style={styles.badges}>
              <Badge label={item.type} />
              {item.isSystemAccount ? <Badge label="System" tone="warning" /> : null}
            </View>
            {item.description ? <Text variant="caption" muted>{item.description}</Text> : null}
            <View style={styles.badges}>
              <View style={styles.flex}><Button label={`Edit ${item.code}`} variant="secondary" disabled={!has('acc_chart_of_accounts:update')} onPress={() => setEditing(item)} /></View>
              {!item.isSystemAccount ? (
                <View style={styles.flex}><Button label={`Deactivate ${item.code}`} variant="danger" disabled={!has('acc_chart_of_accounts:delete') || api.isRemoving} onPress={() => void deactivate(item)} /></View>
              ) : null}
            </View>
          </Card>
        )}
      />
      {editing ? <AccountDialog account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} api={api} /> : null}
    </View>
  );
}

function AccountDialog({ account, onClose, api }: { account: Account | null; onClose: () => void; api: ReturnType<typeof useAccounts> }) {
  const guard = useSubmitGuard();
  const [code, setCode] = useState(account?.code ?? '');
  const [type, setType] = useState<string>(account?.type ?? AccountType.EXPENSE);
  const [name, setName] = useState(account?.name ?? '');
  const [description, setDescription] = useState(account?.description ?? '');
  const [attempted, setAttempted] = useState(false);

  const nameError = attempted && name.trim().length < 2 ? 'Name is required' : undefined;
  const codeError = attempted && !account && !code.trim() ? 'Code is required' : undefined;

  const submit = () =>
    guard.run(async () => {
      setAttempted(true);
      if (name.trim().length < 2 || (!account && !code.trim())) return;
      try {
        if (account) await api.update(account.id, { name: name.trim(), description: description.trim() || undefined });
        else await api.create({ code: code.trim(), name: name.trim(), type: type as AccountType, description: description.trim() || undefined });
        onClose();
      } catch {
        // The mutation already showed the server's message; keep the form open.
      }
    });

  return (
    <FormModal visible title={account ? 'Edit Account' : 'New Account'} onClose={onClose}>
      <View style={styles.form}>
        <Input label="Code" value={code} onChangeText={setCode} editable={!account} autoCapitalize="characters" error={codeError} />
        <PickerField label="Type" value={type} onChange={setType} options={TYPES} disabled={!!account} />
        <Input label="Name" value={name} onChangeText={setName} error={nameError} />
        <Input label="Description" value={description} onChangeText={setDescription} multiline />
        <Button label="Save" loading={guard.busy} onPress={() => void submit()} />
      </View>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { padding: spacing.lg, gap: spacing.md },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  badges: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  form: { padding: spacing.lg, gap: spacing.md },
});
