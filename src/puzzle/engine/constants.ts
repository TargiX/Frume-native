/** Distance (px) within which a piece snaps to its correct position. */
export const SNAP_THRESHOLD = 24;

export const SPRING_CONFIG = {
  damping: 18,
  stiffness: 180,
  mass: 0.8,
} as const;
