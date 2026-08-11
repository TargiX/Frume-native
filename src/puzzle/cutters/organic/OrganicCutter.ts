import type { CutOptions, PuzzleCutter } from '../../types/cutter';
import { DIFFICULTY_GRID } from '../../types/cutter';
import type {
  PuzzleCutDescriptor,
  PuzzleImageSource,
  PuzzleLayout,
} from '../../types/layout';
import { resolveBoardSize } from '../resolveBoardSize';
import {
  canonicalizeOrganicSeed,
  generateOrganicPieces,
} from './generateOrganic';

const ORGANIC_CUT_VERSION = 1;

function descriptorFromOptions(
  image: PuzzleImageSource,
  options: CutOptions,
): PuzzleCutDescriptor {
  if (options.cutDescriptor) {
    const descriptor = options.cutDescriptor;
    if (descriptor.cutterId !== 'organic') {
      throw new Error(
        `Cannot use a ${descriptor.cutterId} cut descriptor with Organic`,
      );
    }
    if (descriptor.version !== ORGANIC_CUT_VERSION) {
      throw new Error(
        `Unsupported Organic cut descriptor version ${descriptor.version}`,
      );
    }
    if (
      !Number.isInteger(descriptor.rows) ||
      !Number.isInteger(descriptor.columns) ||
      descriptor.rows < 1 ||
      descriptor.columns < 1 ||
      !descriptor.seed
    ) {
      throw new Error('Invalid Organic cut descriptor');
    }
    return { ...descriptor };
  }

  const difficultyGrid = DIFFICULTY_GRID[options.difficulty];
  const rows = options.rows ?? difficultyGrid.rows;
  const columns = options.columns ?? difficultyGrid.columns;
  const sourceSeed =
    options.seed ??
    [
      'organic-v1',
      image.uri,
      image.width,
      image.height,
      rows,
      columns,
    ].join(':');

  return {
    cutterId: 'organic',
    version: ORGANIC_CUT_VERSION,
    seed: canonicalizeOrganicSeed(sourceSeed),
    rows,
    columns,
  };
}

export const OrganicCutter: PuzzleCutter = {
  meta: {
    id: 'organic',
    name: 'Organic',
    description: 'Irregular, flowing pieces with one-of-a-kind seams',
  },

  async generate(
    image: PuzzleImageSource,
    options: CutOptions,
  ): Promise<PuzzleLayout> {
    const cutDescriptor = descriptorFromOptions(image, options);
    const { width, height } = resolveBoardSize(image, options);

    return {
      cutterId: 'organic',
      trayPlacement: options.trayPlacement ?? 'bottom',
      cutDescriptor,
      image,
      boardSize: { width, height },
      traySurfaceExtent: options.traySurfaceExtent,
      pieces: generateOrganicPieces(
        cutDescriptor.rows,
        cutDescriptor.columns,
        width,
        height,
        cutDescriptor.seed,
      ),
    };
  },
};
