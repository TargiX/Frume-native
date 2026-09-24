import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";

export const COMPLETED_PUZZLES_STORAGE_KEY = "@frume/completed-puzzle-count";

/**
 * Completions after which the system rating prompt may appear. The first
 * finished puzzle is too early to ask; later milestones catch players who
 * kept coming back. iOS itself shows the prompt at most three times a year,
 * so asking here is a request, never a guarantee.
 */
export const REVIEW_PROMPT_MILESTONES: readonly number[] = [2, 5, 12];

type ReviewStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type ReviewRequester = {
  isAvailableAsync(): Promise<boolean>;
  requestReview(): Promise<void>;
};

export function shouldRequestReview(completedCount: number): boolean {
  return REVIEW_PROMPT_MILESTONES.includes(completedCount);
}

function parseCount(value: string | null): number {
  const parsed = value === null ? 0 : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Counts one finished puzzle and, on a milestone, asks the system for a rating.
 * Never throws: a failed rating prompt must not disturb the completion screen.
 */
export async function recordCompletionForReview(
  storage: ReviewStorage = AsyncStorage,
  storeReview: ReviewRequester = StoreReview,
): Promise<"requested" | "skipped" | "failed"> {
  try {
    const count =
      parseCount(await storage.getItem(COMPLETED_PUZZLES_STORAGE_KEY)) + 1;
    await storage.setItem(COMPLETED_PUZZLES_STORAGE_KEY, String(count));
    if (!shouldRequestReview(count)) return "skipped";
    if (!(await storeReview.isAvailableAsync())) return "skipped";
    await storeReview.requestReview();
    return "requested";
  } catch {
    return "failed";
  }
}
