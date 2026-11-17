import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { spacing } from '@/theme';

import { money } from './ssr-columns';
import { karachiDateLabel } from './ssr-dates';
import { useSsrInvoices, type SsrParams } from './use-ssr';

/** Web `SsrDrilldown`: the invoices behind one product row, for the same filters (no view, sort or search). */
export function SsrDrilldown({ product, params, onClose }: { product: { id: string; label: string } | null; params: SsrParams; onClose: () => void }) {
  const { invoices, isLoading, error, refetch } = useSsrInvoices(product?.id ?? null, params);
  if (!product) return null;
  return (
    <FormModal visible title={`Invoices: ${product.label}`} onClose={onClose}>
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : invoices.length === 0 ? (
        <View style={styles.pad}><Text muted>No invoices for these filters.</Text></View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.pad}
          renderItem={({ item: i }) => (
            <Card>
              <View style={styles.row}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open ${i.invoiceNumber}`} onPress={() => { onClose(); router.push({ pathname: '/sales/detail', params: { id: i.id } } as never); }}>
                  <Text variant="label" color="#2563EB">{i.invoiceNumber}</Text>
                </Pressable>
                {i.voided ? <Badge label="Voided" tone="warning" /> : null}
              </View>
              <Text muted>{karachiDateLabel(i.date)} · {i.customerName}</Text>
              <Text muted>Batch: {i.batches.length ? i.batches.map((b) => `${b.batchNumber} (${b.quantity})`).join(', ') : '-'}</Text>
              <View style={styles.row}>
                <Text>Units {i.unitsSold} · Value {money(i.value)}</Text>
                <Text muted>Returned {i.unitsReturned ? `${i.unitsReturned} (${money(i.returnsValue)})` : '-'}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </FormModal>
  );
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
