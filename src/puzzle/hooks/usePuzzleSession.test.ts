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
  beginCompletedSnapshotClearRetention,
  PREMIUM_CUTS_REQUIRED_ERROR,
  finalizePuzzleSessionStart,
  finishCompletedSnapshotClearRetention,
  isPuzzleSessionReplacementCurrent,
  loadPuzzleSessionForRestore,
  mustPreserveCompletedSessionSnapshot,
  removeCompletionDurably,
  retainFailedPromotedCompletionClear,
  persistLiveCompletion,
  preparePuzzleSession,
  promoteRestoredCompletion,
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
  traySurfaceExtent: 480,
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
      traySurfaceExtent: params.traySurfaceExtent,
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

describe('promoteRestoredCompletion', () => {
  const receipt = {
    completedAt: 2_000,
    recordedAt: 2_000,
    elapsedMs: 1_000,
    moveCount: 1,
    pieceCount: 1,
    cutterId: 'classic' as const,
    difficulty: '3x3' as const,
    image: params.image,
  };

  it('keeps the completed active snapshot when receipt persistence fails', async () => {
    const clear = vi.fn(async () => true);
    const clearAfter = vi.fn(async () => true);

    await expect(
      promoteRestoredCompletion(
        receipt,
        { save: async () => false },
        { clear },
        { clearAfter },
      ),
    ).resolves.toEqual({ completionSaved: false, activeCleared: false });
    expect(clear).not.toHaveBeenCalled();
    expect(clearAfter).not.toHaveBeenCalled();
  });

  it('clears active progress only after the receipt commits', async () => {
    const calls: string[] = [];
    const clearPromise = Promise.resolve(true);

    await expect(
      promoteRestoredCompletion(
        receipt,
        {
          save: async () => {
            calls.push('receipt');
            return true;
          },
        },
        {
          clear: () => {
            calls.push('active');
            return clearPromise;
          },
        },
        {
          clearAfter: async (shouldClear) => {
            calls.push('image');
            return shouldClear;
          },
        },
      ),
    ).resolves.toEqual({ completionSaved: true, activeCleared: true });
    expect(calls).toEqual(['receipt', 'active', 'image']);
  });
});

describe('persistLiveCompletion', () => {
  const snapshot = {} as Parameters<typeof persistLiveCompletion>[0];
  const receipt = {
    completedAt: 2_000,
    recordedAt: 2_000,
    elapsedMs: 1_000,
    moveCount: 1,
    pieceCount: 1,
    cutterId: 'classic' as const,
    difficulty: '3x3' as const,
    image: params.image,
  };

  it('flushes the completed snapshot before writing its receipt', async () => {
    const order: string[] = [];
    const schedule = vi.fn(() => order.push('schedule'));

    await expect(
      persistLiveCompletion(
        snapshot,
        receipt,
        {
          schedule,
          flush: async () => {
            order.push('progress');
            return true;
          },
        },
        {
          save: async () => {
            order.push('receipt');
            return true;
          },
        },
      ),
    ).resolves.toEqual({ progressSaved: true, completionSaved: true });
    expect(schedule).toHaveBeenCalledWith(snapshot);
    expect(order).toEqual(['schedule', 'progress', 'receipt']);
  });

  it('does not publish a receipt over an older progress snapshot', async () => {
    const save = vi.fn(async () => true);

    await expect(
      persistLiveCompletion(
        snapshot,
        receipt,
        { schedule: vi.fn(), flush: async () => false },
        { save },
      ),
    ).resolves.toEqual({ progressSaved: false, completionSaved: false });
    expect(save).not.toHaveBeenCalled();
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
      nextImageDurable: true,
      durableReplaced: false,
      settled: false,
    };

    expect(
      isPuzzleSessionReplacementCurrent(replacement, previousSession, 7),
    ).toBe(true);
    expect(
      isPuzzleSessionReplacementCurrent(replacement, nextSession, 7),
    ).toBe(false);
    expect(
      isPuzzleSessionReplacementCurrent(replacement, previousSession, 8),
    ).toBe(false);
    replacement.settled = true;
    expect(
      isPuzzleSessionReplacementCurrent(replacement, previousSession, 7),
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

describe('completed session clear safety', () => {
  it('keeps the completed snapshot until its visible receipt is durable', () => {
    const session = {
      engine: { isComplete: () => true },
    } as PuzzleSession;
    const visible = { image: params.image } as never;
    const olderDurable = { image: params.image } as never;

    expect(
      mustPreserveCompletedSessionSnapshot(session, visible, olderDurable),
    ).toBe(true);
    expect(
      mustPreserveCompletedSessionSnapshot(session, visible, visible),
    ).toBe(false);
  });

  it('retains the completed image while snapshot clear is pending or fails', () => {
    const session = {
      layout: { image: params.image },
      engine: { isComplete: () => true },
    } as PuzzleSession;
    const pending = beginCompletedSnapshotClearRetention(session, 17);

    expect(pending).toEqual({ requestId: 17, imageUri: params.image.uri });
    expect(
      finishCompletedSnapshotClearRetention(pending, 17, false),
    ).toEqual(pending);
    expect(
      finishCompletedSnapshotClearRetention(pending, 18, true),
    ).toEqual(pending);
    expect(
      finishCompletedSnapshotClearRetention(pending, 17, true),
    ).toBeNull();
  });

  it('coordinates receipt removal after restored completion clear failure', () => {
    const receipt = { image: params.image } as never;

    expect(
      retainFailedPromotedCompletionClear(receipt, 31, {
        completionSaved: true,
        activeCleared: false,
      }),
    ).toEqual({ requestId: 31, imageUri: params.image.uri });
    expect(
      retainFailedPromotedCompletionClear(receipt, 31, {
        completionSaved: true,
        activeCleared: true,
      }),
    ).toBeNull();
    expect(
      retainFailedPromotedCompletionClear(receipt, 31, {
        completionSaved: false,
        activeCleared: false,
      }),
    ).toBeNull();
  });

  it('never removes the receipt when completed snapshot clear fails', async () => {
    let resolveSnapshotClear: ((cleared: boolean) => void) | undefined;
    const snapshotClear = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSnapshotClear = resolve;
        }),
    );
    const receiptClear = vi.fn(async () => true);
    const removal = removeCompletionDurably(
      snapshotClear,
      receiptClear,
      () => true,
    );

    await Promise.resolve();
    expect(receiptClear).not.toHaveBeenCalled();
    resolveSnapshotClear?.(false);

    await expect(removal).resolves.toBe('snapshot_failed');
    expect(receiptClear).not.toHaveBeenCalled();
  });

  it('removes the receipt only after completed snapshot clear succeeds', async () => {
    const order: string[] = [];

    await expect(
      removeCompletionDurably(
        async () => {
          order.push('snapshot');
          return true;
        },
        async () => {
          order.push('receipt');
          return true;
        },
        () => true,
      ),
    ).resolves.toBe('cleared');
    expect(order).toEqual(['snapshot', 'receipt']);
  });
});
