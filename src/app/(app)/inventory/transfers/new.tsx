import { router, Stack } from 'expo-router';

import { EmptyState } from '@/components/ui/states';
import { useAuth } from '@/features/auth/use-auth';
import { TransferForm } from '@/features/transfers/transfer-form';
import { useCreateTransfer } from '@/features/transfers/use-transfers';
import { buildTransfer } from '@/features/transfers/schema';
import { confirmAction } from '@/lib/confirm';

export default function NewTransferScreen() {
  const { has } = useAuth();
  const { create } = useCreateTransfer();
  if (!has('inventory:adjust')) return <EmptyState title="No access" message="You don't have permission to transfer stock." />;
  return (
    <>
      <Stack.Screen options={{ title: 'New Transfer' }} />
      <TransferForm
        onSubmit={async (header, lines, names) => {
          const units = lines.reduce((s, l) => s + Number(l.quantity), 0);
          const ok = await confirmAction({
            title: 'Transfer stock?',
            message: `Move ${units} units (${lines.length} ${lines.length === 1 ? 'line' : 'lines'}) from ${names.from} to ${names.to}. Stock is deducted here and added there immediately.`,
            confirmLabel: 'Transfer',
          });
          if (!ok) return;
          try {
            await create(buildTransfer(header, lines));
            router.back();
          } catch {
            // toasted by the mutation (e.g. insufficient stock); the form keeps its lines
          }
        }}
      />
    </>
  );
}
