export type GalleryPhotoAttempt =
  | { source: 'remote'; categoryId?: string }
  | { source: 'own' };

type GalleryRetryHandlers = {
  searchPhoto: (categoryId?: string) => void;
  pickOwnPhoto: () => void;
};

/** Retries the same acquisition source instead of silently changing it. */
export function retryGalleryPhoto(
  attempt: GalleryPhotoAttempt | null,
  handlers: GalleryRetryHandlers,
): boolean {
  if (!attempt) {
    return false;
  }

  if (attempt.source === 'own') {
    handlers.pickOwnPhoto();
  } else {
    handlers.searchPhoto(attempt.categoryId);
  }
  return true;
}

export function galleryRetryAccessibilityLabel(
  attempt: GalleryPhotoAttempt | null,
): string {
  return attempt?.source === 'own'
    ? 'Choose my photo again'
    : 'Try photo search again';
}

export function galleryRetryAccessibilityHint(
  attempt: GalleryPhotoAttempt | null,
): string {
  return attempt?.source === 'own'
    ? 'Reopens your photo library'
    : 'Retries your last photo search';
}
