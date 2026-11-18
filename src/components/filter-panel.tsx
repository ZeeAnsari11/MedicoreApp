import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { Text } from '@/components/ui/text';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Square icon button for the screen header (filters toggle, add). `active` adds a dot (e.g. filters applied). */
export function HeaderIconButton({ icon, label, onPress, highlighted, active, disabled }: { icon: IconName; label: string; onPress: () => void; highlighted?: boolean; active?: boolean; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, expanded: highlighted }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: highlighted || pressed ? `${theme.primary}22` : 'transparent', opacity: disabled ? 0.4 : 1 }]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={theme.primary} />
      {active ? <View style={[styles.dot, { backgroundColor: theme.primary }]} /> : null}
    </Pressable>
  );
}

/** Collapsible "Filters" box: the dropdowns go in `children`; nothing applies until "Apply Filters". */
export function FilterPanel({ children, onReset, onApply, onCollapse }: { children: ReactNode; onReset: () => void; onApply: () => void; onCollapse: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: `${theme.primary}0F`, borderColor: theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Hide filters" onPress={onCollapse} style={styles.panelHead}>
        <MaterialCommunityIcons name="filter-outline" size={20} color={theme.primary} />
        <Text variant="label" style={styles.flex}>Filters</Text>
        <MaterialCommunityIcons name="chevron-up" size={22} color={theme.textMuted} />
      </Pressable>
      {children}
      <View style={styles.panelActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Reset" onPress={onReset} style={[styles.panelButton, { borderColor: theme.primary }]}>
          <MaterialCommunityIcons name="refresh" size={18} color={theme.primary} />
          <Text variant="label" color={theme.primary}>Reset</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Apply Filters" onPress={onApply} style={[styles.panelButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
          <MaterialCommunityIcons name="check" size={18} color={theme.onPrimary} />
          <Text variant="label" color={theme.onPrimary}>Apply Filters</Text>
        </Pressable>
      </View>
    </View>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/** One filter as a dropdown row: icon, name, current choice; tapping lists the options with the current one ticked. */
/** `highlighted` marks a filter that is narrowing the list (primary, thicker border). */
export function FilterSelect({ icon, label, value, options, onChange, highlighted }: { icon: IconName; label: string; value: string; options: FilterOption[]; onChange: (value: string) => void; highlighted?: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '';
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.select, { backgroundColor: pressed ? theme.surfaceMuted : theme.surface, borderColor: highlighted ? theme.primary : theme.border, borderWidth: highlighted ? 2 : 1 }]}
      >
        <MaterialCommunityIcons name={icon} size={22} color={theme.text} />
        <View style={styles.flex}>
          <Text variant="label">{label}</Text>
          <Text variant="caption" muted numberOfLines={1}>{current}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-down" size={22} color={theme.textMuted} />
      </Pressable>
      <ActionSheet
        title={label}
        onClose={() => setOpen(false)}
        actions={open ? options.map((o) => ({ label: o.label, checked: o.value === value, onPress: () => onChange(o.value) })) : null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  iconButton: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4 },
  panel: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  panelActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  panelButton: { flex: 1, minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md },
  select: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TOUCH_TARGET, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderRadius: radius.md },
});
