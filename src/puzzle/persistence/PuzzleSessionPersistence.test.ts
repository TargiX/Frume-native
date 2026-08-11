import { describe, expect, it, vi } from 'vitest';

import { PuzzleEngine } from '../engine/PuzzleEngine';
import type { PuzzleEngineSnapshot, PuzzleLayout } from '../types';
import {
  PUZZLE_SESSION_SCHEMA_VERSION,
  PuzzleSessionPersistence,
  deserializePuzzleSession,
  serializePuzzleSession,
  type AsyncKeyValueStorage,
  type PuzzleSessionSnapshot,
} from './PuzzleSessionPersistence';

function layout(): PuzzleLayout {
  return {
    cutterId: 'classic',
    image: { uri: 'https://example.test/puzzle.jpg', width: 1200, height: 800 },
    boardSize: { width: 100, height: 80 },
    pieces: [
      {
        id: 'classic-0-0',
        index: 0,
        row: 0,
        col: 0,
        path: 'M 0 0 L 40 0 L 40 30 L 0 30 Z',
        bounds: { x: 0, y: 0, width: 40, height: 30 },
        clipRegion: { x: 0, y: 0, width: 0.4, height: 0.375 },
        correctPosition: { x: 0, y: 0 },
        correctRotation: 0,
        neighborIds: [],
      },
    ],
  };
}

function sessionSnapshot(): PuzzleSessionSnapshot {
  const engine = new PuzzleEngine(layout());
  engine.start(1_000);
  engine.selectPiece('classic-0-0');

  return {
    cutterId: 'classic',
    difficulty: '3x3',
    engine: engine.getSnapshot(),
  };
}

class MemoryStorage implements AsyncKeyValueStorage {
  value: string | null = null;
  setCalls = 0;
  removeCalls = 0;

  async getItem(): Promise<string | null> {
    return this.value;
  }

  async setItem(_key: string, value: string): Promise<void> {
    this.setCalls += 1;
    this.value = value;
  }

  async removeItem(): Promise<void> {
    this.removeCalls += 1;
    this.value = null;
  }
}

describe('puzzle session persistence codec', () => {
  it('round-trips a versioned session without transient engine feedback', () => {
    const source = sessionSnapshot();
    const accidentallyRuntimeShaped = {
      ...source,
      engine: {
        ...source.engine,
        selectedPieceId: 'classic-0-0',
        snapFeedback: { pieceId: 'classic-0-0', kind: 'connect' },
      },
    };
    const serialized = serializePuzzleSession(accidentallyRuntimeShaped, 1234);
    const restored = deserializePuzzleSession(serialized);

    expect(restored).toEqual({
      ...source,
      guideMode: 'cuts',
      savedAt: 1234,
      engine: {
        ...source.engine,
        activeElapsedMs: 234,
        activeStartedAt: null,
      },
    });
    expect(serialized).not.toContain('selectedPieceId');
    expect(serialized).not.toContain('snapFeedback');

    const engine = PuzzleEngine.fromSnapshot(
      restored?.engine as PuzzleEngineSnapshot,
    );
    expect(engine.getState().selectedPieceId).toBeNull();
    expect(engine.getState().snapFeedback).toBeNull();
    engine.resume(10_000);
    expect(engine.getElapsedMs(11_000)).toBe(1_234);
  });

  it('rejects malformed and unsupported-version payloads', () => {
    expect(deserializePuzzleSession('{not-json')).toBeNull();

    const valid = JSON.parse(serializePuzzleSession(sessionSnapshot()));
    valid.engine.pieces['classic-0-0'].position.x = 'offscreen';
    expect(deserializePuzzleSession(JSON.stringify(valid))).toBeNull();

    valid.engine.pieces['classic-0-0'].position.x = 0;
    valid.version = PUZZLE_SESSION_SCHEMA_VERSION + 1;
    expect(deserializePuzzleSession(JSON.stringify(valid))).toBeNull();
  });

  it.each(['organic', 'biomorphic'] as const)(
    'preserves the %s cut descriptor needed for stable resize',
    (cutterId) => {
      const source = sessionSnapshot();
      const procedural: PuzzleSessionSnapshot = {
        ...source,
        cutterId,
        engine: {
          ...source.engine,
          layout: {
            ...source.engine.layout,
            cutterId,
            cutDescriptor: {
              cutterId,
              version: cutterId === 'biomorphic' ? 2 : 1,
              seed: 'stable-seed',
              rows: 3,
              columns: 3,
            },
          },
        },
      };

      expect(
        deserializePuzzleSession(serializePuzzleSession(procedural))?.engine
          .layout.cutDescriptor,
      ).toEqual(procedural.engine.layout.cutDescriptor);
    },
  );

  it('preserves validated photo attribution for resumed games', () => {
    const source = sessionSnapshot();
    const withAttribution: PuzzleSessionSnapshot = {
      ...source,
      engine: {
        ...source.engine,
        layout: {
          ...source.engine.layout,
          image: {
            ...source.engine.layout.image,
            uri:
              'file:///documents/frume-saved-puzzle/puzzle-a.jpg',
            remoteUri:
              'https://images.unsplash.com/photo-test?auto=format&w=1080',
            accessibilityLabel: 'A mountain lake beneath a cloudy sky',
            attribution: {
              photographerName: 'A Photographer',
              photographerUrl:
                'https://unsplash.com/@photographer?utm_source=frume&utm_medium=referral',
              sourceName: 'Unsplash',
              sourceUrl:
                'https://unsplash.com/?utm_source=frume&utm_medium=referral',
            },
          },
        },
      },
    };

    expect(
      deserializePuzzleSession(serializePuzzleSession(withAttribution))?.engine
        .layout.image,
    ).toEqual(withAttribution.engine.layout.image);
  });

  it('migrates a v1 wall-clock timer to paused active time at its last save', () => {
    const legacy = JSON.parse(
      serializePuzzleSession(sessionSnapshot(), 3_500),
    );
    legacy.version = 1;
    delete legacy.guideMode;
    delete legacy.engine.activeElapsedMs;
    delete legacy.engine.activeStartedAt;

    const restored = deserializePuzzleSession(JSON.stringify(legacy));

    expect(restored?.engine).toMatchObject({
      status: 'playing',
      startedAt: 1_000,
      activeElapsedMs: 2_500,
      activeStartedAt: null,
    });
    expect(restored?.guideMode).toBe('cuts');
    expect(
      JSON.parse(
        serializePuzzleSession(restored as PuzzleSessionSnapshot, 4_000),
      ).version,
    ).toBe(PUZZLE_SESSION_SCHEMA_VERSION);
  });

  it('rejects unsafe persisted attribution links', () => {
    const persisted = JSON.parse(serializePuzzleSession(sessionSnapshot()));
    persisted.engine.layout.image.attribution = {
      photographerName: 'A Photographer',
      photographerUrl: 'https://example.test/profile',
      sourceName: 'Unsplash',
      sourceUrl: 'https://unsplash.com/',
    };

    expect(deserializePuzzleSession(JSON.stringify(persisted))).toBeNull();
  });
});

describe('PuzzleSessionPersistence', () => {
  it('debounces writes and keeps only the latest snapshot', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const persistence = new PuzzleSessionPersistence(storage, {
      debounceMs: 100,
    });
    const first = sessionSnapshot();
    const second = {
      ...first,
      engine: { ...first.engine, moveCount: 7 },
    };

    persistence.schedule(first);
    persistence.schedule(second);
    await vi.advanceTimersByTimeAsync(100);
    await persistence.flush();

    expect(storage.setCalls).toBe(1);
    expect(deserializePuzzleSession(storage.value ?? '')?.engine.moveCount).toBe(7);
    vi.useRealTimers();
  });

  it('clears pending and stored state on explicit clear', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const persistence = new PuzzleSessionPersistence(storage, {
      debounceMs: 100,
    });
    await persistence.save(sessionSnapshot());
    persistence.schedule(sessionSnapshot());

    await persistence.clear();
    await vi.advanceTimersByTimeAsync(200);

    expect(storage.value).toBeNull();
    expect(storage.setCalls).toBe(1);
    expect(storage.removeCalls).toBe(1);
    vi.useRealTimers();
  });

  it('removes malformed persisted data instead of restoring it', async () => {
    const storage = new MemoryStorage();
    storage.value = '{"version":1,"engine":"broken"}';
    const persistence = new PuzzleSessionPersistence(storage);

    await expect(persistence.load()).resolves.toEqual({ status: 'empty' });
    expect(storage.value).toBeNull();
    expect(storage.removeCalls).toBe(1);
  });

  it('distinguishes a transient read failure from confirmed empty storage', async () => {
    const readError = new Error('native read failed');
    const storage: AsyncKeyValueStorage = {
      async getItem() {
        throw readError;
      },
      async setItem() {
        throw new Error('native write failed');
      },
      async removeItem() {
        throw new Error('native clear failed');
      },
    };
    const onError = vi.fn();
    const persistence = new PuzzleSessionPersistence(storage, { onError });

    await expect(persistence.load()).resolves.toEqual({
      status: 'error',
      error: readError,
    });
    await expect(persistence.save(sessionSnapshot())).resolves.toBe(false);
    await expect(persistence.clear()).resolves.toBe(false);
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it('reports confirmed empty storage explicitly', async () => {
    const persistence = new PuzzleSessionPersistence(new MemoryStorage());

    await expect(persistence.load()).resolves.toEqual({ status: 'empty' });
  });

  it('reports a validated stored session explicitly', async () => {
    const storage = new MemoryStorage();
    storage.value = serializePuzzleSession(sessionSnapshot(), 4_321);
    const persistence = new PuzzleSessionPersistence(storage);

    await expect(persistence.load()).resolves.toMatchObject({
      status: 'loaded',
      session: {
        cutterId: 'classic',
        difficulty: '3x3',
        savedAt: 4_321,
      },
    });
  });

  it('retains a failed write for retry and reports one result to concurrent flushes', async () => {
    const storage = new MemoryStorage();
    let failNextWrite = true;
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = async (key, value) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('disk temporarily unavailable');
      }
      await originalSetItem(key, value);
    };
    const persistence = new PuzzleSessionPersistence(storage);
    const snapshot = sessionSnapshot();
    persistence.schedule(snapshot);

    const first = persistence.flush();
    const duplicateLifecycleFlush = persistence.flush();
    await expect(first).resolves.toBe(false);
    await expect(duplicateLifecycleFlush).resolves.toBe(false);

    await expect(persistence.flush()).resolves.toBe(true);
    expect(deserializePuzzleSession(storage.value ?? '')?.engine.moveCount).toBe(
      snapshot.engine.moveCount,
    );
  });
});
