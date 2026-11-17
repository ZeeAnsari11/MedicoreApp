import { router, Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useAuth } from '@/features/auth/use-auth';
import { CustomerForm } from '@/features/customers/customer-form';
import { buildCustomerCreate, buildCustomerUpdate } from '@/features/customers/schema';
import { useCustomers } from '@/features/customers/use-customers';

export default function CustomerFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const mode = id ? 'edit' : 'create';
  const { has } = useAuth();
  const api = useCustomers();
  const customer = id ? api.customers.find((c) => c.id === id) : undefined;

  if (!has(mode === 'create' ? 'customers:create' : 'customers:update')) {
    return <EmptyState title="No access" message="You don't have permission to do this." />;
  }
  if (mode === 'edit') {
    if (api.isLoading) return <LoadingState />;
    if (api.error && !customer) return <ErrorState error={api.error} onRetry={() => api.refetch()} />;
    if (!customer) return <EmptyState title="Customer not found" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: mode === 'create' ? 'Create Customer' : 'Edit Customer' }} />
      <CustomerForm
        mode={mode}
        customer={customer}
        onSubmit={async (values) => {
          try {
            if (mode === 'create') await api.create(buildCustomerCreate(values));
            else if (customer) await api.update(customer.id, buildCustomerUpdate(values));
            router.back();
          } catch {
            // The mutation already toasted the server's message; stay on the form so nothing typed is lost.
          }
        }}
      />
    </>
  );
}
