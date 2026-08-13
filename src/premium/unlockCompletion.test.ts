import { describe, expect, it, vi } from 'vitest';

import {
  completePremiumUnlockOnce,
  createPremiumUnlockContinuation,
} from './unlockCompletion';

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

describe('Premium unlock continuation', () => {
  it('preserves and consumes the exact pending intent once', () => {
    const continuation = createPremiumUnlockContinuation<{
      cutter: string;
      pieces: number;
    }>();
    const intent = { cutter: 'crystal', pieces: 49 };

    continuation.stage(intent);

    expect(continuation.peek()).toBe(intent);
    expect(continuation.consume()).toBe(intent);
    expect(continuation.consume()).toBeNull();
  });

  it('lets a newer explicit Start intent supersede the old one', () => {
    const continuation = createPremiumUnlockContinuation<string>();

    continuation.stage('Living, 16 pieces');
    continuation.stage('Amoeba, 25 pieces');

    expect(continuation.consume()).toBe('Amoeba, 25 pieces');
    continuation.stage('Crystal, 49 pieces');
    continuation.discard();
    expect(continuation.peek()).toBeNull();
  });
});
