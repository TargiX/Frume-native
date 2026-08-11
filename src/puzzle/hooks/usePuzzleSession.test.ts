import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: () => ({ remove: () => undefined }),
  },
  Platform: { OS: 'ios' },
}));

vi.mock('react-native-purchases', () => ({
  default: {},
  LOG_LEVEL: {
    INFO: 'INFO',
    WARN: 'WARN',
  },
  PRODUCT_CATEGORY: {
    NON_SUBSCRIPTION: 'NON_SUBSCRIPTION',
  },
  PRODUCT_TYPE: {
    NON_CONSUMABLE: 'NON_CONSUMABLE',
  },
}));

import { PuzzleEngine } from '../engine';
import type { PuzzleCutter, PuzzleEngineSnapshot, PuzzleLayout } from '../types';
import {
  PREMIUM_CUTS_REQUIRED_ERROR,
  finalizePuzzleSessionStart,
  isPuzzleSessionReplacementCurrent,
  loadPuzzleSessionForRestore,
  preparePuzzleSession,
  recoverAndFlushPuzzleSession,
  syncPuzzleSessionActivity,
  type PuzzleSession,
  type PuzzleSessionReplacement,
} from './usePuzzleSession';

const params = {
  image: {
    uri: 'https://example.test/puzzle.jpg',
    width: 1200,
    height: 800,
  },
  difficulty: '3x3' as const,
  boardMaxWidth: 320,
  boardMaxHeight: 240,
};

describe('preparePuzzleSession', () => {
  it('fails closed before generating an Organic puzzle without verified access', async () => {
    const resolveCutter = vi.fn();

    const result = await preparePuzzleSession(
      { ...params, cutterId: 'organic' },
      resolveCutter,
      false,
    );

    expect(result).toEqual({
      success: false,
      error: PREMIUM_CUTS_REQUIRED_ERROR,
    });
    expect(resolveCutter).not.toHaveBeenCalled();
  });

  it('reports failure without constructing a blank session', async () => {
    const result = await preparePuzzleSession(params, () => {
      throw new Error('Cutter unavailable');
    });

    expect(result).toEqual({
      success: false,
      error: 'Cutter unavailable',
    });
    expect('session' in result).toBe(false);
  });

  it('only reports success after a cutter returns a playable layout', async () => {
    const generate = vi.fn<PuzzleCutter['generate']>(
      async (image, options) => {
        return {
          cutterId: 'classic',
          image,
          boardSize: {
            width: options.boardMaxWidth ?? 100,
            height: options.boardMaxHeight ?? 80,
          },
          pieces: [
            {
              id: 'piece-a',
              index: 0,
              row: 0,
              col: 0,
              path: 'M 0 0 L 30 0 L 30 20 L 0 20 Z',
              bounds: { x: 0, y: 0, width: 30, height: 20 },
              clipRegion: { x: 0, y: 0, width: 0.3, height: 0.25 },
              correctPosition: { x: 0, y: 0 },
              correctRotation: 0,
              neighborIds: [],
            },
          ],
        };
      },
    );
    const cutter: PuzzleCutter = {
      meta: {
        id: 'classic',
        name: 'Test',
        description: 'Test cutter',
      },
      generate,
    };

    const result = await preparePuzzleSession(params, () => cutter);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.session.engine.getState().layout).toBe(result.session.layout);
      expect(result.session.layout.boardSize).toEqual({
        width: params.boardMaxWidth,
        height: params.boardMaxHeight,
      });
    }
    expect(generate).toHaveBeenCalledWith(params.image, {
      difficulty: params.difficulty,
      boardMaxWidth: params.boardMaxWidth,
      boardMaxHeight: params.boardMaxHeight,
      trayPlacement: 'bottom',
    });
  });
});

describe('loadPuzzleSessionForRestore', () => {
  it('does not clear the offline image cache after a transient storage read error', async () => {
    const readError = new Error('native read failed');
    const clear = vi.fn(async () => undefined);

    await expect(
      loadPuzzleSessionForRestore(
        {
          load: async () => ({ status: 'error', error: readError }),
        },
        { clear },
      ),
    ).resolves.toEqual({ status: 'error', error: readError });
    expect(clear).not.toHaveBeenCalled();
  });

  it('clears orphaned images only after storage is confirmed empty', async () => {
    const clear = vi.fn(async () => undefined);

    await expect(
      loadPuzzleSessionForRestore(
        {
          load: async () => ({ status: 'empty' }),
        },
        { clear },
      ),
    ).resolves.toEqual({ status: 'empty' });
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('finalizePuzzleSessionStart', () => {
  it('does not prune images or report success when a slow flush belongs to a stale start', async () => {
    let resolveFlush: ((saved: boolean) => void) | undefined;
    const flush = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFlush = resolve;
        }),
    );
    const retainOnly = vi.fn(async () => undefined);
    let currentRequestId = 1;

    const pending = finalizePuzzleSessionStart(
      'file:///documents/frume-saved-puzzle/puzzle-a.jpg',
      { flush },
      { retainOnly },
      () => currentRequestId === 1,
    );
    currentRequestId = 2;
    resolveFlush?.(true);

    await expect(pending).resolves.toEqual({
      current: false,
      saved: true,
    });
    expect(retainOnly).not.toHaveBeenCalled();
  });

  it('rechecks currency after image pruning before reporting success', async () => {
    let currentRequestId = 1;
    const retainOnly = vi.fn(async () => {
      currentRequestId = 2;
    });

    await expect(
      finalizePuzzleSessionStart(
        'file:///documents/frume-saved-puzzle/puzzle-a.jpg',
        { flush: async () => true },
        { retainOnly },
        () => currentRequestId === 1,
      ),
    ).resolves.toEqual({
      current: false,
      saved: true,
    });
    expect(retainOnly).toHaveBeenCalledTimes(1);
  });
});

describe('puzzle session replacement identity guard', () => {
  it('permits rollback only for the exact installed engine and generation', () => {
    const layout: PuzzleLayout = {
      cutterId: 'classic',
      image: params.image,
      boardSize: { width: 100, height: 80 },
      pieces: [
        {
          id: 'piece-a',
          index: 0,
          row: 0,
          col: 0,
          path: 'M 0 0 L 30 0 L 30 20 L 0 20 Z',
          bounds: { x: 0, y: 0, width: 30, height: 20 },
          clipRegion: { x: 0, y: 0, width: 0.3, height: 0.25 },
          correctPosition: { x: 0, y: 0 },
          correctRotation: 0,
          neighborIds: [],
        },
      ],
    };
    const previousSession: PuzzleSession = {
      layout,
      engine: new PuzzleEngine(layout),
      cutterId: 'classic',
      difficulty: '3x3',
    };
    const nextSession: PuzzleSession = {
      layout,
      engine: new PuzzleEngine(layout),
      cutterId: 'classic',
      difficulty: '3x3',
    };
    const replacement: PuzzleSessionReplacement = {
      previousSession,
      nextSession,
      requestId: 7,
      previousImageDurable: true,
      settled: false,
    };

    expect(
      isPuzzleSessionReplacementCurrent(replacement, nextSession, 7),
    ).toBe(true);
    expect(
      isPuzzleSessionReplacementCurrent(replacement, previousSession, 7),
    ).toBe(false);
    expect(
      isPuzzleSessionReplacementCurrent(replacement, nextSession, 8),
    ).toBe(false);
    replacement.settled = true;
    expect(
      isPuzzleSessionReplacementCurrent(replacement, nextSession, 7),
    ).toBe(false);
  });
});

describe('recoverAndFlushPuzzleSession', () => {
  it('keeps an interrupted drag reachable before flushing durable state', async () => {
    const layout: PuzzleLayout = {
      cutterId: 'classic',
      image: params.image,
      boardSize: { width: 100, height: 80 },
      pieces: [
        {
          id: 'piece-a',
          index: 0,
          row: 0,
          col: 0,
          path: 'M 0 0 L 30 0 L 30 20 L 0 20 Z',
          bounds: { x: 0, y: 0, width: 30, height: 20 },
          clipRegion: { x: 0, y: 0, width: 0.3, height: 0.25 },
          correctPosition: { x: 0, y: 0 },
          correctRotation: 0,
          neighborIds: [],
        },
      ],
    };
    const engine = new PuzzleEngine(layout);
    engine.start(1_000);
    engine.takeFromTray('piece-a', { x: 500, y: -40 });
    engine.selectPiece('piece-a');
    const flushedSnapshots: PuzzleEngineSnapshot[] = [];
    const session: PuzzleSession = {
      layout,
      engine,
      cutterId: 'classic',
      difficulty: '3x3',
    };
    const persistence = {
      flush: async () => {
        flushedSnapshots.push(engine.getSnapshot());
        return true;
      },
    };

    await expect(
      recoverAndFlushPuzzleSession(session, persistence, 4_000),
    ).resolves.toBe(true);
    expect(engine.getState().pieces['piece-a'].position).toEqual({
      x: 85,
      y: -10,
    });
    expect(engine.getState().selectedPieceId).toBeNull();
    expect(flushedSnapshots[0]?.pieces['piece-a'].position).toEqual({
      x: 85,
      y: -10,
    });
    expect(engine.getState()).toMatchObject({
      activeElapsedMs: 3_000,
      activeStartedAt: null,
    });
  });
});

describe('syncPuzzleSessionActivity', () => {
  it('counts time only while the Game screen is focused and the app is active', () => {
    const layout: PuzzleLayout = {
      cutterId: 'classic',
      image: params.image,
      boardSize: { width: 100, height: 80 },
      pieces: [
        {
          id: 'piece-a',
          index: 0,
          row: 0,
          col: 0,
          path: 'M 0 0 L 30 0 L 30 20 L 0 20 Z',
          bounds: { x: 0, y: 0, width: 30, height: 20 },
          clipRegion: { x: 0, y: 0, width: 0.3, height: 0.25 },
          correctPosition: { x: 0, y: 0 },
          correctRotation: 0,
          neighborIds: [],
        },
      ],
    };
    const engine = new PuzzleEngine(layout);
    const session: PuzzleSession = {
      layout,
      engine,
      cutterId: 'classic',
      difficulty: '3x3',
    };

    engine.start(1_000);

    // Installing/restoring above navigation while Home is visible pauses.
    syncPuzzleSessionActivity(session, false, 'active', 1_500);
    expect(engine.getElapsedMs(5_000)).toBe(500);

    // Foreground alone must not resume a session behind Home or Gallery.
    syncPuzzleSessionActivity(session, false, 'background', 5_000);
    syncPuzzleSessionActivity(session, false, 'active', 6_000);
    expect(engine.getElapsedMs(8_000)).toBe(500);

    syncPuzzleSessionActivity(session, true, 'active', 8_000);
    syncPuzzleSessionActivity(session, true, 'background', 9_000);
    expect(engine.getElapsedMs(20_000)).toBe(1_500);

    // Returning foreground while Game is blurred remains paused.
    syncPuzzleSessionActivity(session, false, 'background', 10_000);
    syncPuzzleSessionActivity(session, false, 'active', 11_000);
    expect(engine.getElapsedMs(12_000)).toBe(1_500);

    syncPuzzleSessionActivity(session, true, 'active', 12_000);
    expect(engine.getElapsedMs(12_500)).toBe(2_000);
  });
});
