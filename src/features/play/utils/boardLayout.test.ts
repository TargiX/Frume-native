import { describe, expect, it } from 'vitest';

import {
  MAX_TRAY_HEIGHT,
  MIN_TRAY_HEIGHT,
  TRAY_BOARD_GAP,
  TRAY_HEIGHT_RATIO,
} from '../../../puzzle/engine/tray';
import {
  computePlayLayout,
  computeSafeAreaPlayLayout,
  TABLE_INSET,
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

  it('frames the tray with the same gap the table keeps on the sides', () => {
    expect(TRAY_BOARD_GAP).toBe(TABLE_INSET);

    const portrait = computePlayLayout(390, 844, 3 / 2);
    const landscape = computePlayLayout(844, 390, 3 / 2);

    // The surface is board + gap + tray, so the shelf reads as its own thing.
    expect(portrait.surfaceHeight).toBeGreaterThanOrEqual(
      portrait.boardHeight + TRAY_BOARD_GAP,
    );
    expect(landscape.surfaceWidth).toBeGreaterThanOrEqual(
      landscape.boardWidth + TRAY_BOARD_GAP,
    );
    // And it still fits: the gap comes out of the play area, not the screen.
    expect(portrait.surfaceHeight).toBeLessThanOrEqual(844 - TABLE_INSET * 2);
    expect(landscape.surfaceWidth).toBeLessThanOrEqual(844 - TABLE_INSET * 2);
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

  it('gives a width-limited board’s spare table to the shelf, not the board', () => {
    // A 3:2 photo cut into 49 on a 402×874 phone: the board runs out of width
    // with half the table still empty below it.
    const insets = { top: 62, right: 0, bottom: 34, left: 0 };
    const layout = computeSafeAreaPlayLayout(402, 874, insets, 3 / 2, 49);

    expect(layout.boardWidth).toBeCloseTo(402 - TABLE_INSET * 2);
    expect(layout.boardHeight).toBeCloseTo((402 - TABLE_INSET * 2) / (3 / 2));
    // Two rows, each as deep as a row is allowed to grow.
    expect(layout.trayHeight).toBeCloseTo(MAX_TRAY_HEIGHT * 2);
    expect(layout.surfaceHeight).toBeCloseTo(
      layout.boardHeight + TRAY_BOARD_GAP + MAX_TRAY_HEIGHT * 2,
    );
    expect(layout.surfaceHeight).toBeLessThanOrEqual(
      874 - insets.top - insets.bottom - TABLE_INSET * 2,
    );
  });

  it('fills the table exactly when there is less spare than a full row', () => {
    const layout = computePlayLayout(402, 410, 3 / 2, 16);

    expect(layout.trayPlacement).toBe('bottom');
    expect(layout.boardWidth).toBeCloseTo(402 - TABLE_INSET * 2);
    expect(layout.trayHeight).toBeGreaterThan(MIN_TRAY_HEIGHT);
    expect(layout.trayHeight).toBeLessThan(MAX_TRAY_HEIGHT);
    expect(layout.surfaceHeight).toBeCloseTo(410 - TABLE_INSET * 2);
  });

  it('keeps the fitted shelf when the board is limited by height', () => {
    const layout = computePlayLayout(390, 600, 3 / 4, 16);

    // The board is the one that ran out of room: it did not reach the sides.
    expect(layout.boardWidth).toBeLessThan(390 - TABLE_INSET * 2);
    expect(layout.trayHeight).toBeCloseTo(
      (layout.boardHeight / (1 - TRAY_HEIGHT_RATIO)) * TRAY_HEIGHT_RATIO,
    );
    expect(layout.surfaceHeight).toBeLessThanOrEqual(600 - TABLE_INSET * 2);
  });

  it('leaves the side shelf of a landscape layout alone', () => {
    const landscape = computePlayLayout(874, 402, 3 / 2, 49);

    expect(landscape.trayPlacement).toBe('right');
    expect(landscape.trayHeight).toBeUndefined();
  });
});
