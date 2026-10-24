/**
 * BODYLOG design tokens. Single source of truth — see docs/DESIGN_SYSTEM.md.
 * Components must use these tokens instead of hard-coded values.
 */
import type { TextStyle } from 'react-native';

export type ColorTokens = {
  /** Screen background */
  background: string;
  /** Grouped background (behind cards) */
  backgroundGrouped: string;
  /** Card / sheet surface */
  surface: string;
  /** Pressed / secondary fill (segmented control track, search field) */
  fill: string;
  /** Selected segment on top of `fill` */
  fillSelected: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  separator: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  dangerSoft: string;
  protein: string;
  fat: string;
  carbohydrate: string;
  track: string;
  skeleton: string;
  tabBar: string;
};

export const lightColors: ColorTokens = {
  background: '#FFFFFF',
  backgroundGrouped: '#F5F6F5',
  surface: '#FFFFFF',
  fill: '#EEF0EF',
  fillSelected: '#FFFFFF',
  text: '#1D201F',
  textSecondary: '#5F6663',
  textTertiary: '#8C9390',
  separator: '#E3E6E4',
  accent: '#2E7A58',
  accentPressed: '#25644A',
  accentSoft: '#E5F1EB',
  onAccent: '#FFFFFF',
  success: '#2E8F62',
  warning: '#B7791F',
  danger: '#C9372C',
  dangerSoft: '#FBEAE8',
  protein: '#3F7CC4',
  fat: '#D08A1E',
  carbohydrate: '#8A68C8',
  track: '#E9ECEA',
  skeleton: '#ECEFED',
  tabBar: '#FFFFFF',
};

export const darkColors: ColorTokens = {
  background: '#0F1110',
  backgroundGrouped: '#0F1110',
  surface: '#1A1D1C',
  fill: '#252927',
  fillSelected: '#3B413E',
  text: '#F1F3F2',
  textSecondary: '#A6ADAA',
  textTertiary: '#737A77',
  separator: '#2B302E',
  accent: '#5BBE8E',
  accentPressed: '#4CA67B',
  accentSoft: '#1D3329',
  onAccent: '#0B1A13',
  success: '#5BBE8E',
  warning: '#E0A847',
  danger: '#F26D62',
  dangerSoft: '#3A1E1C',
  protein: '#6FA3E3',
  fat: '#E8AC4E',
  carbohydrate: '#AA8CE3',
  track: '#2A2F2D',
  skeleton: '#232725',
  tabBar: '#151817',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Minimum tap target (Apple HIG 44pt / Material 48dp → use 48). */
export const MIN_TAP = 48;

/** Screen side padding. */
export const SCREEN_PADDING = spacing.lg;

/**
 * Type scale based on iOS Dynamic Type "Large" defaults. System fonts only
 * (SF Pro / Hiragino on iOS, Roboto / Noto Sans CJK on Android) for speed and Dynamic Type.
 * Japanese text gets a slightly larger line height for readability.
 */
export const typography = {
  largeTitle: { fontSize: 32, lineHeight: 40, fontWeight: '700', letterSpacing: 0.2 },
  title1: { fontSize: 26, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 21, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 19, lineHeight: 26, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 26, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** Big numeric display (calorie ring, weight) */
  display: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -0.5 },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export const motion = {
  /** Standard duration for small UI transitions (ms). */
  fast: 160,
  normal: 240,
  slow: 600,
  pressScale: 0.97,
} as const;
