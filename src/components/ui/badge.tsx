import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { Text } from './text';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const theme = useTheme();
  const color = tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : tone === 'danger' ? theme.danger : theme.textMuted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text variant="caption" color={color}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
});
