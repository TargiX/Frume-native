import { describe, expect, it } from 'vitest';

import type { PuzzleImageSource } from '../types';
import {
  MAX_CACHED_PUZZLE_IMAGE_BYTES,
  PuzzleImageCache,
  type CachedPuzzleImageFile,
  type PuzzleImageCacheSlot,
  type PuzzleImageFileStore,
} from './PuzzleImageCache';

const REMOTE_A =
  'https://images.unsplash.com/photo-a?auto=format&w=1080';
const REMOTE_B =
  'https://images.unsplash.com/photo-b?auto=format&w=1080';

class MemoryImageStore implements PuzzleImageFileStore {
  readonly uris: Record<PuzzleImageCacheSlot, string> = {
    a: 'file:///documents/frume-saved-puzzle/puzzle-a.jpg',
    b: 'file:///documents/frume-saved-puzzle/puzzle-b.jpg',
  };
  readonly files = new Map<PuzzleImageCacheSlot, number>();
  readonly downloads: Array<{
    slot: PuzzleImageCacheSlot;
    remoteUri: string;
  }> = [];
  nextSize = 2_000_000;
  failNextDownload = false;

  async slotForUri(uri: string): Promise<PuzzleImageCacheSlot | null> {
    return (['a', 'b'] as const).find((slot) => this.uris[slot] === uri) ?? null;
  }

  async exists(uri: string): Promise<boolean> {
    const slot = await this.slotForUri(uri);
    return slot !== null && this.files.has(slot);
  }

  async replaceFromRemote(
    slot: PuzzleImageCacheSlot,
    remoteUri: string,
    _maximumBytes: number,
  ): Promise<CachedPuzzleImageFile> {
    this.downloads.push({ slot, remoteUri });
    if (this.failNextDownload) {
      this.failNextDownload = false;
      throw new Error('offline');
    }
    this.files.set(slot, this.nextSize);
    return { uri: this.uris[slot], sizeBytes: this.nextSize };
  }

  async remove(slot: PuzzleImageCacheSlot): Promise<void> {
    this.files.delete(slot);
  }

  async clear(): Promise<void> {
    this.files.clear();
  }
}

function image(uri = REMOTE_B): PuzzleImageSource {
  return { uri, width: 1_080, height: 720 };
}

describe('PuzzleImageCache', () => {
  it('reserves cleanup ahead of a newer replacement while storage clear is delayed', async () => {
    const store = new MemoryImageStore();
    store.files.set('a', 1_000_000);
    const cache = new PuzzleImageCache(store);
    let finishStorageClear: ((cleared: boolean) => void) | undefined;
    const storageClear = new Promise<boolean>((resolve) => {
      finishStorageClear = resolve;
    });

    const cleanup = cache.clearAfter(storageClear);
    const replacement = cache.cacheForReplacement(
      image(),
      store.uris.a,
    );

    await Promise.resolve();
    expect(store.downloads).toEqual([]);

    finishStorageClear?.(true);
    await expect(cleanup).resolves.toBe(true);
    const result = await replacement;

    expect(result).toEqual({
      durable: true,
      image: {
        ...image(),
        uri: store.uris.b,
        remoteUri: REMOTE_B,
      },
    });
    expect([...store.files.keys()]).toEqual(['b']);
  });

  it('stages into the other fixed slot and prunes the old image only after save', async () => {
    const store = new MemoryImageStore();
    store.files.set('a', 1_000_000);
    const cache = new PuzzleImageCache(store);

    const result = await cache.cacheForReplacement(
      image(),
      store.uris.a,
    );

    expect(result).toEqual({
      durable: true,
      image: {
        ...image(),
        uri: store.uris.b,
        remoteUri: REMOTE_B,
      },
    });
    expect(store.files.has('a')).toBe(true);
    expect(store.files.has('b')).toBe(true);

    await cache.retainOnly(result.image.uri);
    expect([...store.files.keys()]).toEqual(['b']);
  });

  it('keeps the previous slot when a replacement download fails', async () => {
    const store = new MemoryImageStore();
    store.files.set('a', 1_000_000);
    store.failNextDownload = true;
    const cache = new PuzzleImageCache(store);

    await expect(
      cache.cacheForReplacement(image(), store.uris.a),
    ).resolves.toEqual({ image: image(), durable: false });
    expect([...store.files.keys()]).toEqual(['a']);
  });

  it('rejects an oversized candidate without growing durable storage', async () => {
    const store = new MemoryImageStore();
    store.files.set('a', 1_000_000);
    store.nextSize = MAX_CACHED_PUZZLE_IMAGE_BYTES + 1;
    const cache = new PuzzleImageCache(store);

    const result = await cache.cacheForReplacement(
      image(),
      store.uris.a,
    );

    expect(result.durable).toBe(false);
    expect([...store.files.keys()]).toEqual(['a']);
  });

  it('restores an existing local image without touching the network', async () => {
    const store = new MemoryImageStore();
    store.files.set('a', 1_000_000);
    const cache = new PuzzleImageCache(store);
    const local = {
      ...image(),
      uri: store.uris.a,
      remoteUri: REMOTE_A,
    };

    await expect(cache.resolveForRestore(local)).resolves.toEqual({
      image: local,
      durable: true,
    });
    expect(store.downloads).toEqual([]);
  });

  it('migrates a remote-only save and keeps its remote fallback URL', async () => {
    const store = new MemoryImageStore();
    const cache = new PuzzleImageCache(store);

    const result = await cache.resolveForRestore(image(REMOTE_A));

    expect(result).toEqual({
      durable: true,
      image: {
        ...image(REMOTE_A),
        uri: store.uris.a,
        remoteUri: REMOTE_A,
      },
    });
    expect(store.downloads).toEqual([
      { slot: 'a', remoteUri: REMOTE_A },
    ]);
  });

  it('falls back to the provider URL when a local file is missing offline', async () => {
    const store = new MemoryImageStore();
    store.failNextDownload = true;
    const cache = new PuzzleImageCache(store);
    const missing = {
      ...image(),
      uri: store.uris.a,
      remoteUri: REMOTE_A,
    };

    await expect(cache.resolveForRestore(missing)).resolves.toEqual({
      durable: false,
      image: {
        ...missing,
        uri: REMOTE_A,
      },
    });
    expect(store.files.size).toBe(0);
  });
});
