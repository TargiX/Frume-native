import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deserializePuzzleSession,
  serializePuzzleSession,
  type AsyncKeyValueStorage,
  type PuzzleSessionSnapshot,
  type RestoredPuzzleSession,
} from './PuzzleSessionPersistence';

export const PUZZLE_LIBRARY_KEY = '@frume/puzzle-library-v1';
export const MAX_WAITING_PUZZLES = 4;
const MAX_COMPLETED_PUZZLES = 24;
export type LibraryPuzzle = { id: string; snapshot: RestoredPuzzleSession };
/** Stable across resize and foregrounding; finished pictures survive a replay. */
export function libraryPuzzleId(
  snapshot: PuzzleSessionSnapshot,
  completed = snapshot.engine.status === 'completed',
): string {
  return JSON.stringify([
    snapshot.engine.layout.image.uri,
    snapshot.cutterId,
    snapshot.difficulty,
    snapshot.engine.layout.cutDescriptor?.seed ?? 'classic',
    completed ? 'album' : 'waiting',
  ]);
}
export class PuzzleLibrary {
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(private storage: AsyncKeyValueStorage = AsyncStorage) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async read(): Promise<LibraryPuzzle[]> {
    const raw = await this.storage.getItem(PUZZLE_LIBRARY_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 32)
      throw new Error(
        'The puzzle shelf could not be read. Your saved games have been kept.',
      );
    return value.map((item: unknown) => {
      const snapshot =
        typeof item === 'string' ? deserializePuzzleSession(item) : null;
      if (!snapshot)
        throw new Error(
          'The puzzle shelf could not be read. Your saved games have been kept.',
        );
      return { id: libraryPuzzleId(snapshot), snapshot };
    });
  }
  load(): Promise<LibraryPuzzle[]> {
    return this.enqueue(() => this.read());
  }
  remember(
    snapshot: PuzzleSessionSnapshot,
    resumingId?: string,
  ): Promise<void> {
    return this.enqueue(async () => {
      const id = libraryPuzzleId(snapshot);
      const entries = (await this.read()).filter(
        (entry) =>
          entry.id !== id &&
          (snapshot.engine.status !== 'completed' ||
            entry.id !== libraryPuzzleId(snapshot, false)),
      );
      const unfinished = entries.filter(
        (entry) =>
          entry.snapshot.engine.status !== 'completed' &&
          entry.id !== resumingId,
      );
      if (
        snapshot.engine.status !== 'completed' &&
        unfinished.length >= MAX_WAITING_PUZZLES
      ) {
        throw new Error(
          'Your shelf is full. Finish or remove a saved puzzle before starting another.',
        );
      }
      const restored = deserializePuzzleSession(
        serializePuzzleSession(snapshot),
      );
      if (!restored)
        throw new Error('This puzzle could not be saved to your shelf.');
      entries.unshift({ id, snapshot: restored });
      let completed = 0;
      await this.write(
        entries.filter(
          (entry) =>
            entry.snapshot.engine.status !== 'completed' ||
            ++completed <= MAX_COMPLETED_PUZZLES,
        ),
      );
    });
  }
  remove(id: string): Promise<void> {
    return this.enqueue(async () =>
      this.write((await this.read()).filter((entry) => entry.id !== id)),
    );
  }
  private async write(entries: LibraryPuzzle[]): Promise<void> {
    await this.storage.setItem(
      PUZZLE_LIBRARY_KEY,
      JSON.stringify(
        entries.map((entry) =>
          serializePuzzleSession(entry.snapshot, entry.snapshot.savedAt),
        ),
      ),
    );
    // Subscribers cannot change the outcome of an already committed write.
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* A later load can refresh a failed display observer. */
      }
    }
  }
}
export const puzzleLibrary = new PuzzleLibrary();
