/**
 * Snap distance as a fraction of the piece's smaller bounds dimension.
 *
 * A fixed pixel radius reads completely differently across the 3x3–14x14
 * ladder: on a phone-width 14x14 board it approaches a whole cell, so a
 * full-cell miss still seats, while on 3x3 the same radius is a sliver of
 * the piece and feels unforgiving. Scaling by the piece keeps the assist
 * proportional to what the finger is actually holding.
 */
export const SNAP_THRESHOLD_RATIO = 0.3;

/** Finger-accuracy floor so the smallest pieces remain seatable at all. */
export const MIN_SNAP_THRESHOLD = 8;

/** Ceiling so large pieces still ask for a deliberate placement. */
export const MAX_SNAP_THRESHOLD = 48;

export const SPRING_CONFIG = {
  damping: 18,
  stiffness: 180,
  mass: 0.8,
} as const;
