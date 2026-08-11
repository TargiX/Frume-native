import type { PuzzleImageSource } from '../types';

export const MAX_CACHED_PUZZLE_IMAGE_BYTES = 20 * 1024 * 1024;

export type PuzzleImageCacheSlot = 'a' | 'b';

export type CachedPuzzleImageFile = {
  uri: string;
  sizeBytes: number;
};

export type PuzzleImageFileStore = {
  slotForUri(uri: string): Promise<PuzzleImageCacheSlot | null>;
  exists(uri: string): Promise<boolean>;
  replaceFromRemote(
    slot: PuzzleImageCacheSlot,
    remoteUri: string,
    maximumBytes: number,
  ): Promise<CachedPuzzleImageFile>;
  remove(slot: PuzzleImageCacheSlot): Promise<void>;
  clear(): Promise<void>;
};

export type PuzzleImageCacheResult = {
  image: PuzzleImageSource;
  durable: boolean;
};

function isProviderImageUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      (parsed.hostname === 'images.unsplash.com' ||
        parsed.hostname === 'plus.unsplash.com')
    );
  } catch {
    return false;
  }
}

function sourceUri(image: PuzzleImageSource): string | null {
  if (image.remoteUri && isProviderImageUri(image.remoteUri)) {
    return image.remoteUri;
  }
  return isProviderImageUri(image.uri) ? image.uri : null;
}

function isNetworkUri(uri: string): boolean {
  try {
    const protocol = new URL(uri).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function oppositeSlot(
  current: PuzzleImageCacheSlot | null,
): PuzzleImageCacheSlot {
  return current === 'a' ? 'b' : 'a';
}

/**
 * Keeps at most two fixed image files: the currently persisted puzzle and one
 * replacement candidate. The old file is retained until the new session has
 * reached AsyncStorage, closing the crash window between download and save.
 */
export class PuzzleImageCache {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly store: PuzzleImageFileStore) {}

  cacheForReplacement(
    image: PuzzleImageSource,
    currentImageUri?: string,
  ): Promise<PuzzleImageCacheResult> {
    return this.enqueue(async () => {
      const existingSlot = await this.store.slotForUri(image.uri);
      if (existingSlot && (await this.store.exists(image.uri))) {
        return { image, durable: true };
      }

      const remoteUri = sourceUri(image);
      if (!remoteUri) {
        // Bundled/local sources outside this cache already have their own
        // lifecycle and do not need to be copied.
        return { image, durable: !isNetworkUri(image.uri) };
      }

      const currentSlot = currentImageUri
        ? await this.store.slotForUri(currentImageUri)
        : null;
      const targetSlot = oppositeSlot(currentSlot);

      try {
        const cached = await this.store.replaceFromRemote(
          targetSlot,
          remoteUri,
          MAX_CACHED_PUZZLE_IMAGE_BYTES,
        );
        if (
          cached.sizeBytes <= 0 ||
          cached.sizeBytes > MAX_CACHED_PUZZLE_IMAGE_BYTES
        ) {
          await this.store.remove(targetSlot);
          return { image, durable: false };
        }
        return {
          image: {
            ...image,
            uri: cached.uri,
            remoteUri,
          },
          durable: true,
        };
      } catch {
        // The remote URI remains playable online; a failed candidate must not
        // invalidate the previous session's still-durable file.
        await this.store.remove(targetSlot).catch(() => undefined);
        return { image, durable: false };
      }
    });
  }

  resolveForRestore(
    image: PuzzleImageSource,
  ): Promise<PuzzleImageCacheResult> {
    return this.enqueue(async () => {
      const existingSlot = await this.store.slotForUri(image.uri);
      if (existingSlot && (await this.store.exists(image.uri))) {
        return { image, durable: true };
      }

      const remoteUri = sourceUri(image);
      if (!remoteUri) {
        return {
          image,
          durable:
            existingSlot === null && !isNetworkUri(image.uri),
        };
      }

      const targetSlot = oppositeSlot(existingSlot);
      try {
        const cached = await this.store.replaceFromRemote(
          targetSlot,
          remoteUri,
          MAX_CACHED_PUZZLE_IMAGE_BYTES,
        );
        if (
          cached.sizeBytes <= 0 ||
          cached.sizeBytes > MAX_CACHED_PUZZLE_IMAGE_BYTES
        ) {
          await this.store.remove(targetSlot);
          return {
            image: { ...image, uri: remoteUri, remoteUri },
            durable: false,
          };
        }
        return {
          image: {
            ...image,
            uri: cached.uri,
            remoteUri,
          },
          durable: true,
        };
      } catch {
        await this.store.remove(targetSlot).catch(() => undefined);
        return {
          image: { ...image, uri: remoteUri, remoteUri },
          durable: false,
        };
      }
    });
  }

  /**
   * Called only after the matching session snapshot is durable. This ordering
   * prevents a failed replacement from deleting the prior puzzle's image.
   */
  retainOnly(imageUri: string): Promise<void> {
    return this.enqueue(async () => {
      const retainedSlot = await this.store.slotForUri(imageUri);
      const slots: PuzzleImageCacheSlot[] = ['a', 'b'];
      await Promise.all(
        slots
          .filter((slot) => slot !== retainedSlot)
          .map((slot) => this.store.remove(slot).catch(() => undefined)),
      );
    });
  }

  clear(): Promise<void> {
    return this.enqueue(() => this.store.clear());
  }

  /**
   * Reserves cleanup's place in the cache queue immediately, then waits for
   * the related durable-state clear. Later replacements cannot overtake it.
   */
  clearAfter(shouldClear: Promise<boolean>): Promise<boolean> {
    return this.enqueue(async () => {
      if (!(await shouldClear)) {
        return false;
      }
      await this.store.clear();
      return true;
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
