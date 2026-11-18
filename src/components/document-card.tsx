import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { formatRs } from '@/lib/format';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Tone = 'neutral' | 'success' | 'warning' | 'danger';
export interface Pill {
  label: string;
  tone: Tone;
  icon?: IconName;
}

interface Props {
  icon: IconName;
  /** Document number, e.g. the PO or invoice number. */
  number: string;
  status?: Pill;
  /** Party and branch, e.g. "Demo Distributor · Main Branch". */
  party: string;
  date: string;
  itemCount: number;
  /** Optional extra line (e.g. the order booker). */
  meta?: string;
  total: number;
  /** Optional labelled amounts under the total (e.g. return, net, paid, remaining). */
  amounts?: { label: string; value: number }[];
  pills: Pill[];
  onOpen: () => void;
}

/** Purchase / sale list card: number and status, party, date and item count, total, payment pills and View Details. */
export function DocumentCard({ icon, number, status, party, date, itemCount, meta, total, amounts, pills, onOpen }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${number}`} onPress={onOpen} style={styles.top}>
        <View style={[styles.tile, { backgroundColor: `${theme.primary}1A` }]}>
          <MaterialCommunityIcons name={icon} size={28} color={theme.primary} />
        </View>
        <View style={styles.body}>
          <View style={styles.titleLine}>
            <Text variant="heading" numberOfLines={1} style={styles.shrink}>{number}</Text>
            {status ? <Badge label={status.label} tone={status.tone} icon={status.icon} variant="soft" /> : null}
          </View>
          <Text muted numberOfLines={1}>{party}</Text>
          <View style={styles.dateLine}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={15} color={theme.textMuted} />
            <Text variant="caption" muted>{date} • {itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
          </View>
          {meta ? <Text variant="caption" muted numberOfLines={1}>{meta}</Text> : null}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textMuted} />
      </Pressable>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <View style={styles.totalLine}>
        <Text muted>Total</Text>
        <Text variant="heading">{formatRs(total)}</Text>
      </View>
      {amounts?.map((a) => (
        <View key={a.label} style={styles.totalLine}>
          <Text muted>{a.label}</Text>
          <Text>{formatRs(a.value)}</Text>
        </View>
      ))}
      {pills.length ? (
        <View style={styles.pills}>
          {pills.map((p) => <Badge key={p.label} label={p.label} tone={p.tone} icon={p.icon} variant="soft" />)}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View details"
        onPress={onOpen}
        style={({ pressed }) => [styles.details, { borderColor: theme.primary, backgroundColor: pressed ? `${theme.primary}14` : 'transparent' }]}
      >
        <MaterialCommunityIcons name="eye-outline" size={18} color={theme.primary} />
        <Text variant="label" color={theme.primary}>View Details</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shrink: { flexShrink: 1 },
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  totalLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  details: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, marginTop: spacing.xs },
});
