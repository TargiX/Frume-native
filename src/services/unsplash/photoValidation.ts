const SAFE_PHOTO_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_DOWNLOAD_LOCATION_LENGTH = 2_048;
const TRACKING_TOKEN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TRACKING_TOKEN_LENGTH = 36;

/**
 * Accept only the download endpoint returned by Unsplash itself.
 *
 * Query parameters are retained for Unsplash's tracking token. This mirrors
 * the Worker's allowlist, which remains the authoritative server boundary.
 */
export function normalizeUnsplashDownloadLocation(
  value: unknown,
): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_DOWNLOAD_LOCATION_LENGTH
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    const match = /^\/photos\/([^/]+)\/download$/.exec(url.pathname);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'api.unsplash.com' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !match ||
      !SAFE_PHOTO_ID.test(match[1])
    ) {
      return null;
    }
    const normalized = url.toString();
    return normalized.length <= MAX_DOWNLOAD_LOCATION_LENGTH
      ? normalized
      : null;
  } catch {
    return null;
  }
}

/**
 * Accept only the canonical UUIDv4 token issued by the photo proxy.
 *
 * Treat the value as opaque: do not trim, lowercase, or otherwise transform
 * it before it is durably stored and returned to the server.
 */
export function normalizePhotoTrackingToken(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length === TRACKING_TOKEN_LENGTH &&
    TRACKING_TOKEN.test(value)
    ? value
    : null;
}
