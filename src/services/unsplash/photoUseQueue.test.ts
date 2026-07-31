import { describe, expect, it, vi } from 'vitest';

import { PhotoApiError } from './photoApi';
import {
  PHOTO_USE_QUEUE_SCHEMA_VERSION,
  PhotoUseQueue,
  type PhotoUseEvent,
  type PhotoUseQueueStorage,
} from './photoUseQueue';

const downloadLocation = (id: string) =>
  `https://api.unsplash.com/photos/${id}/download?ixid=${id}-tracking`;
const trackingToken = (id: number) =>
  `00000000-0000-4000-8000-${id.toString(16).padStart(12, '0')}`;
const photoUseEvent = (id: string, tokenId: number): PhotoUseEvent => ({
  downloadLocation: downloadLocation(id),
  trackingToken: trackingToken(tokenId),
});

class MemoryStorage implements PhotoUseQueueStorage {
  value: string | null = null;
  getCalls = 0;
  setCalls = 0;
  removeCalls = 0;

  async getItem(): Promise<string | null> {
    this.getCalls += 1;
    return this.value;
  }

  async setItem(_key: string, value: string): Promise<void> {
    this.setCalls += 1;
    this.value = value;
  }

  async removeItem(): Promise<void> {
    this.removeCalls += 1;
    this.value = null;
  }

  pending(): PhotoUseEvent[] {
    if (!this.value) {
      return [];
    }
    return (JSON.parse(this.value) as { items: PhotoUseEvent[] }).items;
  }
}

describe('PhotoUseQueue', () => {
  it('persists a use before sending and removes it only after success', async () => {
    const storage = new MemoryStorage();
    const event = photoUseEvent('photo_1', 1);
    const send = vi.fn(async (sentEvent: PhotoUseEvent) => {
      expect(sentEvent).toEqual(event);
      expect(storage.pending()).toEqual([event]);
    });
    const queue = new PhotoUseQueue(storage, send);

    await expect(queue.enqueue(event)).resolves.toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(storage.pending()).toEqual([event]);

    await queue.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.value).toBeNull();
  });

  it('keeps failed sends and retries them from a new queue instance', async () => {
    const storage = new MemoryStorage();
    const event = photoUseEvent('photo_2', 2);
    const firstSend = vi.fn().mockRejectedValue(new Error('offline'));
    const firstLaunch = new PhotoUseQueue(storage, firstSend);

    await firstLaunch.enqueue(event);
    await expect(firstLaunch.flush()).rejects.toThrow('offline');
    expect(storage.pending()).toEqual([event]);

    const secondSend = vi.fn().mockResolvedValue(undefined);
    const nextLaunch = new PhotoUseQueue(storage, secondSend);
    await nextLaunch.flush();

    expect(secondSend).toHaveBeenCalledWith(event);
    expect(storage.value).toBeNull();
  });

  it('keeps a timed-out use durable until a later retry succeeds', async () => {
    const storage = new MemoryStorage();
    const event = photoUseEvent('deadline_retry', 3);
    const timeout = new PhotoApiError(
      'Photo service took too long to respond',
      'request_timeout',
    );
    const firstLaunch = new PhotoUseQueue(
      storage,
      vi.fn().mockRejectedValue(timeout),
    );

    await firstLaunch.enqueue(event);
    await expect(firstLaunch.flush()).rejects.toBe(timeout);
    expect(storage.pending()).toEqual([event]);

    const retrySend = vi.fn().mockResolvedValue(undefined);
    await new PhotoUseQueue(storage, retrySend).flush();

    expect(retrySend).toHaveBeenCalledWith(event);
    expect(storage.value).toBeNull();
  });

  it('keeps same-URL uses distinct and rejects a new event at capacity', async () => {
    const storage = new MemoryStorage();
    const queue = new PhotoUseQueue(storage, vi.fn(), { maxItems: 3 });
    const first = photoUseEvent('shared_photo', 10);
    const second = photoUseEvent('shared_photo', 11);
    const third = photoUseEvent('third', 12);
    const rejected = photoUseEvent('fourth', 13);

    await expect(queue.enqueue(first)).resolves.toBe(true);
    await expect(queue.enqueue(second)).resolves.toBe(true);
    await expect(queue.enqueue(third)).resolves.toBe(true);
    await expect(queue.enqueue(rejected)).resolves.toBe(false);

    expect(storage.pending()).toEqual([first, second, third]);
  });

  it('drains valid persisted events above a later lower capacity without dropping them', async () => {
    const storage = new MemoryStorage();
    const events = [
      photoUseEvent('legacy_one', 14),
      photoUseEvent('legacy_two', 15),
      photoUseEvent('legacy_three', 16),
      photoUseEvent('legacy_four', 17),
    ];
    storage.value = JSON.stringify({
      version: PHOTO_USE_QUEUE_SCHEMA_VERSION,
      items: events,
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const queue = new PhotoUseQueue(storage, send, { maxItems: 3 });

    await expect(
      queue.enqueue(photoUseEvent('new_use', 18)),
    ).resolves.toBe(false);
    await queue.flush();

    expect(send.mock.calls.map(([event]) => event)).toEqual(events);
    expect(storage.value).toBeNull();
  });

  it('rejects unsafe input and repairs persisted data before retrying', async () => {
    const storage = new MemoryStorage();
    const safe = photoUseEvent('safe_photo', 20);
    const secondSafeUse = photoUseEvent('safe_photo', 21);
    storage.value = JSON.stringify({
      version: PHOTO_USE_QUEUE_SCHEMA_VERSION,
      items: [
        {
          downloadLocation:
            'https://api.unsplash.com.evil.test/photos/nope/download',
          trackingToken: trackingToken(22),
        },
        safe,
        secondSafeUse,
        {
          downloadLocation:
            'https://api.unsplash.com/photos/fragment/download#unsafe',
          trackingToken: trackingToken(23),
        },
        {
          downloadLocation: downloadLocation('bad_token'),
          trackingToken: 'not-a-uuid',
        },
      ],
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const queue = new PhotoUseQueue(storage, send);

    await expect(
      queue.enqueue({
        downloadLocation: downloadLocation('new_invalid'),
        trackingToken: `${trackingToken(24)}-oversized`,
      }),
    ).resolves.toBe(false);
    await queue.flush();

    expect(send.mock.calls.map(([event]) => event)).toEqual([
      safe,
      secondSafeUse,
    ]);
    expect(storage.value).toBeNull();
  });

  it('does not hold local enqueue behind an in-flight network send', async () => {
    const storage = new MemoryStorage();
    const first = photoUseEvent('first', 30);
    const second = photoUseEvent('second', 31);
    let releaseFirst!: () => void;
    const firstSend = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const send = vi
      .fn<(event: PhotoUseEvent) => Promise<void>>()
      .mockImplementationOnce(() => firstSend)
      .mockResolvedValue(undefined);
    const queue = new PhotoUseQueue(storage, send);

    await queue.enqueue(first);
    const flush = queue.flush();
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(first));

    await expect(queue.enqueue(second)).resolves.toBe(true);
    expect(storage.pending()).toEqual([first, second]);

    releaseFirst();
    await flush;

    expect(send.mock.calls.map(([event]) => event)).toEqual([
      first,
      second,
    ]);
    expect(storage.value).toBeNull();
  });

  it('coalesces concurrent flush requests instead of retrying an outage', async () => {
    const storage = new MemoryStorage();
    const first = photoUseEvent('outage_head', 40);
    const second = photoUseEvent('queued_during_outage', 41);
    const networkError = new PhotoApiError(
      'Photo service is unavailable',
      'network_error',
    );
    let rejectSend!: (error: Error) => void;
    const pendingSend = new Promise<void>((_resolve, reject) => {
      rejectSend = reject;
    });
    const send = vi.fn().mockReturnValue(pendingSend);
    const queue = new PhotoUseQueue(storage, send);
    await queue.enqueue(first);

    const firstFlush = queue.flush();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await queue.enqueue(second);
    const concurrentFlush = queue.flush();

    expect(concurrentFlush).toBe(firstFlush);
    rejectSend(networkError);
    const results = await Promise.allSettled([firstFlush, concurrentFlush]);

    expect(results).toEqual([
      { status: 'rejected', reason: networkError },
      { status: 'rejected', reason: networkError },
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.pending()).toEqual([first, second]);
  });

  it('drops a permanent 4xx, continues later jobs, and still reports it', async () => {
    const storage = new MemoryStorage();
    const rejected = photoUseEvent('permanent_rejection', 50);
    const later = photoUseEvent('later_valid_use', 51);
    const permanentError = new PhotoApiError(
      'Invalid download location',
      'request_failed',
      400,
    );
    const send = vi
      .fn<(event: PhotoUseEvent) => Promise<void>>()
      .mockRejectedValueOnce(permanentError)
      .mockResolvedValue(undefined);
    const queue = new PhotoUseQueue(storage, send);
    await queue.enqueue(rejected);
    await queue.enqueue(later);

    await expect(queue.flush()).rejects.toBe(permanentError);

    expect(send.mock.calls.map(([event]) => event)).toEqual([
      rejected,
      later,
    ]);
    expect(storage.value).toBeNull();
  });

  it.each([
    [
      'network error',
      new PhotoApiError('Photo service is unavailable', 'network_error'),
    ],
    [
      'client deadline',
      new PhotoApiError('Photo service took too long to respond', 'request_timeout'),
    ],
    [
      'HTTP 408',
      new PhotoApiError('Request timeout', 'request_failed', 408),
    ],
    [
      'HTTP 429',
      new PhotoApiError('Rate limited', 'request_failed', 429),
    ],
    [
      'HTTP 503',
      new PhotoApiError('Unavailable', 'request_failed', 503),
    ],
  ])('keeps the head item after a transient %s', async (_label, error) => {
    const storage = new MemoryStorage();
    const blocked = photoUseEvent('retry_later', 60);
    const later = photoUseEvent('not_sent_yet', 61);
    const send = vi.fn().mockRejectedValue(error);
    const queue = new PhotoUseQueue(storage, send);
    await queue.enqueue(blocked);
    await queue.enqueue(later);

    await expect(queue.flush()).rejects.toBe(error);

    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.pending()).toEqual([blocked, later]);
  });
});
