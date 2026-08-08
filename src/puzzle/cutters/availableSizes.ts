import { BAKED_CUT_LIBRARY } from './biomorphic/bakedLibrary.generated';
import { gridKey } from './biomorphic/bakedCutLibrary';
import type { CutStyleId } from './biomorphic/cutStyles';
import {
  PUZZLE_SIZES,
  puzzleSize,
  type PuzzleCutterId,
  type PuzzleSizeId,
} from '../types';

/**
 * The baked style each simulated cutter serves. Stated here rather than
 * inferred, because the two are separate ideas: a cutter is what the player
 * picks, a style is what was baked.
 */
const CUTTER_STYLES: Partial<Record<PuzzleCutterId, CutStyleId>> = {
  biomorphic: 'living-fringe',
  'living-spectrum': 'living-spectrum',
  crystal: 'crystal-six',
  'crystal-quartered': 'crystal-four',
  amoeba: 'amoeba-coral',
  'amoeba-columnar': 'amoeba-columnar',
};

/**
 * Which sizes a cut style can actually be played at.
 *
 * The procedural cutters solve a board in milliseconds at any size, so they
 * offer the whole ladder. The phase-field styles are simulated: a single large
 * board takes minutes to hours, far past anything that can happen while a
 * player waits, so they are limited to the grids already baked into
 * `assets/cuts`. A style is not gated by price here — every size is free — it
 * simply does not exist at sizes nobody has baked.
 */
export function availableSizes(
  cutterId: PuzzleCutterId,
): readonly PuzzleSizeId[] {
  const styleId = CUTTER_STYLES[cutterId];
  if (!styleId) {
    // Procedural: solved on the spot, at any size.
    return PUZZLE_SIZES.map((size) => size.id);
  }

  return PUZZLE_SIZES.filter((size) => {
    const key = gridKey(size.rows, size.columns);
    return (BAKED_CUT_LIBRARY[styleId]?.[key]?.length ?? 0) > 0;
  }).map((size) => size.id);
}

/** True when this style can be cut at this size at all. */
export function supportsSize(
  cutterId: PuzzleCutterId,
  sizeId: PuzzleSizeId,
): boolean {
  return availableSizes(cutterId).includes(sizeId);
}

/**
 * The size to fall back to when a player picks a style that does not reach the
 * size they had selected: the largest one that style does offer, so the choice
 * moves as little as possible.
 */
export function nearestAvailableSize(
  cutterId: PuzzleCutterId,
  wanted: PuzzleSizeId,
): PuzzleSizeId | null {
  const sizes = availableSizes(cutterId);
  if (sizes.length === 0) {
    return null;
  }
  if (sizes.includes(wanted)) {
    return wanted;
  }
  const wantedPieces = puzzleSize(wanted).rows * puzzleSize(wanted).columns;
  return sizes.reduce((closest, candidate) => {
    const pieces = puzzleSize(candidate).rows * puzzleSize(candidate).columns;
    const closestPieces =
      puzzleSize(closest).rows * puzzleSize(closest).columns;
    return Math.abs(pieces - wantedPieces) <
      Math.abs(closestPieces - wantedPieces)
      ? candidate
      : closest;
  }, sizes[0]);
}
