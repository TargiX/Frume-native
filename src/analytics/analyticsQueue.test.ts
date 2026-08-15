import { describe, expect, it, vi } from 'vitest';

import { AnalyticsApiError } from './analyticsApi';
import type { AnalyticsEvent } from './analyticsEvents';
import {
  ANALYTICS_QUEUE_SCHEMA_VERSION,
  AnalyticsQueue,
  type AnalyticsQueueStorage,
} from './analyticsQueue';

const event = (index: number): AnalyticsEvent => ({
  name: 'puzzle_started',
  properties: { cut_id: 'classic', piece_count: 9, source: 'theme' },
  occurredAt: 1_760_000_000_000 + index,
});

class MemoryStorage implements AnalyticsQueueStorage {
  value: string | null = null;

  async getItem(): Promise<string | null> {
    return this.value;
  }

  async setItem(_key: string, value: string): Promise<void> {
    this.value = value;
  }

  async removeItem(): Promise<void> {
    this.value = null;
  }

  pending(): AnalyticsEvent[] {
    if (!this.value) {
      return [];
    }
    return (JSON.parse(this.value) as { items: AnalyticsEvent[] }).items;
  }
}

describe('analytics queue', () => {
  it('drains everything in batches and empties storage', async () => {
    const storage = new MemoryStorage();
    const sent: AnalyticsEvent[][] = [];
    const queue = new AnalyticsQueue(
      storage,
      async (batch) => {
        sent.push([...batch]);
      },
      { batchSize: 2 },
    );

    for (let index = 0; index < 5; index += 1) {
      expect(await queue.enqueue(event(index))).toBe(true);
    }
    await queue.flush();

    expect(sent.map((batch) => batch.length)).toEqual([2, 2, 1]);
    expect(sent.flat().map((item) => item.occurredAt)).toEqual(
      Array.from({ length: 5 }, (_unused, index) => event(index).occurredAt),
    );
    expect(storage.pending()).toEqual([]);
  });

  it('rejects events that fall outside the declared contract', async () => {
    const storage = new MemoryStorage();
    const queue = new AnalyticsQueue(storage, async () => undefined);

    expect(
      await queue.enqueue({ name: 'sneaky_event', properties: {}, occurredAt: 1 }),
    ).toBe(false);
    expect(storage.pending()).toEqual([]);
  });

  it('keeps the newest events when the queue is full', async () => {
    const storage = new MemoryStorage();
    const queue = new AnalyticsQueue(storage, async () => undefined, {
      maxItems: 3,
    });

    for (let index = 0; index < 5; index += 1) {
      expect(await queue.enqueue(event(index))).toBe(true);
    }

    expect(storage.pending().map((item) => item.occurredAt)).toEqual([
      event(2).occurredAt,
      event(3).occurredAt,
      event(4).occurredAt,
    ]);
  });

  it('keeps events when delivery fails transiently', async () => {
    const storage = new MemoryStorage();
    const send = vi
      .fn<(batch: readonly AnalyticsEvent[]) => Promise<void>>()
      .mockRejectedValue(
        new AnalyticsApiError('offline', 'network_error'),
      );
    const queue = new AnalyticsQueue(storage, send);

    await queue.enqueue(event(0));
    await expect(queue.flush()).rejects.toBeInstanceOf(AnalyticsApiError);
    expect(storage.pending()).toHaveLength(1);
  });

  it('discards a permanently rejected batch and still drains the rest', async () => {
    const storage = new MemoryStorage();
    const send = vi
      .fn<(batch: readonly AnalyticsEvent[]) => Promise<void>>()
      .mockRejectedValueOnce(
        new AnalyticsApiError('bad request', 'request_failed', 400),
      )
      .mockResolvedValue(undefined);
    const queue = new AnalyticsQueue(storage, send, { batchSize: 1 });

    await queue.enqueue(event(0));
    await queue.enqueue(event(1));

    await expect(queue.flush()).rejects.toMatchObject({ status: 400 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(storage.pending()).toEqual([]);
  });

  it('retries a 429 rather than discarding it', async () => {
    const storage = new MemoryStorage();
    const send = vi
      .fn<(batch: readonly AnalyticsEvent[]) => Promise<void>>()
      .mockRejectedValue(
        new AnalyticsApiError('slow down', 'request_failed', 429),
      );
    const queue = new AnalyticsQueue(storage, send);

    await queue.enqueue(event(0));
    await expect(queue.flush()).rejects.toMatchObject({ status: 429 });
    expect(storage.pending()).toHaveLength(1);
  });

  it('does not resend a batch that overflow shifted away from the head', async () => {
    const storage = new MemoryStorage();
    const sent: AnalyticsEvent[][] = [];
    let injected = false;
    const queue: AnalyticsQueue = new AnalyticsQueue(
      storage,
      async (batch) => {
        sent.push([...batch]);
        if (injected) {
          return;
        }
        // A new event arrives while this batch is in flight. The queue is
        // already full, so accepting it drops the oldest entry and the batch
        // is no longer the head.
        injected = true;
        await queue.enqueue(event(100));
      },
      { maxItems: 3, batchSize: 2 },
    );

    for (let index = 0; index < 3; index += 1) {
      await queue.enqueue(event(index));
    }
    await queue.flush();

    const delivered = sent.flat().map((item) => item.occurredAt);
    expect(new Set(delivered).size).toBe(delivered.length);
    expect(storage.pending()).toEqual([]);
  });

  it('coalesces concurrent flushes into one drain', async () => {
    const storage = new MemoryStorage();
    let inFlight = 0;
    let maxInFlight = 0;
    const queue = new AnalyticsQueue(storage, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });

    await queue.enqueue(event(0));
    await Promise.all([queue.flush(), queue.flush(), queue.flush()]);

    expect(maxInFlight).toBe(1);
    expect(storage.pending()).toEqual([]);
  });

  it('discards hostile or superseded persisted data', async () => {
    const storage = new MemoryStorage();
    const queue = new AnalyticsQueue(storage, async () => undefined);

    storage.value = 'not json';
    expect(await queue.enqueue(event(0))).toBe(true);
    expect(storage.pending()).toHaveLength(1);

    storage.value = JSON.stringify({
      version: ANALYTICS_QUEUE_SCHEMA_VERSION + 1,
      items: [event(1)],
    });
    expect(await queue.enqueue(event(2))).toBe(true);
    expect(storage.pending().map((item) => item.occurredAt)).toEqual([
      event(2).occurredAt,
    ]);
  });

  it('drops invalid entries but preserves the valid ones around them', async () => {
    const storage = new MemoryStorage();
    const sent: AnalyticsEvent[] = [];
    const queue = new AnalyticsQueue(storage, async (batch) => {
      sent.push(...batch);
    });

    storage.value = JSON.stringify({
      version: ANALYTICS_QUEUE_SCHEMA_VERSION,
      items: [event(0), { name: 'nope' }, event(1)],
    });
    await queue.flush();

    expect(sent.map((item) => item.occurredAt)).toEqual([
      event(0).occurredAt,
      event(1).occurredAt,
    ]);
    expect(storage.pending()).toEqual([]);
  });

  it('clears everything for opt-out', async () => {
    const storage = new MemoryStorage();
    const queue = new AnalyticsQueue(storage, async () => undefined);

    await queue.enqueue(event(0));
    await queue.clear();

    expect(storage.value).toBeNull();
  });
});
