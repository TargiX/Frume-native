import { PUZZLE_CATEGORIES, type PuzzleCategory } from './puzzleCuration';
import {
  PhotoApiError,
  requestPhotoApi,
  throwPhotoApiResponseError,
  withPhotoApiRequestDeadline,
} from './photoApi';
import {
  normalizePhotoTrackingToken,
  normalizeUnsplashDownloadLocation,
} from './photoValidation';

export type PuzzlePhoto = {
  id: string;
  width: number;
  height: number;
  alt_description: string | null;
  urls: { regular: string };
  user: {
    name: string;
    /** Unsplash photographer profile with required UTM attribution params. */
    links: { html: string };
  };
  links: { download_location: string };
};

export type PuzzlePhotoResult = {
  photo: PuzzlePhoto;
  category: PuzzleCategory;
  /** Opaque, single-photo-use token issued by the proxy. */
  tracking_token: string;
};

export type PuzzlePhotoOrientation = 'portrait' | 'landscape';

const MAX_WARMING_RETRY_SECONDS = 5;
export const MIN_PUZZLE_PHOTO_ASPECT = 9 / 16;
export const MAX_PUZZLE_PHOTO_ASPECT = 16 / 9;
/**
 * The selected photograph may differ modestly from the viewport target because
 * camera sensors commonly use 3:2 while phones are taller/wider. Larger
 * differences recreate the mostly-empty table this hint is intended to avoid.
 */
export const MAX_PUZZLE_PHOTO_ASPECT_FACTOR = 1.25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasSupportedPuzzleAspect(width: number, height: number): boolean {
  const aspect = width / height;
  return aspect >= MIN_PUZZLE_PHOTO_ASPECT && aspect <= MAX_PUZZLE_PHOTO_ASPECT;
}

/**
 * Converts a safe-area viewport into the closest aspect the puzzle engine
 * supports. Invalid transient dimensions deliberately omit the preference;
 * the existing orientation-only request remains a safe fallback.
 */
export function resolvePuzzlePhotoTargetAspect(
  viewportWidth: number,
  viewportHeight: number,
): number | null {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }
  return Math.min(
    MAX_PUZZLE_PHOTO_ASPECT,
    Math.max(MIN_PUZZLE_PHOTO_ASPECT, viewportWidth / viewportHeight),
  );
}

function serializeTargetAspect(
  targetAspect: number | undefined,
  orientation: PuzzlePhotoOrientation | undefined,
): string | undefined {
  if (targetAspect === undefined) {
    return undefined;
  }
  if (
    !Number.isFinite(targetAspect) ||
    targetAspect < MIN_PUZZLE_PHOTO_ASPECT ||
    targetAspect > MAX_PUZZLE_PHOTO_ASPECT ||
    (orientation === 'portrait' && targetAspect > 1) ||
    (orientation === 'landscape' && targetAspect < 1)
  ) {
    throw new PhotoApiError(
      'Photo aspect target is invalid',
      'invalid_request',
    );
  }

  // Floor rather than round so the inclusive upper bound cannot serialize a
  // hair above 16:9. Four decimals are ample for layout selection.
  return String(Math.floor(targetAspect * 10_000) / 10_000);
}

function matchesTargetAspect(
  width: number,
  height: number,
  targetAspect: number | undefined,
): boolean {
  if (targetAspect === undefined) {
    return true;
  }
  const photoAspect = width / height;
  return (
    Math.max(photoAspect / targetAspect, targetAspect / photoAspect) <=
    MAX_PUZZLE_PHOTO_ASPECT_FACTOR
  );
}

function isHttpsUrl(value: unknown, hosts: readonly string[]): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      hosts.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function isPhotographerUrl(value: unknown): value is string {
  if (!isHttpsUrl(value, ['unsplash.com', 'www.unsplash.com'])) {
    return false;
  }
  const url = new URL(value);
  return (
    url.searchParams.get('utm_source') === 'frume' &&
    url.searchParams.get('utm_medium') === 'referral'
  );
}

function parsePuzzlePhoto(value: unknown): PuzzlePhoto | null {
  if (!isRecord(value) || !isRecord(value.links)) {
    return null;
  }
  const downloadLocation = normalizeUnsplashDownloadLocation(
    value.links.download_location,
  );
  if (
    typeof value.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) ||
    !isPositiveNumber(value.width) ||
    !isPositiveNumber(value.height) ||
    !hasSupportedPuzzleAspect(value.width, value.height) ||
    !(
      value.alt_description === null ||
      (typeof value.alt_description === 'string' &&
        value.alt_description.trim().length > 0 &&
        value.alt_description.length <= 500)
    ) ||
    !isRecord(value.urls) ||
    !isRecord(value.user) ||
    !isHttpsUrl(value.urls.regular, [
      'images.unsplash.com',
      'plus.unsplash.com',
    ]) ||
    typeof value.user.name !== 'string' ||
    !value.user.name.trim() ||
    !isRecord(value.user.links) ||
    !isPhotographerUrl(value.user.links.html) ||
    !downloadLocation
  ) {
    return null;
  }

  return {
    id: value.id,
    width: value.width,
    height: value.height,
    alt_description:
      typeof value.alt_description === 'string'
        ? value.alt_description.trim()
        : null,
    urls: { regular: value.urls.regular },
    user: {
      name: value.user.name.trim(),
      links: { html: value.user.links.html },
    },
    links: { download_location: downloadLocation },
  };
}

function parseCategory(value: unknown): PuzzleCategory | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.label !== 'string'
  ) {
    return null;
  }
  const category = PUZZLE_CATEGORIES.find(
    (candidate) => candidate.id === value.id && candidate.label === value.label,
  );
  return category ?? null;
}

function parsePhotoResponse(value: unknown): PuzzlePhotoResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const photo = parsePuzzlePhoto(value.photo);
  const category = parseCategory(value.category);
  const trackingToken = normalizePhotoTrackingToken(value.tracking_token);
  return photo && category && trackingToken
    ? { photo, category, tracking_token: trackingToken }
    : null;
}

function warmingRetryDelay(response: Response): number | null {
  if (response.status !== 503) {
    return null;
  }
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter === null || !retryAfter.trim()) return null;
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) &&
    seconds >= 0 &&
    seconds <= MAX_WARMING_RETRY_SECONDS
    ? seconds * 1_000
    : null;
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason ?? new Error('Photo request cancelled'),
    );
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Photo request cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Requests one curated photo from the shared Worker pool.
 *
 * There is deliberately no direct Unsplash fallback: the access key must
 * never be bundled into the app, and every device must share the same pool.
 * A new Durable Object pool may answer once with a short Retry-After while its
 * first refill completes; absorb that single warm-up response in the client.
 */
async function requestReadyPhoto(
  query: Readonly<Record<string, string | undefined>>,
  signal: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await requestPhotoApi(
      'photo',
      { method: 'GET', headers: { Accept: 'application/json' }, signal },
      query,
    );
    if (response.ok) return response;
    const retryDelay = attempt === 0 ? warmingRetryDelay(response) : null;
    if (retryDelay !== null) {
      await waitForRetry(retryDelay, signal);
      continue;
    }
    await throwPhotoApiResponseError(response);
  }
  throw new PhotoApiError(
    'Photo service did not become ready',
    'request_failed',
  );
}

async function readPhotoJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new PhotoApiError(
      'Photo service returned invalid JSON',
      'invalid_response',
      response.status,
    );
  }
}

export async function fetchPuzzlePhoto(
  categoryId?: string,
  signal?: AbortSignal,
  orientation?: PuzzlePhotoOrientation,
  targetAspect?: number,
  photoId?: string,
): Promise<PuzzlePhotoResult> {
  return withPhotoApiRequestDeadline(async (requestSignal) => {
    const response = await requestReadyPhoto(
      {
        category: categoryId,
        id: photoId,
        orientation,
        aspect: serializeTargetAspect(targetAspect, orientation),
      },
      requestSignal,
    );
    const body = await readPhotoJson(response);

    const result = parsePhotoResponse(body);
    const matchesOrientation =
      !orientation ||
      (result !== null &&
        (orientation === 'portrait'
          ? result.photo.height > result.photo.width
          : result.photo.width > result.photo.height));
    const matchesAspect =
      result !== null &&
      matchesTargetAspect(
        result.photo.width,
        result.photo.height,
        targetAspect,
      );
    if (
      !result ||
      (categoryId !== undefined && result.category.id !== categoryId) ||
      (photoId !== undefined && result.photo.id !== photoId) ||
      !matchesOrientation ||
      !matchesAspect
    ) {
      throw new PhotoApiError(
        'Photo service returned an invalid photo',
        'invalid_response',
        response.status,
      );
    }

    return result;
  }, signal);
}

/** Browsing never issues photo-use grants. Only the photograph actually chosen does. */
export async function browsePuzzlePhotos(
  categoryId: string,
  signal?: AbortSignal,
  orientation?: PuzzlePhotoOrientation,
  targetAspect?: number,
): Promise<PuzzlePhoto[]> {
  return withPhotoApiRequestDeadline(async (requestSignal) => {
    const response = await requestReadyPhoto(
      {
        category: categoryId,
        browse: '1',
        orientation,
        aspect: serializeTargetAspect(targetAspect, orientation),
      },
      requestSignal,
    );
    const body = await readPhotoJson(response);
    if (
      !isRecord(body) ||
      !Array.isArray(body.photos) ||
      body.photos.length < 1 ||
      body.photos.length > 6 ||
      parseCategory(body.category)?.id !== categoryId
    )
      throw new PhotoApiError('Invalid photo collection', 'invalid_response');
    const photos = body.photos.map(parsePuzzlePhoto);
    if (
      photos.some(
        (photo) =>
          !photo ||
          !matchesTargetAspect(photo.width, photo.height, targetAspect) ||
          (orientation === 'portrait' && photo.height <= photo.width) ||
          (orientation === 'landscape' && photo.width <= photo.height),
      )
    )
      throw new PhotoApiError('Invalid photo collection', 'invalid_response');
    return photos as PuzzlePhoto[];
  }, signal);
}
