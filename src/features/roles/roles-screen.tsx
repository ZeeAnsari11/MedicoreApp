import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
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
import type { Role } from '@/types/medicore';

import { MenuPicker } from './menu-picker';
import { moduleCount } from './menu-picker-logic';
import { buildRoleCreate, buildRoleUpdate, roleDefaults, roleSchema, type RoleFormValues } from './role-schema';
import { useRoles, usePermissionModules } from './use-roles';

/** Port of the web Administration > Roles page. The backend normalizes keys and refuses duplicate/in-use roles. */
export function RolesScreen() {
  return (
    <RequirePermission permission="roles:read" what="view roles">
      <Roles />
    </RequirePermission>
  );
}

function Roles() {
  const { has } = useAuth();
  const api = useRoles();
  const guard = useSubmitGuard();
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const canUpdate = has('roles:update');

  const toggle = (r: Role, next: boolean) =>
    guard.run(async () => {
      const ok = await confirmAction({
        title: next ? 'Activate role?' : 'Deactivate role?',
        message: next ? `Users with ${r.name} get its permissions back.` : `Users assigned to ${r.name} lose all of its permissions while it is inactive.`,
        confirmLabel: next ? 'Activate' : 'Deactivate',
      });
      if (!ok) return;
      await api.setStatus(r.id, next).catch(() => undefined);
    });

  const remove = (r: Role) =>
    guard.run(async () => {
      const ok = await confirmAction({ title: 'Delete role?', message: 'Are you sure you want to delete this role?', confirmLabel: 'Delete', destructive: true });
      if (!ok) return;
      await api.remove(r.id).catch(() => undefined);
    });

  if (api.isLoading) return <LoadingState />;
  if (api.error && api.roles.length === 0) return <ErrorState error={api.error} onRetry={() => void api.refetch()} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={api.roles}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={api.isFetching && !api.isLoading} onRefresh={() => void api.refetch()} />}
        ListHeaderComponent={
          <View style={styles.top}>
            <Button label="New Role" disabled={!has('roles:create')} onPress={() => setEditing('new')} />
            {/* The web has this page but no menu link to it; reached from here when the user may read it. */}
            {has('permissions:read') ? <Button label="Permissions catalog" variant="secondary" onPress={() => router.push('/administration/permissions' as never)} /> : null}
          </View>
        }
        ListEmptyComponent={<EmptyState title="No roles yet" message="Create a role to group menu access" />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.head}>
              <Text variant="heading" style={styles.flex}>{item.name}</Text>
              <Badge label={item.isActive ? 'Active' : 'Inactive'} tone={item.isActive ? 'success' : 'neutral'} />
            </View>
            <Text muted>{item.description || '—'}</Text>
            <Text muted>{moduleCount(item.allowedModules)} module(s)</Text>
            <SwitchRow label="Active" value={item.isActive} disabled={!canUpdate || guard.busy} onValueChange={(v) => void toggle(item, v)} />
            {canUpdate ? <Button label="Edit" variant="secondary" onPress={() => setEditing(item)} /> : null}
            <Button label="Delete" variant="danger" disabled={!has('roles:delete') || guard.busy} onPress={() => void remove(item)} />
          </Card>
        )}
      />
      {editing ? <RoleDialog role={editing === 'new' ? undefined : editing} api={api} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}

function RoleDialog({ role, api, onClose }: { role?: Role; api: ReturnType<typeof useRoles>; onClose: () => void }) {
  const { control, handleSubmit } = useForm<RoleFormValues>({ resolver: zodResolver(roleSchema), defaultValues: roleDefaults(role) });
  const modules = usePermissionModules();
  const submit = useDialogSubmit();

  const save = handleSubmit(async (values) => {
    const ok = await submit.run(
      () => (role ? api.update(role.id, buildRoleUpdate(values, role)) : api.create(buildRoleCreate(values))),
      role ? 'Failed to update role' : 'Failed to create role',
    );
    if (ok) onClose();
  });

  return (
    <FormModal visible title={role ? 'Edit Role' : 'Create Role'} onClose={onClose}>
      <FormScreen>
        <DialogError message={submit.error} />
        <TextField control={control} name="name" label="Name" placeholder="e.g., Sales Clerk" />
        <TextField control={control} name="description" label="Description" placeholder="Optional" multiline />
        <Text variant="label" muted>Menus</Text>
        {modules.error ? (
          <ErrorState error={modules.error} onRetry={() => void modules.refetch()} />
        ) : modules.isLoading ? (
          <LoadingState />
        ) : (
          <Controller control={control} name="allowedModules" render={({ field }) => <MenuPicker modules={modules.modules} value={field.value} onChange={field.onChange} />} />
        )}
        <Button label="Save" loading={submit.busy} onPress={() => void save()} />
      </FormScreen>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { gap: spacing.md },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
