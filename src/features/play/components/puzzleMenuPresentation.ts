export const PUZZLE_MENU_MOTION = {
  enterDurationMs: 280,
  exitDurationMs: 220,
  reducedDurationMs: 120,
} as const;

/**
 * The landscape sheet enters from the right, so its trigger belongs there too
 * — except the right edge is where the side shelf lives. On that layout the
 * HUD moves left, off the shelf, so it never covers waiting pieces.
 */
export function puzzleMenuHudSide(
  trayPlacement: 'bottom' | 'right',
): 'left' | 'right' {
  return trayPlacement === 'right' ? 'left' : 'right';
}
