/**
 * GymShot design tokens.
 *
 * Direction: soft neo-brutalism - a pale sage field, dusty rose accent,
 * muted mint, near-black ink, and firm outlines. Matches the web app's theme
 * so both clients read as one product. Every value here is referenced through
 * `useTheme()`; nothing hardcodes color.
 */

export const palette = {
  light: {
    bg: '#ECF0E2',
    bgElevated: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F7F9F0',
    surfaceSunken: '#E2E7D6',

    ink: '#17161A',
    inkSoft: '#5B6053',
    inkFaint: '#979C8B',
    inkInverse: '#FFFCF7',

    accent: '#CC9A8D',
    accentSoft: '#EBD1C9',
    accentInk: '#8C5B4D',

    mint: '#7FA890',
    mintSoft: '#DEE9E0',
    lilac: '#A9A4C6',
    lilacSoft: '#E8E6F1',
    sun: '#D9B36A',
    sunSoft: '#F3EAD3',

    border: 'rgba(23, 22, 26, 0.22)',
    borderStrong: 'rgba(23, 22, 26, 0.55)',
    scrim: 'rgba(23, 22, 26, 0.45)',
    shadow: '#17161A',
  },
  dark: {
    bg: '#171912',
    bgElevated: '#22251C',
    surface: '#22251C',
    surfaceAlt: '#1C1F16',
    surfaceSunken: '#101208',

    ink: '#F1EFE4',
    inkSoft: '#B9BCAB',
    inkFaint: '#7E816F',
    inkInverse: '#17161A',

    accent: '#D3A395',
    accentSoft: '#4A332C',
    accentInk: '#ECC9BC',

    mint: '#85B598',
    mintSoft: '#1E2E24',
    lilac: '#AFAACD',
    lilacSoft: '#252336',
    sun: '#DFC084',
    sunSoft: '#33290F',

    border: 'rgba(241, 239, 228, 0.18)',
    borderStrong: 'rgba(241, 239, 228, 0.40)',
    scrim: 'rgba(0, 0, 0, 0.65)',
    shadow: '#000000',
  },
} as const;

/**
 * The same color at a different opacity. Takes the 6-digit hex used throughout
 * `palette`, so components can fade a token instead of hardcoding an rgba().
 */
export function alpha(color: string, a: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

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
