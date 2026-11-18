import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { Badge } from './badge';
import { Text } from './text';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Tile colors for list avatars; picked per item so a row keeps its color between renders. */
const TILE_COLORS = ['#2563EB', '#15803D', '#7C3AED', '#C2410C', '#0F766E'];

/** Stable index for `seed` (an id): the same item always gets the same icon and color. */
export function pickBySeed<T>(seed: string, options: readonly T[]): T {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return options[n % options.length];
}

interface Props {
  title: string;
  /** Shown after `subtitleIcon` (a map pin by default), e.g. "Main Branch · Pakistan". */
  subtitle?: string;
  subtitleIcon?: IconName;
  /** Highlights the subtitle (e.g. an expiry warning); muted by default. */
  subtitleColor?: string;
  /** Optional extra line under the subtitle (e.g. prices). */
  detail?: string;
  icon: IconName;
  /** Usually the item id: chooses the tile color. */
  seed: string;
  status?: { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' };
  /** Shown before the chevron (e.g. a quantity). */
  trailing?: ReactNode;
  onPress: () => void;
}

/** List item: colored icon tile, title with a status pill, location line and a chevron (opens the item's actions). */
export function ListRow({ title, subtitle, subtitleIcon = 'map-marker-outline', subtitleColor, detail, icon, seed, status, trailing, onPress }: Props) {
  const theme = useTheme();
  const tint = pickBySeed(seed, TILE_COLORS);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.surfaceMuted : theme.surface, borderBottomColor: theme.border }]}
    >
      <View style={[styles.tile, { backgroundColor: `${tint}1F` }]}>
        <MaterialCommunityIcons name={icon} size={26} color={tint} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text variant="label" numberOfLines={1} style={styles.title}>{title}</Text>
          {status ? <Badge label={status.label} tone={status.tone} variant="soft" /> : null}
        </View>
        {subtitle ? (
          <View style={styles.subtitleLine}>
            <MaterialCommunityIcons name={subtitleIcon} size={14} color={subtitleColor ?? theme.textMuted} />
            <Text variant="caption" muted color={subtitleColor} numberOfLines={1} style={styles.title}>{subtitle}</Text>
          </View>
        ) : null}
        {detail ? <Text variant="caption" muted numberOfLines={1}>{detail}</Text> : null}
      </View>
      {trailing}
      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TOUCH_TARGET, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  tile: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: spacing.xs },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flexShrink: 1 },
  subtitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
