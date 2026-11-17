import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { navSections } from '@/navigation/nav-config';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

export default function MoreScreen() {
  const theme = useTheme();
  const { has, hasAny, isAdmin } = useAuth();
  // Same rule as the web sidebar: hide an item unless the user holds one of its :read permissions.
  const sections = navSections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.anyOf || isAdmin || hasAny(...i.anyOf)) }))
    // The dashboard is its own tab, so it isn't repeated here.
    .map((s) => ({ ...s, items: s.items.filter((i) => i.href !== '/') }))
    .filter((s) => s.items.length > 0);
  void has;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text variant="label" muted>{section.title.toUpperCase()}</Text>
          {section.items.map((item) => (
            <Link key={item.href} href={item.href as never} asChild>
              <Pressable accessibilityRole="button" style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <MaterialCommunityIcons name={item.icon} size={22} color={theme.primary} />
                <Text>{item.label}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TOUCH_TARGET, paddingHorizontal: spacing.lg, borderWidth: 1, borderRadius: radius.md },
});
