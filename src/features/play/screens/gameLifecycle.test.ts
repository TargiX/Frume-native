import { describe, expect, it } from 'vitest';

import type { PuzzleImageSource } from '../../../puzzle/types';
import {
  completionPrimaryAction,
  shouldRunGameTimer,
} from './gameLifecycle';

const baseImage: PuzzleImageSource = {
  uri: 'file:///photo.jpg',
  width: 1200,
  height: 800,
};

describe('game lifecycle presentation', () => {
  it('pauses the solve clock for the menu and for screen blur', () => {
    expect(shouldRunGameTimer(true, false)).toBe(true);
    expect(shouldRunGameTimer(true, true)).toBe(false);
    expect(shouldRunGameTimer(true, false, true)).toBe(false);
    expect(shouldRunGameTimer(false, false)).toBe(false);
    expect(shouldRunGameTimer(false, true)).toBe(false);
  });

  it('continues an Unsplash puzzle in its chosen category', () => {
    expect(
      completionPrimaryAction({
        ...baseImage,
        contentSource: {
          kind: 'unsplash',
          categoryId: 'nature',
          categoryLabel: 'Nature',
        },
      }),
    ).toEqual({
      kind: 'next_remote',
      categoryId: 'nature',
      label: 'Another from Nature',
    });
  });

  it('does not promise a category continuation without its request id', () => {
    expect(
      completionPrimaryAction({
        ...baseImage,
        contentSource: {
          kind: 'unsplash',
          categoryLabel: 'Nature',
        },
      }),
    ).toEqual({ kind: 'next_remote', label: 'Next puzzle' });
  });

  it('never silently changes an own or unknown photo to network content', () => {
    expect(
      completionPrimaryAction({
        ...baseImage,
        contentSource: { kind: 'own' },
      }),
    ).toEqual({ kind: 'choose_photo', label: 'Choose another photo' });
    expect(completionPrimaryAction(baseImage)).toEqual({
      kind: 'choose_photo',
      label: 'Choose another photo',
    });
  });

  it('keeps legacy attributed provider sessions able to continue', () => {
    expect(
      completionPrimaryAction({
        ...baseImage,
        attribution: {
          photographerName: 'Ada',
          photographerUrl: 'https://unsplash.com/@ada',
          sourceName: 'Unsplash',
          sourceUrl: 'https://unsplash.com/',
        },
      }),
    ).toEqual({ kind: 'next_remote', label: 'Next puzzle' });
  });
});
