import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/form/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { FormScreen } from '@/components/ui/form-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { DialogError, useDialogSubmit } from '@/features/administration/dialog-submit';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { confirmAction } from '@/lib/confirm';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';
import type { Branch } from '@/types/medicore';

import { branchDefaults, branchSchema, buildBranchCreate, buildBranchUpdate, type BranchFormValues } from './branch-schema';
import { useBranchAdmin } from './use-branch-admin';

/** Port of the web Administration > Branches page. Every rule (main branch, unique code, in-use delete) is the backend's. */
export function BranchesScreen() {
  return (
    <RequirePermission permission="branches:read" what="view branches">
      <Branches />
    </RequirePermission>
  );
}

function Branches() {
  const { has } = useAuth();
  const api = useBranchAdmin();
  const guard = useSubmitGuard();
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);
  const canUpdate = has('branches:update');
  const canDelete = has('branches:delete');

  const toggle = (b: Branch, next: boolean) =>
    guard.run(async () => {
      const ok = await confirmAction({
        title: next ? 'Activate branch?' : 'Deactivate branch?',
        message: next ? `${b.name} will accept new documents again.` : `No new documents can be created in ${b.name} while it is inactive.`,
        confirmLabel: next ? 'Activate' : 'Deactivate',
      });
      if (!ok) return;
      await api.setStatus(b.id, next).catch(() => undefined);
    });

  const remove = (b: Branch) =>
    guard.run(async () => {
      const ok = await confirmAction({ title: 'Delete branch?', message: 'Are you sure you want to delete this branch?', confirmLabel: 'Delete', destructive: true });
      if (!ok) return;
      await api.remove(b.id).catch(() => undefined);
    });

  if (api.isLoading) return <LoadingState />;
  if (api.error && api.branches.length === 0) return <ErrorState error={api.error} onRetry={() => void api.refetch()} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={api.branches}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={api.isFetching && !api.isLoading} onRefresh={() => void api.refetch()} />}
        ListHeaderComponent={<Button label="New Branch" disabled={!has('branches:create')} onPress={() => setEditing('new')} />}
        ListEmptyComponent={<EmptyState title="No branches yet" message="Create your first branch" />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.head}>
              <Text variant="heading" style={styles.flex}>{item.name}</Text>
              {item.isMain ? <Badge label="Main" tone="warning" /> : null}
              <Badge label={item.isActive ? 'Active' : 'Inactive'} tone={item.isActive ? 'success' : 'neutral'} />
            </View>
            <Text muted>Code: {item.code}</Text>
            <Text muted>Address: {item.address || '—'}</Text>
            <Text muted>Phone: {item.phone || '—'}</Text>
            {/* The main branch can never be deactivated or deleted: the backend refuses (409), these mirror it. */}
            <SwitchRow label="Active" value={item.isActive} disabled={item.isMain || !canUpdate || guard.busy} onValueChange={(v) => void toggle(item, v)} />
            {canUpdate ? <Button label="Edit" variant="secondary" onPress={() => setEditing(item)} /> : null}
            <Button label="Delete" variant="danger" disabled={item.isMain || !canDelete || guard.busy} onPress={() => void remove(item)} />
          </Card>
        )}
      />
      {editing ? <BranchDialog branch={editing === 'new' ? undefined : editing} api={api} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}

function BranchDialog({ branch, api, onClose }: { branch?: Branch; api: ReturnType<typeof useBranchAdmin>; onClose: () => void }) {
  const { control, handleSubmit } = useForm<BranchFormValues>({ resolver: zodResolver(branchSchema), defaultValues: branchDefaults(branch) });
  const submit = useDialogSubmit();

  const save = handleSubmit(async (values) => {
    const ok = await submit.run(
      () => (branch ? api.update(branch.id, buildBranchUpdate(values, branch)) : api.create(buildBranchCreate(values))),
      branch ? 'Failed to update branch' : 'Failed to create branch',
    );
    if (ok) onClose();
  });

  return (
    <FormModal visible title={branch ? 'Edit Branch' : 'Create Branch'} onClose={onClose}>
      <FormScreen>
        <DialogError message={submit.error} />
        <TextField control={control} name="name" label="Name" placeholder="e.g., North Branch" />
        <TextField control={control} name="code" label="Code" placeholder="e.g., NB" autoCapitalize="characters" />
        <TextField control={control} name="address" label="Address" placeholder="Optional" />
        <TextField control={control} name="phone" label="Phone" placeholder="Optional" keyboardType="phone-pad" />
        <Controller control={control} name="isMain" render={({ field }) => <SwitchRow label="Main branch" value={field.value} onValueChange={field.onChange} />} />
        <Button label="Save" loading={submit.busy} onPress={() => void save()} />
      </FormScreen>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
