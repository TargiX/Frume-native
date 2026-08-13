export const MAX_MANUAL_IMAGE_LOAD_RETRIES = 2;

export type ImageLoadRetryPresentation = {
  canRetry: boolean;
  retryLabel: string | null;
  guidance: string;
};

export function acceptManualImageLoadRetry(
  completedRetries: number,
): number | null {
  if (completedRetries >= MAX_MANUAL_IMAGE_LOAD_RETRIES) {
    return null;
  }
  return completedRetries + 1;
}

export function imageLoadRetryPresentation(
  completedRetries: number,
): ImageLoadRetryPresentation {
  if (completedRetries >= MAX_MANUAL_IMAGE_LOAD_RETRIES) {
    return {
      canRetry: false,
      retryLabel: null,
      guidance:
        'The photograph is still unavailable. Open the menu to leave without deleting this saved puzzle, then try again later.',
    };
  }
  return {
    canRetry: true,
    retryLabel: 'Try loading again',
    guidance: 'Check your connection or device storage, then try again.',
  };
}
