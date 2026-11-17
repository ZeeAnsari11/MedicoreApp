import { Text as RNText, type TextProps } from 'react-native';

import { useTheme } from '@/theme';

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption';

const variants = {
  title: { fontSize: 24, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const;

interface Props extends TextProps {
  variant?: Variant;
  muted?: boolean;
  color?: string;
}

export function Text({ variant = 'body', muted, color, style, ...rest }: Props) {
  const theme = useTheme();
  return <RNText {...rest} style={[variants[variant], { color: color ?? (muted ? theme.textMuted : theme.text) }, style]} />;
}
