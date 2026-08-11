import type {
  PuzzleCutDescriptor,
  PuzzleCutterId,
  PuzzleGuideMode,
  PuzzleImageSource,
  PuzzleLayout,
  PuzzleTrayPlacement,
} from './layout';

/**
 * The sizes a puzzle can be cut into, identified by their grid.
 *
 * The id doubles as the key the baked cut library files its cuts under, so
 * "which sizes does this style exist at" is a lookup rather than a table that
 * has to be kept in step by hand.
 *
 * These are sizes, not difficulty levels: every one of them is free, and the
 * ladder is deliberately long because a player who likes jigsaws finds 25
 * pieces a preview rather than a puzzle.
 */
export const PUZZLE_SIZES = [
  { id: '3x3', rows: 3, columns: 3 },
  { id: '4x4', rows: 4, columns: 4 },
  { id: '5x5', rows: 5, columns: 5 },
  { id: '7x7', rows: 7, columns: 7 },
  { id: '10x10', rows: 10, columns: 10 },
  { id: '14x14', rows: 14, columns: 14 },
] as const;

export type PuzzleSize = (typeof PUZZLE_SIZES)[number];
export type PuzzleSizeId = PuzzleSize['id'];

/**
 * Historical name, kept while call sites still speak of difficulty. A saved
 * game from before the ladder stores 'easy' | 'medium' | 'hard'; persistence
 * maps those onto the first three sizes.
 */
export type PuzzleDifficulty = PuzzleSizeId;

export const LEGACY_DIFFICULTY_SIZES: Record<string, PuzzleSizeId> = {
  easy: '3x3',
  medium: '4x4',
  hard: '5x5',
};

export function puzzleSize(id: PuzzleSizeId): PuzzleSize {
  const size = PUZZLE_SIZES.find((candidate) => candidate.id === id);
  if (!size) {
    throw new Error(`Unknown puzzle size ${id}`);
  }
  return size;
}

export function pieceCount(id: PuzzleSizeId): number {
  const { rows, columns } = puzzleSize(id);
  return rows * columns;
}

export type CutOptions = {
  difficulty: PuzzleDifficulty;
  trayPlacement?: PuzzleTrayPlacement;
  rows?: number;
  columns?: number;
  /** Max board width in logical pixels; defaults to a phone-friendly size. */
  boardMaxWidth?: number;
  /** Max board height in logical pixels; used with boardMaxWidth to fit the play area. */
  boardMaxHeight?: number;
  /**
   * Extent of the table across the tray's scrolling axis. The shelf runs this
   * wide rather than stopping at the board, so slots are dealt across the whole
   * of it. Defaults to the board when the caller does not know the table.
   */
  traySurfaceExtent?: number;
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

export const DIFFICULTY_GRID: Record<
  PuzzleSizeId,
  { rows: number; columns: number }
> = Object.fromEntries(
  PUZZLE_SIZES.map((size) => [size.id, { rows: size.rows, columns: size.columns }]),
) as Record<PuzzleSizeId, { rows: number; columns: number }>;

export const DEFAULT_PUZZLE_GUIDE_MODE: PuzzleGuideMode = 'cuts';
