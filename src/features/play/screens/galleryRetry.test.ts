import { describe, expect, it, vi } from 'vitest';

import {
  galleryRetryAccessibilityLabel,
  retryGalleryPhoto,
} from './galleryRetry';

function retryHandlers() {
  return {
    searchPhoto: vi.fn(),
    pickOwnPhoto: vi.fn(),
  };
}

describe('Gallery photo retry', () => {
  it('retries the same remote theme', () => {
    const handlers = retryHandlers();

    expect(
      retryGalleryPhoto(
        { source: 'remote', categoryId: 'nature' },
        handlers,
      ),
    ).toBe(true);
    expect(handlers.searchPhoto).toHaveBeenCalledWith('nature');
    expect(handlers.pickOwnPhoto).not.toHaveBeenCalled();
  });

  it('retries a surprise search without inventing a theme', () => {
    const handlers = retryHandlers();

    retryGalleryPhoto({ source: 'remote' }, handlers);

    expect(handlers.searchPhoto).toHaveBeenCalledWith(undefined);
    expect(handlers.pickOwnPhoto).not.toHaveBeenCalled();
  });

  it('reopens the own-photo picker after an own-photo failure', () => {
    const handlers = retryHandlers();

    expect(
      retryGalleryPhoto({ source: 'own' }, handlers),
    ).toBe(true);
    expect(handlers.pickOwnPhoto).toHaveBeenCalledOnce();
    expect(handlers.searchPhoto).not.toHaveBeenCalled();
    expect(
      galleryRetryAccessibilityLabel({ source: 'own' }),
    ).toBe('Choose my photo again');
  });

  it('does nothing before a photo attempt exists', () => {
    const handlers = retryHandlers();

    expect(retryGalleryPhoto(null, handlers)).toBe(false);
    expect(handlers.searchPhoto).not.toHaveBeenCalled();
    expect(handlers.pickOwnPhoto).not.toHaveBeenCalled();
  });
});
