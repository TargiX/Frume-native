import type { CutOptions, PuzzleCutter } from '../../types/cutter';
import { DIFFICULTY_GRID } from '../../types/cutter';
import type {
  PuzzleCutDescriptor,
  PuzzleImageSource,
  PuzzleLayout,
} from '../../types/layout';
import { canonicalizeBiomorphicSeed } from '../biomorphic/generateBiomorphic';
import { biomorphicPiecesFrom } from '../biomorphic/bakedCutSource';
import { generateBiomorphicPhaseFieldPieces } from '../biomorphic/generateBiomorphicPhaseField';
import { resolveBoardSize } from '../resolveBoardSize';

const AMOEBA_CUT_VERSION = 1;

function descriptorFromOptions(
  image: PuzzleImageSource,
  options: CutOptions,
): PuzzleCutDescriptor {
  if (options.cutDescriptor) {
    const descriptor = options.cutDescriptor;
    if (descriptor.cutterId !== 'amoeba') {
      throw new Error(
        `Cannot use a ${descriptor.cutterId} cut descriptor with Amoeba`,
      );
    }
    if (descriptor.version !== AMOEBA_CUT_VERSION) {
      throw new Error(
        `Unsupported Amoeba cut descriptor version ${descriptor.version}`,
      );
    }
    if (
      !Number.isInteger(descriptor.rows) ||
      !Number.isInteger(descriptor.columns) ||
      descriptor.rows < 1 ||
      descriptor.columns < 1 ||
      !descriptor.seed
    ) {
      throw new Error('Invalid Amoeba cut descriptor');
    }
    return { ...descriptor };
  }

  const difficultyGrid = DIFFICULTY_GRID[options.difficulty];
  const rows = options.rows ?? difficultyGrid.rows;
  const columns = options.columns ?? difficultyGrid.columns;
  const sourceSeed =
    options.seed ??
    [
      'amoeba-v1-phase-field',
      image.uri,
      image.width,
      image.height,
      rows,
      columns,
    ].join(':');

  return {
    cutterId: 'amoeba',
    version: AMOEBA_CUT_VERSION,
    seed: canonicalizeBiomorphicSeed(sourceSeed),
    rows,
    columns,
  };
}

export const AmoebaCutter: PuzzleCutter = {
  meta: {
    id: 'amoeba',
    name: 'Amoeba',
    description: 'Simulated pseudopods with dense, blobby interlocks',
  },

  async generate(
    image: PuzzleImageSource,
    options: CutOptions,
  ): Promise<PuzzleLayout> {
    const cutDescriptor = descriptorFromOptions(image, options);
    const { width, height } = resolveBoardSize(image, options);

    return {
      cutterId: 'amoeba',
      trayPlacement: options.trayPlacement ?? 'bottom',
      cutDescriptor,
      image,
      boardSize: { width, height },
      pieces: biomorphicPiecesFrom(
        'amoeba-coral',
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
            'amoeba',
          ),
      ),
    };
  },
};
