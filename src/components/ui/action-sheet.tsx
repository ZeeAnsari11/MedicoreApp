import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { Text } from './text';

export interface SheetAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Marks the current choice when the sheet is used as a picker. */
  checked?: boolean;
}

/** Bottom sheet listing a row's actions (the phone version of the web table's row-actions menu). */
export function ActionSheet({ title, subtitle, actions, onClose }: { title?: string; subtitle?: string; actions: SheetAction[] | null; onClose: () => void }) {
  const theme = useTheme();
  return (
    <Modal visible={!!actions} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close actions" style={styles.backdrop} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.surface }]}>
        {title ? <Text variant="heading" numberOfLines={1}>{title}</Text> : null}
        {subtitle ? <Text variant="caption" muted>{subtitle}</Text> : null}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.actions}>
          {(actions ?? []).map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityState={{ disabled: !!a.disabled, selected: !!a.checked }}
              disabled={a.disabled}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [styles.action, { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceMuted : theme.surface, opacity: a.disabled ? 0.45 : 1 }]}
            >
              <Text variant="label" color={a.destructive ? theme.danger : a.checked ? theme.primary : theme.text} style={styles.flex}>{a.label}</Text>
              {a.checked ? <MaterialCommunityIcons name="check" size={20} color={theme.primary} /> : null}
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={[styles.action, styles.cancel]}>
            <Text variant="label" muted>Cancel</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { padding: spacing.lg, gap: spacing.xs, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  flex: { flex: 1 },
  // Long option lists (e.g. every vendor) scroll instead of running off the screen.
  scroll: { maxHeight: 420, marginTop: spacing.md },
  actions: { gap: spacing.sm },
  action: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, borderWidth: 1, borderRadius: radius.md },
  cancel: { borderWidth: 0, justifyContent: 'center' },
});
