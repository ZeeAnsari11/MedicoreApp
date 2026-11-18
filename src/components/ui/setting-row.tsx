import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { Text } from './text';

/**
 * One row of a details card: small label, bold value and a chevron (tap to change), or a lock with `lockedLabel`
 * when the value can't be changed (e.g. a branch user's branch).
 */
export function SettingRow({ label, value, placeholder, onPress, locked, lockedLabel = 'Fixed', last }: { label: string; value?: string; placeholder?: string; onPress?: () => void; locked?: boolean; lockedLabel?: string; last?: boolean }) {
  const theme = useTheme();
  const interactive = !!onPress && !locked;
  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : 'text'}
      accessibilityLabel={`${label}: ${value || placeholder || ''}`}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, backgroundColor: locked ? theme.surfaceMuted : pressed ? theme.surfaceMuted : 'transparent' },
      ]}
    >
      <View style={styles.flex}>
        <Text variant="caption" muted>{label}</Text>
        <Text variant="label" color={value ? theme.text : theme.textMuted} numberOfLines={1}>{value || placeholder}</Text>
      </View>
      {locked ? (
        <View style={styles.lock}>
          <MaterialCommunityIcons name="lock-outline" size={14} color={theme.textMuted} />
          <Text variant="caption" muted>{lockedLabel}</Text>
        </View>
      ) : interactive ? (
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TOUCH_TARGET + 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
