import { describe, expect, it } from 'vitest';

import { resolveOwnPhotoRejection } from './ownPhotoSelection';

describe('resolveOwnPhotoRejection', () => {
  it('accepts an ordinary photograph in either orientation', () => {
    expect(
      resolveOwnPhotoRejection({ uri: 'file:///a.jpg', width: 4032, height: 3024 }),
    ).toBeNull();
    expect(
      resolveOwnPhotoRejection({ uri: 'file:///a.jpg', width: 3024, height: 4032 }),
    ).toBeNull();
  });

  it('accepts shapes the provider pool would reject, up to the board limit', () => {
    // 2:1 is outside the 16:9 asked of the photo service; the player's own
    // photograph is still perfectly cuttable at that shape.
    expect(
      resolveOwnPhotoRejection({ uri: 'file:///a.jpg', width: 4000, height: 2000 }),
    ).toBeNull();
    expect(
      resolveOwnPhotoRejection({ uri: 'file:///a.jpg', width: 3000, height: 1000 }),
    ).toBeNull();
  });

  it('refuses a panorama that would leave a letterbox strip', () => {
    expect(
      resolveOwnPhotoRejection({ uri: 'file:///a.jpg', width: 6000, height: 1000 }),
    ).toMatch(/too long and thin/);
    expect(
      resolveOwnPhotoRejection({ uri: 'file:///a.jpg', width: 1000, height: 6000 }),
    ).toMatch(/too long and thin/);
  });

  it('refuses a photograph whose size could not be read', () => {
    expect(
      resolveOwnPhotoRejection({ uri: 'file:///a.jpg', width: 0, height: 100 }),
    ).toMatch(/could not be read/);
    expect(
      resolveOwnPhotoRejection({
        uri: 'file:///a.jpg',
        width: Number.NaN,
        height: 100,
      }),
    ).toMatch(/could not be read/);
    expect(
      resolveOwnPhotoRejection({ uri: '', width: 100, height: 100 }),
    ).toMatch(/could not be read/);
  });
});
