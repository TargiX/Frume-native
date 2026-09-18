/**
 * Surfaces read as dark warm felt rather than neutral UI grey: the photo is the
 * only saturated thing on screen, so the material under it carries warmth
 * without colour that could compete.
 *
 * `LINEN_SURFACE_COLORS` is the one light material, offered for photographs with
 * large dark regions that disappear against the dark felt. It is a warm paper
 * white, not a clinical grey, so it stays quiet beside the photo.
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
  /** Text drawn straight on the board material, e.g. the loading plate. */
  onSurface: 'rgba(255, 246, 232, 0.92)',
  onSurfaceMuted: 'rgba(255, 246, 232, 0.68)',
  /** The chevron that marks pieces waiting past the tray edge. */
  trayHint: 'rgba(255, 246, 232, 0.5)',
} as const;

export const LINEN_SURFACE_COLORS = {
  tableBase: '#d9d1c0',
  boardLit: '#f4efe4',
  boardShaded: '#e4dccb',
  boardLoading: '#e4dccb',
  trayTop: '#dcd3c1',
  trayBottom: '#cdc3ae',
  /** The groove reads as a warm shadow on light paper, the edge as a highlight. */
  guideCut: 'rgba(72, 58, 38, 0.34)',
  guideEdge: 'rgba(255, 255, 255, 0.6)',
  onSurface: 'rgba(46, 38, 27, 0.9)',
  onSurfaceMuted: 'rgba(46, 38, 27, 0.66)',
  trayHint: 'rgba(46, 38, 27, 0.55)',
} as const;
