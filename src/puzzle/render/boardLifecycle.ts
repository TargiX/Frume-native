/**
 * A bounded deal animation keeps a full 196-piece tray from taking seconds to
 * become usable. Batching also limits React updates while still keeping each
 * delayed piece out of touch and accessibility navigation until it is shown.
 */
export const PIECE_ENTRANCE_BATCH_COUNT = 8;
export const PIECE_ENTRANCE_MAX_DELAY_MS = 360;
export const PIECE_ENTRANCE_DURATION_MS = 240;

export function pieceEntranceBatch(index: number, total: number): number {
  if (total <= 1) {
    return 0;
  }
  const boundedIndex = Math.min(Math.max(0, index), total - 1);
  return Math.min(
    PIECE_ENTRANCE_BATCH_COUNT - 1,
    Math.floor((boundedIndex * PIECE_ENTRANCE_BATCH_COUNT) / total),
  );
}

export function pieceEntranceDelayMs(index: number, total: number): number {
  return pieceEntranceBatchDelayMs(pieceEntranceBatch(index, total));
}

export function pieceEntranceBatchDelayMs(batch: number): number {
  const boundedBatch = Math.min(
    PIECE_ENTRANCE_BATCH_COUNT - 1,
    Math.max(0, batch),
  );
  return Math.round(
    (boundedBatch * PIECE_ENTRANCE_MAX_DELAY_MS) /
      (PIECE_ENTRANCE_BATCH_COUNT - 1),
  );
}

export function isPieceEntranceVisible(
  index: number,
  total: number,
  visibleBatch: number,
): boolean {
  return pieceEntranceBatch(index, total) <= visibleBatch;
}
