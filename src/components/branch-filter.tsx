import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

/** "Viewing: branch" filter: chips for admins with several branches, a read-only label for branch users. */
export function BranchFilter() {
  const theme = useTheme();
  const { branchId, setBranchId, showDropdown, branches, lockedBranchName } = useBranchFilter();

  if (!showDropdown) {
    return lockedBranchName ? <Text variant="caption" muted>Viewing: {lockedBranchName}</Text> : null;
  }

  const options = [{ id: null as string | null, name: 'All branches' }, ...branches.map((b) => ({ id: b.id as string | null, name: b.name }))];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const active = o.id === branchId;
        return (
          <Pressable
            key={o.id ?? 'all'}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setBranchId(o.id)}
            style={[styles.chip, { backgroundColor: active ? theme.primary : theme.surface, borderColor: active ? theme.primary : theme.border }]}
          >
            <Text variant="label" color={active ? theme.onPrimary : theme.text}>{o.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: { minHeight: TOUCH_TARGET - 8, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, justifyContent: 'center' },
});
