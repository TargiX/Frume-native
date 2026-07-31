/**
 * Surfaces read as dark warm felt rather than neutral UI grey: the photo is the
 * only saturated thing on screen, so the material under it carries warmth
 * without colour that could compete.
 */
export const PUZZLE_SURFACE_COLORS = {
  /** Deep felt behind the whole play surface. */
  tableBase: '#151311',
  /** Board felt, at the lit and shaded ends of the key light. */
  boardLit: '#37332e',
  boardShaded: '#262320',
  boardLoading: '#262320',
  /** Tray recess — the same material, sunk below the board. */
  trayTop: '#1d1a17',
  trayBottom: '#131110',
  /** Engraved cell guide: a knife line with a lit lower edge. */
  guideCut: 'rgba(0, 0, 0, 0.30)',
  guideEdge: 'rgba(255, 246, 232, 0.055)',
} as const;
