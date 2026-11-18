import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { Text } from './text';

/** A row of mutually exclusive options (e.g. Unpaid / Partial / Paid). Each option is labelled "<label>: <option>". */
export function SegmentedControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Text variant="label" muted>{label}</Text>
      <View style={[styles.track, { backgroundColor: theme.surfaceMuted }]}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${o.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(o.value)}
              style={[styles.segment, active ? [styles.active, { backgroundColor: theme.surface }] : null]}
            >
              <Text variant="label" color={active ? theme.text : theme.textMuted}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  track: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: TOUCH_TARGET - 4, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  active: { elevation: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
});
