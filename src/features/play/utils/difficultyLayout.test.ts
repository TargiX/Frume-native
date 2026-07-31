import { describe, expect, it } from 'vitest';

import { resolveDifficultyScreenLayout } from './difficultyLayout';

describe('difficulty screen layout', () => {
  it('keeps the photo and primary action fixed beside landscape choices', () => {
    expect(
      resolveDifficultyScreenLayout({
        width: 844,
        height: 390,
        fontScale: 1,
      }),
    ).toEqual({ twoPane: true });
  });

  it('uses the safe single scroll in portrait', () => {
    expect(
      resolveDifficultyScreenLayout({
        width: 390,
        height: 844,
        fontScale: 1,
      }),
    ).toEqual({ twoPane: false });
  });

  it('does not compress a two-pane layout at larger Dynamic Type sizes', () => {
    expect(
      resolveDifficultyScreenLayout({
        width: 844,
        height: 390,
        fontScale: 1.4,
      }),
    ).toEqual({ twoPane: false });
  });

  it('keeps very narrow landscape phones on one reachable scroll', () => {
    expect(
      resolveDifficultyScreenLayout({
        width: 667,
        height: 375,
        fontScale: 1,
      }),
    ).toEqual({ twoPane: false });
  });

  it('does not treat a landscape tablet as compact phone landscape', () => {
    expect(
      resolveDifficultyScreenLayout({
        width: 1024,
        height: 768,
        fontScale: 1,
      }),
    ).toEqual({ twoPane: false });
  });
});
