type MutableBooleanRef = {
  current: boolean;
};

export type PremiumUnlockContinuation<T> = {
  stage: (intent: T) => void;
  peek: () => T | null;
  consume: () => T | null;
  discard: () => void;
};

/**
 * Holds the exact action that opened a paywall. Consuming clears first, so a
 * direct purchase response and a later entitlement-listener callback can never
 * run the same action twice.
 */
export function createPremiumUnlockContinuation<T>(): PremiumUnlockContinuation<T> {
  let pending: T | null = null;
  return {
    stage(intent) {
      pending = intent;
    },
    peek() {
      return pending;
    },
    consume() {
      const intent = pending;
      pending = null;
      return intent;
    },
    discard() {
      pending = null;
    },
  };
}

/**
 * Completes one paywall presentation exactly once. The entitlement can become
 * active either in the direct purchase response or later through RevenueCat's
 * CustomerInfo listener (for example after Ask to Buy approval).
 */
export function completePremiumUnlockOnce(
  unlocked: boolean,
  handled: MutableBooleanRef,
  onUnlocked: () => void,
  onClose: () => void,
): boolean {
  if (!unlocked || handled.current) {
    return false;
  }

  handled.current = true;
  onUnlocked();
  onClose();
  return true;
}
