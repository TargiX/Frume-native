import type { Point, Rect, Size } from './geometry';

/** Identifies a puzzle cutting algorithm plugin. */
export type PuzzleCutterId =
  | 'classic'
  | 'organic'
  | 'biomorphic'
  | 'living-spectrum'
  | 'crystal'
  | 'crystal-quartered'
  | 'amoeba'
  | 'amoeba-columnar'
  | 'fractal';

/** Edge of the board that owns the waiting-piece tray. */
export type PuzzleTrayPlacement = 'bottom' | 'right';

/**
 * Amount of help drawn on the empty board.
 *
 * This is deliberately independent from piece count: every Classic puzzle
 * remains free, while players can tune the board to the amount of visual help
 * they want.
 */
export type PuzzleGuideMode = 'none' | 'grid' | 'cuts' | 'image';

/**
 * Stable recipe for rebuilding a cut at another board size.
 *
 * Geometry-producing options belong here; pixel dimensions deliberately do
 * not. A cutter can therefore regenerate the same normalized seams after a
 * device rotation without persisting every SVG path.
 */
export type PuzzleCutDescriptor = {
  cutterId: PuzzleCutterId;
  version: number;
  seed: string;
  rows: number;
  columns: number;
};

/** Source image used to build a puzzle layout. */
export type PuzzleImageAttribution = {
  photographerName: string;
  photographerUrl: string;
  sourceName: 'Unsplash';
  sourceUrl: string;
};

/**
 * The player's content intent, persisted with the image so follow-up actions
 * never silently switch from a chosen theme (or a private photo) to an
 * unrelated network photograph.
 */
export type PuzzleImageContentSource =
  | {
      kind: 'own';
    }
  | {
      kind: 'unsplash';
      /** Absent means the player explicitly chose “Surprise me”. */
      categoryId?: string;
      categoryLabel?: string;
    };

export type PuzzleImageSource = {
  /** Local durable URI when offline resume is available, otherwise the source URI. */
  uri: string;
  /** Original network source retained when `uri` points at the app's local copy. */
  remoteUri?: string;
  width: number;
  height: number;
  accessibilityLabel?: string;
  /** Source/category intent used by retry and next-puzzle flows. */
  contentSource?: PuzzleImageContentSource;
  /** Credit shown wherever a third-party photograph remains visible. */
  attribution?: PuzzleImageAttribution;
};

/** Normalized region of the source image mapped onto a piece (0–1). */
export type ImageClipRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Static definition of one puzzle piece.
 * Produced by a PuzzleCutter; consumed by PuzzleEngine and the render layer.
 */
export type PuzzlePieceDefinition = {
  id: string;
  index: number;
  row: number;
  col: number;
  /** SVG path string in board-local coordinates. */
  path: string;
  /** Axis-aligned bounds including tab protrusions. */
  bounds: Rect;
  /** Region of the source image visible inside this piece. */
  clipRegion: ImageClipRegion;
  /** Target position on the board (top-left of bounds). */
  correctPosition: Point;
  correctRotation: number;
  neighborIds: readonly string[];
};

/** Full output of a cutter — immutable for the duration of a game session. */
export type PuzzleLayout = {
  cutterId: PuzzleCutterId;
  /**
   * Bottom in portrait, right in landscape. Optional so older saved sessions
   * can restore with their original bottom tray.
   */
  trayPlacement?: PuzzleTrayPlacement;
  /** Present for seeded cutters that can reproduce their normalized geometry. */
  cutDescriptor?: PuzzleCutDescriptor;
  image: PuzzleImageSource;
  boardSize: Size;
  /**
   * How wide the shelf is allowed to be, across the tray's scrolling axis.
   *
   * The board is sized by the photograph, so on a wide screen it leaves table
   * either side of it. The shelf is furniture, not part of the picture: it runs
   * the full width the table gives it and the waiting pieces spread out along
   * that whole run. Absent on puzzles saved before the shelf could do this, and
   * then it falls back to the board's own extent.
   */
  traySurfaceExtent?: number;
  pieces: readonly PuzzlePieceDefinition[];
};
