export type OwnPhotoCandidate = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Widest and narrowest shape the table can still make a puzzle out of.
 *
 * Deliberately looser than the range asked of the photo service: a provider
 * pool can simply be filtered, but the player's own photograph is the one they
 * want, so only shapes that genuinely stop working are refused. Past 3:1 the
 * board becomes a letterbox strip and the pieces are too small to grip.
 */
export const MAX_OWN_PHOTO_ASPECT = 3;
export const MIN_OWN_PHOTO_ASPECT = 1 / 3;

/**
 * Returns the reason this photograph cannot be cut, or null when it can. The
 * message is shown to the player, so it says what to do about it.
 */
export function resolveOwnPhotoRejection(
  candidate: OwnPhotoCandidate,
): string | null {
  const { uri, width, height } = candidate;
  if (!uri) {
    return 'That photograph could not be read.';
  }
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 'That photograph could not be read.';
  }

  const aspect = width / height;
  if (aspect > MAX_OWN_PHOTO_ASPECT || aspect < MIN_OWN_PHOTO_ASPECT) {
    return 'That photograph is too long and thin to cut. Try one closer to a normal photo shape.';
  }
  return null;
}
