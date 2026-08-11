/**
 * Which puzzles are on the shelf, and which one gets cleared to make room.
 *
 * Frume used to keep exactly one saved puzzle: starting another quietly threw
 * the previous one away, which is the wrong bargain for something people leave
 * half-finished on purpose. The shelf holds several, and only pushes one off
 * when it is full — the one that has been untouched longest, never the one
 * being played.
 *
 * Pure arithmetic over records: no storage, no images, so the eviction rule can
 * be tested on its own.
 */

/** Beyond a handful the shelf stops being a shelf and becomes a file system. */
export const MAX_SHELF_PUZZLES = 4;

export type ShelfEntry = {
  id: string;
  /** Last time the player actually had this puzzle open. */
  touchedAt: number;
  placed: number;
  total: number;
};

export function isComplete(entry: ShelfEntry): boolean {
  return entry.total > 0 && entry.placed >= entry.total;
}

/**
 * Newest first, which is the order they are offered in: the puzzle you were
 * just playing is the one you most likely want back.
 */
export function orderShelf(entries: readonly ShelfEntry[]): ShelfEntry[] {
  return [...entries].sort((first, second) => second.touchedAt - first.touchedAt);
}

/**
 * The entry a new puzzle displaces, or null when there is room.
 *
 * A finished puzzle goes first however recently it was looked at — it is a
 * memory, not unfinished work. Otherwise the least recently touched loses.
 * `keepId` is the puzzle being played right now and is never chosen.
 */
export function entryToEvict(
  entries: readonly ShelfEntry[],
  keepId?: string,
  limit: number = MAX_SHELF_PUZZLES,
): ShelfEntry | null {
  if (entries.length < limit) {
    return null;
  }
  const candidates = entries.filter((entry) => entry.id !== keepId);
  if (candidates.length === 0) {
    return null;
  }

  const finished = candidates.filter(isComplete);
  const pool = finished.length > 0 ? finished : candidates;
  return pool.reduce((oldest, entry) =>
    entry.touchedAt < oldest.touchedAt ? entry : oldest,
  );
}

/** Records that this puzzle was just opened, so it survives the next eviction. */
export function touchEntry(
  entries: readonly ShelfEntry[],
  id: string,
  now: number,
): ShelfEntry[] {
  return entries.map((entry) =>
    entry.id === id ? { ...entry, touchedAt: now } : entry,
  );
}
