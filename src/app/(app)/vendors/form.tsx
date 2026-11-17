import { router, Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useAuth } from '@/features/auth/use-auth';
import { buildVendorCreate, buildVendorUpdate } from '@/features/vendors/schema';
import { useVendors } from '@/features/vendors/use-vendors';
import { VendorForm } from '@/features/vendors/vendor-form';

export default function VendorFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const mode = id ? 'edit' : 'create';
  const { has } = useAuth();
  const api = useVendors();
  const vendor = id ? api.vendors.find((v) => v.id === id) : undefined;

  if (!has(mode === 'create' ? 'vendors:create' : 'vendors:update')) {
    return <EmptyState title="No access" message="You don't have permission to do this." />;
  }
  if (mode === 'edit') {
    if (api.isLoading) return <LoadingState />;
    if (api.error && !vendor) return <ErrorState error={api.error} onRetry={() => api.refetch()} />;
    if (!vendor) return <EmptyState title="Vendor not found" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: mode === 'create' ? 'Create Vendor' : 'Edit Vendor' }} />
      <VendorForm
        mode={mode}
        vendor={vendor}
        onSubmit={async (values) => {
          try {
            if (mode === 'create') await api.create(buildVendorCreate(values));
            else if (vendor) await api.update(vendor.id, buildVendorUpdate(values, vendor));
            router.back();
          } catch {
            // The mutation already toasted the server's message; stay on the form so nothing typed is lost.
          }
        }}
      />
    </>
  );
}
