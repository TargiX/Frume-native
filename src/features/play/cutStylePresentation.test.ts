import { describe, expect, it } from 'vitest';

import {
  PREMIUM_CUT_STYLE_LABELS,
  PREMIUM_CUT_STYLE_LIST,
  puzzleCutStyleLabel,
} from './cutStylePresentation';

describe('cut style presentation', () => {
  it.each([
    ['classic', 'Classic'],
    ['organic', 'Organic'],
    ['biomorphic', 'Living'],
    ['living-spectrum', 'Living spectrum'],
    ['crystal', 'Crystal'],
    ['crystal-quartered', 'Crystal quartered'],
    ['amoeba', 'Amoeba'],
    ['amoeba-columnar', 'Amoeba columnar'],
    ['fractal', 'Fractal'],
  ] as const)('labels the %s cutter as %s', (cutterId, label) => {
    expect(puzzleCutStyleLabel(cutterId)).toBe(label);
  });

  it('describes every one of the seven shipping premium styles', () => {
    expect(PREMIUM_CUT_STYLE_LABELS).toEqual([
      'Organic',
      'Living',
      'Living spectrum',
      'Crystal',
      'Crystal quartered',
      'Amoeba',
      'Amoeba columnar',
    ]);
    expect(PREMIUM_CUT_STYLE_LIST).toBe(
      'Organic, Living, Living spectrum, Crystal, Crystal quartered, Amoeba, and Amoeba columnar',
    );
  });
});
