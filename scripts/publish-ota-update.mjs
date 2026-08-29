#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDirectCli } from './is-direct-cli.mjs';
import {
  canonicalReleaseManifest,
  exportReviewedReleaseSource,
  releaseSourceManifestDigest,
  validateReleaseRevisionFromGit,
} from './validate-release-revision.mjs';
import { resolveAnalyticsSettings } from './verify-analytics-transport.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const MANIFEST_PATTERN = /^[0-9a-f]{64}$/u;
const UPDATE_CHANNELS = new Set(['preview', 'production']);
const REQUIRED_PUBLIC_VALUES = [
  'EXPO_PUBLIC_PHOTO_API_URL',
  'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
  'EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID',
  'EXPO_PUBLIC_PRIVACY_URL',
  'EXPO_PUBLIC_SUPPORT_URL',
];
const ALLOWED_PUBLIC_VALUES = new Set([
  ...REQUIRED_PUBLIC_VALUES,
  'EXPO_PUBLIC_ANALYTICS_HOST',
  'EXPO_PUBLIC_ANALYTICS_API_KEY',
]);

/** Returns one explicit, non-blank environment value without normalizing it. */
function requireValue(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be set explicitly for an OTA publication.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must not contain surrounding whitespace.`);
  }
  return value;
}

/**
 * Validates the complete operator-supplied OTA request before any source is
 * exported, dependencies are installed, or network publication is attempted.
 */
export function validateOtaPublicationRequest(environment) {
  if (environment.NODE_OPTIONS || environment.NODE_PATH) {
    throw new Error('Unset NODE_OPTIONS and NODE_PATH for the OTA transaction.');
  }

  const channel = requireValue(environment, 'FRUME_UPDATE_CHANNEL');
  if (!UPDATE_CHANNELS.has(channel)) {
    throw new Error('FRUME_UPDATE_CHANNEL must be preview or production.');
  }

  const message = requireValue(environment, 'FRUME_UPDATE_MESSAGE');
  if (message.length > 1024) {
    throw new Error('FRUME_UPDATE_MESSAGE must be at most 1024 characters.');
  }

  const reviewedSha = requireValue(environment, 'FRUME_REVIEWED_RELEASE_SHA');
  if (!SHA_PATTERN.test(reviewedSha)) {
    throw new Error(
      'FRUME_REVIEWED_RELEASE_SHA must be the full 40-character approved commit SHA.',
    );
  }

  requireValue(environment, 'FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID');
  for (const name of REQUIRED_PUBLIC_VALUES) {
    requireValue(environment, name);
  }

  const unexpectedPublicValues = Object.keys(environment).filter(
    (name) => name.startsWith('EXPO_PUBLIC_') && !ALLOWED_PUBLIC_VALUES.has(name),
  );
  if (unexpectedPublicValues.length > 0) {
    throw new Error(
      `Unset unreviewed public OTA values: ${unexpectedPublicValues.sort().join(', ')}.`,
    );
  }

  if (environment.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim()) {
    throw new Error('Unset the Android RevenueCat key for an iOS OTA publication.');
  }

  const analyticsHost = environment.EXPO_PUBLIC_ANALYTICS_HOST?.trim();
  const analyticsKey = environment.EXPO_PUBLIC_ANALYTICS_API_KEY?.trim();
  if (Boolean(analyticsHost) !== Boolean(analyticsKey)) {
    throw new Error(
      'EXPO_PUBLIC_ANALYTICS_HOST and EXPO_PUBLIC_ANALYTICS_API_KEY must both be set or both be unset.',
    );
  }
  if (analyticsHost && analyticsKey) {
    requireValue(environment, 'EXPO_PUBLIC_ANALYTICS_HOST');
    requireValue(environment, 'EXPO_PUBLIC_ANALYTICS_API_KEY');
    resolveAnalyticsSettings(environment);
  }

  return {
    channel,
    message,
    reviewedSha,
    analyticsEnabled: Boolean(analyticsHost && analyticsKey),
  };
}

/** Returns the pinned EAS CLI arguments that publish only a prebuilt export. */
export function buildEasUpdateArguments({
  channel,
  message,
  inputDirectory,
}) {
  return [
    '--yes',
    'eas-cli@23.0.0',
    'update',
    '--channel',
    channel,
    '--platform',
    'ios',
    '--message',
    message,
    '--input-dir',
    inputDirectory,
    '--skip-bundler',
    '--non-interactive',
  ];
}

/** Finds the single iOS Hermes payload produced by `expo export`. */
export function locateIosHermesBundle(exportDirectory) {
  const bundleDirectory = join(
    exportDirectory,
    '_expo',
    'static',
    'js',
    'ios',
  );
  let bundles = [];
  try {
    bundles = readdirSync(bundleDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.hbc'))
      .map((entry) => join(bundleDirectory, entry.name));
  } catch {
    // The count check below owns the fail-closed error for a missing directory.
  }
  if (bundles.length !== 1) {
    throw new Error('The OTA export must contain exactly one iOS Hermes bundle.');
  }
  return bundles[0];
}

/** Runs one guarded transaction stage and turns every abnormal exit into failure. */
function runCommand(command, args, { cwd, environment, label }) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.signal || result.status !== 0) {
    const reason = result.error
      ? result.error.message
      : result.signal
        ? `signal ${result.signal}`
        : `exit ${String(result.status)}`;
    throw new Error(`${label} failed (${reason}).`);
  }
}

/** Builds, scans, and publishes from an independently verified canonical tree. */
function runReviewedStage(request, sourceDirectory, expectedManifest) {
  const repositoryDirectory = realpathSync(
    dirname(dirname(fileURLToPath(import.meta.url))),
  );
  const reviewedSource = realpathSync(sourceDirectory);
  if (
    repositoryDirectory !== reviewedSource ||
    existsSync(join(reviewedSource, '.git')) ||
    !MANIFEST_PATTERN.test(expectedManifest)
  ) {
    throw new Error('Reviewed OTA source stage is invalid.');
  }

  const sourceManifest = releaseSourceManifestDigest(reviewedSource);
  const canonicalManifest = canonicalReleaseManifest({
    reviewedSha: request.reviewedSha,
  });
  if (
    sourceManifest !== expectedManifest ||
    canonicalManifest.reviewedSha !== request.reviewedSha ||
    canonicalManifest.manifestDigest !== expectedManifest
  ) {
    throw new Error('Reviewed OTA source does not match canonical main.');
  }

  const environment = {
    ...process.env,
    EXPO_NO_DOTENV: '1',
    FRUME_UPDATE_CHANNEL: request.channel,
  };
  delete environment.FRUME_OTA_REVIEWED_STAGE;
  delete environment.FRUME_OTA_REVIEWED_SOURCE;
  delete environment.FRUME_OTA_REVIEWED_MANIFEST;

  const node = process.execPath;
  const scriptsDirectory = join(reviewedSource, 'scripts');
  runCommand(node, [join(scriptsDirectory, 'validate-production-photo-api-url.mjs')], {
    cwd: reviewedSource,
    environment,
    label: 'Photo API configuration validation',
  });
  runCommand(node, [join(scriptsDirectory, 'validate-ota-config.mjs')], {
    cwd: reviewedSource,
    environment,
    label: 'OTA configuration validation',
  });
  runCommand(node, [join(scriptsDirectory, 'validate-revenuecat-ios-release.mjs')], {
    cwd: reviewedSource,
    environment,
    label: 'RevenueCat configuration validation',
  });
  runCommand(node, [join(scriptsDirectory, 'validate-public-release-pages.mjs')], {
    cwd: reviewedSource,
    environment,
    label: 'Public release-page configuration validation',
  });

  runCommand('npm', ['ci', '--ignore-scripts=false'], {
    cwd: reviewedSource,
    environment,
    label: 'Root clean dependency install',
  });
  runCommand('npm', ['--prefix', 'server', 'ci', '--ignore-scripts=false'], {
    cwd: reviewedSource,
    environment,
    label: 'Worker clean dependency install',
  });
  runCommand('npm', ['run', 'check'], {
    cwd: reviewedSource,
    environment,
    label: 'Complete release check',
  });
  runCommand('npm', ['run', 'security:dependencies'], {
    cwd: reviewedSource,
    environment,
    label: 'Dependency risk validation',
  });

  runCommand(node, [join(scriptsDirectory, 'validate-production-photo-api-health.mjs')], {
    cwd: reviewedSource,
    environment,
    label: 'Live photo API validation',
  });
  runCommand(node, [join(scriptsDirectory, 'validate-public-release-pages.mjs')], {
    cwd: reviewedSource,
    environment: { ...environment, FRUME_VERIFY_PUBLIC_RELEASE_PAGES: '1' },
    label: 'Live public release-page validation',
  });
  if (request.analyticsEnabled) {
    runCommand(node, [join(scriptsDirectory, 'verify-analytics-transport.mjs')], {
      cwd: reviewedSource,
      environment: { ...environment, FRUME_VERIFY_ANALYTICS: '1' },
      label: 'Analytics transport validation',
    });
  }

  const exportDirectory = mkdtempSync(join(tmpdir(), 'frume-reviewed-ota.'));
  try {
    runCommand(
      'npx',
      [
        'expo',
        'export',
        '--platform',
        'ios',
        '--output-dir',
        exportDirectory,
        '--clear',
      ],
      {
        cwd: reviewedSource,
        environment,
        label: 'Reviewed iOS OTA export',
      },
    );
    if (!existsSync(join(exportDirectory, 'metadata.json'))) {
      throw new Error('The OTA export did not produce metadata.json.');
    }
    const bundlePath = locateIosHermesBundle(exportDirectory);
    runCommand(
      node,
      [
        join(scriptsDirectory, 'validate-revenuecat-ios-release.mjs'),
        '--bundle',
        bundlePath,
      ],
      {
        cwd: reviewedSource,
        environment,
        label: 'OTA Hermes bundle validation',
      },
    );
    runCommand(
      'npx',
      buildEasUpdateArguments({
        channel: request.channel,
        message: request.message,
        inputDirectory: exportDirectory,
      }),
      {
        cwd: reviewedSource,
        environment,
        label: 'EAS Update publication',
      },
    );
  } finally {
    rmSync(exportDirectory, { recursive: true, force: true });
  }
}

/** Owns the canonical export and transfers control to its reviewed publisher. */
function main() {
  process.env.EXPO_NO_DOTENV = '1';
  const request = validateOtaPublicationRequest(process.env);
  if (process.env.FRUME_OTA_REVIEWED_STAGE === '1') {
    runReviewedStage(
      request,
      process.env.FRUME_OTA_REVIEWED_SOURCE ?? '',
      process.env.FRUME_OTA_REVIEWED_MANIFEST ?? '',
    );
    return;
  }

  const repositoryDirectory = realpathSync(
    dirname(dirname(fileURLToPath(import.meta.url))),
  );
  validateReleaseRevisionFromGit({
    repoDirectory: repositoryDirectory,
    reviewedSha: request.reviewedSha,
  });

  const reviewedSource = mkdtempSync(join(tmpdir(), 'frume-reviewed-ota-source.'));
  try {
    const exported = exportReviewedReleaseSource({
      reviewedSha: request.reviewedSha,
      destination: reviewedSource,
    });
    runCommand(
      process.execPath,
      [join(exported.destination, 'scripts', 'publish-ota-update.mjs')],
      {
        cwd: exported.destination,
        environment: {
          ...process.env,
          EXPO_NO_DOTENV: '1',
          FRUME_OTA_REVIEWED_STAGE: '1',
          FRUME_OTA_REVIEWED_SOURCE: exported.destination,
          FRUME_OTA_REVIEWED_MANIFEST: exported.manifestDigest,
        },
        label: 'Reviewed OTA publication transaction',
      },
    );
  } finally {
    rmSync(reviewedSource, { recursive: true, force: true });
  }
}

if (isDirectCli(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
