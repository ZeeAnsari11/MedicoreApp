import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/chip-row';
import { TextField } from '@/components/form/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { FormScreen } from '@/components/ui/form-screen';
import { PickerField } from '@/components/ui/picker-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { DialogError, useDialogSubmit } from '@/features/administration/dialog-submit';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { useBranches } from '@/features/branches/use-branches';
import { useRoles } from '@/features/roles/use-roles';
import { confirmAction } from '@/lib/confirm';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing } from '@/theme';
import { TenantRole, UserStatus, type User } from '@/types/medicore';

import { TemporaryPasswordDialog } from './temporary-password-dialog';
import { buildUserCreate, buildUserUpdate, roleForTenantRole, userDefaults, userSchema, type UserFormValues } from './user-schema';
import { useUsers } from './use-users';

const TENANT_ROLES = [
  { value: TenantRole.TENANT_USER, label: 'User' },
  { value: TenantRole.TENANT_SUPER_ADMIN, label: 'Admin' },
];
const roleLabel = (r: TenantRole) => (r === TenantRole.TENANT_SUPER_ADMIN ? 'Admin' : 'User');

/**
 * Port of the web Administration > Users page. Self-edit, last-admin and privilege rules are enforced by the backend and
 * its message is shown as-is; nothing here is a security boundary.
 */
export function UsersScreen() {
  return (
    <RequirePermission permission="users:read" what="view users">
      <Users />
    </RequirePermission>
  );
}

function Users() {
  const { has } = useAuth();
  const api = useUsers();
  const roles = useRoles(has('roles:read'));
  const guard = useSubmitGuard();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const roleName = useMemo(() => new Map(roles.roles.map((r) => [r.id, r.name])), [roles.roles]);

  const toggle = (u: User, active: boolean) =>
    guard.run(async () => {
      const ok = await confirmAction({
        title: active ? 'Activate user?' : 'Disable user?',
        message: active ? `${u.fullName} will be able to use their permissions again.` : `${u.fullName} will lose access to permission-protected features.`,
        confirmLabel: active ? 'Activate' : 'Disable',
        destructive: !active,
      });
      if (!ok) return;
      await api.setStatus(u.id, active ? UserStatus.ACTIVE : UserStatus.DISABLED).catch(() => undefined);
    });

  if (api.isLoading) return <LoadingState />;
  if (api.error && api.users.length === 0) return <ErrorState error={api.error} onRetry={() => void api.refetch()} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={api.users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={api.isFetching && !api.isLoading} onRefresh={() => void api.refetch()} />}
        ListHeaderComponent={<Button label="New User" disabled={!has('users:create')} onPress={() => setEditing('new')} />}
        ListEmptyComponent={<EmptyState title="No users yet" message="Add the people who use this workspace" />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.head}>
              <Text variant="heading" style={styles.flex}>{item.fullName}</Text>
              <Badge label={roleLabel(item.tenantRole)} tone={item.tenantRole === TenantRole.TENANT_SUPER_ADMIN ? 'warning' : 'neutral'} />
              <Badge label={item.status} tone={item.status === UserStatus.ACTIVE ? 'success' : 'neutral'} />
            </View>
            <Text muted>Username: {item.username}</Text>
            <Text muted>Phone: {item.phone || '—'}</Text>
            <Text muted>Role: {item.role?.name ?? (item.roleId ? roleName.get(item.roleId) : undefined) ?? '—'}</Text>
            <SwitchRow label="Active" value={item.status === UserStatus.ACTIVE} disabled={!has('users:deactivate') || guard.busy} onValueChange={(v) => void toggle(item, v)} />
            {has('users:update') ? <Button label="Edit" variant="secondary" onPress={() => setEditing(item)} /> : null}
          </Card>
        )}
      />
      {editing ? (
        <UserDialog
          user={editing === 'new' ? undefined : editing}
          api={api}
          onClose={() => setEditing(null)}
          onCreated={(username, password) => setCreated({ username, password })}
        />
      ) : null}
      {created ? <TemporaryPasswordDialog username={created.username} password={created.password} onDone={() => setCreated(null)} /> : null}
    </View>
  );
}

function UserDialog({ user, api, onClose, onCreated }: { user?: User; api: ReturnType<typeof useUsers>; onClose: () => void; onCreated: (username: string, password: string) => void }) {
  const { has } = useAuth();
  const { control, handleSubmit, setValue } = useForm<UserFormValues>({ resolver: zodResolver(userSchema), defaultValues: userDefaults(user) });
  const roles = useRoles(has('roles:read'));
  const { branches } = useBranches(has('branches:read'));
  const submit = useDialogSubmit();
  const isAdmin = useWatch({ control, name: 'tenantRole' }) === TenantRole.TENANT_SUPER_ADMIN;
  // Only active entries can be picked (as on the web). The one already assigned stays listed even if it was since
  // deactivated, so the picker shows the real assignment instead of a misleading "None".
  const roleOptions = roles.roles
    .filter((r) => r.isActive || r.id === user?.roleId)
    .map((r) => ({ value: r.id, label: r.isActive ? r.name : `${r.name} (inactive)` }));
  const branchOptions = branches
    .filter((b) => b.isActive || b.id === user?.branchId)
    .map((b) => ({ value: b.id, label: `${b.name}${b.isMain ? ' (Main)' : ''}${b.isActive ? '' : ' (inactive)'}` }));

  const save = handleSubmit(async (values) => {
    const ok = await submit.run(async () => {
      const normalized = { ...values, roleId: roleForTenantRole(values.tenantRole, values.roleId) };
      if (user) {
        await api.update(user.id, buildUserUpdate(normalized, user));
      } else {
        const result = await api.create(buildUserCreate(normalized));
        onCreated(result.username, result.temporaryPassword);
      }
    }, user ? 'Failed to update user' : 'Failed to create user');
    if (ok) onClose();
  });

  return (
    <FormModal visible title={user ? 'Edit User' : 'Create User'} onClose={onClose}>
      <FormScreen>
        <DialogError message={submit.error} />
        <TextField control={control} name="username" label="Username" placeholder="e.g., ali.khan" autoCapitalize="none" editable={!user} />
        <TextField control={control} name="fullName" label="Full name" placeholder="e.g., Ali Khan" />
        <TextField control={control} name="phone" label="Phone" placeholder="Optional" keyboardType="phone-pad" />
        <TextField control={control} name="territory" label="Territory" placeholder="e.g. Lahore North" />
        <TextField control={control} name="city" label="City" placeholder="e.g. Lahore" />
        <TextField control={control} name="address" label="Address" placeholder="Street, area" />
        <Controller
          control={control}
          name="tenantRole"
          render={({ field }) => (
            <ChipRow
              label="Tenant Role"
              value={field.value}
              options={TENANT_ROLES}
              onChange={(v) => {
                field.onChange(v);
                if (v === TenantRole.TENANT_SUPER_ADMIN) setValue('roleId', null);
              }}
            />
          )}
        />
        <Controller
          control={control}
          name="roleId"
          render={({ field }) => (
            <PickerField
              label={isAdmin ? 'User Role (Not applicable for Admin)' : 'User Role (controls which menus this user can see)'}
              value={field.value ?? ''}
              placeholder={isAdmin ? 'Admin has access to all menus' : 'None'}
              clearable
              disabled={isAdmin}
              onChange={(v) => field.onChange(v || null)}
              options={roleOptions}
            />
          )}
        />
        <Controller
          control={control}
          name="branchId"
          render={({ field, fieldState }) => (
            <PickerField
              label="Branch"
              required
              value={field.value ?? ''}
              placeholder={branchOptions.length ? 'Select a branch' : 'No branches yet: create one first'}
              error={fieldState.error?.message}
              onChange={(v) => field.onChange(v || null)}
              options={branchOptions}
            />
          )}
        />
        <Button label="Save" loading={submit.busy} onPress={() => void save()} />
      </FormScreen>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
