import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('expo-store-review', () => ({}));

import {
  COMPLETED_PUZZLES_STORAGE_KEY,
  recordCompletionForReview,
  shouldRequestReview,
} from './reviewPrompt';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(COMPLETED_PUZZLES_STORAGE_KEY, initial);
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => void values.set(key, value),
  };
}

function storeReview(available = true) {
  return {
    isAvailableAsync: async () => available,
    requestReview: vi.fn(async () => {}),
  };
}

const wait = async () => {};

describe('shouldRequestReview', () => {
  it('asks only on milestones, never after the first puzzle', () => {
    expect([1, 2, 3, 4, 5, 6, 12, 13].map(shouldRequestReview)).toEqual([
      false, true, false, false, true, false, true, false,
    ]);
  });
});

describe('recordCompletionForReview', () => {
  it('counts the first completion without asking', async () => {
    const storage = memoryStorage();
    const review = storeReview();
    await expect(recordCompletionForReview({ storage, storeReview: review, wait })).resolves.toBe('skipped');
    expect(storage.values.get(COMPLETED_PUZZLES_STORAGE_KEY)).toBe('1');
    expect(review.requestReview).not.toHaveBeenCalled();
  });

  it('asks on the second completion', async () => {
    const review = storeReview();
    await expect(recordCompletionForReview({ storage: memoryStorage('1'), storeReview: review, wait })).resolves.toBe('requested');
    expect(review.requestReview).toHaveBeenCalledOnce();
  });

  it('persists the count before the review delay', async () => {
    const storage = memoryStorage('1');
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const result = recordCompletionForReview({ storage, storeReview: storeReview(), wait: () => held });
    await vi.waitFor(() => expect(storage.values.get(COMPLETED_PUZZLES_STORAGE_KEY)).toBe('2'));
    release();
    await expect(result).resolves.toBe('requested');
  });

  it('gives overlapping completions distinct counts', async () => {
    const storage = memoryStorage('1');
    const review = storeReview();
    await Promise.all([
      recordCompletionForReview({ storage, storeReview: review, wait }),
      recordCompletionForReview({ storage, storeReview: review, wait }),
    ]);
    expect(storage.values.get(COMPLETED_PUZZLES_STORAGE_KEY)).toBe('3');
    expect(review.requestReview).toHaveBeenCalledOnce();
  });

  it('skips when the store cannot show a prompt', async () => {
    const review = storeReview(false);
    await expect(recordCompletionForReview({ storage: memoryStorage('1'), storeReview: review, wait })).resolves.toBe('skipped');
    expect(review.requestReview).not.toHaveBeenCalled();
  });

  it('treats a corrupt count as zero', async () => {
    const storage = memoryStorage('not a number');
    await recordCompletionForReview({ storage, storeReview: storeReview(), wait });
    expect(storage.values.get(COMPLETED_PUZZLES_STORAGE_KEY)).toBe('1');
  });

  it('never throws when storage fails', async () => {
    const storage = { getItem: async () => { throw new Error('disk'); }, setItem: async () => {} };
    await expect(recordCompletionForReview({ storage, storeReview: storeReview(), wait })).resolves.toBe('failed');
  });
});
