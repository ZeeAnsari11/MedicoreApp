import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { Text } from './text';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}

/** While `loading` the button is inert, which is the duplicate-submission guard for every write action. */
export function Button({ label, onPress, variant = 'primary', loading, disabled }: Props) {
  const theme = useTheme();
  const inert = disabled || loading;
  const bg = variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : theme.surface;
  const fg = variant === 'secondary' ? theme.text : variant === 'primary' ? theme.onPrimary : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? theme.border : bg, opacity: inert ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text variant="label" color={fg} style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 15 },
});
