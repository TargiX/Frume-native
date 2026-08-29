import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { isDirectCli } from './is-direct-cli.mjs';

const require = createRequire(import.meta.url);
const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPDATE_CHANNELS = new Set(['preview', 'production']);

function assertConfig(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateOtaConfig({
  appConfig,
  easConfig,
  expectedChannel = 'production',
}) {
  assertConfig(
    UPDATE_CHANNELS.has(expectedChannel),
    'The expected OTA channel must be preview or production.',
  );

  const projectId = appConfig?.extra?.eas?.projectId;
  assertConfig(
    typeof projectId === 'string' && PROJECT_ID_PATTERN.test(projectId),
    'extra.eas.projectId must be the canonical UUID of the linked EAS project.',
  );

  assertConfig(
    appConfig?.updates?.url === `https://u.expo.dev/${projectId}`,
    'updates.url must exactly match the configured EAS project ID.',
  );
  assertConfig(
    appConfig?.updates?.enabled === true,
    'EAS Update must be explicitly enabled.',
  );
  assertConfig(
    appConfig?.runtimeVersion?.policy === 'fingerprint',
    'EAS Update must use the fingerprint runtime policy.',
  );
  assertConfig(
    appConfig?.updates?.checkAutomatically === 'ON_LOAD',
    'The app must check for OTA updates on launch.',
  );
  assertConfig(
    appConfig?.updates?.fallbackToCacheTimeout === 0,
    'OTA startup must not block launch while waiting for the network.',
  );
  assertConfig(
    appConfig?.updates?.useEmbeddedUpdate === true,
    'The reviewed embedded bundle must remain available as the offline fallback.',
  );
  assertConfig(
    appConfig?.updates?.disableAntiBrickingMeasures === false,
    'Expo anti-bricking measures must remain enabled.',
  );
  assertConfig(
    appConfig?.updates?.requestHeaders?.['expo-channel-name'] === expectedChannel,
    `The embedded OTA channel is ${String(
      appConfig?.updates?.requestHeaders?.['expo-channel-name'],
    )}; expected ${expectedChannel}.`,
  );
  assertConfig(
    easConfig?.build?.preview?.channel === 'preview',
    'The EAS preview build profile must use the preview update channel.',
  );
  assertConfig(
    easConfig?.build?.production?.channel === 'production',
    'The EAS production build profile must use the production update channel.',
  );

  return { projectId, channel: expectedChannel };
}

function run() {
  const expectedChannel = process.env.FRUME_UPDATE_CHANNEL ?? 'production';
  const appConfig = require('../app.config.js').expo;
  const easConfig = JSON.parse(
    readFileSync(new URL('../eas.json', import.meta.url), 'utf8'),
  );
  const result = validateOtaConfig({
    appConfig,
    easConfig,
    expectedChannel,
  });
  console.log(
    `EAS Update configuration verified for project ${result.projectId} on ${result.channel}.`,
  );
}

if (isDirectCli(import.meta.url)) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
