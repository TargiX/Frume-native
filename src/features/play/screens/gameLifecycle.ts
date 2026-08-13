import type { PuzzleImageSource } from '../../../puzzle/types';

export type CompletionPrimaryAction =
  | {
      kind: 'next_remote';
      categoryId?: string;
      label: string;
    }
  | {
      kind: 'choose_photo';
      label: string;
    };

/** The timer runs only while the board itself is the active interaction. */
export function shouldRunGameTimer(
  screenFocused: boolean,
  menuVisible: boolean,
  blockingOverlayVisible = false,
): boolean {
  return screenFocused && !menuVisible && !blockingOverlayVisible;
}

/**
 * Legacy Unsplash sessions can be identified by their required attribution.
 * Unknown/uncredited sessions fail closed to Gallery so an own photo never
 * silently turns into a remote request.
 */
export function completionPrimaryAction(
  image: PuzzleImageSource,
): CompletionPrimaryAction {
  if (image.contentSource?.kind === 'unsplash') {
    const label =
      image.contentSource.categoryId && image.contentSource.categoryLabel
      ? `Another from ${image.contentSource.categoryLabel}`
      : 'Next puzzle';
    return {
      kind: 'next_remote',
      ...(image.contentSource.categoryId
        ? { categoryId: image.contentSource.categoryId }
        : {}),
      label,
    };
  }
  if (!image.contentSource && image.attribution) {
    return { kind: 'next_remote', label: 'Next puzzle' };
  }
  return { kind: 'choose_photo', label: 'Choose another photo' };
}
