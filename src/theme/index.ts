/**
 * Shared visual language.
 *
 * The play surface is warm dark felt, so the menus are built from the same
 * material rather than the cold neutral greys and blue accent they started
 * with — otherwise entering a puzzle feels like entering a different app. The
 * accent is brass: it sits with the felt, and it never competes with a photo
 * the way a saturated blue does.
 */
export const colors = {
  background: '#14120f',
  surface: '#1e1b18',
  surfaceRaised: '#2a2621',
  border: 'rgba(245, 239, 230, 0.10)',
  borderStrong: 'rgba(245, 239, 230, 0.22)',
  /**
   * Boundaries that communicate an available control, not decoration.
   * This clears 3:1 against both surface backgrounds at its normal opacity.
   */
  interactiveBorder: 'rgba(245, 239, 230, 0.40)',

  textPrimary: '#f5efe6',
  textSecondary: 'rgba(245, 239, 230, 0.72)',
  textMuted: 'rgba(245, 239, 230, 0.55)',

  accent: '#d8a24a',
  accentPressed: '#c08f3d',
  /** Text on top of the accent — dark, because the accent is light. */
  onAccent: '#1a1611',

  danger: '#d9705f',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 34, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

/** Minimum comfortable touch target, per platform guidance. */
export const MIN_TOUCH_TARGET = 44;
