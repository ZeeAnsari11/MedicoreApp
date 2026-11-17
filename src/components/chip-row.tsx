import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/** Single-select filter chips (the web's status Select / preset buttons). */
export function ChipRow<T extends string>({ label, options, value, onChange }: { label?: string; options: ChipOption<T>[]; value: T; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel={label}>
      {label ? <Text variant="caption" muted style={styles.label}>{label}:</Text> : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityLabel={`${label ? `${label}: ` : ''}${o.label}`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, { backgroundColor: active ? theme.primary : theme.surface, borderColor: active ? theme.primary : theme.border }]}
          >
            <Text variant="caption" color={active ? theme.onPrimary : theme.text}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.xs },
  label: { marginRight: spacing.xs },
  chip: { minHeight: TOUCH_TARGET - 8, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, justifyContent: 'center' },
});
