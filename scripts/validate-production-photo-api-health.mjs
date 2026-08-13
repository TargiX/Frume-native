#!/usr/bin/env node

import { isDirectCli } from './is-direct-cli.mjs';

export const REQUIRED_PHOTO_API_HEALTH_CHECKS = [
  'categoryPools',
  'trackingGrants',
  'providerBudget',
  'photoIssueRateLimiter',
  'trackingRateLimiter',
  'unsplashAccessKey',
  'trackingTokenSecret',
  'photoApiEnabled',
  'deploymentIdentity',
];

const PHOTO_API_DEPLOYMENT_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]{11,127}$/;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDeploymentId(value) {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    PHOTO_API_DEPLOYMENT_ID_PATTERN.test(value)
  );
}

export function requireExpectedPhotoApiDeploymentId(value) {
  if (!validDeploymentId(value)) {
    throw new Error(
      'FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID must be set to the exact reviewed public deployment identity.',
    );
  }
  return value;
}

export function validatePhotoApiHealthPayload(value, expectedDeploymentId) {
  if (!isRecord(value) || value.status !== 'ok' || !isRecord(value.checks)) {
    throw new Error('Photo API health response is not ready.');
  }

  const actualChecks = Object.keys(value.checks).sort();
  const requiredChecks = [...REQUIRED_PHOTO_API_HEALTH_CHECKS].sort();
  if (
    actualChecks.length !== requiredChecks.length ||
    actualChecks.some((check, index) => check !== requiredChecks[index])
  ) {
    throw new Error('Photo API health response does not match the reviewed readiness contract.');
  }

  const failedCheck = REQUIRED_PHOTO_API_HEALTH_CHECKS.find(
    (check) => value.checks[check] !== true,
  );
  if (failedCheck) {
    throw new Error(`Photo API health check ${failedCheck} is not ready.`);
  }

  // Older programmatic contract tests exercise readiness independently. The
  // signed-archive CLI always supplies an expected ID below, making identity
  // mandatory on the real release path.
  if (expectedDeploymentId !== undefined) {
    const expected = requireExpectedPhotoApiDeploymentId(expectedDeploymentId);
    if (!validDeploymentId(value.deploymentId)) {
      throw new Error(
        'Photo API health does not expose a valid deployment identity.',
      );
    }
    if (value.deploymentId !== expected) {
      throw new Error(
        'Photo API health does not match the expected deployment identity.',
      );
    }
  } else if (
    value.deploymentId !== undefined &&
    !validDeploymentId(value.deploymentId)
  ) {
    throw new Error('Photo API health exposes an invalid deployment identity.');
  }
}

export async function validateProductionPhotoApiHealth({
  baseUrl,
  expectedDeploymentId,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}) {
  const healthUrl = new URL('/health', baseUrl);
  let response;
  try {
    response = await fetchImpl(healthUrl, {
      headers: {
        accept: 'application/json',
        'user-agent': 'FrumeReleaseGuard/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(
      `Photo API health could not be reached: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error('Photo API health must not redirect.');
  }
  if (response.status !== 200) {
    throw new Error(`Photo API health returned HTTP ${response.status}, not 200.`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Photo API health did not return JSON content.');
  }

  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > 16 * 1024) {
    throw new Error('Photo API health response is unexpectedly large.');
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('Photo API health returned invalid JSON.');
  }
  validatePhotoApiHealthPayload(payload, expectedDeploymentId);
  return healthUrl;
}

async function run() {
  const configuredValue = process.env.EXPO_PUBLIC_PHOTO_API_URL?.trim();
  if (!configuredValue) {
    throw new Error('EXPO_PUBLIC_PHOTO_API_URL must be set.');
  }
  const baseUrl = new URL(configuredValue);
  if (
    baseUrl.protocol !== 'https:' ||
    baseUrl.pathname !== '/' ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error('EXPO_PUBLIC_PHOTO_API_URL must be the reviewed HTTPS Worker origin.');
  }
  const expectedDeploymentId = requireExpectedPhotoApiDeploymentId(
    process.env.FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID,
  );

  const timeoutMs = Number.parseInt(
    process.env.FRUME_PHOTO_API_HEALTH_TIMEOUT_MS ?? '10000',
    10,
  );
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error('FRUME_PHOTO_API_HEALTH_TIMEOUT_MS must be between 1 and 60000.');
  }

  await validateProductionPhotoApiHealth({
    baseUrl,
    expectedDeploymentId,
    timeoutMs,
  });
  console.log('Production photo API is reachable and fully ready.');
}

if (isDirectCli(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
