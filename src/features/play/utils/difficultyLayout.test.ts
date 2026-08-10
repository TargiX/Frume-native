import { describe, expect, it } from 'vitest';

import {
  resolveCutColumns,
  resolveDifficultyScreenLayout,
} from './difficultyLayout';

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

describe('resolveCutColumns', () => {
  it('keeps a phone at three samples across', () => {
    // 440pt screen minus the content padding.
    expect(resolveCutColumns(392, 1)).toBe(3);
  });

  it('gives a tablet more samples rather than bigger ones', () => {
    // The content column caps at 680pt, so a 13-inch iPad lands here.
    expect(resolveCutColumns(632, 1)).toBe(4);
  });

  it('never goes past four, however wide the column', () => {
    expect(resolveCutColumns(2_000, 1)).toBe(4);
  });

  it('takes columns away as the text grows', () => {
    expect(resolveCutColumns(632, 1.3)).toBe(2);
    expect(resolveCutColumns(632, 1.6)).toBe(1);
  });

  it('falls back to one column on a very narrow screen', () => {
    expect(resolveCutColumns(100, 1)).toBe(1);
  });
});
