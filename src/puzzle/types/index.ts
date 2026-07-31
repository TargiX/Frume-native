export type { Point, Rect, Size } from './geometry';
export { distance } from './geometry';

export type {
  ImageClipRegion,
  PuzzleCutterId,
  PuzzleGuideMode,
  PuzzleImageAttribution,
  PuzzleImageSource,
  PuzzleLayout,
  PuzzlePieceDefinition,
  PuzzleTrayPlacement,
} from './layout';

export type {
  CutOptions,
  PuzzleCutter,
  PuzzleCutterMeta,
  PuzzleDifficulty,
} from './cutter';
export { DEFAULT_PUZZLE_GUIDE_MODE, DIFFICULTY_GRID } from './cutter';
export {
  nextPuzzleGuideMode,
  PUZZLE_GUIDE_OPTIONS,
  puzzleGuideLabel,
} from './guide';

export type { PuzzleTableAppearance } from './table';
export {
  DEFAULT_PUZZLE_TABLE_APPEARANCE,
  parsePuzzleTableAppearance,
} from './table';

export type {
  PieceRuntimeState,
  PuzzleEngineListener,
  PuzzleEngineSnapshot,
  PuzzleEngineState,
  PuzzleSessionStatus,
  SnapFeedback,
  SnapResult,
} from './engine';
