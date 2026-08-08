import type { CutOptions, PuzzleCutter } from '../../types/cutter';
import { DIFFICULTY_GRID } from '../../types/cutter';
import type {
  PuzzleCutDescriptor,
  PuzzleCutterId,
  PuzzleImageSource,
  PuzzleLayout,
} from '../../types/layout';
import { biomorphicPiecesFrom } from './bakedCutSource';
import type { CutStyleId } from './cutStyles';
import { canonicalizeBiomorphicSeed } from './generateBiomorphic';
import {
  generateBiomorphicPhaseFieldPieces,
  type BiomorphicPhaseFieldStyle,
} from './generateBiomorphicPhaseField';
import { resolveBoardSize } from '../resolveBoardSize';

/**
 * Builds a cutter that serves one baked cut style.
 *
 * Every style is the same solver with a different profile, so the cutters
 * differ only in which library shelf they read and what they call themselves.
 * Living and Amoeba predate this and stay hand-written: they carry descriptor
 * versions from before the library existed, and resuming a saved puzzle
 * depends on that history.
 */
export function createPhaseFieldCutter({
  cutterId,
  styleId,
  name,
  description,
  base,
}: {
  cutterId: PuzzleCutterId;
  styleId: CutStyleId;
  name: string;
  description: string;
  /** Profile the fallback solver uses when a board has no baked cut. */
  base: BiomorphicPhaseFieldStyle;
}): PuzzleCutter {
  const version = 1;

  function descriptorFromOptions(
    image: PuzzleImageSource,
    options: CutOptions,
  ): PuzzleCutDescriptor {
    if (options.cutDescriptor) {
      const descriptor = options.cutDescriptor;
      if (descriptor.cutterId !== cutterId) {
        throw new Error(
          `Cannot use a ${descriptor.cutterId} cut descriptor with ${name}`,
        );
      }
      if (descriptor.version !== version) {
        throw new Error(
          `Unsupported ${name} cut descriptor version ${descriptor.version}`,
        );
      }
      if (
        !Number.isInteger(descriptor.rows) ||
        !Number.isInteger(descriptor.columns) ||
        descriptor.rows < 1 ||
        descriptor.columns < 1 ||
        !descriptor.seed
      ) {
        throw new Error(`Invalid ${name} cut descriptor`);
      }
      return { ...descriptor };
    }

    const difficultyGrid = DIFFICULTY_GRID[options.difficulty];
    const rows = options.rows ?? difficultyGrid.rows;
    const columns = options.columns ?? difficultyGrid.columns;
    // The style is part of the seed, so the same photograph at the same size
    // draws a different cut from each style rather than the same one restyled.
    const sourceSeed =
      options.seed ??
      [
        `${styleId}-v${version}-phase-field`,
        image.uri,
        image.width,
        image.height,
        rows,
        columns,
      ].join(':');

    return {
      cutterId,
      version,
      seed: canonicalizeBiomorphicSeed(sourceSeed),
      rows,
      columns,
    };
  }

  return {
    meta: { id: cutterId, name, description },

    async generate(
      image: PuzzleImageSource,
      options: CutOptions,
    ): Promise<PuzzleLayout> {
      const cutDescriptor = descriptorFromOptions(image, options);
      const { width, height } = resolveBoardSize(image, options);

      return {
        cutterId,
        trayPlacement: options.trayPlacement ?? 'bottom',
        cutDescriptor,
        image,
        boardSize: { width, height },
        pieces: biomorphicPiecesFrom(
          styleId,
          cutDescriptor.rows,
          cutDescriptor.columns,
          width,
          height,
          cutDescriptor.seed,
          () =>
            generateBiomorphicPhaseFieldPieces(
              cutDescriptor.rows,
              cutDescriptor.columns,
              width,
              height,
              cutDescriptor.seed,
              base,
            ),
        ),
      };
    },
  };
}

export const LivingSpectrumCutter = createPhaseFieldCutter({
  cutterId: 'living-spectrum',
  styleId: 'living-spectrum',
  name: 'Living spectrum',
  description: 'Five harmonics of teeth, and seams that vary piece to piece',
  base: 'dendrite',
});

export const CrystalCutter = createPhaseFieldCutter({
  cutterId: 'crystal',
  styleId: 'crystal-six',
  name: 'Crystal',
  description: 'Six-fold tips, each piece grown on its own heading',
  base: 'dendrite',
});

export const CrystalQuarteredCutter = createPhaseFieldCutter({
  cutterId: 'crystal-quartered',
  styleId: 'crystal-four',
  name: 'Crystal quartered',
  description: 'Four headings, cut deeper: blockier and more mineral',
  base: 'dendrite',
});

export const AmoebaColumnarCutter = createPhaseFieldCutter({
  cutterId: 'amoeba-columnar',
  styleId: 'amoeba-columnar',
  name: 'Amoeba columnar',
  description: 'Amoeba over stretched sites, giving tall banded pieces',
  base: 'amoeba',
});
