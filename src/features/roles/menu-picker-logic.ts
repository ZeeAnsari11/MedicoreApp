/**
 * Port of the web `menu-picker.tsx` rules. A ticked menu = every action key of the module (`module:action`); a menu is
 * "on" when its `:read` key is held. The Accounting parent toggles its sub-pages too. The server normalizes the saved
 * keys, so this only decides what gets sent.
 */
import type { PermissionModuleDef } from '@/types/medicore';

export const keysOf = (m: PermissionModuleDef) => m.actions.map((a) => `${m.key}:${a.key}`);

export const isMenuOn = (m: PermissionModuleDef, selected: ReadonlySet<string>) => selected.has(`${m.key}:read`);

export const allMenusOn = (modules: readonly PermissionModuleDef[], selected: ReadonlySet<string>) =>
  modules.length > 0 && modules.every((m) => isMenuOn(m, selected));

export function setMenus(selected: readonly string[], targets: readonly PermissionModuleDef[], checked: boolean): string[] {
  const next = new Set(selected);
  for (const m of targets) {
    for (const k of keysOf(m)) {
      if (checked) next.add(k);
      else next.delete(k);
    }
  }
  return [...next];
}

/** Ticking a parent also ticks its children; a child toggles only itself. */
export const toggleMenu = (selected: readonly string[], modules: readonly PermissionModuleDef[], m: PermissionModuleDef, checked: boolean) =>
  setMenus(selected, m.parent ? [m] : modules.filter((x) => x.key === m.key || x.parent === m.key), checked);

export const menuGroups = (modules: readonly PermissionModuleDef[]) =>
  modules.reduce<string[]>((acc, m) => (acc.includes(m.group) ? acc : [...acc, m.group]), []);

/** The roles list shows "N module(s)": the web counts ticked keys, not menus. */
export const moduleCount = (allowedModules: readonly string[]) => allowedModules.length;
