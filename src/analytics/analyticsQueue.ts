import { AnalyticsApiError } from './analyticsApi';
import {
  normalizeAnalyticsEvent,
  sameAnalyticsEvent,
  type AnalyticsEvent,
} from './analyticsEvents';

export const ANALYTICS_QUEUE_SCHEMA_VERSION = 1;
export const ANALYTICS_QUEUE_STORAGE_KEY = '@frume/analytics-queue';
export const MAX_PENDING_ANALYTICS_EVENTS = 200;
export const ANALYTICS_BATCH_SIZE = 20;

const MAX_SERIALIZED_CHARS_PER_ITEM = 512;

export type AnalyticsQueueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type AnalyticsBatchSender = (events: readonly AnalyticsEvent[]) => Promise<void>;

type PersistedAnalyticsQueue = {
  version: typeof ANALYTICS_QUEUE_SCHEMA_VERSION;
  items: AnalyticsEvent[];
};

type AnalyticsQueueOptions = {
  key?: string;
  maxItems?: number;
  batchSize?: number;
};

function serializeQueue(items: AnalyticsEvent[]): string {
  const persisted: PersistedAnalyticsQueue = {
    version: ANALYTICS_QUEUE_SCHEMA_VERSION,
    items,
  };
  return JSON.stringify(persisted);
}

/**
 * A 4xx that is not 408 or 429 means the payload or the key is wrong, and
 * retrying forever would block every later event behind it.
 */
function isPermanentAnalyticsFailure(
  error: unknown,
): error is AnalyticsApiError {
  if (!(error instanceof AnalyticsApiError) || error.status === undefined) {
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
 * Durable FIFO queue of pending analytics events.
 *
 * Deliberately shaped like `PhotoUseQueue`, with two differences that follow
 * from analytics being best-effort rather than a provider obligation:
 *
 * - At capacity the **oldest** events are discarded rather than rejecting the
 *   newest. A player who has been offline for a week is better measured by this
 *   week's funnel than by last week's opening events.
 * - Draining sends batches rather than single events, because the capture
 *   endpoint accepts them and a queue built up offline should not cost one
 *   request per event on the next foreground.
 *
 * Storage is never held while a request is in flight, so gameplay can keep
 * recording events during a slow drain.
 */
export class AnalyticsQueue {
  private readonly key: string;
  private readonly maxItems: number;
  private readonly batchSize: number;
  private storageTail: Promise<void> = Promise.resolve();
  private flushPromise: Promise<void> | null = null;
  private flushRequested = false;

  constructor(
    private readonly storage: AnalyticsQueueStorage,
    private readonly send: AnalyticsBatchSender,
    options: AnalyticsQueueOptions = {},
  ) {
    const maxItems = options.maxItems ?? MAX_PENDING_ANALYTICS_EVENTS;
    const batchSize = options.batchSize ?? ANALYTICS_BATCH_SIZE;
    if (!Number.isInteger(maxItems) || maxItems <= 0) {
      throw new Error('Analytics queue maxItems must be a positive integer');
    }
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error('Analytics queue batchSize must be a positive integer');
    }
    this.key = options.key ?? ANALYTICS_QUEUE_STORAGE_KEY;
    this.maxItems = maxItems;
    this.batchSize = batchSize;
  }

  /** Returns false when the event does not satisfy the declared contract. */
  async enqueue(event: unknown): Promise<boolean> {
    const normalized = normalizeAnalyticsEvent(event);
    if (!normalized) {
      return false;
    }

    return this.withStorage(async () => {
      const items = await this.readQueue();
      const next = [...items, normalized];
      await this.writeQueue(
        next.length > this.maxItems ? next.slice(next.length - this.maxItems) : next,
      );
      return true;
    });
  }

  /** Coalesces concurrent callers into one serialized drain. */
  flush(): Promise<void> {
    this.flushRequested = true;
    if (this.flushPromise) {
      return this.flushPromise;
    }

    const run = this.runFlushes();
    this.flushPromise = run;
    return run;
  }

  /** Drops every pending event, for opt-out. */
  async clear(): Promise<void> {
    await this.withStorage(async () => {
      await this.storage.removeItem(this.key);
    });
  }

  private async runFlushes(): Promise<void> {
    let firstPermanentFailure: AnalyticsApiError | null = null;
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
      // Cleared before this promise settles so a new caller can never receive a
      // completed drain for work it just enqueued.
      this.flushPromise = null;
    }
  }

  private async drain(): Promise<AnalyticsApiError | null> {
    let firstPermanentFailure: AnalyticsApiError | null = null;

    while (true) {
      const batch = await this.withStorage(async () => {
        const items = await this.readQueue();
        return items.slice(0, this.batchSize);
      });
      if (batch.length === 0) {
        return firstPermanentFailure;
      }

      try {
        await this.send(batch);
      } catch (error) {
        if (!isPermanentAnalyticsFailure(error)) {
          throw error;
        }
        await this.removeDelivered(batch);
        firstPermanentFailure ??= error;
        continue;
      }

      await this.removeDelivered(batch);
    }
  }

  /**
   * Removes the settled events by matching them wherever they sit, rather than
   * assuming they are still the head.
   *
   * A full queue that overflows during an in-flight send drops its oldest
   * entries, which shifts the batch away from the front. Removing a fixed-size
   * prefix would then delete the wrong events, and refusing to remove anything
   * would send this batch again on the next pass. Matching consumes exactly one
   * queued copy per settled event, so neither happens.
   */
  private async removeDelivered(batch: readonly AnalyticsEvent[]): Promise<void> {
    await this.withStorage(async () => {
      const items = await this.readQueue();
      const settled = [...batch];
      const remaining: AnalyticsEvent[] = [];
      for (const item of items) {
        const index = settled.findIndex((sent) => sameAnalyticsEvent(sent, item));
        if (index === -1) {
          remaining.push(item);
          continue;
        }
        settled.splice(index, 1);
      }
      if (remaining.length === items.length) {
        return;
      }
      await this.writeQueue(remaining);
    });
  }

  /**
   * Reads hostile persisted data into one canonical, bounded queue. Invalid
   * entries are not real events and are safely discarded.
   */
  private async readQueue(): Promise<AnalyticsEvent[]> {
    const raw = await this.storage.getItem(this.key);
    if (raw === null) {
      return [];
    }
    if (
      raw.length >
      Math.max(this.maxItems, MAX_PENDING_ANALYTICS_EVENTS) *
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
      parsed.version !== ANALYTICS_QUEUE_SCHEMA_VERSION ||
      !('items' in parsed) ||
      !Array.isArray(parsed.items)
    ) {
      await this.storage.removeItem(this.key);
      return [];
    }

    const items: AnalyticsEvent[] = [];
    for (const item of parsed.items) {
      const normalized = normalizeAnalyticsEvent(item);
      if (normalized) {
        items.push(normalized);
      }
    }
    // A later build may lower maxItems while older valid events are pending.
    // Keep the newest, matching the enqueue policy above.
    const bounded =
      items.length > this.maxItems
        ? items.slice(items.length - this.maxItems)
        : items;
    const canonical = serializeQueue(bounded);
    if (canonical !== raw) {
      await this.writeQueue(bounded);
    }
    return bounded;
  }

  private async writeQueue(items: AnalyticsEvent[]): Promise<void> {
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
