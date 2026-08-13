import { describe, expect, it } from 'vitest';

import {
  acceptManualImageLoadRetry,
  imageLoadRetryPresentation,
  MAX_MANUAL_IMAGE_LOAD_RETRIES,
} from './imageLoadRetry';

describe('manual puzzle-image retry', () => {
  it('accepts exactly two manual retries', () => {
    expect(acceptManualImageLoadRetry(0)).toBe(1);
    expect(acceptManualImageLoadRetry(1)).toBe(2);
    expect(acceptManualImageLoadRetry(2)).toBeNull();
    expect(MAX_MANUAL_IMAGE_LOAD_RETRIES).toBe(2);
  });

  it('stops offering a looping action after the retry budget is spent', () => {
    expect(imageLoadRetryPresentation(1)).toMatchObject({
      canRetry: true,
      retryLabel: 'Try loading again',
    });
    expect(imageLoadRetryPresentation(2)).toEqual({
      canRetry: false,
      retryLabel: null,
      guidance:
        'The photograph is still unavailable. Open the menu to leave without deleting this saved puzzle, then try again later.',
    });
  });
});
