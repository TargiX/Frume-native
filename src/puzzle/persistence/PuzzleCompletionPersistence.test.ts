import { describe, expect, it, vi } from 'vitest';

import type { PuzzleEngineSnapshot } from '../types';
import {
  PuzzleCompletionPersistence,
  completionReceiptFromSnapshot,
  deserializePuzzleCompletionReceipt,
  serializePuzzleCompletionReceipt,
} from './PuzzleCompletionPersistence';

const image = {
  uri: 'https://images.unsplash.com/photo-complete',
  remoteUri: 'https://images.unsplash.com/photo-complete',
  width: 1_200,
  height: 800,
  contentSource: {
    kind: 'unsplash' as const,
    categoryId: 'nature',
    categoryLabel: 'Nature',
  },
  attribution: {
    photographerName: 'A Photographer',
    photographerUrl:
      'https://unsplash.com/@photo?utm_source=frume&utm_medium=referral',
    sourceName: 'Unsplash' as const,
    sourceUrl:
      'https://unsplash.com/?utm_source=frume&utm_medium=referral',
  },
};

const engine: PuzzleEngineSnapshot = {
  status: 'completed',
  layout: {
    cutterId: 'classic',
    image,
    boardSize: { width: 300, height: 200 },
    pieces: [
      {
        id: 'piece-0',
        index: 0,
        row: 0,
        col: 0,
        path: 'M0 0Z',
        bounds: { x: 0, y: 0, width: 300, height: 200 },
        clipRegion: { x: 0, y: 0, width: 1, height: 1 },
        correctPosition: { x: 0, y: 0 },
        correctRotation: 0,
        neighborIds: [],
      },
    ],
  },
  pieces: {
    'piece-0': {
      pieceId: 'piece-0',
      position: { x: 0, y: 0 },
      rotation: 0,
      locked: true,
      zIndex: 1,
      inTray: false,
      traySlot: 0,
    },
  },
  moveCount: 7,
  startedAt: 1_000,
  completedAt: 9_000,
  activeElapsedMs: 7_500,
  activeStartedAt: null,
};

class MemoryStorage {
  value: string | null = null;
  async getItem() {
    return this.value;
  }
  async setItem(_key: string, value: string) {
    this.value = value;
  }
  async removeItem() {
    this.value = null;
  }
}

describe('puzzle completion receipts', () => {
  it('keeps only compact result metadata and provider ownership', () => {
    const receipt = completionReceiptFromSnapshot(
      engine,
      'classic',
      '3x3',
      10_000,
    );

    expect(receipt).toMatchObject({
      completedAt: 9_000,
      recordedAt: 10_000,
      elapsedMs: 7_500,
      moveCount: 7,
      pieceCount: 1,
      cutterId: 'classic',
      difficulty: '3x3',
      image,
    });
    expect(JSON.stringify(receipt)).not.toContain('piece-0');
  });

  it('round-trips a valid receipt and rejects hostile image metadata', () => {
    const receipt = completionReceiptFromSnapshot(
      engine,
      'classic',
      '3x3',
      10_000,
    );
    expect(
      deserializePuzzleCompletionReceipt(
        serializePuzzleCompletionReceipt(receipt),
      ),
    ).toEqual(receipt);

    const hostile = JSON.parse(serializePuzzleCompletionReceipt(receipt));
    hostile.image.attribution.photographerUrl = 'javascript:alert(1)';
    expect(
      deserializePuzzleCompletionReceipt(JSON.stringify(hostile)),
    ).toBeNull();
  });

  it('persists, loads, and explicitly clears the last completion', async () => {
    const storage = new MemoryStorage();
    const onError = vi.fn();
    const persistence = new PuzzleCompletionPersistence(storage, { onError });
    const receipt = completionReceiptFromSnapshot(
      engine,
      'classic',
      '3x3',
      10_000,
    );

    await expect(persistence.save(receipt)).resolves.toBe(true);
    await expect(persistence.load()).resolves.toEqual({
      status: 'loaded',
      receipt,
    });
    await expect(persistence.clear()).resolves.toBe(true);
    await expect(persistence.load()).resolves.toEqual({ status: 'empty' });
    expect(onError).not.toHaveBeenCalled();
  });
});
