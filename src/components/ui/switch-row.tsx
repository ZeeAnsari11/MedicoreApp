import { StyleSheet, Switch, View } from 'react-native';

import { spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { Text } from './text';

export function SwitchRow({ label, value, onValueChange, disabled }: { label: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: theme.primary, false: theme.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH_TARGET, gap: spacing.md },
  label: { flex: 1 },
});
