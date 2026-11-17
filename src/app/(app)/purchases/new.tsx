import { RequirePermission } from '@/features/auth/require-permission';
import { PurchaseForm } from '@/features/purchases/purchase-form';

export default function NewPurchaseScreen() {
  return (
    <RequirePermission permission="purchases:create" what="receive purchases">
      <PurchaseForm />
    </RequirePermission>
  );
}
