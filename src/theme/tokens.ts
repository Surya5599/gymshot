/**
 * Podshot design tokens.
 *
 * Direction: warm porcelain surfaces, soft coral accent, generous rounding,
 * heavy use of large numerals. Clean and cute - never clinical, never loud.
 * Every value here is referenced through `useTheme()`; nothing hardcodes color.
 */

export const palette = {
  light: {
    bg: '#FBF7F4',
    bgElevated: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F4EDE7',
    surfaceSunken: '#F0E8E1',

    ink: '#1F1917',
    inkSoft: '#6E615A',
    inkFaint: '#A79A91',
    inkInverse: '#FFFFFF',

    accent: '#FF7A66',
    accentSoft: '#FFE6E0',
    accentInk: '#B03D2C',

    mint: '#2FC79B',
    mintSoft: '#DDF7EE',
    lilac: '#9C8BFF',
    lilacSoft: '#EAE6FF',
    sun: '#FFB53D',
    sunSoft: '#FFF0D6',

    border: 'rgba(31, 25, 23, 0.08)',
    borderStrong: 'rgba(31, 25, 23, 0.16)',
    scrim: 'rgba(31, 25, 23, 0.45)',
    shadow: '#2B1E18',
  },
  dark: {
    bg: '#12100F',
    bgElevated: '#1B1817',
    surface: '#1B1817',
    surfaceAlt: '#242020',
    surfaceSunken: '#0C0A0A',

    ink: '#F7F2EF',
    inkSoft: '#B4A79F',
    inkFaint: '#7C6F68',
    inkInverse: '#12100F',

    accent: '#FF8A76',
    accentSoft: '#3A211C',
    accentInk: '#FFC9BE',

    mint: '#3FD9AC',
    mintSoft: '#123026',
    lilac: '#AC9CFF',
    lilacSoft: '#241F3A',
    sun: '#FFC45C',
    sunSoft: '#332510',

    border: 'rgba(247, 242, 239, 0.10)',
    borderStrong: 'rgba(247, 242, 239, 0.20)',
    scrim: 'rgba(0, 0, 0, 0.65)',
    shadow: '#000000',
  },
} as const;

export type ColorName = keyof typeof palette.light;
export type Colors = Record<ColorName, string>;

/** 4pt base scale. Use `space.n` rather than raw numbers. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 44,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  xxl: 40,
  pill: 999,
} as const;

/** Nunito - rounded terminals read as "cute" without tipping into childish. */
export const fonts = {
  regular: 'Nunito_400Regular',
  medium: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  black: 'Nunito_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: fonts.black, fontSize: 44, lineHeight: 48, letterSpacing: -1.2 },
  title: { fontFamily: fonts.black, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 17, letterSpacing: 0.2 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.3 },
  numeral: { fontFamily: fonts.black, fontSize: 56, lineHeight: 58, letterSpacing: -2 },
} as const;

/**
 * Motion. One spring for anything a finger touched (snappy, slight overshoot),
 * one for layout settling (softer), and timings for opacity-only work.
 */
export const motion = {
  springSnappy: { damping: 18, stiffness: 260, mass: 0.7 },
  springSoft: { damping: 22, stiffness: 140, mass: 1 },
  springBouncy: { damping: 11, stiffness: 190, mass: 0.8 },
  fast: 160,
  base: 240,
  slow: 420,
} as const;

/** Avatar hues, indexed by a stable hash of the user id. */
export const avatarHues = [
  ['#FFB1A0', '#FF7A66'],
  ['#9EE9CE', '#2FC79B'],
  ['#C4B8FF', '#9C8BFF'],
  ['#FFD98A', '#FFB53D'],
  ['#A8D8FF', '#4FA3F7'],
  ['#FFC0E4', '#E77BC0'],
] as const;
