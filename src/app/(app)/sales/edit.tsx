import { useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SaleForm } from '@/features/sales/sale-form';
import { useSale } from '@/features/sales/use-sales';

export default function EditSaleScreen() {
  const { id, branchId } = useLocalSearchParams<{ id: string; branchId?: string }>();
  const { sale, isLoading, error, refetch } = useSale(id, branchId ?? null);
  if (isLoading) return <LoadingState />;
  if (error && !sale) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!sale) return <EmptyState title="Sale not found" />;
  // The server decides editability (paid / returned / voided); the form is never offered for a locked invoice.
  if (sale.isEditable === false) return <EmptyState title="This invoice can't be edited" message={sale.lockReason ?? 'It has payments or returns.'} />;
  return <SaleForm editSale={sale} />;
}
