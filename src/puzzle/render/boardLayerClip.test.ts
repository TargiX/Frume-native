import { describe, expect, it } from 'vitest';

import { resolveBoardLayerClip } from './boardLayerClip';

describe('board layer clip', () => {
  it('stops a bottom-shelf board layer at the shelf edge', () => {
    expect(
      resolveBoardLayerClip(
        { width: 900, height: 700 },
        { left: 0, top: 510, width: 900, height: 190 },
        'bottom',
      ),
    ).toEqual({ x: 0, y: 0, width: 900, height: 510 });
  });

  it('stops a side-shelf board layer at the shelf edge', () => {
    expect(
      resolveBoardLayerClip(
        { width: 900, height: 700 },
        { left: 680, top: 0, width: 220, height: 700 },
        'right',
      ),
    ).toEqual({ x: 0, y: 0, width: 680, height: 700 });
  });
});
