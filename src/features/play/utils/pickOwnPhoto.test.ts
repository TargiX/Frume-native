import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  launchImageLibraryAsync: vi.fn(),
  storeOwnPhoto: vi.fn(),
  normalizeOwnPhotoCandidate: vi.fn(),
  discardTemporaryOwnPhoto: vi.fn(),
}));

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
}));

vi.mock('./ownPhotoLibrary', () => ({
  storeOwnPhoto: mocks.storeOwnPhoto,
}));

vi.mock('./ownPhotoNormalization', () => ({
  normalizeOwnPhotoCandidate: mocks.normalizeOwnPhotoCandidate,
  discardTemporaryOwnPhoto: mocks.discardTemporaryOwnPhoto,
}));

import { pickOwnPhoto } from './pickOwnPhoto';

describe('pickOwnPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeOwnPhotoCandidate.mockImplementation(async (photo) => ({
      photo,
      temporaryUri: null,
    }));
  });

  it('does not touch owned files when the picker is cancelled', async () => {
    mocks.launchImageLibraryAsync.mockResolvedValue({ canceled: true });

    await expect(
      pickOwnPhoto(['file:///documents/frume-own-photos/own-1.jpg']),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(mocks.storeOwnPhoto).not.toHaveBeenCalled();
  });

  it('normalizes an oversized decode before copying it', async () => {
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///picker/48mp.heic',
          width: 8064,
          height: 6048,
        },
      ],
    });

    mocks.normalizeOwnPhotoCandidate.mockResolvedValue({
      photo: {
        uri: 'file:///cache/normalized.jpg',
        width: 4618,
        height: 3464,
      },
      temporaryUri: 'file:///cache/normalized.jpg',
    });
    mocks.storeOwnPhoto.mockResolvedValue({
      uri: 'file:///documents/frume-own-photos/own-48mp.jpg',
      sizeBytes: 8_000_000,
    });

    await expect(pickOwnPhoto()).resolves.toEqual({
      status: 'picked',
      photo: {
        uri: 'file:///documents/frume-own-photos/own-48mp.jpg',
        width: 4618,
        height: 3464,
      },
    });
    expect(mocks.storeOwnPhoto).toHaveBeenCalledWith(
      'file:///cache/normalized.jpg',
    );
    expect(mocks.discardTemporaryOwnPhoto).toHaveBeenCalledWith(
      'file:///cache/normalized.jpg',
    );
  });

  it('stages a valid photo without pruning before the session commits', async () => {
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///picker/photo.heic',
          width: 4032,
          height: 3024,
        },
      ],
    });
    mocks.storeOwnPhoto.mockResolvedValue({
      uri: 'file:///documents/frume-own-photos/own-2.heic',
      sizeBytes: 4_000_000,
    });

    await expect(
      pickOwnPhoto(['file:///documents/frume-own-photos/own-1.jpg']),
    ).resolves.toEqual({
      status: 'picked',
      photo: {
        uri: 'file:///documents/frume-own-photos/own-2.heic',
        width: 4032,
        height: 3024,
      },
    });
    expect(mocks.storeOwnPhoto).toHaveBeenCalledWith(
      'file:///picker/photo.heic',
    );
  });

  it('reports a normalization failure without touching durable storage', async () => {
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///picker/48mp.heic',
          width: 8064,
          height: 6048,
        },
      ],
    });
    mocks.normalizeOwnPhotoCandidate.mockRejectedValue(
      new Error('native resize failed'),
    );

    await expect(pickOwnPhoto()).resolves.toMatchObject({
      status: 'rejected',
      message: expect.stringMatching(/could not be resized safely/),
    });
    expect(mocks.storeOwnPhoto).not.toHaveBeenCalled();
  });

  it('returns a staged-copy failure without deleting the current photo', async () => {
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///picker/photo.jpg',
          width: 3000,
          height: 2000,
        },
      ],
    });
    mocks.storeOwnPhoto.mockRejectedValue(
      new Error('The photograph could not be saved on this device'),
    );

    await expect(
      pickOwnPhoto(['file:///documents/frume-own-photos/own-1.jpg']),
    ).resolves.toEqual({
      status: 'rejected',
      message: 'The photograph could not be saved on this device',
    });
  });
});
