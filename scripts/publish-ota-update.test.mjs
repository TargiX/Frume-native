import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildEasUpdateArguments,
  locateIosHermesBundle,
  validateOtaPublicationRequest,
} from './publish-ota-update.mjs';
import { releaseSourceManifestDigest } from './validate-release-revision.mjs';

const reviewedSha = 'a'.repeat(40);

/** Creates one complete explicit publication environment for contract tests. */
function validEnvironment(overrides = {}) {
  return {
    FRUME_REVIEWED_RELEASE_SHA: reviewedSha,
    FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID:
      'frume-photo-api-reviewed-a1b2c3d4',
    FRUME_UPDATE_CHANNEL: 'preview',
    FRUME_UPDATE_MESSAGE: 'Fix puzzle snapping',
    EXPO_PUBLIC_PHOTO_API_URL: 'https://photos.example.com',
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: `appl_${'a'.repeat(24)}`,
    EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID:
      'frume_premium_cuts',
    EXPO_PUBLIC_PRIVACY_URL: 'https://frume.example/privacy',
    EXPO_PUBLIC_SUPPORT_URL: 'https://frume.example/support',
    ...overrides,
  };
}

test('OTA publication requires one explicit reviewed environment', () => {
  assert.deepEqual(validateOtaPublicationRequest(validEnvironment()), {
    channel: 'preview',
    message: 'Fix puzzle snapping',
    reviewedSha,
    analyticsEnabled: false,
  });

  assert.throws(
    () =>
      validateOtaPublicationRequest(
        validEnvironment({ FRUME_UPDATE_CHANNEL: 'development' }),
      ),
    /preview or production/,
  );
  assert.throws(
    () =>
      validateOtaPublicationRequest(
        validEnvironment({ FRUME_UPDATE_MESSAGE: '   ' }),
      ),
    /FRUME_UPDATE_MESSAGE/,
  );
  assert.throws(
    () =>
      validateOtaPublicationRequest(
        validEnvironment({ EXPO_PUBLIC_SUPPORT_URL: '' }),
      ),
    /EXPO_PUBLIC_SUPPORT_URL/,
  );
  assert.throws(
    () =>
      validateOtaPublicationRequest(
        validEnvironment({
          EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: 'goog_unreviewed',
        }),
      ),
    /unreviewed public OTA values/,
  );
  assert.throws(
    () =>
      validateOtaPublicationRequest(
        validEnvironment({ EXPO_PUBLIC_UNREVIEWED_SECRET: 'must-not-ship' }),
      ),
    /EXPO_PUBLIC_UNREVIEWED_SECRET/,
  );
  assert.throws(
    () =>
      validateOtaPublicationRequest(
        validEnvironment({ NODE_OPTIONS: '--require=/tmp/injected.cjs' }),
      ),
    /Unset NODE_OPTIONS and NODE_PATH/,
  );
});

test('OTA publication treats analytics as an explicit all-or-nothing choice', () => {
  assert.throws(
    () =>
      validateOtaPublicationRequest(
        validEnvironment({
          EXPO_PUBLIC_ANALYTICS_HOST: 'https://eu.i.posthog.com',
        }),
      ),
    /must both be set or both be unset/,
  );
  assert.throws(
    () =>
      validateOtaPublicationRequest(
        validEnvironment({
          EXPO_PUBLIC_ANALYTICS_HOST: ' https://eu.i.posthog.com',
          EXPO_PUBLIC_ANALYTICS_API_KEY: `phc_${'b'.repeat(24)}`,
        }),
      ),
    /must not contain surrounding whitespace/,
  );

  assert.deepEqual(
    validateOtaPublicationRequest(
      validEnvironment({
        EXPO_PUBLIC_ANALYTICS_HOST: 'https://eu.i.posthog.com',
        EXPO_PUBLIC_ANALYTICS_API_KEY: `phc_${'b'.repeat(24)}`,
      }),
    ),
    {
      channel: 'preview',
      message: 'Fix puzzle snapping',
      reviewedSha,
      analyticsEnabled: true,
    },
  );
});

test('EAS publishes only the already-scanned iOS export', () => {
  assert.deepEqual(
    buildEasUpdateArguments({
      channel: 'production',
      message: 'Approved snapping fix',
      inputDirectory: '/tmp/frume-reviewed-update',
    }),
    [
      '--yes',
      'eas-cli@23.0.0',
      'update',
      '--channel',
      'production',
      '--platform',
      'ios',
      '--message',
      'Approved snapping fix',
      '--input-dir',
      '/tmp/frume-reviewed-update',
      '--skip-bundler',
      '--non-interactive',
    ],
  );
});

test('post-export validation requires exactly one iOS Hermes bundle', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'frume-ota-bundle-'));
  const bundleDirectory = join(fixture, '_expo', 'static', 'js', 'ios');
  mkdirSync(bundleDirectory, { recursive: true });

  try {
    assert.throws(() => locateIosHermesBundle(fixture), /exactly one/);
    const firstBundle = join(bundleDirectory, 'AppEntry-first.hbc');
    writeFileSync(firstBundle, 'first');
    assert.equal(locateIosHermesBundle(fixture), firstBundle);
    writeFileSync(join(bundleDirectory, 'AppEntry-second.hbc'), 'second');
    assert.throws(() => locateIosHermesBundle(fixture), /exactly one/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('reviewed source manifests bind file contents, paths, and executable mode', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'frume-ota-source-'));
  const scriptPath = join(fixture, 'release.sh');
  writeFileSync(scriptPath, '#!/bin/sh\nexit 0\n');

  try {
    const contents = readFileSync(scriptPath);
    const header = Buffer.from(`blob ${contents.length}\0`);
    const oid = createHash('sha1').update(header).update(contents).digest('hex');
    const expected = createHash('sha256')
      .update(`100644 ${oid}\trelease.sh`)
      .digest('hex');
    assert.equal(releaseSourceManifestDigest(fixture), expected);

    chmodSync(scriptPath, 0o755);
    assert.notEqual(releaseSourceManifestDigest(fixture), expected);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('the documented OTA path cannot bypass the repository publisher', () => {
  const packageManifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const releaseRunbook = readFileSync(
    new URL('../RELEASE.md', import.meta.url),
    'utf8',
  );
  const publisher = readFileSync(
    new URL('./publish-ota-update.mjs', import.meta.url),
    'utf8',
  );

  assert.equal(
    packageManifest.scripts['ota:publish'],
    './scripts/publish-ota-update.sh',
  );
  assert.doesNotMatch(releaseRunbook, /eas-cli@23\.0\.0 update/);
  assert.equal(
    releaseRunbook.match(/npm run ota:publish/g)?.length,
    2,
  );

  const cleanInstall = publisher.indexOf("label: 'Root clean dependency install'");
  const completeCheck = publisher.indexOf("label: 'Complete release check'");
  const exportBuild = publisher.indexOf("label: 'Reviewed iOS OTA export'");
  const bundleScan = publisher.indexOf("label: 'OTA Hermes bundle validation'");
  const publication = publisher.indexOf("label: 'EAS Update publication'");
  assert.ok(cleanInstall >= 0);
  assert.ok(completeCheck > cleanInstall);
  assert.ok(exportBuild > completeCheck);
  assert.ok(bundleScan > exportBuild);
  assert.ok(publication > bundleScan);
  assert.match(publisher, /EXPO_NO_DOTENV: '1'/);
  assert.match(publisher, /canonicalReleaseManifest/);
  assert.match(publisher, /releaseSourceManifestDigest/);
});
