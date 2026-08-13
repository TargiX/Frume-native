#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDirectCli } from './is-direct-cli.mjs';

const IOS_PUBLIC_KEY_PATTERN = /^appl_[A-Za-z0-9]{8,128}$/;
const IOS_PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/;
export const PREMIUM_CUTS_ENTITLEMENT_ID = 'premium_cut_styles';
const EMBEDDED_CREDENTIAL_PATTERN =
  /^(?:appl|mac|goog|amzn|strp|test|sk|atk)_[A-Za-z0-9]{8,128}$/;
const STRING_TABLE_ENTRY_PATTERN =
  /^[is]\d+\[(?:ASCII|UTF-16),[^\]]+\](?: #[A-Fa-f0-9]+)?: (.*)$/;

export function validateIosRevenueCatKey(configuredValue) {
  if (!configuredValue) {
    throw new Error(
      'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY must be set for an iOS release.',
    );
  }

  if (configuredValue !== configuredValue.trim()) {
    throw new Error(
      'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY must not contain surrounding whitespace.',
    );
  }

  if (!IOS_PUBLIC_KEY_PATTERN.test(configuredValue)) {
    throw new Error(
      'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY must be an iOS production public key with the appl_ prefix; test and other-platform keys are rejected.',
    );
  }

  return configuredValue;
}

export function validateIosPremiumProductId(configuredValue) {
  if (!configuredValue) {
    throw new Error(
      'EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID must be set for an iOS release.',
    );
  }

  if (configuredValue !== configuredValue.trim()) {
    throw new Error(
      'EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID must not contain surrounding whitespace.',
    );
  }

  if (!IOS_PRODUCT_ID_PATTERN.test(configuredValue)) {
    throw new Error(
      'EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID must be a valid reviewed App Store product identifier.',
    );
  }

  return configuredValue;
}

function requireOneLogicalString(bundleStrings, expectedValue, label) {
  const occurrences = bundleStrings.filter(
    (value) => value === expectedValue,
  ).length;
  if (occurrences !== 1) {
    throw new Error(
      occurrences === 0
        ? `The archived JavaScript bundle does not contain the reviewed ${label}.`
        : `The archived JavaScript bundle contains the reviewed ${label} more than once.`,
    );
  }
}

export function validateRevenueCatBundle(
  bundleStrings,
  expectedIosKey,
  expectedProductId,
) {
  validateIosRevenueCatKey(expectedIosKey);
  validateIosPremiumProductId(expectedProductId);

  if (!Array.isArray(bundleStrings)) {
    throw new Error(
      'RevenueCat bundle validation requires parsed Hermes logical strings.',
    );
  }

  requireOneLogicalString(
    bundleStrings,
    expectedIosKey,
    'iOS RevenueCat key',
  );
  requireOneLogicalString(
    bundleStrings,
    expectedProductId,
    'iOS Premium Cuts product ID',
  );
  requireOneLogicalString(
    bundleStrings,
    PREMIUM_CUTS_ENTITLEMENT_ID,
    'Premium Cuts entitlement ID',
  );

  for (const bundleString of bundleStrings) {
    if (
      bundleString !== expectedIosKey &&
      EMBEDDED_CREDENTIAL_PATTERN.test(bundleString)
    ) {
      throw new Error(
        'The archived JavaScript bundle contains an unreviewed RevenueCat test, other-platform, secret, or stale public key.',
      );
    }
  }
}

function defaultHermescPath() {
  const repoDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
  const binaryDirectory =
    process.platform === 'darwin'
      ? 'osx-bin'
      : process.platform === 'linux'
        ? 'linux64-bin'
        : process.platform === 'win32'
          ? 'win64-bin'
          : undefined;
  if (!binaryDirectory) {
    throw new Error(
      `Hermes bytecode inspection is not supported on ${process.platform}.`,
    );
  }

  return join(
    repoDirectory,
    'node_modules',
    'react-native',
    'sdks',
    'hermesc',
    binaryDirectory,
    process.platform === 'win32' ? 'hermesc.exe' : 'hermesc',
  );
}

function parseHermesStringTable(disassembly) {
  const strings = [];
  let sawTable = false;
  let sawEnd = false;

  for (const line of disassembly.split(/\r?\n/u)) {
    if (!sawTable) {
      if (line === 'Global String Table:') {
        sawTable = true;
      }
      continue;
    }

    if (line === 'Array Buffer:') {
      sawEnd = true;
      break;
    }

    const match = line.match(STRING_TABLE_ENTRY_PATTERN);
    if (match) {
      strings.push(match[1]);
    }
  }

  if (!sawTable || !sawEnd || strings.length === 0) {
    throw new Error(
      'The archived JavaScript bundle could not be inspected as Hermes bytecode.',
    );
  }

  return strings;
}

export function validateRevenueCatBundleFile(
  bundlePath,
  expectedIosKey,
  expectedProductId,
  { hermescPath = defaultHermescPath() } = {},
) {
  validateIosRevenueCatKey(expectedIosKey);
  validateIosPremiumProductId(expectedProductId);

  try {
    accessSync(bundlePath, constants.R_OK);
    accessSync(hermescPath, constants.X_OK);
  } catch {
    throw new Error(
      'The archived main.jsbundle or vendored Hermes inspector is missing or unreadable; RevenueCat configuration was not verified.',
    );
  }

  const result = spawnSync(
    hermescPath,
    ['-b', '-dump-bytecode', bundlePath],
    {
      encoding: 'utf8',
      // Hermes currently emits the whole disassembly even though validation
      // needs only its logical string table. Keep a bounded ceiling and fail
      // closed if a future bundle exceeds it.
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error(
      'Hermes bytecode inspection failed; RevenueCat configuration was not verified.',
    );
  }

  validateRevenueCatBundle(
    parseHermesStringTable(result.stdout),
    expectedIosKey,
    expectedProductId,
  );
}

async function run() {
  const expectedIosKey = validateIosRevenueCatKey(
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  );
  const expectedProductId = validateIosPremiumProductId(
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID,
  );
  const bundleFlagIndex = process.argv.indexOf('--bundle');

  if (bundleFlagIndex === -1) {
    console.log('RevenueCat iOS release identifiers verified.');
    return;
  }

  const bundlePath = process.argv[bundleFlagIndex + 1];
  if (!bundlePath) {
    throw new Error('--bundle requires the path to the archived main.jsbundle.');
  }

  validateRevenueCatBundleFile(
    bundlePath,
    expectedIosKey,
    expectedProductId,
  );
  console.log('Archived RevenueCat iOS configuration verified.');
}

if (isDirectCli(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
