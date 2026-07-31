import type {
  PuzzleCutDescriptor,
  PuzzleCutterId,
  PuzzleGuideMode,
  PuzzleImageSource,
  PuzzleLayout,
  PuzzleTrayPlacement,
} from './layout';

export type PuzzleDifficulty = 'easy' | 'medium' | 'hard';

export type CutOptions = {
  difficulty: PuzzleDifficulty;
  trayPlacement?: PuzzleTrayPlacement;
  rows?: number;
  columns?: number;
  /** Max board width in logical pixels; defaults to a phone-friendly size. */
  boardMaxWidth?: number;
  /** Max board height in logical pixels; used with boardMaxWidth to fit the play area. */
  boardMaxHeight?: number;
  /** Stable input for procedural cutters. Equal seeds produce equal normalized cuts. */
  seed?: string | number;
  /** Reuses an existing procedural cut exactly, for example after a resize. */
  cutDescriptor?: PuzzleCutDescriptor;
};

export type PuzzleCutterMeta = {
  id: PuzzleCutterId;
  name: string;
  description: string;
};

/**
 * Plugin contract for puzzle piece generation.
 * Each available cutter implements this interface; reserved cutter IDs may be
 * persisted before their plugin ships.
 */
export interface PuzzleCutter {
  readonly meta: PuzzleCutterMeta;
  generate(image: PuzzleImageSource, options: CutOptions): Promise<PuzzleLayout>;
}

export const DIFFICULTY_GRID: Record<PuzzleDifficulty, { rows: number; columns: number }> = {
  easy: { rows: 3, columns: 3 },
  medium: { rows: 4, columns: 4 },
  hard: { rows: 5, columns: 5 },
};

export const DEFAULT_PUZZLE_GUIDE_MODE: PuzzleGuideMode = 'cuts';
