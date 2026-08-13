import type { AppStateStatus } from 'react-native';

type PuzzlePreparationCancellation = {
  cancelStart: () => void;
  cancelPhotoSwap: () => void;
};

/**
 * Cancels setup work at the exact transition away from the foreground. Calls
 * are intentionally supplied by the screen so this policy stays pure and the
 * request owners remain responsible for invalidating their own generations.
 */
export function cancelPuzzlePreparationWhenAppLeavesActive(
  previousState: AppStateStatus,
  nextState: AppStateStatus,
  cancellation: PuzzlePreparationCancellation,
): boolean {
  if (previousState !== 'active' || nextState === 'active') {
    return false;
  }

  cancellation.cancelStart();
  cancellation.cancelPhotoSwap();
  return true;
}
