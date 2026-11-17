import { router, Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/ui/states';
import { useAuth } from '@/features/auth/use-auth';
import { AdjustmentForm } from '@/features/inventory/adjustment-form';
import { adjustmentDefaults, buildAdjustment } from '@/features/inventory/schema';
import { useAdjustStock } from '@/features/inventory/use-inventory';
import { confirmAction } from '@/lib/confirm';

const VERBS = { add: 'Add', subtract: 'Subtract', set: 'Set' } as const;

export default function AdjustStockScreen() {
  const { has } = useAuth();
  const { adjust } = useAdjustStock();
  const p = useLocalSearchParams<{ productId?: string; branchId?: string; batchNumber?: string; expiryDate?: string }>();

  if (!has('inventory:adjust')) return <EmptyState title="No access" message="You don't have permission to adjust stock." />;

  const initial = adjustmentDefaults({
    branchId: p.branchId,
    productId: p.productId,
    batch: p.batchNumber && p.expiryDate ? { batchNumber: p.batchNumber, expiryDate: p.expiryDate } : undefined,
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Adjust Stock' }} />
      <AdjustmentForm
        initial={initial}
        onSubmit={async (values) => {
          const dto = buildAdjustment(values);
          const ok = await confirmAction({
            title: 'Apply stock adjustment?',
            message: `${VERBS[dto.operation]} ${dto.quantity} ${dto.operation === 'set' ? 'as the quantity of' : dto.operation === 'add' ? 'to' : 'from'} batch ${dto.batchNumber}. This changes stock on hand.`,
            confirmLabel: 'Apply',
          });
          if (!ok) return;
          try {
            await adjust(dto);
            router.back();
          } catch {
            // The mutation already toasted the server's message (e.g. not enough quantity); the form keeps what was typed.
          }
        }}
      />
    </>
  );
}
