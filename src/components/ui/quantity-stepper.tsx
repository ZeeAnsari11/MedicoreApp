import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { parseNumber } from '@/lib/numbers';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { Text } from './text';

/** "− [n] +" quantity field; the number can also be typed. − stops at 1. */
export function QuantityStepper({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: boolean }) {
  const theme = useTheme();
  const n = parseNumber(value) ?? 0;
  const step = (delta: number) => onChange(String(Math.max(1, Math.floor(n) + delta)));
  const button = (icon: 'minus' | 'plus', a11y: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { borderColor: theme.border, backgroundColor: theme.surface, opacity: disabled ? 0.4 : 1 }]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={theme.text} />
    </Pressable>
  );
  return (
    <View style={styles.wrap}>
      <Text variant="label" muted>{label}</Text>
      <View style={styles.row}>
        {button('minus', 'Decrease quantity', () => step(-1), n <= 1)}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border }]}
        />
        {button('plus', 'Increase quantity', () => step(1))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: { width: TOUCH_TARGET + 4, height: TOUCH_TARGET + 4, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: TOUCH_TARGET + 4, borderWidth: 1, borderRadius: radius.md, textAlign: 'center', fontSize: 18, fontWeight: '600' },
});
