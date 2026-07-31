import { describe, expect, it } from 'vitest';

import { resolveTraySurfaceFrame } from './traySurfaceFrame';

const tray = { left: 600, top: 400, width: 600, height: 120 };

describe('tray surface overflow frame', () => {
  it('extends a bottom conveyor under pieces from edge to edge', () => {
    expect(resolveTraySurfaceFrame(tray, 'bottom', 90)).toEqual({
      left: 0,
      top: 490,
      width: 1_380,
      height: 210,
    });
  });

  it('extends a side conveyor vertically without making it wider', () => {
    expect(resolveTraySurfaceFrame(tray, 'right', 90)).toEqual({
      left: 690,
      top: 0,
      width: 600,
      height: 700,
    });
  });
});
