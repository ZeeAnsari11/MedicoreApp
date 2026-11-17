import { router, Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useAuth } from '@/features/auth/use-auth';
import { ManufacturerForm } from '@/features/manufacturers/manufacturer-form';
import { buildManufacturerCreate, buildManufacturerUpdate } from '@/features/manufacturers/schema';
import { useManufacturers } from '@/features/manufacturers/use-manufacturers';

export default function ManufacturerFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const mode = id ? 'edit' : 'create';
  const { has } = useAuth();
  const api = useManufacturers();
  const manufacturer = id ? api.manufacturers.find((m) => m.id === id) : undefined;

  if (!has(mode === 'create' ? 'manufacturers:create' : 'manufacturers:update')) {
    return <EmptyState title="No access" message="You don't have permission to do this." />;
  }
  if (mode === 'edit') {
    if (api.isLoading) return <LoadingState />;
    if (api.error && !manufacturer) return <ErrorState error={api.error} onRetry={() => api.refetch()} />;
    if (!manufacturer) return <EmptyState title="Manufacturer not found" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: mode === 'create' ? 'Create Manufacturer' : 'Edit Manufacturer' }} />
      <ManufacturerForm
        mode={mode}
        manufacturer={manufacturer}
        canCreateVendor={has('vendors:create')}
        onSubmit={async (values, alsoVendor) => {
          try {
            if (mode === 'create') await api.create(buildManufacturerCreate(values, alsoVendor));
            else if (manufacturer) await api.update(manufacturer.id, buildManufacturerUpdate(values, manufacturer));
            router.back();
          } catch {
            // The mutation already toasted the server's message; stay on the form so nothing typed is lost.
          }
        }}
      />
    </>
  );
}
