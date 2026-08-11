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

/**
 * The width a cut sample wants to be read at. Columns are derived from it, so
 * a wider screen shows more samples rather than bigger ones — on a 13-inch iPad
 * three columns made each sample the size of a playing card.
 */
const CUT_SAMPLE_WIDTH = 118;
/** Past four the names start colliding and the sheet reads as wallpaper. */
const MAX_CUT_COLUMNS = 4;

const MIN_TWO_PANE_WIDTH = 700;
const MAX_COMPACT_LANDSCAPE_HEIGHT = 600;
const MAX_TWO_PANE_FONT_SCALE = 1.35;

/**
 * How many cut samples fit across the content column.
 *
 * Larger text takes columns away before it takes width from the names: at the
 * biggest sizes the sheet becomes one wide row per cut, where a name has
 * somewhere to go.
 */
export function resolveCutColumns(
  contentWidth: number,
  fontScale: number,
): number {
  if (fontScale >= 1.6) {
    return 1;
  }
  const ceiling = fontScale >= 1.3 ? 2 : MAX_CUT_COLUMNS;
  const fitted = Math.floor(contentWidth / CUT_SAMPLE_WIDTH);
  return Math.max(1, Math.min(ceiling, fitted));
}

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
