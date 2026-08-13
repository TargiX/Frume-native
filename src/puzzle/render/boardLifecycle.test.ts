import { describe, expect, it } from 'vitest';

import {
  isPieceEntranceVisible,
  PIECE_ENTRANCE_BATCH_COUNT,
  PIECE_ENTRANCE_DURATION_MS,
  PIECE_ENTRANCE_MAX_DELAY_MS,
  pieceEntranceBatch,
  pieceEntranceBatchDelayMs,
  pieceEntranceDelayMs,
} from './boardLifecycle';

describe('puzzle-board round lifecycle', () => {
  it('caps a 196-piece entrance at 600ms', () => {
    const delays = Array.from({ length: 196 }, (_, index) =>
      pieceEntranceDelayMs(index, 196),
    );

    expect(Math.max(...delays)).toBeLessThanOrEqual(
      PIECE_ENTRANCE_MAX_DELAY_MS,
    );
    expect(Math.max(...delays) + PIECE_ENTRANCE_DURATION_MS).toBeLessThanOrEqual(
      600,
    );
    expect(new Set(delays).size).toBeLessThanOrEqual(
      PIECE_ENTRANCE_BATCH_COUNT,
    );
    expect(
      pieceEntranceBatchDelayMs(PIECE_ENTRANCE_BATCH_COUNT - 1) +
        PIECE_ENTRANCE_DURATION_MS,
    ).toBe(600);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
  });

  it('keeps later batches unavailable until their visual entrance begins', () => {
    expect(pieceEntranceBatch(195, 196)).toBe(
      PIECE_ENTRANCE_BATCH_COUNT - 1,
    );
    expect(isPieceEntranceVisible(0, 196, 0)).toBe(true);
    expect(isPieceEntranceVisible(195, 196, 0)).toBe(false);
    expect(
      isPieceEntranceVisible(
        195,
        196,
        PIECE_ENTRANCE_BATCH_COUNT - 1,
      ),
    ).toBe(true);
  });

  it('handles the single-piece boundary without division artifacts', () => {
    expect(pieceEntranceBatch(0, 1)).toBe(0);
    expect(pieceEntranceDelayMs(0, 1)).toBe(0);
  });
});
