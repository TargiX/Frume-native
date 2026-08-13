import { describe, expect, it } from 'vitest';

import { resolveCameraViewStyle } from './cameraViewStyle';

describe('camera view style', () => {
  it('uses the same top-left zoom origin as the Skia scene', () => {
    const style = resolveCameraViewStyle({ scale: 2, x: -120, y: -80 });

    expect(style.transformOrigin).toEqual([0, 0, 0]);
    expect(style.transform).toEqual([
      { translateX: -120 },
      { translateY: -80 },
      { scale: 2 },
    ]);
  });
});
