#!/usr/bin/env node

/**
 * Proves the analytics capture contract against the real configured project.
 *
 * The client's payload shape is derived from PostHog's documented capture API,
 * and a wrong endpoint, key type, or body would fail silently in production:
 * events would queue, drain, and be discarded with nobody the wiser. This sends
 * one clearly-marked event and reports what the service actually said.
 *
 * It never runs implicitly. Like the public-page live check, it touches the
 * network only when explicitly asked:
 *
 *   FRUME_VERIFY_ANALYTICS=1 npm run analytics:verify
 *
 * The event is named `frume_transport_check` rather than a real product event
 * so it cannot contaminate a funnel. Filter or ignore it in PostHog.
 */

import { readFileSync } from 'node:fs';

import { isDirectCli } from './is-direct-cli.mjs';

const PROJECT_TOKEN_PATTERN = /^phc_[A-Za-z0-9]{20,}$/;
const REQUEST_TIMEOUT_MS = 15_000;

/** Minimal `.env.local` reader: this script runs outside Metro's env loading. */
export function readEnvFile(contents) {
  const values = {};
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function resolveAnalyticsSettings(env) {
  const host = env.EXPO_PUBLIC_ANALYTICS_HOST?.trim();
  const apiKey = env.EXPO_PUBLIC_ANALYTICS_API_KEY?.trim();

  if (!host || !apiKey) {
    throw new Error(
      'EXPO_PUBLIC_ANALYTICS_HOST and EXPO_PUBLIC_ANALYTICS_API_KEY must both be set.',
    );
  }

  if (apiKey.startsWith('phx_')) {
    throw new Error(
      'EXPO_PUBLIC_ANALYTICS_API_KEY is a PostHog personal API key (phx_). It grants read and write access to the whole account, every EXPO_PUBLIC_* value is compiled into the shipped bundle, and it does not authenticate the capture endpoint. Revoke it and use the project token (phc_).',
    );
  }

  if (!PROJECT_TOKEN_PATTERN.test(apiKey)) {
    throw new Error(
      'EXPO_PUBLIC_ANALYTICS_API_KEY must be a PostHog project token (phc_...).',
    );
  }

  let baseUrl;
  try {
    baseUrl = new URL(host.endsWith('/') ? host : `${host}/`);
  } catch {
    throw new Error('EXPO_PUBLIC_ANALYTICS_HOST is not a valid URL.');
  }
  if (baseUrl.protocol !== 'https:' || baseUrl.pathname !== '/') {
    throw new Error(
      'EXPO_PUBLIC_ANALYTICS_HOST must be a bare HTTPS origin, such as https://eu.i.posthog.com.',
    );
  }

  return {
    origin: baseUrl.origin,
    captureUrl: new URL('batch/', baseUrl).toString(),
    // `/flags` authenticates the token; `/batch` does not. Both are needed:
    // one proves the credential, the other exercises the real payload.
    preflightUrl: new URL('flags?v=2', baseUrl).toString(),
    apiKey,
  };
}

/**
 * Explains a region preflight result.
 *
 * The capture endpoint answers `200 {"status":"Ok"}` to *any* payload, including
 * one carrying a token from the other cloud region, and then silently drops the
 * event. A capture 200 therefore proves nothing on its own. `/flags` does
 * authenticate the token, so it is what actually establishes that this token
 * belongs to this host.
 */
export function describePreflightStatus(status, origin) {
  if (status === 200) {
    return null;
  }
  if (status === 401) {
    return `${origin} rejected the project token (401). PostHog US and EU are separate deployments and a token exists in only one of them, so EXPO_PUBLIC_ANALYTICS_HOST does not match the region the project lives in. Check the project's region in PostHog and use https://us.i.posthog.com or https://eu.i.posthog.com to match it.`;
  }
  return `Region preflight against ${origin} returned ${status}.`;
}

/** Mirrors the client payload in `src/analytics/analyticsApi.ts`. */
export function buildCheckPayload(apiKey, timestamp) {
  return {
    api_key: apiKey,
    batch: [
      {
        event: 'frume_transport_check',
        timestamp,
        properties: {
          distinct_id: 'frume-transport-check',
          $process_person_profile: false,
          $geoip_disable: true,
        },
      },
    ],
  };
}

async function main() {
  if (process.env.FRUME_VERIFY_ANALYTICS !== '1') {
    console.log(
      'Skipped: set FRUME_VERIFY_ANALYTICS=1 to send one check event to the configured PostHog project.',
    );
    return 0;
  }

  let fileEnv = {};
  try {
    fileEnv = readEnvFile(readFileSync('.env.local', 'utf8'));
  } catch {
    // Falling back to the ambient environment is correct for CI and for an
    // operator who exports the values directly.
  }

  const settings = resolveAnalyticsSettings({ ...fileEnv, ...process.env });

  // Establish that the token belongs to this region before sending anything.
  // Without this the capture 200 below is meaningless.
  const preflight = await fetch(settings.preflightUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: settings.apiKey,
      distinct_id: 'frume-transport-check',
    }),
  });
  const preflightFailure = describePreflightStatus(
    preflight.status,
    settings.origin,
  );
  if (preflightFailure) {
    throw new Error(preflightFailure);
  }
  console.log(
    `Region and token confirmed: ${settings.origin} authenticated the project token.`,
  );

  const payload = buildCheckPayload(settings.apiKey, new Date().toISOString());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(settings.captureUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${settings.captureUrl} returned ${response.status}. Body: ${body.slice(0, 400)}`,
    );
  }

  console.log(
    `Check event accepted: ${settings.captureUrl} returned ${response.status}. Body: ${body.slice(0, 200)}`,
  );
  console.log(
    'Note that the capture endpoint answers 200 to anything; the region preflight above is what proves the token is real. Confirm the event "frume_transport_check" actually appears in PostHog — ingestion is asynchronous, so allow a minute.',
  );
  return 0;
}

if (isDirectCli(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
