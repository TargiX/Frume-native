import { describe, expect, it, vi } from 'vitest';

import { requestNewPhotograph } from './playHomeNavigation';

describe('Play Home new photograph navigation', () => {
  it('requires confirmation when a saved session exists', () => {
    const navigateToGallery = vi.fn();
    const confirmReplacement = vi.fn();

    requestNewPhotograph(true, {
      confirmReplacement,
      navigateToGallery,
    });

    expect(confirmReplacement).toHaveBeenCalledOnce();
    expect(navigateToGallery).not.toHaveBeenCalled();

    const confirm = confirmReplacement.mock.calls[0]?.[0];
    expect(confirm).toBeTypeOf('function');
    confirm?.();
    expect(navigateToGallery).toHaveBeenCalledOnce();
  });

  it('opens the gallery directly when there is no session to replace', () => {
    const navigateToGallery = vi.fn();
    const confirmReplacement = vi.fn();

    requestNewPhotograph(false, {
      confirmReplacement,
      navigateToGallery,
    });

    expect(confirmReplacement).not.toHaveBeenCalled();
    expect(navigateToGallery).toHaveBeenCalledOnce();
  });
});
