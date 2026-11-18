import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, useTheme } from '@/theme';

import { Text } from './text';

/** Sticky footer of a form screen: an optional caption + amount on the left, the action button(s) on the right. */
export function BottomBar({ caption, amount, children }: { caption?: string; amount?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['bottom']} style={[styles.bar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      {caption ? (
        <View style={styles.amount}>
          <Text variant="caption" muted>{caption}</Text>
          <Text variant="title" numberOfLines={1} adjustsFontSizeToFit>{amount}</Text>
        </View>
      ) : null}
      <View style={[styles.actions, caption ? null : styles.full]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  amount: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm, flexShrink: 0 },
  full: { flex: 1 },
});
