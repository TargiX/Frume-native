import { PhotoApiError } from './photoApi';
import {
  normalizePhotoTrackingToken,
  normalizeUnsplashDownloadLocation,
} from './photoValidation';

export const PHOTO_USE_QUEUE_SCHEMA_VERSION = 2;
export const PHOTO_USE_QUEUE_STORAGE_KEY = '@frume/unsplash-photo-use-queue';
export const MAX_PENDING_PHOTO_USES = 100;

const MAX_SERIALIZED_CHARS_PER_ITEM = 2_200;

export type PhotoUseEvent = {
  downloadLocation: string;
  trackingToken: string;
};

export type PhotoUseQueueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type PhotoUseSender = (event: PhotoUseEvent) => Promise<void>;

type PersistedPhotoUseQueue = {
  version: typeof PHOTO_USE_QUEUE_SCHEMA_VERSION;
  items: PhotoUseEvent[];
};

type PhotoUseQueueOptions = {
  key?: string;
  maxItems?: number;
};

function serializeQueue(items: PhotoUseEvent[]): string {
  const persisted: PersistedPhotoUseQueue = {
    version: PHOTO_USE_QUEUE_SCHEMA_VERSION,
    items,
  };
  return JSON.stringify(persisted);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePhotoUseEvent(value: unknown): PhotoUseEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  const downloadLocation = normalizeUnsplashDownloadLocation(
    value.downloadLocation,
  );
  const trackingToken = normalizePhotoTrackingToken(value.trackingToken);
  return downloadLocation && trackingToken
    ? { downloadLocation, trackingToken }
    : null;
}

function samePhotoUseEvent(
  left: PhotoUseEvent,
  right: PhotoUseEvent,
): boolean {
  return (
    left.downloadLocation === right.downloadLocation &&
    left.trackingToken === right.trackingToken
  );
}

function isPermanentPhotoUseFailure(
  error: unknown,
): error is PhotoApiError {
  if (!(error instanceof PhotoApiError) || error.status === undefined) {
    return false;
  }
  return (
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

/**
 * Durable FIFO queue with serialized storage mutations and network drains.
 *
 * Storage is never held while a request is in flight, so another real photo
 * use can be persisted immediately even on a slow or offline connection.
 */
export class PhotoUseQueue {
  private readonly key: string;
  private readonly maxItems: number;
  private storageTail: Promise<void> = Promise.resolve();
  private flushPromise: Promise<void> | null = null;
  private flushRequested = false;

  constructor(
    private readonly storage: PhotoUseQueueStorage,
    private readonly send: PhotoUseSender,
    options: PhotoUseQueueOptions = {},
  ) {
    const maxItems = options.maxItems ?? MAX_PENDING_PHOTO_USES;
    if (!Number.isInteger(maxItems) || maxItems <= 0) {
      throw new Error('Photo use queue maxItems must be a positive integer');
    }
    this.key = options.key ?? PHOTO_USE_QUEUE_STORAGE_KEY;
    this.maxItems = maxItems;
  }

  /**
   * Returns false when the event is invalid or the durable queue is full.
   *
   * Every accepted call appends a distinct event, even when another pending
   * event has the same download URL or token. At capacity, existing durable
   * events are preserved and the new enqueue is rejected.
   */
  async enqueue(event: unknown): Promise<boolean> {
    const normalized = normalizePhotoUseEvent(event);
    if (!normalized) {
      return false;
    }

    return this.withStorage(async () => {
      const items = await this.readQueue();
      if (items.length >= this.maxItems) {
        return false;
      }
      await this.writeQueue([...items, normalized]);
      return true;
    });
  }

  /**
   * Coalesces concurrent callers into one serialized drain.
   *
   * Transient failures reject with the head item still persisted. Permanent
   * non-408/non-429 4xx items are removed so they cannot block later work, but
   * their first error is still reported after the remaining queue drains.
   */
  flush(): Promise<void> {
    this.flushRequested = true;
    if (this.flushPromise) {
      return this.flushPromise;
    }

    const run = this.runFlushes();
    this.flushPromise = run;
    return run;
  }

  private async runFlushes(): Promise<void> {
    let firstPermanentFailure: PhotoApiError | null = null;
    try {
      do {
        this.flushRequested = false;
        const permanentFailure = await this.drain();
        firstPermanentFailure ??= permanentFailure;
      } while (this.flushRequested);
      if (firstPermanentFailure) {
        throw firstPermanentFailure;
      }
    } finally {
      // Clear before this promise settles so a new caller can never receive a
      // completed drain for work it just enqueued.
      this.flushPromise = null;
    }
  }

  private async drain(): Promise<PhotoApiError | null> {
    let firstPermanentFailure: PhotoApiError | null = null;

    while (true) {
      const event = await this.withStorage(async () => {
        const items = await this.readQueue();
        return items[0] ?? null;
      });
      if (!event) {
        return firstPermanentFailure;
      }

      try {
        await this.send(event);
      } catch (error) {
        if (!isPermanentPhotoUseFailure(error)) {
          throw error;
        }
        await this.removeHead(event);
        firstPermanentFailure ??= error;
        continue;
      }

      await this.removeHead(event);
    }
  }

  private async removeHead(event: PhotoUseEvent): Promise<void> {
    await this.withStorage(async () => {
      const items = await this.readQueue();
      const head = items[0];
      if (!head || !samePhotoUseEvent(head, event)) {
        return;
      }
      items.shift();
      await this.writeQueue(items);
    });
  }

  /**
   * Reads hostile persisted data into one canonical, bounded queue.
   * Invalid entries are not real queue items and are safely discarded.
   */
  private async readQueue(): Promise<PhotoUseEvent[]> {
    const raw = await this.storage.getItem(this.key);
    if (raw === null) {
      return [];
    }
    if (
      raw.length >
      Math.max(this.maxItems, MAX_PENDING_PHOTO_USES) *
        MAX_SERIALIZED_CHARS_PER_ITEM +
        128
    ) {
      await this.storage.removeItem(this.key);
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await this.storage.removeItem(this.key);
      return [];
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !('version' in parsed) ||
      parsed.version !== PHOTO_USE_QUEUE_SCHEMA_VERSION ||
      !('items' in parsed) ||
      !Array.isArray(parsed.items)
    ) {
      await this.storage.removeItem(this.key);
      return [];
    }

    const items: PhotoUseEvent[] = [];
    for (const item of parsed.items) {
      const normalized = normalizePhotoUseEvent(item);
      if (normalized) {
        items.push(normalized);
      }
    }
    // The writer never creates an over-capacity queue, but a later app build
    // may lower maxItems while older valid events are still pending. Preserve
    // and drain those events instead of silently truncating compliance data.
    // The raw character limit above still bounds hostile persisted input.
    const canonical = serializeQueue(items);
    if (canonical !== raw) {
      await this.writeQueue(items);
    }
    return items;
  }

  private async writeQueue(items: PhotoUseEvent[]): Promise<void> {
    if (items.length === 0) {
      await this.storage.removeItem(this.key);
      return;
    }
    await this.storage.setItem(this.key, serializeQueue(items));
  }

  private withStorage<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.storageTail.then(operation, operation);
    this.storageTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
