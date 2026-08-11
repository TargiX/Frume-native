export type PremiumResumeResolution = 'game' | 'premium' | 'stale';

export type PlayHomeActionGuard = {
  beginAction: () => number;
  invalidate: () => void;
  isCurrent: (requestId: number) => boolean;
  setFocused: (focused: boolean) => void;
};

/**
 * Keeps asynchronous Home actions scoped to the screen instance and focus
 * period that started them. A later action always supersedes the earlier one.
 */
export function createPlayHomeActionGuard(
  initiallyFocused: boolean,
): PlayHomeActionGuard {
  let currentActionId = 0;
  let focused = initiallyFocused;

  const invalidate = () => {
    currentActionId += 1;
  };

  return {
    beginAction: () => {
      invalidate();
      return currentActionId;
    },
    invalidate,
    isCurrent: (requestId) =>
      focused && requestId === currentActionId,
    setFocused: (nextFocused) => {
      if (focused && !nextFocused) {
        invalidate();
      }
      focused = nextFocused;
    },
  };
}

export async function resolvePremiumResume(
  requestId: number,
  guard: PlayHomeActionGuard,
  verifyPremiumCuts: () => Promise<boolean>,
): Promise<PremiumResumeResolution> {
  if (!guard.isCurrent(requestId)) {
    return 'stale';
  }

  let active = false;
  try {
    active = await verifyPremiumCuts();
  } catch {
    // Premium resume is fail-closed even if an implementation unexpectedly
    // rejects instead of returning false.
  }

  if (!guard.isCurrent(requestId)) {
    return 'stale';
  }

  return active ? 'game' : 'premium';
}
