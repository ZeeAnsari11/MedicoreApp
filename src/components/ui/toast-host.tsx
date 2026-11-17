import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/store/toast';
import { radius, spacing, useTheme } from '@/theme';

import { Text } from './text';

/** Mounted once at the root; shows the toasts raised by `toast.success/error`. */
export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + spacing.xl }]}>
      {toasts.map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole="alert"
          onPress={() => dismiss(t.id)}
          style={[styles.toast, { backgroundColor: t.kind === 'error' ? theme.danger : theme.success }]}
        >
          <Text variant="label" color="#FFFFFF">{t.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.lg, right: spacing.lg, gap: spacing.sm },
  toast: { borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
});
