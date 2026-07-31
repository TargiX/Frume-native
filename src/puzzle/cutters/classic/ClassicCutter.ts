import type { CutOptions, PuzzleCutter } from '../../types/cutter';
import { DIFFICULTY_GRID } from '../../types/cutter';
import type { PuzzleImageSource, PuzzleLayout } from '../../types/layout';
import { resolveBoardSize } from '../resolveBoardSize';
import { generateClassicGridPieces } from './generateGrid';

export const ClassicCutter: PuzzleCutter = {
  meta: {
    id: 'classic',
    name: 'Classic',
    description: 'Grid puzzle with interlocking tabs',
  },

  async generate(image: PuzzleImageSource, options: CutOptions): Promise<PuzzleLayout> {
    const grid = DIFFICULTY_GRID[options.difficulty];
    const rows = options.rows ?? grid.rows;
    const columns = options.columns ?? grid.columns;
    const { width: boardWidth, height: boardHeight } = resolveBoardSize(image, options);

    return {
      cutterId: 'classic',
      trayPlacement: options.trayPlacement ?? 'bottom',
      image,
      boardSize: { width: boardWidth, height: boardHeight },
      pieces: generateClassicGridPieces(rows, columns, boardWidth, boardHeight),
    };
  },
};
