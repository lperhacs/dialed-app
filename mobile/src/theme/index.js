export const darkColors = {
  bg:             '#0c0c0e',
  bgCard:         '#111113',
  bgHover:        '#17171a',
  bgInput:        '#0f0f12',
  border:         '#252528',
  borderSubtle:   '#1a1a1d',
  text:           '#eeeeef',
  textMuted:      '#65656e',
  textSecondary:  '#8a8a94',
  textDim:        '#38383f',
  accent:         '#34d399',
  accentHover:    '#10b981',
  accentDim:      'rgba(52,211,153,0.08)',
  accentDimBorder:'rgba(52,211,153,0.20)',
  green:          '#34d399',
  greenDim:       'rgba(52,211,153,0.08)',
  red:            '#f87171',
  redDim:         'rgba(248,113,113,0.08)',
  blue:           '#60a5fa',
  purple:         '#a78bfa',
  gold:           '#d4a853',
  silver:         '#8a9ab5',
  bronze:         '#b07040',
};

export const lightColors = {
  bg:             '#fafafa',
  bgCard:         '#ffffff',
  bgHover:        '#f2f2f4',
  bgInput:        '#f5f5f7',
  border:         '#e0e0e4',
  borderSubtle:   '#ebebee',
  text:           '#111113',
  textMuted:      '#6b6b74',
  textSecondary:  '#8a8a94',
  textDim:        '#b0b0ba',
  accent:         '#10b981',
  accentHover:    '#059669',
  accentDim:      'rgba(16,185,129,0.08)',
  accentDimBorder:'rgba(16,185,129,0.20)',
  green:          '#10b981',
  greenDim:       'rgba(16,185,129,0.08)',
  red:            '#ef4444',
  redDim:         'rgba(239,68,68,0.08)',
  blue:           '#3b82f6',
  purple:         '#8b5cf6',
  gold:           '#b8912a',
  silver:         '#6b7a8d',
  bronze:         '#8a5230',
};

// Fallback export — components should use useTheme() instead
export const colors = darkColors;

export const radius = {
  xs:   3,
  sm:   6,
  md:   10,
  lg:   14,
  xl:   18,
  full: 999,
  pill: 999,
};

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
};

// Base URL for the backend.
// In production builds, set EXPO_PUBLIC_API_URL in your EAS environment.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export function makeNavTheme(c, isDark) {
  return {
    dark: isDark,
    colors: {
      background:   c.bg,
      card:         c.bg,
      text:         c.text,
      border:       c.borderSubtle,
      notification: c.accent,
      primary:      c.accent,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium:  { fontFamily: 'System', fontWeight: '500' },
      bold:    { fontFamily: 'System', fontWeight: '600' },
      heavy:   { fontFamily: 'System', fontWeight: '700' },
    },
  };
}

// Legacy export for NavigationContainer default (dark)
export const navTheme = makeNavTheme(darkColors, true);
