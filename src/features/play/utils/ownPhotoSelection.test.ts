import { describe, expect, it } from 'vitest';

import {
  MAX_OWN_PHOTO_PIXELS,
  MAX_OWN_PHOTO_SOURCE_PIXELS,
  resolveOwnPhotoRejection,
  resolveOwnPhotoResize,
} from './ownPhotoSelection';

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

  it('accepts both standard and high-resolution photos with valid geometry', () => {
    expect(4032 * 3024).toBeLessThan(MAX_OWN_PHOTO_PIXELS);
    expect(
      resolveOwnPhotoRejection({
        uri: 'file:///standard.jpg',
        width: 4032,
        height: 3024,
      }),
    ).toBeNull();

    expect(
      resolveOwnPhotoRejection({
        uri: 'file:///raw-48mp.jpg',
        width: 8064,
        height: 6048,
      }),
    ).toBeNull();
    expect(8064 * 6048).toBeLessThan(MAX_OWN_PHOTO_SOURCE_PIXELS);
  });

  it('bounds the one-time source decode before native downsampling', () => {
    expect(
      resolveOwnPhotoRejection({
        uri: 'file:///camera/200mp.jpg',
        width: 16_384,
        height: 12_288,
      }),
    ).toMatch(/too large to resize safely/);
  });

  it('keeps the exact pixel boundary and proportionally downsamples above it', () => {
    expect(
      resolveOwnPhotoResize({
        uri: 'file:///at-limit.jpg',
        width: 4000,
        height: 4000,
      }),
    ).toBeNull();
    expect(
      resolveOwnPhotoResize({
        uri: 'file:///raw-48mp.jpg',
        width: 8064,
        height: 6048,
      }),
    ).toEqual({ width: 4618, height: 3464 });
    const target = resolveOwnPhotoResize({
      uri: 'file:///over-limit.jpg',
      width: 4001,
      height: 4000,
    });
    expect((target?.width ?? 0) * (target?.height ?? 0)).toBeLessThanOrEqual(
      MAX_OWN_PHOTO_PIXELS,
    );
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
    expect(
      resolveOwnPhotoRejection({ uri: 'file:///a.jpg', width: 1.5, height: 100 }),
    ).toMatch(/could not be read/);
  });
});
