import { describe, expect, it, vi } from 'vitest';

import { completePremiumUnlockOnce } from './unlockCompletion';

describe('completePremiumUnlockOnce', () => {
  it('waits for delayed entitlement activation and completes exactly once', () => {
    const handled = { current: false };
    const onUnlocked = vi.fn();
    const onClose = vi.fn();

    expect(
      completePremiumUnlockOnce(false, handled, onUnlocked, onClose),
    ).toBe(false);
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    expect(
      completePremiumUnlockOnce(true, handled, onUnlocked, onClose),
    ).toBe(true);
    expect(
      completePremiumUnlockOnce(true, handled, onUnlocked, onClose),
    ).toBe(false);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
