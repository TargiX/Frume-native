import { describe, expect, it } from 'vitest';

import {
  computePlayLayout,
  computeSafeAreaPlayLayout,
} from './boardLayout';

describe('computePlayLayout', () => {
  it('preserves the photograph aspect on phones and after rotation', () => {
    const portrait = computePlayLayout(390, 844, 3 / 2);
    const landscape = computePlayLayout(844, 390, 3 / 2);

    expect(portrait.boardWidth / portrait.boardHeight).toBeCloseTo(3 / 2);
    expect(landscape.boardWidth / landscape.boardHeight).toBeCloseTo(3 / 2);
    expect(portrait.trayPlacement).toBe('bottom');
    expect(landscape.trayPlacement).toBe('right');
  });

  it('keeps the board and tray inside the available rectangle', () => {
    const layout = computePlayLayout(320, 568, 2 / 3);

    expect(layout.surfaceWidth).toBeLessThanOrEqual(320);
    expect(layout.surfaceHeight).toBeLessThanOrEqual(568);
    expect(layout.boardWidth).toBeGreaterThan(0);
    expect(layout.boardHeight).toBeGreaterThan(0);
  });

  it('moves the tray to the side in landscape so the board can use full height', () => {
    const landscape = computePlayLayout(844, 390, 3 / 2);

    expect(landscape.trayPlacement).toBe('right');
    expect(landscape.surfaceWidth).toBeGreaterThan(landscape.boardWidth);
    expect(landscape.surfaceHeight).toBe(landscape.boardHeight);
    expect(landscape.boardHeight).toBeCloseTo(358);
  });

  it('uses the same safe-area bounds for a phone and an iPad initial cut', () => {
    const phoneInsets = { top: 59, right: 0, bottom: 34, left: 0 };
    const tabletInsets = { top: 24, right: 0, bottom: 20, left: 0 };
    const phone = computeSafeAreaPlayLayout(
      390,
      844,
      phoneInsets,
      3 / 2,
    );
    const tablet = computeSafeAreaPlayLayout(
      1024,
      1366,
      tabletInsets,
      3 / 2,
    );

    expect(phone).toEqual(
      computePlayLayout(390, 844 - phoneInsets.top - phoneInsets.bottom, 3 / 2),
    );
    expect(tablet).toEqual(
      computePlayLayout(
        1024,
        1366 - tabletInsets.top - tabletInsets.bottom,
        3 / 2,
      ),
    );
    expect(tablet.boardWidth).toBeGreaterThan(360);
    expect(tablet.surfaceWidth).toBeLessThanOrEqual(1024);
    expect(tablet.surfaceHeight).toBeLessThanOrEqual(
      1366 - tabletInsets.top - tabletInsets.bottom,
    );
  });
});
