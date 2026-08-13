export type PhotoApiErrorCode =
  | 'not_configured'
  | 'invalid_configuration'
  | 'invalid_request'
  | 'network_error'
  | 'request_timeout'
  | 'invalid_response'
  | 'request_failed'
  | 'queue_full';

export const PHOTO_API_REQUEST_TIMEOUT_MS = 15_000;

export class PhotoApiError extends Error {
  constructor(
    message: string,
    readonly code: PhotoApiErrorCode,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PhotoApiError';
  }
}

function cancellationReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('Photo request cancelled');
}

/**
 * Gives a complete photo operation one deadline while preserving caller
 * cancellation. The operation receives a linked signal so an in-flight native
 * fetch or retry delay is also asked to stop. Promise.race is intentional:
 * some network implementations do not settle promptly after aborting.
 */
export async function withPhotoApiRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal,
): Promise<T> {
  if (callerSignal?.aborted) {
    throw cancellationReason(callerSignal);
  }

  const requestController = new AbortController();
  const timeoutError = new PhotoApiError(
    'Photo service took too long to respond',
    'request_timeout',
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectCancellation: ((reason?: unknown) => void) | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      // Settle our public promise first; aborting may synchronously reject fetch.
      reject(timeoutError);
      requestController.abort(timeoutError);
    }, PHOTO_API_REQUEST_TIMEOUT_MS);
  });

  const onCallerAbort = () => {
    const reason = callerSignal
      ? cancellationReason(callerSignal)
      : new Error('Photo request cancelled');
    rejectCancellation?.(reason);
    requestController.abort(reason);
  };
  const cancellationPromise = callerSignal
    ? new Promise<never>((_resolve, reject) => {
        rejectCancellation = reject;
        callerSignal.addEventListener('abort', onCallerAbort, { once: true });
      })
    : null;

  const operationPromise = Promise.resolve().then(() =>
    operation(requestController.signal),
  );

  try {
    return await Promise.race(
      cancellationPromise
        ? [operationPromise, timeoutPromise, cancellationPromise]
        : [operationPromise, timeoutPromise],
    );
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

export function buildPhotoApiUrl(endpoint: 'photo' | 'track'): string {
  const configuredUrl = process.env.EXPO_PUBLIC_PHOTO_API_URL?.trim();
  if (!configuredUrl) {
    throw new PhotoApiError(
      'EXPO_PUBLIC_PHOTO_API_URL is not configured',
      'not_configured',
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(
      configuredUrl.endsWith('/') ? configuredUrl : `${configuredUrl}/`,
    );
  } catch {
    throw new PhotoApiError(
      'EXPO_PUBLIC_PHOTO_API_URL is not a valid URL',
      'invalid_configuration',
    );
  }

  const isLocalHttp =
    baseUrl.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname);
  if (
    (baseUrl.protocol !== 'https:' && !isLocalHttp) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    baseUrl.pathname !== '/'
  ) {
    throw new PhotoApiError(
      'EXPO_PUBLIC_PHOTO_API_URL must be an HTTPS Worker origin (or local HTTP origin) without credentials, path, query, or hash',
      'invalid_configuration',
    );
  }

  return new URL(endpoint, baseUrl).toString();
}

export async function requestPhotoApi(
  endpoint: 'photo' | 'track',
  init?: RequestInit,
  query?: Readonly<Record<string, string | undefined>>,
): Promise<Response> {
  const url = new URL(buildPhotoApiUrl(endpoint));
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  try {
    return await fetch(url.toString(), init);
  } catch (error) {
    if (error instanceof PhotoApiError) {
      throw error;
    }
    throw new PhotoApiError('Photo service is unavailable', 'network_error');
  }
}

export async function throwPhotoApiResponseError(response: Response): Promise<never> {
  let message = `Photo service request failed (${response.status})`;
  try {
    const body = (await response.json()) as unknown;
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string' &&
      body.error.trim()
    ) {
      message = body.error;
    }
  } catch {
    // Keep the status-based message when the error body is empty or malformed.
  }
  throw new PhotoApiError(message, 'request_failed', response.status);
}
