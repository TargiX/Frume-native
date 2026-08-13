import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  PuzzleCutterId,
  PuzzleDifficulty,
  PuzzleEngineSnapshot,
  PuzzleImageSource,
} from '../types';
import { PUZZLE_SIZES } from '../types';
import {
  parsePuzzleImageSource,
  type AsyncKeyValueStorage,
} from './PuzzleSessionPersistence';

const PUZZLE_COMPLETION_SCHEMA_VERSION = 1;
export const PUZZLE_COMPLETION_STORAGE_KEY = '@frume/puzzle-completion';

const CUTTER_IDS = new Set<PuzzleCutterId>([
  'classic',
  'organic',
  'biomorphic',
  'living-spectrum',
  'crystal',
  'crystal-quartered',
  'amoeba',
  'amoeba-columnar',
  'fractal',
]);
const DIFFICULTIES = new Set<PuzzleDifficulty>(
  PUZZLE_SIZES.map((size) => size.id),
);

export type PuzzleCompletionReceipt = {
  completedAt: number;
  recordedAt: number;
  elapsedMs: number;
  moveCount: number;
  pieceCount: number;
  cutterId: PuzzleCutterId;
  difficulty: PuzzleDifficulty;
  image: PuzzleImageSource;
};

export type PuzzleCompletionLoadResult =
  | { status: 'loaded'; receipt: PuzzleCompletionReceipt }
  | { status: 'empty' }
  | { status: 'error'; error: unknown };

type PersistedPuzzleCompletion = PuzzleCompletionReceipt & {
  version: typeof PUZZLE_COMPLETION_SCHEMA_VERSION;
};

type PuzzleCompletionPersistenceOptions = {
  key?: string;
  onError?: (error: unknown) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function completionReceiptFromSnapshot(
  engine: PuzzleEngineSnapshot,
  cutterId: PuzzleCutterId,
  difficulty: PuzzleDifficulty,
  recordedAt = Date.now(),
): PuzzleCompletionReceipt {
  if (engine.status !== 'completed') {
    throw new Error('Only a completed puzzle can create a completion receipt');
  }
  if (!isNonNegativeInteger(recordedAt)) {
    throw new Error('Invalid completion receipt time');
  }
  return {
    completedAt: engine.completedAt ?? recordedAt,
    recordedAt,
    elapsedMs: Math.max(0, Math.round(engine.activeElapsedMs)),
    moveCount: engine.moveCount,
    pieceCount: engine.layout.pieces.length,
    cutterId,
    difficulty,
    image: engine.layout.image,
  };
}

export function serializePuzzleCompletionReceipt(
  receipt: PuzzleCompletionReceipt,
): string {
  const persisted: PersistedPuzzleCompletion = {
    version: PUZZLE_COMPLETION_SCHEMA_VERSION,
    completedAt: receipt.completedAt,
    recordedAt: receipt.recordedAt,
    elapsedMs: receipt.elapsedMs,
    moveCount: receipt.moveCount,
    pieceCount: receipt.pieceCount,
    cutterId: receipt.cutterId,
    difficulty: receipt.difficulty,
    image: receipt.image,
  };
  return JSON.stringify(persisted);
}

export function deserializePuzzleCompletionReceipt(
  serialized: string,
): PuzzleCompletionReceipt | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (
      !isRecord(value) ||
      value.version !== PUZZLE_COMPLETION_SCHEMA_VERSION ||
      !isNonNegativeInteger(value.completedAt) ||
      !isNonNegativeInteger(value.recordedAt) ||
      value.completedAt > value.recordedAt ||
      !isNonNegativeInteger(value.elapsedMs) ||
      !isNonNegativeInteger(value.moveCount) ||
      !Number.isSafeInteger(value.pieceCount) ||
      (value.pieceCount as number) <= 0 ||
      (value.pieceCount as number) > 1_000 ||
      typeof value.cutterId !== 'string' ||
      !CUTTER_IDS.has(value.cutterId as PuzzleCutterId) ||
      typeof value.difficulty !== 'string' ||
      !DIFFICULTIES.has(value.difficulty as PuzzleDifficulty)
    ) {
      return null;
    }
    const image = parsePuzzleImageSource(value.image);
    if (!image) {
      return null;
    }
    return {
      completedAt: value.completedAt,
      recordedAt: value.recordedAt,
      elapsedMs: value.elapsedMs,
      moveCount: value.moveCount,
      pieceCount: value.pieceCount as number,
      cutterId: value.cutterId as PuzzleCutterId,
      difficulty: value.difficulty as PuzzleDifficulty,
      image,
    };
  } catch {
    return null;
  }
}

export class PuzzleCompletionPersistence {
  private readonly key: string;
  private readonly onError?: (error: unknown) => void;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: AsyncKeyValueStorage = AsyncStorage,
    options: PuzzleCompletionPersistenceOptions = {},
  ) {
    this.key = options.key ?? PUZZLE_COMPLETION_STORAGE_KEY;
    this.onError = options.onError;
  }

  load(): Promise<PuzzleCompletionLoadResult> {
    return this.enqueue(async () => {
      try {
        const serialized = await this.storage.getItem(this.key);
        if (serialized === null) {
          return { status: 'empty' };
        }
        const receipt = deserializePuzzleCompletionReceipt(serialized);
        if (!receipt) {
          await this.storage.removeItem(this.key);
          return { status: 'empty' };
        }
        return { status: 'loaded', receipt };
      } catch (error) {
        this.onError?.(error);
        return { status: 'error', error };
      }
    });
  }

  save(receipt: PuzzleCompletionReceipt): Promise<boolean> {
    let serialized: string;
    try {
      serialized = serializePuzzleCompletionReceipt(receipt);
      if (!deserializePuzzleCompletionReceipt(serialized)) {
        throw new Error('Invalid puzzle completion receipt');
      }
    } catch (error) {
      this.onError?.(error);
      return Promise.resolve(false);
    }
    return this.enqueue(async () => {
      try {
        await this.storage.setItem(this.key, serialized);
        return true;
      } catch (error) {
        this.onError?.(error);
        return false;
      }
    });
  }

  clear(): Promise<boolean> {
    return this.enqueue(async () => {
      try {
        await this.storage.removeItem(this.key);
        return true;
      } catch (error) {
        this.onError?.(error);
        return false;
      }
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
