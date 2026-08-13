import { describe, expect, it } from 'vitest';

import type { PuzzleImageSource } from '../types';
import {
  PuzzleImageCache,
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
  readonly files = new Set<PuzzleImageCacheSlot>();

  async slotForUri(uri: string): Promise<PuzzleImageCacheSlot | null> {
    return (['a', 'b'] as const).find((slot) => this.uris[slot] === uri) ?? null;
  }

  async exists(uri: string): Promise<boolean> {
    const slot = await this.slotForUri(uri);
    return slot !== null && this.files.has(slot);
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
  it('reserves cleanup ahead of a newer hotlinked replacement', async () => {
    const store = new MemoryImageStore();
    store.files.add('a');
    const cache = new PuzzleImageCache(store);
    let finishStorageClear: ((cleared: boolean) => void) | undefined;
    const storageClear = new Promise<boolean>((resolve) => {
      finishStorageClear = resolve;
    });

    const cleanup = cache.clearAfter(storageClear);
    const replacement = cache.cacheForReplacement(image(), store.uris.a);

    await Promise.resolve();
    expect(store.files.has('a')).toBe(true);

    finishStorageClear?.(true);
    await expect(cleanup).resolves.toBe(true);
    await expect(replacement).resolves.toEqual({
      durable: true,
      image: { ...image(), uri: REMOTE_B, remoteUri: REMOTE_B },
    });
    expect(store.files.size).toBe(0);
  });

  it('keeps a provider image on the API URL instead of downloading a copy', async () => {
    const store = new MemoryImageStore();
    store.files.add('a');
    const cache = new PuzzleImageCache(store);

    await expect(
      cache.cacheForReplacement(image(), store.uris.a),
    ).resolves.toEqual({
      durable: true,
      image: { ...image(), uri: REMOTE_B, remoteUri: REMOTE_B },
    });

    // The old cache remains rollback-safe until the matching session commits.
    expect([...store.files]).toEqual(['a']);
    await cache.retainOnly(REMOTE_B);
    expect(store.files.size).toBe(0);
  });

  it('migrates a legacy local provider copy back to its hotlinked URL', async () => {
    const store = new MemoryImageStore();
    store.files.add('a');
    const cache = new PuzzleImageCache(store);
    const legacy = { ...image(), uri: store.uris.a, remoteUri: REMOTE_A };

    await expect(cache.resolveForRestore(legacy)).resolves.toEqual({
      durable: true,
      image: { ...legacy, uri: REMOTE_A },
    });
    expect(store.files.size).toBe(0);
  });

  it('preserves a player-owned local image and its independent lifecycle', async () => {
    const store = new MemoryImageStore();
    const cache = new PuzzleImageCache(store);
    const local = image(
      'file:///documents/frume-own-photos/own-123.jpg',
    );

    await expect(cache.resolveForRestore(local)).resolves.toEqual({
      durable: true,
      image: local,
    });
    expect(store.files.size).toBe(0);
  });
});
