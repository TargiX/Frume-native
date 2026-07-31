type MutableBooleanRef = {
  current: boolean;
};

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
