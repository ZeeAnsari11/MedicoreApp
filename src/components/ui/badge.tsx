import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { Text } from './text';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** `soft`: a filled, rounded pill (list rows); `outline` (default): bordered tag. An optional icon sits before the label. */
export function Badge({ label, tone = 'neutral', variant = 'outline', icon }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger'; variant?: 'outline' | 'soft'; icon?: IconName }) {
  const theme = useTheme();
  const color = tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : tone === 'danger' ? theme.danger : theme.textMuted;
  const look = variant === 'soft' ? [styles.soft, { backgroundColor: `${color}1F` }] : [styles.badge, { borderColor: color }];
  return (
    <View style={[look, styles.inner]}>
      {icon ? <MaterialCommunityIcons name={icon} size={13} color={color} /> : null}
      <Text variant="caption" color={color}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  soft: { borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 3, alignSelf: 'center' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
