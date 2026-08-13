export const NEW_PHOTO_REPLACEMENT_TITLE = 'Replace saved puzzle?';
export const NEW_PHOTO_REPLACEMENT_MESSAGE =
  'Starting a puzzle with a new photograph will replace your saved puzzle and its progress.';

type NewPhotographHandlers = {
  confirmReplacement: (onConfirm: () => void) => void;
  navigateToGallery: () => void;
};

/** Requires a deliberate confirmation before leaving the single saved slot. */
export function requestNewPhotograph(
  hasSavedSession: boolean,
  handlers: NewPhotographHandlers,
): void {
  if (hasSavedSession) {
    handlers.confirmReplacement(handlers.navigateToGallery);
    return;
  }
  handlers.navigateToGallery();
}
