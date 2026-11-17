import { StyleSheet, View } from 'react-native';

import { SwitchRow } from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { radius, spacing, useTheme } from '@/theme';
import type { PermissionModuleDef } from '@/types/medicore';

import { allMenusOn, isMenuOn, menuGroups, setMenus, toggleMenu } from './menu-picker-logic';

/** Port of the web MenuPicker: one switch per menu grouped by section, sub-pages indented, plus "Select all menus". */
export function MenuPicker({ modules, value, onChange }: { modules: readonly PermissionModuleDef[]; value: string[]; onChange: (keys: string[]) => void }) {
  const theme = useTheme();
  const selected = new Set(value);

  return (
    <View style={styles.wrap}>
      <SwitchRow label="Select all menus" value={allMenusOn(modules, selected)} onValueChange={(c) => onChange(setMenus(value, modules, c))} />
      <View style={[styles.box, { borderColor: theme.border }]}>
        {menuGroups(modules).map((group) => (
          <View key={group} style={styles.group}>
            <Text variant="caption" muted style={styles.groupTitle}>{group.toUpperCase()}</Text>
            {modules
              .filter((m) => m.group === group)
              .map((m) => (
                <View key={m.key} style={m.parent ? styles.child : undefined}>
                  <SwitchRow label={m.label} value={isMenuOn(m, selected)} onValueChange={(c) => onChange(toggleMenu(value, modules, m, c))} />
                </View>
              ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  box: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  group: { gap: spacing.xs },
  groupTitle: { letterSpacing: 0.6 },
  child: { paddingLeft: spacing.lg },
});
