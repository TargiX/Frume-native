import { describe, expect, it } from 'vitest';

import {
  advancePlayAnalytics,
  placedPercent,
  puzzleAbandonedProperties,
  type PlaySnapshot,
} from './playAnalytics';

const snapshot = (
  sessionKey: object,
  overrides: Partial<PlaySnapshot> = {},
): PlaySnapshot => ({
  sessionKey,
  cutId: 'classic',
  pieceCount: 16,
  placedCount: 4,
  ...overrides,
});

describe('play analytics transitions', () => {
  it('remembers the first board without reporting anything', () => {
    const first = snapshot({});
    expect(advancePlayAnalytics(null, first, false)).toEqual({
      abandoned: null,
      snapshot: first,
    });
  });

  it('does not report progress within the same puzzle', () => {
    const session = {};
    const before = snapshot(session, { placedCount: 2 });
    const after = snapshot(session, { placedCount: 9 });

    expect(advancePlayAnalytics(before, after, false)).toEqual({
      abandoned: null,
      snapshot: after,
    });
  });

  it('reports the previous puzzle when the session is replaced mid-play', () => {
    const before = snapshot({}, { placedCount: 3 });
    const after = snapshot({}, { cutId: 'amoeba', placedCount: 0 });

    expect(advancePlayAnalytics(before, after, false)).toEqual({
      abandoned: before,
      snapshot: after,
    });
  });

  it('reports the previous puzzle when the board goes away entirely', () => {
    const before = snapshot({});
    expect(advancePlayAnalytics(before, null, false)).toEqual({
      abandoned: before,
      snapshot: null,
    });
  });

  it('forgets a completed puzzle so leaving it is never an abandonment', () => {
    const session = {};
    const before = snapshot(session, { placedCount: 15 });
    const done = snapshot(session, { placedCount: 16 });

    const transition = advancePlayAnalytics(before, done, true);
    expect(transition).toEqual({ abandoned: null, snapshot: null });
    expect(advancePlayAnalytics(transition.snapshot, null, false)).toEqual({
      abandoned: null,
      snapshot: null,
    });
  });

  it('still reports a replaced puzzle even when its successor completes at once', () => {
    const before = snapshot({}, { placedCount: 1 });
    const after = snapshot({}, { placedCount: 9, pieceCount: 9 });

    expect(advancePlayAnalytics(before, after, true)).toEqual({
      abandoned: before,
      snapshot: null,
    });
  });
});

describe('play analytics properties', () => {
  it('rounds and bounds progress', () => {
    expect(placedPercent(0, 16)).toBe(0);
    expect(placedPercent(1, 3)).toBe(33);
    expect(placedPercent(16, 16)).toBe(100);
    expect(placedPercent(20, 16)).toBe(100);
    expect(placedPercent(-1, 16)).toBe(0);
    expect(placedPercent(4, 0)).toBe(0);
  });

  it('describes an abandoned puzzle', () => {
    expect(puzzleAbandonedProperties(snapshot({}, { placedCount: 8 }))).toEqual({
      cut_id: 'classic',
      piece_count: 16,
      progress_pct: 50,
    });
  });

  it('ignores a board that never had pieces', () => {
    expect(
      puzzleAbandonedProperties(snapshot({}, { pieceCount: 0 })),
    ).toBeNull();
  });
});
