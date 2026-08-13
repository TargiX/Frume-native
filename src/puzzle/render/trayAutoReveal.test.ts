import { describe, expect, it } from 'vitest';

import { resolveTrayAutoRevealScroll } from './trayAutoReveal';

describe('tray auto reveal', () => {
  it('brings the last remaining piece in from beyond the trailing edge', () => {
    expect(
      resolveTrayAutoRevealScroll({
        scroll: 0,
        extent: { min: 620, max: 700 },
        viewportExtent: 300,
        minScroll: -412,
        maxScroll: 0,
      }),
    ).toBe(-412);
  });

  it('brings the last remaining piece in from beyond the leading edge', () => {
    expect(
      resolveTrayAutoRevealScroll({
        scroll: 0,
        extent: { min: -500, max: -420 },
        viewportExtent: 300,
        minScroll: 0,
        maxScroll: 512,
      }),
    ).toBe(512);
  });

  it('does not move a shelf that already shows a remaining piece', () => {
    expect(
      resolveTrayAutoRevealScroll({
        scroll: -200,
        extent: { min: 240, max: 320 },
        viewportExtent: 300,
        minScroll: -412,
        maxScroll: 0,
      }),
    ).toBe(-200);
  });
});
