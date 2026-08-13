#!/usr/bin/env node

import { isIP } from 'node:net';
import {
  RELEASE_PAGE_CONTENT_CONTRACTS,
  releasePageContentFailures,
} from '../support-site/release-content-contract.mjs';
import { isDirectCli } from './is-direct-cli.mjs';

const AUTH_DESTINATION_PATTERN =
  /(?:^|[./_-])(auth|login|log-in|signin|sign-in|sso)(?:$|[./?&=_-])/i;

export function parsePublicHttpsUrl(variableName, configuredValue) {
  let url;
  try {
    url = new URL(configuredValue);
  } catch {
    throw new Error(`${variableName} must be an absolute public HTTPS URL.`);
  }

  const hostname = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '')
    .toLowerCase();
  const localHostname =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    hostname.startsWith('127.') ||
    isIP(hostname) !== 0;

  if (
    url.protocol !== 'https:' ||
    localHostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${variableName} must be a public HTTPS URL without credentials, query, or fragment.`,
    );
  }

  return url;
}

function authLikeDestination(url) {
  return AUTH_DESTINATION_PATTERN.test(
    `${url.hostname}${url.pathname}${url.search}`,
  );
}

export async function validatePublicReleasePage({
  label,
  initialUrl,
  contentContract,
  requiredMarkers,
  forbiddenMarkers = [],
  fetchImpl = fetch,
  maxRedirects = 5,
  timeoutMs = 10_000,
}) {
  const origin = initialUrl.origin;
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    let response;
    try {
      response = await fetchImpl(currentUrl, {
        headers: {
          accept: 'text/html',
          'user-agent': 'FrumeReleaseGuard/1.0',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error(
        `${label} page could not be reached: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`${label} page returned a redirect without a Location header.`);
      }

      const nextUrl = new URL(location, currentUrl);
      if (nextUrl.protocol !== 'https:' || nextUrl.origin !== origin) {
        throw new Error(
          `${label} page redirected away from its reviewed public HTTPS origin.`,
        );
      }
      if (authLikeDestination(nextUrl)) {
        throw new Error(`${label} page redirected to an authentication route.`);
      }
      currentUrl = nextUrl;
      continue;
    }

    if (response.status !== 200) {
      throw new Error(`${label} page returned HTTP ${response.status}, not 200.`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html')) {
      throw new Error(`${label} page did not return HTML content.`);
    }

    const body = await response.text();
    const effectiveContract =
      contentContract ?? {
        label,
        requiredMarkers,
        forbiddenMarkers,
      };
    const [contentFailure] = releasePageContentFailures(body, effectiveContract);
    if (contentFailure) {
      throw new Error(`${label} page content ${contentFailure}.`);
    }

    return currentUrl;
  }

  throw new Error(`${label} page exceeded ${maxRedirects} redirects.`);
}

async function run() {
  const privacyUrl = parsePublicHttpsUrl(
    'EXPO_PUBLIC_PRIVACY_URL',
    process.env.EXPO_PUBLIC_PRIVACY_URL,
  );
  const supportUrl = parsePublicHttpsUrl(
    'EXPO_PUBLIC_SUPPORT_URL',
    process.env.EXPO_PUBLIC_SUPPORT_URL,
  );
  const liveFlag = process.env.FRUME_VERIFY_PUBLIC_RELEASE_PAGES;

  if (liveFlag !== undefined && liveFlag !== '' && liveFlag !== '0' && liveFlag !== '1') {
    throw new Error('FRUME_VERIFY_PUBLIC_RELEASE_PAGES must be 1, 0, or unset.');
  }

  if (liveFlag !== '1') {
    console.log(
      'Public release page URL format verified; live reachability check not requested.',
    );
    return;
  }

  const timeoutMs = Number.parseInt(
    process.env.FRUME_PUBLIC_PAGE_TIMEOUT_MS ?? '10000',
    10,
  );
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error('FRUME_PUBLIC_PAGE_TIMEOUT_MS must be between 1 and 60000.');
  }

  await validatePublicReleasePage({
    label: 'Privacy',
    initialUrl: privacyUrl,
    contentContract: RELEASE_PAGE_CONTENT_CONTRACTS.privacy,
    timeoutMs,
  });
  await validatePublicReleasePage({
    label: 'Support',
    initialUrl: supportUrl,
    contentContract: RELEASE_PAGE_CONTENT_CONTRACTS.support,
    timeoutMs,
  });

  console.log('Public privacy and support pages are anonymously reachable.');
}

if (isDirectCli(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
