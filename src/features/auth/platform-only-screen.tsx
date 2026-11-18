import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { spacing, useTheme } from '@/theme';

/**
 * Shown instead of the pharmacy app to the platform super admin. On the web that account only ever sees the Platform
 * area (tenants, subscriptions, plans, settings); its own organization has no pharmacy data. The Platform module is
 * not built on Android yet (docs/FEATURE_PARITY.md), so the app offers sign-out only.
 */
export function PlatformOnlyScreen({ username, onSignOut }: { username?: string; onSignOut: () => void }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text variant="title">Platform administration</Text>
        <Text muted>
          {username ? `${username} is the platform super admin account.` : 'This is the platform super admin account.'} Managing
          tenants, subscriptions and plans is only available in the web app for now.
        </Text>
        <Text muted>To use pharmacy features (sales, purchases, inventory, accounting), sign in with a pharmacy account.</Text>
        <Button label="Sign out" variant="secondary" onPress={onSignOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
});
