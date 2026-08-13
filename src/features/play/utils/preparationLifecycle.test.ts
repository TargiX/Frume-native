import { describe, expect, it, vi } from 'vitest';

import {
  beginNextPuzzleRequest,
  cancelNextPuzzleRequest,
  createNextPuzzleRequestState,
  isNextPuzzleRequestCurrent,
} from './nextPuzzle';
import { cancelPuzzlePreparationWhenAppLeavesActive } from './preparationLifecycle';

describe('difficulty setup preparation lifecycle', () => {
  it('makes a start stale and aborts a photo swap before either can complete later', () => {
    const startState = createNextPuzzleRequestState();
    const startRequest = beginNextPuzzleRequest(startState);
    const photoController = new AbortController();

    cancelPuzzlePreparationWhenAppLeavesActive('active', 'background', {
      cancelStart: () => {
        cancelNextPuzzleRequest(startState);
      },
      cancelPhotoSwap: () => {
        photoController.abort();
      },
    });

    expect(isNextPuzzleRequestCurrent(startState, startRequest)).toBe(false);
    expect(startRequest.controller.signal.aborted).toBe(true);
    expect(photoController.signal.aborted).toBe(true);
  });

  it.each(['inactive', 'background'] as const)(
    'cancels every pending preparation when the app leaves active for %s',
    (nextState) => {
      const cancellation = {
        cancelStart: vi.fn(),
        cancelPhotoSwap: vi.fn(),
      };

      expect(
        cancelPuzzlePreparationWhenAppLeavesActive(
          'active',
          nextState,
          cancellation,
        ),
      ).toBe(true);
      expect(cancellation.cancelStart).toHaveBeenCalledOnce();
      expect(cancellation.cancelPhotoSwap).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['inactive', 'background'],
    ['background', 'active'],
    ['active', 'active'],
  ] as const)(
    'does not cancel for the %s to %s transition',
    (previousState, nextState) => {
      const cancellation = {
        cancelStart: vi.fn(),
        cancelPhotoSwap: vi.fn(),
      };

      expect(
        cancelPuzzlePreparationWhenAppLeavesActive(
          previousState,
          nextState,
          cancellation,
        ),
      ).toBe(false);
      expect(cancellation.cancelStart).not.toHaveBeenCalled();
      expect(cancellation.cancelPhotoSwap).not.toHaveBeenCalled();
    },
  );
});
