import { describe, expect, it } from 'vitest';

import { resolveTraySurfaceFrame } from './traySurfaceFrame';

const INSET = 90;

describe('tray surface overflow frame', () => {
  /**
   * The shelf now has a run of its own — the width of the table rather than of
   * the board — so the drawn surface follows that run and only adds the
   * piece-overflow margin at each end. It used to be stretched across the
   * workspace instead, which is why it stopped short of the screen edges as
   * soon as the board was narrower than the table.
   */
  it('draws a bottom shelf along its own run, plus the overflow margin', () => {
    const tray = { left: -100, top: 400, width: 800, height: 120 };
    // The board's origin sits at inset + how far the shelf reaches left of it.
    const originX = INSET + 100;

    expect(
      resolveTraySurfaceFrame(tray, 'bottom', INSET, originX, INSET),
    ).toEqual({
      left: 0,
      top: 490,
      width: 980,
      height: 210,
    });
  });

  it('keeps a centred shelf centred', () => {
    const tray = { left: 0, top: 400, width: 600, height: 120 };

    expect(
      resolveTraySurfaceFrame(tray, 'bottom', INSET, INSET, INSET),
    ).toEqual({
      left: 0,
      top: 490,
      width: 780,
      height: 210,
    });
  });

  it('draws a side shelf down its own run', () => {
    const tray = { left: 600, top: -100, width: 200, height: 800 };
    const originY = INSET + 100;

    expect(
      resolveTraySurfaceFrame(tray, 'right', INSET, INSET, originY),
    ).toEqual({
      left: 690,
      top: 0,
      width: 290,
      height: 980,
    });
  });
});
