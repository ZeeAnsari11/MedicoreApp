import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { formatDate } from '@/lib/dates';
import { radius, spacing, useTheme } from '@/theme';

import { estimateLineTotal, type SaleLine } from './sale-lines';

/** A committed sale line: product, its batch(es), Qty / Unit price / Disc / Tax and the line total, with edit and remove. */
export function LineItemCard({ line, disabled, onEdit, onRemove }: { line: SaleLine; disabled?: boolean; onEdit: () => void; onRemove: () => void }) {
  const theme = useTheme();
  const tile = (label: string, value: string) => (
    <View style={[styles.tile, { backgroundColor: theme.surfaceMuted }]}>
      <Text variant="caption" muted>{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.head}>
        <Text variant="heading" style={styles.flex} numberOfLines={2}>{line.productName}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${line.productName}`} disabled={disabled} onPress={onEdit} hitSlop={8} style={styles.icon}>
          <MaterialCommunityIcons name="pencil-outline" size={22} color={theme.textMuted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.productName}`} disabled={disabled} onPress={onRemove} hitSlop={8} style={styles.icon}>
          <MaterialCommunityIcons name="trash-can-outline" size={22} color={theme.danger} />
        </Pressable>
      </View>
      <View style={styles.chips}>
        {line.allocations ? (
          line.allocations.map((a) => (
            <View key={a.batchId} style={[styles.chip, { backgroundColor: theme.surfaceMuted }]}>
              <Text variant="caption">{a.batchNumber}{a.expiryDate ? ` · exp ${formatDate(a.expiryDate)}` : ''}{line.allocations!.length > 1 ? ` · ${a.quantity}` : ''}</Text>
            </View>
          ))
        ) : (
          <View style={[styles.chip, { backgroundColor: theme.surfaceMuted }]}>
            <Text variant="caption">Automatic batch (nearest expiry first)</Text>
          </View>
        )}
      </View>
      <View style={styles.tiles}>
        {tile('Qty', String(line.quantity))}
        {tile('Unit price', line.unitPrice.toFixed(2))}
        {tile('Disc', `${line.discountPercent ?? 0}%`)}
        {tile('Tax', `${line.taxPercent ?? 0}%`)}
      </View>
      <View style={[styles.total, { borderTopColor: theme.border }]}>
        <Text muted>Line total</Text>
        <Text variant="heading">{estimateLineTotal(line).toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { padding: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
});
