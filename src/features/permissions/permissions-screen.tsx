import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/form/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { FormScreen } from '@/components/ui/form-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { DialogError, useDialogSubmit } from '@/features/administration/dialog-submit';
import { RequirePermission } from '@/features/auth/require-permission';
import { useAuth } from '@/features/auth/use-auth';
import { spacing } from '@/theme';
import type { Permission } from '@/types/medicore';

import { buildPermissionCreate, buildPermissionUpdate, permissionDefaults, permissionSchema, type PermissionFormValues } from './permission-schema';
import { usePermissionCatalog } from './use-permission-catalog';

/**
 * Port of the web Administration > Permissions page. System rows are read-only (the backend refuses to edit them); roles
 * hold plain permission strings, so a custom catalog entry does not change what a role can do.
 */
export function PermissionsScreen() {
  return (
    <RequirePermission permission="permissions:read" what="view the permission catalog">
      <Permissions />
    </RequirePermission>
  );
}

type Selection = { mode: 'new' } | { mode: 'view' | 'edit'; permission: Permission };

function Permissions() {
  const { has } = useAuth();
  const api = usePermissionCatalog();
  const [selection, setSelection] = useState<Selection | null>(null);
  const canUpdate = has('permissions:update');

  if (api.isLoading) return <LoadingState />;
  if (api.error && api.permissions.length === 0) return <ErrorState error={api.error} onRetry={() => void api.refetch()} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={api.permissions}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={api.isFetching && !api.isLoading} onRefresh={() => void api.refetch()} />}
        ListHeaderComponent={<Button label="New Permission" disabled={!has('permissions:create')} onPress={() => setSelection({ mode: 'new' })} />}
        ListEmptyComponent={<EmptyState title="No permissions yet" />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.head}>
              <Text variant="label" style={[styles.flex, styles.mono]}>{item.key}</Text>
              <Badge label={item.isSystem ? 'System' : 'Custom'} tone={item.isSystem ? 'neutral' : 'warning'} />
              <Badge label={item.isActive ? 'Active' : 'Inactive'} tone={item.isActive ? 'success' : 'neutral'} />
            </View>
            <Text>{item.name}</Text>
            <Text muted>Module: {item.module}</Text>
            <Button label="View" variant="secondary" onPress={() => setSelection({ mode: 'view', permission: item })} />
            {canUpdate && !item.isSystem ? <Button label="Edit" variant="secondary" onPress={() => setSelection({ mode: 'edit', permission: item })} /> : null}
          </Card>
        )}
      />
      {selection ? <PermissionDialog selection={selection} api={api} onClose={() => setSelection(null)} /> : null}
    </View>
  );
}

function PermissionDialog({ selection, api, onClose }: { selection: Selection; api: ReturnType<typeof usePermissionCatalog>; onClose: () => void }) {
  const permission = selection.mode === 'new' ? undefined : selection.permission;
  const readOnly = selection.mode === 'view';
  const { control, handleSubmit } = useForm<PermissionFormValues>({ resolver: zodResolver(permissionSchema), defaultValues: permissionDefaults(permission) });
  const submit = useDialogSubmit();

  const save = handleSubmit(async (values) => {
    const ok = await submit.run(
      () => (permission ? api.update(permission.id, buildPermissionUpdate(values)) : api.create(buildPermissionCreate(values))),
      permission ? 'Failed to update permission' : 'Failed to create permission',
    );
    if (ok) onClose();
  });

  const title = selection.mode === 'new' ? 'Create Permission' : selection.mode === 'edit' ? 'Edit Permission' : 'View Permission';
  return (
    <FormModal visible title={title} onClose={onClose}>
      <FormScreen>
        {readOnly && permission?.isSystem ? <Text muted>System permissions cannot be edited</Text> : null}
        <DialogError message={submit.error} />
        <TextField control={control} name="key" label="Key" placeholder="module:action" autoCapitalize="none" editable={selection.mode === 'new'} />
        <TextField control={control} name="name" label="Name" editable={!readOnly} />
        <TextField control={control} name="description" label="Description" placeholder="Optional" editable={!readOnly} multiline />
        <TextField control={control} name="module" label="Module" placeholder="e.g., sales" autoCapitalize="none" editable={!readOnly} />
        {readOnly ? null : <Button label="Save" loading={submit.busy} onPress={() => void save()} />}
      </FormScreen>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  mono: { fontFamily: 'monospace' },
});
