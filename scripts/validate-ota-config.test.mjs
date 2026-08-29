import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { validateOtaConfig } from './validate-ota-config.mjs';

const require = createRequire(import.meta.url);
const repositoryAppConfig = require('../app.config.js').expo;
const repositoryEasConfig = JSON.parse(
  readFileSync(new URL('../eas.json', import.meta.url), 'utf8'),
);

const projectId = '123e4567-e89b-42d3-a456-426614174000';

function validAppConfig() {
  return {
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      enabled: true,
      url: `https://u.expo.dev/${projectId}`,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      useEmbeddedUpdate: true,
      disableAntiBrickingMeasures: false,
      requestHeaders: {
        'expo-channel-name': 'production',
      },
    },
    extra: {
      eas: { projectId },
    },
  };
}

function validEasConfig() {
  return {
    build: {
      preview: { channel: 'preview' },
      production: { channel: 'production' },
    },
  };
}

test('accepts the fail-safe production OTA contract', () => {
  assert.doesNotThrow(() =>
    validateOtaConfig({
      appConfig: validAppConfig(),
      easConfig: validEasConfig(),
      expectedChannel: 'production',
    }),
  );
});

test('rejects an update URL that is not bound to the configured EAS project', () => {
  const appConfig = validAppConfig();
  appConfig.updates.url = 'https://u.expo.dev/00000000-0000-4000-8000-000000000000';

  assert.throws(
    () =>
      validateOtaConfig({
        appConfig,
        easConfig: validEasConfig(),
        expectedChannel: 'production',
      }),
    /must exactly match the configured EAS project ID/,
  );
});

test('rejects a native runtime policy that could accept incompatible updates', () => {
  const appConfig = validAppConfig();
  appConfig.runtimeVersion = { policy: 'appVersion' };

  assert.throws(
    () =>
      validateOtaConfig({
        appConfig,
        easConfig: validEasConfig(),
        expectedChannel: 'production',
      }),
    /fingerprint runtime policy/,
  );
});

test('rejects a production binary pointed at another update channel', () => {
  const appConfig = validAppConfig();
  appConfig.updates.requestHeaders['expo-channel-name'] = 'preview';

  assert.throws(
    () =>
      validateOtaConfig({
        appConfig,
        easConfig: validEasConfig(),
        expectedChannel: 'production',
      }),
    /expected production/,
  );
});

test('repository configuration satisfies the production OTA contract', () => {
  assert.doesNotThrow(() =>
    validateOtaConfig({
      appConfig: repositoryAppConfig,
      easConfig: repositoryEasConfig,
      expectedChannel: 'production',
    }),
  );
});
