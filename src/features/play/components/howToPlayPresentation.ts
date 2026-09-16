export type HowToPlayStep = {
  icon:
    | 'hand-left-outline'
    | 'swap-horizontal-outline'
    | 'scan-outline'
    | 'refresh-outline'
    | 'sparkles-outline';
  title: string;
  detail: string;
};

/**
 * Appended only while the active puzzle was started with the rotation
 * challenge — a permanent step would teach a gesture that does nothing.
 */
export const ROTATION_STEP: HowToPlayStep = {
  icon: 'refresh-outline',
  title: 'Turn a piece upright',
  detail:
    'This puzzle deals pieces rotated. Double-tap a piece on the table to turn it a quarter; it only seats once it faces the right way. With VoiceOver, focus the piece and use the Rotate piece action.',
};

export const HOW_TO_PLAY_STEPS: readonly HowToPlayStep[] = [
  {
    icon: 'hand-left-outline',
    title: 'Place a piece',
    detail:
      'Drag a piece from the tray onto its matching place, or join matching neighbours on the table and move the group together. With VoiceOver, focus a piece and activate Place piece.',
  },
  {
    icon: 'swap-horizontal-outline',
    title: 'Browse the tray',
    detail:
      'Swipe along the tray to find more pieces. Swipe sideways in portrait and vertically in landscape.',
  },
  {
    icon: 'scan-outline',
    title: 'Look closer',
    detail:
      'Pinch to zoom the table. While zoomed, drag with two fingers to move around the photograph.',
  },
  {
    icon: 'sparkles-outline',
    title: 'Use Assist when needed',
    detail:
      'Open the puzzle menu to place one piece, return loose pieces, or change board help.',
  },
] as const;
