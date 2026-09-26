import { describe, expect, it, vi } from 'vitest';
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
import {
  PuzzleLibrary,
  libraryPuzzleId,
  PUZZLE_LIBRARY_KEY,
} from './PuzzleLibrary';
import { ClassicCutter } from '../cutters/classic/ClassicCutter';
import { PuzzleEngine } from '../engine/PuzzleEngine';
import type { PuzzleSessionSnapshot } from './PuzzleSessionPersistence';
async function snapshot(
  id: string,
  complete = false,
): Promise<PuzzleSessionSnapshot> {
  const layout = await ClassicCutter.generate(
    { uri: `file:///${id}.jpg`, width: 600, height: 600 },
    { difficulty: '3x3', boardMaxWidth: 300, boardMaxHeight: 300 },
  );
  const engine = new PuzzleEngine(layout);
  if (complete) layout.pieces.forEach((piece) => engine.assistPiece(piece.id));
  return {
    cutterId: 'classic',
    difficulty: '3x3',
    engine: engine.getSnapshot(),
  };
}
function store() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
}
describe('puzzle shelf and album', () => {
  it('keeps legacy shelf IDs and separates the same image in a newer cut catalog', async () => {
    const storage = store(), library = new PuzzleLibrary(storage);
    const old = await snapshot('same');
    old.cutterId = 'amoeba'; old.engine.layout.cutterId = 'amoeba';
    old.engine.layout.cutDescriptor = { cutterId: 'amoeba', version: 1, seed: 'same-seed', rows: 3, columns: 3 };
    const historicalId = libraryPuzzleId(old);
    const explicitLegacy = JSON.parse(JSON.stringify(old)) as PuzzleSessionSnapshot;
    explicitLegacy.engine.layout.cutDescriptor!.bakedLibraryVersion = 1;
    expect(libraryPuzzleId(explicitLegacy)).toBe(historicalId);
    const updated = JSON.parse(JSON.stringify(old)) as PuzzleSessionSnapshot;
    updated.engine.layout.cutDescriptor!.bakedLibraryVersion = 2;
    expect(libraryPuzzleId(updated)).not.toBe(historicalId);
    await library.remember(old); await library.remember(updated);
    expect(await library.load()).toHaveLength(2);
  });
  it('persists different games and updates a revisited game without duplication', async () => {
    const storage = store(),
      library = new PuzzleLibrary(storage);
    const first = await snapshot('first');
    await library.remember(first);
    await library.remember(await snapshot('second'));
    await library.remember(first);
    expect(
      (await new PuzzleLibrary(storage).load()).map((item) => item.id),
    ).toEqual([
      libraryPuzzleId(first),
      libraryPuzzleId(await snapshot('second')),
    ]);
  });
  it('never evicts unfinished work when full, but allows a shelf swap', async () => {
    const library = new PuzzleLibrary(store());
    const games = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((id) => snapshot(id)),
    );
    for (const game of games.slice(0, 4)) await library.remember(game);
    await expect(library.remember(games[4])).rejects.toThrow('shelf is full');
    expect(await library.load()).toHaveLength(4);
    await library.remember(games[4], libraryPuzzleId(games[0]));
    await library.remove(libraryPuzzleId(games[0]));
    expect(await library.load()).toHaveLength(4);
  });
  it('keeps finished photographs independently from unfinished slots', async () => {
    const library = new PuzzleLibrary(store());
    for (const id of ['a', 'b', 'c', 'd'])
      await library.remember(await snapshot(id));
    await library.remember(await snapshot('finished', true));
    expect(await library.load()).toHaveLength(5);
  });
  it('preserves a completed picture when the same puzzle is played again', async () => {
    const library = new PuzzleLibrary(store());
    const completed = await snapshot('again', true);
    const replay = await snapshot('again');
    await library.remember(completed);
    await library.remember(replay);
    await library.remove(libraryPuzzleId(replay));
    expect((await library.load()).map((entry) => entry.id)).toEqual([
      libraryPuzzleId(completed),
    ]);
  });
  it('replaces a stale unfinished copy when that puzzle completes', async () => {
    const library = new PuzzleLibrary(store());
    await library.remember(await snapshot('completed'));
    const completed = await snapshot('completed', true);
    await library.remember(completed);
    expect((await library.load()).map((entry) => entry.id)).toEqual([
      libraryPuzzleId(completed),
    ]);
  });
  it('bounds the completed album without evicting waiting progress', async () => {
    const library = new PuzzleLibrary(store());
    const waiting = await snapshot('waiting');
    await library.remember(waiting);
    for (let index = 0; index < 26; index += 1)
      await library.remember(await snapshot(`finished-${index}`, true));
    const entries = await library.load();
    expect(
      entries.filter((entry) => entry.snapshot.engine.status === 'completed'),
    ).toHaveLength(24);
    expect(entries.some((entry) => entry.id === libraryPuzzleId(waiting))).toBe(
      true,
    );
    expect(
      entries.some(
        (entry) =>
          entry.snapshot.engine.layout.image.uri === 'file:///finished-0.jpg',
      ),
    ).toBe(false);
  });
  it('reports a durable save as successful even if a display subscriber throws', async () => {
    const storage = store();
    const library = new PuzzleLibrary(storage);
    const observer = vi.fn();
    library.subscribe(() => {
      throw new Error('screen unavailable');
    });
    library.subscribe(observer);
    await expect(
      library.remember(await snapshot('saved')),
    ).resolves.toBeUndefined();
    expect(await new PuzzleLibrary(storage).load()).toHaveLength(1);
    expect(observer).toHaveBeenCalledOnce();
  });
  it('fails closed on corrupt storage without replacing it', async () => {
    const storage = store();
    storage.values.set(PUZZLE_LIBRARY_KEY, '["broken"]');
    const library = new PuzzleLibrary(storage);
    await expect(library.remember(await snapshot('new'))).rejects.toThrow(
      'could not be read',
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('retains the previous durable collection on a failed write and accepts retry', async () => {
    const storage = store(),
      library = new PuzzleLibrary(storage);
    await library.remember(await snapshot('old'));
    storage.setItem.mockRejectedValueOnce(new Error('full'));
    await expect(library.remember(await snapshot('next'))).rejects.toThrow(
      'full',
    );
    expect(await library.load()).toHaveLength(1);
    await library.remember(await snapshot('next'));
    expect(await library.load()).toHaveLength(2);
  });
});
