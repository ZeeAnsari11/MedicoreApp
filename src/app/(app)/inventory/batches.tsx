import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useProductBatches } from '@/features/inventory/use-inventory';
import { expiryStatus, formatDate } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { formatRs } from '@/lib/format';

/** Batch details for one product at one branch (web: BatchDetailDialog). Emptied batches are not listed, like the web. */
export default function BatchesScreen() {
  const theme = useTheme();
  const { has } = useAuth();
  const { productId, productName, branchId } = useLocalSearchParams<{ productId: string; productName?: string; branchId?: string }>();
  const { batches: all, isLoading, error, refetch } = useProductBatches(productId ?? null, branchId || null);
  const [refreshing, setRefreshing] = useState(false);
  const batches = all.filter((b) => b.quantity > 0);

  if (isLoading) return <LoadingState />;
  if (error && all.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={batches}
      keyExtractor={(b) => b.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
      ListHeaderComponent={<Stack.Screen options={{ title: productName ? `Batches — ${productName}` : 'Batches' }} />}
      ListEmptyComponent={<EmptyState title="No batches on hand" message="No stock is held for this product at this branch." />}
      renderItem={({ item }) => {
        const status = expiryStatus(item.expiryDate);
        return (
          <Card>
            <View style={styles.between}>
              <Text variant="heading">{item.batchNumber}</Text>
              <Badge label={status.label} tone={status.tone === 'success' ? 'success' : status.tone} />
            </View>
            <Text muted>Expiry: {formatDate(item.expiryDate)}</Text>
            <Text>Quantity: {item.quantity}</Text>
            <Text muted>Purchase price: {item.purchasePrice != null ? formatRs(item.purchasePrice) : '—'}</Text>
            <Text muted>Sale price: {item.sellingPrice != null ? formatRs(item.sellingPrice) : '—'}</Text>
            {has('inventory:adjust') ? (
              <Button
                label="Adjust this batch"
                variant="secondary"
                onPress={() => router.push({ pathname: '/inventory/adjust', params: { productId: item.productId, branchId: item.branchId, batchNumber: item.batchNumber, expiryDate: item.expiryDate } } as never)}
              />
            ) : null}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
