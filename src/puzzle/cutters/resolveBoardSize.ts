import type { CutOptions } from '../types/cutter';
import type { PuzzleImageSource } from '../types/layout';

const DEFAULT_BOARD_MAX_WIDTH = 360;
const FALLBACK_IMAGE_ASPECT = 4 / 3;

/**
 * Fits a board inside the available rectangle without changing the photograph's
 * composition. Resizing scales one immutable crop instead of revealing a
 * different part of the image after rotation.
 */
export function resolveBoardSize(
  image: PuzzleImageSource,
  options: CutOptions,
): { width: number; height: number } {
  const sourceAspect =
    image.width > 0 && image.height > 0
      ? image.width / image.height
      : FALLBACK_IMAGE_ASPECT;
  const maxWidth = options.boardMaxWidth ?? DEFAULT_BOARD_MAX_WIDTH;
  const maxHeight = options.boardMaxHeight ?? Number.POSITIVE_INFINITY;

  const widthAtMaxHeight = maxHeight * sourceAspect;
  if (widthAtMaxHeight <= maxWidth) {
    return { width: widthAtMaxHeight, height: maxHeight };
  }

  return {
    width: maxWidth,
    height: maxWidth / sourceAspect,
  };
}
