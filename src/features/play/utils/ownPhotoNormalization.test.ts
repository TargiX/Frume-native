import { describe, expect, it, vi } from 'vitest';

import {
  normalizeOwnPhotoCandidate,
  type OwnPhotoResizeOperation,
} from './ownPhotoNormalization';

describe('own photo normalization', () => {
  it('does not rewrite a photo already under the decoded pixel ceiling', async () => {
    const resize = vi.fn<OwnPhotoResizeOperation>();
    const source = {
      uri: 'file:///picker/12mp.heic',
      width: 4032,
      height: 3024,
    };

    await expect(normalizeOwnPhotoCandidate(source, resize)).resolves.toEqual({
      photo: source,
      temporaryUri: null,
    });
    expect(resize).not.toHaveBeenCalled();
  });

  it('resizes a 48 MP photo before it enters durable storage', async () => {
    const resize = vi.fn<OwnPhotoResizeOperation>().mockResolvedValue({
      uri: 'file:///cache/normalized.jpg',
      width: 4618,
      height: 3464,
    });

    await expect(
      normalizeOwnPhotoCandidate(
        {
          uri: 'file:///picker/48mp.heic',
          width: 8064,
          height: 6048,
        },
        resize,
      ),
    ).resolves.toEqual({
      photo: {
        uri: 'file:///cache/normalized.jpg',
        width: 4618,
        height: 3464,
      },
      temporaryUri: 'file:///cache/normalized.jpg',
    });
    expect(resize).toHaveBeenCalledWith(
      'file:///picker/48mp.heic',
      4618,
      3464,
    );
  });

  it('rejects a manipulator result that violates the requested ceiling', async () => {
    const resize = vi.fn<OwnPhotoResizeOperation>().mockResolvedValue({
      uri: 'file:///cache/wrong.jpg',
      width: 8064,
      height: 6048,
    });

    await expect(
      normalizeOwnPhotoCandidate(
        {
          uri: 'file:///picker/48mp.heic',
          width: 8064,
          height: 6048,
        },
        resize,
      ),
    ).rejects.toThrow(/invalid/);
  });
});
