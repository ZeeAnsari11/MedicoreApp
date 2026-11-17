import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useBranches } from '@/features/branches/use-branches';
import { useDocumentFile } from '@/features/documents/use-document-file';
import { useStockTransfer } from '@/features/transfers/use-transfers';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { spacing, useTheme } from '@/theme';

export default function TransferDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transfer, isLoading, error, refetch } = useStockTransfer(id ?? null);
  const { branches } = useBranches();
  const doc = useDocumentFile();
  const branchName = (bid: string) => branches.find((b) => b.id === bid)?.name ?? '—';

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!transfer) return <EmptyState title="Transfer not found" />;

  const slip = { path: `/inventory/transfers/${id}/pdf`, fileName: `${transfer.transferNumber}.pdf`, dialogTitle: `Transfer ${transfer.transferNumber}` };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: transfer.transferNumber }} />
      <Card>
        <Text variant="heading">{transfer.transferNumber}</Text>
        <Text muted>Date: {formatDate(transfer.createdAt)}</Text>
        <Text>From: {branchName(transfer.branchId)}</Text>
        <Text>To: {branchName(transfer.toBranchId)}</Text>
        {transfer.note ? <Text muted>Note: {transfer.note}</Text> : null}
      </Card>
      <Text variant="heading">Lines</Text>
      {transfer.lines.map((l) => (
        <Card key={`${l.batchId}-${l.batchNumber}`}>
          <View style={styles.between}>
            <Text variant="label" style={styles.flex}>{l.productName}</Text>
            <Text variant="heading">{l.quantity}</Text>
          </View>
          <Text muted>Batch {l.batchNumber} · expires {formatDate(l.expiryDate)}</Text>
          <Text muted>Unit cost {formatRs(l.unitCost)}</Text>
        </Card>
      ))}
      <Button label="Share transfer slip PDF" loading={doc.isBusy} onPress={() => void doc.share(slip)} />
      <Button label="Print transfer slip" variant="secondary" disabled={doc.isBusy} onPress={() => void doc.print(slip)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
