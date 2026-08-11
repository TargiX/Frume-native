import { describe, expect, it } from 'vitest';

import {
  entryToEvict,
  MAX_SHELF_PUZZLES,
  orderShelf,
  touchEntry,
  type ShelfEntry,
} from './sessionShelf';

function entry(
  id: string,
  touchedAt: number,
  placed = 0,
  total = 25,
): ShelfEntry {
  return { id, touchedAt, placed, total };
}

describe('orderShelf', () => {
  it('offers the most recently played puzzle first', () => {
    const shelf = orderShelf([
      entry('a', 100),
      entry('b', 300),
      entry('c', 200),
    ]);
    expect(shelf.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('entryToEvict', () => {
  it('keeps everything while there is room', () => {
    expect(entryToEvict([entry('a', 1), entry('b', 2)])).toBeNull();
  });

  it('drops the puzzle untouched longest once the shelf is full', () => {
    const full = Array.from({ length: MAX_SHELF_PUZZLES }, (_, index) =>
      entry(`p${index}`, index + 1),
    );
    expect(entryToEvict(full)?.id).toBe('p0');
  });

  it('prefers a finished puzzle over unfinished work, however recent', () => {
    const shelf = [
      entry('old-unfinished', 1),
      entry('older-unfinished', 0),
      entry('just-finished', 999, 25, 25),
      entry('mid', 5),
    ];
    expect(entryToEvict(shelf)?.id).toBe('just-finished');
  });

  it('never clears the puzzle being played', () => {
    const shelf = [
      entry('oldest', 1),
      entry('a', 2),
      entry('b', 3),
      entry('c', 4),
    ];
    expect(entryToEvict(shelf, 'oldest')?.id).toBe('a');
  });

  it('gives up rather than evicting the only puzzle in play', () => {
    expect(entryToEvict([entry('solo', 1)], 'solo', 1)).toBeNull();
  });
});

describe('touchEntry', () => {
  it('moves a puzzle to the front of the queue when it is opened', () => {
    const shelf = touchEntry([entry('a', 1), entry('b', 2)], 'a', 50);
    expect(orderShelf(shelf).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('leaves the others alone', () => {
    const shelf = touchEntry([entry('a', 1), entry('b', 2)], 'a', 50);
    expect(shelf.find((item) => item.id === 'b')?.touchedAt).toBe(2);
  });
});
