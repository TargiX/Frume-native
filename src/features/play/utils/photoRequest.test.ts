import { describe, expect, it } from 'vitest';

import { PhotoApiError } from '../../../services/unsplash';
import type { PuzzlePhotoResult } from '../../../services/unsplash';
import {
  buildDifficultyRouteParams,
  describePhotoRequestError,
} from './photoRequest';

function photoResult(
  overrides: Partial<PuzzlePhotoResult['photo']> = {},
): PuzzlePhotoResult {
  return {
    photo: {
      id: 'abc',
      width: 1_200,
      height: 900,
      alt_description: 'a lake at dawn',
      urls: { regular: 'https://images.unsplash.com/photo-1' },
      user: {
        name: 'Ada',
        links: {
          html: 'https://unsplash.com/@ada?utm_source=frume&utm_medium=referral',
        },
      },
      links: { download_location: 'https://api.unsplash.com/photos/abc/download' },
      ...overrides,
    },
    category: { id: 'nature', label: 'Nature' },
    tracking_token: 'token-1',
  };
}

describe('buildDifficultyRouteParams', () => {
  it('carries the photo, its credit and its tracking token', () => {
    expect(buildDifficultyRouteParams(photoResult(), 'nature')).toEqual({
      imageUri: 'https://images.unsplash.com/photo-1',
      imageWidth: 1_200,
      imageHeight: 900,
      photographerName: 'Ada',
      photographerUrl:
        'https://unsplash.com/@ada?utm_source=frume&utm_medium=referral',
      photoDescription: 'a lake at dawn',
      categoryId: 'nature',
      categoryLabel: 'Nature',
      downloadLocation: 'https://api.unsplash.com/photos/abc/download',
      trackingToken: 'token-1',
    });
  });

  it('keeps a surprise a surprise instead of pinning the theme that came back', () => {
    const params = buildDifficultyRouteParams(photoResult());
    expect(params.categoryId).toBeUndefined();
    expect(params.categoryLabel).toBe('Nature');
  });

  it('drops a missing description rather than passing null on', () => {
    const params = buildDifficultyRouteParams(
      photoResult({ alt_description: null }),
    );
    expect(params.photoDescription).toBeUndefined();
  });
});

describe('describePhotoRequestError', () => {
  it('names the timeout so the player knows retrying is worth it', () => {
    expect(
      describePhotoRequestError(
        new PhotoApiError('too slow', 'request_timeout'),
      ),
    ).toBe('The photo service took too long. Please try again.');
  });

  it('falls back to one message for every other failure', () => {
    expect(describePhotoRequestError(new Error('offline'))).toBe(
      'Failed to load photo. Please try again.',
    );
    expect(
      describePhotoRequestError(
        new PhotoApiError('bad json', 'invalid_response'),
      ),
    ).toBe('Failed to load photo. Please try again.');
  });
});
