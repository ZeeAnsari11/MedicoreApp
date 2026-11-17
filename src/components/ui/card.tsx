import { StyleSheet, View, type ViewProps } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return <View {...rest} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]} />;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
});
