import type { CutOptions, PuzzleCutter } from '../../types/cutter';
import { DIFFICULTY_GRID } from '../../types/cutter';
import type {
  PuzzleCutDescriptor,
  PuzzleImageSource,
  PuzzleLayout,
} from '../../types/layout';
import { resolveBoardSize } from '../resolveBoardSize';
import {
  canonicalizeBiomorphicSeed,
  generateBiomorphicPieces,
} from './generateBiomorphic';
import { biomorphicPiecesFrom } from './bakedCutSource';
import { generateBiomorphicPhaseFieldPieces } from './generateBiomorphicPhaseField';

const BIOMORPHIC_CUT_VERSION = 2;
const LEGACY_BIOMORPHIC_CUT_VERSION = 1;

function descriptorFromOptions(
  image: PuzzleImageSource,
  options: CutOptions,
): PuzzleCutDescriptor {
  if (options.cutDescriptor) {
    const descriptor = options.cutDescriptor;
    if (descriptor.cutterId !== 'biomorphic') {
      throw new Error(
        `Cannot use a ${descriptor.cutterId} cut descriptor with Biomorphic`,
      );
    }
    if (
      descriptor.version !== LEGACY_BIOMORPHIC_CUT_VERSION &&
      descriptor.version !== BIOMORPHIC_CUT_VERSION
    ) {
      throw new Error(
        `Unsupported Biomorphic cut descriptor version ${descriptor.version}`,
      );
    }
    if (
      !Number.isInteger(descriptor.rows) ||
      !Number.isInteger(descriptor.columns) ||
      descriptor.rows < 1 ||
      descriptor.columns < 1 ||
      !descriptor.seed
    ) {
      throw new Error('Invalid Biomorphic cut descriptor');
    }
    return { ...descriptor };
  }

  const difficultyGrid = DIFFICULTY_GRID[options.difficulty];
  const rows = options.rows ?? difficultyGrid.rows;
  const columns = options.columns ?? difficultyGrid.columns;
  const sourceSeed =
    options.seed ??
    [
      'biomorphic-v2-phase-field',
      image.uri,
      image.width,
      image.height,
      rows,
      columns,
    ].join(':');

  return {
    cutterId: 'biomorphic',
    version: BIOMORPHIC_CUT_VERSION,
    seed: canonicalizeBiomorphicSeed(sourceSeed),
    rows,
    columns,
  };
}

export const BiomorphicCutter: PuzzleCutter = {
  meta: {
    id: 'biomorphic',
    name: 'Biomorphic',
    description: 'Simulated living cells with branching, interlocking contours',
  },

  async generate(
    image: PuzzleImageSource,
    options: CutOptions,
  ): Promise<PuzzleLayout> {
    const cutDescriptor = descriptorFromOptions(image, options);
    const { width, height } = resolveBoardSize(image, options);

    return {
      cutterId: 'biomorphic',
      trayPlacement: options.trayPlacement ?? 'bottom',
      cutDescriptor,
      image,
      boardSize: { width, height },
      traySurfaceExtent: options.traySurfaceExtent,
      pieces:
        cutDescriptor.version === LEGACY_BIOMORPHIC_CUT_VERSION
          ? generateBiomorphicPieces(
              cutDescriptor.rows,
              cutDescriptor.columns,
              width,
              height,
              cutDescriptor.seed,
            )
          : biomorphicPiecesFrom(
              'living-fringe',
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
                ),
            ),
    };
  },
};
