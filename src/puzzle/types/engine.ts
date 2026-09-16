import type { Point } from './geometry';
import type { PuzzleLayout } from './layout';

export type PuzzleSessionStatus = 'ready' | 'playing' | 'completed';

/**
 * Which waiting pieces the tray keeps in reach. A runtime preference, not
 * durable state: a relaunched puzzle always restores 'all' so no piece can
 * stay hidden from a player who forgot the filter was on.
 */
export type PuzzleTrayFilter = 'all' | 'edges';

/** Runtime state of a single piece during play. */
export type PieceRuntimeState = {
  pieceId: string;
  /** Connected loose pieces share an ID and move together. */
  groupId?: string;
  /**
   * Surface coordinates. While the piece is in the tray this is its slot
   * position in tray-content space, which the renderer offsets by the tray's
   * scroll; once taken out it is an absolute position on the play surface.
   */
  position: Point;
  rotation: number;
  locked: boolean;
  zIndex: number;
  /** True while the piece is still waiting in the tray. */
  inTray: boolean;
  /** Permanent slot in the tray row; kept so a resize can restore the layout. */
  traySlot: number;
};

export type PuzzleEngineState = {
  status: PuzzleSessionStatus;
  layout: PuzzleLayout;
  pieces: Record<string, PieceRuntimeState>;
  selectedPieceId: string | null;
  moveCount: number;
  /** Wall-clock time of the first move, retained for session history. */
  startedAt: number | null;
  /** Wall-clock completion time, retained for session history. */
  completedAt: number | null;
  /** Active solve time accumulated before the current foreground interval. */
  activeElapsedMs: number;
  /** Start of the current foreground interval, or null while paused. */
  activeStartedAt: number | null;
  snapFeedback: SnapFeedback | null;
  /** Tray view preference; see PuzzleTrayFilter. */
  trayFilter: PuzzleTrayFilter;
};

/**
 * Durable engine state. Selection and snap feedback are intentionally absent:
 * both describe an in-flight gesture/animation and are unsafe to restore after
 * the app process has been suspended or killed.
 */
export type PuzzleEngineSnapshot = Pick<
  PuzzleEngineState,
  | 'status'
  | 'layout'
  | 'pieces'
  | 'moveCount'
  | 'startedAt'
  | 'completedAt'
  | 'activeElapsedMs'
  | 'activeStartedAt'
>;

export type SnapFeedback = {
  pieceId: string;
  kind: 'seat' | 'connect';
};

export type SnapResult = {
  pieceId: string;
  snapped: boolean;
  locked: boolean;
  position: Point;
  connectedWithNeighbor: boolean;
};

export type PuzzleEngineListener = (state: PuzzleEngineState) => void;
