import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { spacing, useTheme } from '@/theme';

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text muted>{label}</Text>
      <Text variant="label">{value ?? '—'}</Text>
    </View>
  );
}

/** Read-only account info + sign out, matching the web Settings page (it has no password change or profile edit). */
export default function SettingsScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Card>
        <Row label="Username" value={user?.username} />
        <Row label="Role" value={user?.systemRole ?? user?.tenantRole} />
        <Row label="Tenant ID" value={user?.tenantId} />
      </Card>
      <Button label="Sign out" variant="danger" onPress={() => void logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
});
