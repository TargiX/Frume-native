import { describe, expect, it } from 'vitest';

import { hasPremiumCuts, isPremiumCutter, PREMIUM_CUTS_ENTITLEMENT } from './access';

describe('premium cut access', () => {
  it('keeps difficulty-independent Classic free', () => {
    expect(isPremiumCutter('classic')).toBe(false);
    expect(isPremiumCutter('organic')).toBe(true);
    expect(isPremiumCutter('biomorphic')).toBe(true);
    expect(isPremiumCutter('fractal')).toBe(true);
  });

  it('requires the configured active entitlement', () => {
    const inactive = {
      entitlements: { active: {} },
    };
    const active = {
      entitlements: {
        active: {
          [PREMIUM_CUTS_ENTITLEMENT]: { isActive: true },
        },
      },
    };

    expect(hasPremiumCuts(inactive as never)).toBe(false);
    expect(hasPremiumCuts(active as never)).toBe(true);
  });
});
