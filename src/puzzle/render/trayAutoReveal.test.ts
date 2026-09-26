import { describe, expect, it } from 'vitest';

import {
  resolveTrayAutoRevealScroll,
  resolveTrayScrollBounds,
} from './trayAutoReveal';

describe('tray auto reveal', () => {
  it('brings the last remaining piece in from beyond the trailing edge', () => {
    expect(
      resolveTrayAutoRevealScroll({
        scroll: 0,
        extent: { min: 620, max: 700 },
        viewportStart: 0,
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
        viewportStart: 0,
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
        viewportStart: 0,
        viewportExtent: 300,
        minScroll: -412,
        maxScroll: 0,
      }),
    ).toBe(-200);
  });

  it('measures the window from the shelf start, not from zero', () => {
    // An iPad landscape shelf is centred on a shorter board, so its window
    // starts at -109. Measured from zero, a piece sitting in the band below
    // the window looked visible and was never revealed.
    const bounds = resolveTrayScrollBounds(
      { min: 500, max: 580 },
      -109,
      948,
    );
    const scroll = resolveTrayAutoRevealScroll({
      scroll: 0,
      extent: { min: 500, max: 580 },
      viewportStart: -109,
      viewportExtent: 948,
      ...bounds,
    });

    // The piece must be pulled inside the real window [839 - s, 1787 - s] —
    // i.e. its drawn span [min + s, max + s] must overlap [-109, 839].
    const drawnMin = 500 + scroll;
    const drawnMax = 580 + scroll;
    expect(drawnMax).toBeGreaterThan(-109);
    expect(drawnMin).toBeLessThan(839);
  });

  it('reveals a piece parked in the band above the window', () => {
    const bounds = resolveTrayScrollBounds(
      { min: -180, max: -120 },
      -109,
      948,
    );
    const scroll = resolveTrayAutoRevealScroll({
      scroll: -400,
      extent: { min: -180, max: -120 },
      viewportStart: -109,
      viewportExtent: 948,
      ...bounds,
    });

    const drawnMin = -180 + scroll;
    const drawnMax = -120 + scroll;
    expect(drawnMax).toBeGreaterThan(-109);
    expect(drawnMin).toBeLessThan(839);
  });
});

describe('tray scroll bounds', () => {
  it('lets the last piece scroll fully into a shelf that starts before zero', () => {
    // Regression: bounds measured from 0 stranded the last pieces in a dead
    // band past the shelf's far edge — visible as pieces poking off the shelf
    // or vanishing under the table edge.
    const bounds = resolveTrayScrollBounds(
      { min: -50, max: 2400 },
      -75,
      692,
    );

    // Scrolling all the way along the run must park the last piece 12pt
    // inside the window's trailing edge: 2400 + minScroll = -75 + 692 - 12.
    expect(2400 + bounds.minScroll).toBeCloseTo(-75 + 692 - 12);
    // The first piece already starts inside the window, so no positive
    // scroll is offered that would drag it out of view.
    expect(bounds.maxScroll).toBe(0);
  });

  it('never scrolls an extent that already fits the window', () => {
    const bounds = resolveTrayScrollBounds(
      { min: 20, max: 280 },
      -75,
      692,
    );

    expect(bounds.minScroll).toBe(0);
    expect(bounds.maxScroll).toBe(0);
  });
});
