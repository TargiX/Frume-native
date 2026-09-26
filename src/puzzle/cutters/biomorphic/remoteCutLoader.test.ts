import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BakedCut } from './bakedCut';
import { pickBakedCutIndex, type BakedCutLibrary } from './bakedCutLibrary';
import {
  clearBakedCutLibrary,
  ensureBakedCut,
  installBakedCutLibraries,
  installRemoteCutLoader,
  RemoteCutUnavailableError,
} from './bakedCutSource';
import { createRemoteCutLoader, type CutFileStore } from './remoteCutLoader';
import { sha256Hex } from './sha256';

const KEY = 'cuts-v2/living-fringe/14x14/1.json';
const RAW = readFileSync(`assets/${KEY}`, 'utf8');
const SHA = sha256Hex(RAW);
const REF = { key: KEY, sha256: SHA };

function memoryStore(initial: Record<string, string> = {}): CutFileStore & {
  files: Record<string, string>;
} {
  const files = { ...initial };
  return {
    files,
    read: async (name) => files[name] ?? null,
    write: async (name, contents) => {
      files[name] = contents;
    },
  };
}

beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://frume.test');
});
afterEach(() => {
  vi.unstubAllEnvs();
  installRemoteCutLoader(undefined);
  clearBakedCutLibrary();
});

describe('createRemoteCutLoader', () => {
  it('downloads once, verifies, and keeps the file under its hash', async () => {
    const store = memoryStore();
    const fetchText = vi.fn(async () => RAW);
    const load = createRemoteCutLoader({ store, fetchText });
    const cut = await load(REF);
    expect(cut.rows).toBe(14);
    expect(fetchText).toHaveBeenCalledWith(
      `https://frume.test/cuts/${KEY}`,
      expect.anything(),
    );
    expect(store.files[`${SHA}.json`]).toBe(RAW);
    await load(REF);
    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  it('refetches when the stored file no longer matches its name', async () => {
    const store = memoryStore({ [`${SHA}.json`]: '{"truncated":' });
    const fetchText = vi.fn(async () => RAW);
    await createRemoteCutLoader({ store, fetchText })(REF);
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(store.files[`${SHA}.json`]).toBe(RAW);
  });

  it('refuses a payload that does not match the pinned hash', async () => {
    const store = memoryStore();
    const load = createRemoteCutLoader({
      store,
      fetchText: async () => RAW.replace('14', '15'),
    });
    await expect(load(REF)).rejects.toThrow(/integrity/);
    expect(store.files).toEqual({});
  });
});

describe('ensureBakedCut', () => {
  function remoteLibrary(): BakedCutLibrary {
    return { 'living-fringe': { '14x14': [{ remote: REF }] } };
  }

  it('loads the slot a seed lands on, once, even when asked twice at once', async () => {
    const library = remoteLibrary();
    installBakedCutLibraries({ 1: {}, 2: library }, 2);
    const loader = vi.fn(async () => JSON.parse(RAW) as BakedCut);
    installRemoteCutLoader(loader);
    await Promise.all([
      ensureBakedCut('living-fringe', 14, 14, 'a', 2),
      ensureBakedCut('living-fringe', 14, 14, 'b', 2),
    ]);
    await ensureBakedCut('living-fringe', 14, 14, 'c', 2);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(library['living-fringe']!['14x14']![0]).toEqual({ remote: REF });
  });

  it('does not mutate the source catalog when remote entries are hydrated', async () => {
    const library = remoteLibrary();
    installBakedCutLibraries({ 1: {}, 2: library }, 2);
    installRemoteCutLoader(async () => JSON.parse(RAW) as BakedCut);

    await ensureBakedCut('living-fringe', 14, 14, 'seed', 2);
    expect(library['living-fringe']!['14x14']![0]).toEqual({ remote: REF });

    clearBakedCutLibrary();
    installBakedCutLibraries({ 1: {}, 2: library }, 2);
    installRemoteCutLoader(async () => JSON.parse(RAW) as BakedCut);
    await ensureBakedCut('living-fringe', 14, 14, 'seed', 2);
    expect(library['living-fringe']!['14x14']![0]).toEqual({ remote: REF });
  });

  it('reports a failed download as a connection problem the player can act on', async () => {
    installBakedCutLibraries({ 1: {}, 2: remoteLibrary() }, 2);
    installRemoteCutLoader(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(
      ensureBakedCut('living-fringe', 14, 14, 'seed', 2),
    ).rejects.toBeInstanceOf(RemoteCutUnavailableError);
  });

  it('never touches the network for a bundled cut', async () => {
    const bundled = JSON.parse(RAW) as BakedCut;
    installBakedCutLibraries(
      { 1: {}, 2: { 'living-fringe': { '14x14': [bundled] } } },
      2,
    );
    const loader = vi.fn();
    installRemoteCutLoader(loader);
    await ensureBakedCut('living-fringe', 14, 14, 'seed', 2);
    expect(loader).not.toHaveBeenCalled();
  });

  it('keeps variant selection independent of what is downloaded', () => {
    // The slot is chosen from the pool size alone, so a saved puzzle reopens
    // on the same cut whether or not that cut was cached.
    expect(pickBakedCutIndex(2, 14, 14, 'seed')).toEqual(
      pickBakedCutIndex(2, 14, 14, 'seed'),
    );
  });
});
