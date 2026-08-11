import type { PlayStackParamList } from '../../../navigation/types';
import { PhotoApiError, type PuzzlePhotoResult } from '../../../services/unsplash';

export type DifficultyRouteParams = PlayStackParamList['Difficulty'];

/**
 * The gallery picks the first photo and the setup screen swaps it for another;
 * both hand the same shape to the setup route, so they build it here rather
 * than twice.
 *
 * `requestedCategoryId` is what the player asked for, not what came back:
 * "Surprise me" must stay a surprise when they ask for another photo, so an
 * absent id is carried through instead of being filled in from the result.
 */
export function buildDifficultyRouteParams(
  result: PuzzlePhotoResult,
  requestedCategoryId?: string,
): DifficultyRouteParams {
  const { photo, category } = result;
  return {
    imageUri: photo.urls.regular,
    imageWidth: photo.width,
    imageHeight: photo.height,
    photographerName: photo.user.name,
    photographerUrl: photo.user.links?.html,
    photoDescription: photo.alt_description ?? undefined,
    categoryId: requestedCategoryId,
    categoryLabel: category.label,
    downloadLocation: photo.links.download_location,
    trackingToken: result.tracking_token,
  };
}

export function describePhotoRequestError(error: unknown): string {
  return error instanceof PhotoApiError && error.code === 'request_timeout'
    ? 'The photo service took too long. Please try again.'
    : 'Failed to load photo. Please try again.';
}
