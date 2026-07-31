type DifficultyViewport = {
  width: number;
  height: number;
  fontScale: number;
};

export type DifficultyScreenLayout = {
  /**
   * Phone landscape can keep the photograph and primary action stationary
   * while the denser option list scrolls independently. Narrow landscape and
   * larger Dynamic Type deliberately fall back to the single safe scroll.
   */
  twoPane: boolean;
};

const MIN_TWO_PANE_WIDTH = 700;
const MAX_COMPACT_LANDSCAPE_HEIGHT = 600;
const MAX_TWO_PANE_FONT_SCALE = 1.35;

export function resolveDifficultyScreenLayout({
  width,
  height,
  fontScale,
}: DifficultyViewport): DifficultyScreenLayout {
  return {
    twoPane:
      width > height &&
      width >= MIN_TWO_PANE_WIDTH &&
      height <= MAX_COMPACT_LANDSCAPE_HEIGHT &&
      fontScale < MAX_TWO_PANE_FONT_SCALE,
  };
}
