import { useColorScheme } from 'react-native';

const light = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2F6',
  border: '#D9E0E8',
  text: '#0F1B2D',
  textMuted: '#5B6B7F',
  primary: '#0B6E99',
  primaryPressed: '#095A7D',
  onPrimary: '#FFFFFF',
  success: '#1B7F4B',
  warning: '#B26A00',
  danger: '#C0362C',
  dangerSurface: '#FDECEA',
  overlay: 'rgba(15, 27, 45, 0.5)',
};

const dark: typeof light = {
  background: '#0C121A',
  surface: '#151D28',
  surfaceMuted: '#1C2634',
  border: '#2A3646',
  text: '#EAF0F7',
  textMuted: '#93A3B8',
  primary: '#4FB3DD',
  primaryPressed: '#7CC6E6',
  onPrimary: '#06222F',
  success: '#4CC38A',
  warning: '#E5A23A',
  danger: '#F0776D',
  dangerSurface: '#3A1D1A',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type ThemeColors = typeof light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14 } as const;
/** Minimum touch target (dp), per Android accessibility guidance. */
export const TOUCH_TARGET = 48;

export function useTheme(): ThemeColors {
  return useColorScheme() === 'dark' ? dark : light;
}
