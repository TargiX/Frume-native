import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  REQUIRED_PHOTO_API_HEALTH_CHECKS,
  validatePhotoApiHealthPayload,
  validateProductionPhotoApiHealth,
} from './validate-production-photo-api-health.mjs';

const deploymentId = 'frume-photo-api-deployment-20260812-a1b2c3d4';
const checks = Object.fromEntries(
  REQUIRED_PHOTO_API_HEALTH_CHECKS.map((check) => [check, true]),
);

function readyPayload(overrides = {}) {
  return {
    status: 'ok',
    deploymentId,
    checks,
    ...overrides,
  };
}

test('health payload must expose the exact expected deployment identity', () => {
  assert.doesNotThrow(() =>
    validatePhotoApiHealthPayload(readyPayload(), deploymentId),
  );
  assert.throws(
    () =>
      validatePhotoApiHealthPayload(
        readyPayload({ deploymentId: 'frume-photo-api-other-deployment' }),
        deploymentId,
      ),
    /does not match the expected deployment identity/,
  );
  assert.throws(
    () =>
      validatePhotoApiHealthPayload(
        readyPayload({ deploymentId: undefined }),
        deploymentId,
      ),
    /does not expose a valid deployment identity/,
  );
});

test('production health fetch binds readiness to the expected deployment', async () => {
  await assert.rejects(
    validateProductionPhotoApiHealth({
      baseUrl: new URL('https://photos.example.com/'),
      expectedDeploymentId: deploymentId,
      fetchImpl: async () =>
        Response.json(
          readyPayload({ deploymentId: 'frume-photo-api-other-deployment' }),
        ),
    }),
    /does not match the expected deployment identity/,
  );
});

test('CLI fails before network access when expected deployment identity is absent', () => {
  const scriptPath = fileURLToPath(
    new URL('./validate-production-photo-api-health.mjs', import.meta.url),
  );
  const env = {
    ...process.env,
    EXPO_PUBLIC_PHOTO_API_URL: 'https://unreachable.invalid',
  };
  delete env.FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID;

  const result = spawnSync(process.execPath, [scriptPath], {
    env,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID must be set/,
  );
  assert.doesNotMatch(result.stderr, /could not be reached/);
});
