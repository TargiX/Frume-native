import type { AnalyticsEvent } from './analyticsEvents';

/**
 * Transport for the PostHog capture API.
 *
 * Frume talks to the documented HTTP endpoint rather than the vendor SDK. The
 * SDK would add a native dependency to a tree that the release archive scan and
 * `npm run security:dependencies` both gate, and it autocaptures screens,
 * lifecycle, and device context that would then have to be switched off one
 * property at a time. A hand-written request keeps the entire outbound payload
 * readable in this one file, which is what the privacy declaration in
 * `STORE_METADATA.md` is asserting.
 *
 * The project API key is a write-only ingest key, the same class of client
 * value as the RevenueCat public SDK key: it can append events and cannot read
 * anything back.
 */

export type AnalyticsApiErrorCode =
  | 'not_configured'
  | 'invalid_configuration'
  | 'network_error'
  | 'request_timeout'
  | 'request_failed';

export const ANALYTICS_API_REQUEST_TIMEOUT_MS = 10_000;

export class AnalyticsApiError extends Error {
  constructor(
    message: string,
    readonly code: AnalyticsApiErrorCode,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AnalyticsApiError';
  }
}

export type AnalyticsConfiguration = {
  captureUrl: string;
  apiKey: string;
};

/**
 * PostHog project tokens start with `phc_` and are designed to be public.
 * Personal API keys start with `phx_` and grant read and write access to the
 * whole account.
 *
 * Metro inlines every `EXPO_PUBLIC_*` value into the shipped bundle, so a
 * personal key placed here would be published to every player's device and
 * extractable from it. It would also simply not work, because the capture
 * endpoint authenticates project tokens rather than personal keys. Rejecting
 * anything that is not a project token turns a silent credential leak into a
 * build-time stop.
 */
const PROJECT_TOKEN_PATTERN = /^phc_[A-Za-z0-9]{20,}$/;

/**
 * Returns null when the build has no analytics configuration.
 *
 * A missing key is the normal state for development and simulator builds, so it
 * disables collection silently instead of raising. A present but malformed host
 * is a build mistake and does raise, because shipping it would quietly lose
 * every event.
 */
export function readAnalyticsConfiguration(): AnalyticsConfiguration | null {
  const apiKey = process.env.EXPO_PUBLIC_ANALYTICS_API_KEY?.trim();
  const host = process.env.EXPO_PUBLIC_ANALYTICS_HOST?.trim();
  if (!apiKey || !host) {
    return null;
  }

  if (!PROJECT_TOKEN_PATTERN.test(apiKey)) {
    throw new AnalyticsApiError(
      apiKey.startsWith('phx_')
        ? 'EXPO_PUBLIC_ANALYTICS_API_KEY is a PostHog personal API key. That is a private read/write credential and every EXPO_PUBLIC_* value is compiled into the shipped bundle. Revoke it and use the project token (phc_...).'
        : 'EXPO_PUBLIC_ANALYTICS_API_KEY must be a PostHog project token (phc_...).',
      'invalid_configuration',
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(host.endsWith('/') ? host : `${host}/`);
  } catch {
    throw new AnalyticsApiError(
      'EXPO_PUBLIC_ANALYTICS_HOST is not a valid URL',
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
    throw new AnalyticsApiError(
      'EXPO_PUBLIC_ANALYTICS_HOST must be an HTTPS origin (or local HTTP origin) without credentials, path, query, or hash',
      'invalid_configuration',
    );
  }

  return {
    captureUrl: new URL('batch/', baseUrl).toString(),
    apiKey,
  };
}

export function analyticsConfigured(): boolean {
  try {
    return readAnalyticsConfiguration() !== null;
  } catch {
    // An invalid host is reported where collection is started, not here.
    return false;
  }
}

function serializeEvent(
  event: AnalyticsEvent,
  distinctId: string,
): Record<string, unknown> {
  return {
    event: event.name,
    timestamp: new Date(event.occurredAt).toISOString(),
    properties: {
      ...event.properties,
      distinct_id: distinctId,
      // No person record is created, so events cannot accumulate into a
      // profile. This is the mechanism behind "not linked to the user's
      // identity" in the App Store privacy answer.
      $process_person_profile: false,
      // Skips geographic resolution of the request address, so no location is
      // derived from an event.
      //
      // This is the only IP control the client has. Whether the raw address is
      // *stored* is a project setting — Settings > Project > Privacy > "IP data
      // capture configuration" — not something a payload property can assert.
      // `RELEASE.md` owns verifying it, and the App Privacy answer depends on
      // it.
      $geoip_disable: true,
    },
  };
}

/**
 * Sends one batch under a single deadline.
 *
 * Analytics is best-effort and has no caller to cancel it, so the deadline is
 * simpler than the photo path's: one timeout, one abort, no linked signal.
 */
export async function sendAnalyticsBatch(
  events: readonly AnalyticsEvent[],
  distinctId: string,
  configuration: AnalyticsConfiguration,
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const controller = new AbortController();
  const timeoutError = new AnalyticsApiError(
    'Analytics service took too long to respond',
    'request_timeout',
  );
  const timeout = setTimeout(() => {
    controller.abort(timeoutError);
  }, ANALYTICS_API_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(configuration.captureUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: configuration.apiKey,
        batch: events.map((event) => serializeEvent(event, distinctId)),
      }),
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw timeoutError;
    }
    if (error instanceof AnalyticsApiError) {
      throw error;
    }
    throw new AnalyticsApiError(
      'Analytics service is unavailable',
      'network_error',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new AnalyticsApiError(
      `Analytics request failed (${response.status})`,
      'request_failed',
      response.status,
    );
  }
}
