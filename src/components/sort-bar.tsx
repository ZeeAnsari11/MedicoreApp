import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import type { SortDir } from '@/lib/use-client-list';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

export function SortBar({ options, sortKey, dir, onSort }: { options: { key: string; label: string }[]; sortKey: string; dir: SortDir; onSort: (key: string) => void }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Text variant="caption" muted style={styles.label}>Sort:</Text>
      {options.map((o) => {
        const active = o.key === sortKey;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${o.label}${active ? (dir === 'asc' ? ', ascending' : ', descending') : ''}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSort(o.key)}
            style={[styles.chip, { backgroundColor: active ? theme.primary : theme.surface, borderColor: active ? theme.primary : theme.border }]}
          >
            <Text variant="caption" color={active ? theme.onPrimary : theme.text}>{o.label}{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, alignItems: 'center' },
  label: { marginRight: spacing.xs },
  chip: { minHeight: TOUCH_TARGET - 12, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, justifyContent: 'center' },
});
