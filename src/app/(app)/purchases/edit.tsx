import { useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { RequirePermission } from '@/features/auth/require-permission';
import { PurchaseForm } from '@/features/purchases/purchase-form';
import { usePurchase } from '@/features/purchases/use-purchases';

export default function EditPurchaseScreen() {
  return (
    <RequirePermission permission="purchases:update" what="edit purchases">
      <EditPurchase />
    </RequirePermission>
  );
}

function EditPurchase() {
  const { id, branchId } = useLocalSearchParams<{ id: string; branchId?: string }>();
  const { purchase, isLoading, error, refetch } = usePurchase(id, branchId ?? null);
  if (isLoading) return <LoadingState />;
  if (error && !purchase) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!purchase) return <EmptyState title="Purchase not found" />;
  // The server decides editability (payments, returns, cancelled); the form is never offered for a locked purchase.
  if (purchase.isEditable === false) return <EmptyState title="This purchase can't be edited" message={`Purchase is locked: ${purchase.lockReason ?? 'it has payments or returns.'}`} />;
  return <PurchaseForm editPurchase={purchase} />;
}
