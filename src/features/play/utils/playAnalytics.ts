import type { AnalyticsEventProperties } from '../../../analytics';

/**
 * Progress of the puzzle currently on the board.
 *
 * `sessionKey` is the session object itself, used only for identity. Replacing
 * the photograph or the cut hands the screen a new session object without
 * unmounting it, and that is the moment the previous puzzle was walked away
 * from.
 */
export type PlaySnapshot = {
  sessionKey: object;
  cutId: string;
  pieceCount: number;
  placedCount: number;
};

export type PlayAnalyticsTransition = {
  /** The puzzle that was left unfinished, if any. */
  abandoned: PlaySnapshot | null;
  /** What to remember for the next transition. */
  snapshot: PlaySnapshot | null;
};

/**
 * Decides what a change of board state means for measurement.
 *
 * Kept separate from the screen because the interesting cases — replacing a
 * session mid-play, completing, leaving — are ordering rules rather than
 * rendering, and they are worth asserting directly.
 */
export function advancePlayAnalytics(
  previous: PlaySnapshot | null,
  next: PlaySnapshot | null,
  nextCompleted: boolean,
): PlayAnalyticsTransition {
  const replaced =
    previous !== null &&
    (next === null || previous.sessionKey !== next.sessionKey);

  return {
    abandoned: replaced ? previous : null,
    snapshot: next === null || nextCompleted ? null : next,
  };
}

/** Percentage of pieces seated, rounded and bounded to 0–100. */
export function placedPercent(placedCount: number, pieceCount: number): number {
  if (pieceCount <= 0) {
    return 0;
  }
  return Math.min(Math.max(Math.round((placedCount / pieceCount) * 100), 0), 100);
}

/**
 * Returns null for a puzzle with no pieces, which is a board that never became
 * playable rather than one a player gave up on.
 */
export function puzzleAbandonedProperties(
  snapshot: PlaySnapshot,
): AnalyticsEventProperties['puzzle_abandoned'] | null {
  if (snapshot.pieceCount <= 0) {
    return null;
  }
  return {
    cut_id: snapshot.cutId,
    piece_count: snapshot.pieceCount,
    progress_pct: placedPercent(snapshot.placedCount, snapshot.pieceCount),
  };
}
