import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { spacing, useTheme } from '@/theme';

import { Button } from './button';
import { Text } from './text';

export function LoadingState() {
  const theme = useTheme();
  return (
    <View style={styles.center} accessibilityLabel="Loading">
      <ActivityIndicator color={theme.primary} size="large" />
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text variant="heading">Couldn&apos;t load this</Text>
      <Text muted style={styles.text}>{errorMessage(error)}</Text>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.center}>
      <Text variant="heading">{title}</Text>
      {message ? <Text muted style={styles.text}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  text: { textAlign: 'center' },
});
