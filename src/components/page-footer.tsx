import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { spacing, TOUCH_TARGET, useTheme } from '@/theme';

/** "‹ Previous · Page x of y · Next ›" under a server-paged list, with the total count. */
export function PageFooter({ page, pageCount, total, noun, busy, onPrevious, onNext }: { page: number; pageCount: number; total: number; noun: string; busy?: boolean; onPrevious: () => void; onNext: () => void }) {
  const theme = useTheme();
  const prevDisabled = page <= 1 || !!busy;
  const nextDisabled = page >= pageCount || !!busy;
  const button = (label: string, disabled: boolean, onPress: () => void, side: 'left' | 'right') => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { borderColor: theme.border, backgroundColor: theme.surface, opacity: disabled ? 0.45 : 1 }]}
    >
      {side === 'left' ? <MaterialCommunityIcons name="chevron-left" size={20} color={theme.primary} /> : null}
      <Text variant="label" color={theme.primary}>{label}</Text>
      {side === 'right' ? <MaterialCommunityIcons name="chevron-right" size={20} color={theme.primary} /> : null}
    </Pressable>
  );
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {button('Previous', prevDisabled, onPrevious, 'left')}
        <Text variant="label" style={styles.page}>Page {page} of {pageCount}</Text>
        {button('Next', nextDisabled, onNext, 'right')}
      </View>
      <Text variant="caption" muted style={styles.center}>{total} {noun}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: { flex: 1, minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: 999 },
  page: { textAlign: 'center', minWidth: 96 },
  center: { textAlign: 'center' },
});
