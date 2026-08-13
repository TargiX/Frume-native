import type { PuzzleImageSource } from '../types';

export type PuzzleImageCacheSlot = 'a' | 'b';

/**
 * The adapter now exists only to remove local provider-image copies created by
 * older Frume builds. New API photographs are always rendered from the exact
 * `images.unsplash.com` URL returned by Unsplash.
 */
export type PuzzleImageFileStore = {
  slotForUri(uri: string): Promise<PuzzleImageCacheSlot | null>;
  exists(uri: string): Promise<boolean>;
  remove(slot: PuzzleImageCacheSlot): Promise<void>;
  clear(): Promise<void>;
};

export type PuzzleImageCacheResult = {
  image: PuzzleImageSource;
  /** The source can be resolved after relaunch; provider images need network. */
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

function providerUri(image: PuzzleImageSource): string | null {
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

function hotlinkedImage(
  image: PuzzleImageSource,
  remoteUri: string,
): PuzzleImageSource {
  return { ...image, uri: remoteUri, remoteUri };
}

/**
 * Serializes legacy-cache cleanup with session persistence. There is no
 * provider-image download path: hotlinking is the storage and display policy.
 */
export class PuzzleImageCache {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly store: PuzzleImageFileStore) {}

  cacheForReplacement(
    image: PuzzleImageSource,
    _currentImageUri?: string,
  ): Promise<PuzzleImageCacheResult> {
    return this.enqueue(async () => {
      const remoteUri = providerUri(image);
      if (remoteUri) {
        return { image: hotlinkedImage(image, remoteUri), durable: true };
      }

      // Player-owned/bundled files have their own explicit ownership policy.
      return { image, durable: !isNetworkUri(image.uri) };
    });
  }

  resolveForRestore(
    image: PuzzleImageSource,
  ): Promise<PuzzleImageCacheResult> {
    return this.enqueue(async () => {
      const remoteUri = providerUri(image);
      if (remoteUri) {
        // A pre-hotlinking save may point at one of the old document slots.
        // The persisted remoteUri is authoritative, so remove those copies.
        await this.store.clear().catch(() => undefined);
        return { image: hotlinkedImage(image, remoteUri), durable: true };
      }

      return { image, durable: !isNetworkUri(image.uri) };
    });
  }

  /** Removes every legacy provider copy after the matching snapshot commits. */
  retainOnly(_imageUri: string): Promise<void> {
    return this.enqueue(() => this.store.clear());
  }

  clear(): Promise<void> {
    return this.enqueue(() => this.store.clear());
  }

  /**
   * Reserves cleanup's place immediately, then waits for durable-state clear.
   * A later session start cannot overtake it.
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
