export const PUZZLE_MENU_MOTION = {
  enterDurationMs: 280,
  exitDurationMs: 220,
  reducedDurationMs: 120,
} as const;

/** The landscape sheet enters from the right, so its trigger belongs there too. */
export function puzzleMenuHudSide(): 'right' {
  return 'right';
}
