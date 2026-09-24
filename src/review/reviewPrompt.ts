import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

export const COMPLETED_PUZZLES_STORAGE_KEY = '@frume/completed-puzzle-count';

/**
 * Completions after which the system rating prompt may appear. The first
 * finished puzzle is too early to ask; later milestones catch players who
 * kept coming back. iOS itself shows the prompt at most three times a year,
 * so asking here is a request, never a guarantee.
 */
export const REVIEW_PROMPT_MILESTONES: readonly number[] = [2, 5, 12];

/** Lets the finished picture land before the system rating sheet can appear. */
export const REVIEW_PROMPT_DELAY_MS = 1_500;

type ReviewStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type ReviewRequester = {
  isAvailableAsync(): Promise<boolean>;
  requestReview(): Promise<void>;
};

type ReviewPromptDependencies = {
  storage?: ReviewStorage;
  storeReview?: ReviewRequester;
  wait?: (ms: number) => Promise<void>;
};

export function shouldRequestReview(completedCount: number): boolean {
  return REVIEW_PROMPT_MILESTONES.includes(completedCount);
}

function parseCount(value: string | null): number {
  const parsed = value === null ? 0 : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

// Serialises read–increment–write so overlapping completions each get their
// own count instead of both reading the same value.
let pending: Promise<unknown> = Promise.resolve();

/**
 * Counts one finished puzzle immediately and, on a milestone, asks the system
 * for a rating after a short delay. Never throws: a failed rating prompt must
 * not disturb the completion screen.
 */
export function recordCompletionForReview({
  storage = AsyncStorage,
  storeReview = StoreReview,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: ReviewPromptDependencies = {}): Promise<'requested' | 'skipped' | 'failed'> {
  const counted = pending.then(async () => {
    const count =
      parseCount(await storage.getItem(COMPLETED_PUZZLES_STORAGE_KEY)) + 1;
    await storage.setItem(COMPLETED_PUZZLES_STORAGE_KEY, String(count));
    return count;
  });
  pending = counted.catch(() => undefined);
  return counted
    .then(async (count) => {
      if (!shouldRequestReview(count)) return 'skipped' as const;
      await wait(REVIEW_PROMPT_DELAY_MS);
      if (!(await storeReview.isAvailableAsync())) return 'skipped' as const;
      await storeReview.requestReview();
      return 'requested' as const;
    })
    .catch(() => 'failed' as const);
}
